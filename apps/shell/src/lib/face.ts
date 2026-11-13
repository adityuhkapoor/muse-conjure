// Drawn avatar faces, ported from the taste lab's `bust` (the design notes): a round
// cartoon head with shoulders on a tinted disc. Deterministic from the person's id: the cast has a
// fixed look, everyone else gets one from a hash. Returned as an SVG data URL, so it also works
// inside tool frames (their CSP allows `img-src data:`).
import { ACCENT, CHEEK, HAIR, INK, MOUTH, SKIN, WHITE, hash, mix } from "./art-palette";

export type Hair = "short" | "curly" | "long" | "bun" | "buzz" | "cap" | "swoop" | "bob";
export type Mood = "smile" | "grin";
export type Look = { skin: string; hair: string; style: Hair; shirt: string; cap?: string; mood: Mood };

const look = (skin: string, hair: string, style: Hair, shirt: string, mood: Mood = "smile", cap?: string): Look => ({ skin, hair, style, shirt, mood, cap });

/** The cast: fixed, recognisable and distinct (skin, hair style and shirt all differ). */
export const CAST: Record<string, Look> = {
  noa: look(SKIN[1], HAIR[4], "bob", ACCENT[5]),
  maya: look(SKIN[2], HAIR[0], "bun", ACCENT[6]),
  dev: look(SKIN[4], HAIR[0], "short", ACCENT[1], "grin"),
  jonah: look(SKIN[0], HAIR[3], "cap", ACCENT[3], "grin", ACCENT[0]),
  priya: look(SKIN[5], HAIR[1], "long", ACCENT[7]),
  theo: look(SKIN[0], HAIR[5], "curly", ACCENT[4]),
};
CAST.me = CAST.noa!;

const STYLES: Hair[] = ["short", "curly", "long", "bun", "buzz", "swoop", "bob", "cap", "short", "long"];

/** The look for a person: the cast by id (or by first name, for live ids), else from a hash of the id. */
export function lookFor(id: string, name = ""): Look {
  const cast = CAST[id] ?? CAST[name.trim().split(/\s+/)[0]?.toLowerCase() ?? ""];
  if (cast) return cast;
  const k = id || name;
  const pick = <T,>(xs: readonly T[], salt: string): T => xs[hash(`${salt}:${k}`) % xs.length]!;
  return look(pick(SKIN, "skin"), pick(HAIR, "hair"), pick(STYLES, "style"), pick(ACCENT, "shirt"), hash(`mood:${k}`) % 3 === 0 ? "grin" : "smile", pick(ACCENT, "cap"));
}

const f = (n: number) => Math.round(n * 10) / 10;
const circle = (x: number, y: number, r: number, fill: string, extra = "") => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const rect = (x: number, y: number, w: number, h: number, rx: number, fill: string) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(rx)}" fill="${fill}"/>`;
const poly = (pts: [number, number][], fill: string) => `<path d="M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}Z" fill="${fill}"/>`;
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });

/**
 * The face as SVG markup in a 100 x 100 box. `small` (drawn at 32 px or less) makes the head
 * bigger and the eyes and mouth heavier, so a 20 px face still reads.
 */
export function faceSvg(lk: Look, small = false): string {
  const r = small ? 31 : 27;
  const cx = 50;
  const cy = small ? 52 : 52;
  const out: string[] = [];
  const bg = mix(lk.shirt, WHITE, 0.62);
  out.push(circle(50, 50, 50, bg));
  // shoulders and neck
  out.push(rect(cx - 1.35 * r, cy + 1.75 * r - 0.8 * r, 2.7 * r, 1.6 * r, 0.8 * r, lk.shirt));
  out.push(rect(cx - 0.25 * r, cy + 0.7 * r, 0.5 * r, 0.5 * r, 0.12 * r, mix(lk.skin, "#000000", 0.12)));
  // hair behind the head
  if (lk.style === "long") out.push(rect(cx - 1.1 * r, cy - 0.45 * r, 2.2 * r, 1.65 * r, 0.55 * r, lk.hair));
  if (lk.style === "bob") out.push(rect(cx - 1.12 * r, cy - 0.5 * r, 2.24 * r, 1.25 * r, 0.5 * r, lk.hair));
  if (lk.style === "bun") out.push(circle(cx, cy - 1.05 * r, 0.42 * r, lk.hair));
  // ears and head
  out.push(circle(cx - 0.95 * r, cy + 0.08 * r, 0.2 * r, lk.skin), circle(cx + 0.95 * r, cy + 0.08 * r, 0.2 * r, lk.skin));
  out.push(circle(cx, cy, r, lk.skin));
  // hair on top
  const cap = (drop: number, scale: number): [number, number][] => [
    ...arc(cx, cy - 0.04 * r, r * scale, Math.PI - 0.12, 2 * Math.PI + 0.12, 20),
    [cx + 0.98 * r, cy - drop * r],
    [cx - 0.98 * r, cy - drop * r],
  ];
  switch (lk.style) {
    case "short":
    case "long":
    case "bun":
      out.push(poly(cap(0.32, 1.06), lk.hair));
      break;
    case "bob":
      out.push(poly(cap(0.22, 1.08), lk.hair));
      out.push(poly([[cx - 0.98 * r, cy - 0.3 * r], [cx + 0.1 * r, cy - 0.98 * r], [cx - 0.15 * r, cy - 0.2 * r]], lk.hair));
      break;
    case "buzz":
      out.push(poly(cap(0.62, 1.03), lk.hair));
      break;
    case "swoop":
      out.push(poly(cap(0.38, 1.06), lk.hair));
      out.push(poly([[cx - 0.9 * r, cy - 0.55 * r], [cx + 0.6 * r, cy - 1.25 * r], [cx + 0.3 * r, cy - 0.2 * r]], lk.hair));
      break;
    case "curly":
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + 0.05 + (i / 8) * (Math.PI - 0.1);
        out.push(circle(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92, r * 0.32, lk.hair));
      }
      break;
    case "cap": {
      const col = lk.cap ?? lk.shirt;
      const dark = mix(col, "#000000", 0.25);
      out.push(poly(cap(0.3, 1.07), col));
      out.push(rect(cx - 0.2 * r, cy - 0.42 * r, 1.5 * r, 0.26 * r, 0.13 * r, dark));
      out.push(circle(cx, cy - 1.02 * r, 0.1 * r, dark));
      break;
    }
  }
  // eyes, cheeks, mouth
  const ey = cy + 0.08 * r;
  const ex = 0.36 * r;
  const er = (small ? 0.14 : 0.11) * r;
  out.push(circle(cx - ex, ey, er, INK), circle(cx + ex, ey, er, INK));
  out.push(circle(cx - 0.58 * r, cy + 0.38 * r, 0.16 * r, CHEEK, ` fill-opacity="${small ? 0.45 : 0.35}"`), circle(cx + 0.58 * r, cy + 0.38 * r, 0.16 * r, CHEEK, ` fill-opacity="${small ? 0.45 : 0.35}"`));
  const my = cy + 0.45 * r;
  if (lk.mood === "grin") {
    const pts = arc(cx, my - 0.1 * r, 0.36 * r, 0, Math.PI, 12);
    out.push(poly(pts, MOUTH));
    out.push(rect(cx - 0.26 * r, my - 0.1 * r, 0.52 * r, 0.1 * r, 0.03 * r, WHITE));
  } else {
    const [a, b] = [arc(cx, my - 0.18 * r, 0.3 * r, 0.45, Math.PI - 0.45, 1)[0]!, arc(cx, my - 0.18 * r, 0.3 * r, 0.45, Math.PI - 0.45, 1)[1]!];
    out.push(`<path d="M${f(a[0])} ${f(a[1])}A${f(0.3 * r)} ${f(0.3 * r)} 0 0 1 ${f(b[0])} ${f(b[1])}" fill="none" stroke="${INK}" stroke-width="${f((small ? 0.11 : 0.08) * r)}" stroke-linecap="round"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><clipPath id="c"><circle cx="50" cy="50" r="50"/></clipPath><g clip-path="url(#c)">${out.join("")}</g></svg>`;
}

const cache = new Map<string, string>();
/** Data URL of a person's face for drawing at `px` CSS pixels. */
export function faceUrl(id: string, name = "", px = 40): string {
  const small = px <= 32;
  const key = `${id}|${name}|${small}`;
  let u = cache.get(key);
  if (!u) {
    u = "data:image/svg+xml," + encodeURIComponent(faceSvg(lookFor(id, name), small));
    cache.set(key, u);
  }
  return u;
}
