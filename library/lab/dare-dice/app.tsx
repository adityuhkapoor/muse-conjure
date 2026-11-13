import { defineApp, Avatar, Button, Canvas, CardHeader, Burst, haptic, mix, pal, rng, running, tween, type Ctx, type DrawFrame } from "@muse/app";

// Dare dice: two big dice on a felt tray. One has the six faces from the chat, the other six gentle
// dares the chat came up with. Roll and they tumble across the tray and land: that person does that
// dare or passes (a pass costs a point). Best of six rolls. The roll comes from the server's seed.

type Icon = "phone" | "music" | "mic" | "heart" | "food" | "star";
type Params = {
  /** Card title */
  title: string;
  /** Exactly six gentle dares from the chat, each with a little picture */
  dares: { text: string; icon: Icon }[];
  /** Rolls so far: who got rolled, which dare (0 to 5), and whether they did it */
  rolls: { who: string; dare: number; did: boolean }[];
};

// @params
const P: Params = {
  title: "Dare dice",
  dares: [
    { text: "Order for the table in your best accent", icon: "mic" },
    { text: "Text your mom you love her", icon: "phone" },
    { text: "Let Tsai Lin run the aux for an hour", icon: "music" },
    { text: "Eat whatever Arun's rice cooker makes next", icon: "food" },
    { text: "Compliment everyone in the chat", icon: "heart" },
    { text: "Post your lock screen to the story", icon: "star" },
  ],
  rolls: [
    { who: "Calvin", dare: 1, did: true },
    { who: "Will", dare: 2, did: false },
    { who: "Maya", dare: 0, did: true },
  ],
};
// @end params

type Roll = { by: string; who: string; dare: number; at: number; status: "pending" | "did" | "passed" };
type State = { title: string; dares: { text: string; icon: Icon }[]; faces: string[]; rolls: Roll[]; points: Record<string, number> };
type Action = { t: "roll" } | { t: "did" } | { t: "pass" } | { t: "again" };
type Local = { bursts: number };

const ROLLS = 6;
const H = 168;
const ICONS: Icon[] = ["phone", "music", "mic", "heart", "food", "star"];
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const pending = (s: State) => s.rolls.find((r) => r.status === "pending") ?? null;
const finished = (s: State) => s.rolls.length >= ROLLS && !pending(s);
const tumble = tween({ duration: 1300, easing: "decelerate" });
const throwOf = (seed: number) => {
  const r = rng(seed);
  return { face: r.int(6), dare: r.int(6) };
};
const facesFor = (ids: string[]) => (ids.length ? Array.from({ length: 6 }, (_, i) => ids[i % ids.length]!) : []);
const tally = (rolls: Roll[]) => {
  const pts: Record<string, number> = {};
  for (const r of rolls) if (r.status !== "pending") pts[r.who] = (pts[r.who] ?? 0) + (r.status === "did" ? 1 : -1);
  return pts;
};

function initState(ctx: Ctx): State {
  const dares = (Array.isArray(P.dares) ? P.dares : []).map((d) => ({ text: clean(d?.text, 60), icon: ICONS.includes(d?.icon) ? d.icon : "star" })).filter((d) => d.text).slice(0, 6);
  const fill = ["Sing the chorus of your last song", "Say something nice about the person to your left", "Do your best impression of the group chat", "Send the last photo in your camera roll", "Speak in rhymes for one message", "Tell the chat your most used emoji"];
  while (dares.length < 6) dares.push({ text: fill[dares.length]!, icon: ICONS[dares.length]! });
  const faces = facesFor(ctx.members.map((m) => m.id));
  const rolls: Roll[] = [];
  for (const r of Array.isArray(P.rolls) ? P.rolls : []) {
    const n = clean(r?.who, 40).toLowerCase();
    const m = ctx.members.find((x) => x.id === n || x.name.toLowerCase() === n);
    if (!m || !Number.isInteger(r.dare) || r.dare < 0 || r.dare > 5 || rolls.length >= ROLLS - 1) continue;
    rolls.push({ by: m.id, who: m.id, dare: r.dare, at: 0, status: r.did ? "did" : "passed" });
  }
  return { title: clean(P.title, 40) || "Dare dice", dares, faces, rolls, points: tally(rolls) };
}

function icon(g: CanvasRenderingContext2D, k: Icon, x: number, y: number, s: number, ink: string, accent: string) {
  g.save();
  g.translate(x, y);
  g.scale(s / 40, s / 40);
  g.fillStyle = accent;
  g.strokeStyle = ink;
  g.lineWidth = 3;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  if (k === "phone") {
    g.roundRect(-10, -17, 20, 34, 4);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(-3, 12);
    g.lineTo(3, 12);
    g.stroke();
  } else if (k === "music") {
    g.ellipse(-8, 11, 6, 4.5, -0.4, 0, Math.PI * 2);
    g.ellipse(10, 7, 6, 4.5, -0.4, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(-3, 10);
    g.lineTo(-3, -14);
    g.lineTo(15, -18);
    g.lineTo(15, 6);
    g.stroke();
  } else if (k === "mic") {
    g.roundRect(-7, -18, 14, 22, 7);
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(0, -2, 12, 0.1 * Math.PI, 0.9 * Math.PI);
    g.moveTo(0, 10);
    g.lineTo(0, 17);
    g.moveTo(-7, 17);
    g.lineTo(7, 17);
    g.stroke();
  } else if (k === "heart") {
    g.moveTo(0, 15);
    g.bezierCurveTo(-24, 0, -12, -20, 0, -8);
    g.bezierCurveTo(12, -20, 24, 0, 0, 15);
    g.fill();
    g.stroke();
  } else if (k === "food") {
    g.arc(0, 0, 16, 0, Math.PI);
    g.closePath();
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(-6, -5);
    g.quadraticCurveTo(-10, -11, -6, -17);
    g.moveTo(5, -5);
    g.quadraticCurveTo(1, -11, 5, -17);
    g.stroke();
  } else {
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 7 : 17;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      g.lineTo(r * Math.cos(a), r * Math.sin(a));
    }
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.restore();
}

export default defineApp<State, Action, Local>({
  name: "Dare dice",
  summary: (s, ctx) => {
    const name = (u: string) => ctx.members.find((m) => m.id === u)?.name ?? "Someone";
    const p = pending(s);
    if (p) return `Dare dice · ${name(p.who)}: ${s.dares[p.dare]!.text}`;
    if (finished(s)) {
      const top = Object.entries(s.points).sort((a, b) => b[1] - a[1])[0];
      return top ? `Dare dice done · ${name(top[0])} on ${top[1]}` : "Dare dice done";
    }
    return `Dare dice · roll ${s.rolls.length + 1} of ${ROLLS}`;
  },
  init: initState,

  reduce: (s, a, meta, ctx) => {
    const u = meta.user;
    if (!inChat(ctx, u)) return s;
    if (a.t === "roll") {
      if (pending(s) || s.rolls.length >= ROLLS || s.faces.length !== 6) return s;
      const t = throwOf(meta.seed);
      return { ...s, rolls: [...s.rolls, { by: u, who: s.faces[t.face]!, dare: t.dare, at: meta.time, status: "pending" }] };
    }
    if (a.t === "did" || a.t === "pass") {
      const p = pending(s);
      if (!p || (p.who !== u && inChat(ctx, p.who))) return s;
      const rolls = s.rolls.map((r) => (r === p ? { ...r, status: a.t === "did" ? ("did" as const) : ("passed" as const) } : r));
      return { ...s, rolls, points: { ...s.points, [p.who]: (s.points[p.who] ?? 0) + (a.t === "did" ? 1 : -1) } };
    }
    if (a.t === "again") {
      if (!finished(s)) return s;
      return { ...s, rolls: [], points: {}, faces: facesFor(ctx.members.map((m) => m.id)) };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    if (s.faces.length === 6 && s.faces.every((u) => inChat(ctx, u)) && new Set(s.faces).size === Math.min(6, ctx.members.length)) return s;
    return { ...s, faces: facesFor(ctx.members.map((m) => m.id)) };
  },

  invariants: {
    "six faces, all from the chat": (s, ctx) => (ctx.members.length === 0 ? s.faces.length === 0 : s.faces.length === 6 && s.faces.every((u) => inChat(ctx, u))),
    "six dares": (s) => s.dares.length === 6 && s.dares.every((d) => d.text.length > 0),
    "best of six": (s) => s.rolls.length <= ROLLS,
    "only the newest roll can be open": (s) => s.rolls.every((r, i) => r.status !== "pending" || i === s.rolls.length - 1),
    "points are dares done minus passes": (s) => JSON.stringify(Object.entries(tally(s.rolls)).filter(([, v]) => v !== 0).sort()) === JSON.stringify(Object.entries(s.points).filter(([, v]) => v !== 0).sort()),
    "rolls land on a real dare": (s) => s.rolls.every((r) => Number.isInteger(r.dare) && r.dare >= 0 && r.dare < 6),
  },

  transitions: {
    "a new game only after six answered rolls": (p, n, a) => a.t !== "again" || p === n || (finished(p) && n.rolls.length === 0 && Object.keys(n.points).length === 0),
    "a roll lands where the seed says": (p, n, a, m) => {
      if (a.t !== "roll" || p === n) return true;
      const r = n.rolls[n.rolls.length - 1]!;
      const t = throwOf(m.seed);
      return !pending(p) && n.rolls.length === p.rolls.length + 1 && r.who === p.faces[t.face] && r.dare === t.dare && r.at === m.time && r.by === m.user && r.status === "pending";
    },
    "only the rolled person answers": (p, n, a, m, ctx) => (a.t !== "did" && a.t !== "pass") || p === n || pending(p)!.who === m.user || !inChat(ctx, pending(p)!.who),
    "a pass costs a point, a dare earns one": (p, n, a) => (a.t !== "did" && a.t !== "pass") || p === n || (n.points[pending(p)!.who] ?? 0) === (p.points[pending(p)!.who] ?? 0) + (a.t === "did" ? 1 : -1),
    "answered rolls stay answered": (p, n, a) => a.t === "again" || p.rolls.every((r, i) => r.status === "pending" || (n.rolls[i]?.status === r.status && n.rolls[i]?.who === r.who)),
    "only people in the chat play": (q, n, _a, m, ctx) => q === n || inChat(ctx, m.user),
  },

  arbitrary: (s, u, r) => {
    if (finished(s)) return { t: "again" };
    const p = pending(s);
    if (!p) return r.next() < 0.9 ? { t: "roll" } : { t: "did" };
    return r.next() < 0.6 ? { t: "did" } : r.next() < 0.7 ? { t: "pass" } : { t: "roll" };
  },

  local: { bursts: 0 },

  view: ({ state, confirmed, pending: waiting, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const last = confirmed.rolls[confirmed.rolls.length - 1] ?? null;
    const open = pending(confirmed);
    const e = last && last.at ? running(last.at, 1300) : null;
    const rolling = e !== null || (waiting && state.rolls.length > confirmed.rolls.length);
    const k = e === null ? 1 : tumble(e);
    const nameOf = (u: string) => (u === me ? "You" : members.find((m) => m.id === u)?.name ?? "Someone");
    const done = finished(state);
    const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
    const S = 84;
    const restA = { x: W / 2 - S - 14, y: H / 2 - 4 };
    const restB = { x: W / 2 + 14, y: H / 2 - 4 };
    const at = (rest: { x: number; y: number }, phase: number) => {
      const q = rolling && e === null ? 0 : k;
      const x = -S + (rest.x + S) * q;
      const bounce = Math.abs(Math.sin(q * Math.PI * 3 + phase)) * 34 * (1 - q);
      return { x, y: rest.y - S / 2 - bounce, rot: (1 - q) * (6 + phase) * Math.PI };
    };
    const pa = at(restA, 0);
    const pb = at(restB, 0.7);
    const shownDare = last && !rolling ? last.dare : e !== null ? Math.floor(e / 110) % 6 : -1;
    const shownFace = last && !rolling ? last.who : e !== null ? confirmed.faces[Math.floor(e / 130) % Math.max(1, confirmed.faces.length)] ?? null : null;

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      const w = f.width;
      // felt tray
      g.fillStyle = theme.mode === "dark" ? mix(pl.green, c.card, 0.45) : mix(pl.green, c.card, 0.3);
      g.beginPath();
      g.roundRect(0, 0, w, H, 14);
      g.fill();
      g.strokeStyle = mix(pl.brown, c.card, 0.25);
      g.lineWidth = 6;
      g.beginPath();
      g.roundRect(4, 4, w - 8, H - 8, 11);
      g.stroke();
      const die = (p: { x: number; y: number; rot: number }, body: string, side: string) => {
        g.save();
        g.translate(p.x + S / 2, p.y + S / 2);
        g.rotate(p.rot);
        g.fillStyle = mix(c.text, c.card, 0.75);
        g.globalAlpha = 0.35;
        g.beginPath();
        g.roundRect(-S / 2 + 4, -S / 2 + 8, S, S, 16);
        g.fill();
        g.globalAlpha = 1;
        g.fillStyle = side;
        g.beginPath();
        g.roundRect(-S / 2, -S / 2 + 5, S, S, 16);
        g.fill();
        g.fillStyle = body;
        g.beginPath();
        g.roundRect(-S / 2, -S / 2, S, S - 2, 16);
        g.fill();
        g.restore();
      };
      die(pa, pl.paper, mix(pl.paper, c.text, 0.25));
      die(pb, mix(pl.yellow, c.card, 0.2), mix(pl.yellow, c.text, 0.3));
      if (shownDare >= 0) {
        g.save();
        g.translate(pb.x + S / 2, pb.y + S / 2);
        g.rotate(pb.rot);
        icon(g, state.dares[shownDare]!.icon, 0, -1, 46, mix(pl.brown, c.text, 0.5), c.card);
        g.restore();
      } else {
        g.fillStyle = mix(pl.brown, c.text, 0.4);
        g.font = `700 34px ${theme.type.family}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("?", pb.x + S / 2, pb.y + S / 2);
      }
      return rolling;
    };

    const nRolled = state.rolls.length;
    const msg = done
      ? (() => {
          const top = Object.entries(state.points).sort((a, b) => b[1] - a[1])[0];
          return top ? `${nameOf(top[0])} ${top[0] === me ? "win" : "wins"} on ${top[1]}` : "Six rolls, all passed";
        })()
      : rolling
        ? "Rolling"
        : open
          ? open.who === me
            ? "You got rolled · do it or pass"
            : `${nameOf(open.who)} got rolled`
          : nRolled
            ? `Roll ${nRolled + 1} of ${ROLLS}`
            : "Roll to see who and what";

    return (
      <div>
        <CardHeader title={state.title} subtitle={`Best of ${ROLLS} · a pass costs a point`} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={last ? `Dice landed on ${nameOf(last.who)} and dare ${last.dare + 1}` : "Two dice waiting to be rolled"} draw={draw} />
          {shownFace ? (
            <div style={{ position: "absolute", left: pa.x + S / 2 - 26, top: pa.y + S / 2 - 28, display: "flex", transform: `rotate(${pa.rot}rad)`, pointerEvents: "none" }}>
              <Avatar user={shownFace} size={52} />
            </div>
          ) : (
            <div style={{ position: "absolute", left: pa.x + S / 2 - 26, top: pa.y + S / 2 - 28, width: 48, height: 48, borderRadius: 99, border: `2px dashed ${c.secondaryText}`, pointerEvents: "none" }} />
          )}
          {local.bursts > 0 && last?.status === "did" && !rolling ? <Burst key={local.bursts} emoji="👏" /> : null}
        </div>
        <div style={{ marginTop: 8, minHeight: 48, padding: "6px 12px", borderRadius: 12, background: c.wash, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>{msg}</div>
            <div style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {last && !rolling && !done ? `"${state.dares[last.dare]!.text}"` : done ? "Same time next week" : rolling ? "…" : `${state.dares.length} dares on the yellow die`}
            </div>
          </div>
          {last && !rolling && last.status !== "pending" && !done ? (
            <span style={{ flex: "none", padding: "2px 8px", borderRadius: 6, border: `2px solid ${last.status === "did" ? c.positive : c.negative}`, color: c.text, fontSize: 12, fontWeight: 700, transform: "rotate(-6deg)" }}>{last.status === "did" ? "Done" : "Passed"}</span>
          ) : null}
        </div>
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 5, alignItems: "center", overflow: "hidden" }}>
          {Array.from({ length: ROLLS }, (_, i) => {
            const r = state.rolls[i];
            return r && r.status !== "pending" ? (
              <span key={i} style={{ position: "relative", display: "flex" }}>
                <Avatar user={r.who} size={24} />
                <span role="img" aria-label={r.status === "did" ? "did it" : "passed"} style={{ position: "absolute", right: -4, bottom: -3, width: 12, height: 12, borderRadius: 6, background: r.status === "did" ? c.positive : c.negative, border: `1.5px solid ${c.card}` }} />
              </span>
            ) : (
              <span key={i} style={{ width: 22, height: 22, borderRadius: 11, border: `1.5px dashed ${c.secondaryText}` }} />
            );
          })}
          </div>
          {done ? (
            <Button kind="primary" onClick={() => dispatch({ t: "again" })}>
              Play again
            </Button>
          ) : open && !rolling ? (
            open.who === me || !members.some((m) => m.id === open.who) ? (
              <>
                <Button kind="secondary" onClick={() => dispatch({ t: "pass" })}>
                  Pass
                </Button>
                <Button
                  kind="primary"
                  onClick={() => {
                    haptic("success");
                    setLocal({ bursts: local.bursts + 1 });
                    dispatch({ t: "did" });
                  }}
                >
                  Did it
                </Button>
              </>
            ) : (
              <span style={{ flex: "none", fontSize: 13, color: c.secondaryText }}>{`Waiting on ${nameOf(open.who)}`}</span>
            )
          ) : (
            <Button
              kind="primary"
              disabled={rolling}
              onClick={() => {
                haptic("medium");
                dispatch({ t: "roll" });
              }}
            >
              Roll
            </Button>
          )}
        </div>
      </div>
    );
  },
});
