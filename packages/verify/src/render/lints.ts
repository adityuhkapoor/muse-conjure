// Lints that run inside the app frame, beside the DOM layout lint in stages/render.ts. Each
// exported function is serialized by Playwright, so it may not use anything from outside its
// own body.
//
// - lintMore: text drawn on canvas (from the recorder) and SVG text, checked like DOM text
//   (clipped by the clip region, the canvas edge or the shape it sits in; overlapping; contrast
//   against the pixels under it; too small; painted over), labels that spin or shake on the host
//   clock, pluralisation, blank and emoji-only labels, controls covered by something else, and
//   controls whose visible label sits outside their hit box.
// - measure: data-shape facts for a state: how much of the card is filled, the largest blank
//   band, enabled and primary controls, decorations drawn without a subject.
// - frameCoupling: redraws each canvas at one fixed time before and after extra frames; output
//   that depends on how many frames ran is frame-coupled timing.

export type Box = { x: number; y: number; w: number; h: number };
export type MoreIssue = { rule: string; key: string; message: string; box?: Box; detail?: Record<string, unknown> };
export type Measure = {
  height: number;
  innerH: number;
  fill: number;
  band: number;
  bandBox: Box | null;
  enabled: number;
  primaries: number;
  disabledPrimaries: string[];
  orphans: { key: string; box: Box; what: string }[];
  rootBox: Box;
  /** Visible controls, enabled or not. */
  controls: number;
  /** The card says it is settled (a Locked bar, "Closed", "Final"): nothing left to do is expected. */
  finishedLook: boolean;
  hash: string;
};

export function lintMore(o: { checkCanvas: boolean; checkDom: boolean }): MoreIssue[] {
  const root = document.querySelector(".m-root") as HTMLElement | null;
  if (!root) return [];
  const out: MoreIssue[] = [];
  const cs = (el: Element) => getComputedStyle(el);
  const path = (el: Element): string => {
    const parts: string[] = [];
    for (let e: Element | null = el; e && e !== root; e = e.parentElement) {
      const i = e.parentElement ? [...e.parentElement.children].indexOf(e) : 0;
      parts.unshift(`${e.tagName.toLowerCase()}${e.classList[0] ? "." + e.classList[0] : ""}:${i}`);
    }
    return parts.join(">") || "root";
  };
  const boxOf = (r: { left: number; top: number; width: number; height: number }): Box => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
  const hidden = (el: Element) => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const s = cs(e);
      if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return true;
      if (e.getAttribute("aria-hidden") === "true") return true;
      if (e === root) break;
    }
    return false;
  };
  const parse = (c: string): number[] | null => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
      return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
    }
    const h = c.trim().match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (h) {
      const n = parseInt(h[1]!, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, h[2] ? parseInt(h[2], 16) / 255 : 1];
    }
    return null;
  };
  const lum = (c: number[]) => {
    const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!);
  };
  const over = (fg: number[], bg: number[]) => [0, 1, 2].map((i) => fg[i]! * fg[3]! + bg[i]! * (1 - fg[3]!)).concat(1);
  const ratioOf = (a: number[], b: number[]) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const background = (el: Element): number[] => {
    const layers: number[][] = [];
    for (let e: Element | null = el; e; e = e.parentElement) {
      const c = parse(cs(e).backgroundColor);
      if (c && c[3]! > 0) {
        layers.push(c);
        if (c[3]! >= 1) break;
      }
      if (e === document.documentElement) break;
    }
    let bg = [255, 255, 255, 1];
    if (!layers.length || layers[layers.length - 1]![3]! < 1) bg = document.documentElement.style.getPropertyValue("color-scheme") === "dark" ? [36, 37, 38, 1] : bg;
    for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i]!, bg);
    return bg;
  };
  type Pt = number[];
  const pip = (p: Pt, poly: Pt[]) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i]!, b = poly[j]!;
      if (a[1]! > p[1]! !== b[1]! > p[1]! && p[0]! < ((b[0]! - a[0]!) * (p[1]! - a[1]!)) / (b[1]! - a[1]! || 1e-9) + a[0]!) inside = !inside;
    }
    return inside;
  };
  const inPolys = (p: Pt, polys: Pt[][]) => polys.some((q) => q.length > 2 && pip(p, q));
  const area = (polys: Pt[][]) =>
    polys.reduce((s, q) => {
      let a = 0;
      for (let i = 0, j = q.length - 1; i < q.length; j = i++) a += (q[j]![0]! + q[i]![0]!) * (q[j]![1]! - q[i]![1]!);
      return s + Math.abs(a / 2);
    }, 0);
  const lerp = (a: Pt, b: Pt, t: number) => [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t];
  /** Points spread over a quadrilateral (corners 0..3 in order). */
  const samples = (q: Pt[], nx = 8, ny = 3) => {
    const pts: Pt[] = [];
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++) {
        const u = (i + 0.5) / nx, v = (j + 0.5) / ny;
        pts.push(lerp(lerp(q[0]!, q[1]!, u), lerp(q[3]!, q[2]!, u), v));
      }
    return pts;
  };
  /** The quadrilateral pulled `d` px toward its center (so edge-touching text is not flagged). */
  const shrink = (q: Pt[], d: number) => {
    const c = [(q[0]![0]! + q[2]![0]!) / 2, (q[0]![1]! + q[2]![1]!) / 2];
    return q.map((p) => {
      const dx = c[0]! - p[0]!, dy = c[1]! - p[1]!;
      const l = Math.hypot(dx, dy) || 1;
      const k = Math.min(d, l * 0.45) / l;
      return [p[0]! + dx * k, p[1]! + dy * k];
    });
  };
  const edges = (q: Pt[]) => [...q, lerp(q[0]!, q[1]!, 0.5), lerp(q[3]!, q[2]!, 0.5)];
  /** Room along the text's baseline through its center, inside the polygons. */
  const chord = (c: Pt, ang: number, polys: Pt[][]) => {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let lo = -Infinity, hi = Infinity;
    for (const q of polys)
      for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
        const a = q[j]!, b = q[i]!;
        const ex = b[0]! - a[0]!, ey = b[1]! - a[1]!;
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((a[0]! - c[0]!) * ey - (a[1]! - c[1]!) * ex) / den;
        const s = ((a[0]! - c[0]!) * dy - (a[1]! - c[1]!) * dx) / den;
        if (s < 0 || s > 1) continue;
        if (t > 0) hi = Math.min(hi, t);
        else lo = Math.max(lo, t);
      }
    return Number.isFinite(lo) && Number.isFinite(hi) ? hi - lo : 0;
  };
  const short = (s: string) => (s.length > 40 ? s.slice(0, 39) + "…" : s);

  if (o.checkCanvas) {
    const rec = (globalThis as any).__cvrec;
    const canvases = [...root.querySelectorAll("canvas")].filter((c) => !hidden(c));
    canvases.forEach((c, ci) => {
      const r = rec?.recs.find((x: any) => x.canvas === c);
      if (!r || !c.clientWidth || !c.width) return;
      const dpr = c.width / c.clientWidth;
      const cb = c.getBoundingClientRect();
      const toCss = (p: Pt) => [cb.left + p[0]! / dpr, cb.top + p[1]! / dpr];
      const qBox = (q: Pt[]): Box => {
        const xs = q.map((p) => toCss(p)[0]!), ys = q.map((p) => toCss(p)[1]!);
        return boxOf({ left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) });
      };
      const W = c.width, H = c.height;
      const ops: any[] = r.ops;
      const texts = ops.map((op, i) => ({ op, i })).filter((x) => x.op.k === "text");
      if (!texts.length && !r.hist.length) return;
      const bg = background(c);
      let data: Uint8ClampedArray | null = null;
      try {
        data = c.getContext("2d")!.getImageData(0, 0, W, H).data;
      } catch {}
      const pixel = (p: Pt): number[] | null => {
        const x = Math.floor(p[0]!), y = Math.floor(p[1]!);
        if (!data || x < 0 || y < 0 || x >= W || y >= H) return null;
        const k = (y * W + x) * 4;
        return over([data[k]!, data[k + 1]!, data[k + 2]!, data[k + 3]! / 255], bg);
      };
      // Did this label move in the last frames (a marquee, a slide)?
      const moved = (text: string) => {
        const seen = r.hist.slice(-8).flatMap((h: any) => h.items.filter((it: any) => it.text === text).map((it: any) => it.cx));
        return seen.length >= 2 && Math.max(...seen) - Math.min(...seen) > 2;
      };
      const where = (t: any) => `cv${ci}|${short(t.text)}`;
      const widthOf = (q: Pt[]) => Math.hypot(q[1]![0]! - q[0]![0]!, q[1]![1]! - q[0]![1]!);
      const clipped = new Set<any>();
      for (const { op: t, i } of texts) {
        const css = t.px / dpr;
        const tw = widthOf(t.box) / dpr;
        const box = qBox(t.box);
        // Too small.
        // Initials and one-character badges (avatar letters, "+2") may be smaller; words may not.
        const initials = t.text.replace(/\s/g, "").length <= 2 && css >= 6;
        if (!initials && (css < 8 || (css < 9.5 && /[A-Za-z]{4,}/.test(t.text))))
          out.push({ rule: "canvas-text-tiny", key: where(t), box, message: `canvas text "${short(t.text)}" is ${css.toFixed(1)} px; labels need 10 px or more`, detail: { text: t.text, px: Math.round(css * 10) / 10 } });
        // Clipped by the canvas edge or the clip region, unless it is a marquee.
        const q = shrink(t.box, dpr);
        // Text wholly outside the canvas or its clip draws nothing (a card scrolled out of a
        // carousel): there is nothing to read, so nothing to flag.
        const shows = (p: Pt) => p[0]! >= 0 && p[1]! >= 0 && p[0]! <= W && p[1]! <= H && (t.clips as Pt[][][]).every((cl) => inPolys(p, cl));
        if (!samples(q, 8, 3).some(shows)) continue;
        const outsideCanvas = edges(q).some((p) => p[0]! < 0 || p[1]! < 0 || p[0]! > W || p[1]! > H);
        const clipFail = (t.clips as Pt[][][]).find((cl) => edges(q).some((p) => !inPolys(p, cl)));
        const clipW = clipFail ? qBox(clipFail.flat() as Pt[]).w : cb.width;
        // A marquee or a label sliding into place: it moved in the last frames. Resting text is checked.
        const marquee = moved(t.text) && tw > 0.5 * clipW;
        if ((outsideCanvas || clipFail) && !marquee) {
          const room = clipFail ? chord(t.center, t.ang, clipFail) / dpr : chord(t.center, t.ang, [[[0, 0], [W, 0], [W, H], [0, H]]]) / dpr;
          out.push({
            rule: "canvas-text-clipped",
            key: where(t),
            box,
            message: `canvas text "${short(t.text)}" is cut off by ${clipFail ? "its clip region" : "the canvas edge"}: ${Math.round(tw)} px of text, ${Math.round(room)} px of room${Math.abs(t.ang) > 0.05 ? ` along its ${Math.round((t.ang * 180) / Math.PI)}° baseline` : ""}`,
            detail: { text: t.text, width: Math.round(tw), room: Math.round(room), angle: Math.round((t.ang * 180) / Math.PI), by: clipFail ? "clip" : "edge" },
          });
          clipped.add(t);
          continue;
        }
        // Text inside a shape the tool just drew must stay inside it.
        let shape: any = null;
        for (let j = i - 1; j >= 0; j--) {
          const f = ops[j];
          if (f.k === "fill" && f.polys && f.alpha > 0.5 && (inPolys(shrink([t.anchor, t.anchor, t.anchor, t.anchor], 0)[0]!, f.polys) || inPolys(t.center, f.polys))) {
            shape = f;
            break;
          }
        }
        if (shape && area(shape.polys) < 0.9 * W * H && !marquee) {
          const outPts = edges(q).filter((p) => !inPolys(p, shape.polys));
          if (outPts.length) {
            const room = chord(inPolys(t.center, shape.polys) ? t.center : t.anchor, t.ang, shape.polys) / dpr;
            out.push({
              rule: "canvas-text-clipped",
              key: where(t),
              box,
              message: `canvas text "${short(t.text)}" runs out of the shape it is drawn in: ${Math.round(tw)} px of text, ${Math.round(room)} px of room${Math.abs(t.ang) > 0.05 ? ` along its ${Math.round((t.ang * 180) / Math.PI)}° baseline` : ""}`,
              detail: { text: t.text, width: Math.round(tw), room: Math.round(room), angle: Math.round((t.ang * 180) / Math.PI), by: "shape" },
            });
            clipped.add(t);
            continue;
          }
        }
        // Painted over: an opaque shape drawn later covers part of the label.
        const tArea = (widthOf(t.box) * Math.hypot(t.box[3]![0]! - t.box[0]![0]!, t.box[3]![1]! - t.box[0]![1]!)) || 1;
        for (let j = i + 1; j < ops.length; j++) {
          const f = ops[j];
          if (f.k !== "fill" || !f.polys || f.alpha < 0.9) continue;
          const a = area(f.polys);
          // A badge or dot is smaller than the label; a neighbouring slice or a sheet is not.
          if (a > 2 * tArea) continue;
          // A strike-through or underline: a thin bar along the baseline that spans the label.
          const bx = t.box as Pt[], ul = Math.hypot(bx[1]![0]! - bx[0]![0]!, bx[1]![1]! - bx[0]![1]!) || 1, vl = Math.hypot(bx[3]![0]! - bx[0]![0]!, bx[3]![1]! - bx[0]![1]!) || 1;
          const ux = (bx[1]![0]! - bx[0]![0]!) / ul, uy = (bx[1]![1]! - bx[0]![1]!) / ul, vx = (bx[3]![0]! - bx[0]![0]!) / vl, vy = (bx[3]![1]! - bx[0]![1]!) / vl;
          const fp = (f.polys as Pt[][]).flat();
          const us = fp.map((p) => (p[0]! - bx[0]![0]!) * ux + (p[1]! - bx[0]![1]!) * uy), vs = fp.map((p) => (p[0]! - bx[0]![0]!) * vx + (p[1]! - bx[0]![1]!) * vy);
          if (Math.max(...vs) - Math.min(...vs) <= 0.3 * vl && Math.max(...us) - Math.min(...us) >= 0.6 * ul) continue;
          const pts = samples(shrink(t.box, dpr), 8, 3);
          const hit = pts.filter((p) => inPolys(p, f.polys)).length / pts.length;
          if (hit > 0.15) {
            clipped.add(t);
            out.push({ rule: "painted-over", key: where(t), box, message: `canvas text "${short(t.text)}" is painted over by a shape drawn after it (${Math.round(hit * 100)} in 100 of its box)`, detail: { text: t.text, covered: Math.round(hit * 100) / 100 } });
            break;
          }
        }
        // Contrast against what is under it in the finished frame.
        const fg = parse(t.style);
        if (fg && data && !clipped.has(t)) {
          const fg1 = [fg[0]!, fg[1]!, fg[2]!, fg[3]! * (t.alpha ?? 1)];
          const counts = new Map<string, { n: number; c: number[] }>();
          for (const p of samples(t.box, 12, 5)) {
            const px = pixel(p);
            if (!px) continue;
            if (Math.abs(px[0]! - fg[0]!) + Math.abs(px[1]! - fg[1]!) + Math.abs(px[2]! - fg[2]!) < 48) continue;
            const k = px.slice(0, 3).map((v) => v >> 4).join(",");
            const e = counts.get(k) ?? { n: 0, c: px };
            e.n++;
            counts.set(k, e);
          }
          const under = [...counts.values()].sort((a, b) => b.n - a.n)[0]?.c ?? bg;
          const ratio = ratioOf(over(fg1, under), under);
          const bold = /\b(bold|[6-9]00)\b/.test(t.weight);
          const need = css >= 24 || (css >= 18.66 && bold) ? 3 : 4.5;
          if (ratio < need - 0.005)
            out.push({
              rule: "canvas-text-contrast",
              key: where(t),
              box,
              message: `canvas text "${short(t.text)}" has contrast ${ratio.toFixed(2)}:1 against what is under it, under ${need}:1`,
              detail: { text: t.text, ratio: Math.round(ratio * 100) / 100, need, color: t.style, under: `rgb(${under.slice(0, 3).map(Math.round).join(", ")})` },
            });
        }
      }
      // Text over text.
      for (let a = 0; a < texts.length; a++)
        for (let b = a + 1; b < texts.length; b++) {
          const A = texts[a]!.op, B = texts[b]!.op;
          if (clipped.has(A) || clipped.has(B)) continue;
          if (A.text === B.text && Math.hypot(A.center[0] - B.center[0], A.center[1] - B.center[1]) < 4 * dpr) continue; // a shadow copy
          const badge = (t: any) => t.text.length <= 3 && widthOf(t.box) / dpr <= 28;
          if (badge(A) || badge(B)) continue;
          const [small, big] = widthOf(A.box) <= widthOf(B.box) ? [A, B] : [B, A];
          const pts = samples(shrink(small.box, dpr), 8, 3);
          const hit = pts.filter((p) => pip(p, shrink(big.box, dpr))).length / pts.length;
          if (hit > 0.25)
            out.push({ rule: "canvas-text-overlap", key: `cv${ci}|${short(A.text)}~${short(B.text)}`, box: qBox([...A.box, ...B.box]), message: `canvas texts "${short(A.text)}" and "${short(B.text)}" overlap`, detail: { a: A.text, b: B.text } });
        }
      // Labels that spin or shake, on the host clock.
      const frames = [...r.hist, { t: r.t, items: r.cur }].filter((f: any) => f.items.length);
      const fresh = frames.length && performance.now() - frames[frames.length - 1].t < 250;
      if (fresh) {
        const recent = frames.slice(-14);
        const names = new Set<string>(recent[recent.length - 1].items.map((x: any) => x.text));
        let omega = 0;
        for (const name of names) {
          const tr: any[] = recent.map((f: any) => ({ t: f.t, it: f.items.find((x: any) => x.text === name) })).filter((x: any) => x.it);
          if (tr.length < 5) continue;
          const ws: number[] = [];
          const vs: number[][] = [];
          for (let k = 1; k < tr.length; k++) {
            const dt = (tr[k].t - tr[k - 1].t) / 1000;
            if (dt <= 0) continue;
            let d = tr[k].it.ang - tr[k - 1].it.ang;
            // Labels flip by half a turn to stay upright; that is not motion.
            while (d > Math.PI / 2) d -= Math.PI;
            while (d < -Math.PI / 2) d += Math.PI;
            ws.push(Math.abs(d) / dt / (2 * Math.PI));
            vs.push([((tr[k].it.cx - tr[k - 1].it.cx) / dpr) * (0.0167 / dt), ((tr[k].it.cy - tr[k - 1].it.cy) / dpr) * (0.0167 / dt)]);
          }
          ws.sort((x, y) => x - y);
          const med = ws[Math.floor(ws.length / 2)] ?? 0;
          omega = Math.max(omega, med);
          // Jitter: the label reverses direction on most frames while moving.
          let rev = 0, moving = 0;
          for (let k = 1; k < vs.length; k++) {
            const a = vs[k - 1]!, b = vs[k]!;
            if (Math.hypot(a[0]!, a[1]!) > 0.6 && Math.hypot(b[0]!, b[1]!) > 0.6) {
              moving++;
              if (a[0]! * b[0]! + a[1]! * b[1]! < 0) rev++;
            }
          }
          if (moving >= 6 && rev / moving > 0.5)
            out.push({ rule: "jitter", key: `cv${ci}|${short(name)}`, box: qBox([[0, 0], [W, 0], [W, H], [0, H]]), message: `canvas label "${short(name)}" shakes back and forth on ${rev} of ${moving} frames while nothing changes`, detail: { text: name, reversals: rev, frames: moving } });
        }
        if (omega > 2)
          out.push({ rule: "runaway-spin", key: `cv${ci}`, box: qBox([[0, 0], [W, 0], [W, H], [0, H]]), message: `the canvas turns at ${omega.toFixed(1)} turns per second`, detail: { omega: Math.round(omega * 100) / 100 } });
      }
    });

    // SVG text: the same checks, with shapes and transforms from the SVG DOM.
    const svgTexts = [...root.querySelectorAll("svg text")].filter((t) => !hidden(t) && (t.textContent ?? "").trim()) as SVGTextElement[];
    svgTexts.forEach((t) => {
      const svg = t.ownerSVGElement;
      const m = t.getScreenCTM();
      if (!svg || !m) return;
      let bb: DOMRect;
      try {
        bb = t.getBBox();
      } catch {
        return;
      }
      const P = (x: number, y: number) => {
        const p = new DOMPoint(x, y).matrixTransform(m);
        return [p.x, p.y];
      };
      const q = [P(bb.x, bb.y), P(bb.x + bb.width, bb.y), P(bb.x + bb.width, bb.y + bb.height), P(bb.x, bb.y + bb.height)];
      const text = (t.textContent ?? "").trim();
      const key = `svg|${path(t)}`;
      const xs = q.map((p) => p[0]!), ys = q.map((p) => p[1]!);
      const box = boxOf({ left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) });
      const ang = Math.atan2(m.b, m.a);
      const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
      const px = parseFloat(cs(t).fontSize) * scale;
      const tw = Math.hypot(q[1]![0]! - q[0]![0]!, q[1]![1]! - q[0]![1]!);
      if (px < 8 || (px < 9.5 && /[A-Za-z]{4,}/.test(text)))
        out.push({ rule: "canvas-text-tiny", key, box, message: `SVG text "${short(text)}" is ${px.toFixed(1)} px; labels need 10 px or more`, detail: { text, px, surface: "svg" } });
      const sr = svg.getBoundingClientRect();
      const qi = shrink(q, 1);
      if (edges(qi).some((p) => p[0]! < sr.left || p[0]! > sr.right || p[1]! < sr.top || p[1]! > sr.bottom)) {
        out.push({ rule: "canvas-text-clipped", key, box, message: `SVG text "${short(text)}" runs past the edge of its SVG`, detail: { text, width: Math.round(tw), surface: "svg", by: "edge" } });
        return;
      }
      // The last shape before the text (document order) whose fill holds the text's center.
      const shapes = [...svg.querySelectorAll("rect,circle,ellipse,path,polygon")] as SVGGeometryElement[];
      const c = [(q[0]![0]! + q[2]![0]!) / 2, (q[0]![1]! + q[2]![1]!) / 2];
      const inShape = (s: SVGGeometryElement, p: Pt) => {
        const sm = s.getScreenCTM();
        if (!sm) return false;
        const lp = new DOMPoint(p[0], p[1]).matrixTransform(sm.inverse());
        try {
          return s.isPointInFill(lp);
        } catch {
          return false;
        }
      };
      let shape: SVGGeometryElement | null = null;
      for (const s of shapes) {
        if (!(s.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
        if (cs(s).fill === "none" || hidden(s)) continue;
        if (inShape(s, c)) shape = s;
      }
      const sb = svg.getBoundingClientRect();
      if (shape) {
        const r = shape.getBoundingClientRect();
        const big = r.width * r.height >= 0.9 * sb.width * sb.height;
        if (!big && edges(qi).some((p) => !inShape(shape!, p))) {
          out.push({
            rule: "canvas-text-clipped",
            key,
            box,
            message: `SVG text "${short(text)}" runs out of the ${shape.tagName} it is drawn in: ${Math.round(tw)} px of text in a ${Math.round(Math.abs(ang) > 0.7 ? r.height : r.width)} px shape`,
            detail: { text, width: Math.round(tw), room: Math.round(Math.abs(ang) > 0.7 ? r.height : r.width), surface: "svg", by: "shape" },
          });
          return;
        }
      }
      const fg = parse(cs(t).fill);
      const under = shape ? parse(cs(shape).fill) : null;
      if (fg) {
        const bg = under && under[3]! >= 1 ? under : background(svg);
        const ratio = ratioOf(over(fg, bg), bg);
        const need = px >= 24 || (px >= 18.66 && Number(cs(t).fontWeight) >= 700) ? 3 : 4.5;
        if (ratio < need - 0.005)
          out.push({ rule: "canvas-text-contrast", key, box, message: `SVG text "${short(text)}" has contrast ${ratio.toFixed(2)}:1, under ${need}:1`, detail: { text, ratio: Math.round(ratio * 100) / 100, need, surface: "svg" } });
      }
    });
  }

  if (o.checkDom) {
    // Pluralisation: "1 votes", "3 people is".
    const OK_S = new Set("yes bus gas plus pass class glass boss miss news series species kudos chaos bonus campus status canvas alias atlas iris lens means this his its was is has does goes us as chess dress less across always perhaps thanks minus virus focus bias process address access success business".split(" "));
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const seenPlural = new Set<Element>();
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      const el = n.parentElement;
      if (!el || hidden(el) || seenPlural.has(el)) continue;
      const text = (el.textContent ?? "").replace(/\s+/g, " ");
      // "Round 1 winners", "Table 1 seats": a number used as a name, not a count.
      const ORD = "(?<!\\b(?:round|day|week|game|level|step|no\\.?|table|seat|room|section|row|page|chapter|part|phase|stage|act|season|episode|pick|car|team|group|heat|lane|court|gate|floor|unit|track|question|q|player|week|slot|tier|box|batch|wave|turn|leg|lap|set|hole|match)\\s)";
      const one = text.match(new RegExp(`(?<![\\d.,$€£#])${ORD}\\b1 ([a-z]{3,}s)\\b`, "i"));
      const many = text.match(/(?<![\d.,])\b(0|[2-9]|[1-9]\d+) ([a-z]+s|people) (is|was|has)\b/i);
      const irregular = text.match(/(?<![\d.,])\b1 (people|children|men|women)\b/i);
      const bad = (one && !OK_S.has(one[1]!.toLowerCase()) && !/(ss|us|is|ous)$/i.test(one[1]!) ? one[0] : null) ?? many?.[0] ?? irregular?.[0];
      if (bad) {
        seenPlural.add(el);
        out.push({ rule: "bad-plural", key: path(el), box: boxOf(el.getBoundingClientRect()), message: `"${short(text.trim())}" says "${bad}"; use the singular for 1 and the plural otherwise`, detail: { text: text.trim(), phrase: bad } });
      }
    }
    // Tiny DOM text: under 8 px, or under 9.5 px for words (avatar initials and short numbers are fine).
    const tinySeen = new Set<Element>();
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode() as Text | null; n; n = tw.nextNode() as Text | null) {
      const el = n.parentElement;
      const text = n.data.trim();
      if (!el || !text || tinySeen.has(el) || hidden(el) || el.closest("svg")) continue;
      const px = parseFloat(cs(el).fontSize);
      // Avatar initials and one- or two-character badges may be smaller; words may not.
      const initials = text.replace(/\s/g, "").length <= 2 && px >= 6 && !!el.closest(".m-av, [class*=badge], [aria-hidden=true]");
      if (!initials && (px < 8 || (px < 9.5 && /[A-Za-z]{4,}/.test(text)))) {
        tinySeen.add(el);
        out.push({ rule: "tiny-text", key: path(el), box: boxOf(el.getBoundingClientRect()), message: `"${short(text)}" is ${px} px; text needs 10 px or more`, detail: { text, px } });
      }
    }
    // Blank or emoji-only labels where a word is expected.
    const strip = (s: string) => s.replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}️‍\s\p{P}]/gu, "");
    for (const el of root.querySelectorAll(".m-ch b, .m-opt b, h1, h2, h3, h4, button, label, [role=button]")) {
      if (hidden(el)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (el.getAttribute("aria-label")?.trim() || el.getAttribute("title")?.trim() || el.getAttribute("aria-labelledby")) continue;
      if (el.querySelector("svg,img,canvas,.m-av,.m-fp,input")) continue;
      const text = (el as HTMLElement).innerText ?? "";
      if (!strip(text)) out.push({ rule: "blank-label", key: path(el), box: boxOf(r), message: text.trim() ? `the ${el.tagName.toLowerCase()} label "${text.trim()}" is only emoji; give it words` : `a ${el.tagName.toLowerCase()} shows no label`, detail: { text: text.trim() } });
    }
    // Controls covered by something else, and labels outside their hit box.
    const controls = [...root.querySelectorAll("button,a[href],input:not([type=hidden]),select,textarea,[role=button]")].filter(
      (el) => !hidden(el) && !(el as HTMLButtonElement).disabled && el.getAttribute("aria-disabled") !== "true",
    ) as HTMLElement[];
    const animated = (el: Element | null) => {
      for (let e = el; e && e !== root; e = e.parentElement) if (e.getAnimations?.().length || e.classList.contains("m-toast")) return true;
      return false;
    };
    for (const el of controls) {
      const b = el.getBoundingClientRect();
      if (b.width < 4 || b.height < 4) continue;
      const pts = [
        [b.left + b.width / 2, b.top + b.height / 2],
        [b.left + b.width * 0.25, b.top + b.height / 2],
        [b.left + b.width * 0.75, b.top + b.height / 2],
      ];
      let covered = 0;
      let by: Element | null = null;
      for (const [x, y] of pts) {
        if (x! < 0 || y! < 0 || x! > innerWidth || y! > innerHeight) continue;
        const top = document.elementFromPoint(x!, y!);
        if (top && !el.contains(top) && !top.contains(el) && !animated(top)) {
          covered++;
          by = top;
        }
      }
      if (covered >= 2 && by)
        out.push({ rule: "overlay-covers-control", key: path(el), box: boxOf(b), message: `the ${el.tagName.toLowerCase()} "${short((el.innerText || el.getAttribute("aria-label") || "").trim())}" is covered by a ${by.tagName.toLowerCase()}${by.classList[0] ? "." + by.classList[0] : ""} that stays on top of it`, detail: { by: path(by) } });
      // The label people see should be inside the area that takes the tap.
      // Text rects, cut to the boxes that clip them: an ellipsized label's range runs past its box.
      const rects: { left: number; top: number; right: number; bottom: number; width: number; height: number }[] = [];
      const tw2 = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = tw2.nextNode() as Text | null; n; n = tw2.nextNode() as Text | null) {
        if (!n.data.trim() || !n.parentElement) continue;
        let clip = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
        for (let e: Element | null = n.parentElement; e && e !== el; e = e.parentElement) {
          if (cs(e).overflowX === "visible" && cs(e).overflowY === "visible") continue;
          const r = e.getBoundingClientRect();
          clip = { left: Math.max(clip.left, r.left), top: Math.max(clip.top, r.top), right: Math.min(clip.right, r.right), bottom: Math.min(clip.bottom, r.bottom) };
        }
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) {
          const left = Math.max(r.left, clip.left), right = Math.min(r.right, clip.right), top = Math.max(r.top, clip.top), bottom = Math.min(r.bottom, clip.bottom);
          if (right - left > 1 && bottom - top > 1) rects.push({ left, top, right, bottom, width: right - left, height: bottom - top });
        }
      }
      const total = rects.reduce((s, r) => s + r.width * r.height, 0);
      if (total > 0) {
        const pad = 4;
        const inside = rects.reduce((s, r) => {
          const w = Math.max(0, Math.min(r.right, b.right + pad) - Math.max(r.left, b.left - pad));
          const h = Math.max(0, Math.min(r.bottom, b.bottom + pad) - Math.max(r.top, b.top - pad));
          return s + w * h;
        }, 0);
        if (inside / total < 0.7)
          out.push({ rule: "hit-misaligned", key: path(el), box: boxOf(b), message: `the label of a ${el.tagName.toLowerCase()} is drawn ${Math.round((1 - inside / total) * 100)} in 100 outside the area that takes the tap`, detail: {} });
      }
    }
  }
  return out;
}

/** Data-shape facts about the card as it is now. */
export function measure(): Measure | null {
  const root = document.querySelector(".m-root") as HTMLElement | null;
  if (!root) return null;
  const cs = (el: Element) => getComputedStyle(el);
  const hidden = (el: Element) => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const s = cs(e);
      if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return true;
      if (e === root) break;
    }
    return false;
  };
  const R = root.getBoundingClientRect();
  const rs = cs(root);
  const L = R.left + parseFloat(rs.paddingLeft), T = R.top + parseFloat(rs.paddingTop);
  const W = R.width - parseFloat(rs.paddingLeft) - parseFloat(rs.paddingRight);
  const H = R.height - parseFloat(rs.paddingTop) - parseFloat(rs.paddingBottom);
  const CELL = 8;
  const nx = Math.max(1, Math.ceil(W / CELL)), ny = Math.max(1, Math.ceil(H / CELL));
  const grid = new Uint8Array(nx * ny);
  const mark = (r: { left: number; top: number; right: number; bottom: number }) => {
    const x0 = Math.max(0, Math.floor((r.left - L) / CELL)), x1 = Math.min(nx - 1, Math.floor((r.right - L - 0.01) / CELL));
    const y0 = Math.max(0, Math.floor((r.top - T) / CELL)), y1 = Math.min(ny - 1, Math.floor((r.bottom - T - 0.01) / CELL));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y * nx + x] = 1;
  };
  const card = cs(root).backgroundColor;
  const orphans: Measure["orphans"] = [];
  const hashParts: string[] = [root.innerHTML.length.toString(36)];
  // Text.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (!n.data.trim() || !n.parentElement || hidden(n.parentElement)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) mark(r);
  }
  // Boxes with their own paint, controls, pictures.
  for (const el of root.querySelectorAll("*")) {
    if (hidden(el)) continue;
    const s = cs(el);
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const bg = s.backgroundColor;
    const painted = (bg && !/rgba?\([^)]*,\s*0\)$/.test(bg) && bg !== "transparent" && bg !== card) || parseFloat(s.borderTopWidth) > 0 || parseFloat(s.borderBottomWidth) > 0 || s.backgroundImage !== "none";
    if (painted || /^(INPUT|BUTTON|SELECT|TEXTAREA|IMG)$/.test(el.tagName)) mark(r);
    if (el.tagName === "svg") {
      const shapes = [...el.querySelectorAll("rect,circle,ellipse,path,polygon,line,polyline,text")].filter((x) => !hidden(x));
      let a = 0;
      for (const sh of shapes) {
        const b = sh.getBoundingClientRect();
        mark(b);
        a += b.width * b.height;
      }
      if (r.width * r.height > 120 * 60 && a > 0 && a < 0.03 * r.width * r.height && !el.querySelector("text"))
        orphans.push({ key: "svg", box: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }, what: "an SVG that draws only a small mark" });
    }
  }
  // Canvas pixels.
  const rec = (globalThis as any).__cvrec;
  [...root.querySelectorAll("canvas")].forEach((c, ci) => {
    if (hidden(c) || !c.width || !c.height || !c.clientWidth) return;
    const cb = c.getBoundingClientRect();
    let d: Uint8ClampedArray;
    try {
      d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    } catch {
      return;
    }
    const sx = c.width / cb.width, sy = c.height / cb.height;
    let drawn = 0, total = 0;
    let h = 0;
    for (let y = cb.top; y < cb.bottom; y += 4)
      for (let x = cb.left; x < cb.right; x += 4) {
        const px = Math.floor((x - cb.left) * sx), py = Math.floor((y - cb.top) * sy);
        const k = (py * c.width + px) * 4;
        total++;
        if (d[k + 3]! > 16) {
          drawn++;
          h = (h * 31 + d[k]! + d[k + 1]! * 7 + d[k + 2]! * 13) >>> 0;
          mark({ left: x, top: y, right: x + 4, bottom: y + 4 });
        }
      }
    hashParts.push(`c${ci}:${h.toString(36)}`);
    const r = rec?.recs.find((x: any) => x.canvas === c);
    const texts = r ? r.ops.filter((o: any) => o.k === "text").length : 0;
    const frac = total ? drawn / total : 0;
    if (cb.width * cb.height > 120 * 60 && frac > 0 && frac < 0.03 && !texts)
      orphans.push({ key: `cv${ci}`, box: { x: Math.round(cb.left), y: Math.round(cb.top), w: Math.round(cb.width), h: Math.round(cb.height) }, what: `a ${Math.round(cb.width)}x${Math.round(cb.height)} canvas that draws only a small mark (${Math.round(frac * 1000) / 10} in 100 of its area) and no label` });
  });
  // Largest band of empty rows.
  let band = 0, run = 0, bandEnd = -1;
  for (let y = 0; y < ny; y++) {
    let empty = true;
    for (let x = 0; x < nx; x++) if (grid[y * nx + x]) {
      empty = false;
      break;
    }
    run = empty ? run + 1 : 0;
    if (run > band) (band = run), (bandEnd = y);
  }
  const filled = grid.reduce((s, v) => s + v, 0) / grid.length;
  const controls = [...root.querySelectorAll("button,a[href],input:not([type=hidden]),select,textarea,[role=button]")].filter((el) => !hidden(el));
  const enabled = controls.filter((el) => !(el as HTMLButtonElement).disabled && el.getAttribute("aria-disabled") !== "true").length;
  const prim = [...root.querySelectorAll(".m-btn.p")].filter((el) => !hidden(el));
  hashParts.push(root.innerHTML);
  let hh = 0;
  const all = hashParts.join("|");
  for (let i = 0; i < all.length; i++) hh = (hh * 31 + all.charCodeAt(i)) >>> 0;
  return {
    height: Math.round(R.height),
    innerH: Math.round(H),
    fill: Math.round(filled * 100) / 100,
    band: band * CELL,
    bandBox: band ? { x: Math.round(L), y: Math.round(T + (bandEnd - band + 1) * CELL), w: Math.round(W), h: band * CELL } : null,
    enabled,
    primaries: prim.length,
    disabledPrimaries: prim.filter((el) => (el as HTMLButtonElement).disabled).map((el) => (el as HTMLElement).innerText.trim()),
    orphans,
    controls: controls.length,
    finishedLook: [...root.querySelectorAll("[role=status]")].some((el) => !hidden(el)) || /\b(locked|closed|final|finished|picked|settled|all set|complete|it's a plan|ended)\b/i.test(root.innerText),
    rootBox: { x: Math.round(R.left), y: Math.round(R.top), w: Math.round(R.width), h: Math.round(R.height) },
    hash: `${hh.toString(36)}:${all.length}`,
  };
}

/**
 * Redraw each canvas at one fixed time, then again after 30 more frames at later times, then at
 * the first time again. A draw that depends only on its arguments gives the same text and shapes;
 * one that keeps its own counters (angle += 0.1 per frame) does not.
 */
export function frameCoupling(): MoreIssue[] {
  const root = document.querySelector(".m-root");
  if (!root) return [];
  const out: MoreIssue[] = [];
  [...root.querySelectorAll("canvas")].forEach((c: any, ci) => {
    const fn = c.__draw, f = c.__frameArgs;
    if (typeof fn !== "function" || !f) return;
    const off = document.createElement("canvas");
    off.width = c.width;
    off.height = c.height;
    const g = off.getContext("2d") as any;
    if (!g) return;
    const dpr = c.width / (c.clientWidth || c.width);
    const snap = (now: number) => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, f.width, f.height);
      try {
        fn(g, { ...f, now });
      } catch {
        return "throws";
      }
      const r = g.__r;
      if (!r) return "";
      return r.ops
        .map((o: any) => (o.k === "text" ? `t:${o.text}@${Math.round(o.center[0])},${Math.round(o.center[1])},${Math.round(o.ang * 100)}` : o.k === "fill" && o.polys ? `f:${o.polys.map((p: any) => p.map((q: number[]) => q.map(Math.round).join(",")).join(";")).join("|")}` : o.k))
        .join("\n");
    };
    const t0 = f.now;
    const a = snap(t0);
    for (let i = 1; i <= 30; i++) snap(t0 + i * 16);
    const b = snap(t0);
    if (a !== b && a !== "throws")
      out.push({
        rule: "frame-coupled-timing",
        key: `cv${ci}`,
        box: (() => {
          const r = c.getBoundingClientRect();
          return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
        })(),
        message: "the canvas draws something different for the same time after more frames ran: motion depends on the frame rate, not on `now`",
        detail: {},
      });
  });
  return out;
}
