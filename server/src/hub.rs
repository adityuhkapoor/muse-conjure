//! Room registry and per-connection sessions. A `Session` is transport-free: the WebSocket
//! handler feeds it decoded messages, and tests drive it directly.
//!
//! Every message to a room goes through `Hub::send`, which holds the room's shard lock while
//! it looks the room up (loading it if needed) and queues the message. A room unloads itself
//! through `Hub::unload`, under the same lock, and only when its mailbox is empty. So a message
//! is either queued before the room checks (and the room stays) or sent after the room is gone
//! (and a fresh actor loads from SQLite). There is never more than one actor per room.

use crate::codec::{C2S, Frame, S2C, decode_c2s, encode_s2c, room_hint};
use crate::room::{self, ConnHandle, RoomMsg};
use crate::store::Store;
use std::collections::HashMap;
use std::hash::{BuildHasher, BuildHasherDefault, DefaultHasher};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, Weak};
use std::time::Duration;
use tokio::sync::{Notify, mpsc};

/// Frames a connection may have queued before it is considered too slow and closed.
pub const OUT_QUEUE: usize = 8192;
pub const DEFAULT_IDLE: Duration = Duration::from_secs(30);
const SHARDS: usize = 16;

struct Slot {
    id: u64,
    tx: mpsc::UnboundedSender<RoomMsg>,
}

pub struct Hub {
    shards: Vec<Mutex<HashMap<String, Slot>>>,
    store: Store,
    idle: Duration,
    next_conn: AtomicU64,
    loads: AtomicU64,
    unload_pause_us: AtomicU64,
    me: Weak<Hub>,
}

impl Hub {
    pub fn new(store: Store) -> Arc<Hub> {
        Hub::with_idle(store, DEFAULT_IDLE)
    }

    /// `idle`: how long a room with no subscribers and nothing in flight stays in memory.
    pub fn with_idle(store: Store, idle: Duration) -> Arc<Hub> {
        Arc::new_cyclic(|me| Hub {
            shards: (0..SHARDS).map(|_| Mutex::new(HashMap::new())).collect(),
            store,
            idle,
            next_conn: AtomicU64::new(1),
            loads: AtomicU64::new(0),
            unload_pause_us: AtomicU64::new(0),
            me: me.clone(),
        })
    }

    pub fn store(&self) -> &Store {
        &self.store
    }

    fn shard(&self, name: &str) -> std::sync::MutexGuard<'_, HashMap<String, Slot>> {
        let i = BuildHasherDefault::<DefaultHasher>::default().hash_one(name) as usize % SHARDS;
        self.shards[i].lock().unwrap_or_else(|p| p.into_inner())
    }

    /// Queue a message for a room, loading the room if it is not in memory.
    fn send(&self, name: &str, m: RoomMsg) {
        let mut shard = self.shard(name);
        if let Some(slot) = shard.get(name)
            && !slot.tx.is_closed()
        {
            let _ = slot.tx.send(m);
            return;
        }
        let id = self.loads.fetch_add(1, Ordering::Relaxed) + 1;
        let tx = room::spawn(room::Spawn {
            name: name.to_owned(),
            id,
            store: self.store.clone(),
            hub: self.me.clone(),
            idle: self.idle,
        });
        let _ = tx.send(m);
        shard.insert(name.to_owned(), Slot { id, tx });
    }

    /// Queue a message only if the room is in memory.
    fn send_loaded(&self, name: &str, m: RoomMsg) {
        if let Some(slot) = self.shard(name).get(name) {
            let _ = slot.tx.send(m);
        }
    }

    /// Test hook: an idle room waits this long between deciding to unload and asking the
    /// hub, which widens the window for a racing hello or act.
    pub fn pause_before_unload(&self, d: Duration) {
        self.unload_pause_us.store(d.as_micros() as u64, Ordering::Relaxed);
    }

    pub(crate) fn unload_pause(&self) -> Option<Duration> {
        let us = self.unload_pause_us.load(Ordering::Relaxed);
        (us > 0).then(|| Duration::from_micros(us))
    }

    /// Called by an idle room. Removes it if its mailbox is empty; the room must then exit.
    pub(crate) fn unload(&self, name: &str, id: u64, rx: &mpsc::UnboundedReceiver<RoomMsg>) -> bool {
        let mut shard = self.shard(name);
        if !rx.is_empty() {
            return false;
        }
        if shard.get(name).is_some_and(|s| s.id == id) {
            shard.remove(name);
        }
        true
    }

    /// Rooms currently in memory.
    pub fn room_count(&self) -> usize {
        self.shards.iter().map(|s| s.lock().map(|r| r.len()).unwrap_or(0)).sum()
    }

    /// Room loads since start (first loads and reloads after an unload).
    pub fn loads(&self) -> u64 {
        self.loads.load(Ordering::Relaxed)
    }

    /// Open a session. Frames for it arrive on the returned receiver; when the notify fires
    /// the connection must be closed.
    pub fn connect(self: &Arc<Self>) -> (Session, mpsc::Receiver<Frame>, Arc<Notify>) {
        let (tx, rx) = mpsc::channel(OUT_QUEUE);
        let kick = Arc::new(Notify::new());
        let id = self.next_conn.fetch_add(1, Ordering::Relaxed);
        let handle = ConnHandle { id, tx, kick: kick.clone() };
        (Session { hub: self.clone(), handle, joined: HashMap::new() }, rx, kick)
    }
}

struct Joined {
    client: String,
    user: String,
}

/// One connection. It may join many rooms; messages are multiplexed by `room`.
pub struct Session {
    hub: Arc<Hub>,
    handle: ConnHandle,
    joined: HashMap<String, Joined>,
}

impl Session {
    pub fn id(&self) -> u64 {
        self.handle.id
    }

    fn error(&self, room: Option<String>, code: &str, message: String) {
        let _ = self.handle.tx.try_send(encode_s2c(&S2C::Error { room, code: code.into(), message }));
    }

    pub fn handle_text(&mut self, text: &str) {
        match decode_c2s(text) {
            Ok(m) => self.handle(m),
            Err(e) => self.error(room_hint(text), "bad_message", e.0),
        }
    }

    pub fn handle(&mut self, m: C2S) {
        match m {
            C2S::Hello { room, client, user, have } => {
                self.hub.send(&room, RoomMsg::Hello { conn: self.handle.clone(), have });
                self.joined.insert(room, Joined { client, user });
            }
            C2S::Act { room, cseq, action } => match self.joined.get(&room) {
                Some(j) => {
                    let m = RoomMsg::Act {
                        conn_id: self.handle.id,
                        client: j.client.clone(),
                        user: j.user.clone(),
                        cseq,
                        action,
                    };
                    self.hub.send(&room, m);
                }
                None => self.error(Some(room), "not_joined", "send hello for this room first".into()),
            },
            C2S::Eph { room, key, value } => match self.joined.get(&room) {
                Some(j) => {
                    let m = RoomMsg::Eph { conn_id: self.handle.id, user: j.user.clone(), key, value };
                    self.hub.send(&room, m);
                }
                None => self.error(Some(room), "not_joined", "send hello for this room first".into()),
            },
        }
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        for room in self.joined.keys() {
            self.hub.send_loaded(room, RoomMsg::Leave { conn_id: self.handle.id });
        }
    }
}
