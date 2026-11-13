`bun test`

The client side of sync. `createReplica(reducer, transport, opts)` keeps a room's state in
step with the server's log and responds to local actions at once.

- `confirmed` is a fold of the log in seq order. `state` is `confirmed` with pending actions
  replayed on top using predicted Meta (`seq = head + i`, local time, seed 0).
- Entries that arrive early are buffered until the gap fills; duplicates are ignored. A
  reconnect sends `hello` with `have`, and pending actions are resent after the welcome.
- A welcome with a new `epoch` (the server got a new database) drops confirmed state and the
  pending queue and starts over. `store_failed` resends pending after a short wait.
- `Transport` is an interface. `sharedSocket(url).transport(room)` multiplexes many rooms on one
  WebSocket with reconnect; `wsTransport(url)` is one socket for one replica.
- `Sequencer` is an in-memory model of the server's ordering rules for other packages' tests.

Tests: `test/sync.test.ts` runs fast-check model-based properties with `fc.scheduler()` over a
faulty simulated network (`SYNC_RUNS=n` for more runs). `test/fixtures/broken.ts` holds broken
variants (including a replica that ignores a new epoch, and one that never resends) that
`test/fixtures.test.ts` requires the properties to catch. A second property run adds database
wipes and write failures.
End to end against the real server (5 shared sockets, 2 rooms each, a server kill): `bun run e2e`. Type check: `bun run check`.
