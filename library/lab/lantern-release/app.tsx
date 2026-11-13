import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
  Facepile,
  fitText,
  haptic,
  mix,
  pal,
  running,
  seedOf,
  userColor,
  type Ctx,
  type Member,
} from "@muse/app";

// Something to leave open at the end of the semester: a night sky over the lake where each friend
// lets a paper lantern go with one wish for next year. Lanterns drift and glow on their own; tap
// one to read its wish and warm it, or write yours and watch it rise off the shore.

type Params = {
  /** Card title */
  title: string;
  /** Where the lake is, under the title */
  place: string;
  /** Lanterns already up: who, and their wish in their words */
  lanterns: { by: string; wish: string; warmed: string[] }[];
  /** Suggested wish shown in the empty box */
  hint: string;
};

// @params
const P: Params = {
  title: "Wishes for next year",
  place: "Lake Wren · last night of the semester",
  lanterns: [
    { by: "Calvin", wish: "wake up on the first alarm", warmed: ["Maya", "Will", "Arun"] },
    { by: "Arun", wish: "a second rice cooker", warmed: ["Calvin"] },
    { by: "Maya", wish: "a spreadsheet for 2027", warmed: ["Tsai Lin"] },
    { by: "Will", wish: "showers under 20 min (maybe)", warmed: ["Calvin", "Tsai Lin"] },
    { by: "Tsai Lin", wish: "the aux, forever", warmed: [] },
  ],
  hint: "one wish for next year",
};
// @end params

type Lantern = { user: string; by: string; wish: string; warmed: string[]; at: number };
type State = { title: string; place: string; hint: string; lanterns: Lantern[] };
type Action = { t: "light"; wish: string } | { t: "warm"; who: string };
type Local = { open: string; draft: string };

const SKY_H = 236;
const RISE_MS = 4200;
const WISH_LEN = 36;
const MAX = 24;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const standIn = (u: string) => u.startsWith("~");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const r1 = (n: number) => Math.round(n * 10) / 10;

function initState(ctx: Ctx): State {
  const idFor = (name: string) => ctx.members.find((m) => m.id === name || m.name.toLowerCase() === name.toLowerCase())?.id ?? `~${name}`;
  const lanterns: Lantern[] = [];
  for (const l of Array.isArray(P.lanterns) ? P.lanterns : []) {
    const by = clean(l?.by, 16);
    const wish = clean(l?.wish, WISH_LEN);
    if (!by || !wish || lanterns.length >= MAX) continue;
    const user = idFor(by);
    if (lanterns.some((x) => x.user === user)) continue;
    const warmed: string[] = [];
    for (const w of Array.isArray(l?.warmed) ? l.warmed : []) {
      const u = idFor(clean(w, 16));
      if (u !== user && !warmed.includes(u)) warmed.push(u);
    }
    lanterns.push({ user, by: ctx.members.find((m) => m.id === user)?.name ?? by, wish, warmed, at: 0 });
  }
  return { title: clean(P.title, 40) || "Lanterns", place: clean(P.place, 48), hint: clean(P.hint, WISH_LEN) || "a wish", lanterns };
}

/** Where a lantern hangs at rest: spread over the sky by its order, nudged by its owner. */
function spot(i: number, n: number, user: string, W: number) {
  const s = seedOf(user);
  const cols = Math.max(3, Math.ceil(Math.sqrt(n * 2)));
  const col = i % cols;
  const row = Math.floor(i / cols);
  const x = ((col + 0.5) / cols) * W + (((s % 21) - 10) * W) / 400;
  const y = 34 + row * 62 + ((s >> 5) % 20) + (col % 2) * 26;
  return { x, y: Math.min(y, SKY_H - 96) };
}

export default defineApp<State, Action, Local>({
  name: "Lantern release",
  summary: (s) => (s.lanterns.length ? `${s.lanterns.length} lanterns up over the lake · ${s.lanterns.reduce((n, l) => n + l.warmed.length, 0)} warmed` : "The lake is dark · first lantern goes up with a wish"),

  init: (ctx) => initState(ctx),

  reduce: (state, action, meta, ctx) => {
    const me = ctx.members.find((m) => m.id === meta.user);
    if (!me) return state;
    if (action.t === "light") {
      if (typeof action.wish !== "string" || state.lanterns.length >= MAX || state.lanterns.some((l) => l.user === meta.user)) return state;
      const wish = action.wish.trim().replace(/\s+/g, " ").slice(0, WISH_LEN);
      if (!wish) return state;
      return { ...state, lanterns: [...state.lanterns, { user: meta.user, by: clean(me.name, 16) || "Friend", wish, warmed: [], at: meta.time }] };
    }
    if (action.t === "warm") {
      if (typeof action.who !== "string" || action.who === meta.user) return state;
      const l = state.lanterns.find((x) => x.user === action.who);
      if (!l) return state;
      const warmed = l.warmed.includes(meta.user) ? l.warmed.filter((u) => u !== meta.user) : [...l.warmed, meta.user];
      return { ...state, lanterns: state.lanterns.map((x) => (x.user === l.user ? { ...x, warmed } : x)) };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    let changed = false;
    const lanterns = state.lanterns.map((l) => {
      const warmed = l.warmed.filter((u) => standIn(u) || inChat(ctx, u));
      if (warmed.length === l.warmed.length) return l;
      changed = true;
      return { ...l, warmed };
    });
    return changed ? { ...state, lanterns } : state;
  },

  invariants: {
    "one lantern each": (s) => new Set(s.lanterns.map((l) => l.user)).size === s.lanterns.length && s.lanterns.length <= MAX,
    "wishes are 1 to 36 characters": (s) => s.lanterns.every((l) => l.wish.length >= 1 && l.wish.length <= WISH_LEN && l.wish === l.wish.trim()),
    "warmth once per person, never your own": (s) => s.lanterns.every((l) => new Set(l.warmed).size === l.warmed.length && !l.warmed.includes(l.user)),
    "warmth from the chat or the post": (s, ctx) => s.lanterns.every((l) => l.warmed.every((u) => standIn(u) || inChat(ctx, u))),
  },

  transitions: {
    "lighting adds only my lantern": (p, n, a, m) => {
      if (a.t !== "light" || p === n) return true;
      const last = n.lanterns[n.lanterns.length - 1];
      return n.lanterns.length === p.lanterns.length + 1 && !!last && last.user === m.user && last.at === m.time && last.warmed.length === 0 && last.wish === String(a.wish).trim().replace(/\s+/g, " ").slice(0, WISH_LEN) && same(p.lanterns, n.lanterns.slice(0, -1));
    },
    "a first wish always goes up": (p, n, a, m, ctx) => a.t !== "light" || !inChat(ctx, m.user) || typeof a.wish !== "string" || !a.wish.trim() || p.lanterns.length >= MAX || p.lanterns.some((l) => l.user === m.user) || p !== n,
    "warming toggles only me on one lantern": (p, n, a, m) => {
      if (a.t !== "warm" || p === n) return true;
      return p.lanterns.every((l, i) => {
        const q = n.lanterns[i]!;
        if (l.user !== a.who) return same(l, q);
        return l.warmed.includes(m.user) !== q.warmed.includes(m.user) && same(l.warmed.filter((u) => u !== m.user), q.warmed.filter((u) => u !== m.user));
      });
    },
    "someone else's lantern can be warmed": (p, n, a, m, ctx) => a.t !== "warm" || !inChat(ctx, m.user) || a.who === m.user || !p.lanterns.some((l) => l.user === a.who) || p !== n,
    "wishes never change": (p, n) => p.lanterns.every((l, i) => n.lanterns[i]?.wish === l.wish && n.lanterns[i]?.user === l.user),
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (!s.lanterns.some((l) => l.user === user) && r.next() < 0.5) return { t: "light", wish: r.pick(["pass orgo", "  road trip  ", "more lake days", "sleep"]) };
    if (s.lanterns.length && r.next() < 0.9) return { t: "warm", who: r.pick(s.lanterns).user };
    return { t: "warm", who: "nobody" };
  },

  local: { open: "", draft: "" },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const person = (u: string): Member => (standIn(u) ? { id: u, name: u.slice(1) } : members.find((m) => m.id === u)) ?? { id: u, name: "Friend" };
    const here = members.some((m) => m.id === me);
    const mine = state.lanterns.find((l) => l.user === me);
    const n = state.lanterns.length;
    const open = state.lanterns.find((l) => l.user === local.open) ?? (mine && mine.at > 0 && running(mine.at, RISE_MS + 2000) !== null ? mine : state.lanterns.reduce<Lantern | undefined>((b, l) => (!b || l.warmed.length > b.warmed.length ? l : b), undefined));
    const sky1 = mix(c.series1, p.dark, 0.85);
    const sky2 = mix(c.series6, p.dark, 0.6);
    const water = mix(c.series1, p.dark, 0.7);
    const shore = SKY_H - 46;
    const glow = p.yellow;

    const placed = state.lanterns.map((l, i) => {
      const s = spot(i, n, l.user, W);
      return { l, ...s };
    });
    const posAt = (pl: (typeof placed)[number], now: number) => {
      const t = now / 1000;
      const ph = (seedOf(pl.l.user) % 628) / 100;
      const e = pl.l.at > 0 ? now - pl.l.at : RISE_MS;
      const k = Math.max(0, Math.min(1, e / RISE_MS));
      const ease = 1 - (1 - k) ** 2;
      const startY = shore + 6;
      const y = startY + (pl.y - startY) * ease + 3 * Math.sin(t * 0.7 + ph);
      const x = pl.x + 5 * Math.sin(t * 0.45 + ph * 2) * (0.4 + 0.6 * ease);
      return { x, y };
    };

    const draw = (g: CanvasRenderingContext2D, f: { now: number; width: number; height: number }) => {
      const now = f.now;
      g.clearRect(0, 0, f.width, f.height);
      // stars
      g.fillStyle = p.cream;
      g.beginPath();
      for (let k = 0; k < 40; k++) {
        const x = Math.abs(Math.sin(k * 12.9898) * 43758.5453 % 1) * f.width;
        const y = Math.abs(Math.sin(k * 78.233) * 12543.21 % 1) * (shore - 40);
        const tw = 0.6 + 0.4 * Math.sin(f.now / 900 + k);
        const r = (k % 4 === 0 ? 1.3 : 0.8) * tw;
        g.moveTo(x + r, y);
        g.arc(x, y, r, 0, Math.PI * 2);
      }
      g.fill();
      // reflections on the water
      g.globalAlpha = 0.7;
      g.fillStyle = glow;
      g.beginPath();
      for (const pl of placed) {
        const q = posAt(pl, now);
        const ry = shore + 18 + (shore - q.y) * 0.08;
        g.moveTo(q.x + 8, ry);
        g.ellipse(q.x, ry, 8, 2.2, 0, 0, Math.PI * 2);
      }
      g.fill();
      // halos, warmer with every friend who warmed it
      for (const pl of placed) {
        const q = posAt(pl, now);
        const r = 30 + pl.l.warmed.length * 5;
        const gr = g.createRadialGradient(q.x, q.y, 4, q.x, q.y, r);
        gr.addColorStop(0, glow);
        gr.addColorStop(1, sky1);
        g.globalAlpha = 0.32;
        g.fillStyle = gr;
        g.beginPath();
        g.arc(q.x, q.y, r, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      // lanterns: paper body in the owner's color, lit from inside
      for (const pl of placed) {
        const q0 = posAt(pl, now);
        g.save();
        g.translate(q0.x, q0.y);
        g.scale(1.3, 1.3);
        const q = { x: 0, y: 0 };
        const body = mix(userColor(person(pl.l.user), theme), glow, 0.55);
        g.fillStyle = body;
        g.beginPath();
        g.moveTo(q.x - 11, q.y - 14);
        g.lineTo(q.x + 11, q.y - 14);
        g.quadraticCurveTo(q.x + 15, q.y, q.x + 9, q.y + 14);
        g.lineTo(q.x - 9, q.y + 14);
        g.quadraticCurveTo(q.x - 15, q.y, q.x - 11, q.y - 14);
        g.fill();
        g.fillStyle = mix(glow, p.cream, 0.5);
        g.beginPath();
        g.ellipse(q.x, q.y + 8, 5, 4, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = mix(body, p.dark, 0.35);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(q.x - 4, q.y - 14);
        g.lineTo(q.x - 3, q.y + 14);
        g.moveTo(q.x + 4, q.y - 14);
        g.lineTo(q.x + 3, q.y + 14);
        g.stroke();
        g.restore();
      }
      return true;
    };

    const openFit = open ? fitText(`"${open.wish}"`, W - 90, { size: 15, weight: 600, min: 11 }) : null;
    const light = () => {
      const wish = (local.draft.trim() || state.hint).slice(0, WISH_LEN);
      dispatch({ t: "light", wish });
      haptic("success");
      setLocal({ draft: "", open: me });
    };
    const warmers = open ? open.warmed : [];
    const iWarmed = open ? open.warmed.includes(me) : false;

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.place || undefined} />
        <div style={{ position: "relative", height: SKY_H, borderRadius: 12, overflow: "hidden", background: sky1 }}>
          <svg width={W} height={SKY_H} viewBox={`0 0 ${W} ${SKY_H}`} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0 }}>
            <rect x={0} y={0} width={W} height={shore} fill={sky1} />
            <defs><linearGradient id={`lrg${theme.mode}${Math.round(W)}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color={sky1} /><stop offset="1" stop-color={sky2} /></linearGradient></defs>
            <rect x={0} y={0} width={W} height={shore} fill={`url(#lrg${theme.mode}${Math.round(W)})`} />
            <circle cx={W - 34} cy={30} r={13} fill={p.cream} />
            <path d={`M0 ${shore} Q${W * 0.2} ${shore - 22} ${W * 0.38} ${shore - 6} Q${W * 0.55} ${shore - 30} ${W * 0.76} ${shore - 8} Q${W * 0.88} ${shore - 18} ${W} ${shore - 4} V${shore} Z`} fill={mix(p.dark, sky1, 0.3)} />
            <rect x={0} y={shore} width={W} height={SKY_H - shore} fill={water} />
            <path d={`M0 ${SKY_H - 10} Q${W * 0.3} ${SKY_H - 22} ${W * 0.55} ${SKY_H - 12} T${W} ${SKY_H - 14} V${SKY_H} H0 Z`} fill={mix(p.dark, p.brown, 0.2)} />
          </svg>
          <div style={{ position: "absolute", inset: 0 }}>
            <Canvas height={SKY_H} label={`${n} lanterns over the lake`} draw={draw} />
          </div>
          {placed.map((pl) => {
            const q = spot(state.lanterns.indexOf(pl.l), n, pl.l.user, W);
            return (
              <button
                key={pl.l.user}
                type="button"
                aria-label={`${pl.l.by}'s lantern: ${pl.l.wish}, ${pl.l.warmed.length} warmed`}
                aria-pressed={open?.user === pl.l.user}
                onClick={() => setLocal({ open: pl.l.user })}
                style={{ position: "absolute", left: r1(q.x - 22), top: r1(q.y - 22), width: 44, height: 44, borderRadius: 22, boxShadow: open?.user === pl.l.user ? `0 0 0 2px ${c.onPrimary}` : "none" }}
              />
            );
          })}
          {placed.map((pl) => {
            const q = spot(state.lanterns.indexOf(pl.l), n, pl.l.user, W);
            return (
              <span key={`a${pl.l.user}`} style={{ position: "absolute", left: r1(q.x + 8), top: r1(q.y + 8), pointerEvents: "none", borderRadius: 8, boxShadow: `0 0 0 1.5px ${sky1}`, display: "inline-flex" }}>
                <Avatar user={person(pl.l.user)} size={16} />
              </span>
            );
          })}
          {n === 0 ? (
            <div style={{ position: "absolute", left: 0, right: 0, top: SKY_H / 2 - 30, textAlign: "center", fontSize: 14, lineHeight: "18px", color: c.onPrimary }}>The sky is waiting for the first lantern</div>
          ) : null}
        </div>

        <div style={{ marginTop: 10, minHeight: 44, display: "flex", alignItems: "center", gap: 8 }}>
          {open ? (
            <>
              <Avatar user={person(open.user)} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: openFit!.size, lineHeight: "20px", fontWeight: 600, color: c.text, whiteSpace: "nowrap" }}>{openFit!.text}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, height: 18 }}>
                  <span style={{ fontSize: 12, color: c.secondaryText, whiteSpace: "nowrap" }}>{`${open.user === me ? "your lantern" : open.by} · ${warmers.length} warmed`}</span>
                  {warmers.length ? <Facepile users={warmers.map(person)} max={3} size={14} /> : null}
                </div>
              </div>
              {here && open.user !== me ? (
                <Button kind={iWarmed ? "secondary" : mine ? "primary" : "secondary"} onClick={() => { dispatch({ t: "warm", who: open.user }); haptic("light"); }}>
                  {iWarmed ? "Warmed" : "Warm it"}
                </Button>
              ) : null}
            </>
          ) : (
            <span style={{ fontSize: 13, color: c.secondaryText }}>{n ? `${n} lanterns up · tap one to read its wish` : "Nobody has let one go yet"}</span>
          )}
        </div>

        {here && !mine ? (
          <form style={{ display: "flex", gap: 8, marginTop: 8 }} onSubmit={(e: Event) => { e.preventDefault(); light(); }}>
            <input aria-label="Your wish for next year" placeholder={state.hint} maxLength={WISH_LEN} value={local.draft} onInput={(e: Event) => setLocal({ draft: (e.currentTarget as HTMLInputElement).value })} style={{ flex: 1 }} />
            <Button kind="primary" onClick={light}>Let it go</Button>
          </form>
        ) : null}
      </div>
    );
  },
});
