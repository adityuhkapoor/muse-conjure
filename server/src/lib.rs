//! Sequencer: puts every action from every client into one ordered, durable log per room.
//! See docs/CONTRACTS.md section 1.

#![forbid(unsafe_code)]

pub mod codec;
pub mod room_core;
pub mod hub;
pub mod room;
pub mod store;

use axum::Router;
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use axum::routing::get;
use futures_util::{SinkExt, StreamExt};
use hub::Hub;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use store::Store;

#[derive(Clone, Debug)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub db: PathBuf,
    /// How long a room with no subscribers and nothing in flight stays in memory.
    pub idle: Duration,
    /// Test hook: delay every commit by this long.
    pub commit_delay: Option<Duration>,
}

impl Default for Config {
    fn default() -> Config {
        Config {
            host: "127.0.0.1".into(),
            port: 8787,
            db: PathBuf::from("sync.sqlite"),
            idle: hub::DEFAULT_IDLE,
            commit_delay: None,
        }
    }
}

impl Config {
    /// `HOST` (default 127.0.0.1), `PORT` (default 8787, 0 picks a free port), `DB` (default
    /// sync.sqlite in the working directory), `IDLE_MS` (default 30000).
    pub fn from_env() -> Config {
        let d = Config::default();
        let var = |k: &str| std::env::var(k).ok();
        Config {
            host: var("HOST").unwrap_or(d.host),
            port: var("PORT").and_then(|p| p.parse().ok()).unwrap_or(d.port),
            db: var("DB").map(PathBuf::from).unwrap_or(d.db),
            idle: var("IDLE_MS").and_then(|p| p.parse().ok()).map(Duration::from_millis).unwrap_or(d.idle),
            commit_delay: None,
        }
    }
}

pub struct Server {
    pub addr: SocketAddr,
    pub hub: Arc<Hub>,
    pub task: tokio::task::JoinHandle<()>,
}

pub fn router(hub: Arc<Hub>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/ws", get(ws))
        .route("/", get(ws))
        .with_state(hub)
}

async fn health(State(hub): State<Arc<Hub>>) -> impl IntoResponse {
    axum::Json(serde_json::json!({ "ok": true, "rooms": hub.room_count() }))
}

async fn ws(State(hub): State<Arc<Hub>>, up: WebSocketUpgrade) -> impl IntoResponse {
    up.max_message_size(codec::MAX_FRAME).on_upgrade(move |socket| connection(hub, socket))
}

async fn connection(hub: Arc<Hub>, socket: WebSocket) {
    let (mut session, mut out, kick) = hub.connect();
    let (mut sink, mut stream) = socket.split();
    loop {
        tokio::select! {
            m = stream.next() => match m {
                Some(Ok(Message::Text(t))) => session.handle_text(t.as_str()),
                Some(Ok(Message::Binary(_))) => session.handle_text("binary frames are not supported"),
                Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                Some(Ok(_)) => {}
            },
            f = out.recv() => {
                let Some(f) = f else { break };
                // Write everything already queued, then flush once.
                let mut ok = sink.feed(Message::Text(f.as_ref().into())).await.is_ok();
                while ok {
                    match out.try_recv() {
                        Ok(f) => ok = sink.feed(Message::Text(f.as_ref().into())).await.is_ok(),
                        Err(_) => break,
                    }
                }
                if !ok || sink.flush().await.is_err() {
                    break;
                }
            }
            _ = kick.notified() => break,
        }
    }
    let _ = sink.close().await;
}

/// Bind with SO_REUSEADDR so a restart can take the same port right after a kill.
async fn listen(host: &str, port: u16) -> std::io::Result<tokio::net::TcpListener> {
    let mut last = None;
    for addr in tokio::net::lookup_host((host, port)).await? {
        let socket = if addr.is_ipv4() { tokio::net::TcpSocket::new_v4()? } else { tokio::net::TcpSocket::new_v6()? };
        socket.set_reuseaddr(true)?;
        match socket.bind(addr).and_then(|()| socket.listen(1024)) {
            Ok(l) => return Ok(l),
            Err(e) => last = Some(e),
        }
    }
    Err(last.unwrap_or_else(|| std::io::Error::other(format!("no address for {host}"))))
}

pub async fn start(cfg: Config) -> std::io::Result<Server> {
    let store = Store::open(&cfg.db, cfg.commit_delay).map_err(std::io::Error::other)?;
    let hub = Hub::with_idle(store, cfg.idle);
    let listener = listen(&cfg.host, cfg.port).await?;
    let addr = listener.local_addr()?;
    let app = router(hub.clone());
    let task = tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("server stopped: {e}");
        }
    });
    Ok(Server { addr, hub, task })
}
