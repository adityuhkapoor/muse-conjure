`cargo test && cargo clippy --all-targets -- -D warnings`

The sequencer. It puts every action from every client into one ordered, durable log per room
and sends it to everyone in the room. It never looks inside an action. Contract version 2.

- One actor task per loaded room owns that room's `seq`, so ordering needs no locks.
- `(room, client, cseq)` is applied once; a resend gets the original entry back.
- One writer thread commits to SQLite (WAL, synchronous=NORMAL) in groups. An entry is
  broadcast only after its commit returns.
- `eph` messages (typing, presence) are fanned out, last value per (user, key), replayed to
  joiners for 5 s, never stored.
- All wire encoding lives in `src/codec.rs`.

Epoch. The database gets a random id when it is created (table `meta`). Every welcome carries
it: `{ "t":"welcome", "room", "epoch", "head", "entries" }`. A client that sees a new epoch
starts over. A `have` above the head gets every entry from seq 1.

Many rooms per socket. A connection joins any number of rooms with `hello` and sends `act` and
`eph` by `room`. A second hello for the same room replaces the first (new client id, new
`have`). Closing the socket leaves every room. Errors: `not_joined`, `bad_message` (with
`room` when it can be read), `store_failed` (with `room`).

Idle unload. A room with no subscribers and nothing in flight leaves memory after `IDLE_MS`
(default 30000) and is loaded again from SQLite on the next message. In memory a room keeps
its head, last time, rng, the last 256 entries and the dedupe index of clients it has seen;
older catch-up is read from SQLite. Every message reaches a room through the hub under a
shard lock, and a room unloads under that lock only when its mailbox is empty, so a racing
hello or act is never lost and a room never has two actors.

Recovery. If a group commit fails, the room drops what was in flight (and its dedupe
entries), goes back to its durable head, starts a new write generation (the writer skips the
rest of the old one) and sends `store_failed`. Clients resend pending actions; they are
accepted as new. No restart is needed. Test hook: `Store::fail_next_commits(n)`.

Run: `PORT=8787 DB=sync.sqlite cargo run --bin server` (`PORT=0` picks a free port, `HOST`
defaults to 127.0.0.1, `IDLE_MS` sets the idle timeout). The first stdout line is
`listening on <addr> db <path>`. The listener uses SO_REUSEADDR, so a restart can take the
same port right after a kill. WebSocket at `/ws` (or `/`), health at `/health`.
Load check: `cargo run --release --bin bench -- [rooms] [clients] [acts/s per client] [seconds]`.

Tests:
- `tests/server.rs`: dedupe, gap-free seq, durability, catch-up, eph, errors.
- `tests/lifecycle.rs`: epoch kept and renewed, binary restart on the same port and file, many
  rooms on one WebSocket, unload and reload from SQLite, a hello racing an unload, unload and
  reload under concurrent joins, recovery after a failed write.
- `tests/sim.rs`: seeded simulation with several rooms per connection, disconnects, resends,
  idle unloads between phases and an injected write failure (`SIM_SEEDS=n` for more seeds).
