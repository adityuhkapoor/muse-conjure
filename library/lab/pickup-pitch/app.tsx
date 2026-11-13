import { defineApp, Avatar, Button, CardHeader, Facepile, Toast, haptic, innerWidth, mix, pal, running, tween, type Ctx, type Member } from "@muse/app";

// Pickup pitch: "is it on this week??" answered by the field itself. A pitch from above with 14
// dashed spots; tap one (or grab one) and your face stands there. At ten players the pitch lights
// up and the game is on; then anyone can balance the teams by how good people say they are, and
// everyone runs to their new side. The bib bag sits on the touchline with whoever has the bibs.

type Params = {
  /** Card title */
  title: string;
  /** Group name, e.g. 'Sunday pickup soccer' */
  group: string;
  /** Members in the group */
  members: number;
  /** When, as said: 'Sun 10am' */
  when: string;
  /** Where: 'the Quad' */
  where: string;
  /** Players needed for the game to be on, 4 to 14 */
  need: number;
  /** Who has the bibs (a name) */
  bibs: string;
  /** People already on the pitch. spot 0-6 is the left team (keeper first), 7-13 the right. skill 1 chill, 2 solid, 3 sweaty */
  players: { name: string; spot: number; skill: number; said?: string }[];
};

// @params
const P: Params = {
  title: "Sunday pickup",
  group: "Sunday pickup soccer",
  members: 140,
  when: "Sun 10am",
  where: "the Quad",
  need: 10,
  bibs: "Arun",
  players: [
    { name: "Arun", spot: 0, skill: 2, said: "bibs are in my car. they smell like rice" },
    { name: "Will", spot: 13, skill: 3, said: "driving the sube, 3 seats left" },
    { name: "Calvin", spot: 4, skill: 2, said: "if I'm late it's alarm 6's fault" },
    { name: "Diego", spot: 9, skill: 3 },
    { name: "Sam", spot: 2, skill: 1 },
    { name: "Kofi", spot: 11, skill: 2 },
    { name: "Lena", spot: 6, skill: 3 },
  ],
};
// @end params

type Taker = { who: string; name: string; skill: number; at: number };
type State = {
  title: string; group: string; members: number; when: string; where: string; need: number; bibs: string;
  spots: (Taker | null)[];
  said: { [who: string]: string };
  on: boolean; onAt: number; balancedAt: number;
};
type Action = { t: "take"; i: number; skill: number } | { t: "leave" } | { t: "balance" };
type Local = { skill: number };

const N = 14;
const FORM: [number, number][] = [[0.07, 0.5], [0.19, 0.27], [0.19, 0.73], [0.32, 0.16], [0.32, 0.5], [0.32, 0.84], [0.44, 0.5]];
const posOf = (i: number): [number, number] => {
  const f = FORM[i % 7]!;
  return i < 7 ? f : [1 - f[0], f[1]];
};
const SKILL = ["Chill", "Solid", "Sweaty"];
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const count = (s: State) => s.spots.filter(Boolean).length;
const mineAt = (s: State, u: string) => s.spots.findIndex((x) => x !== null && x.who === u);
const withOn = (s: State, time: number): State => {
  const on = count(s) >= s.need;
  return on === s.on ? s : { ...s, on, onAt: on ? time : 0 };
};
const pop = tween({ duration: 600, easing: [0.34, 1.56, 0.64, 1] });

function balanced(s: State): (Taker | null)[] {
  const all = s.spots.filter((x): x is Taker => x !== null).sort((a, b) => b.skill - a.skill || (a.who < b.who ? -1 : a.who > b.who ? 1 : 0));
  const teams: Taker[][] = [[], []];
  all.forEach((t, k) => {
    const side = [0, 1, 1, 0][k % 4]!;
    teams[teams[side]!.length < 7 ? side : 1 - side]!.push(t);
  });
  const out: (Taker | null)[] = Array.from({ length: N }, () => null);
  // keepers stay last so the strongest play the field; fill outfield first, keeper last
  const order = [4, 6, 1, 2, 3, 5, 0];
  teams.forEach((team, side) => team.forEach((t, j) => (out[side * 7 + order[j]!] = t)));
  return out;
}

function initState(ctx: Ctx): State {
  const spots: (Taker | null)[] = Array.from({ length: N }, () => null);
  const said: { [who: string]: string } = {};
  const need = isInt(P.need, 2, N) ? P.need : 10;
  for (const p of Array.isArray(P.players) ? P.players : []) {
    const name = clean(p?.name, 20);
    if (!name || !isInt(p.spot, 0, N - 1) || spots[p.spot]) continue;
    const m = ctx.members.find((x) => x.id === name || x.name.toLowerCase() === name.toLowerCase());
    const who = m ? m.id : `o:${name}`;
    if (spots.some((x) => x?.who === who)) continue;
    spots[p.spot] = { who, name: m ? m.name : name, skill: isInt(p.skill, 1, 3) ? p.skill : 2, at: 0 };
    const q = clean(p.said, 70);
    if (q) said[who] = q;
  }
  const s: State = {
    title: clean(P.title, 40) || "Pickup game", group: clean(P.group, 40), members: isInt(P.members, 1, 1_000_000) ? P.members : 1,
    when: clean(P.when, 20), where: clean(P.where, 30), need, bibs: clean(P.bibs, 20), spots, said, on: false, onAt: 0, balancedAt: 0,
  };
  return { ...s, on: count(s) >= need };
}

export default defineApp<State, Action, Local>({
  name: "Pickup pitch",
  summary: (s) => (s.on ? `Game on · ${count(s)} playing${s.when ? ` · ${s.when}` : ""}` : `${count(s)} of ${s.need} for ${s.title.toLowerCase()} · ${s.need - count(s)} more and it's on`),

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const u = m.user;
    if (a.t === "take") {
      if (!isInt(a.i, 0, N - 1) || !isInt(a.skill, 1, 3) || s.spots[a.i] !== null) return s;
      const old = mineAt(s, u);
      const name = ctx.members.find((x) => x.id === u)?.name ?? "Player";
      const spots = s.spots.map((x, j) => (j === a.i ? { who: u, name, skill: a.skill, at: m.time } : j === old ? null : x));
      return withOn({ ...s, spots }, m.time);
    }
    if (a.t === "leave") {
      const old = mineAt(s, u);
      if (old < 0) return s;
      return withOn({ ...s, spots: s.spots.map((x, j) => (j === old ? null : x)) }, m.time);
    }
    if (a.t === "balance") {
      if (count(s) < s.need) return s;
      return { ...s, spots: balanced(s), balancedAt: m.time };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const gone = (x: Taker | null) => x !== null && !x.who.startsWith("o:") && !inChat(ctx, x.who);
    if (!s.spots.some(gone) && Object.keys(s.said).every((u) => u.startsWith("o:") || inChat(ctx, u))) return s;
    const said = Object.fromEntries(Object.entries(s.said).filter(([u]) => u.startsWith("o:") || inChat(ctx, u)));
    const next = { ...s, said, spots: s.spots.map((x) => (gone(x) ? null : x)) };
    const on = count(next) >= next.need;
    return { ...next, on, onAt: on ? next.onAt : 0 };
  },

  invariants: {
    "fourteen spots": (s) => s.spots.length === N,
    "one spot per person": (s) => {
      const w = s.spots.flatMap((x) => (x ? [x.who] : []));
      return new Set(w).size === w.length;
    },
    "skills are 1 to 3": (s) => s.spots.every((x) => x === null || isInt(x.skill, 1, 3)),
    "chat players are in the chat": (s, ctx) => s.spots.every((x) => x === null || x.who.startsWith("o:") || inChat(ctx, x.who)),
    "the game is on exactly at the need": (s) => s.on === count(s) >= s.need && (s.on || s.onAt === 0),
  },

  transitions: {
    "only chat members change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "taking puts the actor on that spot": (p, n, a, m) => {
      if (a.t !== "take" || p === n) return true;
      const t = n.spots[a.i];
      const old = mineAt(p, m.user);
      return !!t && t.who === m.user && t.skill === a.skill && t.at === m.time && p.spots[a.i] === null &&
        n.spots.every((x, j) => j === a.i || j === old ? j === a.i || x === null : JSON.stringify(x) === JSON.stringify(p.spots[j])) && count(n) === count(p) + (old < 0 ? 1 : 0);
    },
    "an open spot is never refused": (p, n, a, m, ctx) => a.t !== "take" || p !== n || !(inChat(ctx, m.user) && isInt(a.i, 0, N - 1) && isInt(a.skill, 1, 3) && p.spots[a.i] === null),
    "leaving frees only the actor": (p, n, a, m, ctx) => {
      if (a.t !== "leave") return true;
      const old = mineAt(p, m.user);
      if (p === n) return old < 0 || !inChat(ctx, m.user);
      return old >= 0 && n.spots[old] === null && count(n) === count(p) - 1 && n.spots.every((x, j) => j === old || JSON.stringify(x) === JSON.stringify(p.spots[j]));
    },
    "balancing keeps the same players and evens the teams": (p, n, a, m) => {
      if (a.t !== "balance" || p === n) return true;
      const key = (s: State) => s.spots.flatMap((x) => (x ? [x.who] : [])).sort().join("|");
      const side = (s: State, k: number) => s.spots.slice(k * 7, k * 7 + 7).filter(Boolean).length;
      return count(p) >= p.need && key(p) === key(n) && Math.abs(side(n, 0) - side(n, 1)) <= 1 && n.balancedAt === m.time;
    },
    "balance only once enough are in": (p, n, a) => a.t !== "balance" || p === n || count(p) >= p.need,
    "game on is stamped when it turns on": (p, n, _a, m) => p.on || !n.on || n.onAt === m.time,
  },

  arbitrary: (s, u, r) => {
    const k = r.next();
    const open = s.spots.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0);
    if (k < 0.12) return { t: "balance" };
    if (k < 0.25 && mineAt(s, u) >= 0) return { t: "leave" };
    return { t: "take", i: open.length ? r.pick(open) : r.int(N), skill: 1 + r.int(3) };
  },

  local: { skill: 2 },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = Math.min(innerWidth(), theme.width - 24);
    const H = W < 340 ? 188 : 212;
    const n = count(state);
    const mine = mineAt(state, me);
    const face = (t: Taker): string | Member => (t.who.startsWith("o:") ? { id: t.who, name: t.name } : t.who);
    const nameOf = (u: string) => (u === me ? "You" : (members.find((m) => m.id === u)?.name ?? state.spots.find((x) => x?.who === u)?.name ?? "Someone"));
    const team = [mix(p.orange, c.card, 0.05), mix(p.blue, c.card, 0.05)];
    const skillOf = (k: number) => state.spots.slice(k * 7, k * 7 + 7).reduce((a, x) => a + (x ? x.skill : 0), 0);
    const onE = confirmed.on && confirmed.onAt > 0 ? running(confirmed.onAt, 600) : null;
    const stamp = state.on ? (onE === null ? 1 : pop(onE)) : 0;

    // Mown stripes, white lines, goals.
    const m = 8;
    const fw = W - 2 * m, fh = H - 2 * m;
    const line = theme.mode === "dark" ? c.text : c.card;
    const g1 = mix(p.green, p.leaf, 0.25);
    const g2 = mix(p.green, p.leaf, 0.05);
    const pitch = (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Pitch with ${n} of ${N} spots taken, ${state.need} needed`} style={{ display: "block" }}>
        <rect x={0} y={0} width={W} height={H} rx={12} fill={g1} />
        {Array.from({ length: 8 }, (_v, j) => (j % 2 ? <rect key={j} x={(j * W) / 8} y={0} width={W / 8} height={H} fill={g2} /> : null))}
        <rect x={m} y={m} width={fw} height={fh} fill="none" stroke={line} stroke-width={2} />
        <line x1={W / 2} y1={m} x2={W / 2} y2={H - m} stroke={line} stroke-width={2} />
        <circle cx={W / 2} cy={H / 2} r={fh * 0.17} fill="none" stroke={line} stroke-width={2} />
        <circle cx={W / 2} cy={H / 2} r={2.5} fill={line} />
        <rect x={m} y={H / 2 - fh * 0.3} width={fw * 0.13} height={fh * 0.6} fill="none" stroke={line} stroke-width={2} />
        <rect x={W - m - fw * 0.13} y={H / 2 - fh * 0.3} width={fw * 0.13} height={fh * 0.6} fill="none" stroke={line} stroke-width={2} />
        <rect x={m - 6} y={H / 2 - fh * 0.12} width={6} height={fh * 0.24} fill={mix(line, c.text, 0.15)} />
        <rect x={W - m} y={H / 2 - fh * 0.12} width={6} height={fh * 0.24} fill={mix(line, c.text, 0.15)} />
        {state.on ? <rect x={0} y={0} width={W} height={H} rx={12} fill={p.yellow} opacity={0.12 * stamp} /> : null}
      </svg>
    );

    const S = 30;
    const spots = state.spots.map((t, i) => {
      const [fx, fy] = posOf(i);
      const x = m + fx * fw, y = m + fy * fh;
      if (!t) {
        return (
          <button key={`e${i}`} type="button" class="pp-hit" aria-label={`Take spot ${i + 1}, ${i < 7 ? "left" : "right"} team`}
            onClick={() => { dispatch({ t: "take", i, skill: local.skill }); haptic("light"); }}
            style={{ position: "absolute", left: x - S / 2, top: y - S / 2, width: S, height: S, padding: 0, borderRadius: 99, border: `2px dashed ${line}`, background: mix(g1, line, 0.15), cursor: "pointer" }} />
        );
      }
      return null;
    });
    // People keyed by who, so balancing slides each face to the new spot.
    const people = state.spots
      .map((t, i) => ({ t, i }))
      .filter((x): x is { t: Taker; i: number } => x.t !== null)
      .sort((a, b) => (a.t.who < b.t.who ? -1 : 1))
      .map(({ t, i }) => {
        const [fx, fy] = posOf(i);
        const x = m + fx * fw, y = m + fy * fh;
        const e = t.at > 0 ? running(t.at, 500) : null;
        const sc = e === null ? 1 : pop(Math.min(600, e * 1.2));
        return (
          <div key={t.who} style={{ position: "absolute", left: x - S / 2, top: y - S / 2, width: S, height: S, transition: "left 700ms cubic-bezier(.3,1.3,.5,1), top 700ms cubic-bezier(.3,1.3,.5,1)", pointerEvents: "none" }}>
            <span style={{ display: "flex", borderRadius: 99, transform: `scale(${sc})`, boxShadow: `0 0 0 3px ${team[i < 7 ? 0 : 1]}${t.who === me ? `, 0 0 0 5px ${c.card}` : ""}` }}>
              <Avatar user={face(t)} size={S} />
            </span>
            <span style={{ position: "absolute", left: 0, right: 0, top: S + 3, display: "flex", justifyContent: "center", gap: 2 }}>
              {[0, 1, 2].map((d) => (
                <span key={d} style={{ width: 5, height: 5, borderRadius: 3, background: d < t.skill ? line : mix(g1, c.card, 0.3) }} />
              ))}
            </span>
          </div>
        );
      });

    // Bib bag on the touchline.
    const bibWho = state.bibs ? members.find((x) => x.name.toLowerCase() === state.bibs.toLowerCase())?.id ?? { id: `o:${state.bibs}`, name: state.bibs } : null;
    const bag = state.bibs ? (
      <div style={{ position: "absolute", left: W / 2 - 46, bottom: -2, height: 24, display: "flex", alignItems: "center", gap: 4, padding: "0 8px 0 4px", borderRadius: 99, background: c.card, pointerEvents: "none" }}>
        <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true">
          <path d="M3 6 Q9 2 15 6 L14 16 L4 16 Z" fill={p.orange} />
          <path d="M6 6 Q9 1 12 6" fill="none" stroke={p.dark} stroke-width={1.5} />
          <path d="M7 9 h4 M7 12 h4" stroke={p.cream} stroke-width={1.5} />
        </svg>
        {bibWho ? <Avatar user={bibWho} size={16} /> : null}
        <span style={{ fontSize: 12, fontWeight: 600, color: c.text, whiteSpace: "nowrap" }}>bibs</span>
      </div>
    ) : null;

    const badge = (
      <div style={{ position: "absolute", left: W / 2 - 64, top: 12, width: 128, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <span style={{ padding: "3px 12px", borderRadius: 99, background: c.card, color: c.text, boxShadow: state.on ? `0 0 0 3px ${p.yellow}` : "none", fontSize: 14, fontWeight: 700, lineHeight: "20px", whiteSpace: "nowrap", transform: `scale(${state.on ? 0.8 + 0.2 * stamp : 1})` }}>
          {state.on ? "Game on" : `${n} of ${state.need} in`}
        </span>
      </div>
    );

    const teamTags = state.on ? (
      <>
        <span style={{ position: "absolute", left: 14, bottom: 6, padding: "1px 8px", borderRadius: 99, background: c.card, color: c.text, fontSize: 11, fontWeight: 600, lineHeight: "16px", pointerEvents: "none" }}>{`Skill ${skillOf(0)}`}</span>
        <span style={{ position: "absolute", right: 14, bottom: 6, padding: "1px 8px", borderRadius: 99, background: c.card, color: c.text, fontSize: 11, fontWeight: 600, lineHeight: "16px", pointerEvents: "none" }}>{`Skill ${skillOf(1)}`}</span>
      </>
    ) : null;

    // Controls: how good you are (local), then the one action.
    const firstOpen = (() => {
      const l = state.spots.slice(0, 7).filter(Boolean).length, r = state.spots.slice(7).filter(Boolean).length;
      const order = l <= r ? [6, 4, 1, 2, 3, 5, 0, 13, 11, 8, 9, 10, 12, 7] : [13, 11, 8, 9, 10, 12, 7, 6, 4, 1, 2, 3, 5, 0];
      return order.find((i) => state.spots[i] === null) ?? -1;
    })();
    const seg = (
      <div role="group" aria-label="How you play" style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        {SKILL.map((lb, j) => {
          const on = local.skill === j + 1;
          return (
            <button key={lb} type="button" aria-pressed={on ? "true" : "false"} onClick={() => setLocal({ skill: j + 1 })}
              style={{ height: 44, padding: "6px 0", border: 0, background: "transparent", cursor: "pointer" }}>
              <span style={{ display: "flex", alignItems: "center", height: 32, padding: "0 10px", borderRadius: 99, fontSize: 13, fontWeight: on ? 700 : 500, background: on ? c.selected : c.secondaryButton, color: on ? c.text : c.secondaryButtonText, boxShadow: on ? `inset 0 0 0 1.5px ${c.primary}` : "none", whiteSpace: "nowrap" }}>{lb}</span>
            </button>
          );
        })}
      </div>
    );
    let act;
    if (mine < 0) {
      act = firstOpen < 0 ? (
        <span style={{ fontSize: 14, fontWeight: 600, color: c.secondaryText }}>Pitch is full</span>
      ) : (
        <Button kind="primary" onClick={() => { dispatch({ t: "take", i: firstOpen, skill: local.skill }); haptic("success"); }}>I'm in</Button>
      );
    } else if (state.on && state.balancedAt === 0) {
      act = (
        <div style={{ display: "flex", gap: 6 }}>
          <Button kind="deemphasized" onClick={() => dispatch({ t: "leave" })}>Out</Button>
          <Button kind="primary" onClick={() => { dispatch({ t: "balance" }); haptic("success"); }}>Even teams</Button>
        </div>
      );
    } else {
      act = (
        <div style={{ display: "flex", gap: 6 }}>
          <Button kind="deemphasized" onClick={() => dispatch({ t: "leave" })}>I'm out</Button>
          {state.on ? <Button kind="secondary" onClick={() => dispatch({ t: "balance" })}>Even again</Button> : null}
        </div>
      );
    }

    const chat = state.spots.filter((x): x is Taker => x !== null && !x.who.startsWith("o:")).sort((a, b) => b.at - a.at);
    const quoted = chat.find((x) => state.said[x.who] && x.who !== me);
    const line1 = state.on
      ? state.balancedAt > 0 ? `Teams evened · ${skillOf(0)} vs ${skillOf(1)}` : `${n} playing · ${state.when || "this week"}`
      : n === 0 ? "Nobody's on the pitch yet" : `${state.need - n} more and it's on`;
    const toast = confirmed.on && confirmed.onAt > 0 && running(confirmed.onAt, 2400) !== null ? confirmed.onAt : null;

    return (
      <div>
        <style>{".pp-hit::after{content:'';position:absolute;left:50%;top:50%;width:44px;height:44px;transform:translate(-50%,-50%)}.pp-hit{position:absolute}"}</style>
        <CardHeader title={state.title} subtitle={[state.when, state.where, state.group ? `${state.group}` : ""].filter(Boolean).join(" · ")} />
        <div style={{ height: 4 }} />
        <div style={{ position: "relative", height: H }}>
          {pitch}
          {spots}
          {people}
          {badge}
          {teamTags}
          {bag}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, minWidth: 0 }}>
          {mine < 0 ? seg : (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, lineHeight: "20px", color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line1}</div>
              <div style={{ fontSize: 13, lineHeight: "17px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`You're on the ${mine < 7 ? "orange" : "blue"} side · ${SKILL[(state.spots[mine]?.skill ?? 2) - 1]!.toLowerCase()}`}</div>
            </div>
          )}
          <div style={{ flex: mine < 0 ? 1 : "0 0 auto", display: "flex", justifyContent: "flex-end" }}>{act}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26, marginTop: 4, minWidth: 0 }}>
          {chat.length ? <Facepile users={chat.map((x) => x.who)} max={4} size={18} /> : null}
          <span style={{ fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {quoted ? `${nameOf(quoted.who)}: "${state.said[quoted.who]}"` : mine < 0 ? line1 : `${n} of ${N} spots taken`}
          </span>
        </div>
        {toast ? <Toast key={toast}>{`It's on · ${state.when || "see you there"}`}</Toast> : null}
      </div>
    );
  },
});
