//! Wire encoding. Every byte that crosses the socket goes through this module, so a binary
//! format can replace JSON here without touching the rest of the server.
//!
//! Actions and eph values are carried as raw JSON and never parsed: the server does not
//! interpret them.

use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;
use std::sync::Arc;

/// An encoded server-to-client frame, shared between all subscribers of a room.
pub type Frame = Arc<str>;

pub const MAX_FRAME: usize = 256 * 1024;
pub const MAX_ACTION: usize = 64 * 1024;
pub const MAX_ID: usize = 256;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entry {
    pub seq: u64,
    pub client: String,
    pub cseq: u64,
    pub user: String,
    pub time: u64,
    pub seed: u32,
    pub action: Box<RawValue>,
}

/// Two entries are equal when every field matches, the action compared as raw JSON text.
impl PartialEq for Entry {
    fn eq(&self, o: &Self) -> bool {
        self.seq == o.seq
            && self.client == o.client
            && self.cseq == o.cseq
            && self.user == o.user
            && self.time == o.time
            && self.seed == o.seed
            && self.action.get() == o.action.get()
    }
}
impl Eq for Entry {}

/// Hashes every field, the action as raw JSON text (consistent with `PartialEq`).
impl std::hash::Hash for Entry {
    fn hash<H: std::hash::Hasher>(&self, h: &mut H) {
        (self.seq, &self.client, self.cseq, &self.user, self.time, self.seed, self.action.get()).hash(h);
    }
}

#[derive(Debug, Clone)]
pub enum C2S {
    Hello { room: String, client: String, user: String, have: u64 },
    Act { room: String, cseq: u64, action: Box<RawValue> },
    Eph { room: String, key: String, value: Box<RawValue> },
}

#[derive(Debug, Clone)]
pub enum S2C {
    Welcome { room: String, epoch: String, head: u64, entries: Vec<Arc<Entry>> },
    Entry { room: String, entry: Arc<Entry> },
    Eph { room: String, user: String, key: String, value: Box<RawValue> },
    Error { room: Option<String>, code: String, message: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodeError(pub String);

impl std::fmt::Display for DecodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

// Internally tagged enums cannot hold RawValue in serde, so decode through a flat struct.
#[derive(Deserialize)]
struct WireIn {
    t: String,
    room: Option<String>,
    client: Option<String>,
    user: Option<String>,
    have: Option<u64>,
    cseq: Option<u64>,
    action: Option<Box<RawValue>>,
    key: Option<String>,
    value: Option<Box<RawValue>>,
    epoch: Option<String>,
    head: Option<u64>,
    entries: Option<Vec<Arc<Entry>>>,
    entry: Option<Arc<Entry>>,
    code: Option<String>,
    message: Option<String>,
}

fn null() -> Box<RawValue> {
    RawValue::from_string("null".to_owned()).expect("null is valid JSON")
}

fn req<T>(v: Option<T>, name: &str) -> Result<T, DecodeError> {
    v.ok_or_else(|| DecodeError(format!("missing field {name}")))
}

fn id(v: Option<String>, name: &str) -> Result<String, DecodeError> {
    let s = req(v, name)?;
    if s.is_empty() || s.len() > MAX_ID {
        return Err(DecodeError(format!("{name} must be 1-{MAX_ID} bytes")));
    }
    Ok(s)
}

/// JavaScript numbers are exact up to 2^53; reject anything a client could not represent.
const MAX_SAFE: u64 = (1 << 53) - 1;

fn wire_in(text: &str) -> Result<WireIn, DecodeError> {
    if text.len() > MAX_FRAME {
        return Err(DecodeError("frame too large".into()));
    }
    serde_json::from_str(text).map_err(|e| DecodeError(format!("bad json: {e}")))
}

pub fn decode_c2s(text: &str) -> Result<C2S, DecodeError> {
    let w = wire_in(text)?;
    match w.t.as_str() {
        "hello" => {
            let have = req(w.have, "have")?;
            if have > MAX_SAFE {
                return Err(DecodeError("have out of range".into()));
            }
            Ok(C2S::Hello {
                room: id(w.room, "room")?,
                client: id(w.client, "client")?,
                user: id(w.user, "user")?,
                have,
            })
        }
        "act" => {
            let cseq = req(w.cseq, "cseq")?;
            if cseq == 0 || cseq > MAX_SAFE {
                return Err(DecodeError("cseq must be a positive safe integer".into()));
            }
            let action = w.action.unwrap_or_else(null);
            if action.get().len() > MAX_ACTION {
                return Err(DecodeError("action too large".into()));
            }
            Ok(C2S::Act { room: id(w.room, "room")?, cseq, action })
        }
        "eph" => {
            let value = w.value.unwrap_or_else(null);
            if value.get().len() > MAX_ACTION {
                return Err(DecodeError("value too large".into()));
            }
            Ok(C2S::Eph { room: id(w.room, "room")?, key: id(w.key, "key")?, value })
        }
        other => Err(DecodeError(format!("unknown message type {other:?}"))),
    }
}

pub fn decode_s2c(text: &str) -> Result<S2C, DecodeError> {
    let w = wire_in(text)?;
    match w.t.as_str() {
        "welcome" => Ok(S2C::Welcome {
            room: req(w.room, "room")?,
            epoch: req(w.epoch, "epoch")?,
            head: req(w.head, "head")?,
            entries: req(w.entries, "entries")?,
        }),
        "entry" => Ok(S2C::Entry { room: req(w.room, "room")?, entry: req(w.entry, "entry")? }),
        "eph" => Ok(S2C::Eph {
            room: req(w.room, "room")?,
            user: req(w.user, "user")?,
            key: req(w.key, "key")?,
            value: w.value.unwrap_or_else(null),
        }),
        "error" => Ok(S2C::Error {
            room: w.room,
            code: req(w.code, "code")?,
            message: w.message.unwrap_or_default(),
        }),
        other => Err(DecodeError(format!("unknown message type {other:?}"))),
    }
}

#[derive(Serialize)]
#[serde(untagged)]
enum WireOut<'a> {
    Hello { t: &'static str, room: &'a str, client: &'a str, user: &'a str, have: u64 },
    Act { t: &'static str, room: &'a str, cseq: u64, action: &'a RawValue },
    Welcome { t: &'static str, room: &'a str, epoch: &'a str, head: u64, entries: &'a [Arc<Entry>] },
    Entry { t: &'static str, room: &'a str, entry: &'a Entry },
    Eph { t: &'static str, room: &'a str, #[serde(skip_serializing_if = "Option::is_none")] user: Option<&'a str>, key: &'a str, value: &'a RawValue },
    Error { t: &'static str, #[serde(skip_serializing_if = "Option::is_none")] room: Option<&'a str>, code: &'a str, message: &'a str },
}

fn to_frame(w: &WireOut<'_>) -> Frame {
    // Serializing borrowed strings, numbers and already-valid raw JSON cannot fail.
    Arc::from(serde_json::to_string(w).expect("wire value serializes"))
}

pub fn encode_s2c(m: &S2C) -> Frame {
    to_frame(&match m {
        S2C::Welcome { room, epoch, head, entries } => WireOut::Welcome { t: "welcome", room, epoch, head: *head, entries },
        S2C::Entry { room, entry } => WireOut::Entry { t: "entry", room, entry },
        S2C::Eph { room, user, key, value } => WireOut::Eph { t: "eph", room, user: Some(user), key, value },
        S2C::Error { room, code, message } => WireOut::Error { t: "error", room: room.as_deref(), code, message },
    })
}

pub fn encode_c2s(m: &C2S) -> Frame {
    to_frame(&match m {
        C2S::Hello { room, client, user, have } => WireOut::Hello { t: "hello", room, client, user, have: *have },
        C2S::Act { room, cseq, action } => WireOut::Act { t: "act", room, cseq: *cseq, action },
        C2S::Eph { room, key, value } => WireOut::Eph { t: "eph", room, user: None, key, value },
    })
}

/// The `room` of a frame that failed to decode, when it has a usable one.
pub fn room_hint(text: &str) -> Option<String> {
    #[derive(Deserialize)]
    struct Hint {
        room: Option<String>,
    }
    if text.len() > MAX_FRAME {
        return None;
    }
    let room = serde_json::from_str::<Hint>(text).ok()?.room?;
    (!room.is_empty() && room.len() <= MAX_ID).then_some(room)
}

/// Build a raw JSON value from text. Used by tests and the bench.
pub fn raw(json: &str) -> Box<RawValue> {
    RawValue::from_string(json.to_owned()).expect("valid json")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips() {
        let m = C2S::Act { room: "t:1".into(), cseq: 3, action: raw(r#"{"x":[1,2]}"#) };
        let f = encode_c2s(&m);
        assert_eq!(&*f, r#"{"t":"act","room":"t:1","cseq":3,"action":{"x":[1,2]}}"#);
        match decode_c2s(&f).unwrap() {
            C2S::Act { cseq, action, .. } => {
                assert_eq!(cseq, 3);
                assert_eq!(action.get(), r#"{"x":[1,2]}"#);
            }
            _ => panic!(),
        }
        let e = Arc::new(Entry { seq: 1, client: "c".into(), cseq: 1, user: "u".into(), time: 5, seed: 7, action: raw("null") });
        let f = encode_s2c(&S2C::Welcome { room: "t:1".into(), epoch: "e1".into(), head: 1, entries: vec![e.clone()] });
        assert!(f.starts_with(r#"{"t":"welcome","room":"t:1","epoch":"e1","head":1,"entries":[{"seq":1,"#), "{f}");
        match decode_s2c(&f).unwrap() {
            S2C::Welcome { entries, head, epoch, .. } => {
                assert_eq!((head, epoch.as_str()), (1, "e1"));
                assert_eq!(entries[0], e);
            }
            _ => panic!(),
        }
    }

    #[test]
    fn rejects_bad_input() {
        assert!(decode_c2s("nope").is_err());
        assert!(decode_c2s(r#"{"t":"act","room":"r","cseq":0,"action":1}"#).is_err());
        assert!(decode_c2s(r#"{"t":"act","room":"","cseq":1,"action":1}"#).is_err());
        assert!(decode_c2s(r#"{"t":"hello","room":"r","client":"c","user":"u"}"#).is_err());
        assert!(decode_c2s(r#"{"t":"zap"}"#).is_err());
        assert!(decode_s2c(r#"{"t":"welcome","room":"r","head":0,"entries":[]}"#).is_err(), "epoch is required");
        assert_eq!(room_hint(r#"{"t":"act","room":"r","cseq":0}"#).as_deref(), Some("r"));
        assert_eq!(room_hint("nope"), None);
        // A missing action becomes null.
        assert!(matches!(decode_c2s(r#"{"t":"act","room":"r","cseq":1}"#), Ok(C2S::Act { .. })));
    }
}
