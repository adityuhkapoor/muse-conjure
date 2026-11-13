// Replay a failure trace as a straight fold of its act and garbage steps, in trace order. For
// stage 3 traces this reproduces the failure exactly; the factory can use it to check a repair
// against the trace before running the whole gate again.

import { compileModule } from "./compile.ts";
import type { TraceStep } from "./report.ts";
import { loadApp } from "./sandbox.ts";
import { type Bad, POOL, Room, serverMeta } from "./sim/core.ts";

export type ReplayResult = { ok: true; state: unknown } | ({ ok: false; at: number } & Bad);

export function replay(source: string, trace: TraceStep[], o: { seed?: number; maxStateBytes?: number } = {}): ReplayResult {
  const c = compileModule(source);
  if (!c.ok) return { ok: false, at: 0, rule: "compile", message: c.message };
  const room = new Room(loadApp(c.js), o.maxStateBytes ?? 64 * 1024);
  const init = room.init();
  if (!init.ok) return { ...init, at: 0 };
  let state = init.state;
  let seq = 0;
  for (let i = 0; i < trace.length; i++) {
    const st = trace[i]!;
    let r;
    if (st.step === "members") {
      const members = st.members.map((id) => POOL.find((m) => m.id === id) ?? { id, name: id });
      r = room.reduce(state, { t: "@members", members }, serverMeta(o.seed ?? 0, ++seq, "host"), "system");
    } else if (st.step === "act" || st.step === "garbage") r = room.reduce(state, st.action, serverMeta(o.seed ?? 0, ++seq, st.user), st.step);
    else continue;
    if (!r.ok) return { ...r, at: i };
    const prev = state;
    state = r.state;
    const bad = room.checkInvariants(state);
    if (bad) return { ok: false, at: i, rule: st.step === "garbage" ? "garbage-breaks-invariant" : "invariant", message: `invariant "${bad.name}" ${bad.message}` };
    if (st.step !== "members") {
      const t = room.checkTransitions(prev, state, st.action, serverMeta(o.seed ?? 0, seq, st.user));
      if (t) return { ok: false, at: i, rule: "transition", message: `transition "${t.name}" ${t.message}` };
    }
  }
  return { ok: true, state };
}
