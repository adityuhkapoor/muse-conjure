import {
  defineApp,
  Button,
  Canvas,
  CardHeader,
  Toast,
  fitText,
  haptic,
  mix,
  pal,
  rng,
  running,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Meta,
} from "@muse/app";

// Cupboard cooker: a toy. The friend whose rice cooker makes everything has it on the counter with
// the lid up. Everyone drops in one thing from the cupboard; anyone flips the switch, it steams and
// rattles and dings, and out comes a bowl named from whatever went in. Then do it again.

type Params = {
  /** Card title */
  title: string;
  /** Whose rice cooker it is */
  owner: string;
  /** The cupboard: up to 8 things you can drop in. kind sets the drawing: egg, cheese, chili, green, meat, sauce, crunch, sweet. */
  pantry: { label: string; kind: string }[];
  /** Who already dropped what in (pantry labels) */
  added: { who: string; item: string }[];
  /** What the cooker's owner says when it dings */
  verdict: string;
};

// @params
const P: Params = {
  title: "Arun's rice cooker",
  owner: "Arun",
  pantry: [
    { label: "spam", kind: "meat" },
    { label: "frozen peas", kind: "green" },
    { label: "hot cheetos", kind: "crunch" },
    { label: "an egg", kind: "egg" },
    { label: "kraft singles", kind: "cheese" },
    { label: "kimchi", kind: "chili" },
    { label: "sriracha", kind: "sauce" },
    { label: "a mango", kind: "sweet" },
  ],
  added: [
    { who: "Arun", item: "spam" },
    { who: "Maya", item: "frozen peas" },
    { who: "Will", item: "hot cheetos" },
  ],
  verdict: "it makes everything",
};
// @end params

const KINDS = ["egg", "cheese", "chili", "green", "meat", "sauce", "crunch", "sweet"] as const;
type Kind = (typeof KINDS)[number];
type Item = { label: string; kind: Kind };
type Drop = { by: string; name: string; item: number; at: number };
type Batch = { n: number; at: number; dish: string; items: number[]; by: string };
type State = { title: string; owner: string; verdict: string; pantry: Item[]; drops: Drop[]; batch: Batch | null; batches: number };
type Action = { t: "add"; item: number } | { t: "cook" } | { t: "again" };
type Local = { toast: number; msg: string; page: number };

const H = 236;
const COOK_MS = 3200;
const BASES = ["fried rice", "congee", "risotto", "rice bowl", "onigiri", "jook", "casserole", "biryani"];
const STYLES = ["midnight", "dorm", "crispy", "fancy", "lowkey", "emergency", "sunday", "chaos"];

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const first = (n: string) => n.split(" ")[0] ?? n;
const bare = (label: string) => label.replace(/^(an?|the|some)\s+/i, "");
/** The dish is named from what went in and the server's seed: same ingredients, same seed, same dish. */
function dishName(pantry: Item[], items: number[], seed: number): string {
  const r = rng(seed);
  const names = items.map((i) => bare(pantry[i]?.label ?? "")).filter(Boolean);
  const shown = r.shuffle(names).slice(0, 2);
  const style = r.pick(STYLES);
  const base = r.pick(BASES);
  return `${style} ${shown.join(" ")} ${base}`.replace(/\s+/g, " ").trim();
}

function initState(ctx: Ctx): State {
  const pantry: Item[] = [];
  for (const x of Array.isArray(P.pantry) ? P.pantry : []) {
    const label = clean(x?.label, 18);
    if (!label || pantry.length >= 8) continue;
    pantry.push({ label, kind: (KINDS as readonly string[]).includes(x?.kind) ? (x.kind as Kind) : "green" });
  }
  if (pantry.length < 2) pantry.push({ label: "rice", kind: "sweet" }, { label: "an egg", kind: "egg" });
  const drops: Drop[] = [];
  for (const d of Array.isArray(P.added) ? P.added : []) {
    const who = clean(d?.who, 24);
    const item = pantry.findIndex((p) => p.label.toLowerCase() === clean(d?.item, 18).toLowerCase());
    if (!who || item < 0) continue;
    const m = ctx.members.find((x) => x.id === who || x.name.toLowerCase() === who.toLowerCase());
    const by = m ? m.id : `?${who.toLowerCase()}`;
    if (drops.some((x) => x.by === by)) continue;
    drops.push({ by, name: m ? m.name : who, item, at: 0 });
  }
  return { title: clean(P.title, 30) || "Rice cooker", owner: clean(P.owner, 20), verdict: clean(P.verdict, 48), pantry, drops: drops.slice(0, 6), batch: null, batches: 0 };
}

function reduceR(s: State, a: Action, meta: Meta, ctx: Ctx): State {
  const u = meta.user;
  if (!inChat(ctx, u)) return s;
  if (a.t === "add") {
    if (s.batch || typeof a.item !== "number" || !Number.isInteger(a.item) || !s.pantry[a.item]) return s;
    const mine = s.drops.find((d) => d.by === u);
    if (mine && mine.item === a.item) return s;
    if (!mine && s.drops.length >= 6) return s;
    const name = ctx.members.find((m) => m.id === u)?.name ?? "";
    // One thing each: dropping something new swaps yours out.
    return { ...s, drops: [...s.drops.filter((d) => d.by !== u), { by: u, name, item: a.item, at: meta.time }] };
  }
  if (a.t === "cook") {
    if (s.batch || s.drops.length < 2) return s;
    const items = s.drops.map((d) => d.item);
    const n = s.batches + 1;
    return { ...s, batch: { n, at: meta.time, dish: dishName(s.pantry, items, meta.seed), items, by: u }, batches: n };
  }
  if (a.t === "again") {
    if (!s.batch) return s;
    return { ...s, batch: null, drops: [] };
  }
  return s;
}

function drawIngredient(g: CanvasRenderingContext2D, kind: Kind, x: number, y: number, r: number, f: DrawFrame) {
  const p = pal(f.theme);
  const c = f.theme.color;
  g.beginPath();
  switch (kind) {
    case "egg":
      g.fillStyle = p.paper;
      g.ellipse(x, y, r * 0.8, r, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = c.divider;
      g.lineWidth = 1.2;
      g.stroke();
      break;
    case "cheese":
      g.fillStyle = p.yellow;
      g.roundRect(x - r, y - r * 0.8, r * 2, r * 1.6, 2);
      g.fill();
      break;
    case "chili":
      g.fillStyle = p.red;
      g.ellipse(x, y, r * 1.1, r * 0.55, -0.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = p.leaf;
      g.beginPath();
      g.arc(x + r * 0.8, y - r * 0.5, r * 0.3, 0, Math.PI * 2);
      g.fill();
      break;
    case "green":
      g.fillStyle = p.green;
      for (const [dx, dy] of [[-0.5, 0], [0.4, -0.3], [0.2, 0.5], [-0.2, -0.6]]) {
        g.moveTo(x + dx! * r + r * 0.35, y + dy! * r);
        g.arc(x + dx! * r, y + dy! * r, r * 0.35, 0, Math.PI * 2);
      }
      g.fill();
      break;
    case "meat":
      g.fillStyle = mix(p.red, p.paper, 0.45);
      g.roundRect(x - r, y - r * 0.6, r * 2, r * 1.2, 4);
      g.fill();
      break;
    case "sauce":
      g.fillStyle = p.red;
      g.roundRect(x - r * 0.45, y - r * 0.7, r * 0.9, r * 1.6, 3);
      g.fill();
      g.fillStyle = p.green;
      g.fillRect(x - r * 0.2, y - r * 1.05, r * 0.4, r * 0.4);
      break;
    case "crunch":
      g.fillStyle = p.orange;
      for (let k = 0; k < 4; k++) {
        const a = k * 1.6;
        g.moveTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5);
        g.ellipse(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.6, r * 0.22, a, 0, Math.PI * 2);
      }
      g.fill();
      break;
    case "sweet":
      g.fillStyle = mix(p.yellow, p.orange, 0.5);
      g.ellipse(x, y, r, r * 0.75, 0.4, 0, Math.PI * 2);
      g.fill();
      break;
  }
}

function drawCooker(g: CanvasRenderingContext2D, f: DrawFrame, s: State, members: readonly Member[], ctx: Ctx, waiting: boolean) {
  const t = f.theme;
  const c = t.color;
  const p = pal(t);
  const W = f.width;
  const now = f.now;
  const dark = t.mode === "dark";
  const cx = W / 2;
  const b = s.batch;
  const e = b ? now - b.at : -1;
  const cooking = waiting || (b !== null && e >= 0 && e < COOK_MS);
  const doneB = b !== null && e >= COOK_MS;
  const shake = cooking ? Math.sin(now / 35) * 1.5 : 0;
  const body = dark ? mix(c.text, c.card, 0.25) : c.card;
  const line = dark ? mix(c.text, c.card, 0.5) : mix(c.secondaryText, c.card, 0.35);
  // counter
  g.fillStyle = dark ? mix(c.card, p.crust, 0.18) : mix(p.crust, c.card, 0.7);
  g.fillRect(0, 200, W, 36);
  // body
  const bw = 150;
  const bh = 104;
  const bx = cx - bw / 2 + shake;
  const by = 200 - bh;
  g.fillStyle = body;
  g.strokeStyle = line;
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(bx, by, bw, bh, [16, 16, 28, 28]);
  g.fill();
  g.stroke();
  // pastel flower decal, like every rice cooker
  g.fillStyle = mix(p.red, body, 0.55);
  g.beginPath();
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    g.moveTo(bx + 30 + Math.cos(a) * 7 + 5, by + 36 + Math.sin(a) * 7);
    g.arc(bx + 30 + Math.cos(a) * 7, by + 36 + Math.sin(a) * 7, 5, 0, Math.PI * 2);
  }
  g.fill();
  // control panel and switch
  g.fillStyle = dark ? mix(c.card, c.text, 0.1) : mix(c.secondaryText, c.card, 0.82);
  g.beginPath();
  g.roundRect(cx - 34 + shake, by + 58, 68, 30, 8);
  g.fill();
  g.fillStyle = cooking ? p.red : doneB ? p.green : mix(c.secondaryText, c.card, 0.5);
  g.beginPath();
  g.arc(cx - 20 + shake, by + 73, 4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = c.text;
  g.beginPath();
  g.roundRect(cx - 6 + shake, by + (cooking ? 70 : 64), 22, 10, 3);
  g.fill();
  // lid: up while filling, down while cooking, popped when done
  const lidUp = !b && !waiting ? 1 : doneB ? Math.min(1, (e - COOK_MS) / 300) * 0.7 : 0;
  if (lidUp > 0.05) {
    // the inner pot, with rice waiting
    g.fillStyle = mix(c.text, body, dark ? 0.55 : 0.75);
    g.beginPath();
    g.ellipse(cx + shake, by + 4, bw / 2 - 10, 10, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = p.cream;
    g.beginPath();
    g.ellipse(cx + shake, by + 7, bw / 2 - 18, 6, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.save();
  g.translate(bx + bw - 8, by + 4);
  g.rotate(lidUp * 0.55);
  g.fillStyle = body;
  g.strokeStyle = line;
  g.beginPath();
  g.ellipse(-bw / 2 + 8, 0, bw / 2 + 4, 18, 0, Math.PI, 0);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = line;
  g.beginPath();
  g.roundRect(-bw / 2 - 2, -24, 20, 8, 4);
  g.fill();
  g.restore();
  // what's waiting to go in: each drop floats above with its owner's face
  const drops = b ? [] : s.drops;
  drops.forEach((d, i) => {
    const n = drops.length;
    const it = s.pantry[d.item];
    if (!it) return;
    const age = d.at ? now - d.at : 9999;
    const fall = age >= 0 && age < 600 ? 1 - (age / 600) ** 2 : 0;
    const x = cx - 44 - (n - 1) * 23 + i * 46;
    const y = by - 24 - 40 * fall + Math.sin(now / 500 + i) * 2;
    drawIngredient(g, it.kind, x, y, 11, f);
    const known = inChat(ctx, d.by);
    g.beginPath();
    g.arc(x + 12, y + 10, 7, 0, Math.PI * 2);
    g.fillStyle = known ? userColor(d.by, t) : c.secondaryButton;
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = c.card;
    g.stroke();
    g.fillStyle = known ? c.onPrimary : c.secondaryButtonText;
    g.font = `700 8px ${t.type.family}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText((members.find((m) => m.id === d.by)?.name ?? d.name)[0]?.toUpperCase() ?? "?", x + 12, y + 10.5);
    const lab = fitText(it.label, 46, { g, size: 10, min: 8, weight: 500 });
    g.font = lab.font;
    g.fillStyle = c.secondaryText;
    g.fillText(lab.text, x, y - 20);
  });
  if (!b && !drops.length) {
    g.strokeStyle = c.divider;
    g.setLineDash([4, 3]);
    g.lineWidth = 1.5;
    g.beginPath();
    g.ellipse(cx - 20, by - 26, 48, 16, 0, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  }
  // steam
  if (cooking || (doneB && e < COOK_MS + 2500)) {
    g.strokeStyle = mix(c.secondaryText, c.card, 0.45);
    g.lineWidth = 3;
    g.lineCap = "round";
    g.beginPath();
    for (let k = 0; k < 3; k++) {
      const x0 = cx - 18 + k * 18;
      const ph = now / 220 + k;
      const top = by - 34 - 30 * ((now / 700 + k / 3) % 1);
      g.moveTo(x0, by - 16);
      g.bezierCurveTo(x0 + 8 * Math.sin(ph), by - 24, x0 - 8 * Math.sin(ph), top + 10, x0 + 4 * Math.sin(ph), top);
    }
    g.stroke();
    g.lineCap = "butt";
  }
  // the dish, when it dings
  if (doneB) {
    const q = Math.min(1, (e - COOK_MS) / 500);
    const pop = 1 - (1 - q) ** 3;
    const dx = W - 64;
    const dy = 150 - 20 * pop;
    g.globalAlpha = pop;
    g.fillStyle = p.paper;
    g.strokeStyle = line;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(dx - 38, dy);
    g.lineTo(dx + 38, dy);
    g.quadraticCurveTo(dx + 34, dy + 34, dx, dy + 34);
    g.quadraticCurveTo(dx - 34, dy + 34, dx - 38, dy);
    g.fill();
    g.stroke();
    g.fillStyle = p.cream;
    g.beginPath();
    g.ellipse(dx, dy, 34, 14, 0, Math.PI, 0);
    g.fill();
    b!.items.slice(0, 4).forEach((ix, k) => {
      const it = s.pantry[ix];
      if (it) drawIngredient(g, it.kind, dx - 18 + k * 12, dy - 6 - (k % 2) * 4, 5, f);
    });
    g.globalAlpha = 1;
    if (e - COOK_MS < 900) {
      g.fillStyle = p.yellow;
      g.font = `800 16px ${t.type.family}`;
      g.textAlign = "center";
      g.fillText("ding", cx + bw / 2 + 4, by - 8 - 10 * q);
    }
  }
  return cooking || (doneB && e < COOK_MS + 2500) || s.drops.some((d) => d.at && now - d.at < 650) || !b;
}

export default defineApp<State, Action, Local>({
  name: "Cupboard cooker",
  summary: (s) => (s.batch ? `${s.title}: made ${s.batch.dish}` : `${s.title}: ${s.drops.length} things in · ${s.drops.length >= 2 ? "ready to cook" : "add one"}`),
  init: initState,
  reduce: reduceR,

  invariants: {
    "one thing each, six at most": (s) => new Set(s.drops.map((d) => d.by)).size === s.drops.length && s.drops.length <= 6,
    "drops come from the cupboard": (s) => s.drops.every((d) => Number.isInteger(d.item) && d.item >= 0 && d.item < s.pantry.length),
    "a batch has at least two things": (s) => !s.batch || (s.batch.items.length >= 2 && s.batch.items.every((i) => i >= 0 && i < s.pantry.length)),
    "batches are counted": (s) => Number.isInteger(s.batches) && (s.batch ? s.batch.n === s.batches : true) && s.batches >= 0,
  },

  transitions: {
    "adding puts in exactly yours": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const d = n.drops.find((x) => x.by === m.user);
      return !p.batch && !!d && d.item === a.item && d.at === m.time && n.drops.filter((x) => x.by !== m.user).length === p.drops.filter((x) => x.by !== m.user).length;
    },
    "nothing goes in while it cooks": (p, n, a) => !p.batch || a.t === "again" || JSON.stringify(p.drops) === JSON.stringify(n.drops),
    "cooking names the dish from what went in and the seed": (p, n, a, m) => {
      if (a.t !== "cook" || p === n) return true;
      const items = p.drops.map((d) => d.item);
      return !p.batch && p.drops.length >= 2 && !!n.batch && n.batch.dish === dishName(p.pantry, items, m.seed) && n.batch.at === m.time && n.batch.by === m.user && n.batches === p.batches + 1 && JSON.stringify(n.batch.items) === JSON.stringify(items);
    },
    "two things in and the switch flips": (p, n, a, m, ctx) => a.t !== "cook" || !inChat(ctx, m.user) || !!p.batch || p.drops.length < 2 || !!n.batch,
    "again empties the pot": (p, n, a) => a.t !== "again" || p === n || (!!p.batch && !n.batch && n.drops.length === 0 && n.batches === p.batches),
    "the cupboard never changes": (p, n) => JSON.stringify(p.pantry) === JSON.stringify(n.pantry),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    if (s.batch) return r.next() < 0.7 ? { t: "again" } : { t: "add", item: r.int(s.pantry.length) };
    return s.drops.length >= 2 && r.next() < 0.35 ? { t: "cook" } : { t: "add", item: r.int(s.pantry.length) };
  },

  local: { toast: 0, msg: "", page: 0 },

  view: ({ state, confirmed, pending, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const ctx: Ctx = { room: "", members };
    const waiting = pending && state.batches !== confirmed.batches;
    const b = confirmed.batch;
    const steaming = b ? running(b.at, COOK_MS) !== null : false;
    const mine = state.drops.find((d) => d.by === me);
    const nm = (id: string, fb: string) => (id === me ? "You" : first(members.find((m) => m.id === id)?.name ?? fb));
    const k = theme.width < 360 ? 2 : theme.width < 440 ? 3 : 4;
    const pages = Math.ceil(state.pantry.length / k);
    const pg = local.page % pages;

    let line: string;
    let action;
    if (waiting) {
      line = "Cooking…";
      action = <Button kind="secondary" disabled>Cooking</Button>;
    } else if (b && steaming) {
      line = `${nm(b.by, "Someone")} flipped the switch · cooking`;
      action = <Button kind="secondary" disabled>Cooking</Button>;
    } else if (b) {
      line = `${nm(b.by, "Someone")} flipped the switch · ${b.items.length} things went in`;
      action = <Button kind="secondary" onClick={() => dispatch({ t: "again" })}>Again</Button>;
    } else {
      line = state.drops.length ? state.drops.map((d) => `${nm(d.by, d.name)}: ${state.pantry[d.item]?.label ?? ""}`).join(" · ") : "Drop something in · it makes everything";
      action = (
        <Button kind="primary" disabled={state.drops.length < 2} onClick={() => { haptic("medium"); dispatch({ t: "cook" }); }}>
          Cook it
        </Button>
      );
    }

    const chip = { height: 44, minWidth: 44, padding: 0, border: "none", background: "transparent", font: "inherit", cursor: "pointer", display: "flex", alignItems: "center" } as const;

    return (
      <div>
        <CardHeader title={state.title} subtitle={b && !steaming ? `${state.owner ? `${state.owner}: ` : ""}“${state.verdict || "it makes everything"}”` : mine ? `You added ${state.pantry[mine.item]?.label}` : "Everyone drops in one thing"} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={b ? `Rice cooker made ${b.dish}` : `Rice cooker with ${state.drops.length} things waiting to go in`} draw={(g, f) => drawCooker(g, f, b ? confirmed : state, members, ctx, waiting)} />
          {b && !steaming ? (
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 4, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
              <span style={{ maxWidth: "90%", padding: "4px 12px", borderRadius: 14, background: c.card, color: c.text, fontSize: 15, fontWeight: 700, lineHeight: "20px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`“${b.dish}”`}</span>
            </div>
          ) : null}
        </div>
        {b ? null : (
          <div style={{ display: "flex", gap: 6, height: 44, overflow: "hidden", marginTop: 4 }}>
            {state.pantry.map((it, i) => ({ it, i })).slice(pg * k, pg * k + k).map(({ it, i }) => {
              const sel = mine?.item === i;
              return (
                <button key={i} type="button" aria-pressed={sel} onClick={() => { haptic("light"); dispatch({ t: "add", item: i }); setLocal({ toast: local.toast + 1, msg: `In goes ${it.label}` }); }} style={{ ...chip, flex: "1 1 0", minInlineSize: 0 }}>
                  <span style={{ width: "100%", height: 32, lineHeight: "32px", padding: "0 8px", borderRadius: 16, background: sel ? c.selected : c.wash, color: c.text, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block", boxSizing: "border-box" }}>{it.label}</span>
                </button>
              );
            })}
            {pages > 1 ? (
              <button type="button" aria-label="More from the cupboard" onClick={() => setLocal({ page: local.page + 1 })} style={{ ...chip, flex: "none" }}>
                <span style={{ height: 32, lineHeight: "32px", padding: "0 12px", borderRadius: 16, background: c.secondaryButton, color: c.secondaryButtonText, fontSize: 15, fontWeight: 600, display: "block" }}>{"…"}</span>
              </button>
            ) : null}
          </div>
        )}
        <div style={{ marginTop: 4, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line}</span>
          {action}
        </div>
        {local.toast > 0 ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
