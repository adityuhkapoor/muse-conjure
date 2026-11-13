import {
  defineApp,
  Button,
  Canvas,
  CardHeader,
  Facepile,
  Toast,
  clock,
  haptic,
  mix,
  pal,
  running,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// Sock line: the laundry room's lost and found, a clothesline of orphan socks with little eyes.
// Tap a sock to see where it turned up, say it's yours, and once nobody else claims it, take it home
// and watch it hop off the line. Two people on one sock is a custody dispute; it wiggles until one
// of you lets go.

type Look = "stripes" | "dots" | "argyle" | "plain" | "toe" | "wool";
type Hue = "red" | "blue" | "green" | "yellow" | "orange" | "purple" | "grey";
type Params = {
  /** Card title: "Larkin lost socks" */
  title: string;
  /** Under the title: "claim yours by Sunday" */
  sub: string;
  /** The socks on the line. size: 1 small, 2 normal, 3 enormous. claims: names who say it's theirs. */
  socks: { look: Look; hue: Hue; size: number; found: string; claims: string[]; said?: string }[];
  /** Socks already taken home: names. */
  gone: string[];
};

// @params
const P: Params = {
  title: "Larkin lost socks",
  sub: "laundry room lost and found",
  socks: [
    { look: "stripes", hue: "red", size: 2, found: "in the lint trap", claims: ["Calvin", "Will"], said: "Calvin: that's my alarm-day sock" },
    { look: "wool", hue: "grey", size: 3, found: "draped over dryer 2", claims: ["Will"], said: "Will: ski sock. the sube needs it" },
    { look: "dots", hue: "yellow", size: 2, found: "inside a pillowcase", claims: [] },
    { look: "argyle", hue: "purple", size: 2, found: "washer 3, alone, at 2am", claims: [] },
    { look: "toe", hue: "green", size: 2, found: "on the folding table", claims: ["Tsai Lin"] },
    { look: "plain", hue: "blue", size: 1, found: "in Arun's rice bag??", claims: [], said: "Arun: i have questions too" },
  ],
  gone: ["Maya"],
};
// @end params

type Sock = { id: number; look: Look; hue: Hue; size: number; found: string; said: string; claims: string[]; names: string[]; home: string; homeName: string; at: number };
type State = { title: string; sub: string; socks: Sock[]; gone: number };
type Action = { t: "claim"; sock: number } | { t: "home"; sock: number };
type Local = { sel: number; toast: number; msg: string; at: number };

const LOOKS: Look[] = ["stripes", "dots", "argyle", "plain", "toe", "wool"];
const HUES: Hue[] = ["red", "blue", "green", "yellow", "orange", "purple", "grey"];
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const first = (n: string) => n.split(" ")[0] ?? n;
const okSock = (s: State, i: unknown): i is number => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < s.socks.length && !s.socks[i]!.home;

function initState(ctx: Ctx): State {
  const who = (name: string) => {
    const m = ctx.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
    return m ? m.id : `~${name}`;
  };
  const socks: Sock[] = [];
  for (const k of Array.isArray(P.socks) ? P.socks : []) {
    if (socks.length >= 8 || !LOOKS.includes(k?.look)) continue;
    const claims: string[] = [];
    const names: string[] = [];
    for (const n of Array.isArray(k.claims) ? k.claims : []) {
      const name = clean(n, 20);
      const id = name ? who(name) : "";
      if (!id || claims.includes(id)) continue;
      claims.push(id);
      names.push(name);
    }
    socks.push({ id: socks.length, look: k.look, hue: HUES.includes(k.hue) ? k.hue : "grey", size: Math.max(1, Math.min(3, Math.round(Number(k.size) || 2))), found: clean(k.found, 40), said: clean(k.said, 60), claims, names, home: "", homeName: "", at: 0 });
  }
  return { title: clean(P.title, 40) || "Lost socks", sub: clean(P.sub, 60), socks, gone: Array.isArray(P.gone) ? Math.min(20, P.gone.length) : 0 };
}

function hueOf(t: Theme, h: Hue): string {
  const p = pal(t);
  return h === "grey" ? mix(t.color.secondaryText, t.color.card, 0.25) : p[h];
}

/** One sock hanging from a pin at (x, y), swinging by `sw` radians. */
function sock(g: CanvasRenderingContext2D, t: Theme, k: Sock, x: number, y: number, sw: number, look: number, wide: boolean, now: number) {
  const c = t.color;
  const pl = pal(t);
  const base = hueOf(t, k.hue);
  const s = k.size === 1 ? 0.75 : k.size === 3 ? 1.3 : 1;
  const w = 20 * s;
  const L = 52 * s;
  const foot = 22 * s;
  g.save();
  g.translate(x, y);
  g.rotate(sw);
  // the sock: a leg going down and a foot turned to the right
  const shape = () => {
    g.beginPath();
    g.moveTo(-w / 2, 0);
    g.lineTo(w / 2, 0);
    g.lineTo(w / 2, L - w * 0.5);
    g.quadraticCurveTo(w / 2, L - w * 0.15, w / 2 + foot * 0.5, L - w * 0.15);
    g.lineTo(w / 2 + foot - w * 0.45, L - w * 0.15);
    g.arc(w / 2 + foot - w * 0.45, L + w * 0.3, w * 0.45, -Math.PI / 2, Math.PI / 2);
    g.lineTo(-w / 2 + w * 0.3, L + w * 0.75);
    g.quadraticCurveTo(-w / 2, L + w * 0.75, -w / 2, L + w * 0.2);
    g.closePath();
  };
  shape();
  g.fillStyle = base;
  g.fill();
  g.save();
  shape();
  g.clip();
  const light = mix(base, c.card, 0.6);
  const dark = mix(base, c.text, 0.3);
  if (k.look === "stripes") {
    g.fillStyle = light;
    for (let yy = 8; yy < L + w; yy += 10) g.fillRect(-w, yy, w * 4, 4);
  } else if (k.look === "dots") {
    g.fillStyle = light;
    for (let yy = 7; yy < L + w; yy += 9) for (let xx = -w / 2 + 4 + ((yy / 9) % 2) * 4; xx < w / 2 + foot; xx += 8) {
      g.beginPath();
      g.arc(xx, yy, 2, 0, Math.PI * 2);
      g.fill();
    }
  } else if (k.look === "argyle") {
    g.fillStyle = light;
    for (let yy = 10; yy < L + w; yy += 16) {
      g.beginPath();
      g.moveTo(0, yy - 7);
      g.lineTo(w / 2 - 2, yy);
      g.lineTo(0, yy + 7);
      g.lineTo(-w / 2 + 2, yy);
      g.fill();
    }
  } else if (k.look === "wool") {
    g.strokeStyle = dark;
    g.lineWidth = 1;
    for (let yy = 6; yy < L + w; yy += 5) {
      g.beginPath();
      for (let xx = -w / 2; xx < w / 2 + foot; xx += 4) g.lineTo(xx, yy + ((xx / 4) % 2 ? 1.5 : -1.5));
      g.stroke();
    }
  }
  // cuff, heel and toe
  g.fillStyle = k.look === "toe" ? pl.yellow : dark;
  g.fillRect(-w, 0, w * 3, 6);
  g.beginPath();
  g.arc(w / 2 + foot - w * 0.45, L + w * 0.3, w * 0.45, -Math.PI / 2, Math.PI / 2);
  g.fill();
  g.beginPath();
  g.arc(-w / 2, L + w * 0.75, w * 0.42, -Math.PI / 2, 0);
  g.lineTo(-w / 2, L + w * 0.75);
  g.fill();
  if (k.look === "toe") {
    g.fillStyle = mix(pl.yellow, c.card, 0.3);
    for (let i = 0; i < 4; i++) g.fillRect(w / 2 + foot - w * 0.45 + 1, L - w * 0.1 + i * (w * 0.22), w * 0.4, 1.5);
  }
  g.restore();
  // googly eyes, looking toward whatever is selected
  const blink = Math.sin(now / 900 + k.id * 1.7) > 0.985;
  for (const ex of [-w * 0.18, w * 0.2]) {
    g.fillStyle = pl.paper;
    g.beginPath();
    g.arc(ex, 16, 4.2, 0, Math.PI * 2);
    g.fill();
    if (blink) {
      g.fillStyle = base;
      g.fillRect(ex - 4.5, 15, 9, 2);
      continue;
    }
    g.fillStyle = pl.dark;
    g.beginPath();
    g.arc(ex + look * 1.6, 17, 2, 0, Math.PI * 2);
    g.fill();
  }
  // a nervous little mouth when it's in a dispute
  g.strokeStyle = pl.dark;
  g.lineWidth = 1.3;
  g.beginPath();
  if (wide) {
    for (let i = 0; i < 4; i++) g.lineTo(-4 + i * 2.7, 25 + (i % 2 ? 1.2 : -1.2));
  } else g.arc(0, 23, 3, 0.2, Math.PI - 0.2);
  g.stroke();
  g.restore();
}

export default defineApp<State, Action, Local>({
  name: "Sock line",
  summary: (s) => {
    const left = s.socks.filter((k) => !k.home);
    const fights = left.filter((k) => k.claims.length > 1).length;
    return left.length ? `${s.title}: ${left.length} socks on the line${fights ? ` · ${fights} disputed` : ""}` : `${s.title}: the line is clear`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user) || !okSock(s, a.sock)) return s;
    const k = s.socks[a.sock]!;
    const name = clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend";
    if (a.t === "claim") {
      const has = k.claims.indexOf(m.user);
      const claims = has >= 0 ? k.claims.filter((_, i) => i !== has) : [...k.claims, m.user];
      const names = has >= 0 ? k.names.filter((_, i) => i !== has) : [...k.names, name];
      return { ...s, socks: s.socks.map((x) => (x === k ? { ...x, claims, names, at: m.time } : x)) };
    }
    if (a.t === "home") {
      if (k.claims.length !== 1 || k.claims[0] !== m.user) return s;
      return { ...s, socks: s.socks.map((x) => (x === k ? { ...x, home: m.user, homeName: name, at: m.time } : x)) };
    }
    return s;
  },

  invariants: {
    "a claim counts once": (s) => s.socks.every((k) => new Set(k.claims).size === k.claims.length && k.names.length === k.claims.length),
    "a sock goes home with its only claimer": (s) => s.socks.every((k) => !k.home || (k.claims.length === 1 && k.claims[0] === k.home)),
    "socks keep their place on the line": (s) => s.socks.every((k, i) => k.id === i),
  },

  transitions: {
    "a claim toggles only you": (p, n, a, m) => {
      if (a.t !== "claim" || p === n) return true;
      const was = p.socks[a.sock]!;
      const now = n.socks[a.sock]!;
      return was.claims.includes(m.user) !== now.claims.includes(m.user) && was.claims.filter((x) => x !== m.user).join() === now.claims.filter((x) => x !== m.user).join() && now.at === m.time;
    },
    "only the sole claimer takes it home": (p, n, a, m) => a.t !== "home" || p === n || (p.socks[a.sock]!.claims.join() === m.user && n.socks[a.sock]!.home === m.user && n.socks[a.sock]!.at === m.time),
    "gone socks stay gone": (p, n) => p.socks.every((k, i) => !k.home || (n.socks[i]!.home === k.home && n.socks[i]!.claims.join() === k.claims.join())),
    "one sock at a time": (p, n, a) => n.socks.every((k, i) => i === a.sock || k === p.socks[i]),
    "your claim carries your chat name": (p, n, a, m, ctx) => {
      if (a.t !== "claim" || p === n) return true;
      const now = n.socks[a.sock]!;
      const i = now.claims.indexOf(m.user);
      return i < 0 || now.names[i] === (clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend");
    },
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const left = s.socks.filter((k) => !k.home);
    if (!left.length) return null;
    const mine = left.filter((k) => k.claims.length === 1 && k.claims[0] === user);
    if (mine.length && r.next() < 0.4) return { t: "home", sock: r.pick(mine).id };
    return { t: "claim", sock: r.pick(left).id };
  },

  local: { sel: -1, toast: 0, msg: "", at: 0 },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal();
    const dk = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const H = 186;
    const n = Math.max(1, s.socks.length);
    const slot = (W - 20) / n;
    const lineY = (x: number) => 26 + Math.sin((x / W) * Math.PI) * 16;
    const pinX = (i: number) => 10 + slot * (i + 0.5) - 8;
    const sel = local.sel >= 0 && s.socks[local.sel] && !s.socks[local.sel]!.home ? local.sel : -1;
    const k = sel >= 0 ? s.socks[sel]! : null;
    const nameOf = (id: string, fb: string) => members.find((m) => m.id === id)?.name ?? fb;
    const recent = s.socks.reduce<Sock | null>((x, q) => (q.home && (!x || q.at > x.at) ? q : x), null);
    const fly = recent ? running(recent.at, 1400) : null;
    const left = s.socks.filter((q) => !q.home);
    const goneN = s.gone + s.socks.filter((q) => q.home).length;

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      // laundry room wall with a tiled floor strip
      g.fillStyle = dk ? mix(pl.sky, c.card, 0.82) : mix(pl.sky, c.card, 0.55);
      g.beginPath();
      g.roundRect(0, 0, W, H, 12);
      g.fill();
      g.fillStyle = dk ? mix(pl.sky, c.card, 0.7) : mix(pl.sky, c.card, 0.35);
      g.fillRect(0, H - 22, W, 22);
      // a washer peeking in at the corner
      g.fillStyle = dk ? mix(c.text, c.card, 0.75) : c.card;
      g.strokeStyle = mix(c.secondaryText, c.card, 0.4);
      g.lineWidth = 1.5;
      g.beginPath();
      g.roundRect(W - 46, H - 74, 54, 76, 6);
      g.fill();
      g.stroke();
      g.fillStyle = mix(c.secondaryText, c.card, 0.5);
      g.fillRect(W - 46, H - 74, 54, 12);
      g.beginPath();
      g.arc(W - 19, H - 33, 17, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = mix(pl.blue, c.card, dk ? 0.3 : 0.55);
      g.beginPath();
      g.arc(W - 19, H - 33, 12, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = mix(pl.blue, c.card, 0.8);
      g.beginPath();
      g.arc(W - 23, H - 37, 3, 0, Math.PI * 2);
      g.fill();
      // the line
      g.strokeStyle = dk ? mix(c.text, c.card, 0.4) : mix(c.text, c.card, 0.55);
      g.lineWidth = 1.5;
      g.beginPath();
      for (let x = 0; x <= W; x += 6) g.lineTo(x, lineY(x));
      g.stroke();
      let moving = false;
      s.socks.forEach((q, i) => {
        const px = pinX(i);
        const py = lineY(px);
        let ox = 0;
        let oy = 0;
        let rot = Math.sin(f.now / 700 + i * 1.3) * 0.06;
        if (q.home) {
          if (q !== recent || fly === null) return;
          const t = fly / 1400;
          ox = t * W * 0.9;
          oy = -Math.sin(t * Math.PI * 3) * 22 * (1 - t);
          rot = t * 2;
          moving = true;
        }
        const fight = q.claims.length > 1;
        if (fight) rot += Math.sin(f.now / 70) * 0.08;
        if (i === sel) rot += Math.sin(f.now / 140) * 0.05;
        const look = sel < 0 ? Math.sin(f.now / 1300 + i) : Math.sign(sel - i) || Math.sin(f.now / 400);
        sock(g, theme, q, px + ox, py + 4 + oy, rot, look, fight, f.now);
        // clothespin: the claimer's colour, or bare wood
        const pinCol = q.claims.length === 1 ? userColor(q.claims[0]!, theme) : pl.crust;
        g.fillStyle = pinCol;
        g.beginPath();
        g.roundRect(px + ox - 3, py - 8 + oy, 6, 16, 2);
        g.fill();
        if (i === sel) {
          g.strokeStyle = c.primary;
          g.lineWidth = 2;
          g.setLineDash([4, 3]);
          g.beginPath();
          g.roundRect(px - slot / 2 + 6, py - 12, slot - 4, 104, 10);
          g.stroke();
          g.setLineDash([]);
        }
      });
      void moving;
      return true;
    };

    const onPointer = (e: { type: string; x: number; y: number }) => {
      if (e.type !== "down") return;
      const i = Math.floor((e.x - 10 + 8) / slot);
      if (i < 0 || i >= s.socks.length || s.socks[i]!.home) return;
      haptic("light");
      setLocal({ sel: i === sel ? -1 : i });
    };

    const mineClaim = k ? k.claims.includes(me) : false;
    const solo = k ? k.claims.length === 1 && k.claims[0] === me : false;
    const others = k ? k.claims.filter((x) => x !== me) : [];
    const claimers = (q: Sock): Member[] => q.claims.map((id, i) => ({ id, name: nameOf(id, q.names[i] ?? "") }));
    const label = `Clothesline with ${left.length} socks; ${left.filter((q) => !q.claims.length).length} unclaimed`;
    const info = k
      ? `Found ${k.found || "somewhere"}${k.claims.length > 1 ? ` · ${k.claims.length} people say it's theirs` : k.claims.length === 1 ? ` · ${first(nameOf(k.claims[0]!, k.names[0] ?? ""))} says it's theirs` : " · nobody's claimed it"}`
      : left.length
        ? `${left.filter((q) => !q.claims.length).length} unclaimed · ${left.filter((q) => q.claims.length > 1).length} disputed · ${goneN} went home`
        : `The line is clear · ${goneN} socks went home`;
    const said = k?.said || s.socks.find((q) => !q.home && q.said)?.said || "";

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.sub ? `${s.sub} · tap a sock` : "tap a sock"} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={label} draw={draw} onPointer={onPointer} />
          {s.socks.map((q, i) =>
            !q.home && q.claims.length ? (
              <div key={`f${i}`} style={{ position: "absolute", left: pinX(i) - 10, top: H - 46, display: "flex", pointerEvents: "none" }}>
                <Facepile users={claimers(q)} max={2} size={20} />
              </div>
            ) : null,
          )}
          {sel < 0 && left.some((q) => !q.claims.length) ? (
            <div style={{ position: "absolute", left: 10, bottom: 4, padding: "1px 8px", borderRadius: 99, background: c.card, color: c.text, fontSize: 12, lineHeight: "18px", fontWeight: 600, pointerEvents: "none" }}>
              Tap one that looks like yours
            </div>
          ) : null}
        </div>
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: "17px", color: c.secondaryText, ...ell }}>{info}</div>
        <div style={{ marginTop: 2, minHeight: 17, fontSize: 13, lineHeight: "17px", color: c.secondaryText, ...ell }}>{said ? `“${said}”` : ""}</div>
        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          {k ? (
            <>
              <Button
                kind={solo ? "secondary" : "primary"}
                wide
                onClick={() => {
                  haptic("light");
                  dispatch({ t: "claim", sock: sel });
                  setLocal({ toast: local.toast + 1, msg: mineClaim ? "Let it go" : others.length ? "Dispute opened" : "Claimed" });
                }}
              >
                {mineClaim ? "Not mine" : others.length ? "It's mine too" : "That's mine"}
              </Button>
              {solo ? (
                <Button
                  kind="primary"
                  wide
                  onClick={() => {
                    haptic("success");
                    dispatch({ t: "home", sock: sel });
                    setLocal({ sel: -1, toast: local.toast + 1, msg: "Reunited", at: clock.peek() });
                  }}
                >
                  Take it home
                </Button>
              ) : null}
            </>
          ) : (
            <Button kind="secondary" wide disabled>
              {left.length ? "Pick a sock first" : "Nothing left to claim"}
            </Button>
          )}
        </div>
        {local.toast > 0 ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
