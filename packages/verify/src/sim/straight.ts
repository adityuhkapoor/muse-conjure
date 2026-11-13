// Straight-line runs: one shared state, actions chosen by the app's `arbitrary`, sometimes from a
// stale state (lag) to imitate races cheaply, plus garbage and member changes. Used by stage 3
// (determinism and reduce hygiene) and stage 5 (mutant fuzz).

import { fnv } from "../json.ts";
import type { TraceStep } from "../report.ts";
import { type Bad, type Case, garbage, type Kind, type Member, membersFor, type Meta, Room, serverMeta, USERS, type W } from "./core.ts";

export type Step = { kind: Kind; user: string; action: unknown };

export type StraightResult = {
  steps: Step[];
  hashes: string[];
  states: W[];
  fail?: Bad & { at: number };
};

export type StepHook = (pre: W, action: unknown, meta: Meta, kind: Kind, post: W, preCanon: string, postCanon: string) => string | null;

/** Materialize and run a case. When `replay` is given, its actions are used instead of arbitrary. */
export function runStraight(
  room: Room,
  c: Case,
  opts: {
    replay?: Step[];
    /** Check invariants on every state and transitions on every step. */
    checks?: boolean;
    /** Return a message to stop the run as killed (stage 5). */
    onStep?: StepHook;
  } = {},
): StraightResult {
  const init = room.init();
  if (!init.ok) return { steps: [], hashes: [], states: [], fail: { ...init, at: 0 } };
  const history: W[] = [init.state];
  const steps: Step[] = [];
  const hashes = [fnv(init.canon)];
  let lastCanon = init.canon;
  const fail = (b: Bad): StraightResult => ({ steps, hashes, states: history, fail: { ...b, at: steps.length } });
  if (opts.checks) {
    const bad = room.checkInvariants(init.state);
    if (bad) return fail({ rule: "invariant", message: `invariant "${bad.name}" ${bad.message} on the initial state`, detail: { invariant: bad.name } });
  }
  const todo = opts.replay ?? c.cmds;
  for (let i = 0; i < todo.length; i++) {
    const cur = history[history.length - 1]!;
    let step: Step;
    if (opts.replay) step = opts.replay[i]!;
    else {
      const cmd = c.cmds[i]!;
      if (cmd.k === "members") step = { kind: "system", user: "host", action: { t: "@members", members: membersFor(cmd.mask) } };
      else if (cmd.k === "act" || cmd.k === "garbage") {
        const user = USERS[cmd.u % 3]!;
        if (cmd.k === "act") {
          const base = history[Math.max(0, history.length - 1 - cmd.lag)]!;
          const a = room.arbitrary(base, user, cmd.s);
          if (!a.ok) return fail(a);
          if (a.action === null) continue;
          step = { kind: "act", user, action: a.action };
        } else {
          const real = room.arbitrary(cur, user, cmd.s);
          if (!real.ok) return fail(real);
          step = { kind: "garbage", user, action: garbage(cmd.g, cmd.s, real.action) };
        }
      } else continue;
    }
    steps.push(step);
    const meta = serverMeta(c.seed, steps.length, step.user);
    const r = room.reduce(cur, step.action, meta, step.kind);
    if (!r.ok) return fail(r);
    const stop = opts.onStep?.(cur, step.action, meta, step.kind, r.state, lastCanon, r.canon);
    lastCanon = r.canon;
    history.push(r.state);
    hashes.push(fnv(r.canon));
    if (stop) return fail({ rule: "killed", message: stop });
    if (opts.checks) {
      const bad = room.checkInvariants(r.state);
      if (bad)
        return fail({
          rule: step.kind === "garbage" ? "garbage-breaks-invariant" : "invariant",
          message:
            step.kind === "garbage"
              ? `the malformed action ${JSON.stringify(step.action)?.slice(0, 120)} broke invariant "${bad.name}" (${bad.message}). Check every field's type in reduce.`
              : `invariant "${bad.name}" ${bad.message}`,
          detail: { invariant: bad.name },
        });
      const t = room.checkTransitions(cur, r.state, step.action, meta);
      if (t) return fail({ rule: "transition", message: `transition "${t.name}" ${t.message}`, detail: { transition: t.name } });
    }
  }
  return { steps, hashes, states: history };
}

export function stepsToTrace(steps: Step[]): TraceStep[] {
  return steps.map((s, i): TraceStep =>
    s.kind === "act"
      ? { step: "act", user: s.user, action: s.action, seq: i + 1 }
      : s.kind === "garbage"
        ? { step: "garbage", user: s.user, action: s.action }
        : { step: "members", members: ((s.action as { members: Member[] }).members ?? []).map((m) => m.id) },
  );
}
