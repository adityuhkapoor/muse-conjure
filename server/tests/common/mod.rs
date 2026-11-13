#![allow(dead_code)]

use sequencer::codec::{C2S, Entry, Frame, S2C, decode_s2c, raw};
use sequencer::hub::{Hub, Session};
use sequencer::store::{self, Store};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Notify, mpsc};

pub struct Db {
    pub dir: tempfile::TempDir,
    pub path: PathBuf,
}

pub fn temp_db() -> Db {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("log.sqlite");
    Db { dir, path }
}

pub fn hub(path: &Path, delay: Option<Duration>) -> Arc<Hub> {
    Hub::new(Store::open(path, delay).unwrap())
}

/// A hub whose idle rooms unload after `idle`.
pub fn hub_idle(path: &Path, delay: Option<Duration>, idle: Duration) -> Arc<Hub> {
    Hub::with_idle(Store::open(path, delay).unwrap(), idle)
}

/// Wait until no room is in memory.
pub async fn until_unloaded(hub: &Hub) {
    let t0 = std::time::Instant::now();
    while hub.room_count() > 0 {
        assert!(t0.elapsed() < Duration::from_secs(10), "rooms still loaded: {}", hub.room_count());
        tokio::time::sleep(Duration::from_millis(2)).await;
    }
}

pub fn rows(path: &Path, room: &str) -> Vec<Entry> {
    store::load_room(path, room).unwrap()
}

pub struct Client {
    pub session: Session,
    pub rx: mpsc::Receiver<Frame>,
    pub kick: Arc<Notify>,
}

impl Client {
    pub fn new(hub: &Arc<Hub>) -> Client {
        let (session, rx, kick) = hub.connect();
        Client { session, rx, kick }
    }

    pub fn hello(&mut self, room: &str, client: &str, user: &str, have: u64) {
        self.session.handle(C2S::Hello { room: room.into(), client: client.into(), user: user.into(), have });
    }

    pub fn act(&mut self, room: &str, cseq: u64, json: &str) {
        self.session.handle(C2S::Act { room: room.into(), cseq, action: raw(json) });
    }

    pub fn eph(&mut self, room: &str, key: &str, json: &str) {
        self.session.handle(C2S::Eph { room: room.into(), key: key.into(), value: raw(json) });
    }

    pub async fn recv(&mut self) -> S2C {
        let f = tokio::time::timeout(Duration::from_secs(10), self.rx.recv())
            .await
            .expect("timed out waiting for a frame")
            .expect("connection closed");
        decode_s2c(&f).unwrap()
    }

    /// Whatever is already queued, without waiting.
    pub fn drain(&mut self) -> Vec<S2C> {
        let mut out = vec![];
        while let Ok(f) = self.rx.try_recv() {
            out.push(decode_s2c(&f).unwrap());
        }
        out
    }

    pub async fn welcome(&mut self) -> (u64, Vec<Arc<Entry>>) {
        let (_, head, entries) = self.welcome_epoch().await;
        (head, entries)
    }

    pub async fn welcome_epoch(&mut self) -> (String, u64, Vec<Arc<Entry>>) {
        match self.recv().await {
            S2C::Welcome { epoch, head, entries, .. } => (epoch, head, entries),
            other => panic!("expected welcome, got {other:?}"),
        }
    }

    pub async fn entry(&mut self) -> Arc<Entry> {
        match self.recv().await {
            S2C::Entry { entry, .. } => entry,
            other => panic!("expected entry, got {other:?}"),
        }
    }
}

/// Small deterministic generator for seeded tests.
pub struct Rng(pub u64);

impl Rng {
    pub fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        z ^ (z >> 31)
    }
    pub fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
    pub fn chance(&mut self, pct: u64) -> bool {
        self.below(100) < pct
    }
}

/// Assert the log invariants for one room: seq 1..n with no gaps, each (client, cseq) once,
/// time non-decreasing.
pub fn assert_log(entries: &[Entry]) {
    let mut seen = std::collections::HashSet::new();
    let mut last_time = 0;
    for (i, e) in entries.iter().enumerate() {
        assert_eq!(e.seq, i as u64 + 1, "seq gap at index {i}");
        assert!(seen.insert((e.client.clone(), e.cseq)), "duplicate ({}, {})", e.client, e.cseq);
        assert!(e.time >= last_time, "time went backwards at seq {}", e.seq);
        last_time = e.time;
    }
}
