// The code that runs inside a tool's vm context, as text: freezing the intrinsics and the fold API.
// Shared by the realm worker; nothing here touches the host.

export const FREEZE = `
(() => {
  const g = globalThis;
  for (const name of ["Object","Function","Array","Number","String","Boolean","Symbol","Math","JSON","Date","RegExp","Error",
    "TypeError","RangeError","SyntaxError","ReferenceError","Map","Set","WeakMap","WeakSet","Promise","Reflect","Proxy","BigInt"]) {
    let v; try { v = g[name]; } catch { continue; }
    if (v && (typeof v === "object" || typeof v === "function")) { Object.freeze(v); if (v.prototype) Object.freeze(v.prototype); }
  }
})();`;

export const API = `
(() => {
  "use strict";
  const app = __exports.default;
  const isAction = (a) => typeof a === "object" && a !== null && !Array.isArray(a) && typeof a.t === "string";
  const membersOf = (a) => {
    if (!isAction(a) || a.t !== "@members" || !Array.isArray(a.members) || a.members.length > 250) return null;
    const out = []; const seen = new Set();
    for (const m of a.members) {
      if (typeof m !== "object" || m === null) return null;
      const { id, name, avatar } = m;
      if (typeof id !== "string" || !id || typeof name !== "string" || seen.has(id)) return null;
      if (avatar !== undefined && typeof avatar !== "string") return null;
      seen.add(id); out.push(avatar === undefined ? { id, name } : { id, name, avatar });
    }
    return out;
  };
  const same = (a, b) => a.length === b.length && a.every((m, i) => m.id === b[i].id && m.name === b[i].name && m.avatar === b[i].avatar);
  const ctxOf = (members) => ({ room: __room, members });
  const safe = (fn, fb) => { try { return fn(); } catch (e) { return fb; } };
  return {
    name: () => (typeof app.name === "string" ? app.name : ""),
    init: () => JSON.stringify({ s: app.init(ctxOf([])), members: [], started: false }),
    reduce: (fj, aj, mj) => {
      const f = JSON.parse(fj); const action = JSON.parse(aj); const meta = JSON.parse(mj);
      const members = membersOf(action);
      if (members) {
        if (same(members, f.members)) return fj;
        const ctx = ctxOf(members);
        const s = f.started ? safe(() => (app.onMembers ? app.onMembers(f.s, ctx) : f.s), f.s) : safe(() => app.init(ctx), f.s);
        return JSON.stringify({ s, members, started: f.started });
      }
      if (!isAction(action) || action.t.startsWith("@")) return fj;
      const s = safe(() => app.reduce(f.s, action, meta, ctxOf(f.members)), f.s);
      return s === f.s ? fj : JSON.stringify({ s, members: f.members, started: true });
    },
    arbitrary: (fj, user, seed) => {
      if (typeof app.arbitrary !== "function") return "null";
      const f = JSON.parse(fj);
      const a = app.arbitrary(f.s, user, __rt.rng(Number(seed)), ctxOf(f.members));
      return a === undefined ? "null" : JSON.stringify(a);
    },
    summary: (fj) => {
      if (typeof app.summary !== "function") return "";
      const f = JSON.parse(fj);
      return String(app.summary(f.s, ctxOf(f.members)));
    },
  };
})()`;

