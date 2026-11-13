// Runtime stage bodies. They run inside worker threads (see worker.ts) but are plain functions,
// so tests and the single-threaded fallback can call them directly.

import fc from "fast-check";
import { brief, clone } from "../json.ts";
import type { Failure } from "../report.ts";
import { loadApp } from "../sandbox.ts";
import { type Case, errText, Room } from "../sim/core.ts";
import { caseOf, straightCmd, syncCmd } from "../sim/gen.ts";
import { runStraight, stepsToTrace } from "../sim/straight.ts";
import { runSync } from "../sim/sync.ts";

/** budgetMs bounds search plus shrinking; when it runs out the best trace so far is reported. */
export type RunOpts = { runs: number; seed: number; maxStateBytes: number; budgetMs?: number };

const budget = (o: RunOpts) => (o.budgetMs ? { interruptAfterTimeLimit: o.budgetMs, markInterruptAsFailure: false } : {});

function load(js: string, maxStateBytes: number, nonce = 1): Room | Failure {
  try {
    return new Room(loadApp(js, nonce), maxStateBytes);
  } catch (e) {
    return { rule: "module-load", message: `the module failed to load: ${errText(e)}` };
  }
}

/** Stage 3: every sequence run twice on the same instance must give the same state hashes. */
export function determinism(js: string, o: RunOpts): Failure[] {
  const room = load(js, o.maxStateBytes);
  if (!(room instanceof Room)) return [room];
  const a = room.init();
  if (!a.ok) return [{ rule: a.rule, message: a.message }];
  const b = room.init();
  if (b.ok && JSON.stringify(a.state) !== JSON.stringify(b.state)) {
    return [{ rule: "nondeterministic", message: "init returned different states on two calls with the same ctx" }];
  }
  const fails = new Map<string, Failure>();
  const res = fc.check(
    fc.property(caseOf(straightCmd, 30), (c) => {
      const r1 = runStraight(room, c);
      if (r1.fail) {
        fails.set(JSON.stringify(c), { rule: r1.fail.rule, message: r1.fail.message, trace: stepsToTrace(r1.steps), ...(r1.fail.detail ? { detail: r1.fail.detail } : {}) });
        return false;
      }
      const r2 = runStraight(room, c, { replay: r1.steps });
      const n = Math.min(r1.hashes.length, r2.hashes.length);
      for (let i = 0; i < n || r2.fail; i++) {
        if (r2.fail || r1.hashes[i] !== r2.hashes[i]) {
          const at = r2.fail ? r2.fail.at : i;
          fails.set(JSON.stringify(c), {
            rule: "nondeterministic",
            message: r2.fail
              ? `the same actions failed on the second run only: ${r2.fail.message}`
              : `the same actions gave a different state on the second run after step ${at}. Look for module-level variables, Date, Math.random or object key order.`,
            trace: stepsToTrace(r1.steps.slice(0, Math.max(1, at))),
            detail: { first: brief(r1.states[at], 300), second: brief(r2.states[at], 300) },
          });
          return false;
        }
      }
      return true;
    }),
    { numRuns: o.runs, seed: o.seed, endOnFailure: false, ...budget(o) },
  );
  if (!res.failed) return [];
  const key = JSON.stringify(res.counterexample?.[0]);
  const f = fails.get(key) ?? (res.errorInstance ? { rule: "gate-error", message: errText(res.errorInstance) } : undefined);
  return f ? [f] : [{ rule: "nondeterministic", message: "a sequence failed but could not be reproduced: the reducer is not deterministic" }];
}

/** Stage 4: replicas, sequencer, invariants, convergence. */
export function fuzz(js: string, o: RunOpts): Failure[] {
  const room = load(js, o.maxStateBytes);
  if (!(room instanceof Room)) return [room];
  const fails = new Map<string, Failure>();
  const res = fc.check(
    fc.property(caseOf(syncCmd, 60), (c: Case) => {
      const r = runSync(room, c);
      if (!r.fail) return true;
      fails.set(JSON.stringify(c), { rule: r.fail.rule, message: r.fail.message, trace: r.trace, ...(r.fail.detail ? { detail: r.fail.detail } : {}) });
      return false;
    }),
    { numRuns: o.runs, seed: o.seed, ...budget(o) },
  );
  if (!res.failed) return [];
  const f = fails.get(JSON.stringify(res.counterexample?.[0]));
  return [f ?? { rule: "gate-error", message: res.errorInstance ? errText(res.errorInstance) : "failure could not be reproduced" }];
}

/**
 * observable: the mutant's states differed from the original's on the same commands.
 * wrong: at some step the mutant produced a state that is neither the original's result nor a
 * no-op. A mutant that merely ignores actions is "inert": no state invariant can tell it from a
 * rejected action, but a transition ("a valid vote adds the voter") can, so it counts once a
 * transition catches it.
 */
export type MutantResult = { id: number; crashed: boolean; observable: boolean; wrong: boolean; killedBy: string[] };

/** Stage 5 body: run the same cases on the original and on each mutant. */
export type MutantsOut = { original?: Failure; results: MutantResult[]; acts: number; changed: number; names: string[] };

export function mutants(js: string, list: { id: number; js: string }[], o: RunOpts): MutantsOut {
  const room = load(js, o.maxStateBytes);
  if (!(room instanceof Room)) return { original: room, results: [], acts: 0, changed: 0, names: [] };
  const cases = fc.sample(caseOf(straightCmd, 30), { numRuns: o.runs, seed: o.seed });
  const invs = Object.keys(room.L.app.invariants ?? {});
  const trans = room.transitionNames();
  const names = [...invs, ...trans];
  const base: string[][] = [];
  let acts = 0;
  let changed = 0;
  for (const c of cases) {
    const r = runStraight(room, c, { checks: true });
    if (r.fail)
      return {
        original: { rule: r.fail.rule, message: r.fail.message, trace: stepsToTrace(r.steps), ...(r.fail.detail ? { detail: r.fail.detail } : {}) },
        results: [],
        acts,
        changed,
        names,
      };
    base.push(r.hashes);
    // How often does an action from `arbitrary` actually change state? (stale picks count too)
    for (let i = 0; i < r.steps.length; i++)
      if (r.steps[i]!.kind === "act") {
        acts++;
        if (r.hashes[i + 1] !== r.hashes[i]) changed++;
      }
  }
  const results: MutantResult[] = [];
  for (const m of list) {
    const mr = load(m.js, o.maxStateBytes, 1 + m.id);
    if (!(mr instanceof Room)) {
      results.push({ id: m.id, crashed: true, observable: true, wrong: true, killedBy: [] });
      continue;
    }
    const killed = new Set<string>();
    let crashed = false;
    let observable = false;
    let wrong = false;
    for (let ci = 0; ci < cases.length; ci++) {
      const r = runStraight(mr, cases[ci]!, {
        onStep: (pre, action, meta, kind, post, preCanon, postCanon) => {
          if (!wrong && postCanon !== preCanon) {
            const want = room.reduce(room.L.toRealm(clone(pre)), action, meta, kind);
            if (!want.ok || want.canon !== postCanon) wrong = true;
          }
          let hit = false;
          for (const n of invs) if (mr.runInvariant(n, post) !== true) (killed.add(n), (hit = true));
          if (mr.appliesTo(action)) for (const n of trans) if (mr.runTransition(n, pre, post, action, meta) !== true) (killed.add(n), (hit = true));
          return hit ? "killed" : null;
        },
      });
      if (r.hashes.join() !== base[ci]!.join()) observable = true;
      if (r.fail && r.fail.rule !== "killed") crashed = true;
      if (killed.size === names.length) break;
    }
    if (killed.size) observable = wrong = true;
    results.push({ id: m.id, crashed: crashed && !killed.size, observable, wrong, killedBy: [...killed] });
  }
  return { results, acts, changed, names };
}
