import {
  defineApp,
  Button,
  Burst,
  Canvas,
  CardHeader,
  Facepile,
  Locked,
  Toast,
  fitText,
  haptic,
  mix,
  rng,
  running,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// 41 messages of "idk where do u wanna eat": a claw machine full of plush food, each plush as big
// as the number of friends who pushed for it. Steer the claw, drop it, it wobbles, maybe slips,
// and whatever it carries to the chute is dinner. Calvin glued the Rook's slice to the floor.

type Kind = "dumpling" | "taco" | "ramen" | "slice" | "onigiri" | "cup";
type Params = {
  /** Card title: "Claw pick" */
  title: string;
  /** Under the title: "41 messages of “idk where do u wanna eat”" */
  sub: string;
  /** Dinner time on the result: "7:30" */
  when: string;
  /** Everyone in on dinner, by name. */
  crew: string[];
  /** 2 to 6 plushes. voters: names who pushed for it. glued: someone vetoed it ("not rook's again"), the claw can't lift it. */
  prizes: { label: string; kind: Kind; voters: string[]; glued: string }[];
  /** A drop that already happened: who dropped and which plush slipped (empty for none). */
  tried: { name: string; slipped: string };
};

// @params
const P: Params = {
  title: "Claw pick",
  sub: "41 messages of “idk where do u wanna eat”",
  when: "7:30",
  crew: ["Aditya", "Calvin", "Arun", "Tsai Lin", "Will", "Maya"],
  prizes: [
    { label: "Golden Lantern", kind: "dumpling", voters: ["Tsai Lin", "Aditya", "Calvin"], glued: "" },
    { label: "Tío's", kind: "taco", voters: ["Will", "Arun"], glued: "" },
    { label: "Rook's", kind: "slice", voters: ["Arun"], glued: "Calvin: not rook's again" },
    { label: "Ramen Ya", kind: "ramen", voters: ["Will"], glued: "" },
    { label: "Arun's cooker", kind: "onigiri", voters: [], glued: "" },
  ],
  tried: { name: "Will", slipped: "Tío's" },
};
// @end params

type Prize = { id: string; label: string; kind: Kind; voters: string[]; glued: string };
type Drop = { x: number; from: number; target: string; ok: boolean; at: number; by: string };
type State = {
  title: string;
  sub: string;
  when: string;
  crew: string[];
  names: Record<string, string>;
  prizes: Prize[];
  clawX: number;
  drop: Drop | null;
  drops: number;
  slips: { by: string; target: string }[];
  won: string | null;
  going: string[];
};
type Action = { t: "drop"; x: number } | { t: "push"; p: string } | { t: "in" };
type Local = { x: number; moved: number; pick: string; burst: number };

const KINDS: Kind[] = ["dumpling", "taco", "ramen", "slice", "onigiri", "cup"];
const MOVE = 500, DOWN = 1200, GRIP = 1500, UP = 2400, CARRY = 3000, END = 3400;
const TAU = Math.PI * 2;
const CANVAS_H = 248;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const seeded = (who: string) => who.startsWith("~");
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const slotX = (s: State, i: number) => 0.1 + (0.78 * (i + 0.5)) / s.prizes.length;
const sizeOf = (p: Prize) => Math.min(30, 15 + 4.5 * p.voters.length);
const chance = (p: Prize) => (p.glued ? 0 : Math.min(0.85, 0.3 + 0.15 * p.voters.length));
const nearest = (s: State, x: number) => {
  let best = 0;
  s.prizes.forEach((_, i) => {
    if (Math.abs(slotX(s, i) - x) < Math.abs(slotX(s, best) - x)) best = i;
  });
  return s.prizes[best]!;
};
const nameOf = (s: State, who: string) => s.names[who] ?? (seeded(who) ? who.slice(1) : "Someone");
const memberOf = (s: State, who: string): Member => ({ id: who, name: nameOf(s, who) });
const firstName = (n: string) => n.split(" ")[0] ?? n;
const listNames = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

function initState(ctx: Ctx): State {
  const names: Record<string, string> = {};
  const bind = (raw: string) => {
    const name = clean(raw, 28);
    if (!name) return "";
    const m = ctx.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
    const who = m ? m.id : `~${name}`;
    names[who] = m ? m.name : name;
    return who;
  };
  const crew: string[] = [];
  for (const n of P.crew.slice(0, 12)) {
    const w = bind(n);
    if (w && !crew.includes(w)) crew.push(w);
  }
  for (const m of ctx.members) {
    if (crew.length >= 16 || crew.includes(m.id)) continue;
    names[m.id] = m.name;
    crew.push(m.id);
  }
  const prizes: Prize[] = [];
  const voted = new Set<string>();
  for (const raw of P.prizes) {
    if (prizes.length >= 6) break;
    const label = clean(raw.label, 40);
    if (!label) continue;
    const voters: string[] = [];
    for (const v of raw.voters ?? []) {
      const w = bind(v);
      if (w && !voted.has(w)) (voted.add(w), voters.push(w));
    }
    prizes.push({ id: `p${prizes.length}`, label, kind: KINDS.includes(raw.kind) ? raw.kind : "dumpling", voters, glued: clean(raw.glued, 40) });
  }
  if (prizes.length < 2) {
    prizes.length = 0;
    prizes.push({ id: "p0", label: "Dumplings", kind: "dumpling", voters: [], glued: "" }, { id: "p1", label: "Tacos", kind: "taco", voters: [], glued: "" });
  }
  if (prizes.every((p) => p.glued)) prizes[0] = { ...prizes[0]!, glued: "" };
  const slips: State["slips"] = [];
  const by = bind(P.tried?.name ?? "");
  const sl = prizes.find((p) => p.label.toLowerCase() === clean(P.tried?.slipped, 40).toLowerCase());
  if (by && sl) slips.push({ by, target: sl.id });
  return { title: clean(P.title, 40) || "Claw pick", sub: clean(P.sub, 60), when: clean(P.when, 10), crew, names, prizes, clawX: 0.5, drop: null, drops: slips.length, slips, won: null, going: [] };
}

// Plush drawings: each at (x, y) with radius r, sitting on y.
function plush(g: CanvasRenderingContext2D, t: Theme, k: Kind, x: number, y: number, r: number, tilt: number) {
  const c = t.color;
  const dk = t.mode === "dark";
  const ink = dk ? c.wash : c.text;
  const paper = dk ? c.text : c.card;
  g.save();
  g.translate(x, y);
  g.rotate(tilt);
  const face = (fy: number, s = 1) => {
    g.beginPath();
    g.arc(-r * 0.22 * s, fy, Math.max(1.4, r * 0.07), 0, TAU);
    g.arc(r * 0.22 * s, fy, Math.max(1.4, r * 0.07), 0, TAU);
    g.fillStyle = ink;
    g.fill();
    g.beginPath();
    g.arc(0, fy + r * 0.06, r * 0.12, 0.15 * Math.PI, 0.85 * Math.PI);
    g.lineWidth = 1.4;
    g.strokeStyle = ink;
    g.stroke();
    g.beginPath();
    g.ellipse(-r * 0.4 * s, fy + r * 0.12, r * 0.09, r * 0.06, 0, 0, TAU);
    g.ellipse(r * 0.4 * s, fy + r * 0.12, r * 0.09, r * 0.06, 0, 0, TAU);
    g.fillStyle = mix(c.series4, paper, 0.35);
    g.fill();
  };
  if (k === "dumpling") {
    g.beginPath();
    g.moveTo(-r * 1.15, 0);
    g.quadraticCurveTo(-r * 1.1, -r * 1.35, 0, -r * 1.3);
    g.quadraticCurveTo(r * 1.1, -r * 1.35, r * 1.15, 0);
    g.closePath();
    g.fillStyle = mix(c.series2, paper, 0.75);
    g.fill();
    g.beginPath();
    for (let i = -2; i <= 2; i++) {
      g.moveTo(i * r * 0.28, -r * 1.3);
      g.quadraticCurveTo(i * r * 0.32, -r * 1.05, i * r * 0.22, -r * 0.95);
    }
    g.lineWidth = 1.5;
    g.strokeStyle = mix(c.series5, paper, 0.35);
    g.stroke();
    face(-r * 0.5);
  } else if (k === "taco") {
    g.beginPath();
    g.arc(0, 0, r * 1.1, Math.PI, 0);
    g.closePath();
    g.fillStyle = mix(c.series2, c.series5, 0.25);
    g.fill();
    g.beginPath();
    for (let i = 0; i < 6; i++) g.arc(-r * 0.85 + i * r * 0.34, -r * 0.95, r * 0.2, 0, TAU);
    g.fillStyle = c.series3;
    g.fill();
    g.beginPath();
    g.arc(-r * 0.3, -r * 1.02, r * 0.12, 0, TAU);
    g.arc(r * 0.35, -r * 1.0, r * 0.12, 0, TAU);
    g.fillStyle = c.series4;
    g.fill();
    g.beginPath();
    g.arc(0, 0, r * 0.82, Math.PI, 0);
    g.closePath();
    g.fillStyle = mix(c.series2, paper, 0.25);
    g.fill();
    face(-r * 0.42);
  } else if (k === "slice") {
    g.beginPath();
    g.moveTo(-r * 1.05, -r * 1.25);
    g.quadraticCurveTo(0, -r * 1.55, r * 1.05, -r * 1.25);
    g.lineTo(0, 0);
    g.closePath();
    g.fillStyle = mix(c.series2, paper, 0.15);
    g.fill();
    g.beginPath();
    g.moveTo(-r * 1.05, -r * 1.25);
    g.quadraticCurveTo(0, -r * 1.55, r * 1.05, -r * 1.25);
    g.lineWidth = r * 0.28;
    g.lineCap = "round";
    g.strokeStyle = mix(c.series5, c.series2, 0.4);
    g.stroke();
    g.beginPath();
    g.arc(-r * 0.45, -r * 1.0, r * 0.14, 0, TAU);
    g.arc(r * 0.5, -r * 1.02, r * 0.14, 0, TAU);
    g.arc(0, -r * 0.45, r * 0.12, 0, TAU);
    g.fillStyle = c.series4;
    g.fill();
    face(-r * 0.78, 0.8);
  } else if (k === "ramen") {
    g.beginPath();
    g.ellipse(0, -r * 0.9, r * 1.15, r * 0.3, 0, 0, TAU);
    g.fillStyle = mix(c.series2, c.series5, 0.5);
    g.fill();
    g.beginPath();
    for (let i = -3; i <= 3; i++) {
      g.moveTo(i * r * 0.28, -r * 0.95);
      g.quadraticCurveTo(i * r * 0.28 + 3, -r * 1.05, i * r * 0.28 + 1, -r * 0.82);
    }
    g.lineWidth = 1.4;
    g.strokeStyle = mix(c.series2, paper, 0.5);
    g.stroke();
    g.beginPath();
    g.ellipse(r * 0.5, -r * 0.98, r * 0.24, r * 0.13, 0, 0, TAU);
    g.fillStyle = paper;
    g.fill();
    g.beginPath();
    g.arc(r * 0.5, -r * 0.98, r * 0.09, 0, TAU);
    g.fillStyle = c.series2;
    g.fill();
    g.beginPath();
    g.moveTo(-r * 1.15, -r * 0.9);
    g.quadraticCurveTo(-r * 1.1, 0, 0, 0);
    g.quadraticCurveTo(r * 1.1, 0, r * 1.15, -r * 0.9);
    g.closePath();
    g.fillStyle = c.series4;
    g.fill();
    g.beginPath();
    g.moveTo(-r * 0.2, -r * 1.7);
    g.lineTo(r * 0.4, -r * 0.95);
    g.moveTo(r * 0.05, -r * 1.75);
    g.lineTo(r * 0.6, -r * 0.95);
    g.lineWidth = 2;
    g.strokeStyle = mix(c.series5, ink, 0.3);
    g.stroke();
    face(-r * 0.45);
  } else if (k === "onigiri") {
    g.beginPath();
    g.moveTo(0, -r * 1.45);
    g.quadraticCurveTo(r * 0.35, -r * 1.45, r * 1.05, -r * 0.2);
    g.quadraticCurveTo(r * 1.1, 0, r * 0.8, 0);
    g.lineTo(-r * 0.8, 0);
    g.quadraticCurveTo(-r * 1.1, 0, -r * 1.05, -r * 0.2);
    g.quadraticCurveTo(-r * 0.35, -r * 1.45, 0, -r * 1.45);
    g.fillStyle = mix(paper, c.secondaryText, dk ? 0.05 : 0.08);
    if (dk) g.fillStyle = mix(c.text, paper, 0.1);
    g.fill();
    g.beginPath();
    g.rect(-r * 0.45, -r * 0.45, r * 0.9, r * 0.45);
    g.fillStyle = mix(c.series3, ink, 0.6);
    g.fill();
    face(-r * 0.78);
  } else {
    g.beginPath();
    g.moveTo(-r * 0.8, -r * 1.4);
    g.lineTo(r * 0.8, -r * 1.4);
    g.lineTo(r * 0.6, 0);
    g.lineTo(-r * 0.6, 0);
    g.closePath();
    g.fillStyle = mix(c.series5, paper, 0.3);
    g.fill();
    g.beginPath();
    g.rect(-r * 0.75, -r * 1.0, r * 1.5, r * 0.4);
    g.fillStyle = mix(c.series5, ink, 0.3);
    g.fill();
    face(-r * 0.4);
  }
  g.restore();
}

function drawMachine(g: CanvasRenderingContext2D, f: DrawFrame, s: State, localX: number, waiting: boolean, pick: string) {
  const t = f.theme;
  const c = t.color;
  const dk = t.mode === "dark";
  const W = f.width;
  const floor = CANVAS_H - 70;
  const rail = 16;
  const d = s.drop;
  const e = d ? f.now - d.at : END + 1;
  const live = waiting || e < END;

  // Cabinet and glass.
  g.beginPath();
  g.roundRect(0, 0, W, CANVAS_H, 16);
  g.fillStyle = mix(c.series6, c.card, dk ? 0.55 : 0.82);
  g.fill();
  g.beginPath();
  g.roundRect(8, 8, W - 16, floor + 14 - 8, 10);
  g.fillStyle = mix(c.series1, c.card, dk ? 0.82 : 0.9);
  g.fill();
  // Glass shine.
  g.beginPath();
  g.moveTo(W * 0.62, 12);
  g.lineTo(W * 0.7, 12);
  g.lineTo(W * 0.52, floor);
  g.lineTo(W * 0.44, floor);
  g.closePath();
  g.fillStyle = mix(c.series1, c.card, dk ? 0.72 : 0.96);
  g.fill();
  // Prize chute on the right.
  const chuteX = W - 30;
  g.beginPath();
  g.roundRect(chuteX - 20, floor - 26, 40, 40, [6, 6, 0, 0]);
  g.fillStyle = mix(c.series6, dk ? c.wash : c.text, 0.55);
  g.fill();
  g.beginPath();
  g.rect(chuteX - 22, floor - 28, 44, 4);
  g.fillStyle = c.series2;
  g.fill();
  // Rail.
  g.beginPath();
  g.rect(12, rail - 3, W - 24, 6);
  g.fillStyle = mix(c.secondaryText, c.card, 0.3);
  g.fill();

  // Where the claw is and what it holds.
  const target = d ? s.prizes.find((p) => p.id === d.target) : undefined;
  const ti = target ? s.prizes.indexOf(target) : -1;
  const toPx = (fx: number) => 12 + fx * (W - 24);
  let cx = toPx(waiting ? localX : d && e < END ? d.x : localX);
  let depth = 0;
  let closed = 0;
  let carry = false;
  let slipY = -1;
  let wobble = 0;
  if (waiting) {
    depth = 0.1 + 0.05 * Math.sin(f.now / 120);
  } else if (d && e < END) {
    const tx = toPx(slotX(s, ti));
    if (e < MOVE) cx = toPx(d.from) + (tx - toPx(d.from)) * (e / MOVE);
    else cx = tx;
    const fall = floor - 30 - (target ? sizeOf(target) * 1.3 : 20) - rail;
    if (e >= MOVE && e < DOWN) depth = ((e - MOVE) / (DOWN - MOVE)) * fall;
    else if (e >= DOWN && e < GRIP) ((depth = fall), (closed = (e - DOWN) / (GRIP - DOWN)));
    else if (e >= GRIP && e < UP) {
      depth = fall * (1 - (e - GRIP) / (UP - GRIP));
      closed = d.ok ? 1 : Math.max(0.2, 1 - (e - GRIP) / 500);
      wobble = Math.sin((e - GRIP) / 45) * 0.12 * (1 - (e - GRIP) / (UP - GRIP));
      carry = d.ok || e < GRIP + 380;
      if (!d.ok && e >= GRIP + 380) slipY = Math.min(1, (e - GRIP - 380) / 320);
    } else if (e >= UP && e < CARRY) {
      depth = 0;
      closed = d.ok ? 1 : 0.2;
      carry = d.ok;
      if (d.ok) cx = tx + (chuteX - tx) * ((e - UP) / (CARRY - UP));
    } else if (e >= CARRY) {
      closed = d.ok ? Math.max(0, 1 - (e - CARRY) / 200) : 0;
      if (d.ok) cx = chuteX;
    }
  }

  // Plushes on the floor.
  s.prizes.forEach((p, i) => {
    const px = toPx(slotX(s, i));
    const r = sizeOf(p);
    const picked = target && p.id === target.id;
    const goneOk = s.won === p.id && (!d || e >= GRIP || d.target !== p.id);
    if (picked && carry) return;
    if (goneOk && !(d && e < GRIP)) {
      // Won: it sits in the chute window.
      if (!d || e >= END) plush(g, t, p.kind, chuteX, floor + 10, 11, 0);
      return;
    }
    let py = floor;
    let tilt = 0;
    if (picked && slipY >= 0 && slipY < 1) {
      py = floor - (1 - slipY) * 60;
      tilt = slipY * 0.6;
    } else if (picked && d && !d.ok && e >= GRIP + 700 && e < GRIP + 1300) {
      tilt = Math.sin((e - GRIP - 700) / 50) * 0.15 * (1 - (e - GRIP - 700) / 600);
    }
    if (p.glued) {
      g.beginPath();
      g.ellipse(px, floor + 2, r * 1.1, 5, 0, 0, TAU);
      g.fillStyle = mix(c.card, c.series1, 0.15);
      g.fill();
      g.beginPath();
      g.arc(px - r * 0.8, floor + 5, 2.5, 0, TAU);
      g.arc(px + r * 0.9, floor + 4, 2, 0, TAU);
      g.fillStyle = mix(c.card, c.series1, 0.25);
      g.fill();
    }
    plush(g, t, p.kind, px, py, r, tilt);
    if (p.glued) {
      // A little "glued" tag.
      g.beginPath();
      g.roundRect(px - 18, floor - r * 1.6 - 18, 36, 14, 4);
      g.fillStyle = c.negative;
      g.fill();
      g.font = `700 10px ${t.type.family}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = dk ? c.wash : c.onPrimary;
      g.fillText("glued", px, floor - r * 1.6 - 11);
    }
  });

  // Floor ledge with names and faces.
  g.beginPath();
  g.rect(8, floor + 14, W - 16, CANVAS_H - floor - 22);
  g.fillStyle = mix(c.series6, dk ? c.wash : c.text, dk ? 0.35 : 0.2);
  g.fill();
  const slotW = ((W - 24) * 0.78) / s.prizes.length;
  s.prizes.forEach((p, i) => {
    const px = toPx(slotX(s, i));
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = p.id === pick ? c.series2 : dk ? c.text : c.card;
    // Wrap to up to three lines at 11 px, then 10, then 9; cut only if it still does not fit.
    const maxW = slotW - 4;
    let lines: string[] = [];
    let used = 11;
    for (const sz of [11, 10, 9]) {
      used = sz;
      g.font = fitText("a", 100, { g, size: sz, min: sz, weight: 600 }).font;
      lines = [];
      let cur = "";
      for (const w of p.label.split(" ")) {
        const t = cur ? `${cur} ${w}` : w;
        if (!cur || g.measureText(t).width <= maxW) cur = t;
        else {
          lines.push(cur);
          cur = w;
        }
      }
      lines.push(cur);
      if (lines.length <= (sz === 9 ? 4 : 3) && lines.every((l) => g.measureText(l).width <= maxW)) break;
    }
    lines = lines.slice(0, 4);
    lines = lines.map((l) => fitText(l, maxW, { g, size: used, min: used, weight: 600 }).text);
    g.font = fitText("a", 100, { g, size: used, min: used, weight: 600 }).font;
    const lh = lines.length > 3 ? 10 : 11;
    lines.forEach((l, k) => g.fillText(l, px, floor + (lines.length > 3 ? 36 : 33) + (k - (lines.length - 1) / 2) * lh));
    // Faces of who pushed for it.
    const n = Math.min(4, p.voters.length);
    for (let k = 0; k < n; k++) {
      const fx = px + (k - (n - 1) / 2) * 11;
      g.beginPath();
      g.arc(fx, floor + 58, 5.5, 0, TAU);
      g.fillStyle = userColor(memberOf(s, p.voters[k]!), t);
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = mix(c.series6, dk ? c.wash : c.text, dk ? 0.35 : 0.2);
      g.stroke();
    }
  });

  // The claw.
  const cy = rail + depth;
  g.beginPath();
  g.roundRect(cx - 14, rail - 7, 28, 12, 4);
  g.fillStyle = mix(c.secondaryText, dk ? c.wash : c.text, 0.4);
  g.fill();
  g.beginPath();
  g.moveTo(cx, rail);
  g.lineTo(cx, cy + 10);
  g.lineWidth = 2;
  g.strokeStyle = mix(c.secondaryText, dk ? c.wash : c.text, 0.3);
  g.stroke();
  g.save();
  g.translate(cx, cy + 10);
  g.rotate(wobble);
  if (carry && target) plush(g, t, target.kind, 0, 18 + sizeOf(target) * 1.3, sizeOf(target), 0);
  g.beginPath();
  g.roundRect(-9, 0, 18, 9, 3);
  g.fillStyle = c.series2;
  g.fill();
  const open = 1 - closed;
  g.lineWidth = 3.5;
  g.lineCap = "round";
  g.strokeStyle = mix(c.secondaryText, dk ? c.wash : c.text, 0.25);
  if (dk) g.strokeStyle = c.secondaryText;
  g.beginPath();
  for (const side of [-1, 1]) {
    g.moveTo(side * 7, 8);
    g.quadraticCurveTo(side * (12 + 12 * open), 20, side * (4 + 10 * open), 32);
  }
  g.moveTo(0, 9);
  g.lineTo(0, 30);
  g.stroke();
  g.restore();

  return live;
}

export default defineApp<State, Action, Local>({
  name: "Claw pick",
  summary: (s) => {
    const won = s.prizes.find((p) => p.id === s.won);
    if (won) return `${won.label}${s.when ? ` · ${s.when}` : ""} · ${s.going.length} of ${s.crew.length} in`;
    return `${s.title}: ${s.drops} ${s.drops === 1 ? "drop" : "drops"}, nothing grabbed yet`;
  },

  init: (ctx) => initState(ctx),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "drop") {
      if (s.won || typeof a.x !== "number" || !Number.isFinite(a.x) || a.x < 0 || a.x > 1) return s;
      const p = nearest(s, a.x);
      const ok = rng(m.seed).next() < chance(p);
      const drop: Drop = { x: a.x, from: s.clawX, target: p.id, ok, at: m.time, by: m.user };
      return {
        ...s,
        clawX: slotX(s, s.prizes.indexOf(p)),
        drop,
        drops: s.drops + 1,
        slips: ok ? s.slips : [...s.slips.slice(-5), { by: m.user, target: p.id }],
        won: ok ? p.id : null,
        going: ok ? [m.user] : [],
      };
    }
    if (a.t === "push") {
      if (s.won || typeof a.p !== "string" || !s.prizes.some((p) => p.id === a.p)) return s;
      const had = s.prizes.some((p) => p.id === a.p && p.voters.includes(m.user));
      return { ...s, prizes: s.prizes.map((p) => ({ ...p, voters: p.voters.filter((v) => v !== m.user).concat(p.id === a.p && !had ? [m.user] : []) })) };
    }
    if (a.t === "in") {
      if (!s.won) return s;
      return { ...s, going: s.going.includes(m.user) ? s.going.filter((u) => u !== m.user) : [...s.going, m.user] };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const keep = (u: string) => seeded(u) || inChat(ctx, u);
    const names = { ...s.names };
    const crew = s.crew.filter(keep);
    for (const m of ctx.members) {
      if (crew.length >= 16 || crew.includes(m.id)) continue;
      names[m.id] = m.name;
      crew.push(m.id);
    }
    return { ...s, names, crew, prizes: s.prizes.map((p) => ({ ...p, voters: p.voters.filter(keep) })), going: s.going.filter((u) => inChat(ctx, u)) };
  },

  invariants: {
    "everyone in the chat is in the crew": (s, ctx) => s.crew.length >= 16 || ctx.members.every((m) => s.crew.includes(m.id)),
    "the drop was aimed inside the machine": (s) => s.drop === null || (typeof s.drop.x === "number" && s.drop.x >= 0 && s.drop.x <= 1),
    "everyone pushes for one plush at most": (s) => {
      const all = s.prizes.flatMap((p) => p.voters);
      return new Set(all).size === all.length;
    },
    "voters are seeded friends or in the chat": (s, ctx) => s.prizes.every((p) => p.voters.every((v) => seeded(v) || inChat(ctx, v))),
    "a glued plush is never won": (s) => s.won === null || s.prizes.some((p) => p.id === s.won && !p.glued),
    "the last drop decides the win": (s) => (s.won === null ? s.drop === null || !s.drop.ok : s.drop !== null && s.drop.ok && s.drop.target === s.won),
    "going only after a win, once each": (s, ctx) => (s.won !== null || s.going.length === 0) && new Set(s.going).size === s.going.length && s.going.every((u) => inChat(ctx, u)),
    "the claw rests over a plush": (s) => s.clawX === 0.5 || s.prizes.some((_, i) => slotX(s, i) === s.clawX),
    "drops count up": (s) => Number.isInteger(s.drops) && s.drops >= s.slips.length - 1 && (s.drop === null || s.drops > 0),
  },

  transitions: {
    "a slip is logged, a grab is not": (p, n, a, m) =>
      a.t !== "drop" || p === n || !n.drop || (n.drop.ok ? JSON.stringify(n.slips) === JSON.stringify(p.slips) : n.slips.length === Math.min(6, p.slips.length + 1) && n.slips[n.slips.length - 1]!.by === m.user && n.slips[n.slips.length - 1]!.target === n.drop.target),
    "the claw rests over what it went for": (p, n, a) => a.t !== "drop" || p === n || !n.drop || n.clawX === slotX(p, p.prizes.findIndex((x) => x.id === n.drop!.target)),
    "a grab puts the dropper in": (p, n, a, m) => a.t !== "drop" || p === n || !n.drop || (n.drop.ok ? n.going.join() === m.user : n.going.length === 0),
    "no pushes after a win": (p, n) => p.won === null || JSON.stringify(p.prizes) === JSON.stringify(n.prizes),
    "a push toggles the sender on that plush": (p, n, a, m) => {
      if (a.t !== "push" || p === n) return true;
      const on = (s: State) => s.prizes.some((x) => x.id === a.p && x.voters.includes(m.user));
      return on(n) !== on(p);
    },
    "unknown actions change nothing": (p, n, a) => a.t === "drop" || a.t === "push" || a.t === "in" || JSON.stringify(p) === JSON.stringify(n),
    "a drop takes the plush under the claw and the seed decides": (p, n, a, m) => {
      if (a.t !== "drop" || p === n) return true;
      const t = nearest(p, a.x);
      return !!n.drop && n.drop.target === t.id && n.drop.ok === rng(m.seed).next() < chance(t) && n.drop.at === m.time && n.drop.by === m.user && n.drop.from === p.clawX && n.drops === p.drops + 1;
    },
    "nothing drops after a win": (p, n) => p.won === null || (n.won === p.won && n.drops === p.drops),
    "a push moves only the sender's vote": (p, n, a, m) => {
      if (a.t !== "push" || p === n) return true;
      const before = p.prizes.map((x) => x.voters.filter((v) => v !== m.user).join());
      const after = n.prizes.map((x) => x.voters.filter((v) => v !== m.user).join());
      return before.join("|") === after.join("|") && n.prizes.filter((x) => x.voters.includes(m.user)).length <= 1;
    },
    "only a push changes votes": (p, n, a) => a.t === "push" || JSON.stringify(p.prizes) === JSON.stringify(n.prizes),
    "going toggles only the sender": (p, n, a, m) => {
      if (a.t !== "in" || p === n) return true;
      const diff = [...p.going.filter((u) => !n.going.includes(u)), ...n.going.filter((u) => !p.going.includes(u))];
      return diff.length === 1 && diff[0] === m.user;
    },
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, _u, r) => {
    if (s.won) return { t: "in" };
    if (r.next() < 0.35) return { t: "push", p: r.pick(s.prizes).id };
    return { t: "drop", x: Math.round(r.next() * 100) / 100 };
  },

  local: { x: -1, moved: 0, pick: "", burst: 0 },

  view: ({ state, confirmed, pending, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const s = confirmed;
    const waiting = pending && state.drops !== confirmed.drops;
    const d = s.drop;
    const e = d ? running(d.at, END) : null;
    const busy = waiting || e !== null;
    const won = s.prizes.find((p) => p.id === s.won);
    const W = theme.width - 2 * theme.space.card;
    const x = local.x >= 0 ? local.x : s.clawX;
    const under = nearest(s, x);
    const pickP = s.prizes.find((p) => p.id === local.pick);
    const mineP = s.prizes.find((p) => p.voters.includes(me));
    const lastSlip = s.slips[s.slips.length - 1];
    const slipP = lastSlip ? s.prizes.find((p) => p.id === lastSlip.target) : undefined;
    const label = `Claw machine: ${s.prizes.map((p) => `${p.label} ${p.voters.length} ${p.voters.length === 1 ? "push" : "pushes"}${p.glued ? ", glued down" : ""}`).join(", ")}`;

    const onPointer = (ev: { type: string; x: number; y: number }) => {
      if (busy || won) return;
      const fx = Math.max(0, Math.min(1, (ev.x - 12) / Math.max(1, W - 24)));
      if (ev.type === "down" || ev.type === "move") setLocal({ x: fx, moved: local.moved + 1 });
      if (ev.type === "up") {
        const p = nearest(s, fx);
        if (ev.y > CANVAS_H - 50) setLocal({ x: fx, pick: p.id });
        else setLocal({ x: fx });
      }
    };

    let line: string;
    if (waiting) line = "Dropping…";
    else if (e !== null && d) {
      const tgt = s.prizes.find((p) => p.id === d.target);
      line = e < GRIP ? `Going for ${tgt?.label ?? "it"}…` : e < UP ? (d.ok ? "Got it… holding… holding…" : tgt?.glued ? "It's glued. Calvin wasn't kidding." : "Wobbling…") : d.ok ? "Into the chute" : "Slipped. Again?";
    } else if (pickP) {
      const names = pickP.voters.map((v) => firstName(nameOf(s, v)));
      line = pickP.glued ? `${pickP.glued}` : names.length ? `${listNames(names)} pushed for ${pickP.label}` : `Nobody's pushed for ${pickP.label} yet`;
    } else if (won && d) line = `${firstName(nameOf(s, d.by))} got it on drop ${s.drops}`;
    else if (lastSlip && slipP) line = `${firstName(nameOf(s, lastSlip.by))} dropped · slipped off ${slipP.label}`;
    else line = "Drag to steer the claw, then drop";

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.sub} />
        <Canvas height={CANVAS_H} label={label} drag draw={(g, f) => drawMachine(g, f, s, x, waiting, local.pick)} onPointer={onPointer} />
        <div style={{ height: 34, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 15, lineHeight: "20px", color: busy ? c.text : c.secondaryText, minWidth: 0, ...ell }}>{line}</span>
        </div>
        {won && e === null ? (
          <div style={{ position: "relative" }}>
            {local.burst > 0 ? (
              <div style={{ position: "absolute", left: "50%", top: 0, pointerEvents: "none" }}>
                <Burst key={local.burst} emoji="🥟" />
              </div>
            ) : null}
            <Locked detail={`Claw picked it · ${s.drops} ${s.drops === 1 ? "drop" : "drops"}`}>{`${won.label}${s.when ? ` · ${s.when}` : ""} · ${s.crew.length} of us`}</Locked>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, minWidth: 0 }}>
              <Facepile users={s.going.map((u) => memberOf(s, u))} max={5} size={24} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, ...ell }}>{`${s.going.length} of ${s.crew.length} in`}</span>
              <Button
                kind={s.going.includes(me) ? "secondary" : "primary"}
                onClick={() => {
                  if (!s.going.includes(me)) setLocal({ burst: local.burst + 1 });
                  dispatch({ t: "in" });
                }}
              >
                {s.going.includes(me) ? "Can't make it" : "I'm in"}
              </Button>
            </div>
            {local.burst > 0 ? <Toast key={local.burst}>{`${won.label} at ${s.when || "dinner"}`}</Toast> : null}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Button kind="secondary" wide disabled={busy || !!won} onClick={() => dispatch({ t: "push", p: under.id })}>
              {mineP && mineP.id === under.id ? "Unpush" : "Push for it"}
            </Button>
            <Button
              kind="primary"
              wide
              disabled={busy || !!won}
              onClick={() => {
                haptic("medium");
                setLocal({ x: -1 });
                dispatch({ t: "drop", x: Math.round(x * 1000) / 1000 });
              }}
            >
              {busy ? "Dropping" : "Drop"}
            </Button>
          </div>
        )}
      </div>
    );
  },
});
