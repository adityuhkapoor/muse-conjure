//! Durable log in SQLite. One writer thread owns the write connection and commits in groups:
//! it takes everything queued, writes it in one transaction, then tells each room how far it
//! got. Rooms broadcast only after that reply, so an entry is on disk before anyone sees it.
//!
//! Reads (room load, catch-up, dedupe lookups) use a small pool of read connections.

use crate::codec::{Entry, raw};
use crate::room_core::{Reply, Writer};
use rusqlite::{Connection, OptionalExtension, params};
use std::hash::{BuildHasher, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::mpsc;


const MAX_BATCH: usize = 4096;
const READ_POOL: usize = 8;

/// Sent back to a room after a group commit: every entry of write generation `gen` up to
/// `upto` is durable, or, when `ok` is false, none of that generation's queued entries will
/// be written and the room must start a new generation.
#[derive(Debug, Clone, Copy)]
pub struct Committed {
    pub upto: u64,
    pub gen_id: u64,
    pub ok: bool,
}

pub struct WriteReq {
    pub room: Arc<str>,
    /// Write generation. After a failed commit the writer skips the rest of that generation,
    /// so later entries of it can never land behind a gap.
    pub gen_id: u64,
    pub entry: Arc<Entry>,
    pub done: mpsc::UnboundedSender<Committed>,
}

#[derive(Clone)]
pub struct Store {
    tx: mpsc::Sender<WriteReq>,
    path: PathBuf,
    epoch: Arc<str>,
    reads: Arc<Mutex<Vec<Connection>>>,
    gens: Arc<AtomicU64>,
    fail: Arc<AtomicU32>,
}

fn open_conn(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.busy_timeout(Duration::from_secs(5))?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    Ok(conn)
}

/// 128 random bits as hex. `RandomState` is seeded from the OS.
fn random_id() -> String {
    let t = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let mut out = String::new();
    for i in 0..2u64 {
        let mut h = std::collections::hash_map::RandomState::new().build_hasher();
        h.write_u128(t);
        h.write_u32(std::process::id());
        h.write_u64(i);
        out.push_str(&format!("{:016x}", h.finish()));
    }
    out
}

fn row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Entry> {
    Ok(Entry {
        seq: r.get::<_, i64>(0)? as u64,
        client: r.get(1)?,
        cseq: r.get::<_, i64>(2)? as u64,
        user: r.get(3)?,
        time: r.get::<_, i64>(4)? as u64,
        seed: r.get::<_, i64>(5)? as u32,
        action: raw(&r.get::<_, String>(6)?),
    })
}

const COLS: &str = "seq, client, cseq, user, time, seed, action";

impl Store {
    /// Open (or create) the database and start the writer thread. `commit_delay` holds every
    /// commit back by that long; tests use it to make a broadcast-before-commit bug visible.
    pub fn open(path: &Path, commit_delay: Option<Duration>) -> rusqlite::Result<Store> {
        let conn = open_conn(path)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS log (
                room TEXT NOT NULL,
                seq INTEGER NOT NULL,
                client TEXT NOT NULL,
                cseq INTEGER NOT NULL,
                user TEXT NOT NULL,
                time INTEGER NOT NULL,
                seed INTEGER NOT NULL,
                action TEXT NOT NULL,
                PRIMARY KEY (room, seq)
            ) WITHOUT ROWID;
            CREATE UNIQUE INDEX IF NOT EXISTS log_dedupe ON log (room, client, cseq);
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;",
        )?;
        conn.execute("INSERT OR IGNORE INTO meta (key, value) VALUES ('epoch', ?1)", params![random_id()])?;
        let epoch: String = conn.query_row("SELECT value FROM meta WHERE key = 'epoch'", [], |r| r.get(0))?;
        let fail = Arc::new(AtomicU32::new(0));
        let (tx, rx) = mpsc::channel(MAX_BATCH * 4);
        let writer_fail = fail.clone();
        std::thread::Builder::new()
            .name("log-writer".into())
            .spawn(move || writer(conn, rx, commit_delay, writer_fail))
            .expect("spawn writer thread");
        Ok(Store {
            tx,
            path: path.to_owned(),
            epoch: Arc::from(epoch),
            reads: Arc::new(Mutex::new(Vec::new())),
            gens: Arc::new(AtomicU64::new(1)),
            fail,
        })
    }

    /// The database's random id, created with it.
    pub fn epoch(&self) -> Arc<str> {
        self.epoch.clone()
    }

    /// A write generation id, unique within this process.
    pub fn next_gen(&self) -> u64 {
        self.gens.fetch_add(1, Ordering::Relaxed)
    }

    /// Test hook: make the next `n` group commits fail.
    pub fn fail_next_commits(&self, n: u32) {
        self.fail.fetch_add(n, Ordering::SeqCst);
    }

    /// Queue an entry. Waits only when the writer is far behind (backpressure).
    pub async fn write(&self, req: WriteReq) -> bool {
        self.tx.send(req).await.is_ok()
    }

    fn read<T>(&self, f: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> rusqlite::Result<T> {
        let pooled = self.reads.lock().unwrap_or_else(|p| p.into_inner()).pop();
        let conn = match pooled {
            Some(c) => c,
            None => open_conn(&self.path)?,
        };
        let out = f(&conn);
        let mut pool = self.reads.lock().unwrap_or_else(|p| p.into_inner());
        if pool.len() < READ_POOL {
            pool.push(conn);
        }
        out
    }

    /// The last `n` entries of a room, in seq order.
    pub fn tail(&self, room: &str, n: usize) -> rusqlite::Result<Vec<Entry>> {
        self.read(|c| {
            let mut stmt = c.prepare_cached(&format!("SELECT {COLS} FROM log WHERE room = ?1 ORDER BY seq DESC LIMIT ?2"))?;
            let mut v: Vec<Entry> = stmt.query_map(params![room, n as i64], row)?.collect::<rusqlite::Result<_>>()?;
            v.reverse();
            Ok(v)
        })
    }

    /// Entries with `after < seq <= upto`, in seq order.
    pub fn range(&self, room: &str, after: u64, upto: u64) -> rusqlite::Result<Vec<Entry>> {
        self.read(|c| {
            let mut stmt = c.prepare_cached(&format!("SELECT {COLS} FROM log WHERE room = ?1 AND seq > ?2 AND seq <= ?3 ORDER BY seq"))?;
            stmt.query_map(params![room, after as i64, upto as i64], row)?.collect()
        })
    }

    /// One entry by seq.
    pub fn get(&self, room: &str, seq: u64) -> rusqlite::Result<Option<Entry>> {
        self.read(|c| {
            let mut stmt = c.prepare_cached(&format!("SELECT {COLS} FROM log WHERE room = ?1 AND seq = ?2"))?;
            stmt.query_row(params![room, seq as i64], row).optional()
        })
    }

    /// Every `(cseq, seq)` a client has in a room. Uses the dedupe index.
    pub fn client_cseqs(&self, room: &str, client: &str) -> rusqlite::Result<Vec<(u64, u64)>> {
        self.read(|c| {
            let mut stmt = c.prepare_cached("SELECT cseq, seq FROM log WHERE room = ?1 AND client = ?2")?;
            stmt.query_map(params![room, client], |r| Ok((r.get::<_, i64>(0)? as u64, r.get::<_, i64>(1)? as u64)))?
                .collect()
        })
    }
}

/// Read a room's whole log, in seq order, on a fresh connection. Used by tests.
pub fn load_room(path: &Path, room: &str) -> rusqlite::Result<Vec<Entry>> {
    let conn = open_conn(path)?;
    let mut stmt = conn.prepare(&format!("SELECT {COLS} FROM log WHERE room = ?1 ORDER BY seq"))?;
    stmt.query_map(params![room], row)?.collect()
}

fn write_batch(conn: &mut Connection, batch: &[WriteReq], skip: &[bool], fail: &AtomicU32) -> rusqlite::Result<()> {
    if fail.fetch_update(Ordering::SeqCst, Ordering::SeqCst, |n| n.checked_sub(1)).is_ok() {
        return Err(rusqlite::Error::InvalidQuery);
    }
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare_cached(
            "INSERT INTO log (room, seq, client, cseq, user, time, seed, action)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )?;
        for (w, _) in batch.iter().zip(skip).filter(|(_, s)| !**s) {
            let e = &w.entry;
            stmt.execute(params![
                &*w.room,
                e.seq as i64,
                e.client,
                e.cseq as i64,
                e.user,
                e.time as i64,
                e.seed as i64,
                e.action.get()
            ])?;
        }
    }
    tx.commit()
}

fn writer(mut conn: Connection, mut rx: mpsc::Receiver<WriteReq>, delay: Option<Duration>, fail: Arc<AtomicU32>) {
    // Which writes are skipped and who hears what is decided by `room_core::Writer`.
    let mut plan: Writer<Arc<str>> = Writer::new();
    let mut batch: Vec<WriteReq> = Vec::with_capacity(MAX_BATCH);
    let mut keys: Vec<(Arc<str>, u64)> = Vec::with_capacity(MAX_BATCH);
    let mut seqs: Vec<(Arc<str>, u64, u64)> = Vec::with_capacity(MAX_BATCH);
    let mut skip = Vec::with_capacity(MAX_BATCH);
    let mut replies: Vec<Reply> = Vec::new();
    while let Some(first) = rx.blocking_recv() {
        batch.push(first);
        while batch.len() < MAX_BATCH {
            match rx.try_recv() {
                Ok(w) => batch.push(w),
                Err(_) => break,
            }
        }
        if let Some(d) = delay {
            std::thread::sleep(d);
        }
        keys.extend(batch.iter().map(|w| (w.room.clone(), w.gen_id)));
        plan.plan(&keys, &mut skip);
        let ok = match write_batch(&mut conn, &batch, &skip, &fail) {
            Ok(()) => true,
            Err(e) => {
                eprintln!("log write failed: {e}");
                false
            }
        };
        seqs.extend(batch.iter().map(|w| (w.room.clone(), w.gen_id, w.entry.seq)));
        plan.finish(&seqs, &skip, ok, &mut replies);
        for r in &replies {
            let _ = batch[r.first].done.send(Committed { upto: r.upto, gen_id: r.generation, ok: r.ok });
        }
        batch.clear();
        keys.clear();
        seqs.clear();
        skip.clear();
    }
}
