// Browser-side test harness: a minimal host page with an in-page Sequencer (the @muse/sync model
// of the server) standing in for the network. Bundled by harness-build.ts; used by the bridge
// test, the measure script and the gate's render stage. Exposes `window.H`.

import type { C2S, Entry, Member, S2C } from "@muse/protocol";
import { makeTheme } from "@muse/app/internal";
import type { Theme } from "@muse/app";
import { Sequencer, type SequencerConnection } from "@muse/sync/sequencer";
import type { Transport } from "@muse/sync/transport";
import { createPool, type AppHandle, type Pool } from "./host.ts";

export const MEMBERS: Member[] = [
  { id: "maya", name: "Maya" },
  { id: "theo", name: "Theo" },
  { id: "dani", name: "Dani" },
  { id: "priya", name: "Priya" },
  { id: "sam", name: "Sam" },
];

let skew = 0;
const server = new Sequencer({ now: () => Date.now() + skew, seed: 12345 });

/** A transport to the in-page server. Delivery is async, in order. `up` can be cut. */
function link() {
  let conn: SequencerConnection | null = null;
  let h: Parameters<Transport["start"]>[0] | null = null;
  const t: Transport & { cut(): void; restore(): void } = {
    start(x) {
      h = x;
      t.restore();
    },
    send(m: C2S) {
      const c = conn;
      if (c) queueMicrotask(() => c.receive(m));
    },
    stop() {
      conn?.close();
      conn = null;
    },
    cut() {
      conn?.close();
      conn = null;
      h?.close();
    },
    restore() {
      if (conn || !h) return;
      const x = h;
      const c = server.connect((m: S2C) => queueMicrotask(() => c === conn && x.message(m)));
      conn = c;
      queueMicrotask(() => x.open());
    },
  };
  return t;
}

type Mounted = {
  handle: AppHandle;
  room: string;
  link: ReturnType<typeof link>;
  errors: string[];
  sizes: number[];
  summaries: string[];
  sent: C2S[];
  t0: number;
};

const mounted = new Map<number, Mounted>();
let pool: Pool | undefined;
let nextId = 1;
const others = new Map<string, { conn: SequencerConnection; cseq: number }>();

export type MountOpts = {
  me?: string;
  members?: Member[];
  mode?: Theme["mode"];
  width?: number;
  surface?: Theme["surface"];
  room?: string;
  debug?: boolean;
  /** Put the frame in this element (by id) instead of a fresh one in #slot. */
  into?: string;
  /** Keep frames mounted earlier. */
  keep?: boolean;
};

const H = {
  members: MEMBERS,
  frameUrl: "" as string,
  async makePool(size: number, o: { srcdoc?: boolean; layer?: boolean } = {}) {
    pool?.destroy();
    pool = createPool({ size, ...(o.srcdoc || !H.frameUrl ? {} : { frameUrl: H.frameUrl }), ...(o.layer ? { layer: true } : {}) });
    await pool.ready();
    return pool.mode;
  },
  poolReady: () => pool!.ready(),
  ticking: () => pool!.ticking,
  /** Mount compiled code; resolves when the app reports its first size. */
  async mount(code: string, o: MountOpts = {}) {
    if (!o.keep) for (const id of [...mounted.keys()]) H.destroy(id);
    const id = nextId++;
    const room = o.room ?? `a:test-${id}`;
    const slot = o.into ? document.getElementById(o.into)! : document.getElementById("slot")!;
    const el = document.createElement("div");
    slot.append(el);
    const me = o.me ?? "maya";
    const l = link();
    const t0 = performance.timeOrigin + performance.now();
    const handle = pool!.mount(el, {
      code,
      room,
      me,
      client: `c-${me}-${id}`,
      members: o.members ?? MEMBERS,
      theme: makeTheme(o.mode ?? "light", o.width ?? 390, o.surface ?? "chat"),
      transport: l,
      ...(o.debug ? { debug: true } : {}),
    });
    handle.frame.setAttribute("data-h", String(id));
    const m: Mounted = { handle, room, link: l, errors: [], sizes: [], summaries: [], sent: [], t0 };
    mounted.set(id, m);
    handle.onError((e) => m.errors.push(e.message));
    handle.onSummary((s) => m.summaries.push(s));
    handle.onSend((c) => m.sent.push(c));
    const first = new Promise<number>((r) => {
      handle.onSize((h) => (m.sizes.push(h), r(performance.timeOrigin + performance.now())));
      // A frame that cannot show its tool will not report a size.
      handle.onError((e) => e.fatal && setTimeout(() => r(m.sizes.length ? performance.timeOrigin + performance.now() : -1), 50));
    });
    const sized = await Promise.race([first, new Promise<number>((r) => setTimeout(() => r(-1), 8000))]);
    return { id, room, t0, sized, placement: handle.placement };
  },
  /** Someone else acts in a room, straight to the server. `ago` backdates the server clock. */
  act(room: string, user: string, action: unknown, ago = 0) {
    const key = `${room}\u0000${user}`;
    let o = others.get(key);
    if (!o) {
      o = { conn: server.connect(() => {}), cseq: 0 };
      o.conn.receive({ t: "hello", room, client: `other-${user}-${room}`, user, have: 0 });
      others.set(key, o);
    }
    skew = -ago;
    o.conn.receive({ t: "act", room, cseq: ++o.cseq, action });
    skew = 0;
    return Date.now();
  },
  log: (room: string): readonly Entry[] => server.log(room),
  /** Cut the frame's socket, or bring it back (the frame then says hello and resends). */
  cut: (id: number) => mounted.get(id)!.link.cut(),
  restore: (id: number) => mounted.get(id)!.link.restore(),
  setTheme: (id: number, mode: Theme["mode"], width = 390) => mounted.get(id)!.handle.setTheme(makeTheme(mode, width)),
  setMembers: (id: number, members: Member[]) => mounted.get(id)!.handle.setMembers(members),
  state(id: number) {
    const m = mounted.get(id)!;
    const acts = m.sent.filter((c) => c.t === "act").map((c) => (c as { action: unknown }).action);
    return { errors: m.errors, sizes: m.sizes, summaries: m.summaries, acts, height: m.handle.frame.style.height, room: m.room };
  },
  frameIndex: (id: number) => [...document.querySelectorAll("iframe")].indexOf(mounted.get(id)!.handle.frame),
  destroy(id: number) {
    mounted.get(id)?.handle.destroy();
    mounted.delete(id);
  },
  destroyAll() {
    for (const id of [...mounted.keys()]) H.destroy(id);
  },
  now: () => performance.timeOrigin + performance.now(),
};

(window as unknown as { H: typeof H }).H = H;
export type Harness = typeof H;
