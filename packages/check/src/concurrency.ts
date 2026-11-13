// Concurrency, exhaustively within a bound: for every explored state up to `concurrencyDepth`
// and every pair (and triple) of actions enabled for different people, every order the server
// could sequence them in, with each client having applied its own action optimistically first.
// It runs through the real `ReplicaCore` and `Sequencer` from packages/sync, joined by links
// this harness drives one message at a time.

import type { C2S, S2C } from "../../protocol/src/index.ts";
import { ReplicaCore, Sequencer, type Transport, type TransportHandlers } from "../../sync/src/index.ts";
import { canonical } from "../../verify/src/json.ts";
import type { Node, Search } from "./check.ts";
import { errText, type Meta, ROOM, T0, type World } from "./model.ts";
import type { Failure, Profile, TraceStep } from "./report.ts";

class Link implements Transport {
  h!: TransportHandlers;
  up: C2S[] = [];
  down: S2C[] = [];
  conn: { receive(m: C2S): void; close(): void } | null = null;
  start(h: TransportHandlers) {
    this.h = h;
  }
  send(m: C2S) {
    if (this.conn) this.up.push(m);
  }
  stop() {}
}

export type SequencerFactory = (opts: { seed: number; now: () => number }) => Sequencer;
let makeSequencer: SequencerFactory = (o) => new Sequencer(o);
/** Tests swap in a broken sequencer to see the duplicate check fail. */
export function setSequencer(f: SequencerFactory | null) {
  makeSequencer = f ?? ((o) => new Sequencer(o));
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

type Move = { user: string; action: unknown };

export function concurrency(S: Search, p: Profile) {
  const out = { states: 0, combos: 0, independent: 0, orders: 0, capped: false, nonCommuting: 0, silent: 0 };
  const tool = S.tool;
  const T = (n: Node) => T0 + S.ticks()[n.tick]!;
  let left = p.maxCombos;
  const started = performance.now();
  for (const n of S.nodes) {
    if (!n.expanded || n.depth > p.concurrencyDepth) continue;
    if (left <= 0 || performance.now() - started > p.budgetMs * 0.6) {
      out.capped = true;
      break;
    }
    const users = [...n.enabled.keys()].filter((u) => n.enabled.get(u)!.length);
    if (users.length < 2) continue;
    out.states++;
    const combos: Move[][] = [];
    const memo = new Map<string, boolean>();
    // Partial-order reduction: a pair whose two orders fold to the same state (with server-like
    // seq numbers and seeds by position) can only show states the search already checked, so it
    // needs no replica run. A triple runs only when all three of its pairs conflict: an action that
    // commutes with both others adds nothing the pair runs miss.
    const moves = new Map(users.map((u) => [u, n.enabled.get(u)!.map((a) => ({ user: u, action: a }))]));
    const dep = (x: Move, y: Move) => !commutes(S, n, T(n), x, y, memo);
    let pairChecks = 0;
    const pairBudget = left * 20;
    const pairs: Move[][] = [];
    outer: for (let i = 0; i < users.length; i++)
      for (let j = i + 1; j < users.length; j++)
        for (const x of moves.get(users[i]!)!)
          for (const y of moves.get(users[j]!)!) {
            if (++pairChecks > pairBudget) {
              out.capped = true;
              break outer;
            }
            if (dep(x, y)) pairs.push([x, y]);
            else out.independent++;
          }
    combos.push(...pairs);
    if (p.triples && users.length >= 3) {
      const conflicts = new Map<Move, Move[]>();
      for (const [x, y] of pairs) {
        if (!conflicts.has(x!)) conflicts.set(x!, []);
        conflicts.get(x!)!.push(y!);
      }
      const order = new Map(users.map((u, i) => [u, i]));
      tri: for (const [x, ys] of conflicts)
        for (const y of ys)
          for (const z of conflicts.get(y) ?? []) {
            if (order.get(z.user)! <= order.get(y.user)!) continue;
            if (!(conflicts.get(x) ?? []).includes(z)) continue;
            combos.push([x, y, z]);
            if (combos.length > left * 4) break tri;
          }
    }
    // Pairs first, then triples; the cap is honest: it makes the result bounded.
    // One budget for the whole tool, spent on the shallowest states first. Running out is
    // reported (the result is then bounded), never silent.
    let used = combos;
    if (combos.length > left) {
      out.capped = true;
      used = spread(combos, left);
    }
    left -= used.length;
    for (const combo of used) {
      out.combos++;
      const finals = new Map<string, string>();
      for (const order of permutations(combo.map((_, i) => i))) {
        out.orders++;
        const r = runOrder(S, n, combo, order, out.orders === 1 || order.length === 2);
        if (!r) continue;
        finals.set(order.join(), r.final);
        // Silent lost update: the second of a pair saw its action work, and the server's order
        // left no trace of it in confirmed state.
        if (combo.length === 2 && r.silent) {
          out.silent++;
          const { winner: w, loser: l } = r.silent;
          S.fail(
            "silent-conflict",
            {
              rule: "silent-conflict",
              message: `${l.user}'s ${JSON.stringify(l.action)} showed at once on their screen, then lost to ${w.user}'s ${JSON.stringify(w.action)}; confirmed state keeps no record that it was rejected`,
              trace: r.trace,
              detail: { loser: l.user, lost: l.action, winner: w.user, won: w.action },
            },
            true,
          );
        }
      }
      if (new Set(finals.values()).size > 1) out.nonCommuting++;
    }
  }
  pendingSeed(S, p);
  return out;
}

function spread<T>(xs: T[], k: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < k; i++) out.push(xs[Math.floor((i * xs.length) / k)]!);
  return out;
}

function runOrder(S: Search, n: Node, combo: Move[], order: number[], dupCheck: boolean): { final: string; silent: { loser: Move; winner: Move } | null; trace: TraceStep[] } | null {
  const tool = S.tool;
  const time = T0 + S.ticks()[n.tick]!;
  const prefix = S.trace(n.id);
  const trace: TraceStep[] = [...prefix];
  let bad: string | null = null;
  const reducer = {
    init: () => n.w,
    reduce: (w: World, a: unknown, m: Meta) => {
      const r = tool.reduce(w, a, m, false);
      if (!r.ok) throw ((bad ??= `${r.rule}: ${r.message}`), new Error(r.message));
      return r.w;
    },
  };
  const server = makeSequencer({ seed: 7, now: () => time });
  // Pad the log so seq numbers continue from this state's depth (ids come from meta.seq).
  const pad = server.connect(() => {});
  pad.receive({ t: "hello", room: ROOM, client: "pad", user: "host", have: 0 });
  const head = n.depth + 1;
  for (let i = 0; i < head; i++) pad.receive({ t: "act", room: ROOM, cseq: i + 1, action: { t: "@pad" } });
  const peers = combo.map((mv) => {
    const link = new Link();
    const r = new ReplicaCore<World>(reducer, link, { room: ROOM, user: mv.user, client: `c-${mv.user}`, now: () => time });
    link.conn = server.connect((m) => link.down.push(m));
    link.h.open();
    while (link.up.length) link.conn.receive(link.up.shift()!);
    while (link.down.length) link.h.message(link.down.shift()!);
    return { r, link, mv };
  });
  let glitch: Failure | null = null;
  const seen = (label: string): boolean => {
    for (const q of peers) {
      const conf = q.r.confirmed, st = q.r.state;
      const bc = tool.brokenInvariants(conf);
      if (bc.length) {
        glitch = null;
        S.fail("race", { rule: "race", message: `under concurrent actions, invariant "${bc[0]!.name}" ${bc[0]!.why} on ${q.mv.user}'s confirmed state (${label})`, trace: [...trace], detail: { invariant: bc[0]!.name, state: canonical(conf.s).slice(0, 400) } });
        return false;
      }
      if (st !== conf) {
        const bs = tool.brokenInvariants(st);
        if (bs.length && !glitch)
          glitch = { rule: "optimistic-glitch", message: `invariant "${bs[0]!.name}" ${bs[0]!.why} on ${q.mv.user}'s screen while their action was pending (${label}); confirmed state is fine, so it flickers`, trace: [...trace], detail: { invariant: bs[0]!.name, state: canonical(st.s).slice(0, 400) } };
      }
    }
    return true;
  };
  try {
    for (const q of peers) {
      trace.push({ step: "act", user: q.mv.user, action: q.mv.action });
      q.r.dispatch(q.mv.action);
    }
    if (!seen("after everyone tapped")) return null;
    for (const i of order) {
      const q = peers[i]!;
      const m = q.link.up.shift()!;
      trace.push({ step: "deliver", user: q.mv.user, cseq: m.t === "act" ? m.cseq : 0 });
      q.link.conn!.receive(m);
      // A resend of the same (client, cseq), as after a reconnect: the server must dedupe it.
      if (dupCheck) {
        S.count("duplicate");
        q.link.conn!.receive(m);
      }
    }
    for (const q of peers) {
      while (q.link.down.length) {
        const m = q.link.down.shift()!;
        if (m.t === "entry") trace.push({ step: "receive", user: q.mv.user, seq: m.entry.seq });
        q.link.h.message(m);
        if (!seen(`after ${q.mv.user} received an entry`)) return null;
      }
    }
  } catch (e) {
    S.fail("convergence", { rule: "convergence", message: `the replica run failed: ${bad ?? errText(e)}`, trace });
    return null;
  }
  if (glitch) S.fail("optimistic-glitch", glitch);
  S.count("race");
  S.count("optimistic-glitch");
  S.count("convergence");
  if (bad) {
    S.fail("convergence", { rule: "convergence", message: bad, trace });
    return null;
  }
  // Straight fold of the server's order.
  const log = server.log(ROOM).slice(head);
  if (log.length !== combo.length) {
    S.fail("duplicate", { rule: "duplicate", message: `the server log holds ${log.length} entries for ${combo.length} actions: a resend was applied twice`, trace });
  }
  let w = n.w;
  const states: World[] = [];
  for (const e of log) {
    const r = tool.reduce(w, e.action, { seq: e.seq, user: e.user, time: e.time, seed: e.seed }, false);
    if (!r.ok) return null;
    w = r.w;
    states.push(w);
  }
  const want = canonical(w);
  for (const q of peers) {
    if (canonical(q.r.confirmed) !== want || canonical(q.r.state) !== want || q.r.pending.length) {
      S.fail("convergence", { rule: "convergence", message: `${q.mv.user}'s replica ended different from a straight fold of the server's order`, trace, detail: { replica: canonical(q.r.state.s).slice(0, 300), fold: canonical(w.s).slice(0, 300) } });
      return null;
    }
  }
  let silent: { loser: Move; winner: Move } | null = null;
  if (combo.length === 2 && log.length === 2) {
    const first = peers[order[0]!]!.mv, second = peers[order[1]!]!.mv;
    const e = log;
    const only = (mv: Move, i: number) => tool.reduce(n.w, mv.action, { seq: e[i]!.seq, user: mv.user, time: e[i]!.time, seed: e[i]!.seed }, false);
    const sawIt = (mv: Move) => {
      const r = tool.reduce(n.w, mv.action, { seq: head + 1, user: mv.user, time, seed: 0 }, false);
      return r.ok && r.canon !== canonical(n.w);
    };
    // The second vanished: the end state is what the first alone gives.
    if (sawIt(second) && canonical(states[0]) === want) silent = { loser: second, winner: first };
    else {
      // The first vanished: the end state is what the second alone gives (at the first seq).
      const o = only(second, 0);
      if (sawIt(first) && o.ok && o.canon === want && want !== canonical(n.w)) silent = { loser: first, winner: second };
    }
  }
  return { final: want, silent, trace };
}

/**
 * The view must show anything seed-driven from `confirmed` while pending. Render the actor's view
 * with the pending action folded under two different seeds; if the text differs, the screen shows
 * a result from the local seed 0 that the server's seed will then replace.
 */
function pendingSeed(S: Search, p: Profile) {
  const tool = S.tool;
  const view = tool.app.view;
  if (!S.seedSensitive || typeof view !== "function") return;
  const theme = tool.L.toRealm(themeLike());
  for (const n of S.nodes) {
    if (!n.expanded || n.depth > p.concurrencyDepth) continue;
    for (const [user, acts] of n.enabled) {
      for (const a of acts) {
        const time = T0 + S.ticks()[n.tick]!;
        const m = (seed: number) => ({ seq: n.depth + 2, user, time, seed });
        const r0 = tool.reduce(n.w, a, m(0), false), r1 = tool.reduce(n.w, a, m(0x2545f491), false);
        if (!r0.ok || !r1.ok || r0.canon === r1.canon) continue;
        S.count("pending-seed");
        const text = (w: World) =>
          viewText(() => {
            const props = tool.L.toRealm({ state: w.s, confirmed: n.w.s, pending: true, me: user, members: w.members, local: tool.app.local ?? {} }) as Record<string, unknown>;
            Object.assign(props, { theme, dispatch: () => {}, setLocal: () => {} });
            return view(props);
          });
        const t0 = text(r0.w), t1 = text(r1.w);
        if (t0 !== null && t1 !== null && t0 !== t1) {
          S.fail("pending-seed", {
            rule: "pending-seed",
            message: `while ${user}'s ${JSON.stringify(a)} is pending, their screen shows a seed-driven result from the local seed 0 (it changes with the seed); others see the server's. Show it from confirmed, with a neutral state while pending.`,
            trace: [...S.trace(n.id), { step: "act", user, action: a }],
            detail: { seed0: t0.slice(0, 200), other: t1.slice(0, 200) },
          });
          return;
        }
      }
    }
  }
}

function themeLike() {
  return {
    mode: "light",
    width: 393,
    surface: "chat",
    color: Object.fromEntries(["primary", "onPrimary", "link", "text", "secondaryText", "disabledText", "card", "wash", "input", "divider", "secondaryButton", "secondaryButtonText", "deemphasizedButton", "deemphasizedButtonText", "track", "selected", "hover", "pressed", "positive", "negative", "warning", "toast", "onToast", "series1", "series2", "series3", "series4", "series5", "series6"].map((k) => [k, "c"])),
    radius: { card: 12, richCard: 18, button: 8, input: 12, pill: 999 },
    space: { card: 12 },
    type: { family: "system-ui", body: 15, meta: 13, title: 17, headline: 20 },
    motion: { fast: 200, slow: 400 },
    people: Array.from({ length: 12 }, () => "c"),
  };
}

/** Text a vnode tree shows: strings, numbers and label-like props, expanding function components. */
function viewText(render: () => unknown): string | null {
  let root: unknown;
  try {
    root = render();
  } catch {
    return null;
  }
  const out: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 60 || v === null || v === undefined || v === false || v === true) return;
    if (typeof v === "string" || typeof v === "number") return void out.push(String(v));
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
    if (typeof v !== "object") return;
    const o = v as { type?: unknown; props?: Record<string, unknown>; children?: unknown };
    const props = o.props ?? {};
    if (typeof o.type === "function") {
      let r: unknown;
      try {
        r = (o.type as (p: unknown) => unknown)({ ...props, children: o.children ?? props.children });
      } catch {
        return;
      }
      return walk(r, depth + 1);
    }
    for (const k of ["label", "title", "subtitle", "aria-label", "actor", "value", "count"]) if (typeof props[k] === "string" || typeof props[k] === "number") out.push(`${k}=${props[k]}`);
    walk(o.children ?? props.children, depth + 1);
  };
  walk(root, 0);
  return out.join("|");
}

function commutes(S: Search, n: Node, time: number, x: Move, y: Move, memo: Map<string, boolean>): boolean {
  const k = canonical([x, y]);
  const hit = memo.get(k);
  if (hit !== undefined) return hit;
  const tool = S.tool;
  const seq = n.depth + 2;
  // The server gives each position its own seed: the first and second seed by position.
  const s1 = S.seeds[0]!, s2 = S.seeds[1] ?? (S.seeds[0]! ^ 0x5bd1e995) >>> 0;
  const fold = (a: Move, b: Move) => {
    const r1 = tool.reduce(n.w, a.action, { seq, user: a.user, time, seed: s1 }, false);
    if (!r1.ok) return null;
    const r2 = tool.reduce(r1.w, b.action, { seq: seq + 1, user: b.user, time, seed: s2 }, false);
    return r2.ok ? r2.canon : null;
  };
  const ab = fold(x, y), ba = fold(y, x);
  // Each action must also do the same thing whether it goes first or second (seq aside).
  const r = ab !== null && ab === ba;
  memo.set(k, r);
  return r;
}
