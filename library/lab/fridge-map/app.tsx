import {
  defineApp,
  Button,
  Canvas,
  CardHeader,
  Toast,
  fitText,
  haptic,
  mix,
  running,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// The 412 Pine fridge, door open. Every item is drawn on its shelf with its owner's color, old
// stuff gets stink lines, and the door strip shows who's taking up the space. Tap anything to
// claim it or toss it; one button clears out the mystery food nobody will admit to.

type Kind = "carton" | "box" | "pot" | "cup" | "bottle" | "eggs" | "lemon" | "slice" | "jar";
type Params = {
  /** Card title: "412 Pine fridge" */
  title: string;
  /** Under the title: "“whose rice is this” · day 6" */
  sub: string;
  /** Items by shelf (0 top to 2 bottom). owner: a name, or "" for mystery. days: how old. old: days after which it counts as expired. */
  items: { label: string; tag: string; kind: Kind; shelf: number; owner: string; days: number; old: number; count: number }[];
};

// @params
const P: Params = {
  title: "412 Pine fridge",
  sub: "“whose rice is this” · fridge audit",
  items: [
    { label: "Rice (cooker batch)", tag: "rice", kind: "pot", shelf: 0, owner: "Arun", days: 6, old: 5, count: 1 },
    { label: "Oat milk", tag: "oat milk", kind: "carton", shelf: 0, owner: "Tsai Lin", days: 3, old: 10, count: 1 },
    { label: "Yogurts, one per alarm", tag: "yogurt", kind: "cup", shelf: 0, owner: "Calvin", days: 2, old: 14, count: 7 },
    { label: "Meal prep, Mon to Wed", tag: "meal prep", kind: "box", shelf: 1, owner: "Maya", days: 1, old: 4, count: 3 },
    { label: "Golden Lantern takeout", tag: "takeout", kind: "box", shelf: 1, owner: "", days: 9, old: 4, count: 1 },
    { label: "Rook's leftovers", tag: "pizza", kind: "slice", shelf: 1, owner: "Will", days: 4, old: 4, count: 2 },
    { label: "Eggs", tag: "eggs", kind: "eggs", shelf: 2, owner: "Aditya", days: 5, old: 21, count: 1 },
    { label: "Half a lemon", tag: "lemon", kind: "lemon", shelf: 2, owner: "", days: 12, old: 7, count: 1 },
    { label: "Hot sauce", tag: "hot sauce", kind: "bottle", shelf: 2, owner: "Will", days: 40, old: 365, count: 1 },
    { label: "Mystery jar", tag: "???", kind: "jar", shelf: 2, owner: "", days: 20, old: 10, count: 1 },
  ],
};
// @end params

type Item = { id: string; label: string; tag: string; kind: Kind; shelf: number; owner: string; days: number; old: number; count: number };
type State = { title: string; sub: string; names: Record<string, string>; items: Item[]; tossed: { label: string; by: string }[]; sweptAt: number; swept: string[] };
type Action = { t: "claim"; id: string } | { t: "toss"; id: string } | { t: "sweep" };
type Local = { pick: string; toast: number };

const KINDS: Kind[] = ["carton", "box", "pot", "cup", "bottle", "eggs", "lemon", "slice", "jar"];
const TAU = Math.PI * 2;
const CH = 228;
const FLY = 900;
const WIDTH: Record<Kind, number> = { carton: 34, box: 44, pot: 56, cup: 20, bottle: 22, eggs: 60, lemon: 30, slice: 44, jar: 32 };
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const seeded = (who: string) => who.startsWith("~");
const firstName = (n: string) => n.split(" ")[0] ?? n;
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const expired = (i: Item) => i.days > i.old;
const mystery = (s: State) => s.items.filter((i) => i.owner === "" && expired(i));
const nameOf = (s: State, who: string) => s.names[who] ?? (seeded(who) ? who.slice(1) : "Someone");
const memberOf = (s: State, who: string): Member => ({ id: who, name: nameOf(s, who) });

function initState(ctx: Ctx): State {
  const names: Record<string, string> = {};
  const items: Item[] = [];
  for (const raw of P.items) {
    if (items.length >= 14) break;
    const label = clean(raw.label, 30);
    if (!label) continue;
    const name = clean(raw.owner, 20);
    let owner = "";
    if (name) {
      const m = ctx.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
      owner = m ? m.id : `~${name}`;
      names[owner] = m ? m.name : name;
    }
    const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : d);
    items.push({ id: `i${items.length}`, label, tag: clean(raw.tag, 14) || label.split(" ")[0]!.toLowerCase(), kind: KINDS.includes(raw.kind) ? raw.kind : "box", shelf: int(raw.shelf, 0, 2, 0), owner, days: int(raw.days, 0, 999, 0), old: int(raw.old, 1, 999, 7), count: int(raw.count, 1, 9, 1) });
  }
  for (const m of ctx.members) names[m.id] = m.name;
  return { title: clean(P.title, 40) || "Fridge", sub: clean(P.sub, 60), names, items, tossed: [], sweptAt: 0, swept: [] };
}

/** Where each item sits: x, y (bottom), width, height. Shared by drawing and tapping. */
function place(s: State, W: number) {
  const left = 14;
  const right = W - 88;
  const shelfY = [62, 130, 198];
  const out: Record<string, { x: number; y: number; w: number; h: number }> = {};
  for (const shelf of [0, 1, 2]) {
    const row = s.items.filter((i) => i.shelf === shelf);
    const want = row.reduce((a, i) => a + WIDTH[i.kind] * (i.kind === "cup" || i.kind === "box" ? Math.min(i.count, 3) : 1), 0);
    const room = right - left - 8;
    const k = Math.min(1, room / Math.max(1, want + (row.length - 1) * 6));
    let x = left + 4;
    for (const i of row) {
      const w = WIDTH[i.kind] * (i.kind === "cup" || i.kind === "box" ? Math.min(i.count, 3) : 1) * k;
      out[i.id] = { x, y: shelfY[shelf]!, w, h: i.kind === "carton" || i.kind === "bottle" ? 52 : i.kind === "jar" ? 38 : i.kind === "pot" ? 42 : 32 };
      x += w + 6 * k;
    }
  }
  return out;
}

function drawItem(g: CanvasRenderingContext2D, t: Theme, i: Item, b: { x: number; y: number; w: number; h: number }, owner: string) {
  const c = t.color;
  const dk = t.mode === "dark";
  const ink = dk ? c.wash : c.text;
  const paper = dk ? c.text : c.card;
  const tint = owner ? owner : mix(c.secondaryText, paper, 0.4);
  const { x, y, w, h } = b;
  g.beginPath();
  if (i.kind === "carton") {
    g.moveTo(x, y);
    g.lineTo(x, y - h + 10);
    g.lineTo(x + w / 2, y - h);
    g.lineTo(x + w, y - h + 10);
    g.lineTo(x + w, y);
    g.closePath();
    g.fillStyle = paper;
    g.fill();
    g.beginPath();
    g.rect(x, y - h * 0.55, w, h * 0.25);
    g.fillStyle = tint;
    g.fill();
  } else if (i.kind === "box") {
    const n = Math.min(3, i.count);
    const bw = w / n;
    for (let k = 0; k < n; k++) {
      g.roundRect(x + k * bw + 1, y - h, bw - 2, h, 3);
    }
    g.fillStyle = mix(tint, paper, 0.55);
    g.fill();
    g.beginPath();
    for (let k = 0; k < n; k++) g.rect(x + k * bw + 1, y - h, bw - 2, 5);
    g.fillStyle = tint;
    g.fill();
  } else if (i.kind === "pot") {
    g.roundRect(x + 3, y - h + 6, w - 6, h - 6, [4, 4, 10, 10]);
    g.fillStyle = mix(c.secondaryText, paper, 0.55);
    g.fill();
    g.beginPath();
    g.ellipse(x + w / 2, y - h + 6, w / 2 - 3, 5, 0, 0, TAU);
    g.fillStyle = paper;
    g.fill();
    g.beginPath();
    g.rect(x + 3, y - h * 0.45, w - 6, 6);
    g.fillStyle = tint;
    g.fill();
  } else if (i.kind === "cup") {
    const n = Math.min(3, i.count);
    const cw = w / n;
    for (let k = 0; k < n; k++) {
      g.moveTo(x + k * cw + 1, y - h);
      g.lineTo(x + (k + 1) * cw - 1, y - h);
      g.lineTo(x + (k + 1) * cw - 3, y);
      g.lineTo(x + k * cw + 3, y);
      g.closePath();
    }
    g.fillStyle = paper;
    g.fill();
    g.beginPath();
    for (let k = 0; k < n; k++) g.rect(x + k * cw + 1, y - h, cw - 2, 4);
    g.fillStyle = tint;
    g.fill();
  } else if (i.kind === "bottle") {
    g.roundRect(x + 2, y - h + 14, w - 4, h - 14, 4);
    g.rect(x + w / 2 - 3, y - h, 6, 16);
    g.fillStyle = c.series4;
    g.fill();
    g.beginPath();
    g.rect(x + 2, y - h * 0.45, w - 4, 8);
    g.fillStyle = tint;
    g.fill();
  } else if (i.kind === "eggs") {
    g.roundRect(x, y - h * 0.55, w, h * 0.55, 3);
    g.fillStyle = mix(c.series5, paper, 0.6);
    g.fill();
    g.beginPath();
    for (let k = 0; k < 4; k++) {
      const ex = x + (k + 0.5) * (w / 4);
      g.moveTo(ex + 5, y - h * 0.55);
      g.ellipse(ex, y - h * 0.55, 5, 7, 0, 0, TAU);
    }
    g.fillStyle = paper;
    g.fill();
    g.beginPath();
    g.rect(x, y - 5, w, 4);
    g.fillStyle = tint;
    g.fill();
  } else if (i.kind === "lemon") {
    g.arc(x + w / 2, y, w / 2, Math.PI, 0);
    g.closePath();
    g.fillStyle = c.series2;
    g.fill();
    g.beginPath();
    g.arc(x + w / 2, y, w / 2 - 3, Math.PI, 0);
    g.closePath();
    g.fillStyle = mix(c.series2, paper, 0.5);
    g.fill();
  } else if (i.kind === "slice") {
    g.moveTo(x, y);
    g.lineTo(x + w, y);
    g.lineTo(x + w / 2, y - h);
    g.closePath();
    g.fillStyle = mix(c.series2, paper, 0.3);
    g.fill();
    g.beginPath();
    g.rect(x, y - 4, w, 4);
    g.fillStyle = tint;
    g.fill();
  } else {
    g.roundRect(x + 2, y - h + 6, w - 4, h - 6, 4);
    g.fillStyle = mix(c.series3, ink, 0.35);
    g.fill();
    g.beginPath();
    g.rect(x, y - h, w, 7);
    g.fillStyle = mix(c.secondaryText, paper, 0.3);
    g.fill();
  }
}

function drawFridge(g: CanvasRenderingContext2D, f: DrawFrame, s: State, pick: string) {
  const t = f.theme;
  const c = t.color;
  const dk = t.mode === "dark";
  const W = f.width;
  const pos = place(s, W);
  let anim = false;

  // Body and inside light.
  g.beginPath();
  g.roundRect(4, 4, W - 84, CH - 8, 12);
  g.fillStyle = mix(c.secondaryText, c.card, dk ? 0.6 : 0.75);
  g.fill();
  g.beginPath();
  g.roundRect(10, 10, W - 96, CH - 20, 8);
  g.fillStyle = mix(c.series1, c.card, dk ? 0.82 : 0.92);
  g.fill();
  g.beginPath();
  g.roundRect(W / 2 - 52, 10, 36, 6, [0, 0, 3, 3]);
  g.fillStyle = mix(c.series2, c.card, dk ? 0.5 : 0.4);
  g.fill();
  // Shelves.
  g.beginPath();
  for (const y of [62, 130, 198]) g.rect(10, y, W - 96, 14);
  g.fillStyle = mix(c.series1, c.card, dk ? 0.5 : 0.6);
  g.fill();

  // Items.
  for (const i of s.items) {
    const b = pos[i.id];
    if (!b) continue;
    const owner = i.owner ? userColor(memberOf(s, i.owner), t) : "";
    const lift = i.id === pick ? 4 : 0;
    drawItem(g, t, i, { ...b, y: b.y - lift }, owner);
    if (expired(i)) {
      // Stink lines.
      g.beginPath();
      for (const k of [-1, 1]) {
        const sx = b.x + b.w / 2 + k * 5;
        g.moveTo(sx, b.y - b.h - 3);
        g.quadraticCurveTo(sx + 4 * Math.sin(f.now / 250 + k), b.y - b.h - 8, sx, b.y - b.h - 14);
      }
      g.lineWidth = 1.6;
      g.strokeStyle = c.series3;
      g.stroke();
      anim = true;
    }
    // Tag on the shelf edge.
    const tag = fitText(i.tag, Math.max(26, b.w + 4), { g, size: 10, min: 10, weight: 600 });
    if (tag.text && tag.text !== "…") {
      g.font = tag.font;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = c.text;
      g.fillText(tag.text, b.x + b.w / 2, b.y + 7.5);
    }
    if (i.id === pick) {
      g.setLineDash([3, 3]);
      g.lineWidth = 1.5;
      g.strokeStyle = c.primary;
      g.strokeRect(b.x - 3, b.y - b.h - 7, b.w + 6, b.h + 9);
      g.setLineDash([]);
    }
  }

  // Swept items flying into the bin.
  const e = s.sweptAt ? running(s.sweptAt, FLY) : null;
  const binX = W - 39;
  const binY = CH - 12;
  if (e !== null) {
    anim = true;
    s.swept.forEach((label, k) => {
      const u = Math.min(1, e / FLY + k * 0.05);
      const sx = W * 0.3 + k * 30;
      const x = sx + (binX - sx) * u;
      const y = 120 - Math.sin(u * Math.PI) * 70 + (binY - 120) * u;
      g.beginPath();
      g.arc(x, y, 7, 0, TAU);
      g.fillStyle = c.series3;
      g.fill();
      void label;
    });
  }

  // The open door: who's taking up the space, as a stacked strip.
  const dx = W - 74;
  g.beginPath();
  g.roundRect(dx, 4, 70, CH - 52, 10);
  g.fillStyle = mix(c.secondaryText, c.card, dk ? 0.55 : 0.7);
  g.fill();
  const owners: Record<string, number> = {};
  for (const i of s.items) owners[i.owner || "?"] = (owners[i.owner || "?"] ?? 0) + i.count;
  const total = Object.values(owners).reduce((a, b) => a + b, 0) || 1;
  let yy = 14;
  const room = CH - 76;
  const order = Object.keys(owners).sort((a, b) => owners[b]! - owners[a]!);
  for (const o of order) {
    const hgt = (owners[o]! / total) * room;
    g.beginPath();
    g.roundRect(dx + 8, yy, 18, Math.max(2, hgt - 2), 3);
    g.fillStyle = o === "?" ? mix(c.secondaryText, c.card, 0.3) : userColor(memberOf(s, o), t);
    g.fill();
    if (hgt >= 13) {
      const lab = fitText(o === "?" ? "???" : firstName(nameOf(s, o)), 40, { g, size: 10, min: 10, weight: 600 });
      g.font = lab.font;
      g.textAlign = "left";
      g.textBaseline = "middle";
      g.fillStyle = c.text;
      g.fillText(lab.text, dx + 29, yy + hgt / 2 - 1);
    }
    yy += hgt;
  }
  // Trash bin.
  g.beginPath();
  g.moveTo(binX - 14, binY - 30);
  g.lineTo(binX + 14, binY - 30);
  g.lineTo(binX + 11, binY);
  g.lineTo(binX - 11, binY);
  g.closePath();
  g.fillStyle = mix(c.secondaryText, dk ? c.wash : c.text, 0.3);
  g.fill();
  g.beginPath();
  g.roundRect(binX - 16, binY - 35, 32, 5, 2);
  g.fill();
  g.font = `700 11px ${t.type.family}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = c.card;
  if (dk) g.fillStyle = c.text;
  g.fillText(`${s.tossed.length}`, binX, binY - 14);
  return anim;
}

export default defineApp<State, Action, Local>({
  name: "Fridge map",
  summary: (s) => {
    const m = mystery(s).length;
    return `${s.title}: ${s.items.length} things${m ? ` · ${m} mystery and expired` : ""}${s.tossed.length ? ` · ${s.tossed.length} tossed` : ""}`;
  },

  init: (ctx) => initState(ctx),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "claim") {
      const i = s.items.find((x) => x.id === a.id);
      if (!i || (i.owner !== "" && i.owner !== m.user)) return s;
      const owner = i.owner === m.user ? "" : m.user;
      const names = { ...s.names, [m.user]: ctx.members.find((x) => x.id === m.user)?.name ?? "Friend" };
      return { ...s, names, items: s.items.map((x) => (x.id === a.id ? { ...x, owner } : x)) };
    }
    if (a.t === "toss") {
      const i = s.items.find((x) => x.id === a.id);
      if (!i || (i.owner !== m.user && !(i.owner === "" && expired(i)))) return s;
      return { ...s, items: s.items.filter((x) => x.id !== a.id), tossed: [...s.tossed, { label: i.label, by: m.user }].slice(-20) };
    }
    if (a.t === "sweep") {
      const gone = mystery(s);
      if (!gone.length) return s;
      return { ...s, items: s.items.filter((x) => !gone.includes(x)), tossed: [...s.tossed, ...gone.map((x) => ({ label: x.label, by: m.user }))].slice(-20), sweptAt: m.time, swept: gone.map((x) => x.label) };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const names = { ...s.names };
    for (const m of ctx.members) names[m.id] = m.name;
    // Someone who left keeps their food, under their name.
    const items = s.items.map((i) => (i.owner === "" || seeded(i.owner) || inChat(ctx, i.owner) ? i : { ...i, owner: `~${names[i.owner] ?? "Friend"}` }));
    for (const i of items) if (seeded(i.owner) && !names[i.owner]) names[i.owner] = i.owner.slice(1);
    return { ...s, names, items };
  },

  invariants: {
    "items have unique ids and real shelves": (s) => new Set(s.items.map((i) => i.id)).size === s.items.length && s.items.every((i) => i.shelf >= 0 && i.shelf <= 2 && KINDS.includes(i.kind)),
    "owners are friends or nobody": (s, ctx) => s.items.every((i) => i.owner === "" || seeded(i.owner) || inChat(ctx, i.owner)),
    "counts and ages are whole": (s) => s.items.every((i) => Number.isInteger(i.count) && i.count >= 1 && Number.isInteger(i.days) && i.days >= 0 && Number.isInteger(i.old) && i.old >= 1),
    "the bin keeps the last 20": (s) => s.tossed.length <= 20,
    "a sweep leaves no mystery food behind": (s) => s.sweptAt === 0 || s.swept.length > 0,
  },

  transitions: {
    "a claim takes or lets go of one unowned or own item": (p, n, a, m) => {
      if (a.t !== "claim" || p === n) return true;
      const before = p.items.find((i) => i.id === a.id);
      const after = n.items.find((i) => i.id === a.id);
      return !!before && !!after && (before.owner === "" ? after.owner === m.user : before.owner === m.user && after.owner === "") && n.items.length === p.items.length;
    },
    "only your own or expired mystery food gets tossed": (p, n, a, m) => {
      if (a.t !== "toss" || p === n) return true;
      const i = p.items.find((x) => x.id === a.id);
      return !!i && (i.owner === m.user || (i.owner === "" && i.days > i.old)) && n.items.length === p.items.length - 1 && !n.items.some((x) => x.id === a.id) && n.tossed[n.tossed.length - 1]?.label === i.label;
    },
    "a sweep takes exactly the expired mystery food": (p, n, a, m) => {
      if (a.t !== "sweep" || p === n) return true;
      const gone = p.items.filter((i) => i.owner === "" && i.days > i.old);
      return gone.length > 0 && n.items.length === p.items.length - gone.length && n.items.every((i) => !(i.owner === "" && i.days > i.old)) && n.sweptAt === m.time && n.swept.length === gone.length;
    },
    "nothing comes back out of the bin": (p, n) => n.items.every((i) => p.items.some((x) => x.id === i.id)),
    "only a claim changes owners": (p, n, a) => a.t === "claim" || n.items.every((i) => p.items.find((x) => x.id === i.id)?.owner === i.owner || seeded(i.owner)),
    "unknown actions change nothing": (p, n, a) => a.t === "claim" || a.t === "toss" || a.t === "sweep" || JSON.stringify(p) === JSON.stringify(n),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, user, r) => {
    if (mystery(s).length && r.next() < 0.25) return { t: "sweep" };
    const mine = s.items.filter((i) => i.owner === user || i.owner === "");
    if (!mine.length) return { t: "sweep" };
    const i = r.pick(mine);
    return r.next() < 0.6 ? { t: "claim", id: i.id } : { t: "toss", id: i.id };
  },

  local: { pick: "", toast: 0 },

  view: ({ state, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const s = state;
    const W = theme.width - 2 * theme.space.card;
    const pos = place(s, W);
    const sel = s.items.find((i) => i.id === local.pick);
    const myst = mystery(s);
    const old = s.items.filter(expired);
    const label = `Fridge: ${s.items.map((i) => `${i.label}${i.owner ? `, ${nameOf(s, i.owner)}'s` : ", nobody's"}, ${i.days} days${expired(i) ? ", expired" : ""}`).join("; ")}`;
    const onPointer = (e: { type: string; x: number; y: number }) => {
      if (e.type !== "up") return;
      const hit = s.items.find((i) => {
        const b = pos[i.id];
        return b && e.x >= b.x - 4 && e.x <= b.x + b.w + 4 && e.y >= b.y - b.h - 10 && e.y <= b.y + 6;
      });
      setLocal({ pick: hit && hit.id !== local.pick ? hit.id : "" });
    };

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.sub} />
        <Canvas height={CH} label={label} draw={(g, f) => drawFridge(g, f, s, local.pick)} onPointer={onPointer} />
        {sel ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, minWidth: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text, ...ell }}>{sel.count > 1 ? `${sel.label} ×${sel.count}` : sel.label}</div>
              <div style={{ fontSize: 13, lineHeight: "16px", color: expired(sel) ? c.negative : c.secondaryText, ...ell }}>
                {`${sel.owner ? `${sel.owner === me ? "Yours" : `${firstName(nameOf(s, sel.owner))}'s`}` : "Nobody's"} · day ${sel.days}${expired(sel) ? " · past it" : ""}`}
              </div>
            </div>
            {sel.owner === "" || sel.owner === me ? (
              <Button kind="secondary" onClick={() => dispatch({ t: "claim", id: sel.id })}>
                {sel.owner === me ? "Not mine" : "Mine"}
              </Button>
            ) : null}
            {sel.owner === me || (sel.owner === "" && expired(sel)) ? (
              <Button
                kind="secondary"
                onClick={() => {
                  setLocal({ pick: "" });
                  dispatch({ t: "toss", id: sel.id });
                }}
              >
                Toss
              </Button>
            ) : null}
          </div>
        ) : (
          <div style={{ height: 44, display: "flex", alignItems: "center", fontSize: 13, color: c.secondaryText, marginTop: 6, minWidth: 0, ...ell }}>
            {`${old.length} ${old.length === 1 ? "thing" : "things"} past it · tap anything to claim or toss`}
          </div>
        )}
        <div style={{ marginTop: 6 }}>
          <Button
            kind="primary"
            wide
            disabled={myst.length === 0}
            onClick={() => {
              haptic("medium");
              setLocal({ toast: local.toast + 1, pick: "" });
              dispatch({ t: "sweep" });
            }}
          >
            {myst.length ? `Toss ${myst.length} mystery things` : "No mystery food"}
          </Button>
        </div>
        {local.toast > 0 ? <Toast key={local.toast}>Fridge smells better already</Toast> : null}
      </div>
    );
  },
});
