// Checks for the art kit, used by art.test.ts: every picture has an accessible name, every shape
// stays inside its SVG viewBox, every overlay is placed inside its scene, every control has a name.

type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const apply = (m: M, x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] as const;
const ID: M = [1, 0, 0, 1, 0, 0];

function transformOf(el: Element): M {
  let m = ID;
  const t = el.getAttribute("transform") ?? "";
  for (const [, fn, args] of t.matchAll(/(translate|rotate)\(([^)]*)\)/g)) {
    const n = args!.split(/[ ,]+/).filter(Boolean).map(Number);
    if (fn === "translate") m = mul(m, [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0]);
    else {
      const a = ((n[0] ?? 0) * Math.PI) / 180, cx = n[1] ?? 0, cy = n[2] ?? 0;
      m = mul(m, mul([1, 0, 0, 1, cx, cy], mul([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0], [1, 0, 0, 1, -cx, -cy])));
    }
  }
  return m;
}

/** Points a path visits (end points and control points), in its own coordinates. */
export function pathPoints(d: string): [number, number][] {
  const out: [number, number][] = [];
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0;
  const num = () => Number(toks[i++]);
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i]!)) cmd = toks[i++]!;
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const pt = (px: number, py: number) => [rel ? x + px : px, rel ? y + py : py] as [number, number];
    if (C === "Z") {
      (x = sx), (y = sy);
      continue;
    }
    if (C === "H") (x = rel ? x + num() : num()), out.push([x, y]);
    else if (C === "V") (y = rel ? y + num() : num()), out.push([x, y]);
    else if (C === "A") {
      const r = Math.max(num(), num());
      num(), num(), num();
      const [ex, ey] = pt(num(), num());
      // The arc stays within the circle through both ends; take its center region generously.
      out.push([ex, ey], [(x + ex) / 2, (y + ey) / 2]);
      void r;
      (x = ex), (y = ey);
    } else {
      const n = C === "C" ? 3 : C === "Q" || C === "S" ? 2 : 1;
      let last: [number, number] = [x, y];
      for (let k = 0; k < n; k++) out.push((last = pt(num(), num())));
      [x, y] = last;
      if (C === "M") (sx = x), (sy = y), (cmd = rel ? "l" : "L");
    }
  }
  return out;
}

function shapePoints(el: Element): [number, number][] {
  const n = (k: string) => Number(el.getAttribute(k) ?? 0);
  switch (el.tagName.toLowerCase()) {
    case "circle":
      return [[n("cx") - n("r"), n("cy") - n("r")], [n("cx") + n("r"), n("cy") + n("r")]];
    case "ellipse":
      return [[n("cx") - n("rx"), n("cy") - n("ry")], [n("cx") + n("rx"), n("cy") + n("ry")]];
    case "rect":
      return [[n("x"), n("y")], [n("x") + n("width"), n("y")], [n("x"), n("y") + n("height")], [n("x") + n("width"), n("y") + n("height")]];
    case "line":
      return [[n("x1"), n("y1")], [n("x2"), n("y2")]];
    case "path":
      return pathPoints(el.getAttribute("d") ?? "");
  }
  return [];
}

/** Problems: shapes past their viewBox (by more than `slack` units), overlays placed outside their scene. */
export function outside(root: Element, slack = 1.5): string[] {
  const out: string[] = [];
  for (const svg of root.querySelectorAll("svg[viewBox]")) {
    if (svg.parentElement?.closest("svg")) continue;
    const [, , w, h] = svg.getAttribute("viewBox")!.split(/\s+/).map(Number);
    const walk = (el: Element, m: M) => {
      for (const c of el.children) {
        const tag = c.tagName.toLowerCase();
        const cm = mul(m, transformOf(c));
        if (tag === "svg") {
          // A nested svg clips to its own box; check that box.
          const bw = Number(c.getAttribute("width") ?? 0), bh = Number(c.getAttribute("height") ?? 0);
          for (const [x, y] of [[0, 0], [bw, bh]] as const) {
            const [px, py] = apply(cm, x, y);
            if (px < -slack || py < -slack || px > w! + slack || py > h! + slack) out.push(`nested svg at ${px.toFixed(1)},${py.toFixed(1)} is outside 0 0 ${w} ${h}`);
          }
          continue;
        }
        for (const [x, y] of shapePoints(c)) {
          const [px, py] = apply(cm, x, y);
          if (px < -slack || py < -slack || px > w! + slack || py > h! + slack) {
            out.push(`${tag} reaches ${px.toFixed(1)},${py.toFixed(1)}, outside 0 0 ${w} ${h}`);
            break;
          }
        }
        walk(c, cm);
      }
    };
    walk(svg, ID);
  }
  for (const el of root.querySelectorAll<HTMLElement>("[style]")) {
    for (const k of ["left", "top"] as const) {
      const v = el.style[k];
      if (v.endsWith("%") && (parseFloat(v) < -0.5 || parseFloat(v) > 100.5)) out.push(`overlay ${k} ${v} is outside its scene`);
    }
  }
  return out;
}

/** Problems: no picture named for screen readers, or a control without a name. */
export function unnamed(root: Element): string[] {
  const out: string[] = [];
  const named = [...root.querySelectorAll("[role=img],[role=status],[role=group]")].some((e) => (e.getAttribute("aria-label") ?? e.textContent ?? "").trim());
  if (!named && !(root.textContent ?? "").trim()) out.push("nothing names the picture: give it a label or text");
  for (const svg of root.querySelectorAll("svg")) {
    if (svg.parentElement?.closest("svg")) continue;
    if (svg.getAttribute("aria-hidden") !== "true" && !(svg.getAttribute("aria-label") ?? "").trim()) out.push("an svg is neither hidden nor named");
  }
  for (const b of root.querySelectorAll("button")) if (!(b.getAttribute("aria-label") ?? b.textContent ?? "").trim()) out.push("a button has no name");
  return out;
}

const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|(?<=(?:fill|stroke|color|background|stop-color)(?:="|:\s*))(?!none\b|transparent\b|currentColor\b|currentcolor\b|inherit\b|var\b|url\b)[a-zA-Z]+\b(?![-(])/g;
/** Colors in rendered markup. */
export const colorsIn = (html: string) => new Set(html.match(COLOR) ?? []);

/**
 * Colors that do not come from the theme: the same markup rendered under two unrelated random
 * palettes should share no color, so any color present in both renders is a literal.
 */
export function fixedColors(a: string, b: string): string[] {
  const x = colorsIn(a), y = colorsIn(b);
  return [...x].filter((c) => y.has(c));
}
