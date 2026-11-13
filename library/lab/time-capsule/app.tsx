import { defineApp, Avatar, Burst, Button, Canvas, CardHeader, clock, fitText, haptic, mix, pal, running, tween, userColor, type Ctx, type DrawFrame } from "@muse/app";

// Time capsule: a drawn canister on the grass with folded slips sticking out of it. Each friend
// writes one sealed prediction about someone else and drops it in. Bury it and the capsule sinks
// into the dirt under a little flag with the dig date. On dig day it comes back up, the slips open,
// and the chat marks each one came true or not.

type Params = {
  /** Card title */
  title: string;
  /** The question from the chat */
  question: string;
  /** Dig day, as people say it: "May 10" */
  dig: string;
  /** Dig day as a timestamp in ms; the capsule can't open before it */
  digAt: number;
  /** Slips already in: who wrote it, who it's about, and the prediction in their words */
  slips: { by: string; about: string; text: string }[];
};

// @params
const P: Params = {
  title: "Time capsule",
  question: "where do you think we'll be in may",
  dig: "May 10",
  digAt: 1810000000000,
  slips: [
    { by: "Calvin", about: "Arun", text: "Arun finally buys a second appliance. it's another rice cooker" },
    { by: "Tsai Lin", about: "Maya", text: "Maya runs the half and makes a spreadsheet about it" },
    { by: "Arun", about: "Calvin", text: "Calvin wakes up on the first alarm. once." },
    { by: "Will", about: "Tsai Lin", text: "Tsai Lin lets someone else pick one (1) song" },
  ],
};
// @end params

type Slip = { by: string; about: string; text: string; at: number; came: boolean | null };
type State = { title: string; question: string; dig: string; digAt: number; slips: Slip[]; buriedAt: number; openedAt: number };
type Action = { t: "slip"; about: string; text: string } | { t: "bury" } | { t: "open" } | { t: "call"; i: number; came: boolean };
type Local = { writing: boolean; about: string; draft: string; bursts: number };

const H = 186;
const DAY = 86400000;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const sink = tween({ duration: 1600, easing: "easeInOut" });
const rise = tween({ duration: 900, easing: [0.34, 1.56, 0.64, 1] });

function initState(ctx: Ctx): State {
  const find = (who: unknown) => {
    const n = clean(who, 40).toLowerCase();
    return n ? ctx.members.find((m) => m.id === n || m.name.toLowerCase() === n) : undefined;
  };
  const slips: Slip[] = [];
  for (const s of Array.isArray(P.slips) ? P.slips : []) {
    const by = find(s?.by);
    const about = find(s?.about);
    const text = clean(s?.text, 80);
    if (!by || !about || by.id === about.id || !text || slips.some((x) => x.by === by.id)) continue;
    slips.push({ by: by.id, about: about.id, text, at: 0, came: null });
  }
  return { title: clean(P.title, 40) || "Time capsule", question: clean(P.question, 80), dig: clean(P.dig, 20) || "dig day", digAt: Number.isFinite(P.digAt) && P.digAt > 0 ? Math.round(P.digAt) : 0, slips, buriedAt: 0, openedAt: 0 };
}

export default defineApp<State, Action, Local>({
  name: "Time capsule",
  summary: (s) => {
    if (s.openedAt) return `Time capsule opened · ${s.slips.filter((x) => x.came).length} of ${s.slips.length} came true`;
    if (s.buriedAt) return `Time capsule buried with ${s.slips.length} slips · dig ${s.dig}`;
    return `Time capsule · ${s.slips.length} ${s.slips.length === 1 ? "slip" : "slips"} in · dig ${s.dig}`;
  },
  init: initState,

  reduce: (s, a, meta, ctx) => {
    const u = meta.user;
    if (!inChat(ctx, u)) return s;
    if (a.t === "slip") {
      const text = clean(a.text, 80);
      if (s.buriedAt || !text || typeof a.about !== "string" || a.about === u || !inChat(ctx, a.about) || s.slips.some((x) => x.by === u) || s.slips.length >= 12) return s;
      return { ...s, slips: [...s.slips, { by: u, about: a.about, text, at: meta.time, came: null }] };
    }
    if (a.t === "bury") {
      if (s.buriedAt || s.slips.length < 2 || !s.slips.some((x) => x.by === u)) return s;
      return { ...s, buriedAt: meta.time };
    }
    if (a.t === "open") {
      if (!s.buriedAt || s.openedAt || meta.time < s.digAt) return s;
      return { ...s, openedAt: meta.time };
    }
    if (a.t === "call") {
      if (!s.openedAt || !Number.isInteger(a.i) || a.i < 0 || a.i >= s.slips.length || typeof a.came !== "boolean") return s;
      return { ...s, slips: s.slips.map((x, i) => (i === a.i ? { ...x, came: a.came } : x)) };
    }
    return s;
  },

  invariants: {
    "one slip per person, never about themselves": (s) => new Set(s.slips.map((x) => x.by)).size === s.slips.length && s.slips.every((x) => x.by !== x.about && x.text.length > 0 && x.text.length <= 80),
    "it takes two slips to bury": (s) => s.buriedAt === 0 || s.slips.length >= 2,
    "it opens only after burial, on dig day": (s) => s.openedAt === 0 || (s.buriedAt > 0 && s.openedAt >= s.digAt && s.openedAt >= s.buriedAt),
    "nothing is called before it opens": (s) => s.openedAt > 0 || s.slips.every((x) => x.came === null),
    "at most twelve slips": (s) => s.slips.length <= 12,
  },

  transitions: {
    "only burying buries": (p, n, a) => n.buriedAt === p.buriedAt || (a.t === "bury" && p.buriedAt === 0 && p.slips.length >= 2),
    "only digging opens": (p, n, a) => n.openedAt === p.openedAt || a.t === "open",
    "a slip adds only yours": (p, n, a, m) => a.t !== "slip" || p === n || (n.slips.length === p.slips.length + 1 && n.slips[n.slips.length - 1]!.by === m.user && n.slips[n.slips.length - 1]!.about === a.about && p.buriedAt === 0),
    "only someone with a slip buries it": (p, n, a, m) => a.t !== "bury" || p === n || (p.slips.some((x) => x.by === m.user) && n.buriedAt === m.time),
    "no digging before dig day": (p, n, a, m) => a.t !== "open" || p === n || (m.time >= p.digAt && n.openedAt === m.time),
    "sealed words never change": (p, n) => p.slips.every((x, i) => n.slips[i]?.text === x.text && n.slips[i]?.by === x.by && n.slips[i]?.about === x.about),
    "a call marks only that slip": (p, n, a) => a.t !== "call" || p === n || (n.slips[a.i]!.came === a.came && n.slips.every((x, i) => i === a.i || x.came === p.slips[i]!.came)),
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, u, r, ctx) => {
    const k = r.next();
    if (k > 0.9) return r.pick([{ t: "bury" }, { t: "open" }, { t: "call", i: 0, came: true }] as Action[]);
    const others = ctx.members.filter((m) => m.id !== u);
    if (!s.buriedAt) {
      if (k < 0.7 && others.length) return { t: "slip", about: r.pick(others).id, text: r.pick(["moves to Lisbon", "still lowkey", "owns a dog", ""]) };
      return { t: "bury" };
    }
    if (!s.openedAt) return { t: "open" };
    return { t: "call", i: r.int(Math.max(1, s.slips.length)), came: r.next() < 0.5 };
  },

  local: { writing: false, about: "", draft: "", bursts: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const now = clock.value;
    const buried = state.buriedAt > 0;
    const opened = state.openedAt > 0;
    const mine = state.slips.find((x) => x.by === me);
    const nameOf = (u: string) => (u === me ? "You" : members.find((m) => m.id === u)?.name ?? "Someone");
    const days = Math.max(0, Math.ceil((state.digAt - now) / DAY));
    const canOpen = buried && !opened && now >= state.digAt;
    const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      const w = f.width;
      const grassY = 92;
      // sky, ground, dirt layers
      g.fillStyle = pl.sky;
      g.fillRect(0, 0, w, grassY);
      g.fillStyle = mix(pl.brown, c.card, 0.35);
      g.fillRect(0, grassY, w, H - grassY);
      g.fillStyle = mix(pl.brown, c.card, 0.15);
      g.fillRect(0, grassY + 50, w, H - grassY - 50);
      g.fillStyle = pl.grass;
      g.beginPath();
      g.moveTo(0, grassY + 6);
      for (let x = 0; x <= w; x += 12) g.lineTo(x, grassY - 3 + ((x / 12) % 2) * 4);
      g.lineTo(w, grassY + 6);
      g.closePath();
      g.fill();
      // pebbles
      g.fillStyle = mix(pl.brown, c.card, 0.55);
      g.beginPath();
      for (const [px, py] of [[0.1, 128], [0.32, 160], [0.72, 122], [0.88, 168], [0.18, 175]] as const) {
        g.moveTo(px * w + 4, py);
        g.ellipse(px * w, py, 4, 2.5, 0, 0, Math.PI * 2);
      }
      g.fill();
      // the capsule
      const cx = w / 2;
      const capH = 62;
      const capW = 48;
      const e = buried ? running(state.buriedAt, 1600) : null;
      const sunk = buried ? (e === null ? 1 : sink(e)) : 0;
      const o = opened ? running(state.openedAt, 900) : null;
      const up = opened ? (o === null ? 1 : rise(o)) : 0;
      const depth = sunk * (1 - up);
      const top = grassY - capH + 6 + depth * 78;
      if (depth > 0.05) {
        // the hole/shaft and mound
        g.fillStyle = mix(pl.brown, c.text, 0.25);
        g.fillRect(cx - capW / 2 - 6, grassY, capW + 12, Math.max(0, top - grassY));
        g.fillStyle = mix(pl.brown, c.card, 0.2);
        g.beginPath();
        g.ellipse(cx, grassY + 2, 44, 10 * depth, 0, Math.PI, 0);
        g.fill();
      }
      g.fillStyle = mix(pl.blue, c.card, 0.35);
      g.beginPath();
      g.roundRect(cx - capW / 2, top, capW, capH, 12);
      g.fill();
      g.fillStyle = mix(pl.blue, c.text, 0.2);
      g.fillRect(cx - capW / 2, top + 22, capW, 5);
      g.fillRect(cx - capW / 2, top + capH - 18, capW, 5);
      g.fillStyle = mix(c.card, pl.blue, 0.2);
      g.fillRect(cx - capW / 2 + 8, top + 6, 5, capH - 14);
      // slips poking out (before burial) or lid
      const n = state.slips.length;
      if (!buried || opened) {
        for (let i = 0; i < n; i++) {
          const sp = state.slips[i]!;
          const ang = (i - (n - 1) / 2) * 0.22;
          g.save();
          g.translate(cx + (i - (n - 1) / 2) * 6, top + 6);
          g.rotate(ang);
          g.fillStyle = mix(userColor(sp.by, theme), c.card, 0.7);
          const lift = sp.at ? (running(sp.at, 500) === null ? 0 : 30 * (1 - running(sp.at, 500)! / 500)) : 0;
          g.fillRect(-7, -28 - lift, 14, 28);
          g.fillStyle = mix(userColor(sp.by, theme), c.text, 0.1);
          g.fillRect(-7, -28 - lift, 14, 3);
          g.restore();
        }
        // lid tilted on the grass
        g.save();
        g.translate(cx + capW / 2 + 22, grassY - 4);
        g.rotate(0.35);
        g.fillStyle = mix(pl.blue, c.text, 0.2);
        g.beginPath();
        g.roundRect(-capW / 2, -8, capW, 12, 5);
        g.fill();
        g.restore();
      } else {
        g.fillStyle = mix(pl.blue, c.text, 0.2);
        g.beginPath();
        g.roundRect(cx - capW / 2 - 3, top - 4, capW + 6, 12, 5);
        g.fill();
      }
      // dig-day flag
      if (buried && !opened && sunk > 0.6) {
        const fx = cx + 58;
        g.strokeStyle = mix(pl.brown, c.text, 0.4);
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(fx, grassY);
        g.lineTo(fx, grassY - 44);
        g.stroke();
        const ff = fitText(`Dig ${state.dig}`, 110, { g, size: 13, weight: 700 });
        g.font = ff.font;
        const tw = g.measureText(ff.text).width + 16;
        g.fillStyle = pl.red;
        g.beginPath();
        g.moveTo(fx, grassY - 44);
        g.lineTo(fx + tw, grassY - 44);
        g.lineTo(fx + tw - 6, grassY - 33);
        g.lineTo(fx + tw, grassY - 22);
        g.lineTo(fx, grassY - 22);
        g.closePath();
        g.fill();
        g.fillStyle = c.card;
        g.textAlign = "left";
        g.textBaseline = "middle";
        g.fillText(ff.text, fx + 6, grassY - 33);
      }
      return e !== null || o !== null || state.slips.some((sp) => sp.at && running(sp.at, 500) !== null);
    };

    // who wrote about whom, as chips over the dirt
    const pairs = (
      <div style={{ position: "absolute", left: 6, right: 6, bottom: 6, display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center", pointerEvents: "none", maxHeight: 52, overflow: "hidden" }}>
        {state.slips.map((sp) => (
          <span key={sp.by} style={{ display: "flex", alignItems: "center", gap: 2, padding: "1px 6px 1px 1px", borderRadius: 99, background: c.card }}>
            <Avatar user={sp.by} size={18} />
            <svg width="10" height="8" viewBox="0 0 10 8" aria-hidden="true">
              <path d="M0 4h8M5 1l3 3-3 3" fill="none" stroke={c.secondaryText} stroke-width="1.4" />
            </svg>
            <Avatar user={sp.about} size={18} />
          </span>
        ))}
      </div>
    );

    if (opened) {
      return (
        <div>
          <CardHeader title={state.title} subtitle={`Opened · ${state.slips.filter((x) => x.came).length} of ${state.slips.length} came true`} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, maxHeight: 372, overflowY: "auto", padding: 2 }}>
            {state.slips.map((sp, i) => (
              <div key={i} style={{ padding: 8, borderRadius: 10, background: mix(userColor(sp.by, theme), c.card, 0.88), transform: `rotate(${i % 2 ? 1 : -1}deg)` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: c.secondaryText }}>
                  <Avatar user={sp.by} size={16} />
                  <span style={ell}>{`about ${nameOf(sp.about)}`}</span>
                  {sp.came !== null ? <span style={{ marginLeft: "auto", flex: "none", fontWeight: 700, color: sp.came ? c.positive : c.negative }}>{sp.came ? "Came true" : "Nope"}</span> : null}
                </div>
                <div style={{ fontSize: 13, lineHeight: "17px", color: c.text, margin: "4px 0", minHeight: 34 }}>{`"${sp.text}"`}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <Button kind="deemphasized" onClick={() => dispatch({ t: "call", i, came: true })}>
                    True
                  </Button>
                  <Button kind="deemphasized" onClick={() => dispatch({ t: "call", i, came: false })}>
                    Nope
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.question ? `"${state.question}"` : `Dig ${state.dig}`} />
        <div style={{ position: "relative", height: H, borderRadius: 12, overflow: "hidden" }}>
          <Canvas height={H} label={buried ? `Capsule buried with ${state.slips.length} slips, dig ${state.dig}` : `Capsule with ${state.slips.length} slips in`} draw={draw} />
          {pairs}
          {state.slips.length === 0 ? (
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 20, textAlign: "center", pointerEvents: "none" }}><span style={{ padding: "2px 10px", borderRadius: 99, background: c.card, color: c.text, fontSize: 13, fontWeight: 600 }}>Empty · the first slip starts it</span></div>
          ) : null}
          {local.bursts > 0 && mine ? <Burst key={local.bursts} emoji="✉️" /> : null}
        </div>
        {local.writing && !mine && !buried ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", gap: 2, alignItems: "center", overflowX: "auto" }}>
              <span style={{ fontSize: 13, color: c.secondaryText, marginRight: 4, flex: "none" }}>About</span>
              {members
                .filter((m) => m.id !== me)
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-label={`About ${m.name}`}
                    aria-pressed={local.about === m.id}
                    onClick={() => setLocal({ about: m.id })}
                    style={{ flex: "none", width: 44, height: 44, border: "none", background: "none", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                  >
                    <span style={{ display: "flex", borderRadius: 99, boxShadow: local.about === m.id ? `0 0 0 2px ${c.primary}` : "none" }}>
                      <Avatar user={m.id} size={30} />
                    </span>
                  </button>
                ))}
            </div>
            <div style={{ marginTop: 4, display: "flex", gap: 8, height: 44 }}>
              <input aria-label="Your prediction" placeholder={local.about ? `By ${state.dig}, ${nameOf(local.about)}…` : "Pick who it's about"} value={local.draft} maxLength={80} style={{ flex: 1, minWidth: 0, height: 44, boxSizing: "border-box" }} onInput={(e: Event) => setLocal({ draft: (e.currentTarget as HTMLInputElement).value })} />
              <Button
                kind="primary"
                disabled={!local.about || !local.draft.trim()}
                onClick={() => {
                  haptic("success");
                  dispatch({ t: "slip", about: local.about, text: local.draft });
                  setLocal({ writing: false, draft: "", bursts: local.bursts + 1 });
                }}
              >
                Drop it in
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, ...ell }}>
              {buried
                ? canOpen
                  ? "It's dig day"
                  : `Buried · ${days} ${days === 1 ? "day" : "days"} to ${state.dig}`
                : mine
                  ? `Yours is sealed · ${state.slips.length} in`
                  : `${state.slips.length} sealed · words stay hidden till ${state.dig}`}
            </span>
            {buried ? (
              canOpen ? (
                <Button kind="primary" onClick={() => dispatch({ t: "open" })}>
                  Dig it up
                </Button>
              ) : null
            ) : mine ? (
              <Button kind="primary" disabled={state.slips.length < 2} onClick={() => dispatch({ t: "bury" })}>
                Bury it
              </Button>
            ) : (
              <Button kind="primary" onClick={() => setLocal({ writing: true })}>
                Write mine
              </Button>
            )}
          </div>
        )}
      </div>
    );
  },
});
