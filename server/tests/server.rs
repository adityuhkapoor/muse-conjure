mod common;

use common::*;
use futures_util::{SinkExt, StreamExt};
use sequencer::codec::{C2S, S2C, decode_s2c, encode_c2s, raw};
use std::collections::HashSet;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_tungstenite::tungstenite::Message;

const R: &str = "t:1";

#[tokio::test]
async fn resend_is_applied_once_and_returns_the_original_entry() {
    let db = temp_db();
    let hub = hub(&db.path, None);
    let mut a = Client::new(&hub);
    a.hello(R, "ca", "u1", 0);
    assert_eq!(a.welcome().await, (0, vec![]));

    a.act(R, 1, r#""first""#);
    let e1 = a.entry().await;
    assert_eq!((e1.seq, e1.cseq, e1.action.get()), (1, 1, r#""first""#));

    // Same connection, same cseq, different body: ignored, the original stands.
    a.act(R, 1, r#""changed""#);
    a.act(R, 2, r#""second""#);
    let e2 = a.entry().await;
    assert_eq!((e2.seq, e2.cseq), (2, 2));

    // A new connection that already holds seq 1 resends cseq 1: it gets the original entry.
    let mut b = Client::new(&hub);
    b.hello(R, "ca", "u1", 2);
    assert_eq!(b.welcome().await, (2, vec![]));
    b.act(R, 1, r#""again""#);
    assert_eq!(b.entry().await, e1);

    // A new connection with have = 0 gets it once, in the welcome, and nothing extra.
    let mut c = Client::new(&hub);
    c.hello(R, "ca", "u1", 0);
    let (_, entries) = c.welcome().await;
    assert_eq!(entries, vec![e1.clone(), e2.clone()]);
    c.act(R, 1, r#""again""#);
    c.act(R, 3, r#""third""#);
    assert_eq!(c.entry().await.seq, 3);

    let log = rows(&db.path, R);
    assert_log(&log);
    assert_eq!(log.len(), 3);
    assert_eq!(log[0].action.get(), r#""first""#);
}

#[tokio::test]
async fn resend_while_in_flight_is_applied_once() {
    let db = temp_db();
    let hub = hub(&db.path, Some(Duration::from_millis(50)));
    let mut a = Client::new(&hub);
    a.hello(R, "ca", "u1", 0);
    a.welcome().await;
    for _ in 0..5 {
        a.act(R, 1, "1");
    }
    a.act(R, 2, "2");
    assert_eq!(a.entry().await.cseq, 1);
    assert_eq!(a.entry().await.cseq, 2);
    tokio::time::sleep(Duration::from_millis(120)).await;
    assert!(a.drain().is_empty());
    assert_eq!(rows(&db.path, R).len(), 2);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn seq_is_gap_free_under_concurrent_writers() {
    let db = temp_db();
    let hub = hub(&db.path, None);
    let writers = 20u64;
    let per = 200u64;
    let mut watch = Client::new(&hub);
    watch.hello(R, "watch", "w", 0);
    watch.welcome().await;

    let mut tasks = vec![];
    for w in 0..writers {
        let hub = hub.clone();
        tasks.push(tokio::spawn(async move {
            let mut c = Client::new(&hub);
            c.hello(R, &format!("c{w}"), &format!("u{w}"), 0);
            for i in 1..=per {
                c.act(R, i, &format!("[{w},{i}]"));
                if i % 7 == 0 {
                    tokio::task::yield_now().await;
                }
            }
            // Every writer sees every entry, in order, with no gaps.
            let (_, mut got) = c.welcome().await;
            while (got.len() as u64) < writers * per {
                got.push(c.entry().await);
            }
            for (i, e) in got.iter().enumerate() {
                assert_eq!(e.seq, i as u64 + 1);
            }
        }));
    }
    let mut seen = vec![];
    while (seen.len() as u64) < writers * per {
        seen.push(watch.entry().await);
    }
    for t in tasks {
        t.await.unwrap();
    }
    let log = rows(&db.path, R);
    assert_log(&log);
    assert_eq!(log.len() as u64, writers * per);
    assert_eq!(seen.iter().map(|e| (**e).clone()).collect::<Vec<_>>(), log);
    // Each writer's own actions keep their relative order.
    for w in 0..writers {
        let mine: Vec<u64> = log.iter().filter(|e| e.client == format!("c{w}")).map(|e| e.cseq).collect();
        assert_eq!(mine, (1..=per).collect::<Vec<_>>());
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn every_entry_is_durable_before_anyone_sees_it() {
    let db = temp_db();
    // A slow disk: if a broadcast ever overtook its commit, the row would be missing below.
    let hub = hub(&db.path, Some(Duration::from_millis(30)));
    let mut a = Client::new(&hub);
    let mut b = Client::new(&hub);
    a.hello(R, "ca", "u1", 0);
    b.hello(R, "cb", "u2", 0);
    a.welcome().await;
    b.welcome().await;
    for i in 1..=40 {
        a.act(R, i, &i.to_string());
        if i % 10 == 0 {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    }
    for _ in 0..40 {
        let e = b.entry().await;
        let on_disk = rows(&db.path, R);
        assert!(on_disk.iter().any(|r| r.seq == e.seq), "seq {} broadcast before commit", e.seq);
    }
}

#[tokio::test]
async fn catch_up_from_have_and_across_restart() {
    let db = temp_db();
    let first = {
        let hub = hub(&db.path, None);
        let mut a = Client::new(&hub);
        a.hello(R, "ca", "u1", 0);
        a.welcome().await;
        for i in 1..=10 {
            a.act(R, i, &i.to_string());
        }
        let mut got = vec![];
        for _ in 0..10 {
            got.push(a.entry().await);
        }
        let mut b = Client::new(&hub);
        b.hello(R, "cb", "u2", 4);
        let (head, entries) = b.welcome().await;
        assert_eq!(head, 10);
        assert_eq!(entries.iter().map(|e| e.seq).collect::<Vec<_>>(), (5..=10).collect::<Vec<_>>());
        // A `have` past the head (a client from another database) gets everything from seq 1.
        let mut c = Client::new(&hub);
        c.hello(R, "cc", "u3", 99);
        assert_eq!(c.welcome().await, (10, got.clone()));
        got
    };

    // Restart on the same file.
    let hub = hub(&db.path, None);
    let mut a = Client::new(&hub);
    a.hello(R, "ca", "u1", 0);
    let (head, entries) = a.welcome().await;
    assert_eq!(head, 10);
    assert_eq!(entries, first);
    a.act(R, 3, "\"resent after restart\"");
    a.act(R, 11, "11");
    let e = a.entry().await;
    assert_eq!((e.seq, e.cseq), (11, 11));
    assert!(e.time >= first[9].time);
    let log = rows(&db.path, R);
    assert_log(&log);
    assert_eq!(log.len(), 11);
}

#[tokio::test]
async fn rooms_are_independent() {
    let db = temp_db();
    let hub = hub(&db.path, None);
    let mut a = Client::new(&hub);
    a.hello("t:1", "ca", "u1", 0);
    a.hello("a:2", "ca", "u1", 0);
    a.welcome().await;
    a.welcome().await;
    a.act("t:1", 1, "1");
    a.act("a:2", 1, "1");
    let x = a.entry().await;
    let y = a.entry().await;
    assert_eq!((x.seq, y.seq), (1, 1));
    assert_eq!(rows(&db.path, "t:1").len(), 1);
    assert_eq!(rows(&db.path, "a:2").len(), 1);
}

#[tokio::test(flavor = "current_thread")]
async fn eph_is_fanned_out_last_value_wins_expires_and_is_never_stored() {
    let db = temp_db();
    let hub = hub(&db.path, None);
    let mut a = Client::new(&hub);
    let mut b = Client::new(&hub);
    a.hello(R, "ca", "u1", 0);
    b.hello(R, "cb", "u2", 0);
    a.welcome().await;
    b.welcome().await;

    // Not joined: refused.
    a.eph("t:other", "typing", "true");
    assert!(matches!(a.recv().await, S2C::Error { code, .. } if code == "not_joined"));

    a.eph(R, "typing", "true");
    a.eph(R, "typing", "false");
    a.eph(R, "cursor", "[1,2]");
    for want in ["true", "false", "[1,2]"] {
        match b.recv().await {
            S2C::Eph { user, value, .. } => assert_eq!((user.as_str(), value.get()), ("u1", want)),
            other => panic!("{other:?}"),
        }
    }
    // A joiner within 5 s gets the last value per (user, key) only.
    let mut c = Client::new(&hub);
    c.hello(R, "cc", "u3", 0);
    c.welcome().await;
    let mut got = HashSet::new();
    for _ in 0..2 {
        match c.recv().await {
            S2C::Eph { key, value, .. } => {
                got.insert((key, value.get().to_owned()));
            }
            other => panic!("{other:?}"),
        }
    }
    assert_eq!(got, HashSet::from([("typing".into(), "false".into()), ("cursor".into(), "[1,2]".into())]));
    // The sender does not get its own eph back.
    assert!(a.drain().is_empty());

    // After 5 s a joiner gets nothing.
    tokio::time::pause();
    tokio::time::advance(Duration::from_millis(5_001)).await;
    tokio::time::resume();
    let mut d = Client::new(&hub);
    d.hello(R, "cd", "u4", 0);
    d.welcome().await;
    tokio::time::sleep(Duration::from_millis(50)).await;
    assert!(d.drain().is_empty());
    assert!(rows(&db.path, R).is_empty());
}

#[tokio::test]
async fn acts_before_hello_are_refused() {
    let db = temp_db();
    let hub = hub(&db.path, None);
    let mut a = Client::new(&hub);
    a.act(R, 1, "1");
    assert!(matches!(a.recv().await, S2C::Error { code, .. } if code == "not_joined"));
    a.session.handle_text("{not json");
    assert!(matches!(a.recv().await, S2C::Error { code, .. } if code == "bad_message"));
}

#[tokio::test]
async fn websocket_and_health() {
    let db = temp_db();
    let server = sequencer::start(sequencer::Config {
        host: "127.0.0.1".into(),
        port: 0,
        db: db.path.clone(),
        ..Default::default()
    })
    .await
    .unwrap();

    let mut tcp = tokio::net::TcpStream::connect(server.addr).await.unwrap();
    tcp.write_all(b"GET /health HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n").await.unwrap();
    let mut body = String::new();
    tcp.read_to_string(&mut body).await.unwrap();
    assert!(body.starts_with("HTTP/1.1 200"), "{body}");
    assert!(body.contains(r#""ok":true"#));

    let url = format!("ws://{}/ws", server.addr);
    let (mut ws, _) = tokio_tungstenite::connect_async(&url).await.unwrap();
    let send = |m: C2S| Message::Text(encode_c2s(&m).as_ref().into());
    ws.send(send(C2S::Hello { room: R.into(), client: "c".into(), user: "u".into(), have: 0 })).await.unwrap();
    ws.send(send(C2S::Act { room: R.into(), cseq: 1, action: raw(r#"{"a":1}"#) })).await.unwrap();
    ws.send(Message::Text("garbage".into())).await.unwrap();
    let mut got = vec![];
    while got.len() < 3 {
        if let Some(Ok(Message::Text(t))) = ws.next().await {
            got.push(decode_s2c(t.as_str()).unwrap());
        }
    }
    // The error for the garbage frame comes straight from the connection, so it may overtake
    // the room's replies; the welcome still precedes the entry.
    let welcome_at = got.iter().position(|m| matches!(m, S2C::Welcome { head: 0, .. })).unwrap();
    let entry_at = got.iter().position(|m| matches!(m, S2C::Entry { .. })).unwrap();
    assert!(welcome_at < entry_at);
    assert!(got.iter().any(|m| matches!(m, S2C::Entry { entry, .. } if entry.seq == 1 && entry.action.get() == r#"{"a":1}"#)));
    assert!(got.iter().any(|m| matches!(m, S2C::Error { code, .. } if code == "bad_message")));
    server.task.abort();
}
