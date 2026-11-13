// Explicit-state check of one tool: breadth-first over canonical world hashes, so the first
// counterexample found for a property is a shortest one in the explored space.

import { canonical } from "../../verify/src/json.ts";
import { concurrency } from "./concurrency.ts";
import {
  classify,
  errText,
  expand,
  garbageFor,
  hash64,
  load,
  type Member,
  type Meta,
  pool,
  RESET,
  spreadSeeds,
  stringsOf,
  T0,
  Tool,
  type World,
} from "./model.ts";
import { type CheckReport, type Failure, PROFILES, type Profile, type PropertyId, type PropertyResult, type TraceStep } from "./report.ts";

export type { CheckReport, Failure, Profile, PropertyResult, TraceStep } from "./report.ts";
export { PROFILES } from "./report.ts";

export type CheckOptions = Partial<Profile> & { profile?: "default" | "deep"; name?: string };

export type Node = {
  id: number;
  w: World;
  canon: string;
  tick: number;
  depth: number;
  parent: number;
  via: TraceStep | null;
  /** How the node was first reached. */
  edge: "root" | "act" | "leave" | "join" | "wait";
  expanded: boolean;
  /** Distinct successor ids through members' actions and waiting (for deadlock and goal). */
  succ: number[];
  /** Members' actions that changed state here, by user (seed 0, for the concurrency check). */
  enabled: Map<string, unknown[]>;
  changing: number;
  waitTo: number;
  finished: boolean;
  /** Invariants that do not hold here. */
  broken: string[];
};

type Enum = { actions: unknown[]; seeds: number; capped: boolean; missing: number };

export class Search {
  nodes: Node[] = [];
  index = new Map<string, number>();
  fails = new Map<PropertyId, Failure>();
  warns = new Map<PropertyId, Failure>();
  checked = new Map<PropertyId, number>();
  transitions = 0;
  enumCache = new Map<string, Enum>();
  knownCache = new Map<string, Set<string>>();
  concLeft = 0;
  reps = new Map<string, number>();
  derivations: Enum[] = [];
  seeds: number[];
  people: Member[];
  timeSensitive = false;
  seedSensitive = false;
  probe = 0;
  boundHit: string[] = [];
  leaverRefs = 0;

  constructor(readonly tool: Tool, readonly p: Profile, flags: { time: boolean; seed: boolean }) {
    this.seeds = spreadSeeds(tool.L, p.seeds);
    this.people = pool(p.users);
    this.timeSensitive = flags.time;
    this.seedSensitive = flags.seed;
  }

  count(id: PropertyId, n = 1) {
    this.checked.set(id, (this.checked.get(id) ?? 0) + n);
  }

  trace(id: number): TraceStep[] {
    const out: TraceStep[] = [];
    for (let n = this.nodes[id]!; n.parent >= 0; n = this.nodes[n.parent]!) if (n.via) out.push(n.via);
    return out.reverse();
  }

  fail(id: PropertyId, f: Failure, warn = false) {
    const m = warn ? this.warns : this.fails;
    if (!m.has(id)) m.set(id, f);
  }

  ticks(): number[] {
    return this.timeSensitive ? this.p.ticks : [0];
  }

  meta(n: Node, user: string, seed: number): Meta {
    return { seq: n.depth + 2, user, time: T0 + this.ticks()[n.tick]!, seed };
  }

  key(w: World, canon: string, tick: number) {
    return hash64(canon) + ":" + tick;
  }

  /** The actions to try for this user here: declared, or derived from arbitrary until saturated. */
  enumerate(w: World, canon: string, user: string, at: TraceStep[] | (() => TraceStep[])): Enum {
    const ck = hash64(canon) + "|" + user;
    const hit = this.enumCache.get(ck);
    if (hit) return hit;
    const app = this.tool.app;
    const ctx = this.tool.ctx(w.members);
    let known = this.knownCache.get(canon);
    if (!known) {
      known = stringsOf(w.s);
      for (const m of this.people) (known.add(m.id), known.add(m.name));
      this.knownCache.clear();
      this.knownCache.set(canon, known);
    }
    const classes = new Map<string, { a: unknown; raws: unknown[]; slots: ReturnType<typeof classify>["slots"]; n: number }>();
    let seeds = 0, capped = false, samples = 0;
    const add = (a: unknown) => {
      if (a === null || a === undefined) return;
      samples++;
      const c = classify(a, known);
      const e = classes.get(c.key);
      if (e) e.n++;
      else classes.set(c.key, { a: JSON.parse(JSON.stringify(a)), raws: [], slots: c.slots, n: 1 });
      // Keep a few raw values too: a free-looking string may be an enum ("S", "M", "L").
      const cl = classes.get(c.key)!;
      if (c.slots.length && cl.raws.length < 3) {
        const raw = JSON.parse(JSON.stringify(a));
        if (!cl.raws.some((x) => canonical(x) === canonical(raw))) cl.raws.push(raw);
      }
      return !e;
    };
    try {
      if (typeof app.actions === "function") {
        const list = app.actions(w.s, user, ctx);
        if (Array.isArray(list)) for (const a of list) add(JSON.parse(JSON.stringify(a)));
      } else if (typeof app.arbitrary === "function") {
        let since = 0;
        for (let i = 0; ; i++) {
          if (i >= this.p.saturateCap) {
            capped = true;
            break;
          }
          if (since >= this.p.saturateK) break;
          seeds++;
          const r = this.tool.L.rng((Math.imul(i + 1, 0x9e3779b1) ^ 0x5bd1e995) >>> 0);
          const a = app.arbitrary(w.s, user, r, ctx);
          const fresh = add(a === undefined ? null : a);
          since = fresh ? 0 : since + 1;
        }
      }
    } catch (e) {
      this.fail("arbitrary", { rule: "arbitrary", message: `${typeof app.actions === "function" ? "actions" : "arbitrary"} threw for ${user}: ${errText(e)}`, trace: typeof at === "function" ? at() : at });
    }
    const actions: unknown[] = [];
    for (const [k, c] of classes) actions.push(...(c.slots.length ? dedupe([...c.raws, ...expand(c.a, c.slots, w.s, this.reps, k)]) : [c.a]));
    let f1 = 0;
    for (const c of classes.values()) if (c.n === 1) f1++;
    const out: Enum = { actions, seeds, capped, missing: samples ? f1 / samples : 0 };
    this.enumCache.set(ck, out);
    if (typeof app.actions !== "function") this.derivations.push(out);
    return out;
  }

  /** Add or find a node; checks state properties on first discovery. */
  visit(w: World, canon: string, tick: number, parent: Node | null, via: TraceStep | null, edge: Node["edge"]): Node {
    const k = this.key(w, canon, tick);
    const got = this.index.get(k);
    if (got !== undefined) return this.nodes[got]!;
    const n: Node = {
      id: this.nodes.length,
      w,
      canon,
      tick,
      depth: parent ? parent.depth + 1 : 0,
      parent: parent ? parent.id : -1,
      via,
      edge,
      expanded: false,
      succ: [],
      enabled: new Map(),
      changing: 0,
      waitTo: -1,
      finished: this.tool.finished(w),
      broken: [],
    };
    this.nodes.push(n);
    this.index.set(k, n.id);
    for (const name of this.tool.invariantNames()) this.count(`invariant:${name}`);
    const broken = this.tool.brokenInvariants(w);
    n.broken = broken.map((b) => b.name);
    // Report the step that breaks an invariant, not states that inherit the breakage.
    const before = new Set(parent?.broken ?? []);
    for (const b of broken) {
      if (before.has(b.name)) continue;
      const id: PropertyId = edge === "leave" ? "membership-leave" : `invariant:${b.name}`;
      this.fail(id, {
        rule: edge === "leave" ? "membership-leave" : "invariant",
        message: `invariant "${b.name}" ${b.why}${edge === "leave" ? " after someone left" : ""}`,
        trace: this.trace(n.id),
        detail: { invariant: b.name, state: canonical(w.s).slice(0, 400) },
      });
    }
    return n;
  }

  /** Expand one node: every user's actions under every seed, garbage, membership, waiting. */
  expand(n: Node) {
    n.expanded = true;
    const succ = new Set<number>();
    const memberIds = new Set(n.w.members.map((m) => m.id));
    const lazyTrace = () => this.trace(n.id);
    const seeds = this.seedSensitive ? this.seeds : [this.seeds[0]!];
    const transNames = this.tool.transitionNames();
    let firstMemberActs: unknown[] | null = null;
    for (const person of this.people) {
      const user = person.id;
      const member = memberIds.has(user);
      const en = this.enumerate(n.w, n.canon, user, lazyTrace);
      if (member && !firstMemberActs) firstMemberActs = en.actions;
      const enabled: unknown[] = [];
      for (const a of en.actions) {
        for (const seed of seeds) {
          const meta = this.meta(n, user, seed);
          const step: TraceStep = { step: "act", user, action: a, seq: meta.seq, time: meta.time, seed };
          const r = this.tool.reduce(n.w, a, meta, true, n.canon);
          this.transitions++;
          this.count("purity");
          this.count("reduce-throws");
          if (!r.ok) {
            this.fail(r.rule === "json" ? "json" : "purity", { rule: r.rule, message: r.message, trace: [...lazyTrace(), step], ...(r.detail ? { detail: r.detail } : {}) });
            continue;
          }
          if (r.threw) {
            this.fail("reduce-throws", { rule: "reduce-throws", message: `reduce threw on an action from ${this.tool.app.actions ? "actions" : "arbitrary"}: ${(r as { error?: string }).error}`, trace: [...lazyTrace(), step] });
            continue;
          }
          for (const name of transNames) this.count(`transition:${name}`);
          for (const b of this.tool.brokenTransitions(n.w, r.w, a, meta))
            this.fail(`transition:${b.name}`, { rule: "transition", message: `transition "${b.name}" ${b.why}`, trace: [...lazyTrace(), step], detail: { transition: b.name } });
          if (r.canon === n.canon) continue;
          if (seed === seeds[0]) this.probeSensitivity(n, a, user, r.canon);
          if (member) {
            if (seed === seeds[0]) enabled.push(a);
            n.changing++;
            if (n.finished && !RESET.test(String((a as { t?: unknown }).t)))
              this.fail("finished-frozen", { rule: "finished-frozen", message: `the tool reads as finished, but "${String((a as { t?: unknown }).t)}" by ${user} still changes it`, trace: [...lazyTrace(), step] }, !this.tool.finishedDeclared());
          }
          if (n.finished) this.count("finished-frozen");
          const m = this.visit(r.w, r.canon, n.tick, n, step, "act");
          if (member) succ.add(m.id);
        }
      }
      if (member) n.enabled.set(user, enabled);
    }
    // Garbage, from the first member: may be dropped, ignored or applied, never breaks an invariant.
    const g = n.w.members[0];
    if (g && firstMemberActs) {
      for (const a of garbageFor(firstMemberActs)) {
        const meta = this.meta(n, g.id, this.seeds[0]!);
        const r = this.tool.reduce(n.w, a, meta, false, n.canon);
        this.count("garbage-breaks-invariant");
        const step: TraceStep = { step: "garbage", user: g.id, action: a };
        if (!r.ok) {
          this.fail(r.rule === "json" ? "json" : "purity", { rule: r.rule, message: r.message, trace: [...lazyTrace(), step] });
          continue;
        }
        if (r.canon === n.canon) continue;
        const bad = this.tool.brokenInvariants(r.w);
        if (bad.length)
          this.fail("garbage-breaks-invariant", { rule: "garbage-breaks-invariant", message: `the malformed action ${JSON.stringify(a).slice(0, 120)} broke invariant "${bad[0]!.name}". Check every field's type in reduce.`, trace: [...lazyTrace(), step] });
      }
    }
    // Membership: anyone leaves (someone stays), anyone outside joins.
    for (const person of this.people) {
      const inside = memberIds.has(person.id);
      if (inside && n.w.members.length <= 1) continue;
      const next = inside ? n.w.members.filter((m) => m.id !== person.id) : this.people.filter((m) => memberIds.has(m.id) || m.id === person.id);
      const r = this.tool.members(n.w, next);
      this.transitions++;
      const step: TraceStep = { step: "members", members: next.map((m) => m.id) };
      if (!r.ok) {
        this.fail(r.rule === "json" ? "json" : "membership-leave", { rule: r.rule, message: r.message, trace: [...lazyTrace(), step] });
        continue;
      }
      const m = this.visit(r.w, r.canon, n.tick, n, step, inside ? "leave" : "join");
      if (inside) {
        this.count("membership-leave");
        if (stringsOf(r.w.s).has(person.id)) this.leaverRefs++;
      } else {
        // The joiner must be able to do something, unless the tool is finished.
        this.count("membership-join");
        // A returning person whose part is still recorded (a vote, a seat) may have nothing left to do.
        if (!m.finished && !stringsOf(n.w.s).has(person.id)) {
          const en = this.enumerate(r.w, r.canon, person.id, () => [...lazyTrace(), step]);
          const any = en.actions.some((a) => {
            const x = this.tool.reduce(r.w, a, { seq: n.depth + 3, user: person.id, time: T0 + this.ticks()[n.tick]!, seed: this.seeds[0]! }, false);
            return x.ok && !x.threw && x.canon !== r.canon;
          });
          if (!any)
            this.fail("membership-join", { rule: "membership-join", message: `${person.id} joined and has no action that changes anything, and the tool is not finished`, trace: [...lazyTrace(), step], detail: { state: canonical(r.w.s).slice(0, 400) } }, !this.tool.finishedDeclared());
        }
      }
    }
    // Time passes.
    if (n.tick < this.ticks().length - 1) {
      const m = this.visit(n.w, n.canon, n.tick + 1, n, null, "wait");
      // A wait has no trace step of its own: the next act carries the later time.
      n.waitTo = m.id;
      succ.add(m.id);
    }
    n.succ = [...succ];
  }

  /** Early in the run, see whether results depend on meta.seed or meta.time. */
  probeSensitivity(n: Node, a: unknown, user: string, canon0: string) {
    if (this.probe > 400 || (this.seedSensitive && this.timeSensitive)) return;
    this.probe++;
    const base = this.meta(n, user, this.seeds[0]!);
    if (!this.seedSensitive) {
      const r = this.tool.reduce(n.w, a, { ...base, seed: 0x2545f491 }, false);
      if (r.ok && r.canon !== canon0) this.seedSensitive = true;
    }
    if (!this.timeSensitive) {
      for (const dt of [4_000, 7_200_000]) {
        const r = this.tool.reduce(n.w, a, { ...base, time: base.time + dt }, false);
        if (r.ok && r.canon !== canon0) this.timeSensitive = true;
      }
    }
  }

  run(t0: number, budgetMs: number): boolean {
    const init = this.tool.initEmpty();
    this.count("init");
    if (!init.ok) {
      this.fail("init", { rule: init.rule, message: init.message, trace: [] });
      return false;
    }
    const first = this.tool.members(init.w, this.people);
    if (!first.ok) {
      this.fail("init", { rule: first.rule, message: first.message, trace: [] });
      return false;
    }
    const flags = { time: this.timeSensitive, seed: this.seedSensitive };
    this.visit(first.w, first.canon, 0, null, null, "root");
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i]!;
      if (n.depth >= this.p.maxDepth) {
        if (!this.boundHit.includes("depth")) this.boundHit.push("depth");
        continue;
      }
      if (this.nodes.length >= this.p.maxStates) {
        if (!this.boundHit.includes("states")) this.boundHit.push("states");
        break;
      }
      if (performance.now() - t0 > budgetMs) {
        if (!this.boundHit.includes("time")) this.boundHit.push("time");
        break;
      }
      this.expand(n);
      // Sensitivity found after the space was laid out without it: start again with it.
      if ((this.seedSensitive && !flags.seed) || (this.timeSensitive && !flags.time)) return true;
    }
    return false;
  }
}

export function check(input: string | { js: string }, opts: CheckOptions = {}): CheckReport {
  const t0 = performance.now();
  const base = PROFILES[opts.profile ?? "default"];
  const p: Profile = { ...base, ...Object.fromEntries(Object.entries(opts).filter(([k, v]) => k in base && v !== undefined)), name: opts.profile ?? (Object.keys(opts).some((k) => k in base) ? "custom" : "default") } as Profile;
  const budgetMs = p.budgetMs;
  let tool: Tool;
  try {
    tool = new Tool(load(input), p.maxStateBytes);
  } catch (e) {
    return emptyReport(opts.name ?? "tool", p, { rule: "module-load", message: `the module failed to load: ${errText(e)}` }, performance.now() - t0);
  }
  const name = opts.name ?? (typeof tool.app.name === "string" ? tool.app.name : "tool");
  let S = new Search(tool, p, { time: false, seed: false });
  for (let tries = 0; tries < 3; tries++) {
    const restart = S.run(t0, budgetMs);
    if (!restart) break;
    S = new Search(tool, p, { time: S.timeSensitive, seed: S.seedSensitive });
  }

  const finishedDeclared = tool.finishedDeclared();
  const exhausted = S.boundHit.length === 0;
  // Deadlock: expanded, not finished, nobody in the chat can change anything, and waiting does not help.
  const memo = new Map<number, boolean | null>();
  const stuck = (n: Node): boolean | null => {
    if (memo.has(n.id)) return memo.get(n.id)!;
    let r: boolean | null;
    if (!n.expanded) r = null;
    else if (n.finished || n.changing > 0) r = false;
    else if (n.waitTo >= 0) r = stuck(S.nodes[n.waitTo]!);
    // The model's clock ends here; a tool waiting for a later time is not stuck.
    else if (S.timeSensitive) r = null;
    else r = true;
    memo.set(n.id, r);
    return r;
  };
  let deadlockChecked = 0;
  for (const n of S.nodes) {
    if (!n.expanded) continue;
    deadlockChecked++;
    if (stuck(n) === true && !n.finished) {
      S.fail("deadlock", { rule: "deadlock", message: `nobody in the chat (${n.w.members.map((m) => m.id).join(", ")}) can change anything here and the tool is not finished`, trace: S.trace(n.id), detail: { state: canonical(n.w.s).slice(0, 400) } }, !finishedDeclared);
      break;
    }
  }
  S.count("deadlock", deadlockChecked);

  // Goal reachability over members' actions and waiting.
  const initFor = new Map<string, Set<string> | null>();
  const occ = (v: unknown, id: string): number => {
    if (typeof v === "string") return v === id ? 1 : 0;
    if (Array.isArray(v)) return v.reduce((a: number, x) => a + occ(x, id), 0);
    if (v && typeof v === "object") return Object.entries(v).reduce((a: number, [k, x]) => a + (k === id ? 1 : 0) + occ(x, id), 0);
    return 0;
  };
  const rosterCount = (n: Node, id: string): number => {
    const k = n.w.members.map((m) => m.id).join(",");
    if (!initFor.has(k)) {
      const i = tool.initEmpty();
      const r = i.ok ? tool.members(i.w, n.w.members) : null;
      initFor.set(k, r && r.ok ? new Set([JSON.stringify(r.w.s)]) : null);
    }
    const s = initFor.get(k);
    return s ? occ(JSON.parse([...s][0]!), id) : 0;
  };
  const allActed = (n: Node) => n.w.members.length > 0 && n.w.members.every((m) => occ(n.w.s, m.id) > rosterCount(n, m.id));
  const goal = S.nodes.map((n) => n.finished || allActed(n));
  const hasGoal = finishedDeclared || goal.some(Boolean);
  const finishedNodes = S.nodes.filter((n) => n.finished);
  if (hasGoal) {
    const pred = S.nodes.map(() => [] as number[]);
    for (const n of S.nodes) for (const m of n.succ) pred[m]!.push(n.id);
    const reach = new Uint8Array(S.nodes.length);
    const q: number[] = [];
    for (const n of S.nodes) if (goal[n.id] || !n.expanded || (S.timeSensitive && n.tick === S.ticks().length - 1)) (reach[n.id] = 1), q.push(n.id);
    while (q.length) for (const x of pred[q.pop()!]!) if (!reach[x]) (reach[x] = 1), q.push(x);
    S.count("goal", S.nodes.length);
    const bad = S.nodes.find((n) => n.expanded && !reach[n.id]);
    if (bad)
      S.fail("goal", { rule: "goal", message: `from here no ${finishedDeclared ? "finished" : "finished or everyone-has-acted"} state can be reached by anything the people in the chat do`, trace: S.trace(bad.id), detail: { state: canonical(bad.w.s).slice(0, 400) } }, !finishedDeclared);
  }

  // Concurrency: pairs and triples of actions by different people, through the real replica.
  const conc = concurrency(S, p);

  // Duplicate resend (protocol-level dedupe) is part of the concurrency harness.
  const props: PropertyResult[] = [];
  const ids: PropertyId[] = [
    "init",
    ...tool.invariantNames().map((n) => `invariant:${n}` as PropertyId),
    ...tool.transitionNames().map((n) => `transition:${n}` as PropertyId),
    "purity",
    "json",
    "reduce-throws",
    "arbitrary",
    "garbage-breaks-invariant",
    "deadlock",
    "goal",
    "finished-frozen",
    "membership-leave",
    "membership-join",
    "duplicate",
    "convergence",
    "race",
    "optimistic-glitch",
    "silent-conflict",
    "pending-seed",
  ];
  for (const id of ids) {
    const f = S.fails.get(id), w = S.warns.get(id);
    const checked = S.checked.get(id) ?? (id === "json" || id === "arbitrary" ? S.transitions : 0);
    const r: PropertyResult = { id, status: f ? "fail" : w ? "warn" : checked || id === "json" || id === "arbitrary" ? "pass" : "n/a", checked };
    if (f || w) r.failure = (f ?? w)!;
    if (id === "goal" && !hasGoal) r.note = "no finished or everyone-has-acted state exists in the explored space";
    if (id === "finished-frozen" && !finishedNodes.length) r.note = "no finished state reached";
    if (id === "membership-leave" && S.leaverRefs) r.note = `${S.leaverRefs} states still mention someone who left (allowed, e.g. history)`;
    if (id === "duplicate") r.note = "a resend of the same (client, cseq) is deduped by the Sequencer; checked through the real replica";
    props.push(r);
  }
  const failures = props.filter((x) => x.status === "fail").map((x) => x.failure!);
  const warnings = props.filter((x) => x.status === "warn").map((x) => x.failure!);
  const d = S.derivations;
  const declared = typeof tool.app.actions === "function";
  const bounded: string[] = [];
  if (S.boundHit.includes("depth")) bounded.push(`depth bound ${p.maxDepth} reached`);
  if (S.boundHit.includes("states")) bounded.push(`state bound ${p.maxStates} reached`);
  if (S.boundHit.includes("time")) bounded.push(`time budget ${budgetMs} ms reached`);
  if (!declared) bounded.push("actions were derived from arbitrary, an under-approximation of what people can do");
  if (conc.capped) bounded.push(`concurrency combinations capped at ${p.maxCombos} per state`);
  bounded.push(`concurrency checked to depth ${p.concurrencyDepth} only`);
  const ok = failures.length === 0;
  const verdict = !ok ? "failed" : exhausted && declared && !conc.capped && p.concurrencyDepth >= p.maxDepth ? "complete" : "bounded";
  const states = S.nodes.length;
  const ms = Math.round(performance.now() - t0);
  return {
    name,
    verdict,
    ok,
    bounded: verdict === "complete" ? [] : bounded,
    profile: p,
    stats: { states, transitions: S.transitions, depth: Math.max(0, ...S.nodes.map((n) => n.depth)), exhausted, frontier: S.nodes.filter((n) => !n.expanded).length, ms },
    model: {
      timeSensitive: S.timeSensitive,
      seedSensitive: S.seedSensitive,
      symmetry: { used: false, note: "not implemented yet: every user id is explored separately" },
      actions: {
        source: declared ? "declared" : "derived",
        derivations: d.length,
        meanSeeds: d.length ? round(d.reduce((a, x) => a + x.seeds, 0) / d.length) : 0,
        capped: d.filter((x) => x.capped).length,
        missingMass: { mean: d.length ? round(d.reduce((a, x) => a + x.missing, 0) / d.length) : 0, max: round(Math.max(0, ...d.map((x) => x.missing))) },
        meanActions: d.length ? round(d.reduce((a, x) => a + x.actions.length, 0) / d.length) : 0,
      },
    },
    properties: props,
    failures,
    warnings,
    finished: { source: finishedDeclared ? "declared" : finishedNodes.length ? "heuristic" : "none", count: finishedNodes.length, ...(finishedNodes[0] ? { example: S.trace(finishedNodes[0].id) } : {}) },
    concurrency: conc,
    guarantee: guarantee(verdict, p, states, exhausted, declared),
  };
}

const round = (x: number) => Math.round(x * 1000) / 1000;

export function guarantee(verdict: CheckReport["verdict"], p: Profile, states: number, exhausted: boolean, declared: boolean): string {
  if (verdict === "failed") return "Failed: at least one property is broken; each failure carries a shortest trace that reproduces it.";
  const scope = `${p.users} people, ${p.seeds} seed outcomes per action, ${p.ticks.length} clock ticks, joins and leaves`;
  if (verdict === "complete") return `Complete within the bound: every state reachable with ${scope} (${states} states) satisfies every property. Nothing is claimed for more people, other seeds or longer sessions.`;
  return (
    `Bounded pass: no property failed in the ${states} states explored (${scope}, up to ${p.maxDepth} steps${exhausted ? "" : ", not every state reached"}; concurrent actions checked up to ${p.concurrencyDepth} steps in). ` +
    (declared ? "" : "The actions tried came from sampling arbitrary, so actions it never proposes were not tried. ") +
    "This is evidence, not a proof: a bug that needs more people, more steps or an action outside this set can still exist."
  );
}

function emptyReport(name: string, p: Profile, f: Failure, ms: number): CheckReport {
  return {
    name,
    verdict: "failed",
    ok: false,
    bounded: [],
    profile: p,
    stats: { states: 0, transitions: 0, depth: 0, exhausted: false, frontier: 0, ms: Math.round(ms) },
    model: { timeSensitive: false, seedSensitive: false, symmetry: { used: false, note: "" }, actions: { source: "derived", derivations: 0, meanSeeds: 0, capped: 0, missingMass: { mean: 0, max: 0 }, meanActions: 0 } },
    properties: [{ id: "init", status: "fail", checked: 1, failure: f }],
    failures: [f],
    warnings: [],
    finished: { source: "none", count: 0 },
    concurrency: { states: 0, combos: 0, independent: 0, orders: 0, capped: false, nonCommuting: 0, silent: 0 },
    guarantee: guarantee("failed", p, 0, false, false),
  };
}

function dedupe(xs: unknown[]): unknown[] {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = canonical(x);
    return seen.has(k) ? false : (seen.add(k), true);
  });
}
