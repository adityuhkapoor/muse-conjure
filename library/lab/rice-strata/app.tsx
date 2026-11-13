import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
  Toast,
  fitText,
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

// Rice strata: the apartment's rice, as a cut-away rice cooker filling up in layers. Every scoop
// anyone eats is a band in their colour, stacked in the order it happened, so the pot reads like
// rock strata: who eats the rice, and when. The bag beside it drains as the pot fills. When the
// bag is empty, whoever ate the most buys the next one.

type Params = {
  /** Card title: "Arun's rice cooker" */
  title: string;
  /** Under the title: "it makes everything" */
  sub: string;
  /** Cups in a full bag. */
  bag: number;
  /** Scoops so far, oldest first: who, cups (1 to 3), a short day label, an optional line. */
  scoops: { name: string; cups: number; day: string; said?: string }[];
};

// @params
const P: Params = {
  title: "Arun's rice cooker",
  sub: "it makes everything · 20 lb bag",
  bag: 40,
  scoops: [
    { name: "Arun", cups: 2, day: "Mon" },
    { name: "Will", cups: 1, day: "Mon" },
    { name: "Arun", cups: 3, day: "Tue", said: "fried rice is a breakfast food" },
    { name: "Maya", cups: 1, day: "Tue" },
    { name: "Calvin", cups: 2, day: "Wed", said: "slept through dinner, ate it at 3am" },
    { name: "Arun", cups: 2, day: "Wed" },
    { name: "Tsai Lin", cups: 1, day: "Thu" },
    { name: "Arun", cups: 2, day: "Thu", said: "rice pudding counts" },
    { name: "Will", cups: 2, day: "Fri" },
  ],
};
// @end params

type Layer = { who: string; name: string; cups: number; day: string; said: string; at: number };
type State = { title: string; sub: string; bag: number; layers: Layer[]; buyer: string; buyerName: string; round: number };
type Action = { t: "scoop"; cups: number } | { t: "undo" } | { t: "refill" };
type Local = { cups: number; toast: number; msg: string };

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const first = (n: string) => n.split(" ")[0] ?? n;
const eaten = (s: State) => s.layers.reduce((n, l) => n + l.cups, 0);
/** Cups per person, most first; ties go to whoever started eating first. */
function tally(s: State): { who: string; name: string; cups: number }[] {
  const m = new Map<string, { who: string; name: string; cups: number; first: number }>();
  s.layers.forEach((l, i) => {
    const e = m.get(l.who) ?? { who: l.who, name: l.name, cups: 0, first: i };
    e.cups += l.cups;
    m.set(l.who, e);
  });
  return [...m.values()].sort((a, b) => b.cups - a.cups || a.first - b.first);
}

function initState(ctx: Ctx): State {
  const bag = Math.max(6, Math.min(80, Math.round(Number(P.bag) || 40)));
  const layers: Layer[] = [];
  let total = 0;
  for (const sc of Array.isArray(P.scoops) ? P.scoops : []) {
    const name = clean(sc?.name, 20);
    const cups = Math.round(Number(sc?.cups));
    if (!name || !(cups >= 1 && cups <= 3) || total + cups >= bag || layers.length >= 40) continue;
    const m = ctx.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
    layers.push({ who: m ? m.id : `~${name}`, name, cups, day: clean(sc.day, 4), said: clean(sc.said, 60), at: 0 });
    total += cups;
  }
  return { title: clean(P.title, 40) || "Rice cooker", sub: clean(P.sub, 60), bag, layers, buyer: "", buyerName: "", round: 1 };
}

function drawPot(g: CanvasRenderingContext2D, t: Theme, f: DrawFrame, s: State, H: number, dropAt: number) {
  const c = t.color;
  const pl = pal(t);
  const dk = t.mode === "dark";
  const W = f.width;
  // counter and backsplash
  g.fillStyle = dk ? mix(pl.wall, c.card, 0.82) : mix(pl.wall, c.card, 0.3);
  g.beginPath();
  g.roundRect(0, 0, W, H, 12);
  g.fill();
  g.strokeStyle = dk ? mix(pl.wall, c.card, 0.7) : c.card;
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x < W; x += 26) {
    g.moveTo(x, 0);
    g.lineTo(x, H - 30);
  }
  for (let y = 26; y < H - 30; y += 26) {
    g.moveTo(0, y);
    g.lineTo(W, y);
  }
  g.stroke();
  g.fillStyle = dk ? mix(pl.brown, c.card, 0.4) : mix(pl.brown, pl.crust, 0.3);
  g.fillRect(0, H - 30, W, 30);

  // the cooker, cut away
  const px = 64;
  const pw = Math.min(170, W * 0.46);
  const pTop = 46;
  const pBot = H - 34;
  g.fillStyle = pl.paper;
  g.beginPath();
  g.roundRect(px - 12, pTop - 6, pw + 24, pBot - pTop + 12, 22);
  g.fill();
  g.strokeStyle = mix(c.text, c.card, 0.6);
  g.lineWidth = 2;
  g.stroke();
  // feet and the red button
  g.fillStyle = mix(c.text, c.card, 0.4);
  g.fillRect(px + 6, pBot + 6, 16, 4);
  g.fillRect(px + pw - 22, pBot + 6, 16, 4);
  g.fillStyle = pl.red;
  g.beginPath();
  g.roundRect(px + pw / 2 - 12, pBot - 2, 24, 7, 3);
  g.fill();
  // inner pot window
  const ix = px;
  const iw = pw;
  const iTop = pTop + 6;
  const iBot = pBot - 10;
  g.fillStyle = dk ? mix(c.wash, c.card, 0.2) : mix(pl.shade, c.card, 0.3);
  g.beginPath();
  g.roundRect(ix, iTop, iw, iBot - iTop, 12);
  g.fill();
  // strata: one band per scoop, bottom up; the newest drops in
  const total = eaten(s);
  // bands thick enough to read; the bag on the right carries how much is left
  const unit = Math.min(12, (iBot - iTop - 8) / Math.max(12, total + 3));
  let y = iBot;
  const last = s.layers.length - 1;
  const e = dropAt ? f.now - dropAt : 99999;
  let moving = false;
  g.save();
  g.beginPath();
  g.roundRect(ix, iTop, iw, iBot - iTop, 12);
  g.clip();
  const days: [number, string][] = [];
  s.layers.forEach((l, i) => {
    const h = l.cups * unit;
    let yy = y - h;
    if (i === last && e < 600) {
      const k = e / 600;
      yy = iTop - h + (yy - iTop + h) * (1 - (1 - k) * (1 - k));
      moving = true;
    }
    const col = userColor(l.who, t);
    g.fillStyle = mix(col, pl.paper, 0.25);
    g.beginPath();
    // wavy top edge like settled rice
    g.moveTo(ix, yy + h);
    g.lineTo(ix, yy + 1.5);
    for (let x = 0; x <= iw; x += 10) g.lineTo(ix + x, yy + Math.sin(x / 9 + i * 1.7) * 1.5);
    g.lineTo(ix + iw, yy + h);
    g.closePath();
    g.fill();
    // a few grains
    g.fillStyle = mix(col, pl.paper, 0.65);
    for (let k = 0; k < l.cups * 4; k++) {
      const gx = ix + 8 + ((k * 37 + i * 53) % (iw - 16));
      const gy = yy + 3 + ((k * 13 + i * 7) % Math.max(2, h - 5));
      g.beginPath();
      g.ellipse(gx, gy, 2.2, 1, (k % 3) - 1, 0, Math.PI * 2);
      g.fill();
    }
    if (l.day && (i === 0 || s.layers[i - 1]!.day !== l.day)) days.push([y, l.day]);
    y -= h;
  });
  g.restore();
  // steam when it's hot
  g.strokeStyle = mix(c.secondaryText, c.card, 0.35);
  g.lineWidth = 2;
  g.lineCap = "round";
  for (let k = 0; k < 3; k++) {
    const u = (f.now / 2400 + k / 3) % 1;
    const sx = px + pw * (0.3 + k * 0.2);
    g.beginPath();
    g.moveTo(sx, pTop - 8 - u * 20);
    g.quadraticCurveTo(sx + 6, pTop - 14 - u * 20, sx, pTop - 22 - u * 20);
    g.stroke();
  }
  // day labels on the left of the pot, at the bottom of each day's first band
  g.font = `600 10px ${t.type.family}`;
  g.textAlign = "right";
  g.textBaseline = "bottom";
  g.fillStyle = c.text;
  let lastY = 1e9;
  for (const [dy, d] of days) {
    if (lastY - dy < 12) continue;
    g.fillText(d, px - 16, dy);
    g.fillRect(px - 14, dy - 1, 8, 1);
    lastY = dy;
  }

  // the bag, draining
  const bx = px + pw + 40;
  const bw = Math.min(96, W - bx - 14);
  const bTop = 30;
  const bBot = H - 30;
  const left = Math.max(0, s.bag - total);
  const bagCol = dk ? mix(pl.crust, c.card, 0.4) : mix(pl.crust, c.card, 0.25);
  const sack = () => {
    g.beginPath();
    g.moveTo(bx + 8, bTop + 12);
    g.quadraticCurveTo(bx + bw / 2, bTop, bx + bw - 8, bTop + 12);
    g.quadraticCurveTo(bx + bw + 4, (bTop + bBot) / 2, bx + bw - 2, bBot);
    g.lineTo(bx + 2, bBot);
    g.quadraticCurveTo(bx - 4, (bTop + bBot) / 2, bx + 8, bTop + 12);
    g.closePath();
  };
  sack();
  g.fillStyle = bagCol;
  g.fill();
  g.save();
  sack();
  g.clip();
  const lv = bBot - ((bBot - bTop - 14) * left) / s.bag;
  g.fillStyle = pl.paper;
  g.fillRect(bx - 6, lv, bw + 12, bBot - lv);
  g.fillStyle = mix(pl.crust, pl.paper, 0.55);
  for (let k = 0; k < 40; k++) {
    const gx = bx + 6 + ((k * 29) % (bw - 12));
    const gy = lv + 4 + ((k * 17) % Math.max(4, bBot - lv - 8));
    g.fillRect(gx, gy, 3, 1.4);
  }
  g.restore();
  g.strokeStyle = mix(pl.brown, c.card, 0.2);
  g.lineWidth = 1.5;
  sack();
  g.stroke();
  // the bag's label
  const lab = fitText(`${left} cups left`, bw - 12, { g, size: 11, min: 10, weight: 700 });
  g.font = lab.font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = c.card;
  const lw = lab.width + 10;
  g.beginPath();
  g.roundRect(bx + bw / 2 - lw / 2, bTop + 26, lw, 18, 4);
  g.fill();
  g.fillStyle = c.text;
  g.fillText(lab.text, bx + bw / 2, bTop + 35.5);
  void moving;
  return true;
}

export default defineApp<State, Action, Local>({
  name: "Rice strata",
  summary: (s) => {
    const top = tally(s)[0];
    if (s.buyer) return `${s.title}: bag's empty · ${first(s.buyerName)} buys the next one`;
    return top ? `${s.title}: ${s.bag - eaten(s)} cups left · ${first(top.name)} ate ${top.cups}` : `${s.title}: a full bag, nobody's had any`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const name = clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend";
    if (a.t === "scoop") {
      if (s.buyer || typeof a.cups !== "number" || !Number.isInteger(a.cups) || a.cups < 1 || a.cups > 3) return s;
      const cups = Math.min(a.cups, s.bag - eaten(s));
      if (cups < 1) return s;
      const next: State = { ...s, layers: [...s.layers, { who: m.user, name, cups, day: "", said: "", at: m.time }] };
      if (eaten(next) < s.bag) return next;
      const top = tally(next)[0]!;
      return { ...next, buyer: top.who, buyerName: top.name };
    }
    if (a.t === "undo") {
      if (s.buyer) return s;
      const i = s.layers.map((l) => l.who).lastIndexOf(m.user);
      if (i < 0 || s.layers[i]!.at === 0) return s;
      return { ...s, layers: s.layers.filter((_, k) => k !== i) };
    }
    if (a.t === "refill") {
      if (!s.buyer || s.buyer !== m.user) return s;
      return { ...s, layers: [], buyer: "", buyerName: "", round: s.round + 1 };
    }
    return s;
  },

  invariants: {
    "the pot never holds more than the bag": (s) => eaten(s) <= s.bag,
    "scoops are 1 to 3 cups": (s) => s.layers.every((l) => Number.isInteger(l.cups) && l.cups >= 1 && l.cups <= 3),
    "an empty bag names the biggest eater": (s) => (eaten(s) === s.bag) === !!s.buyer && (!s.buyer || tally(s)[0]?.who === s.buyer),
  },

  transitions: {
    "a scoop is one band, yours": (p, n, a, m) => a.t !== "scoop" || p === n || (n.layers.length === p.layers.length + 1 && n.layers[n.layers.length - 1]!.who === m.user && n.layers[n.layers.length - 1]!.at === m.time),
    "a scoop takes what's left at most": (p, n, a) => a.t !== "scoop" || p === n || n.layers[n.layers.length - 1]!.cups === Math.min(a.cups, p.bag - eaten(p)),
    "undo lifts only your newest band": (p, n, a, m) => a.t !== "undo" || p === n || (n.layers.length === p.layers.length - 1 && p.layers.filter((l) => l.who !== m.user).length === n.layers.filter((l) => l.who !== m.user).length),
    "only the buyer refills": (p, n, a, m) => a.t !== "refill" || p === n || (p.buyer === m.user && n.layers.length === 0 && n.round === p.round + 1),
    "old bands never change": (p, n, a) => a.t === "refill" || a.t === "undo" || p.layers.every((l, i) => n.layers[i] === l),
    "your band carries your chat name": (p, n, a, m, ctx) => a.t !== "scoop" || p === n || n.layers[n.layers.length - 1]!.name === (clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend"),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (s.buyer) return s.buyer === user || r.next() < 0.3 ? { t: "refill" } : { t: "scoop", cups: 1 };
    if (r.next() < 0.12) return { t: "undo" };
    return { t: "scoop", cups: 1 + r.int(3) };
  },

  local: { cups: 1, toast: 0, msg: "" },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const H = 196;
    const nameOf = (id: string, fb: string) => members.find((m) => m.id === id)?.name ?? fb;
    const rows = tally(s);
    const left = s.bag - eaten(s);
    const lastMine = [...s.layers].reverse().find((l) => l.who === me && l.at > 0);
    const newest = s.layers[s.layers.length - 1];
    const dropAt = newest && newest.at && running(newest.at, 700) !== null ? newest.at : 0;
    const said = [...s.layers].reverse().find((l) => l.said);
    const label = `Rice cooker with ${s.layers.length} scoops in layers; ${left} of ${s.bag} cups left in the bag. ${rows.map((r) => `${r.name} ${r.cups}`).join(", ")}`;

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.sub} />
        <Canvas height={H} label={label} draw={(g, f) => drawPot(g, theme, f, s, H, dropAt)} />
        <div style={{ display: "flex", gap: 6, marginTop: 8, height: 28, overflow: "hidden" }}>
          {rows.slice(0, theme.width < 360 ? 3 : 4).map((r, i) => (
            <span key={r.who} style={{ flex: "none", display: "flex", alignItems: "center", gap: 4, padding: "0 8px 0 3px", height: 26, borderRadius: 13, background: r.who === me ? c.selected : c.wash, fontSize: 13, color: c.text }}>
              <Avatar user={{ id: r.who, name: nameOf(r.who, r.name) } as Member} size={20} />
              <b style={{ fontWeight: 600 }}>{String(r.cups)}</b>
              {i === 0 ? <span style={{ color: c.secondaryText }}>cups</span> : null}
            </span>
          ))}
          {!rows.length ? <span style={{ fontSize: 13, color: c.secondaryText, lineHeight: "28px" }}>A full bag · first scoop starts the strata</span> : null}
        </div>
        <div style={{ marginTop: 6, fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>
          {s.buyer
            ? `Bag's empty · ${first(nameOf(s.buyer, s.buyerName))} ate the most and buys the next one`
            : said
              ? `${first(nameOf(said.who, said.name))}: “${said.said}”`
              : rows[0]
                ? `Most bands so far: ${first(nameOf(rows[0].who, rows[0].name))} · buys the bag if it runs out now`
                : "Every scoop you log is a band in your color"}
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
          {s.buyer ? (
            s.buyer === me ? (
              <Button kind="primary" wide onClick={() => dispatch({ t: "refill" })}>
                New bag's in
              </Button>
            ) : (
              <Button kind="secondary" wide disabled>
                {`Waiting on ${first(nameOf(s.buyer, s.buyerName))}`}
              </Button>
            )
          ) : (
            <>
              <div role="group" aria-label="Cups" style={{ display: "flex", gap: 4, flex: "none" }}>
                {[1, 2, 3].map((n) => (
                  <button
                    key={`c${n}`}
                    type="button"
                    aria-label={`${n} ${n === 1 ? "cup" : "cups"}`}
                    aria-pressed={local.cups === n}
                    onClick={() => setLocal({ cups: n })}
                    style={{ width: 44, height: 44, borderRadius: 22, fontSize: 15, fontWeight: 600, background: local.cups === n ? c.selected : c.wash, color: c.text, boxShadow: local.cups === n ? `inset 0 0 0 2px ${c.primary}` : undefined }}
                  >
                    {String(n)}
                  </button>
                ))}
              </div>
              {lastMine ? (
                <Button kind="secondary" onClick={() => dispatch({ t: "undo" })}>
                  Undo
                </Button>
              ) : null}
              <Button
                kind="primary"
                wide
                disabled={left < 1}
                onClick={() => {
                  haptic("medium");
                  dispatch({ t: "scoop", cups: local.cups });
                  setLocal({ toast: local.toast + 1, msg: left - local.cups <= 0 ? "That was the last of the bag" : `${Math.max(0, left - local.cups)} cups left` });
                }}
              >
                {local.cups === 1 ? "I had a cup" : `I had ${local.cups}`}
              </Button>
            </>
          )}
        </div>
        {local.toast > 0 ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
