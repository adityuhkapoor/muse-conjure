//! Contract version 2: epoch, many rooms per socket, idle unload and reload, recovery after a
//! failed write, restart of the binary.

mod common;

use common::*;
use futures_util::{SinkExt, StreamExt};
use sequencer::codec::{C2S, Entry, S2C, decode_s2c, encode_c2s, raw};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::AsyncBufReadExt;
use tokio_tungstenite::tungstenite::Message;

const R: &str = "t:1";

type Ws = tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

async fn ws_connect(addr: &str) -> Ws {
    tokio_tungstenite::connect_async(format!("ws://{addr}/ws")).await.unwrap().0
}

async fn ws_send(ws: &mut Ws, m: C2S) {
    ws.send(Message::Text(encode_c2s(&m).as_ref().into())).await.unwrap();
}

async fn ws_hello(ws: &mut Ws, room: &str, client: &str, have: u64) {
    ws_send(ws, C2S::Hello { room: room.into(), client: client.into(), user: format!("u-{client}"), have }).await;
}

async fn ws_act(ws: &mut Ws, room: &str, cseq: u64, json: &str) {
    ws_send(ws, C2S::Act { room: room.into(), cseq, action: raw(json) }).await;
}

async fn ws_recv(ws: &mut Ws) -> S2C {
    loop {
        let m = tokio::time::timeout(Duration::from_secs(10), ws.next()).await.expect("timed out").expect("closed").unwrap();
        if let Message::Text(t) = m {
            return decode_s2c(t.as_str()).unwrap();
        }
    }
}

/// The next frame that is not an eph replay.
async fn ws_recv_log(ws: &mut Ws) -> S2C {
    loop {
        match ws_recv(ws).await {
            S2C::Eph { .. } => {}
            m => return m,
        }
    }
}

/// Nothing arrives within a short wait.
async fn ws_quiet(ws: &mut Ws) {
    if let Ok(Some(Ok(Message::Text(t)))) = tokio::time::timeout(Duration::from_millis(150), ws.next()).await {
        panic!("unexpected frame {t}");
    }
}

#[tokio::test]
async fn epoch_is_kept_with_the_database_and_new_for_a_new_one() {
    let a = temp_db();
    let (e1, first) = {
        let hub = hub(&a.path, None);
        let mut c = Client::new(&hub);
        c.hello(R, "ca", "u1", 0);
        let (e1, head, _) = c.welcome_epoch().await;
        assert_eq!(head, 0);
        assert_eq!(e1.len(), 32);
        for i in 1..=3 {
            c.act(R, i, &i.to_string());
        }
        let mut got = vec![];
        for _ in 0..3 {
            got.push(c.entry().await);
        }
        (e1, got)
    };

    // Same file: same epoch, same log.
    let hub_a = hub(&a.path, None);
    let mut c = Client::new(&hub_a);
    c.hello(R, "cb", "u1", 0);
    assert_eq!(c.welcome_epoch().await, (e1.clone(), 3, first.clone()));
    // An impossible `have` gets everything from seq 1.
    c.hello(R, "cb", "u1", 50);
    assert_eq!(c.welcome_epoch().await, (e1.clone(), 3, first.clone()));

    // Fresh file: new epoch, head 0, and a stale `have` gets the (empty) log from 1.
    let b = temp_db();
    let hub_b = hub(&b.path, None);
    let mut c = Client::new(&hub_b);
    c.hello(R, "cc", "u1", 3);
    let (e2, head, entries) = c.welcome_epoch().await;
    assert_ne!(e2, e1);
    assert_eq!((head, entries), (0, vec![]));
}

#[tokio::test]
async fn binary_restarts_on_the_same_port_and_database() {
    let db = temp_db();
    async fn spawn(port: u16, db: &std::path::Path) -> (tokio::process::Child, String) {
        let mut child = tokio::process::Command::new(env!("CARGO_BIN_EXE_server"))
            .env("PORT", port.to_string())
            .env("DB", db)
            .env("HOST", "127.0.0.1")
            .stdout(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .unwrap();
        let mut lines = tokio::io::BufReader::new(child.stdout.take().unwrap()).lines();
        let line = tokio::time::timeout(Duration::from_secs(20), lines.next_line()).await.unwrap().unwrap().unwrap();
        assert!(line.starts_with("listening on ") && line.ends_with(&format!(" db {}", db.display())), "{line}");
        let addr = line["listening on ".len()..].split(' ').next().unwrap().to_owned();
        (child, addr)
    }

    let (mut child, addr) = spawn(0, &db.path).await;
    let mut ws = ws_connect(&addr).await;
    ws_hello(&mut ws, R, "c1", 0).await;
    let S2C::Welcome { epoch: e1, .. } = ws_recv(&mut ws).await else { panic!() };
    ws_act(&mut ws, R, 1, r#""kept""#).await;
    let S2C::Entry { entry, .. } = ws_recv(&mut ws).await else { panic!() };
    child.kill().await.unwrap();

    let port: u16 = addr.rsplit(':').next().unwrap().parse().unwrap();
    let (_child, addr2) = spawn(port, &db.path).await;
    assert_eq!(addr2, addr);
    let mut ws = ws_connect(&addr2).await;
    ws_hello(&mut ws, R, "c2", 0).await;
    match ws_recv(&mut ws).await {
        S2C::Welcome { epoch, head, entries, .. } => {
            assert_eq!((epoch, head), (e1, 1));
            assert_eq!(*entries[0], *entry);
        }
        other => panic!("{other:?}"),
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn one_socket_carries_many_rooms() {
    let db = temp_db();
    let server =
        sequencer::start(sequencer::Config { port: 0, db: db.path.clone(), idle: Duration::from_millis(5), ..Default::default() })
            .await
            .unwrap();
    let addr = server.addr.to_string();
    let rooms: Vec<String> = (0..4).map(|i| format!("a:{i}")).collect();
    let per = 50u64;

    let mut a = ws_connect(&addr).await;
    let mut b = ws_connect(&addr).await;
    for r in &rooms {
        ws_hello(&mut a, r, "a", 0).await;
        ws_hello(&mut b, r, "b", 0).await;
    }
    for ws in [&mut a, &mut b] {
        let mut welcomed = HashSet::new();
        for _ in &rooms {
            match ws_recv(ws).await {
                S2C::Welcome { room, head: 0, .. } => assert!(welcomed.insert(room)),
                other => panic!("{other:?}"),
            }
        }
    }

    // Interleaved acts from b across every room, plus eph from a in every room.
    for i in 1..=per {
        for r in &rooms {
            ws_act(&mut b, r, i, &format!(r#"{{"room":"{r}","i":{i}}}"#)).await;
        }
    }
    for r in &rooms {
        ws_send(&mut a, C2S::Eph { room: r.clone(), key: "typing".into(), value: raw(&format!(r#""{r}""#)) }).await;
    }

    for (name, ws, want_eph) in [("a", &mut a, false), ("b", &mut b, true)] {
        let mut logs: HashMap<String, Vec<Arc<Entry>>> = HashMap::new();
        let mut ephs = HashSet::new();
        let total = per as usize * rooms.len();
        while logs.values().map(|l| l.len()).sum::<usize>() < total || (want_eph && ephs.len() < rooms.len()) {
            match ws_recv(ws).await {
                S2C::Entry { room, entry } => {
                    // No leakage: the action names the room it was sent to.
                    assert!(entry.action.get().contains(&format!(r#""room":"{room}""#)), "{name}: {room} got {}", entry.action.get());
                    let log = logs.entry(room.clone()).or_default();
                    assert_eq!(entry.seq, log.len() as u64 + 1, "{name}: gap or reorder in {room}");
                    assert_eq!(entry.cseq, entry.seq);
                    log.push(entry);
                }
                S2C::Eph { room, value, .. } => {
                    assert!(want_eph, "{name} got its own eph");
                    assert_eq!(value.get(), format!(r#""{room}""#));
                    assert!(ephs.insert(room));
                }
                other => panic!("{name}: {other:?}"),
            }
        }
        for r in &rooms {
            let disk: Vec<Entry> = rows(&db.path, r);
            assert_eq!(logs[r].iter().map(|e| (**e).clone()).collect::<Vec<_>>(), disk);
        }
    }
    ws_quiet(&mut a).await;

    // A second hello for a room on the same socket replaces the first: new client id, caught up.
    ws_hello(&mut a, &rooms[0], "a2", per).await;
    assert!(matches!(ws_recv_log(&mut a).await, S2C::Welcome { head, entries, .. } if head == per && entries.is_empty()));
    // A re-hello after the client reset its state gets the full log once.
    ws_hello(&mut a, &rooms[1], "a3", 0).await;
    match ws_recv_log(&mut a).await {
        S2C::Welcome { room, head, entries, .. } => {
            assert_eq!((room.as_str(), head), (rooms[1].as_str(), per));
            assert_eq!(entries.iter().map(|e| e.seq).collect::<Vec<_>>(), (1..=per).collect::<Vec<_>>());
        }
        other => panic!("{other:?}"),
    }
    ws_act(&mut b, &rooms[0], per + 1, &format!(r#"{{"room":"{}"}}"#, rooms[0])).await;
    ws_act(&mut b, &rooms[1], per + 1, &format!(r#"{{"room":"{}"}}"#, rooms[1])).await;
    let mut seen = HashSet::new();
    for _ in 0..2 {
        match ws_recv_log(&mut a).await {
            S2C::Entry { room, entry } => {
                assert_eq!(entry.seq, per + 1);
                assert!(seen.insert(room));
            }
            other => panic!("{other:?}"),
        }
    }
    // Eph replays from the re-hellos aside, nothing else arrives.
    while let Ok(Some(Ok(Message::Text(t)))) = tokio::time::timeout(Duration::from_millis(150), a.next()).await {
        assert!(matches!(decode_s2c(t.as_str()).unwrap(), S2C::Eph { .. }), "unexpected frame {t}");
    }
    // Acts under the new client id are stamped with it.
    ws_act(&mut a, &rooms[0], 1, &format!(r#"{{"room":"{}"}}"#, rooms[0])).await;
    assert!(matches!(ws_recv_log(&mut a).await, S2C::Entry { entry, .. } if entry.client == "a2" && entry.seq == per + 2));

    // Closing the sockets leaves every room, so they all unload.
    assert_eq!(server.hub.room_count(), rooms.len());
    a.close(None).await.unwrap();
    b.close(None).await.unwrap();
    until_unloaded(&server.hub).await;
    server.task.abort();
}

#[tokio::test]
async fn idle_room_unloads_and_reloads_from_sqlite() {
    let db = temp_db();
    let hub = hub_idle(&db.path, None, Duration::from_millis(5));
    let n = sequencer::room::TAIL as u64 + 50;
    let mut a = Client::new(&hub);
    a.hello(R, "ca", "u1", 0);
    a.welcome().await;
    for i in 1..=n {
        a.act(R, i, &i.to_string());
    }
    let mut got = vec![];
    for _ in 0..n {
        got.push(a.entry().await);
    }
    // Subscribed rooms stay loaded.
    tokio::time::sleep(Duration::from_millis(30)).await;
    assert_eq!(hub.room_count(), 1);
    drop(a);
    until_unloaded(&hub).await;
    let loads = hub.loads();

    // Catch-up reaches past the in-memory tail; dedupe survives the reload.
    let mut b = Client::new(&hub);
    b.hello(R, "ca", "u1", 0);
    assert_eq!(b.welcome().await, (n, got.clone()));
    b.hello(R, "ca", "u1", 10);
    assert_eq!(b.welcome().await, (n, got[10..].to_vec()));
    b.act(R, 1, r#""resend""#);
    b.act(R, n + 1, r#""new""#);
    assert_eq!(b.entry().await, got[0]);
    let e = b.entry().await;
    assert_eq!((e.seq, e.cseq), (n + 1, n + 1));
    assert_eq!(hub.loads(), loads + 1);
    assert_log(&rows(&db.path, R));
    drop(b);
    until_unloaded(&hub).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn hello_racing_an_unload_is_not_lost() {
    let db = temp_db();
    let hub = hub_idle(&db.path, None, Duration::from_millis(1));
    // The room decides to unload, then waits before asking the hub; a hello and an act arrive
    // in that gap.
    hub.pause_before_unload(Duration::from_millis(60));
    let mut a = Client::new(&hub);
    a.hello(R, "ca", "u1", 0);
    a.welcome().await;
    a.act(R, 1, "1");
    let e1 = a.entry().await;
    drop(a);
    tokio::time::sleep(Duration::from_millis(20)).await;
    let mut b = Client::new(&hub);
    b.hello(R, "cb", "u2", 0);
    b.act(R, 1, "2");
    assert_eq!(b.welcome().await, (1, vec![e1]));
    assert_eq!(b.entry().await.seq, 2);
    assert_eq!(hub.loads(), 1, "the same actor should serve the racing hello");
    drop(b);
    hub.pause_before_unload(Duration::ZERO);
    until_unloaded(&hub).await;
    assert_log(&rows(&db.path, R));
}

/// A client that keeps its log and pending queue across connections.
struct Joiner {
    id: String,
    rng: Rng,
    cseq: u64,
    pending: BTreeMap<u64, String>,
    sent: Vec<(u64, String)>,
    log: Vec<Arc<Entry>>,
}

impl Joiner {
    fn take(&mut self, e: Arc<Entry>) {
        let next = self.log.len() as u64 + 1;
        if e.seq < next {
            assert_eq!(self.log[(e.seq - 1) as usize], e);
            return;
        }
        assert_eq!(e.seq, next, "{}: gap", self.id);
        if e.client == self.id {
            self.pending.remove(&e.cseq);
        }
        self.log.push(e);
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn unload_and_reload_under_concurrent_joins() {
    let db = temp_db();
    let hub = hub_idle(&db.path, None, Duration::from_millis(1));
    let mut tasks = vec![];
    for k in 0..8u64 {
        let hub = hub.clone();
        tasks.push(tokio::spawn(async move {
            let mut j = Joiner { id: format!("c{k}"), rng: Rng(k), cseq: 0, pending: BTreeMap::new(), sent: vec![], log: vec![] };
            for _ in 0..40 {
                let mut c = Client::new(&hub);
                c.hello(R, &j.id, "u", j.log.len() as u64);
                for (cseq, a) in &j.pending {
                    c.act(R, *cseq, a);
                }
                for _ in 0..1 + j.rng.below(3) {
                    j.cseq += 1;
                    let a = format!(r#"{{"by":"{}","n":{}}}"#, j.id, j.cseq);
                    j.pending.insert(j.cseq, a.clone());
                    j.sent.push((j.cseq, a.clone()));
                    c.act(R, j.cseq, &a);
                }
                if j.rng.chance(30) {
                    let (cseq, a) = j.sent[j.rng.below(j.sent.len() as u64) as usize].clone();
                    c.act(R, cseq, &a);
                }
                // Sometimes leave before the acts are confirmed.
                if j.rng.chance(70) {
                    match c.recv().await {
                        S2C::Welcome { entries, .. } => entries.into_iter().for_each(|e| j.take(e)),
                        other => panic!("{other:?}"),
                    }
                    while !j.pending.is_empty() {
                        match c.recv().await {
                            S2C::Entry { entry, .. } => j.take(entry),
                            other => panic!("{other:?}"),
                        }
                    }
                }
                drop(c);
                // Mostly short gaps, sometimes long enough for everyone to be gone at once.
                let gap = if j.rng.chance(25) { 4000 + j.rng.below(6000) } else { j.rng.below(1500) };
                tokio::time::sleep(Duration::from_micros(gap)).await;
            }
            // Settle.
            let mut c = Client::new(&hub);
            c.hello(R, &j.id, "u", j.log.len() as u64);
            for (cseq, a) in &j.pending {
                c.act(R, *cseq, a);
            }
            match c.recv().await {
                S2C::Welcome { entries, .. } => entries.into_iter().for_each(|e| j.take(e)),
                other => panic!("{other:?}"),
            }
            while !j.pending.is_empty() {
                match c.recv().await {
                    S2C::Entry { entry, .. } => j.take(entry),
                    other => panic!("{other:?}"),
                }
            }
            j
        }));
    }
    let mut joiners = vec![];
    for t in tasks {
        joiners.push(t.await.unwrap());
    }
    until_unloaded(&hub).await;
    assert!(hub.loads() > 5, "the room should have unloaded and reloaded, loads {}", hub.loads());

    let log = rows(&db.path, R);
    assert_log(&log);
    let want: HashSet<(String, u64, String)> =
        joiners.iter().flat_map(|j| j.sent.iter().map(|(c, a)| (j.id.clone(), *c, a.clone()))).collect();
    let got: HashSet<(String, u64, String)> = log.iter().map(|e| (e.client.clone(), e.cseq, e.action.get().to_owned())).collect();
    assert_eq!(got.len(), log.len());
    assert_eq!(got, want);
    // Every client converges on a prefix of the final log.
    let mut obs = Client::new(&hub);
    obs.hello(R, "observer", "o", 0);
    let (head, entries) = obs.welcome().await;
    assert_eq!(head as usize, log.len());
    for j in &joiners {
        assert_eq!(&entries[..j.log.len()], &j.log[..], "{} diverged", j.id);
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn failed_write_recovers_without_restart() {
    let db = temp_db();
    let hub = hub(&db.path, Some(Duration::from_millis(20)));
    let mut a = Client::new(&hub);
    let mut b = Client::new(&hub);
    a.hello(R, "ca", "u1", 0);
    b.hello(R, "cb", "u2", 0);
    a.welcome().await;
    b.welcome().await;
    let mut seen = vec![];
    for i in 1..=2 {
        a.act(R, i, &i.to_string());
        seen.push(a.entry().await);
        assert_eq!(b.entry().await, seen[seen.len() - 1]);
    }

    // The next commit fails; everything in flight is dropped and both subscribers hear it.
    hub.store().fail_next_commits(1);
    for i in 3..=5 {
        a.act(R, i, &i.to_string());
    }
    for c in [&mut a, &mut b] {
        match c.recv().await {
            S2C::Error { room, code, .. } => assert_eq!((room.as_deref(), code.as_str()), (Some(R), "store_failed")),
            other => panic!("{other:?}"),
        }
    }
    tokio::time::sleep(Duration::from_millis(60)).await;
    assert!(a.drain().is_empty() && b.drain().is_empty());
    assert_eq!(rows(&db.path, R).len(), 2);

    // The client resends its pending actions; they are new now and land right after the head.
    for i in 3..=5 {
        a.act(R, i, &i.to_string());
    }
    for i in 3..=5 {
        let e = a.entry().await;
        assert_eq!((e.seq, e.cseq), (i, i));
        assert_eq!(b.entry().await, e);
        seen.push(e);
    }
    // Healthy again: the next act and a newcomer's catch-up both work.
    b.act(R, 1, r#""after""#);
    let e = a.entry().await;
    assert_eq!((e.seq, e.client.as_str()), (6, "cb"));
    seen.push(e);
    let mut c = Client::new(&hub);
    c.hello(R, "cc", "u3", 0);
    assert_eq!(c.welcome().await, (6, seen.clone()));
    let log = rows(&db.path, R);
    assert_log(&log);
    assert_eq!(log, seen.iter().map(|e| (**e).clone()).collect::<Vec<_>>());
}
