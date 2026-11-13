//! The sequencing logic of one room as a pure, synchronous state machine.
//!
//! `Core::handle(event, out)` is the whole decision procedure of a room: it reads the event,
//! updates the explicit state struct, and appends effects to `out`. It does no I/O, takes no
//! clock readings, spawns nothing and holds no trait objects. The async shell in `room.rs`
//! turns socket messages, store replies and timers into events, and carries out the effects
//! (sockets, SQLite, timers). The model checker (`tests/mc.rs`), the Kani harnesses
//! (`src/proofs.rs`) and the trace checker (`spec/`) drive this same code with small types.
//!
//! Read effects (`Load`, `ReadRange`, `ReadClient`, `ReadEntry`) are always the last effect
//! of a batch, and the shell answers each one with the matching event before it hands the
//! core anything else. `Persist` is answered only when the writer is gone (`WriterGone`).
//!
//! The invariants are ordinary predicates named after the properties in `spec/sync.qnt`
//! (see `Core::invariants`). Debug builds check them after every event.

use std::collections::{BTreeMap, VecDeque};

/// Largest seq the core will hand out: JavaScript clients read seq as a double.
pub const MAX_SEQ: u64 = (1 << 53) - 1;
/// How long an eph value is replayed to joiners, in shell clock units (microseconds).
pub const EPH_TTL_US: u64 = 5_000_000;

/// The concrete types a core works with. The server uses JSON strings and shared entries; the
/// model checker and the proofs use small integers. Static dispatch only.
pub trait Types: Clone + core::fmt::Debug + Eq + core::hash::Hash {
    type Client: Ord + Clone + core::fmt::Debug + core::hash::Hash;
    type User: Clone + core::fmt::Debug + Eq + core::hash::Hash;
    type Action: Clone + core::fmt::Debug + Eq + core::hash::Hash;
    /// A stamped entry. Cheap to clone (an `Arc` in the server).
    type Entry: Clone + core::fmt::Debug + Eq + core::hash::Hash;
    /// `(user, key)` of an eph value.
    type EphKey: Ord + Clone + core::fmt::Debug + core::hash::Hash;
    /// An eph value ready to send (the server keeps the encoded frame).
    type EphFrame: Clone + core::fmt::Debug + Eq + core::hash::Hash;

    fn stamp(seq: u64, client: Self::Client, cseq: u64, user: Self::User, time: u64, seed: u32, action: Self::Action) -> Self::Entry;
    fn seq(e: &Self::Entry) -> u64;
    fn client(e: &Self::Entry) -> &Self::Client;
    fn cseq(e: &Self::Entry) -> u64;
    fn time(e: &Self::Entry) -> u64;
}

pub type ConnId = u64;

#[derive(Debug)]
pub enum Event<T: Types> {
    /// The room was just created by the shell.
    Start,
    /// `mono`: the shell's monotonic clock, for eph expiry and the idle timer.
    Hello { conn: ConnId, have: u64, mono: u64 },
    /// `wall`: server wall clock in ms since the Unix epoch, for the entry's `time`.
    Act { conn: ConnId, client: T::Client, user: T::User, cseq: u64, action: T::Action, wall: u64 },
    Eph { conn: ConnId, key: T::EphKey, frame: T::EphFrame, mono: u64 },
    /// The connection left the room or can no longer be sent to.
    Leave { conn: ConnId },
    /// The shell finished handling a mailbox message: restart the idle timer.
    Touch { mono: u64 },
    /// Answer to `Load`: the last `cap` durable entries in seq order.
    Loaded(Result<Vec<T::Entry>, ()>),
    /// Answer to `ReadRange`.
    Range(Result<Vec<T::Entry>, ()>),
    /// Answer to `ReadClient`: every durable `(cseq, seq)` of that client.
    ClientRows(Result<Vec<(u64, u64)>, ()>),
    /// Answer to `ReadEntry`.
    EntryAt(Option<T::Entry>),
    /// The writer reports a group commit: every entry of `generation` up to `upto` is durable, or
    /// (`ok` false) none of that generation's remaining entries will be written.
    Committed { generation: u64, upto: u64, ok: bool },
    /// A `Persist` could not be queued: the writer is gone.
    WriterGone,
    /// The idle timer fired.
    Tick { mono: u64 },
    /// Answer to `TryUnload`: the hub removed the room. The core is back to its unloaded state.
    Unloaded,
    /// Answer to `TryUnload`: a message is on its way, stay.
    Busy { mono: u64 },
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Out<T: Types> {
    Welcome { head: u64, entries: Vec<T::Entry> },
    Entry(T::Entry),
    Eph(T::EphFrame),
    StoreFailed,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Effect<T: Types> {
    Load { cap: usize },
    ReadRange { after: u64, upto: u64 },
    ReadClient { client: T::Client },
    ReadEntry { seq: u64 },
    Persist { generation: u64, entry: T::Entry },
    Send { conn: ConnId, msg: Out<T> },
    /// To every current subscriber except `except`.
    Broadcast { msg: Out<T>, except: Option<ConnId> },
    /// Ask the hub to remove this room; answer with `Unloaded` or `Busy`.
    TryUnload,
}

impl<T: Types> Effect<T> {
    pub fn is_read(&self) -> bool {
        matches!(self, Effect::Load { .. } | Effect::ReadRange { .. } | Effect::ReadClient { .. } | Effect::ReadEntry { .. })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ActReq<T: Types> {
    pub conn: ConnId,
    pub client: T::Client,
    pub user: T::User,
    pub cseq: u64,
    pub action: T::Action,
    pub wall: u64,
}

/// What the core is waiting for after a read effect.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Wait<T: Types> {
    Start,
    HelloLoad { conn: ConnId, have: u64, mono: u64 },
    HelloRange { conn: ConnId, mono: u64 },
    ActLoad(ActReq<T>),
    ActClient(ActReq<T>),
    ActEntry { conn: ConnId },
    Unload,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Config {
    /// Recent entries kept in memory to serve most welcomes without a read.
    pub tail_cap: usize,
    /// How long a room with no subscribers and nothing in flight stays loaded (shell units).
    pub idle: u64,
    /// First write generation. Must be unique per room across cores (the shell takes it from
    /// a process-wide counter shifted left by 32, so a core may use 2^32 generations).
    pub generation: u64,
    /// Seed for the per-room generator of entry seeds.
    pub rng: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Core<T: Types> {
    pub cfg: Config,
    pub loaded: bool,
    /// Durable head: the highest seq known to be on disk.
    pub head: u64,
    pub next_seq: u64,
    pub last_time: u64,
    pub rng: u64,
    pub generation: u64,
    /// The last `tail_cap` durable entries, ending at `head`.
    pub tail: VecDeque<T::Entry>,
    /// Stamped entries waiting for their commit, seq `head + 1 ..`.
    pub inflight: VecDeque<T::Entry>,
    /// client -> cseq -> seq, filled from SQLite the first time a client acts.
    pub dedupe: BTreeMap<T::Client, BTreeMap<u64, u64>>,
    /// conn -> the `have` of its hello.
    pub subs: BTreeMap<ConnId, u64>,
    pub eph: BTreeMap<T::EphKey, (T::EphFrame, u64)>,
    /// Last mailbox message, for the idle timer.
    pub active: u64,
    pub wait: Option<Wait<T>>,
}

pub fn splitmix64(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9e37_79b9_7f4a_7c15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    z ^ (z >> 31)
}

impl<T: Types> Core<T> {
    pub fn new(cfg: Config) -> Core<T> {
        Core {
            cfg,
            loaded: false,
            head: 0,
            next_seq: 1,
            last_time: 0,
            rng: cfg.rng,
            generation: cfg.generation,
            tail: VecDeque::new(),
            inflight: VecDeque::new(),
            dedupe: BTreeMap::new(),
            subs: BTreeMap::new(),
            eph: BTreeMap::new(),
            active: 0,
            wait: None,
        }
    }

    /// No subscribers, nothing in flight, no read outstanding.
    pub fn is_idle(&self) -> bool {
        self.subs.is_empty() && self.inflight.is_empty() && self.wait.is_none()
    }

    /// When the idle timer should fire, if the room is idle.
    pub fn unload_deadline(&self) -> Option<u64> {
        self.is_idle().then(|| self.active.saturating_add(self.cfg.idle))
    }

    pub fn handle(&mut self, ev: Event<T>, out: &mut Vec<Effect<T>>) {
        let start = out.len();
        // Timer and bookkeeping events touch no entries; skip the O(n) check for them so the
        // idle path stays as quick as it was before the core existed.
        let entries_may_change = !matches!(ev, Event::Tick { .. } | Event::Busy { .. } | Event::Touch { .. } | Event::Eph { .. } | Event::Leave { .. });
        match ev {
            Event::Start => {
                if !self.loaded && self.wait.is_none() {
                    self.wait = Some(Wait::Start);
                    out.push(Effect::Load { cap: self.cfg.tail_cap });
                }
            }
            Event::Hello { conn, have, mono } => {
                // A second hello on the same connection replaces the first subscription.
                self.subs.insert(conn, have);
                self.hello(conn, have, mono, out);
            }
            Event::Act { conn, client, user, cseq, action, wall } => {
                self.act(ActReq { conn, client, user, cseq, action, wall }, out);
            }
            Event::Eph { conn, key, frame, mono } => {
                self.eph.insert(key, (frame.clone(), mono));
                out.push(Effect::Broadcast { msg: Out::Eph(frame), except: Some(conn) });
            }
            Event::Leave { conn } => {
                self.subs.remove(&conn);
            }
            Event::Touch { mono } => self.active = mono,
            Event::Loaded(r) => match self.wait.take() {
                Some(Wait::Start) => {
                    if let Ok(entries) = r {
                        self.set_loaded(entries);
                    }
                }
                Some(Wait::HelloLoad { conn, have, mono }) => match r {
                    Ok(entries) => {
                        self.set_loaded(entries);
                        self.hello(conn, have, mono, out);
                    }
                    Err(()) => out.push(Effect::Send { conn, msg: Out::StoreFailed }),
                },
                Some(Wait::ActLoad(a)) => match r {
                    Ok(entries) => {
                        self.set_loaded(entries);
                        self.act(a, out);
                    }
                    Err(()) => out.push(Effect::Send { conn: a.conn, msg: Out::StoreFailed }),
                },
                other => self.unexpected(other),
            },
            Event::Range(r) => match self.wait.take() {
                Some(Wait::HelloRange { conn, mono }) => match r {
                    Ok(entries) => self.welcome(conn, entries, mono, out),
                    Err(()) => out.push(Effect::Send { conn, msg: Out::StoreFailed }),
                },
                other => self.unexpected(other),
            },
            Event::ClientRows(r) => match self.wait.take() {
                Some(Wait::ActClient(a)) => match r {
                    Ok(rows) => {
                        self.dedupe.insert(a.client.clone(), rows.into_iter().collect());
                        self.act(a, out);
                    }
                    Err(()) => out.push(Effect::Send { conn: a.conn, msg: Out::StoreFailed }),
                },
                other => self.unexpected(other),
            },
            Event::EntryAt(e) => match self.wait.take() {
                Some(Wait::ActEntry { conn }) => {
                    if let Some(entry) = e {
                        out.push(Effect::Send { conn, msg: Out::Entry(entry) });
                    }
                }
                other => self.unexpected(other),
            },
            Event::Committed { generation, upto, ok } => self.committed(generation, upto, ok, out),
            Event::WriterGone => self.failed(out),
            Event::Tick { mono } => {
                if self.unload_deadline().is_some_and(|d| mono >= d) {
                    self.wait = Some(Wait::Unload);
                    out.push(Effect::TryUnload);
                }
            }
            Event::Unloaded => match self.wait.take() {
                Some(Wait::Unload) => self.unload(),
                other => self.unexpected(other),
            },
            Event::Busy { mono } => match self.wait.take() {
                Some(Wait::Unload) => self.active = mono,
                other => self.unexpected(other),
            },
        }
        debug_assert!(out[start..].iter().rev().skip(1).all(|e| !e.is_read()), "a read effect must end its batch");
        debug_assert!(!entries_may_change || self.check() == Ok(()), "core invariant broken: {:?}", self.check());
    }

    /// An answer that does not match what the core waits for. The shell never does this; keep
    /// whatever wait there was so the real answer can still arrive.
    fn unexpected(&mut self, w: Option<Wait<T>>) {
        debug_assert!(false, "unexpected answer while waiting for {w:?}");
        self.wait = w;
    }

    fn set_loaded(&mut self, entries: Vec<T::Entry>) {
        if let Some(last) = entries.last() {
            self.head = T::seq(last);
            self.last_time = T::time(last);
        }
        self.next_seq = self.head.saturating_add(1);
        self.tail = entries.into_iter().collect();
        self.loaded = true;
    }

    /// Back to the state of a freshly created core, with a new write generation (a reload is
    /// a new actor, which gets a new generation from the shell).
    fn unload(&mut self) {
        let mut fresh = Core::new(self.cfg);
        fresh.rng = self.rng;
        fresh.generation = self.generation.wrapping_add(1);
        *self = fresh;
    }

    fn hello(&mut self, conn: ConnId, have: u64, mono: u64, out: &mut Vec<Effect<T>>) {
        if !self.loaded {
            self.wait = Some(Wait::HelloLoad { conn, have, mono });
            out.push(Effect::Load { cap: self.cfg.tail_cap });
            return;
        }
        // An impossible `have` (a client from another database) gets everything from seq 1;
        // the new epoch tells it to start over.
        let after = if have > self.head { 0 } else { have };
        if after >= self.head {
            self.welcome(conn, Vec::new(), mono, out);
            return;
        }
        if let Some(first) = self.tail.front().map(T::seq)
            && first <= after + 1
        {
            let skip = usize::try_from(after + 1 - first).unwrap_or(usize::MAX);
            let entries = self.tail.iter().skip(skip).cloned().collect();
            self.welcome(conn, entries, mono, out);
            return;
        }
        self.wait = Some(Wait::HelloRange { conn, mono });
        out.push(Effect::ReadRange { after, upto: self.head });
    }

    fn welcome(&mut self, conn: ConnId, entries: Vec<T::Entry>, mono: u64, out: &mut Vec<Effect<T>>) {
        out.push(Effect::Send { conn, msg: Out::Welcome { head: self.head, entries } });
        self.eph.retain(|_, (_, at)| mono.saturating_sub(*at) < EPH_TTL_US);
        for (frame, _) in self.eph.values() {
            out.push(Effect::Send { conn, msg: Out::Eph(frame.clone()) });
        }
    }

    fn act(&mut self, a: ActReq<T>, out: &mut Vec<Effect<T>>) {
        if !self.loaded {
            self.wait = Some(Wait::ActLoad(a));
            out.push(Effect::Load { cap: self.cfg.tail_cap });
            return;
        }
        let Some(seen) = self.dedupe.get(&a.client) else {
            out.push(Effect::ReadClient { client: a.client.clone() });
            self.wait = Some(Wait::ActClient(a));
            return;
        };
        if let Some(&seq) = seen.get(&a.cseq) {
            // A resend. Entries above the subscriber's `have` are already on their way to it
            // (welcome, broadcast, or still in flight), so only an entry at or below `have`
            // needs to be sent again.
            let have = self.subs.get(&a.conn).copied().unwrap_or(0);
            if seq <= self.head && seq <= have {
                match self.tail.front().map(T::seq) {
                    Some(first) if seq >= first => {
                        let i = usize::try_from(seq - first).unwrap_or(usize::MAX);
                        if let Some(entry) = self.tail.get(i) {
                            out.push(Effect::Send { conn: a.conn, msg: Out::Entry(entry.clone()) });
                        }
                    }
                    _ => {
                        self.wait = Some(Wait::ActEntry { conn: a.conn });
                        out.push(Effect::ReadEntry { seq });
                    }
                }
            }
            return;
        }
        if self.next_seq > MAX_SEQ {
            out.push(Effect::Send { conn: a.conn, msg: Out::StoreFailed });
            return;
        }
        let seq = self.next_seq;
        self.next_seq = seq + 1;
        self.last_time = self.last_time.max(a.wall);
        let seed = (splitmix64(&mut self.rng) >> 32) as u32;
        let entry = T::stamp(seq, a.client.clone(), a.cseq, a.user, self.last_time, seed, a.action);
        self.dedupe.entry(a.client).or_default().insert(a.cseq, seq);
        self.inflight.push_back(entry.clone());
        out.push(Effect::Persist { generation: self.generation, entry });
    }

    fn committed(&mut self, generation: u64, upto: u64, ok: bool, out: &mut Vec<Effect<T>>) {
        if generation != self.generation {
            // A reply for a generation already given up.
            return;
        }
        if !ok {
            self.failed(out);
            return;
        }
        while self.inflight.front().is_some_and(|e| T::seq(e) <= upto) {
            let Some(entry) = self.inflight.pop_front() else { break };
            debug_assert_eq!(T::seq(&entry), self.head + 1);
            self.head = T::seq(&entry);
            self.tail.push_back(entry.clone());
            if self.tail.len() > self.cfg.tail_cap {
                self.tail.pop_front();
            }
            out.push(Effect::Broadcast { msg: Out::Entry(entry), except: None });
        }
    }

    /// A commit failed. Entries not on disk are forgotten (their senders still hold them as
    /// pending and resend), seq restarts at the durable head, and a new write generation
    /// begins so the writer drops the rest of the old one.
    fn failed(&mut self, out: &mut Vec<Effect<T>>) {
        for e in self.inflight.drain(..) {
            if let Some(d) = self.dedupe.get_mut(T::client(&e)) {
                d.remove(&T::cseq(&e));
            }
        }
        self.next_seq = self.head.saturating_add(1);
        self.generation = self.generation.wrapping_add(1);
        out.push(Effect::Broadcast { msg: Out::StoreFailed, except: None });
    }

    // ----- Invariants, named after the properties in spec/sync.qnt. -----

    /// `GapFree` (server side): the tail ends at the head and is contiguous; in-flight entries
    /// continue it without a gap up to `next_seq - 1`.
    pub fn inv_gap_free(&self) -> bool {
        let tail_ok = self.tail.iter().enumerate().all(|(i, e)| {
            let back = (self.tail.len() - 1 - i) as u64;
            self.head >= back && T::seq(e) == self.head - back
        });
        let inflight_ok = self.inflight.iter().enumerate().all(|(i, e)| self.head.checked_add(1 + i as u64) == Some(T::seq(e)));
        let next_ok = !self.loaded || self.next_seq == self.head + 1 + self.inflight.len() as u64;
        tail_ok && inflight_ok && next_ok && self.tail.len() <= self.cfg.tail_cap.max(1)
    }

    /// `AtMostOnce` (server side): every in-flight entry is in the dedupe index under its own
    /// (client, cseq) with its own seq, and no two dedupe entries share a seq above the head.
    pub fn inv_at_most_once(&self) -> bool {
        let covered = self
            .inflight
            .iter()
            .all(|e| self.dedupe.get(T::client(e)).and_then(|d| d.get(&T::cseq(e))) == Some(&T::seq(e)));
        // In-flight seqs are distinct (GapFree), so if every one is covered and nothing else
        // sits above the head, the dedupe entries above the head are exactly them, once each.
        let above = self.dedupe.values().flat_map(|d| d.values()).filter(|s| **s > self.head).count();
        covered && above == self.inflight.len()
    }

    /// `TimeMonotone` (server side): times along the tail and in-flight entries never go down,
    /// and none is above `last_time`.
    pub fn inv_time_monotone(&self) -> bool {
        let mut last = 0;
        for e in self.tail.iter().chain(self.inflight.iter()) {
            if T::time(e) < last {
                return false;
            }
            last = T::time(e);
        }
        last <= self.last_time || self.tail.is_empty() && self.inflight.is_empty()
    }

    /// `NothingBeforeLoad`: an unloaded core holds no entries.
    pub fn inv_unloaded_empty(&self) -> bool {
        self.loaded || (self.head == 0 && self.tail.is_empty() && self.inflight.is_empty() && self.dedupe.is_empty())
    }

    pub fn check(&self) -> Result<(), &'static str> {
        if !self.inv_gap_free() {
            return Err("GapFree");
        }
        if !self.inv_at_most_once() {
            return Err("AtMostOnce");
        }
        if !self.inv_time_monotone() {
            return Err("TimeMonotone");
        }
        if !self.inv_unloaded_empty() {
            return Err("NothingBeforeLoad");
        }
        Ok(())
    }
}

/// The writer's bookkeeping (see `store.rs`), as pure functions: which queued writes go into a
/// transaction, and who hears what after it.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Default)]
pub struct Writer<R: Ord + Clone> {
    /// The generation that failed, per room. Its remaining entries are skipped; the room
    /// starts a new generation from its durable head once it hears about the failure.
    pub failed: BTreeMap<R, u64>,
}

/// One reply after a group commit: to the sender of `batch[first]`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Reply {
    pub first: usize,
    pub generation: u64,
    pub upto: u64,
    pub ok: bool,
}

impl<R: Ord + Clone> Writer<R> {
    pub fn new() -> Writer<R> {
        Writer { failed: BTreeMap::new() }
    }

    /// For each queued `(room, generation)`, whether it is skipped.
    pub fn plan(&mut self, batch: &[(R, u64)], skip: &mut Vec<bool>) {
        skip.clear();
        for (room, generation) in batch {
            let s = match self.failed.get(room) {
                Some(&g) if g == *generation => true,
                // A newer generation: the room has recovered.
                Some(_) => {
                    self.failed.remove(room);
                    false
                }
                None => false,
            };
            skip.push(s);
        }
    }

    /// After the transaction (`ok` = it committed): one reply per (room, generation) written.
    /// `batch[i] = (room, generation, seq)`.
    pub fn finish(&mut self, batch: &[(R, u64, u64)], skip: &[bool], ok: bool, replies: &mut Vec<Reply>) {
        replies.clear();
        let mut at: BTreeMap<(R, u64), usize> = BTreeMap::new();
        for (i, ((room, generation, seq), s)) in batch.iter().zip(skip).enumerate() {
            if *s {
                continue;
            }
            match at.get(&(room.clone(), *generation)) {
                Some(&j) => {
                    let r: &mut Reply = &mut replies[j];
                    r.upto = r.upto.max(*seq);
                }
                None => {
                    at.insert((room.clone(), *generation), replies.len());
                    replies.push(Reply { first: i, generation: *generation, upto: *seq, ok });
                }
            }
        }
        if !ok {
            for ((room, generation), _) in at {
                self.failed.insert(room, generation);
            }
        }
    }
}
