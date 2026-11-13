//! Seeded simulation: many clients on tokio, each on one connection that carries several
//! rooms, choosing at random (from its seed) to act, drop its connection mid-flight, reconnect
//! with `have`, resend pending actions, or resend old ones. The run has phases; between phases
//! every client leaves and the test waits for every room to unload, so the next phase runs on
//! rooms reloaded from SQLite. One phase injects a failed commit; clients resend their pending
//! actions after `store_failed`, as the real client does.
//!
//! The client behaviour is reproducible from the seed; thread scheduling is not, so each seed
//! also explores different interleavings across runs. The log invariants are checked on every
//! frame and again against the database at the end.

mod common;

use common::*;
use sequencer::codec::{Entry, S2C};
use sequencer::hub::Hub;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tokio::sync::Barrier;

const PHASES: usize = 3;
/// The phase in which one commit fails.
const FAIL_PHASE: usize = 1;

#[derive(Default)]
struct RoomState {
    cseq: u64,
    pending: BTreeMap<u64, String>,
    sent: Vec<(u64, String)>,
    log: Vec<Arc<Entry>>,
    /// Set by `store_failed`: resend pending actions on the next step.
    resend: bool,
}

struct SimClient {
    id: String,
    user: String,
    rooms: BTreeMap<String, RoomState>,
    rng: Rng,
    conn: Option<Client>,
    reconnects: u32,
    failures: Arc<AtomicU64>,
}

impl SimClient {
    fn connect(&mut self, hub: &Arc<Hub>) {
        let mut c = Client::new(hub);
        for (name, r) in &mut self.rooms {
            c.hello(name, &self.id, &self.user, r.log.len() as u64);
            // Resend everything still pending right behind the hello; the server dedupes.
            for (cseq, a) in &r.pending {
                c.act(name, *cseq, a);
            }
            r.resend = false;
        }
        self.conn = Some(c);
        self.reconnects += 1;
    }

    fn on_frame(&mut self, m: S2C) {
        match m {
            S2C::Welcome { room, entries, .. } => {
                for e in entries {
                    self.take(&room, e);
                }
            }
            S2C::Entry { room, entry } => self.take(&room, entry),
            S2C::Eph { .. } => {}
            S2C::Error { room: Some(room), code, .. } if code == "store_failed" => {
                self.failures.fetch_add(1, Ordering::Relaxed);
                self.rooms.get_mut(&room).expect("joined room").resend = true;
            }
            S2C::Error { code, message, .. } => panic!("server error {code}: {message}"),
        }
    }

    fn take(&mut self, room: &str, e: Arc<Entry>) {
        let r = self.rooms.get_mut(room).unwrap_or_else(|| panic!("{} got an entry for {room}, not joined", self.id));
        let next = r.log.len() as u64 + 1;
        if e.seq < next {
            // A resend answered with the original entry: it must match what we hold.
            assert_eq!(r.log[(e.seq - 1) as usize], e, "{} got a different entry for {room} seq {}", self.id, e.seq);
            return;
        }
        assert_eq!(e.seq, next, "{} saw a gap in {room}: expected seq {next}, got {}", self.id, e.seq);
        assert!(e.action.get().contains(&format!(r#""room":"{room}""#)), "entry from another room in {room}");
        if e.client == self.id {
            r.pending.remove(&e.cseq);
        }
        r.log.push(e);
    }

    fn pump(&mut self) {
        let frames = match &mut self.conn {
            Some(c) => c.drain(),
            None => return,
        };
        for f in frames {
            self.on_frame(f);
        }
    }

    fn resend_failed(&mut self) {
        let Some(c) = &mut self.conn else { return };
        for (name, r) in &mut self.rooms {
            if r.resend {
                for (cseq, a) in &r.pending {
                    c.act(name, *cseq, a);
                }
                r.resend = false;
            }
        }
    }

    async fn step(&mut self, hub: &Arc<Hub>) {
        self.pump();
        self.resend_failed();
        let names: Vec<String> = self.rooms.keys().cloned().collect();
        let name = names[self.rng.below(names.len() as u64) as usize].clone();
        let r = self.rng.below(100);
        match r {
            0..=49 => {
                let room = self.rooms.get_mut(&name).expect("room");
                room.cseq += 1;
                let a = format!(r#"{{"room":"{name}","by":"{}","n":{}}}"#, self.id, room.cseq);
                room.pending.insert(room.cseq, a.clone());
                room.sent.push((room.cseq, a.clone()));
                if let Some(c) = &mut self.conn {
                    c.act(&name, room.cseq, &a);
                }
            }
            50..=59 => self.conn = None,
            60..=71 => {
                if self.conn.is_none() {
                    self.connect(hub);
                }
            }
            72..=79 => {
                // Resend something old, acknowledged or not.
                let room = &self.rooms[&name];
                if !room.sent.is_empty() {
                    let (cseq, a) = room.sent[self.rng.below(room.sent.len() as u64) as usize].clone();
                    if let Some(c) = &mut self.conn {
                        c.act(&name, cseq, &a);
                    }
                }
            }
            80..=89 => tokio::time::sleep(Duration::from_micros(self.rng.below(1500))).await,
            _ => tokio::task::yield_now().await,
        }
    }

    async fn settle(&mut self, hub: &Arc<Hub>) {
        self.connect(hub);
        while self.rooms.values().any(|r| !r.pending.is_empty()) {
            let m = self.conn.as_mut().map(|c| c.recv()).expect("connected").await;
            self.on_frame(m);
            self.resend_failed();
        }
    }
}

async fn run(seed: u64, rooms: usize, clients: usize, rooms_each: usize, steps: usize, failures: Arc<AtomicU64>) {
    let db = temp_db();
    let hub = hub_idle(&db.path, None, Duration::from_millis(3));
    let barrier = Arc::new(Barrier::new(clients));
    let mut tasks = vec![];
    for k in 0..clients {
        let hub = hub.clone();
        let barrier = barrier.clone();
        let mut rng = Rng(seed.wrapping_mul(1_000_003) ^ k as u64);
        let mut joined = BTreeMap::new();
        while joined.len() < rooms_each {
            joined.insert(format!("a:{}", rng.below(rooms as u64)), RoomState::default());
        }
        let mut c = SimClient {
            id: format!("c{k}"),
            user: format!("u{k}"),
            rooms: joined,
            rng,
            conn: None,
            reconnects: 0,
            failures: failures.clone(),
        };
        tasks.push(tokio::spawn(async move {
            for phase in 0..PHASES {
                c.connect(&hub);
                for i in 0..steps {
                    if phase == FAIL_PHASE && k == 0 && i == steps / 2 {
                        hub.store().fail_next_commits(1);
                    }
                    c.step(&hub).await;
                }
                c.settle(&hub).await;
                barrier.wait().await;
                // Everyone is settled: a fresh catch-up must extend what this client holds.
                for (name, r) in &c.rooms {
                    let mut fresh = Client::new(&hub);
                    fresh.hello(name, "observer", "o", 0);
                    let (head, entries) = fresh.welcome().await;
                    assert_eq!(head as usize, entries.len());
                    assert_eq!(&entries[..r.log.len()], &r.log[..], "{} diverged in {name}", c.id);
                }
                c.conn = None;
                barrier.wait().await;
                // Every room unloads before the next phase.
                until_unloaded(&hub).await;
                barrier.wait().await;
            }
            let sent: Vec<(String, u64, String)> =
                c.rooms.iter().flat_map(|(n, r)| r.sent.iter().map(move |(cs, a)| (n.clone(), *cs, a.clone()))).collect();
            (c.id.clone(), sent, c.reconnects)
        }));
    }
    let mut sent: HashMap<String, HashSet<(String, u64, String)>> = HashMap::new();
    let mut reconnects = 0;
    for t in tasks {
        let (id, s, n) = t.await.unwrap();
        reconnects += n;
        for (room, cseq, a) in s {
            sent.entry(room).or_default().insert((id.clone(), cseq, a));
        }
    }
    assert!(reconnects as usize > clients * PHASES, "the run should include reconnects");
    assert!(hub.loads() as usize >= sent.len() * PHASES, "rooms should reload in every phase");
    for (room, want) in sent {
        let log = rows(&db.path, &room);
        assert_log(&log);
        let got: HashSet<_> = log.iter().map(|e| (e.client.clone(), e.cseq, e.action.get().to_owned())).collect();
        assert_eq!(got.len(), log.len());
        assert_eq!(got, want, "room {room}: log differs from what was dispatched (seed {seed})");
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn seeded_simulation_keeps_the_log_invariants() {
    let seeds: u64 = std::env::var("SIM_SEEDS").ok().and_then(|s| s.parse().ok()).unwrap_or(8);
    let failures = Arc::new(AtomicU64::new(0));
    for seed in 0..seeds {
        // A panicking client would leave the others at a barrier; fail instead of hanging.
        tokio::time::timeout(Duration::from_secs(60), run(seed, 4, 8, 2, 120, failures.clone()))
            .await
            .unwrap_or_else(|_| panic!("seed {seed} did not finish"));
    }
    assert!(failures.load(Ordering::Relaxed) > 0, "the injected failures should reach clients");
}
