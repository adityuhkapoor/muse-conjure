import { afterAll, beforeAll, expect, test } from "bun:test";
import { shutdown, warm } from "@muse/verify";
import { ASKS } from "../eval/asks.ts";
import { ReplayClient } from "../src/models/replay.ts";
import { makeServer, parseRequest } from "../src/serve.ts";

let server: ReturnType<typeof makeServer>;
beforeAll(async () => {
  await warm();
  server = makeServer({ port: 0, model: new ReplayClient() });
});
afterAll(async () => {
  server.stop(true);
  await shutdown();
});

test("GET /health", async () => {
  const r = await fetch(`http://127.0.0.1:${server.port}/health`);
  expect(await r.json()).toMatchObject({ ok: true, model: "replay" });
});

test("POST /generate streams progress and ends with the app", async () => {
  const a = ASKS.find((x) => x.id === "where-eating")!;
  const r = await fetch(`http://127.0.0.1:${server.port}/generate`, {
    method: "POST",
    body: JSON.stringify({ ask: a.ask, chat: a.chat, members: a.members, surface: a.surface }),
  });
  expect(r.headers.get("content-type")).toContain("text/event-stream");
  const text = await r.text();
  const events = [...text.matchAll(/event: (\w+)\ndata: (.*)\n\n/g)].map((m) => ({ event: m[1], data: JSON.parse(m[2]!) }));
  const progress = events.filter((e) => e.event === "progress").map((e) => e.data.t);
  expect(progress[0]).toBe("understanding");
  expect(progress).toContain("checking");
  expect(progress.at(-1)).toBe("ready");
  const done = events.at(-1)!;
  expect(done.event).toBe("done");
  expect(done.data.source).toContain("defineApp");
  expect(typeof done.data.name).toBe("string");
  expect(typeof done.data.summary).toBe("string");
  // compiled on the server: no types, no JSX, imports @muse/app
  expect(done.data.code).toContain("@muse/app");
  expect(done.data.code).not.toContain(": State");
}, 60_000);

const sse = async (r: Response) => [...(await r.text()).matchAll(/event: (\w+)\ndata: (.*)\n\n/g)].map((m) => ({ event: m[1], data: JSON.parse(m[2]!) }));
const post = (port: number, body: unknown) => fetch(`http://127.0.0.1:${port}/generate`, { method: "POST", body: JSON.stringify(body) });
const members = [{ id: "noa", name: "Noa" }, { id: "maya", name: "Maya" }];

test("a library piece named by the shell is filled without a model", async () => {
  const events = await sse(await post(server.port!, { ask: "who's in", members, piece: "lock", params: { title: "Who's in", detail: "Meridian Hall", need: 0 } }));
  const done = events.at(-1)!;
  expect(done.event).toBe("done");
  expect(done.data.path).toBe("reuse");
  expect(done.data.model).toBe("library");
  expect(done.data.source).toContain('"title": "Who\'s in"');
  expect(done.data.code.length).toBeGreaterThan(100);
}, 60_000);

test("one build per chat at a time, and gate runs never overlap", async () => {
  let running = 0;
  let overlap = false;
  const gated = makeServer({
    port: 0,
    model: new ReplayClient(),
    gate: async (s) => {
      running++;
      if (running > 1) overlap = true;
      await Bun.sleep(150);
      running--;
      const { verify } = await import("@muse/verify");
      return verify(s);
    },
  });
  try {
    const body = (chatId: string) => ({ ask: "who's in", members, piece: "lock", chatId });
    const a = post(gated.port!, body("c1"));
    await Bun.sleep(20);
    const busy = await post(gated.port!, body("c1"));
    expect(busy.status).toBe(409);
    const b = post(gated.port!, body("c2"));
    const [ra, rb] = await Promise.all([a, b]);
    const [ea, eb] = await Promise.all([sse(ra), sse(rb)]);
    expect(ea.at(-1)!.event).toBe("done");
    expect(eb.at(-1)!.event).toBe("done");
    expect(eb.some((e) => e.data.t === "queued") || ea.some((e) => e.data.t === "queued")).toBe(true);
    expect(overlap).toBe(false);
    // the chat is free again afterwards
    expect((await post(gated.port!, body("c1"))).status).toBe(200);
  } finally {
    gated.stop(true);
  }
}, 60_000);

test("bad requests get a 400 with a reason", async () => {
  const r = await fetch(`http://127.0.0.1:${server.port}/generate`, { method: "POST", body: JSON.stringify({ ask: "" }) });
  expect(r.status).toBe(400);
  expect(parseRequest({ ask: "x", members: [{ id: "a", name: "A" }], surface: "moon" })).toContain("surface");
  expect(parseRequest({ ask: "x", members: [{ id: "a", name: "A" }], piece: "nope" })).toContain("library");
});
