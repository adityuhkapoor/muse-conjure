import {
  defineApp,
  Burst,
  Button,
  Canvas,
  CardHeader,
  Facepile,
  clock,
  fitText,
  haptic,
  mix,
  pal,
  running,
  textWidth,
  tween,
  type Ctx,
  type DrawFrame,
  type Member,
} from "@muse/app";

// The boys' roast reel for a birthday: drawn frames from the group's lore, cut on the beat at the
// reel's bpm with captions typing on, landing on the cake with a burst of hearts.

type Scene = "barber" | "pregame" | "parking" | "kitchen" | "beach" | "cake";
type Slide = { scene: Scene; caption: string; who: string; tag: string };
type Params = {
  /** Whose birthday: "Jake" */
  honoree: string;
  /** Turning: 22 */
  age: number;
  /** Who made it: "the boys" */
  crew: string;
  /** Beats per minute, 60 to 180 */
  bpm: number;
  /** 2 to 8 frames. scene: barber, pregame, parking, kitchen, beach or cake. who: whose lore. tag: short name. The last is the cake. */
  slides: Slide[];
  /** Names who already watched. */
  watched: string[];
  /** A reaction already in. */
  quote: { who: string; text: string };
};

// @params
const P: Params = {
  honoree: "Jake",
  age: 22,
  crew: "the boys",
  bpm: 104,
  slides: [
    { scene: "barber", caption: "2019: his first fade. he asked for \"like Drake\"", who: "Bryan", tag: "the fade" },
    { scene: "pregame", caption: "asleep at his OWN pregame. 9:40pm.", who: "Kev", tag: "the pregame" },
    { scene: "parking", caption: "parallel parking, attempt 7 of 7", who: "Dev", tag: "the parking one" },
    { scene: "kitchen", caption: "\"i can cook\" - the smoke alarm disagreed", who: "Bryan", tag: "the kitchen" },
    { scene: "beach", caption: "Cabo day 1: \"sunscreen is for tourists\"", who: "Kev", tag: "Cabo" },
    { scene: "cake", caption: "22 and somehow still him. HBD Jake", who: "the boys", tag: "the cake" },
  ],
  watched: ["Bryan", "Kev", "Dev"],
  quote: { who: "Kev", text: "the parking one lmao" },
};
// @end params

type React = { by: string; slide: number; at: number };
type State = {
  honoree: string;
  name: string;
  age: number;
  crew: string;
  bpm: number;
  slides: Slide[];
  watched: string[];
  reacts: React[];
  quote: { by: string; text: string } | null;
};
type Action = { t: "watch" } | { t: "react"; slide: number };
type Local = { start: number; held: number; playing: boolean };

const SCENES: Scene[] = ["barber", "pregame", "parking", "kitchen", "beach", "cake"];
const TAIL = 2400;
const CUT = 350;
const LAB_W = 380;
const LAB_H = 238;
const cutEase = tween({ duration: CUT, easing: [0.33, 1, 0.68, 1] });
const irisEase = cutEase;
let buzzed = -1;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const known = (ctx: Ctx, id: string) => id.startsWith("o:") || inChat(ctx, id);
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const nameOfId = (id: string, members: readonly Member[]) => (id.startsWith("o:") ? id.slice(2) : members.find((m) => m.id === id)?.name ?? id);
const asMember = (id: string, members: readonly Member[]): Member => members.find((m) => m.id === id) ?? { id, name: nameOfId(id, members) };
const ordinal = (n: number) => {
  const m = n % 100;
  if (m >= 11 && m <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10 < 4 ? n % 10 : 0]}`;
};
const clock2 = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const beatMsOf = (s: State) => 60000 / s.bpm;
const slideMsOf = (s: State) => 4 * beatMsOf(s);
const totalMsOf = (s: State) => s.slides.length * slideMsOf(s);
const mineReact = (s: State, u: string) => s.reacts.find((r) => r.by === u);

function initState(ctx: Ctx): State {
  const match = (name: string) => {
    const n = name.toLowerCase();
    const m = ctx.members.find((x) => x.id === name || x.name.toLowerCase() === n);
    return m ? m.id : `o:${name}`;
  };
  const crew = clean(P.crew, 20) || "the crew";
  const rawName = clean(P.honoree, 16) || "Jake";
  const honoree = match(rawName);
  const name = (honoree.startsWith("o:") ? rawName : ctx.members.find((m) => m.id === honoree)?.name ?? rawName).slice(0, 16);
  const age = Number.isInteger(P.age) && P.age >= 1 && P.age <= 120 ? P.age : 0;
  const bpm = Number.isInteger(P.bpm) && P.bpm >= 60 && P.bpm <= 180 ? P.bpm : 104;
  const slides: Slide[] = [];
  for (const raw of Array.isArray(P.slides) ? P.slides : []) {
    if (!raw || slides.length >= 8) continue;
    const scene = SCENES.includes(raw.scene) ? raw.scene : "cake";
    slides.push({ scene, caption: clean(raw.caption, 60), who: clean(raw.who, 16), tag: clean(raw.tag, 20) });
  }
  const cake: Slide = { scene: "cake", caption: `Happy birthday, ${name}`, who: crew, tag: "the cake" };
  let list = slides;
  if (list.length === 0) list = [cake];
  else if (list[list.length - 1]!.scene !== "cake") list = [...(list.length >= 8 ? list.slice(0, 7) : list), cake];
  const watched: string[] = [];
  for (const w of Array.isArray(P.watched) ? P.watched : []) {
    const n = clean(w, 16);
    if (n && !watched.includes(match(n))) watched.push(match(n));
  }
  const qt = clean(P.quote?.text, 60);
  const quote = qt ? { by: match(clean(P.quote?.who, 16) || crew), text: qt } : null;
  const reacts: React[] = [];
  if (quote) {
    const k = list.findIndex((s) => s.tag && quote.text.toLowerCase().includes(s.tag.toLowerCase()));
    if (k >= 0) reacts.push({ by: quote.by, slide: k, at: 1 });
  }
  return { honoree, name, age, crew, bpm, slides: list, watched, reacts, quote };
}

const everyone = (s: State, members: readonly Member[]) => new Set([...s.watched, ...members.map((m) => m.id), ...(s.quote ? [s.quote.by] : []), s.honoree]);

// ---------- drawing ----------

type Look = { skin: string; hair: string; style: "swoop" | "cap" | "buzz" | "short"; shirt: string };
type Mood = "grin" | "shock" | "sleep" | "smug";

function drawScene(g: CanvasRenderingContext2D, f: DrawFrame, scene: Scene, t: number, W: number, H: number, name: string, age: number) {
  const th = f.theme;
  const p = pal(th);
  const ux = W / LAB_W;
  const uy = H / LAB_H;
  const s = Math.min(1.25 * ux, uy);
  const X = (v: number) => v * ux;
  const Y = (v: number) => v * uy;
  const Z = (v: number) => v * s;
  const mx = W / 2;
  const my = H / 2;
  const mono = "ui-monospace, Menlo, monospace";
  const sans = th.type.family;

  const looks: Record<string, Look> = {
    jake: { skin: p.wall, hair: p.brown, style: "swoop", shirt: p.red },
    bryan: { skin: p.crust, hair: p.yellow, style: "cap", shirt: p.blue },
    kev: { skin: mix(p.brown, p.crust, 0.4), hair: p.dark, style: "buzz", shirt: p.green },
    dev: { skin: mix(p.crust, p.brown, 0.3), hair: p.dark, style: "short", shirt: p.purple },
  };

  const rr = (x: number, y: number, w: number, h: number, r: number, fill: string) => {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
    g.fillStyle = fill;
    g.fill();
  };
  const circ = (x: number, y: number, r: number, fill: string) => {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
  };
  const poly = (pts: [number, number][], fill: string) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  const grad = (a: string, b: string) => {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, a);
    gr.addColorStop(1, b);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  };
  const word = (text: string, x: number, y: number, size: number, weight: number, color: string, align: CanvasTextAlign, family = sans) => {
    const fit = fitText(text, W * 0.9, { g, size, min: 8, weight, family });
    g.font = fit.font;
    g.fillStyle = color;
    g.textAlign = align;
    g.textBaseline = "middle";
    g.fillText(fit.text, x, y);
  };
  const line = (x1: number, y1: number, x2: number, y2: number, w: number, color: string) => {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.lineWidth = w;
    g.lineCap = "round";
    g.strokeStyle = color;
    g.stroke();
  };
  const alpha = (a: number, fn: () => void) => {
    g.globalAlpha = a;
    fn();
    g.globalAlpha = 1;
  };

  // A drawn person: head, hair, eyes by mood.
  const bust = (cx: number, cy: number, r: number, look: Look, mood: Mood, shoulders: boolean, skinOverride?: string) => {
    const skin = skinOverride ?? look.skin;
    const ink = p.dark;
    if (shoulders) {
      rr(cx - 1.35 * r, cy + 1.75 * r - 0.8 * r, 2.7 * r, 1.6 * r, 0.8 * r, look.shirt);
      rr(cx - 0.25 * r, cy + 0.95 * r - 0.25 * r, 0.5 * r, 0.5 * r, 0, mix(skin, ink, 0.12));
    }
    circ(cx - 0.95 * r, cy + 0.08 * r, 0.2 * r, skin);
    circ(cx + 0.95 * r, cy + 0.08 * r, 0.2 * r, skin);
    circ(cx, cy, r, skin);
    // hair
    const buzz = look.style === "buzz";
    g.beginPath();
    g.arc(cx, cy - 0.04 * r, (buzz ? 1.03 : 1.06) * r, Math.PI - 0.12, Math.PI * 2 + 0.12);
    g.lineTo(cx + 0.98 * r, cy + (buzz ? -0.62 : -0.32) * r);
    g.lineTo(cx - 0.98 * r, cy + (buzz ? -0.62 : -0.32) * r);
    g.closePath();
    g.fillStyle = look.hair;
    g.fill();
    if (look.style === "swoop") poly([[cx - 0.9 * r, cy - 0.55 * r], [cx + 0.6 * r, cy - 1.25 * r], [cx + 0.3 * r, cy - 0.2 * r]], look.hair);
    if (look.style === "cap") rr(cx - 0.95 * r, cy - 0.42 * r - 0.13 * r, 1.5 * r, 0.26 * r, 0.1 * r, look.hair);
    // face
    const ex = 0.36 * r;
    const ey = cy + 0.08 * r;
    const blink = t % 3.7 < 0.12;
    if (mood === "shock") {
      circ(cx - ex, ey, 0.22 * r, p.paper);
      circ(cx + ex, ey, 0.22 * r, p.paper);
      circ(cx - ex, ey, 0.11 * r, ink);
      circ(cx + ex, ey, 0.11 * r, ink);
    } else if (mood === "sleep") {
      g.lineWidth = Math.max(1, 0.07 * r);
      g.strokeStyle = ink;
      g.lineCap = "round";
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.arc(cx + sx * ex, ey - 0.03 * r, 0.14 * r, 0.15 * Math.PI, 0.85 * Math.PI);
        g.stroke();
      }
    } else if (mood === "smug") {
      line(cx - ex - 0.14 * r, ey, cx - ex + 0.14 * r, ey, Math.max(1.2, 0.08 * r), ink);
      line(cx + ex - 0.14 * r, ey, cx + ex + 0.14 * r, ey, Math.max(1.2, 0.08 * r), ink);
    } else if (blink) {
      line(cx - ex - 0.1 * r, ey, cx - ex + 0.1 * r, ey, Math.max(1.2, 0.07 * r), ink);
      line(cx + ex - 0.1 * r, ey, cx + ex + 0.1 * r, ey, Math.max(1.2, 0.07 * r), ink);
    } else {
      circ(cx - ex, ey, 0.11 * r, ink);
      circ(cx + ex, ey, 0.11 * r, ink);
    }
    alpha(0.35, () => {
      circ(cx - 0.58 * r, cy + 0.38 * r, 0.16 * r, p.red);
      circ(cx + 0.58 * r, cy + 0.38 * r, 0.16 * r, p.red);
    });
    const my2 = cy + 0.45 * r;
    if (mood === "grin") {
      g.beginPath();
      g.arc(cx, my2 - 0.1 * r, 0.36 * r, 0, Math.PI);
      g.closePath();
      g.fillStyle = mix(p.red, ink, 0.6);
      g.fill();
      rr(cx - 0.26 * r, my2 - 0.1 * r, 0.52 * r, 0.1 * r, 0, p.paper);
    } else if (mood === "shock") {
      g.beginPath();
      g.ellipse(cx, my2 + 0.05 * r, 0.14 * r, 0.2 * r, 0, 0, Math.PI * 2);
      g.fillStyle = mix(p.red, ink, 0.6);
      g.fill();
    } else if (mood === "sleep") {
      g.beginPath();
      g.ellipse(cx, my2, 0.1 * r, 0.08 * r, 0, 0, Math.PI * 2);
      g.fillStyle = mix(p.red, ink, 0.6);
      g.fill();
    } else {
      g.beginPath();
      g.moveTo(cx - 0.25 * r, my2);
      g.lineTo(cx + 0.1 * r, my2);
      g.lineTo(cx + 0.3 * r, my2 - 0.12 * r);
      g.lineWidth = Math.max(1.2, 0.08 * r);
      g.lineCap = "round";
      g.lineJoin = "round";
      g.strokeStyle = ink;
      g.stroke();
    }
  };

  if (scene === "barber") {
    grad(mix(p.green, p.card, 0.7), mix(p.green, p.card, 0.5));
    // checker floor
    const fy = 0.78 * H;
    const tw = W / 12;
    const rows = Math.ceil((H - fy) / tw);
    const dark = new Path2D();
    const light = new Path2D();
    for (let r = 0; r < rows; r++) for (let k = -1; k < 14; k++) ((r + k) % 2 === 0 ? dark : light).rect(k * tw, fy + r * tw, tw, tw);
    g.fillStyle = p.dark;
    g.fill(dark);
    g.fillStyle = p.paper;
    g.fill(light);
    // pole
    const px = X(28), py = Y(34), pw = Z(26), ph = Z(120);
    rr(px, py, pw, ph, Z(6), p.paper);
    g.save();
    g.beginPath();
    g.roundRect(px, py, pw, ph, Z(6));
    g.clip();
    const sp = Z(24);
    const off = (t * Z(30)) % sp;
    g.beginPath();
    for (let y = py - sp + off; y < py + ph + sp; y += sp) {
      g.moveTo(px, y + Z(4));
      g.lineTo(px + pw, y - Z(10));
      g.lineTo(px + pw, y - Z(2));
      g.lineTo(px, y + Z(12));
      g.closePath();
    }
    g.fillStyle = p.red;
    g.fill();
    g.restore();
    rr(px - Z(3), py - Z(4), Z(32), Z(10), Z(3), p.crust);
    rr(px - Z(3), py + ph - Z(6), Z(32), Z(10), Z(3), p.crust);
    // mirror
    const mw = Z(170), mh = Z(120);
    const mcx = mx + X(40), mcy = my - Y(24);
    rr(mcx - mw / 2 - Z(6), mcy - mh / 2 - Z(6), mw + Z(12), mh + Z(12), Z(10), p.crust);
    rr(mcx - mw / 2, mcy - mh / 2, mw, mh, Z(6), mix(p.green, p.card, 0.85));
    alpha(0.5, () => {
      line(mcx - mw / 2 + Z(18), mcy - mh / 2 + Z(40), mcx - mw / 2 + Z(48), mcy - mh / 2 + Z(8), Z(5), p.paper);
      line(mcx - mw / 2 + Z(54), mcy - mh / 2 + Z(30), mcx - mw / 2 + Z(66), mcy - mh / 2 + Z(14), Z(3), p.paper);
    });
    // cape and Jake
    const cx = mx + X(40), cy = my + Y(6);
    poly([[cx - Z(80), cy + Z(120)], [cx - Z(30), cy + Z(32)], [cx + Z(30), cy + Z(32)], [cx + Z(80), cy + Z(120)]], p.blue);
    bust(cx, cy, Z(36), looks.jake!, "shock", false);
    circ(cx - Z(26), cy - Z(24), Z(12), looks.jake!.skin);
    // scissors
    const sx = cx + Z(58), sy = cy - Z(40) + Math.sin(3 * t) * Z(5);
    const open = Math.abs(Math.sin(10 * t) * 0.3);
    for (const sgn of [-1, 1]) {
      g.save();
      g.translate(sx, sy);
      g.rotate(sgn * open - 0.5);
      line(0, 0, Z(26), 0, Z(3), p.soft);
      g.beginPath();
      g.arc(-Z(5), sgn * Z(5), Z(6), 0, Math.PI * 2);
      g.lineWidth = Z(2.5);
      g.strokeStyle = p.red;
      g.stroke();
      g.restore();
    }
    // falling hair
    for (let k = 0; k < 6; k++) circ(cx - Z(30) + k * Z(14), cy - Z(30) + ((t * 40 + k * 23) % Z(90)), Z(2), p.brown);
    word("'19", W - X(12), Y(12) + Z(8), Z(16), 700, p.orange, "right", mono);
  } else if (scene === "pregame") {
    grad(mix(p.purple, p.dark, 0.55), mix(p.purple, p.dark, 0.3));
    // string lights
    const cols = [p.yellow, p.red, p.green];
    g.beginPath();
    for (let k = 0; k < 12; k++) {
      const x = lerp(12, W - 12, k / 11);
      const y = Y(22) + Math.sin((k * Math.PI) / 11) * Y(16);
      k ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.lineWidth = 1;
    g.strokeStyle = p.soft;
    g.stroke();
    for (let k = 0; k < 12; k++) {
      const x = lerp(12, W - 12, k / 11);
      const y = Y(22) + Math.sin((k * Math.PI) / 11) * Y(16);
      alpha(0.18 + 0.14 * Math.sin(t * 4 + k), () => circ(x, y, Z(12), cols[k % 3]!));
      circ(x, y, Z(3.5), cols[k % 3]!);
    }
    // couch
    rr(X(40), Y(110), W - 2 * X(40), Z(60), Z(18), mix(p.red, p.dark, 0.2));
    rr(X(30), Y(150), W - 2 * X(30), Z(36), Z(14), p.orange);
    const jx = mx - X(10), jy = Y(138);
    bust(jx, jy, Z(32), looks.jake!, "sleep", true);
    // party hat
    g.save();
    g.translate(jx + X(10), jy - Z(38));
    g.rotate(0.35);
    poly([[-Z(14), Z(10)], [0, -Z(26)], [Z(14), Z(10)]], p.yellow);
    circ(0, -Z(26), Z(4), p.red);
    g.restore();
    // zzz
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.5 + k / 3) % 1;
      alpha(1 - ph, () => word("z", jx + Z(40) + ph * Z(30) + k * Z(6), jy - Z(30) - ph * Z(46), Z(12 + 12 * ph), 700, p.on, "center"));
    }
    // table and cups
    rr(X(70), Y(202), W - 2 * X(70), Z(18), Z(4), p.brown);
    for (let k = 0; k < 5; k++) {
      const x = lerp(X(70) + Z(20), W - X(70) - Z(20), k / 4);
      const y = Y(202);
      poly([[x - Z(7), y - Z(20)], [x + Z(7), y - Z(20)], [x + Z(5), y], [x - Z(5), y]], p.red);
    }
    word("9:40 PM", W - X(24), Y(40) + Z(6), Z(13), 700, p.yellow, "right", mono);
  } else if (scene === "parking") {
    g.fillStyle = mix(p.soft, p.dark, 0.45);
    g.fillRect(0, 0, W, H);
    g.fillStyle = p.shade;
    g.fillRect(0, 0, W, 0.25 * H);
    const curb = 0.25 * H;
    g.fillStyle = p.yellow;
    g.fillRect(0, curb, W, Z(6));
    const dash = new Path2D();
    const ly = H - Y(46);
    const dx = (t * -40) % Z(70);
    for (let x = dx - Z(70); x < W + Z(70); x += Z(70)) dash.rect(x, ly, Z(36), Z(5));
    g.fillStyle = p.paper;
    g.fill(dash);
    const car = (cx: number, cy: number, angle: number, body: string) => {
      g.save();
      g.translate(cx, cy);
      g.rotate(angle);
      alpha(0.25, () => rr(-Z(48) + Z(3), -Z(24) + Z(5), Z(96), Z(48), Z(10), p.dark));
      rr(-Z(48), -Z(24), Z(96), Z(48), Z(10), body);
      rr(Z(14) - Z(11), -Z(19), Z(22), Z(38), Z(4), p.sky);
      rr(-Z(22) - Z(7), -Z(18), Z(14), Z(36), Z(4), p.sky);
      g.restore();
    };
    const cy0 = curb + Z(6) + Y(36);
    car(X(62), cy0, 0, p.blue);
    car(W - X(62), cy0, 0, p.green);
    const jsin = Math.sin(1.4 * t);
    const jcx = mx + jsin * X(8);
    const jcy = curb + Y(82);
    g.save();
    g.translate(jcx, jcy);
    g.rotate(-0.55 + jsin * 0.12);
    g.globalAlpha = 0.3;
    g.strokeStyle = p.dark;
    g.lineWidth = Z(3);
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.arc(-Z(30), Z(20) + k * Z(5), Z(30) + k * Z(6), 0.2, 1.1);
      g.stroke();
    }
    g.restore();
    car(jcx, jcy, -0.55 + jsin * 0.12, p.red);
    // cones
    const cone = (x: number, y: number, a: number) => {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      poly([[-Z(9), Z(10)], [Z(9), Z(10)], [Z(4), -Z(14)], [-Z(4), -Z(14)]], p.orange);
      rr(-Z(12), Z(9), Z(24), Z(4), Z(2), p.dark);
      g.restore();
    };
    cone(X(130), jcy + Y(34), 0);
    cone(W - X(130), jcy + Y(40), 1.3);
    circ(W - X(36), Y(30), Z(22), p.red);
    word("7", W - X(36), Y(30), Z(26), 800, p.on, "center");
  } else if (scene === "kitchen") {
    grad(p.wall, mix(p.wall, p.orange, 0.25));
    const tile = Z(26);
    const grid = new Path2D();
    for (let x = 0; x <= W; x += tile) {
      grid.moveTo(x, 0);
      grid.lineTo(x, 0.6 * H);
    }
    for (let y = 0; y <= 0.6 * H; y += tile) {
      grid.moveTo(0, y);
      grid.lineTo(W, y);
    }
    g.lineWidth = 1;
    g.strokeStyle = p.crust;
    alpha(0.5, () => g.stroke(grid));
    const counter = 0.66 * H;
    g.fillStyle = mix(p.purple, p.dark, 0.45);
    g.fillRect(0, counter, W, H - counter);
    // alarm
    const ax = mx + X(110), ay = Y(18) + Z(8);
    const on = Math.floor(t * 8) % 2 === 0;
    circ(ax, ay, Z(16), p.paper);
    circ(ax, ay, Z(5), on ? p.red : mix(p.red, p.dark, 0.5));
    if (on) {
      for (let k = 0; k < 3; k++) {
        const a = 0.2 + k * 0.45;
        line(ax + Math.cos(a) * Z(24), ay + Math.sin(a) * Z(24), ax + Math.cos(a) * Z(34), ay + Math.sin(a) * Z(34), Z(3), p.red);
      }
      word("BEEP".toUpperCase(), ax - Z(40), ay + Z(40), Z(16), 800, p.red, "center");
    }
    // Jake and the pan
    const jx = mx - X(50), jy = counter - Z(30);
    const px = jx + Z(88), py = jy - Z(8);
    bust(jx, jy, Z(32), looks.jake!, "shock", true);
    line(jx + Z(36), jy + Z(58), px - Z(30), py + Z(8), Z(8), looks.jake!.skin);
    // smoke
    for (let k = 0; k < 6; k++) {
      const ph = (t * 0.35 + k / 6) % 1;
      alpha(0.45 * (1 - ph * 0.6), () => circ(px + Math.sin(k * 2 + t) * Z(14) + k * Z(3), py - Z(28) - ph * Z(160), Z(12 + 12 * ph), p.soft));
    }
    // flames
    const fl = 1 + 0.15 * Math.sin(t * 14);
    circ(px - Z(4), py - Z(14), Z(22) * fl, p.orange);
    circ(px + Z(4), py - Z(18), Z(16) * fl, mix(p.orange, p.yellow, 0.5));
    circ(px, py - Z(20), Z(10) * (2 - fl), p.yellow);
    // pan
    g.save();
    g.translate(px, py);
    g.rotate(Math.PI + 0.2);
    line(0, 0, Z(44), 0, Z(6), p.dark);
    g.restore();
    circ(px, py, Z(24), p.dark);
    circ(px, py, Z(20), mix(p.dark, p.soft, 0.25));
    circ(px - Z(6), py - Z(6), Z(5), mix(p.dark, p.soft, 0.5));
  } else if (scene === "beach") {
    grad(mix(p.blue, p.card, 0.35), p.sky);
    g.fillStyle = p.cream;
    g.fillRect(0, 0.55 * H, W, H - 0.55 * H);
    g.fillStyle = p.blue;
    g.fillRect(0, 0.55 * H - Z(30), W, Z(30));
    g.lineWidth = Math.max(1, Z(2));
    g.strokeStyle = p.on;
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const x = ((k * 61 + t * 14) % (W + 40)) - 20;
      const y = 0.55 * H - Z(22) + (k % 3) * Z(8);
      g.moveTo(x + Z(8), y);
      g.arc(x, y, Z(8), 0, Math.PI);
    }
    alpha(0.6, () => g.stroke());
    // sun
    const sx = W - X(60), sy = Y(46);
    g.beginPath();
    for (let k = 0; k < 24; k++) {
      const a = (k * Math.PI) / 12 + 0.3 * t;
      const r = k % 2 === 0 ? Z(40) : Z(28);
      g.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = p.yellow;
    g.fill();
    circ(sx, sy, Z(24), mix(p.yellow, p.orange, 0.5));
    // palm
    const tx = X(52), ty = H - Y(20);
    g.beginPath();
    g.moveTo(tx, ty);
    g.quadraticCurveTo(tx + Z(14), ty - Z(60), tx + Z(4), ty - Z(130));
    g.lineWidth = Z(9);
    g.lineCap = "round";
    g.strokeStyle = p.brown;
    g.stroke();
    for (let k = 0; k < 5; k++) {
      g.save();
      g.translate(tx + Z(4), ty - Z(130));
      g.rotate(-1.3 + k * 0.65 + Math.sin(t * 1.5 + k) * 0.06);
      g.beginPath();
      g.ellipse(Z(18), 0, Z(30), Z(8), 0, 0, Math.PI * 2);
      g.fillStyle = p.leaf;
      g.fill();
      g.restore();
    }
    // lobster Jake
    const jx = mx + X(10), jy = 0.55 * H + Y(34);
    const pulse = mix(p.red, p.orange, 0.3 + 0.3 * Math.sin(2 * t));
    bust(jx, jy, Z(34), { ...looks.jake!, shirt: p.yellow }, "grin", true, pulse);
    rr(jx - Z(13) - Z(10), jy + Z(2) - Z(6), Z(20), Z(12), Z(4), p.dark);
    rr(jx + Z(13) - Z(10), jy + Z(2) - Z(6), Z(20), Z(12), Z(4), p.dark);
    line(jx - Z(3), jy + Z(2), jx + Z(3), jy + Z(2), Z(2), p.dark);
    g.lineWidth = Z(2);
    g.strokeStyle = p.red;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      const x0 = jx - Z(16) + k * Z(16);
      g.moveTo(x0, jy - Z(46));
      g.bezierCurveTo(x0 + Z(5), jy - Z(52 + Math.sin(t * 3 + k) * 3), x0 - Z(5), jy - Z(58), x0, jy - Z(66));
      alpha(0.6, () => g.stroke());
    }
    word("SPF 0", X(76), 0.55 * H + Y(50), Z(16), 800, p.red, "left");
  } else {
    grad(mix(p.red, p.dark, 0.55), p.dark);
    const cc = [p.red, p.yellow, p.green, p.blue, p.orange, p.purple];
    for (let c = 0; c < 6; c++) {
      const cf = new Path2D();
      for (let i = c; i < 30; i += 6) cf.rect((i * 97.3) % W, (i * 53.1 * uy + t * 30 * uy) % H, Z(5), Z(3));
      g.fillStyle = cc[c]!;
      g.fill(cf);
    }
    for (let i = 0; i < 9; i++) {
      const x = lerp(Z(14), W - Z(14), i / 8);
      const y = Y(4) + Math.sin((i * Math.PI) / 8) * Z(12);
      poly([[x - Z(14), y], [x + Z(14), y], [x, y + Z(22)]], cc[i % 6]!);
    }
    const base = 0.76 * H;
    rr(mx - Z(90), base, Z(180), Z(8), Z(4), p.shade);
    rr(mx - Z(75), base - Z(48), Z(150), Z(48), Z(10), mix(p.red, p.on, 0.45));
    rr(mx - Z(54), base - Z(92), Z(108), Z(44), Z(10), mix(p.red, p.on, 0.7));
    const ic = new Path2D();
    for (let i = 0; i < 7; i++) {
      const x = mx - Z(66) + (i * Z(132)) / 6;
      ic.moveTo(x + Z(7), base - Z(48));
      ic.arc(x, base - Z(48), Z(7), 0, Math.PI * 2);
    }
    for (let i = 0; i < 5; i++) {
      const x = mx - Z(44) + (i * Z(88)) / 4;
      ic.moveTo(x + Z(6), base - Z(92));
      ic.arc(x, base - Z(92), Z(6), 0, Math.PI * 2);
    }
    g.fillStyle = p.on;
    g.fill(ic);
    word(name.toUpperCase(), mx, base - Z(24), Z(22), 800, mix(p.red, p.dark, 0.6), "center");
    const digits = age > 0 ? String(age) : "";
    for (let i = 0; i < digits.length; i++) {
      const x = mx + (i - (digits.length - 1) / 2) * Z(34);
      word(digits[i]!, x, base - Z(92) - Z(24), Z(50), 800, p.yellow, "center");
      const fl = 1 + 0.15 * Math.sin(t * 11 + i * 2);
      alpha(0.25, () => circ(x, base - Z(92) - Z(66), Z(13), p.yellow));
      g.beginPath();
      g.ellipse(x, base - Z(92) - Z(66), Z(4), Z(8) * fl, 0, 0, Math.PI * 2);
      g.fillStyle = p.orange;
      g.fill();
    }
    bust(X(40), H + Z(2), Z(16), looks.bryan!, "grin", true);
    bust(X(70), H + Z(2), Z(16), looks.kev!, "grin", true);
    bust(X(100), H + Z(2), Z(16), looks.dev!, "grin", true);
    bust(W - X(50), H - Y(10), Z(22), looks.jake!, "smug", true);
  }
}


// ---------- reel ----------

type Draw = {
  slides: Slide[];
  name: string;
  age: number;
  crew: string;
  total: number;
  slideMs: number;
  beatMs: number;
  start: number;
  held: number;
  playing: boolean;
};

function drawReel(g: CanvasRenderingContext2D, f: DrawFrame, d: Draw): boolean {
  const th = f.theme;
  const p = pal(th);
  const W = f.width;
  const H = f.height;
  const n = d.slides.length;
  const poster = d.start === 0;
  const pos = poster ? 0 : d.playing ? Math.min(d.total, Math.max(0, f.now - d.start)) : d.held;
  const idx = poster ? n - 1 : Math.min(n - 1, Math.floor(pos / d.slideMs));
  const inMs = poster ? 0 : pos - idx * d.slideMs;
  const t = poster ? 0 : pos / 1000;
  const pulse = poster ? 0 : Math.exp((-7 * (pos % d.beatMs)) / 1000);
  const ux = W / LAB_W;
  const uy = H / LAB_H;
  const s = Math.min(1.25 * ux, uy);
  const cx = W / 2;
  const cy = H / 2;
  const sc = 1 + (0.06 * inMs) / d.slideMs + pulse * 0.025;
  const dx = Math.sin(1.7 * idx) * (inMs / 1000) * 4;
  const dy = Math.cos(2.3 * idx) * (inMs / 1000) * 4;

  const scene = (i: number, scale: number, ox: number, kb: boolean) => {
    g.save();
    g.translate(cx + ox + (kb ? dx : 0), cy + (kb ? dy : 0));
    g.scale(scale, scale);
    g.translate(-cx, -cy);
    drawScene(g, f, d.slides[i]!.scene, t, W, H, d.name, d.age);
    g.restore();
  };

  const cutting = !poster && idx > 0 && inMs < CUT;
  if (cutting) {
    const k = cutEase(inMs);
    const kind = idx % 3;
    if (kind === 0) {
      scene(idx - 1, 1, 0, false);
      const xe = lerp(W, 0, k);
      g.save();
      g.beginPath();
      g.rect(xe, 0, W - xe, H);
      g.clip();
      scene(idx, sc, (1 - k) * 60, true);
      g.restore();
      g.fillStyle = p.yellow;
      g.fillRect(xe - 2, 0, 4, H);
    } else if (kind === 1) {
      scene(idx, sc * lerp(1.25, 1, k), 0, true);
      g.globalAlpha = 0.85 * (1 - k);
      g.fillStyle = p.on;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    } else {
      scene(idx - 1, 1, 0, false);
      g.save();
      g.beginPath();
      g.arc(cx, cy, irisEase(inMs) * 0.75 * W, 0, Math.PI * 2);
      g.clip();
      scene(idx, sc, 0, true);
      g.restore();
    }
  } else {
    scene(idx, poster ? 1 : sc, 0, !poster);
  }

  // top shade, segments
  const strips = 28;
  g.fillStyle = p.dark;
  for (let i = 0; i < strips; i++) {
    g.globalAlpha = 0.45 * (1 - i / strips);
    g.fillRect(0, i * 2, W, 2);
  }
  g.globalAlpha = 1;
  const gap = 3;
  const sw = (W - 20 - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const x = 10 + i * (sw + gap);
    g.fillStyle = p.on;
    g.globalAlpha = 0.4;
    g.beginPath();
    g.roundRect(x, 8, sw, 3, 1.5);
    g.fill();
    const fill = poster ? 0 : clamp((pos - i * d.slideMs) / d.slideMs);
    if (fill > 0) {
      g.globalAlpha = 1;
      g.beginPath();
      g.roundRect(x, 8, sw * fill, 3, 1.5);
      g.fill();
    }
  }
  g.globalAlpha = 1;

  if (!poster) {
    // byline: the Muse ring, the crew, the timecode
    g.beginPath();
    g.arc(24, 32, 11, 0, Math.PI * 2);
    g.fillStyle = p.on;
    g.fill();
    g.beginPath();
    g.arc(24, 32, 7.5, -0.4, Math.PI * 1.1);
    g.lineWidth = 4;
    g.strokeStyle = th.color.primary;
    g.stroke();
    g.beginPath();
    g.arc(24, 32, 7.5, Math.PI * 1.1, Math.PI * 1.6);
    g.strokeStyle = th.color.series6;
    g.stroke();
    const cf = fitText(d.crew, W * 0.5, { g, size: 13, weight: 600, min: 10 });
    g.font = cf.font;
    g.fillStyle = p.on;
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText(cf.text, 42, 33);
    g.font = `400 13px ${th.type.family}`;
    g.fillText(clock2(Math.floor(pos / 1000) * 1000), 42 + cf.width + 6, 33);
  }

  const showCircle = poster || (!d.playing && pos < d.total);
  if (poster) {
    for (let i = 0; i < 26; i++) {
      g.globalAlpha = 0.75 * ((i + 1) / 26);
      g.fillStyle = p.dark;
      g.fillRect(0, H - 52 + i * 2, W, 2);
    }
    g.globalAlpha = 1;
  }
  if (showCircle) {
    const py = poster ? cy + 8 * uy : cy - 20;
    const r = poster ? 28 : 26;
    g.globalAlpha = 0.5;
    g.beginPath();
    g.arc(cx, py, r, 0, Math.PI * 2);
    g.fillStyle = p.dark;
    g.fill();
    g.globalAlpha = 1;
    g.beginPath();
    g.moveTo(cx - 6, py - 10);
    g.lineTo(cx + 12, py);
    g.lineTo(cx - 6, py + 10);
    g.closePath();
    g.fillStyle = p.on;
    g.fill();
  }
  if (poster) {
    const tf = fitText("Tap to play", W * 0.5, { g, size: 15, weight: 600, min: 12 });
    g.font = tf.font;
    g.fillStyle = p.on;
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText(tf.text, 14, H - 18);
  }
  void s;
  return d.playing && !poster && f.now - d.start < d.total + 40;
}

const ellipsis = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

export default defineApp<State, Action, Local>({
  name: "Birthday roast reel",
  summary: (s, ctx) => {
    const total = everyone(s, ctx.members).size;
    const base = `${s.name} turns ${s.age}: roast reel · ${s.watched.length} of ${total} watched`;
    return s.reacts.length ? `${base} · ${s.reacts.length} laughs` : base;
  },

  init: (ctx) => initState(ctx),

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    const u = meta.user;
    if (a.t === "watch") return s.watched.includes(u) ? s : { ...s, watched: [...s.watched, u] };
    if (a.t === "react") {
      if (!Number.isInteger(a.slide) || a.slide < 0 || a.slide >= s.slides.length) return s;
      const mine = mineReact(s, u);
      if (mine && mine.slide === a.slide) return { ...s, reacts: s.reacts.filter((r) => r.by !== u) };
      return { ...s, reacts: [...s.reacts.filter((r) => r.by !== u), { by: u, slide: a.slide, at: meta.time }] };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const keep = (id: string) => known(ctx, id);
    const quoteGone = s.quote !== null && !keep(s.quote.by);
    if (s.watched.every(keep) && s.reacts.every((r) => keep(r.by)) && !quoteGone) return s;
    return { ...s, watched: s.watched.filter(keep), reacts: s.reacts.filter((r) => keep(r.by)), quote: quoteGone ? null : s.quote };
  },

  invariants: {
    "watched is unique, members or outsiders": (s, ctx) => new Set(s.watched).size === s.watched.length && s.watched.every((u) => known(ctx, u)),
    "one reaction per person, on a real frame": (s, ctx) =>
      new Set(s.reacts.map((r) => r.by)).size === s.reacts.length &&
      s.reacts.every((r) => Number.isInteger(r.slide) && r.slide >= 0 && r.slide < s.slides.length && known(ctx, r.by)),
    "the reel ends on the cake": (s) =>
      s.slides.length >= 1 && s.slides.length <= 8 && s.slides[s.slides.length - 1]!.scene === "cake" && s.slides.every((x) => SCENES.includes(x.scene)),
    "the beat is sane": (s) => Number.isInteger(s.bpm) && s.bpm >= 60 && s.bpm <= 180,
    "the quote's author is known": (s, ctx) => !s.quote || known(ctx, s.quote.by),
  },

  transitions: {
    "watching adds only the actor": (p, n, a, m) => a.t !== "watch" || p === n || (!p.watched.includes(m.user) && same(n.watched, [...p.watched, m.user])),
    "a reaction moves only the actor's own": (p, n, a, m) =>
      a.t !== "react" || same(p.reacts.filter((r) => r.by !== m.user), n.reacts.filter((r) => r.by !== m.user)),
    "a reaction lands where you tapped, or comes off": (p, n, a, m) => {
      if (a.t !== "react" || p === n) return true;
      const before = mineReact(p, m.user);
      const after = mineReact(n, m.user);
      return before?.slide === a.slide ? !after : after?.slide === a.slide && after.at === m.time;
    },
    "nobody is un-watched by an action": (p, n) => p.watched.every((u) => n.watched.includes(u)),
    "the reel never changes": (p, n) =>
      p.honoree === n.honoree && p.name === n.name && p.age === n.age && p.crew === n.crew && p.bpm === n.bpm && same(p.slides, n.slides) && same(p.quote, n.quote),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, _u, r) => (r.next() < 0.3 ? { t: "watch" } : { t: "react", slide: r.int(s.slides.length) }),

  local: { start: 0, held: 0, playing: false },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const H = 440;
    const n = state.slides.length;
    const slideMs = slideMsOf(state);
    const beatMs = beatMsOf(state);
    const total = totalMsOf(state);
    const el = local.playing ? running(local.start, total + TAIL) : null;
    const done = local.playing && (el === null || el >= total);
    const pos = local.playing ? (el === null ? total : Math.min(total, el)) : local.held;
    const live = local.playing && !done;
    const started = local.start > 0;
    const idx = started ? Math.min(n - 1, Math.floor(pos / slideMs)) : n - 1;
    const inMs = started ? pos - idx * slideMs : 0;
    const slide = state.slides[idx]!;
    const lift = started ? Math.exp((-7 * (pos % beatMs)) / 1000) * 3 : 0;
    const tail = el !== null && el >= total;
    if (tail && buzzed !== local.start) {
      buzzed = local.start;
      haptic("success");
    }

    const watchedAll = everyone(state, members).size;
    const mine = mineReact(state, me);
    const here = state.reacts.filter((r) => r.slide === idx).length;
    const latest = state.reacts.length ? state.reacts.reduce((a, b) => (b.at >= a.at ? b : a)) : null;
    let line1: string;
    let line2: string;
    if (done) {
      if (latest) {
        line1 = `${nameOfId(latest.by, members)} reacted`;
        line2 = state.quote && state.quote.by === latest.by ? `"${state.quote.text}"` : `Laughed at ${state.slides[latest.slide]?.tag ?? "the reel"}`;
      } else {
        line1 = "Laugh at your favorite";
        line2 = "Tap the face on any frame";
      }
    } else {
      line1 = `${state.watched.length} of ${watchedAll} watched`;
      line2 = me === state.honoree ? "Made for you" : state.watched.includes(state.honoree) ? `${state.name} watched it` : `${state.name} hasn't seen it yet`;
    }

    const play = () => {
      setLocal({ start: clock.value - (done ? 0 : local.held), playing: true });
      if (!state.watched.includes(me)) dispatch({ t: "watch" });
    };
    const pause = () => setLocal({ held: pos, playing: false });
    const jump = (i: number) => {
      setLocal({ start: clock.value - (i * slideMs + 360), playing: true });
      if (!state.watched.includes(me)) dispatch({ t: "watch" });
    };

    // caption sticker
    const fit = fitText(slide.caption, W - 60, { size: 15, min: 12 });
    const loreText = slide.who ? `lore: ${slide.who}` : "";
    const capW = textWidth(fit.text, fit.size, 400);
    const loreW = textWidth(loreText, 11, 400);
    const inline = !!loreText && capW + loreW + 34 <= W - 24;
    const typed = fit.text.slice(0, Math.ceil(fit.text.length * clamp(inMs / 700)));

    const sw = (W - 20 - 3 * (n - 1)) / n;
    const draw: Draw = { slides: state.slides, name: state.name, age: state.age, crew: state.crew, total, slideMs, beatMs, start: local.start, held: local.held, playing: local.playing };
    const title = state.age > 0 ? `${state.name} turns ${state.age}` : `${state.name}'s birthday`;
    const ageToast = state.age > 0 ? `Happy ${ordinal(state.age)}, ${state.name}` : `Happy birthday, ${state.name}`;

    return (
      <div>
        <CardHeader title={title} subtitle={`Roast reel · ${n} frames · ${clock2(total)}`} />
        <div style={{ position: "relative", height: H, marginTop: 4, borderRadius: 12, overflow: "hidden", background: p.dark }}>
          <Canvas height={H} label={`Frame ${idx + 1} of ${n}: ${slide.caption}`} draw={(g, f) => drawReel(g, f, draw)} />
          <button
            aria-label={live ? "Pause" : "Play"}
            onClick={() => (live ? pause() : play())}
            style={{ position: "absolute", left: 0, top: 0, width: W, height: H, padding: 0, border: 0, background: "transparent", cursor: "pointer" }}
          />
          {started ? (
            <>
              {state.slides.map((_, i) => (
                <button
                  key={i}
                  aria-label={`Frame ${i + 1}`}
                  onClick={() => jump(i)}
                  style={{ position: "absolute", left: 10 + i * (sw + 3) - 1.5, top: 0, width: sw + 3, height: 44, padding: 0, border: 0, background: "transparent", cursor: "pointer" }}
                />
              ))}
              <div
                style={{
                  position: "absolute",
                  left: 12,
                  right: 12,
                  bottom: 12 + lift,
                  pointerEvents: "none",
                  display: "flex",
                  flexDirection: inline ? "row" : "column",
                  alignItems: inline ? "baseline" : "stretch",
                  justifyContent: "space-between",
                  gap: inline ? 10 : 2,
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: c.card,
                  width: "fit-content",
                  maxWidth: W - 24,
                }}
              >
                <span style={{ position: "relative", fontSize: fit.size, lineHeight: "20px", color: c.text, whiteSpace: "nowrap" }}>
                  <span style={{ visibility: "hidden" }}>{fit.text}</span>
                  <span style={{ position: "absolute", left: 0, top: 0 }}>{typed}</span>
                </span>
                {loreText ? <span style={{ fontSize: 11, lineHeight: "14px", color: c.secondaryText, textAlign: "right", whiteSpace: "nowrap" }}>{loreText}</span> : null}
              </div>
              <button
                aria-label="Laugh at this frame"
                onClick={() => dispatch({ t: "react", slide: idx })}
                style={{ position: "absolute", left: W - 52, top: H - 112, width: 44, height: 44, padding: 0, border: 0, background: "transparent", cursor: "pointer" }}
              >
                <svg width={44} height={44} viewBox="0 0 44 44" aria-hidden="true">
                  <circle cx={22} cy={22} r={18} fill={p.dark} fill-opacity={0.45} />
                  {mine?.slide === idx ? <circle cx={22} cy={22} r={18} fill="none" stroke={p.yellow} stroke-width={2} /> : null}
                  <circle cx={22} cy={22} r={11} fill={p.yellow} />
                  <path d="M15.5 17.5 19.5 19.5 15.5 21.5M28.5 17.5 24.5 19.5 28.5 21.5" fill="none" stroke={p.dark} stroke-width={1.6} stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M16.5 24.5H27.5Q26.5 31 22 31 17.5 31 16.5 24.5Z" fill={p.dark} />
                  {here > 0 ? (
                    <>
                      <circle cx={36} cy={36} r={8} fill={p.dark} />
                      <text x={36} y={39.5} text-anchor="middle" font-size={11} font-weight={600} fill={p.on}>{String(here)}</text>
                    </>
                  ) : null}
                </svg>
              </button>
            </>
          ) : null}
          {tail ? (
            <div
              style={{
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%)",
                top: H - 88,
                height: 36,
                lineHeight: "36px",
                padding: "0 16px",
                borderRadius: 18,
                background: c.toast,
                color: c.onToast,
                fontSize: 15,
                fontWeight: 600,
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}
            >
              {ageToast}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, height: 44, marginTop: 8, minWidth: 0 }}>
          <div style={{ flex: "none" }}>
            <Facepile users={state.watched.map((u) => asMember(u, members))} max={3} size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, lineHeight: "18px", fontWeight: 600, color: c.text, ...ellipsis }}>{line1}</div>
            <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText, ...ellipsis }}>{line2}</div>
          </div>
          <div style={{ position: "relative", flex: "none", width: 96 }}>
            {tail ? (
              <div style={{ position: "absolute", left: 0, right: 0, top: 0, pointerEvents: "none" }}>
                <Burst key={local.start} emoji="❤️" />
              </div>
            ) : null}
            <Button kind="primary" wide onClick={() => (live ? pause() : play())}>
              {live ? "Pause" : done ? "Replay" : "Play"}
            </Button>
          </div>
        </div>
      </div>
    );
  },
});
