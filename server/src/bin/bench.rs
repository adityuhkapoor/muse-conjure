//! Load check: rooms x clients over real WebSockets against an in-process server (own runtime,
//! temp database). Every client sends acts at a fixed rate; every client measures the time from
//! an act being sent to its entry arriving (act-to-broadcast latency).
//!
//! cargo run --release --bin bench -- [rooms] [clients per room] [acts per second per client] [seconds]

#![forbid(unsafe_code)]

use futures_util::{SinkExt, StreamExt};
use sequencer::codec::{C2S, S2C, decode_s2c, encode_c2s, raw};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tokio_tungstenite::tungstenite::Message;

fn arg(i: usize, default: u64) -> u64 {
    std::env::args().nth(i).and_then(|s| s.parse().ok()).unwrap_or(default)
}

fn main() {
    let rooms = arg(1, 100);
    let per_room = arg(2, 5);
    let rate = arg(3, 20);
    let secs = arg(4, 10);

    let dir = std::env::temp_dir().join(format!("sequencer-bench-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("temp dir");
    let db = dir.join("bench.sqlite");
    let (addr_tx, addr_rx) = std::sync::mpsc::channel();
    let server_db = db.clone();
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_multi_thread().worker_threads(4).enable_all().build().expect("runtime");
        rt.block_on(async move {
            let s = sequencer::start(sequencer::Config { port: 0, db: server_db, ..Default::default() })
                .await
                .expect("server");
            addr_tx.send(s.addr).expect("send addr");
            let _ = s.task.await;
        });
    });
    let addr = addr_rx.recv().expect("server address");

    let rt = tokio::runtime::Builder::new_multi_thread().worker_threads(4).enable_all().build().expect("runtime");
    rt.block_on(async move {
        let start = Instant::now();
        let sent = Arc::new(AtomicU64::new(0));
        let received = Arc::new(AtomicU64::new(0));
        let mut tasks = vec![];
        let url = format!("ws://{addr}/ws");
        for r in 0..rooms {
            for k in 0..per_room {
                let url = url.clone();
                let sent = sent.clone();
                let received = received.clone();
                tasks.push(tokio::spawn(async move {
                    client(url, format!("a:{r}"), format!("r{r}c{k}"), per_room, rooms * per_room * rate * secs * per_room, rate, secs, start, sent, received).await
                }));
            }
        }
        let mut lat: Vec<u32> = vec![];
        let mut first_send = u64::MAX;
        let mut last_recv = 0;
        for t in tasks {
            let (l, f, e) = t.await.expect("client task");
            lat.extend(l);
            first_send = first_send.min(f);
            last_recv = last_recv.max(e);
        }
        // Throughput over the real window, first act sent to last entry received.
        let window = (last_recv.saturating_sub(first_send)) as f64 / 1e6;
        let sent = sent.load(Ordering::Relaxed);
        let received = received.load(Ordering::Relaxed);
        lat.sort_unstable();
        let pct = |p: f64| lat.get(((lat.len() as f64 - 1.0) * p) as usize).copied().unwrap_or(0) as f64 / 1000.0;
        println!("rooms {rooms}, clients per room {per_room}, {rate} acts/s per client, {secs} s measured");
        println!("measured window {window:.2} s");
        println!("acts sent {sent} ({:.0}/s)", sent as f64 / window);
        println!("entries delivered {received} ({:.0}/s)", received as f64 / window);
        println!(
            "act-to-broadcast latency ms: p50 {:.2}  p90 {:.2}  p99 {:.2}  max {:.2}  (n = {})",
            pct(0.5),
            pct(0.9),
            pct(0.99),
            pct(1.0),
            lat.len()
        );
    });
    let _ = std::fs::remove_dir_all(&dir);
}

#[allow(clippy::too_many_arguments)]
async fn client(
    url: String,
    room: String,
    id: String,
    per_room: u64,
    expected: u64,
    rate: u64,
    secs: u64,
    start: Instant,
    sent: Arc<AtomicU64>,
    received: Arc<AtomicU64>,
) -> (Vec<u32>, u64, u64) {
    let (ws, _) = tokio_tungstenite::connect_async(&url).await.expect("connect");
    let (mut tx, mut rx) = ws.split();
    let hello = C2S::Hello { room: room.clone(), client: id.clone(), user: id.clone(), have: 0 };
    tx.send(Message::Text(encode_c2s(&hello).as_ref().into())).await.expect("hello");
    // Warm-up: let every client connect before measuring.
    tokio::time::sleep(Duration::from_millis(500)).await;
    let t0 = Instant::now();
    let first_send = start.elapsed().as_micros() as u64;
    let mut last_recv = first_send;
    let end = t0 + Duration::from_secs(secs);
    let total = rate * secs;
    let sent_w = sent.clone();
    let writer = tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_micros(1_000_000 / rate.max(1)));
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        for cseq in 1..=total {
            tick.tick().await;
            let us = start.elapsed().as_micros() as u64;
            let act = C2S::Act { room: room.clone(), cseq, action: raw(&format!("{{\"us\":{us}}}")) };
            if tx.send(Message::Text(encode_c2s(&act).as_ref().into())).await.is_err() {
                break;
            }
            sent_w.fetch_add(1, Ordering::Relaxed);
        }
        tx
    });
    let mut lat = Vec::with_capacity((total * per_room) as usize);
    let drain_until = end + Duration::from_secs(2);
    loop {
        let m = match tokio::time::timeout_at(drain_until.into(), rx.next()).await {
            Ok(Some(Ok(Message::Text(t)))) => t,
            Ok(Some(Ok(_))) => continue,
            _ => break,
        };
        if let Ok(S2C::Entry { entry, .. }) = decode_s2c(m.as_str()) {
            let now = start.elapsed().as_micros() as u64;
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(entry.action.get())
                && let Some(us) = v.get("us").and_then(|x| x.as_u64())
            {
                lat.push(now.saturating_sub(us) as u32);
                last_recv = now;
                received.fetch_add(1, Ordering::Relaxed);
            }
        }
        if received.load(Ordering::Relaxed) >= expected {
            break;
        }
    }
    let _ = writer.await;
    (lat, first_send, last_recv)
}
