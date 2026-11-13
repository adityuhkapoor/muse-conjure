//! One actor task per loaded room: the async shell around `core::Core`. It alone owns the
//! room's core, so ordering needs no locks: every hello, act and eph for the room is a message
//! in one mailbox, handled one at a time.
//!
//! The shell turns mailbox messages, writer replies and the idle timer into core events, and
//! carries out the core's effects: frames to sockets, entries to the writer, reads from
//! SQLite (answered before the next message is taken), and the unload handshake with the hub.
//! All decisions (stamping, dedupe, durability before broadcast, recovery) live in the core.

use crate::codec::{Entry, Frame, S2C, encode_s2c};
use crate::room_core::{self as core, Core, Effect, Event, Out};
use crate::hub::Hub;
use crate::store::{Committed, Store, WriteReq};
use serde_json::value::RawValue;
use std::collections::HashMap;
use std::sync::{Arc, Weak};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::{Notify, mpsc};
use tokio::time::Instant;

pub const EPH_TTL: Duration = Duration::from_micros(core::EPH_TTL_US);
/// Recent entries kept in memory to serve most welcomes without a query.
pub const TAIL: usize = 256;

/// The room's view of one connection: where to send frames and how to cut it off.
#[derive(Clone)]
pub struct ConnHandle {
    pub id: u64,
    pub tx: mpsc::Sender<Frame>,
    /// Notified when the connection fell too far behind and must be closed. The client
    /// reconnects with `have` and catches up, so nothing is lost.
    pub kick: Arc<Notify>,
}

pub enum RoomMsg {
    Hello { conn: ConnHandle, have: u64 },
    Act { conn_id: u64, client: String, user: String, cseq: u64, action: Box<RawValue> },
    Eph { conn_id: u64, user: String, key: String, value: Box<RawValue> },
    Leave { conn_id: u64 },
}

/// The server's concrete types for the core.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Wire;

/// An action as raw JSON, compared and hashed by its text. The core never looks inside.
#[derive(Debug, Clone)]
pub struct RawAction(pub Box<RawValue>);

impl PartialEq for RawAction {
    fn eq(&self, o: &Self) -> bool {
        self.0.get() == o.0.get()
    }
}
impl Eq for RawAction {}
impl std::hash::Hash for RawAction {
    fn hash<H: std::hash::Hasher>(&self, h: &mut H) {
        self.0.get().hash(h);
    }
}

impl core::Types for Wire {
    type Client = String;
    type User = String;
    type Action = RawAction;
    type Entry = Arc<Entry>;
    type EphKey = (String, String);
    type EphFrame = Frame;

    fn stamp(seq: u64, client: String, cseq: u64, user: String, time: u64, seed: u32, action: RawAction) -> Arc<Entry> {
        Arc::new(Entry { seq, client, cseq, user, time, seed, action: action.0 })
    }
    fn seq(e: &Arc<Entry>) -> u64 {
        e.seq
    }
    fn client(e: &Arc<Entry>) -> &String {
        &e.client
    }
    fn cseq(e: &Arc<Entry>) -> u64 {
        e.cseq
    }
    fn time(e: &Arc<Entry>) -> u64 {
        e.time
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Run a blocking store call off the async workers.
async fn blocking<T: Send + 'static>(
    store: &Store,
    f: impl FnOnce(&Store) -> rusqlite::Result<T> + Send + 'static,
) -> Result<T, String> {
    let store = store.clone();
    match tokio::task::spawn_blocking(move || f(&store)).await {
        Ok(Ok(v)) => Ok(v),
        Ok(Err(e)) => Err(e.to_string()),
        Err(e) => Err(e.to_string()),
    }
}

pub(crate) struct Spawn {
    pub name: String,
    pub id: u64,
    pub store: Store,
    pub hub: Weak<Hub>,
    pub idle: Duration,
}

pub(crate) fn spawn(s: Spawn) -> mpsc::UnboundedSender<RoomMsg> {
    let (tx, rx) = mpsc::unbounded_channel();
    tokio::spawn(run(s, rx));
    tx
}

struct Shell {
    name: Arc<str>,
    epoch: Arc<str>,
    store: Store,
    done_tx: mpsc::UnboundedSender<Committed>,
    conns: HashMap<u64, ConnHandle>,
    origin: Instant,
    effects: Vec<Effect<Wire>>,
    scratch: Vec<Effect<Wire>>,
}

async fn run(s: Spawn, mut rx: mpsc::UnboundedReceiver<RoomMsg>) {
    let (done_tx, mut done_rx) = mpsc::unbounded_channel();
    let mut seed_state = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(0);
    for b in s.name.bytes() {
        seed_state = core::splitmix64(&mut seed_state) ^ u64::from(b);
    }
    let mut core: Core<Wire> = Core::new(core::Config {
        tail_cap: TAIL,
        idle: s.idle.as_micros().try_into().unwrap_or(u64::MAX),
        generation: s.store.next_gen() << 32,
        rng: seed_state,
    });
    let mut shell = Shell {
        name: Arc::from(s.name.as_str()),
        epoch: s.store.epoch(),
        store: s.store,
        done_tx,
        conns: HashMap::new(),
        origin: Instant::now(),
        effects: Vec::new(),
        scratch: Vec::new(),
    };
    shell.drive(&mut core, Event::Start).await;
    loop {
        let deadline = core.unload_deadline().map(|d| shell.origin + Duration::from_micros(d));
        tokio::select! {
            biased;
            Some(c) = done_rx.recv() => {
                shell.drive(&mut core, Event::Committed { generation: c.gen_id, upto: c.upto, ok: c.ok }).await;
            }
            m = rx.recv() => match m {
                Some(m) => {
                    let ev = shell.event(m);
                    shell.drive(&mut core, ev).await;
                    let mono = shell.mono();
                    shell.drive(&mut core, Event::Touch { mono }).await;
                }
                None => break,
            },
            _ = tokio::time::sleep_until(deadline.unwrap_or_else(Instant::now)), if deadline.is_some() => {
                let mono = shell.mono();
                shell.effects.clear();
                core.handle(Event::Tick { mono }, &mut shell.effects);
                if !shell.effects.iter().any(|e| matches!(e, Effect::TryUnload)) {
                    continue;
                }
                // Only the hub can tell whether a message is on its way; it removes this room
                // under the same lock senders take, and only when the mailbox is empty.
                if let Some(d) = s.hub.upgrade().and_then(|h| h.unload_pause()) {
                    tokio::time::sleep(d).await;
                }
                shell.effects.clear();
                if s.hub.upgrade().is_some_and(|h| h.unload(&shell.name, s.id, &rx)) {
                    core.handle(Event::Unloaded, &mut shell.effects);
                    break;
                }
                let mono = shell.mono();
                core.handle(Event::Busy { mono }, &mut shell.effects);
            }
        }
    }
}

impl Shell {
    fn mono(&self) -> u64 {
        self.origin.elapsed().as_micros().try_into().unwrap_or(u64::MAX)
    }

    fn event(&mut self, m: RoomMsg) -> Event<Wire> {
        let mono = self.mono();
        match m {
            RoomMsg::Hello { conn, have } => {
                let id = conn.id;
                self.conns.insert(id, conn);
                Event::Hello { conn: id, have, mono }
            }
            RoomMsg::Act { conn_id, client, user, cseq, action } => {
                Event::Act { conn: conn_id, client, user, cseq, action: RawAction(action), wall: now_ms() }
            }
            RoomMsg::Eph { conn_id, user, key, value } => {
                let frame = encode_s2c(&S2C::Eph { room: self.name.to_string(), user: user.clone(), key: key.clone(), value });
                Event::Eph { conn: conn_id, key: (user, key), frame, mono }
            }
            RoomMsg::Leave { conn_id } => {
                self.conns.remove(&conn_id);
                Event::Leave { conn: conn_id }
            }
        }
    }

    fn frame(&self, msg: Out<Wire>) -> Frame {
        match msg {
            Out::Welcome { head, entries } => encode_s2c(&S2C::Welcome {
                room: self.name.to_string(),
                epoch: self.epoch.to_string(),
                head,
                entries,
            }),
            Out::Entry(entry) => encode_s2c(&S2C::Entry { room: self.name.to_string(), entry }),
            Out::Eph(frame) => frame,
            Out::StoreFailed => encode_s2c(&S2C::Error {
                room: Some(self.name.to_string()),
                code: "store_failed".into(),
                message: "could not store; resend pending actions".into(),
            }),
        }
    }

    /// Send to one subscriber without waiting. A full queue means the client is not keeping
    /// up; it is dropped and will catch up on reconnect.
    fn send(&mut self, core: &mut Core<Wire>, conn_id: u64, frame: Frame) {
        if !core.subs.contains_key(&conn_id) {
            return;
        }
        let Some(conn) = self.conns.get(&conn_id) else { return };
        let gone = match conn.tx.try_send(frame) {
            Ok(()) => false,
            Err(mpsc::error::TrySendError::Full(_)) => {
                conn.kick.notify_one();
                true
            }
            Err(mpsc::error::TrySendError::Closed(_)) => true,
        };
        if gone {
            self.conns.remove(&conn_id);
            self.scratch.clear();
            core.handle(Event::Leave { conn: conn_id }, &mut self.scratch);
        }
    }

    /// Hand the core one event and carry out everything that follows from it, answering
    /// reads before returning.
    async fn drive(&mut self, core: &mut Core<Wire>, ev: Event<Wire>) {
        let mut effects = std::mem::take(&mut self.effects);
        effects.clear();
        core.handle(ev, &mut effects);
        loop {
            let mut next = None;
            for eff in effects.drain(..) {
                match eff {
                    Effect::Send { conn, msg } => {
                        let f = self.frame(msg);
                        self.send(core, conn, f);
                    }
                    Effect::Broadcast { msg, except } => {
                        let f = self.frame(msg);
                        let ids: Vec<u64> = core.subs.keys().copied().filter(|id| Some(*id) != except).collect();
                        for id in ids {
                            self.send(core, id, f.clone());
                        }
                    }
                    Effect::Persist { generation, entry } => {
                        let req = WriteReq { room: self.name.clone(), gen_id: generation, entry, done: self.done_tx.clone() };
                        if !self.store.write(req).await {
                            next = Some(Event::WriterGone);
                        }
                    }
                    Effect::Load { cap } => {
                        let name = self.name.clone();
                        let r = blocking(&self.store, move |s| s.tail(&name, cap)).await;
                        if let Err(e) = &r {
                            eprintln!("load of room {} failed: {e}", self.name);
                        }
                        next = Some(Event::Loaded(r.map(|v| v.into_iter().map(Arc::new).collect()).map_err(|_| ())));
                    }
                    Effect::ReadRange { after, upto } => {
                        let name = self.name.clone();
                        let r = blocking(&self.store, move |s| s.range(&name, after, upto)).await;
                        if let Err(e) = &r {
                            eprintln!("catch-up read of room {} failed: {e}", self.name);
                        }
                        next = Some(Event::Range(r.map(|v| v.into_iter().map(Arc::new).collect()).map_err(|_| ())));
                    }
                    Effect::ReadClient { client } => {
                        let name = self.name.clone();
                        let r = blocking(&self.store, move |s| s.client_cseqs(&name, &client)).await;
                        if let Err(e) = &r {
                            eprintln!("dedupe read of room {} failed: {e}", self.name);
                        }
                        next = Some(Event::ClientRows(r.map_err(|_| ())));
                    }
                    Effect::ReadEntry { seq } => {
                        let name = self.name.clone();
                        let r = blocking(&self.store, move |s| s.get(&name, seq)).await;
                        next = Some(Event::EntryAt(r.ok().flatten().map(Arc::new)));
                    }
                    Effect::TryUnload => debug_assert!(false, "TryUnload outside the idle timer"),
                }
            }
            match next {
                Some(ev) => core.handle(ev, &mut effects),
                None => break,
            }
        }
        self.effects = effects;
    }
}
