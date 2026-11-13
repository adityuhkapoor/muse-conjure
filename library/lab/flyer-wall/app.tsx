import { defineApp, Avatar, Button, Canvas, CardHeader, Facepile, Toast, fitText, haptic, innerWidth, mix, pal, running, tween, userColor } from "@muse/app";

// Flyer maker: make a paper flyer for the group's corkboard (headline, paper, sticker), pin it,
// and members tear off your tabs one face at a time. One tab each; leavers free theirs.

type Head = { head: string; sub: string };
type Other = { head: string; paper: number; by: string };
type Params = { group: string; size: string; heads: Head[]; board: Other[]; week: { flyers: number; tabs: number } };

// @params
const P: Params = {
  group: "Cal Class of '28", size: "6.2K",
  heads: [
    { head: "FREE COUCH", sub: "comfy, slightly haunted. Durant & Telegraph, curb by 6pm" },
    { head: "LOST AIRPODS", sub: "blue case, frog sticker. Doe Library 3rd floor, Tues" },
    { head: "STUDY GROUP", sub: "CS 61B midterm grind. Thurs 7pm, Moffitt 4th floor" },
    { head: "PICKUP SOCCER", sub: "Sundays 10am on Memorial Glade. all levels, bring water" },
  ],
  board: [{ head: "BIKE 4 SALE", paper: 5, by: "Leo" }, { head: "LOST CAT", paper: 6, by: "Ana" }, { head: "ROOM IN NORTHSIDE", paper: 7, by: "Theo" }],
  week: { flyers: 38, tabs: 212 },
};
// @end params

type Tear = { by: string; at: number };
type State = {
  group: string; size: string; heads: Head[]; board: Other[]; week: { flyers: number; tabs: number };
  head: number; paper: number; sticker: number; edAt: number;
  by: string | null; at: number;
  tabs: (Tear | null)[];
};
type Action = { t: "head" } | { t: "paper"; i: number } | { t: "sticker"; i: number } | { t: "pin" } | { t: "tear"; i: number } | { t: "back" } | { t: "again" };
type Local = Record<string, never>;
type Ctx = { members: { id: string; name?: string }[] };

// The flyer is the user's own artwork: its paper, ink and sticker colours are user content.
const userContent = (c: string) => c;
const PAPERS = [
  userContent("#fff3bf"), userContent("#ffc9de"), userContent("#c5f6fa"), userContent("#d3f9d8"), userContent("#ffffff"),
  userContent("#d0ebff"), userContent("#ffe8cc"), userContent("#e5dbff"),
];
const PAPER_NAMES = ["Yellow", "Pink", "Blue", "Green", "White"];
const INK = userContent("#1d1a2f");
const INK2 = userContent("#343a40");
const BURST = userContent("#d6336c");
const BURST_TEXT = userContent("#ffffff");
const RAYS = userContent("#ffa94d");
const SUN = userContent("#ffd43b");
const BOLT = userContent("#7b6cff");
const STICKERS = ["Yes", "Sun", "Bolt"];
const TABS = 6;
const IMPACT = `Impact, Haettenschweiler, "Arial Narrow Bold", "Helvetica Neue", sans-serif`;
const BOUNCE = tween({ duration: 350, easing: [0.34, 1.56, 0.64, 1] });
const FLY = tween({ duration: 600, easing: [0.34, 1.56, 0.64, 1] });
const DROP = tween({ duration: 250, easing: "decelerate" });
const FLICK = tween({ duration: 700, easing: "linear" });

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v < hi;
const count = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);
const blank = (): (Tear | null)[] => Array.from({ length: TABS }, () => null);
const held = (s: State, u: string) => s.tabs.findIndex((x) => x !== null && x.by === u);
const torn = (s: State) => s.tabs.filter((x) => x !== null).length;

export default defineApp<State, Action, Local>({
  name: "Flyer maker",
  summary: (s) => {
    const h = s.heads[s.head]?.head ?? "";
    return s.by === null ? `Flyer draft: ${h}` : `${h} pinned · ${torn(s)} of 6 tabs torn`;
  },

  init: () => {
    let heads = P.heads.map((x) => ({ head: clean(x.head, 24), sub: clean(x.sub, 70) })).filter((x) => x.head).slice(0, 4);
    if (!heads.length) heads = [{ head: "FREE STUFF", sub: "Say what, where and when" }];
    const board = P.board
      .filter((x) => clean(x.head, 24))
      .slice(0, 3)
      .map((x, i) => ({ head: clean(x.head, 24), paper: isInt(x.paper, 0, PAPERS.length) ? x.paper : 5 + i, by: clean(x.by, 16) || "Someone" }));
    return {
      group: clean(P.group, 40) || "the group", size: clean(P.size, 8), heads, board,
      week: { flyers: count(P.week?.flyers), tabs: count(P.week?.tabs) },
      head: 0, paper: 0, sticker: 0, edAt: 0, by: null, at: 0, tabs: blank(),
    };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const draft = s.by === null;
    switch (a.t) {
      case "head":
        if (!draft || s.heads.length < 2) return s;
        return { ...s, head: (s.head + 1) % s.heads.length, edAt: m.time };
      case "paper":
        if (!draft || !isInt(a.i, 0, 5) || a.i === s.paper) return s;
        return { ...s, paper: a.i };
      case "sticker":
        if (!draft || !isInt(a.i, 0, 3) || a.i === s.sticker) return s;
        return { ...s, sticker: a.i };
      case "pin":
        if (!draft) return s;
        return { ...s, by: m.user, at: m.time, tabs: blank() };
      case "tear": {
        if (draft || m.user === s.by || !isInt(a.i, 0, TABS) || s.tabs[a.i] !== null || held(s, m.user) >= 0) return s;
        const i = a.i;
        return { ...s, tabs: s.tabs.map((x, k) => (k === i ? { by: m.user, at: m.time } : x)) };
      }
      case "back": {
        const k = held(s, m.user);
        if (draft || k < 0) return s;
        return { ...s, tabs: s.tabs.map((x, j) => (j === k ? null : x)) };
      }
      case "again": {
        if (draft || m.user !== s.by) return s;
        const name = clean(ctx.members.find((x) => x.id === m.user)?.name, 16) || "Someone";
        const old = { head: s.heads[s.head]!.head, paper: s.paper, by: name };
        return { ...s, board: [old, ...s.board].slice(0, 3), head: (s.head + 1) % s.heads.length, edAt: m.time, paper: 0, sticker: 0, by: null, at: 0, tabs: blank() };
      }
    }
    return s;
  },

  onMembers: (s, ctx) => {
    if (s.by !== null && !inChat(ctx, s.by)) return { ...s, by: null, at: 0, tabs: blank() };
    if (s.tabs.every((x) => x === null || inChat(ctx, x.by))) return s;
    return { ...s, tabs: s.tabs.map((x) => (x !== null && !inChat(ctx, x.by) ? null : x)) };
  },

  invariants: {
    "draft picks are in range": (s) => isInt(s.head, 0, s.heads.length) && isInt(s.paper, 0, 5) && isInt(s.sticker, 0, 3),
    "six tabs": (s) => s.tabs.length === 6,
    "a draft has no tabs and no pin time": (s) => s.by !== null || (s.at === 0 && s.tabs.every((x) => x === null)),
    "one tab each, never the author's": (s) => {
      const who = s.tabs.flatMap((x) => (x ? [x.by] : []));
      return new Set(who).size === who.length && !who.includes(s.by ?? "");
    },
    "people are in the chat": (s, ctx) => (s.by === null || ctx.members.some((m) => m.id === s.by)) && s.tabs.every((x) => x === null || ctx.members.some((m) => m.id === x.by)),
    "board holds three at most": (s) => s.board.length <= 3 && s.board.every((o) => isInt(o.paper, 0, 8)),
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
    "a pinned flyer's look is fixed": (p, n) => p.by === null || n.by === null || (p.head === n.head && p.paper === n.paper && p.sticker === n.sticker),
    "headline cycles by one": (p, n, a, m, ctx) => {
      if (a.t !== "head") return true;
      const ok = ctx.members.some((x) => x.id === m.user) && p.by === null && p.heads.length > 1;
      return p === n ? !ok : ok && n.head === (p.head + 1) % p.heads.length && n.edAt === m.time && n.paper === p.paper && n.by === null;
    },
    "paper and sticker set what was asked": (p, n, a, m, ctx) => {
      if (a.t !== "paper" && a.t !== "sticker") return true;
      const key = a.t;
      const max = key === "paper" ? 5 : 3;
      const ok = ctx.members.some((x) => x.id === m.user) && p.by === null && typeof a.i === "number" && Number.isInteger(a.i) && a.i >= 0 && a.i < max && a.i !== p[key];
      return p === n ? !ok : ok && n[key] === a.i && n.head === p.head && n.by === null && JSON.stringify(n.tabs) === JSON.stringify(p.tabs);
    },
    "pinning makes the actor the author": (p, n, a, m, ctx) => {
      if (a.t !== "pin") return true;
      const ok = ctx.members.some((x) => x.id === m.user) && p.by === null;
      return p === n ? !ok : ok && n.by === m.user && n.at === m.time && n.head === p.head && n.tabs.length === 6 && n.tabs.every((x) => x === null);
    },
    "a tear takes exactly the tab asked, once": (p, n, a, m, ctx) => {
      if (a.t !== "tear") return true;
      const i = a.i;
      const had = p.tabs.some((x) => x !== null && x.by === m.user);
      const ok = ctx.members.some((x) => x.id === m.user) && p.by !== null && p.by !== m.user && typeof i === "number" && Number.isInteger(i) && i >= 0 && i < 6 && p.tabs[i] === null && !had;
      if (p === n) return !ok;
      const t = n.tabs[i];
      const others = (s: State) => JSON.stringify(s.tabs.filter((_x, k) => k !== i));
      return ok && !!t && t.by === m.user && t.at === m.time && others(p) === others(n) && n.by === p.by && n.tabs.length === 6;
    },
    "putting back frees only the actor's tab": (p, n, a, m, ctx) => {
      if (a.t !== "back") return true;
      const k = p.tabs.findIndex((x) => x !== null && x.by === m.user);
      const ok = ctx.members.some((x) => x.id === m.user) && p.by !== null && k >= 0;
      if (p === n) return !ok;
      return ok && n.tabs[k] === null && n.tabs.every((x, j) => j === k || JSON.stringify(x) === JSON.stringify(p.tabs[j])) && n.by === p.by;
    },
    "only the author makes another, and the old one goes on the board": (p, n, a, m, ctx) => {
      if (a.t !== "again") return true;
      const ok = ctx.members.some((x) => x.id === m.user) && p.by !== null && p.by === m.user;
      if (p === n) return !ok;
      const top = n.board[0];
      return ok && n.by === null && n.at === 0 && !!top && top.head === p.heads[p.head]!.head && top.paper === p.paper &&
        n.board.length === Math.min(3, p.board.length + 1) && n.head === (p.head + 1) % p.heads.length && n.tabs.every((x) => x === null);
    },
    "tabs change only by tearing, putting back or a new flyer": (p, n, a) =>
      a.t === "tear" || a.t === "back" || a.t === "again" || a.t === "pin" || JSON.stringify(p.tabs) === JSON.stringify(n.tabs),
  },

  arbitrary: (s, u, r) => {
    const k = r.next();
    if (s.by === null) {
      if (k < 0.25) return { t: "head" };
      if (k < 0.45) return { t: "paper", i: r.int(5) };
      if (k < 0.6) return { t: "sticker", i: r.int(3) };
      return { t: "pin" };
    }
    if (u === s.by) return k < 0.15 ? { t: "again" } : { t: "tear", i: r.int(TABS) };
    if (held(s, u) >= 0) return k < 0.3 ? { t: "back" } : { t: "tear", i: r.int(TABS) };
    if (k < 0.85) {
      const from = r.int(TABS);
      for (let j = 0; j < TABS; j++) if (s.tabs[(from + j) % TABS] === null) return { t: "tear", i: (from + j) % TABS };
    }
    return { t: "tear", i: r.int(TABS) };
  },

  local: {},

  view: ({ state, confirmed, me, members, dispatch, theme }) => {
    const c = theme.color;
    const W = Math.min(innerWidth(), theme.width - 24);
    const nameOf = (id: string) => members.find((x) => x.id === id)?.name ?? "Someone";
    const first = (id: string) => nameOf(id).split(" ")[0] ?? "";
    const head = state.heads[state.head] ?? { head: "", sub: "" };
    const draft = state.by === null;
    const fw = Math.min(176, Math.round(W * 0.477));
    const H = 252;

    const star = (cx: number, cy: number, r: number) => {
      const pts: string[] = [];
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 ? r * 0.72 : r;
        pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
      }
      return pts.join(" ");
    };

    const sticker = (kind: number, sz: number) => {
      const d = sz * 2.1;
      const o = d / 2;
      const fs = Math.max(sz * 0.55, 10);
      if (kind === 0)
        return (
          <svg width={d} height={d} viewBox={`0 0 ${d} ${d}`} aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
            <g class="fw-spin" style={{ transformOrigin: `${o}px ${o}px` }}>
              <polygon points={star(o, o, sz)} fill={BURST} />
            </g>
            <g transform={`rotate(-11 ${o} ${o})`}>
              <text x={o} y={o + 0.02 * fs} fill={BURST_TEXT} font-family={IMPACT} font-size={fs} text-anchor="middle" dominant-baseline="central">
                YES!
              </text>
            </g>
          </svg>
        );
      if (kind === 1)
        return (
          <svg width={d} height={d} viewBox={`0 0 ${d} ${d}`} aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
            <g class="fw-spin" style={{ transformOrigin: `${o}px ${o}px` }}>
              {Array.from({ length: 10 }, (_, i) => {
                const a = (i / 10) * Math.PI * 2;
                return <line key={i} x1={o + Math.cos(a) * sz * 0.75} y1={o + Math.sin(a) * sz * 0.75} x2={o + Math.cos(a) * sz} y2={o + Math.sin(a) * sz} stroke={RAYS} stroke-width={sz * 0.12} stroke-linecap="round" />;
              })}
            </g>
            <circle cx={o} cy={o} r={sz * 0.62} fill={SUN} />
            <circle cx={o - sz * 0.2} cy={o - sz * 0.1} r={sz * 0.07} fill={INK} />
            <circle cx={o + sz * 0.2} cy={o - sz * 0.1} r={sz * 0.07} fill={INK} />
            <path d={`M ${o - sz * 0.276} ${o + sz * 0.137} A ${sz * 0.3} ${sz * 0.3} 0 0 0 ${o + sz * 0.276} ${o + sz * 0.137}`} fill="none" stroke={INK} stroke-width={sz * 0.08} stroke-linecap="round" />
          </svg>
        );
      const q = [[0.15, -1], [-0.5, 0.1], [-0.05, 0.1], [-0.2, 1], [0.5, -0.15], [0.05, -0.15]].map(([x, y]) => `${(o + x! * sz).toFixed(1)},${(o + y! * sz).toFixed(1)}`).join(" ");
      return (
        <svg width={d} height={d} viewBox={`0 0 ${d} ${d}`} aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
          <g class="fw-wob" style={{ transformOrigin: `${o}px ${o}px` }}>
            <polygon points={q} fill={BOLT} />
          </g>
        </svg>
      );
    };

    // The flyer: paper body with headline, rule, detail and sticker; six tear-off tabs along the bottom.
    const flyer = (o: { w: number; paper: number; stick: number; tabs: (Tear | null)[]; name: string; live: boolean; bounce: number }) => {
      const s = o.w / 176;
      const col = PAPERS[o.paper] ?? PAPERS[0]!;
      const th = 46 * s;
      const bh = 238 * s - th;
      const hf = fitText(head.head, (o.w - 16 * s) / 0.74, { size: 30 * s, min: 12, weight: 700 });
      const hs = hf.size;
      const subSize = Math.max(12.5 * s, 11);
      const tw = o.w / TABS;
      const subTop = 12 * s + hs * 1.1 + 4 * s + 2 * s + 6 * s;
      const cpl = Math.max(8, Math.floor((o.w - 20 * s) / (subSize * 0.52)));
      const lines = Math.min(4, Math.ceil(head.sub.length / cpl));
      const stickTop = subTop + lines * subSize * 1.25;
      const ss = 26 * s;
      const sy = Math.max(stickTop + ss * 0.9, (stickTop + bh) / 2);
      const label = `DM ${o.name}`;
      const lf = fitText(label, th - 6, { size: Math.max(10.5 * s, 9), min: 8 });
      const tl = lf.text.endsWith("…") ? "DM" : label;
      const ts = lf.text.endsWith("…") ? Math.max(10.5 * s, 9) : lf.size;
      return (
        <div style={{ position: "relative", width: o.w, height: 238 * s }}>
          <div style={{ position: "absolute", left: 2, top: 4, width: o.w, height: bh, borderRadius: 2, background: pal().dark, opacity: 0.2 }} />
          <div style={{ position: "absolute", left: 0, top: 0, width: o.w, height: bh, borderRadius: 2, background: col, overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 8 * s, right: 8 * s, top: 12 * s - hs * 0.075, textAlign: "center", transform: `scale(${0.85 + 0.15 * o.bounce})` }}>
              <div style={{ fontFamily: IMPACT, fontSize: hs, lineHeight: `${hs * 1.25}px`, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: 0.2 }}>{head.head}</div>
            </div>
            <div style={{ position: "absolute", left: 12 * s, right: 12 * s, top: 12 * s + hs * 1.1 + 4 * s, height: Math.max(1.5, 2 * s), background: INK }} />
            <div style={{ position: "absolute", left: 10 * s, right: 10 * s, top: subTop, fontSize: subSize, lineHeight: `${subSize * 1.25}px`, color: INK2, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {head.sub}
            </div>
            <div style={{ position: "absolute", left: o.w / 2 - ss * 1.05, top: sy - ss * 1.05 }}>{sticker(o.stick, ss)}</div>
          </div>
          {o.tabs.map((t, i) => {
            const x = i * tw;
            const tk = t && t.at > 0 ? running(t.at, 700) : null;
            const k = tk === null ? 1 : FLICK(tk);
            const box = { position: "absolute", left: x, top: bh, width: tw - 1.5, height: th } as const;
            if (t) {
              return (
                <div key={i} style={box}>
                  {o.live ? (
                    <button type="button" class="fw-hit" aria-label={`Tab torn by ${first(t.by)}`} onClick={() => t.by === me && dispatch({ t: "back" })}
                      style={{ position: "absolute", inset: 0, padding: 0, border: 0, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: t.by === me ? "pointer" : "default" }}>
                      <span style={{ transform: `scale(${tk === null ? 1 : Math.min(1, k * 1.6)})`, borderRadius: 99, boxShadow: t.by === me ? `0 0 0 2px ${c.primary}` : "none", display: "flex" }}>
                        <Avatar user={t.by} size={Math.min(18, tw - 6)} />
                      </span>
                    </button>
                  ) : null}
                  {tk !== null && k < 1 ? (
                    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", transform: `translate(${k * 30}px, ${-k * 40 + k * k * 60}px)` }}>
                      <div style={{ position: "absolute", inset: 0, background: col, borderTop: `1px dashed ${INK2}`, transform: `rotate(${k * 2}rad)`, opacity: 1 - k }} />
                      <span style={{ position: "absolute", left: (tw - 1.5) / 2 - 8, top: -20, display: "flex" }}><Avatar user={t.by} size={16} /></span>
                    </div>
                  ) : null}
                </div>
              );
            }
            const inner = (
              <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: ts, lineHeight: `${ts + 2}px`, color: INK2, whiteSpace: "nowrap" }}>{tl}</span>
            );
            const canTear = o.live && state.by !== me && held(state, me) < 0;
            return (
              <div key={i} style={{ ...box, background: col, borderRadius: "0 0 1px 1px" }}>
                <svg aria-hidden="true" width={tw - 1.5} height={2} style={{ position: "absolute", left: 0, top: 0, display: "block" }}>
                  <line x1={0} y1={0.5} x2={tw - 1.5} y2={0.5} stroke={INK} stroke-opacity={0.5} stroke-width={1} stroke-dasharray="3 2" />
                </svg>
                {o.live ? (
                  <button type="button" class="fw-hit" aria-label={`Tab ${i + 1}: ${label}`} aria-disabled={canTear ? undefined : "true"}
                    onClick={() => {
                      if (!canTear) return;
                      dispatch({ t: "tear", i });
                      haptic("light");
                    }}
                    style={{ position: "absolute", inset: 0, padding: 0, border: 0, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: canTear ? "pointer" : "default", font: "inherit" }}>
                    {inner}
                  </button>
                ) : (
                  <div aria-hidden="true" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{inner}</div>
                )}
              </div>
            );
          })}
        </div>
      );
    };

    const pinGlyph = (size: number, fill: string) => (
      <svg width={size} height={size * 1.4} viewBox="0 0 10 14" aria-hidden="true" style={{ display: "block" }}>
        <line x1={5} y1={5} x2={5} y2={13.5} stroke={mix(fill, c.text, 0.45)} stroke-width={1.6} stroke-linecap="round" />
        <circle cx={5} cy={4.5} r={4.2} fill={fill} />
        <circle cx={3.6} cy={3.2} r={1.1} fill={c.card} opacity={0.6} />
      </svg>
    );

    const label15 = (t: string, y: number, x: number) => (
      <div style={{ position: "absolute", left: x, top: y, fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text }}>{t}</div>
    );

    const editor = () => {
      const s = fw / 176;
      const be = state.edAt > 0 ? running(state.edAt, 350) : null;
      const bounce = be === null ? 1 : BOUNCE(be);
      const x0 = fw + 20;
      const cw = W - x0 - 4;
      const sw = Math.min(36, (cw - 24) / 5);
      const bw = Math.min(64, (cw - 12) / 3);
      const ySw = 96;
      const yStk = ySw + sw + 14;
      return (
        <div style={{ position: "relative", height: Math.min(H, Math.max(Math.ceil(238 * s) + 12, yStk + 24 + bw + 6)) }}>
          <div style={{ position: "absolute", left: 6, top: 6 }}>
            {flyer({ w: fw, paper: state.paper, stick: state.sticker, tabs: blank(), name: first(me), live: false, bounce })}
            <button type="button" class="fw-head" aria-label="Next headline" onClick={() => dispatch({ t: "head" })}
              style={{ position: "absolute", left: 0, top: 0, width: fw, height: 120 * s, padding: 0, border: 0, background: "transparent", borderRadius: 4, cursor: "pointer" }} />
          </div>
          {label15("Headline", 6, x0)}
          <button type="button" class="fw-btn fw-tall" onClick={() => dispatch({ t: "head" })}
            style={{ position: "absolute", left: x0, top: 28, width: cw, height: 32, border: 0, borderRadius: 8, background: c.secondaryButton, color: c.secondaryButtonText, fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: 0, font: "inherit", cursor: "pointer" }}>
            <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden="true">
              <path d="M11.5 5.5A5 5 0 1 0 12 8" fill="none" stroke={c.secondaryButtonText} stroke-width={1.8} stroke-linecap="round" />
              <path d="M12.5 1.8v4h-4" fill="none" stroke={c.secondaryButtonText} stroke-width={1.8} stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span style={{ fontWeight: 600 }}>Tap flyer to change</span>
          </button>
          {label15("Paper", 72, x0)}
          {PAPER_NAMES.map((nm, k) => (
            <button key={nm} type="button" class="fw-hit fw-sw" aria-label={`${nm} paper`} aria-pressed={state.paper === k ? "true" : "false"} onClick={() => dispatch({ t: "paper", i: k })}
              style={{ position: "absolute", left: x0 + k * (sw + 6), top: ySw, width: sw, height: sw, padding: 0, border: 0, background: "transparent", cursor: "pointer" }}>
              <span style={{ position: "absolute", inset: 2, borderRadius: 99, background: PAPERS[k], boxShadow: `inset 0 0 0 1px ${mix(c.divider, c.text, 0.25)}` }} />
              {state.paper === k ? <span style={{ position: "absolute", inset: -3.5, borderRadius: 99, boxShadow: `inset 0 0 0 2.5px ${c.primary}` }} /> : null}
            </button>
          ))}
          {label15("Sticker", yStk, x0)}
          {STICKERS.map((nm, k) => (
            <button key={nm} type="button" class="fw-hit fw-tile" aria-label={`${nm} sticker`} aria-pressed={state.sticker === k ? "true" : "false"} onClick={() => dispatch({ t: "sticker", i: k })}
              style={{ position: "absolute", left: x0 + k * (bw + 6), top: yStk + 24, width: bw, height: bw, padding: 0, border: 0, borderRadius: 12, cursor: "pointer",
                background: state.sticker === k ? c.selected : c.secondaryButton, boxShadow: state.sticker === k ? `inset 0 0 0 1px ${c.primary}` : "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {sticker(k, bw * 0.34)}
            </button>
          ))}
        </div>
      );
    };

    const board = () => {
      const side = Math.max(60, Math.min(96, (W - 186) / 2));
      const tw = 150;
      const tx = W / 2 + 4 - tw / 2;
      const ty = H / 2 + 4 - 102;
      const fa = confirmed.at > 0 && confirmed.by === state.by ? running(confirmed.at, 600) : null;
      const k = fa === null ? 1 : FLY(fa);
      const fromX = 6, fromY = 6;
      const x = fromX + (tx - fromX) * k;
      const y = fromY + (ty - fromY) * k;
      const sc = (fw + (tw - fw) * k) / tw;
      const pe = confirmed.at > 0 ? running(confirmed.at + 600, 250) : null;
      const pk = confirmed.at > 0 && running(confirmed.at, 600) !== null ? 0 : pe === null ? 1 : DROP(pe);
      const others = state.board.map((o, i) => {
        const spots = [
          { x: 10, y: 14, w: side, h: 100, rot: -0.05, pin: c.series4 },
          { x: 14, y: 130, w: side - 4, h: 104, rot: 0.04, pin: c.series1 },
          { x: W - side - 10, y: 24, w: side - 2, h: 120, rot: 0.035, pin: c.series3 },
        ];
        return { ...o, ...spots[i]! };
      });
      const tornN = torn(state);
      return (
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={`Group corkboard with ${others.length + 1} flyers`}
            draw={(g, f) => {
              const p = pal(f.theme);
              const cork = mix(mix(p.crust, p.brown, f.theme.mode === "dark" ? 0.55 : 0.3), f.theme.color.secondaryText, 0.22);
              const bw = f.width - 4, bh = f.height - 4;
              g.fillStyle = cork;
              g.beginPath();
              g.roundRect(2, 2, bw, bh, 12);
              g.fill();
              g.fillStyle = p.brown;
              g.globalAlpha = 0.5;
              for (let i = 0; i < 140; i++) {
                const hx = (Math.imul(i, 2654435761) >>> 7) % 1000;
                const hy = ((Math.imul(i, 40503) + 977) ^ (i << 5)) % 1000;
                g.beginPath();
                g.arc(10 + (hx / 1000) * (bw - 16), 10 + (hy / 1000) * (bh - 16), 1.2, 0, Math.PI * 2);
                g.fill();
              }
              g.globalAlpha = 1;
              for (const o of others) {
                g.save();
                g.translate(o.x + o.w / 2, o.y + o.h / 2);
                g.rotate(o.rot);
                g.globalAlpha = 0.22;
                g.fillStyle = p.dark;
                g.fillRect(-o.w / 2 + 2, -o.h / 2 + 3, o.w, o.h);
                g.globalAlpha = 1;
                g.fillStyle = PAPERS[o.paper] ?? PAPERS[5]!;
                g.fillRect(-o.w / 2, -o.h / 2, o.w, o.h);
                // headline, wrapped by words, each line fitted
                g.fillStyle = INK;
                g.textAlign = "center";
                g.textBaseline = "top";
                const words = o.head.split(" ");
                const lines: string[] = [];
                g.font = `15px ${IMPACT}`;
                for (const wd of words) {
                  const cur = lines[lines.length - 1];
                  if (cur !== undefined && g.measureText(`${cur} ${wd}`).width <= o.w - 14) lines[lines.length - 1] = `${cur} ${wd}`;
                  else lines.push(wd);
                }
                const shown = lines.slice(0, 3);
                shown.forEach((ln, j) => {
                  const ft = fitText(ln, o.w - 14, { g, size: 15, min: 9, family: IMPACT });
                  g.fillText(ft.text, 0, -o.h / 2 + 12 + j * 18);
                });
                const gh = shown.length * 18;
                g.strokeStyle = INK2;
                g.globalAlpha = 0.35;
                g.lineWidth = 2;
                for (let l = 0; l < 3; l++) {
                  const ly = -o.h / 2 + 18 + gh + l * 9;
                  if (ly < o.h / 2 - 34) {
                    g.beginPath();
                    g.moveTo(-o.w / 2 + 12, ly);
                    g.lineTo(o.w / 2 - 12 - l * 14, ly);
                    g.stroke();
                  }
                }
                g.globalAlpha = 1;
                // the poster's face
                g.fillStyle = userColor(`g:${o.by}`, f.theme);
                g.beginPath();
                g.arc(0, o.h / 2 - 18, 9, 0, Math.PI * 2);
                g.fill();
                g.fillStyle = f.theme.color.onPrimary;
                g.textBaseline = "middle";
                g.font = `600 10px ${f.theme.type.family}`;
                g.fillText((o.by[0] ?? "?").toUpperCase(), 0, o.h / 2 - 17.5);
                // pin
                g.fillStyle = mix(o.pin, f.theme.color.text, 0.4);
                g.fillRect(-0.8, -o.h / 2 + 3, 1.6, 7);
                g.fillStyle = o.pin;
                g.beginPath();
                g.arc(0, -o.h / 2 + 2, 4.5, 0, Math.PI * 2);
                g.fill();
                g.restore();
              }
            }} />
          <div role="group" aria-label={`Flyer: ${head.head}, ${tornN} of 6 tabs torn`} style={{ position: "absolute", left: tx, top: ty, transformOrigin: "0 0", transform: `translate(${x - tx}px, ${y - ty}px) scale(${sc})` }}>
            {flyer({ w: tw, paper: state.paper, stick: state.sticker, tabs: state.tabs, name: first(state.by ?? me), live: true, bounce: 1 })}
            <div style={{ position: "absolute", left: tw / 2 - 8, top: -7 - (1 - pk) * 20, opacity: pk, pointerEvents: "none" }}>{pinGlyph(16, c.primary)}</div>
          </div>
        </div>
      );
    };

    // Actions
    const pill = (text: string, withPin: boolean, flex: number) => (
      <div style={{ flex, minWidth: 0, height: 36, borderRadius: 8, background: mix(c.card, c.positive, 0.15), display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "0 10px" }}>
        {withPin ? pinGlyph(11, c.primary) : null}
        <span style={{ fontSize: 15, fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</span>
      </div>
    );
    const mineTab = held(state, me);
    const free = state.tabs.findIndex((x) => x === null);
    let actions;
    if (draft) {
      actions = (
        <Button kind="primary" wide onClick={() => {
          dispatch({ t: "pin" });
          haptic("success");
        }}>Pin to the group</Button>
      );
    } else if (state.by === me) {
      actions = (
        <div style={{ display: "flex", gap: 8 }}>
          {pill("Pinned", true, 1)}
          <div style={{ flex: 1, display: "flex" }}>
            <Button wide onClick={() => dispatch({ t: "again" })}>Make another</Button>
          </div>
        </div>
      );
    } else {
      actions = (
        <div style={{ display: "flex", gap: 8 }}>
          {pill(`Pinned by ${first(state.by!)}`, true, 1)}
          {mineTab >= 0 ? (
            <div style={{ flex: 1, display: "flex" }}><Button wide onClick={() => dispatch({ t: "back" })}>Put back</Button></div>
          ) : free < 0 ? (
            pill("All tabs taken", false, 1)
          ) : (
            <div style={{ flex: 1, display: "flex" }}>
              <Button kind="primary" wide onClick={() => {
                dispatch({ t: "tear", i: free });
                haptic("light");
              }}>Tear one</Button>
            </div>
          )}
        </div>
      );
    }

    // Activity line
    const tearers = state.tabs.filter((x): x is Tear => x !== null).sort((a, b) => b.at - a.at).map((x) => x.by);
    let faces;
    let line: string;
    if (draft) {
      faces = state.board.length ? <Facepile users={[...new Set(state.board.map((o) => o.by))].map((by) => ({ id: `g:${by}`, name: by }))} max={3} size={18} /> : null;
      line = `${state.week.flyers} flyers pinned this week · ${state.week.tabs} tabs torn`;
    } else if (!tearers.length) {
      faces = <Avatar user={state.by!} size={18} />;
      line = `Pinned for ${state.size ? `${state.size} members` : "the group"} · waiting for the first tab`;
    } else {
      faces = <Facepile users={tearers} max={4} size={18} />;
      line = tearers.length === 1 ? `${first(tearers[0]!)} tore a tab` : `${first(tearers[0]!)} + ${tearers.length - 1} more tore tabs`;
    }

    const toast = confirmed.by === me && confirmed.at > 0 && running(confirmed.at, 2400) !== null;

    return (
      <div>
        <style>{".fw-hit::after{content:'';position:absolute;left:50%;top:50%;width:44px;height:44px;transform:translate(-50%,-50%)}.fw-tall{position:absolute}.fw-tall::after{content:'';position:absolute;left:0;right:0;top:-6px;bottom:-6px}.fw-head:hover{box-shadow:inset 0 0 0 1.5px var(--color-primary)}.fw-btn:hover,.fw-tile:hover{filter:brightness(0.96)}.fw-spin{animation:fwSpin 24s linear infinite}.fw-wob{animation:fwWob 1s ease-in-out infinite alternate}@keyframes fwSpin{to{transform:rotate(360deg)}}@keyframes fwWob{from{transform:rotate(-3deg)}to{transform:rotate(3deg)}}@media (prefers-reduced-motion:reduce){.fw-spin,.fw-wob{animation:none}}"}</style>
        <CardHeader title="Flyer maker" subtitle={[state.group, state.size ? `${state.size} members` : ""].filter(Boolean).join(" · ")} />
        {draft ? editor() : board()}
        <div style={{ height: 8 }} />
        <div style={{ padding: "2px 0" }}>{actions}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26, marginTop: 4, padding: "0 4px", minWidth: 0 }}>
          {faces}
          <span style={{ fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{line}</span>
        </div>
        {toast ? <Toast key={confirmed.at}>{`Pinned to ${state.group}`}</Toast> : null}
      </div>
    );
  },
});
