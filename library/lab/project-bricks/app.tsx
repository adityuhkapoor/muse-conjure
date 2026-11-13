import { defineApp, Avatar, Button, Canvas, CardHeader, Facepile, Toast, fitText, haptic, mix, pal, running, spring, springs, userColor, type Ctx, type DrawFrame } from "@muse/app";

// Project bricks: the group project as a brick wall. Intro at the bottom, the rehearsal on top.
// Unclaimed bricks are dashed outlines of air; claim one and it fills with your color; finish it
// and it sets solid with mortar and a check. The night before it's due, the wall shows exactly
// which bricks are still air.

type Params = {
  /** Card title: "MKTG 340 deck" */
  title: string;
  /** Under the title: the chat and the deadline */
  sub: string;
  /** Short deadline for the flag on top: "Thu 11:59pm" */
  due: string;
  /** The work, foundation first. size 1 to 3 is how big a job it is (sets the brick width). who: who claimed it. done: finished. said: what they said about it. */
  bricks: { label: string; size: number; who?: string; done?: boolean; said?: string }[];
};

// @params
const P: Params = {
  title: "MKTG 340 deck",
  sub: "MKTG 340 group · due Thu 11:59pm",
  due: "Thu 11:59pm",
  bricks: [
    { label: "Intro", size: 1, who: "Maya", done: true, said: "made us a color-coded tracker. nobody opened it" },
    { label: "Research", size: 2, who: "Maya", done: true },
    { label: "Survey data", size: 2, who: "Tsai Lin" , said: "47 responses, mostly from my floor" },
    { label: "Pricing", size: 2 },
    { label: "Promo plan", size: 2, who: "Will", said: "doing it from the sube between classes" },
    { label: "Channels", size: 1 },
    { label: "Slides", size: 3 },
    { label: "Exec summary", size: 1 },
    { label: "Rehearsal", size: 2 },
  ],
};
// @end params

type Brick = { label: string; size: number; who: string; name: string; done: boolean; said: string; at: number };
type State = { title: string; sub: string; due: string; bricks: Brick[] };
type Action = { t: "claim"; i: number } | { t: "set"; i: number } | { t: "drop"; i: number };
type Local = { toast: number; msg: string };

const ROWH = 46;
const UNITS = 6;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const okI = (s: State, i: unknown): i is number => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < s.bricks.length;
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const first = (n: string) => n.split(" ")[0] ?? n;
const THUD = spring({ ...springs.iosBouncy });

/** Lay bricks in rows of UNITS from the bottom; odd rows start half a brick in (running bond). */
function layout(bricks: Brick[]) {
  const rowsOf: number[][] = [[]];
  let u = 0;
  bricks.forEach((b, i) => {
    const off = (rowsOf.length - 1) % 2 ? 0.5 : 0;
    if (u + off + b.size > UNITS + 0.01 && u > 0) {
      rowsOf.push([]);
      u = 0;
    }
    rowsOf[rowsOf.length - 1]!.push(i);
    u += b.size;
  });
  // Each row is stretched to the full wall so the courses line up like a real wall.
  const out: { i: number; row: number; u0: number; u1: number }[] = [];
  rowsOf.forEach((ids, row) => {
    const off = row % 2 ? 0.5 : 0;
    const total = ids.reduce((n, i) => n + bricks[i]!.size, 0) || 1;
    const k = (UNITS - off) / total;
    let at = off;
    for (const i of ids) {
      out.push({ i, row, u0: at, u1: at + bricks[i]!.size * k });
      at += bricks[i]!.size * k;
    }
  });
  return { cells: out, rows: rowsOf.length };
}

function initState(ctx: Ctx): State {
  const bricks: Brick[] = [];
  for (const x of Array.isArray(P.bricks) ? P.bricks : []) {
    const label = clean(x?.label, 18);
    if (!label || bricks.length >= 14) continue;
    const nm = clean(x.who, 20);
    const m = nm ? ctx.members.find((y) => y.id === nm || y.name.toLowerCase() === nm.toLowerCase()) : undefined;
    const who = m ? m.id : nm ? `~${nm}` : "";
    const size = typeof x.size === "number" && Number.isInteger(x.size) ? Math.max(1, Math.min(3, x.size)) : 1;
    bricks.push({ label, size, who, name: m ? clean(m.name, 20) || nm : nm, done: !!who && !!x.done, said: who ? clean(x.said, 60) : "", at: 0 });
  }
  if (!bricks.length) for (const l of ["Intro", "Research", "Slides", "Rehearsal"]) bricks.push({ label: l, size: 2, who: "", name: "", done: false, said: "", at: 0 });
  return { title: clean(P.title, 40) || "Group project", sub: clean(P.sub, 60), due: clean(P.due, 16), bricks };
}

function drawWall(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string, H: number) {
  const t = f.theme;
  const c = t.color;
  const pl = pal(t);
  const dk = t.mode === "dark";
  const W = f.width;
  const { cells, rows } = layout(s.bricks);
  const uw = (W - 52) / UNITS;
  const x0 = 12;
  const ground = H - 10;
  const top = ground - rows * ROWH;
  let anim = false;

  // Sky behind the site.
  g.beginPath();
  g.roundRect(0, 0, W, H, 14);
  g.fillStyle = dk ? mix(pl.blue, c.wash, 0.78) : mix(pl.sky, c.card, 0.35);
  g.fill();
  // Ground.
  g.beginPath();
  g.roundRect(0, ground, W, H - ground, [0, 0, 14, 14]);
  g.fillStyle = dk ? mix(pl.brown, c.wash, 0.4) : mix(pl.crust, c.card, 0.35);
  g.fill();

  // The deadline flag on a pole at the right of the top row.
  const px = W - 22;
  g.fillStyle = dk ? c.text : c.secondaryText;
  g.fillRect(px, Math.max(4, top - 30), 2, ground - Math.max(4, top - 30));
  const wave = Math.sin(f.now / 260) * 2;
  anim = true;
  g.beginPath();
  const fy = Math.max(4, top - 30);
  g.moveTo(px, fy);
  g.lineTo(px - 92, fy + 2 + wave);
  g.lineTo(px - 92, fy + 20 + wave);
  g.lineTo(px, fy + 18);
  g.closePath();
  g.fillStyle = mix(pl.red, dk ? c.wash : c.card, 0.45);
  g.fill();
  const due = fitText(s.due ? `due ${s.due}` : "due soon", 86, { g, size: 10, min: 8, weight: 700 });
  g.font = due.font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = c.text;
  g.fillText(due.text, px - 46, fy + 10.5 + wave / 2);

  // Bricks.
  const air: { x: number; y: number; w: number }[] = [];
  for (const cell of cells) {
    const b = s.bricks[cell.i]!;
    const x = x0 + cell.u0 * uw + 1.5;
    const w = (cell.u1 - cell.u0) * uw - 3;
    let y = ground - (cell.row + 1) * ROWH + 1.5;
    const h = ROWH - 3;
    if (!b.who) {
      air.push({ x, y, w });
      continue;
    }
    const run = b.at ? running(b.at, 700) : null;
    if (run !== null) {
      anim = true;
      y -= (1 - Math.min(1, THUD(run))) * 26;
    }
    const col = userColor(b.who, t);
    g.beginPath();
    g.roundRect(x, y, w, h, 4);
    g.fillStyle = b.done ? mix(col, dk ? c.wash : c.text, 0.12) : mix(col, dk ? c.wash : c.card, 0.62);
    g.fill();
    if (b.done) {
      // Brick texture: two little speckles and a lighter top edge.
      g.fillStyle = mix(col, c.card, 0.3);
      g.fillRect(x + 3, y + 3, w - 6, 2);
    } else {
      g.lineWidth = 2;
      g.strokeStyle = col;
      g.stroke();
    }
    const narrow = w < 90;
    const lab = fitText(b.label, narrow ? w - 8 : w - (b.done ? 50 : 36), { g, size: 12, min: 10, weight: 700 });
    g.font = lab.font;
    g.textAlign = narrow ? "center" : "left";
    g.textBaseline = "middle";
    g.fillStyle = b.done ? c.onPrimary : c.text;
    g.fillText(lab.text, narrow ? x + w / 2 : x + 30, narrow ? y + h / 2 + 7 : y + h / 2);
    if (b.done && w >= 90) {
      // A check stamped into the brick, far right.
      g.strokeStyle = c.onPrimary;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x + w - 15, y + h / 2);
      g.lineTo(x + w - 11, y + h / 2 + 4);
      g.lineTo(x + w - 5, y + h / 2 - 5);
      g.stroke();
    }
  }
  // Air: dashed outlines, the labels in grey.
  g.setLineDash([4, 4]);
  g.lineWidth = 1.5;
  g.strokeStyle = dk ? c.secondaryText : c.secondaryText;
  for (const a of air) {
    g.beginPath();
    g.roundRect(a.x, a.y, a.w, ROWH - 3, 4);
    g.stroke();
  }
  g.setLineDash([]);
  for (const cell of cells) {
    const b = s.bricks[cell.i]!;
    if (b.who) continue;
    const x = x0 + cell.u0 * uw + 1.5;
    const w = (cell.u1 - cell.u0) * uw - 3;
    const y = ground - (cell.row + 1) * ROWH + 1.5;
    const lab = fitText(b.label, w - 12, { g, size: 12, min: 10, weight: 600 });
    g.font = lab.font;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = dk ? c.text : c.text;
    g.fillText(lab.text, x + w / 2, y + (ROWH - 3) / 2);
  }
  // The half bricks that square off the odd rows.
  for (let r = 1; r < rows; r += 2) {
    const y = ground - (r + 1) * ROWH + 1.5;
    g.beginPath();
    g.roundRect(x0 + 1.5, y, uw * 0.5 - 3, ROWH - 3, 3);
    g.fillStyle = dk ? mix(c.secondaryText, c.wash, 0.5) : mix(c.secondaryText, c.card, 0.6);
    g.fill();
  }
  // A crane hook dangles a fresh brick over the lowest brick of air.
  const next = cells.find((cl) => !s.bricks[cl.i]!.who);
  if (next) {
    const hx = Math.min(W - 124, x0 + ((next.u0 + next.u1) / 2) * uw);
    const hy = top - 4;
    const swing = Math.sin(f.now / 600) * 5;
    const ty = Math.max(14, hy - 10);
    g.strokeStyle = dk ? c.text : c.secondaryText;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(hx, 0);
    g.lineTo(hx + swing, ty - 12);
    g.stroke();
    g.beginPath();
    g.arc(hx + swing, ty - 8, 4, Math.PI * 1.1, Math.PI * 2.4);
    g.stroke();
    if (ty - 4 > 10) {
      g.beginPath();
      g.roundRect(hx + swing - 14, ty - 4, 28, 9, 2);
      g.fillStyle = mix(pl.red, dk ? c.wash : c.card, 0.25);
      g.fill();
    }
  }
  return anim;
}

export default defineApp<State, Action, Local>({
  name: "Project bricks",
  summary: (s) => {
    const set = s.bricks.filter((b) => b.done).length;
    const air = s.bricks.filter((b) => !b.who);
    if (set === s.bricks.length) return `${s.title}: every brick is set`;
    return `${s.title}: ${set} of ${s.bricks.length} set · ${air.length ? `${air.length} still air (${air.map((b) => b.label.toLowerCase()).slice(0, 3).join(", ")})` : "everything's claimed"}`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    const u = m.user;
    if (!inChat(ctx, u) || !okI(s, a.i)) return s;
    const b = s.bricks[a.i]!;
    const put = (x: Brick) => ({ ...s, bricks: s.bricks.map((y, k) => (k === a.i ? x : y)) });
    const name = clean(ctx.members.find((x) => x.id === u)?.name, 20) || "Friend";
    if (a.t === "claim") return b.who ? s : put({ ...b, who: u, name, done: false, said: "", at: m.time });
    if (a.t === "set") return b.who !== u ? s : put({ ...b, done: !b.done, at: b.done ? b.at : m.time });
    if (a.t === "drop") return b.who !== u || b.done ? s : put({ ...b, who: "", name: "", said: "", at: 0 });
    return s;
  },

  onMembers: (s, ctx) => {
    const gone = (u: string) => u !== "" && !u.startsWith("~") && !inChat(ctx, u);
    if (!s.bricks.some((b) => gone(b.who))) return s;
    return { ...s, bricks: s.bricks.map((b) => (gone(b.who) ? { ...b, who: "", name: "", done: false, said: "", at: 0 } : b)) };
  },

  invariants: {
    "only claimed bricks can be set": (s) => s.bricks.every((b) => b.who !== "" || (!b.done && b.name === "" && b.at === 0)),
    "live builders are in the chat": (s, ctx) => s.bricks.every((b) => b.who === "" || b.who.startsWith("~") || inChat(ctx, b.who)),
    "the wall keeps its bricks": (s) => s.bricks.length >= 1 && s.bricks.length <= 14 && s.bricks.every((b) => b.size >= 1 && b.size <= 3 && b.label !== ""),
  },

  transitions: {
    "claiming takes air only": (p, n, a, m) => a.t !== "claim" || p === n || (p.bricks[a.i]!.who === "" && n.bricks[a.i]!.who === m.user && !n.bricks[a.i]!.done && n.bricks[a.i]!.at === m.time),
    "only the builder sets a brick": (p, n, a, m) => a.t !== "set" || p === n || (p.bricks[a.i]!.who === m.user && n.bricks[a.i]!.who === m.user && n.bricks[a.i]!.done !== p.bricks[a.i]!.done),
    "letting go turns it back to air": (p, n, a, m) => a.t !== "drop" || p === n || (p.bricks[a.i]!.who === m.user && !p.bricks[a.i]!.done && n.bricks[a.i]!.who === ""),
    "one brick changes at a time": (p, n, a) => p === n || n.bricks.every((b, k) => k === a.i || JSON.stringify(b) === JSON.stringify(p.bricks[k])),
    "bricks keep their place and size": (p, n) => n.bricks.length === p.bricks.length && n.bricks.every((b, k) => b.label === p.bricks[k]!.label && b.size === p.bricks[k]!.size),
    "only people in the chat lay bricks": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, u, r) => {
    const air = s.bricks.map((b, i) => (b.who ? -1 : i)).filter((i) => i >= 0);
    const mine = s.bricks.map((b, i) => (b.who === u ? i : -1)).filter((i) => i >= 0);
    const k = r.next();
    if (air.length && (k < 0.5 || !mine.length)) return { t: "claim", i: r.pick(air) };
    if (mine.length && k < 0.85) return { t: "set", i: r.pick(mine) };
    if (mine.length) return { t: "drop", i: r.pick(mine) };
    return { t: "claim", i: r.int(s.bricks.length) };
  },

  local: { toast: 0, msg: "" },

  view: ({ state: s, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const { cells, rows } = layout(s.bricks);
    const H = rows * ROWH + 46;
    const uw = (W - 52) / UNITS;
    const ground = H - 10;
    const air = s.bricks.filter((b) => !b.who);
    const set = s.bricks.filter((b) => b.done).length;
    const myOpen = s.bricks.findIndex((b) => b.who === me && !b.done);
    const nextAir = s.bricks.findIndex((b) => !b.who);
    const builders = [...new Map(s.bricks.filter((b) => b.who).map((b) => [b.who, { id: b.who, name: b.name }])).values()];
    const latest = [...s.bricks].filter((b) => b.who).sort((a, b) => b.at - a.at)[0];
    const quote = s.bricks.find((b) => b.said);

    const tap = (i: number) => {
      const b = s.bricks[i]!;
      if (!b.who) {
        haptic("light");
        dispatch({ t: "claim", i });
      } else if (b.who === me) {
        haptic(b.done ? "light" : "success");
        if (!b.done) setLocal({ toast: local.toast + 1, msg: `${b.label} is set` });
        dispatch({ t: "set", i });
      }
    };

    const over = cells.map((cell) => {
      const b = s.bricks[cell.i]!;
      const x = 12 + cell.u0 * uw + 1.5;
      const w = (cell.u1 - cell.u0) * uw - 3;
      const y = ground - (cell.row + 1) * ROWH + 1.5;
      const mine = b.who === me;
      const lab = !b.who ? `Claim ${b.label}` : mine ? (b.done ? `${b.label}, set. Tap to reopen` : `Mark ${b.label} set`) : `${b.label}, ${b.name}${b.done ? ", set" : ", in progress"}`;
      return (
        <button
          key={`b${cell.i}`}
          type="button"
          aria-label={lab}
          {...(!b.who || mine ? { onClick: () => tap(cell.i) } : {})}
          style={{ position: "absolute", left: x + w / 2 - Math.max(w, 44) / 2, top: y - 1.5, width: Math.max(w, 44), height: ROWH, display: "flex", alignItems: w < 90 ? "flex-start" : "center", justifyContent: w < 90 ? "center" : "flex-start", paddingLeft: w < 90 ? 0 : 6, paddingTop: w < 90 ? 4 : 0, cursor: !b.who || mine ? "pointer" : "default" }}
        >
          {b.who ? (
            <span style={{ display: "flex", borderRadius: 99, boxShadow: mine ? `0 0 0 2px ${c.primary}` : "none" }}>
              <Avatar user={{ id: b.who, name: b.name }} size={w < 90 ? 16 : 20} />
            </span>
          ) : null}
        </button>
      );
    });

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.sub} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={`Brick wall: ${s.bricks.map((b) => `${b.label} ${b.done ? `set by ${b.name}` : b.who ? `claimed by ${b.name}` : "still air"}`).join(", ")}`} draw={(g, f) => drawWall(g, f, s, me, H)} />
          {over}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36, marginTop: 4, minWidth: 0 }}>
          {latest && latest.at > 0 ? (
            <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>{`${latest.who === me ? "You" : first(latest.name)} ${latest.done ? "set" : "claimed"} ${latest.label.toLowerCase()}`}</span>
          ) : quote ? (
            <>
              <Avatar user={{ id: quote.who, name: quote.name }} size={20} />
              <b style={{ fontSize: 13, lineHeight: "16px", color: c.text, flexShrink: 0 }}>{first(quote.name)}</b>
              <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, minWidth: 0, ...ell }}>{`“${quote.said}”`}</span>
            </>
          ) : (
            <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>Nothing's built yet. Tap a brick to take that part.</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 28, minWidth: 0 }}>
          {builders.length ? <Facepile users={builders} max={5} size={20} /> : null}
          <span style={{ fontSize: 13, lineHeight: "16px", color: air.length ? c.text : c.secondaryText, fontWeight: air.length ? 600 : 400, minWidth: 0, ...ell }}>
            {set === s.bricks.length ? `All ${s.bricks.length} bricks set` : `${set} of ${s.bricks.length} set · ${air.length ? `${air.length} still air` : "all claimed"}`}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {myOpen >= 0 ? (
            <Button kind="primary" wide onClick={() => tap(myOpen)}>
              {`Set ${s.bricks[myOpen]!.label.toLowerCase()}`}
            </Button>
          ) : (
            <Button kind="primary" wide disabled={nextAir < 0} onClick={() => nextAir >= 0 && tap(nextAir)}>
              {nextAir >= 0 ? `Claim ${s.bricks[nextAir]!.label.toLowerCase()}` : "Wall's claimed"}
            </Button>
          )}
          {myOpen >= 0 ? (
            <Button kind="secondary" onClick={() => dispatch({ t: "drop", i: myOpen })}>
              Let go
            </Button>
          ) : null}
        </div>
        {local.toast > 0 ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
