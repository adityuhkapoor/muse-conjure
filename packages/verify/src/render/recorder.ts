// Canvas recorder, installed in every frame of the render page before the app runtime loads
// (Playwright init script, so the frame's CSP does not apply). It wraps the 2D context to keep,
// per canvas, what the last drawn frame did: every text draw with its transformed box (a rotated
// quadrilateral in device pixels), the clip region in force, the fill color, and every filled
// shape as a polygon. A full-canvas clearRect starts a new frame (the runtime clears before each
// draw). It also keeps a short history of where each label was, on the host clock, for spin and
// jitter checks, and remembers each canvas's draw function and last frame arguments so the gate
// can redraw at a fixed time (frame-coupled timing).
//
// Everything is wrapped so that the recorder never throws into the app; the original method
// always runs first.

export function installRecorder(): void {
  const g = globalThis as any;
  if (g.__cvrec || typeof g.CanvasRenderingContext2D === "undefined") return;
  const P = g.CanvasRenderingContext2D.prototype;
  const O: Record<string, any> = {};
  const names = [
    "fillText", "strokeText", "beginPath", "moveTo", "lineTo", "arc", "arcTo", "ellipse", "rect", "roundRect",
    "quadraticCurveTo", "bezierCurveTo", "closePath", "fill", "fillRect", "clearRect", "clip", "save", "restore", "strokeRect", "stroke",
  ];
  for (const k of names) O[k] = P[k];
  const getT = P.getTransform;
  const all: any[] = [];
  const store = { recs: all, installed: true };
  g.__cvrec = store;
  const MAXOPS = 3000;

  const R = (ctx: any) => {
    let r = ctx.__r;
    if (!r) {
      r = { ctx, canvas: ctx.canvas, ops: [], path: [], sub: null, clips: [], stack: [], frame: 0, hist: [], cur: [], t: 0 };
      try {
        Object.defineProperty(ctx, "__r", { value: r, enumerable: false });
      } catch {
        return null;
      }
      all.push(r);
      if (all.length > 200) all.splice(0, all.length - 200);
    }
    return r;
  };
  const M = (ctx: any) => {
    const m = getT.call(ctx);
    return [m.a, m.b, m.c, m.d, m.e, m.f];
  };
  const T = (m: number[], x: number, y: number) => [m[0]! * x + m[2]! * y + m[4]!, m[1]! * x + m[3]! * y + m[5]!];
  const pt = (r: any, ctx: any, x: number, y: number) => {
    const p = T(M(ctx), x, y);
    if (!r.sub) {
      r.sub = [p];
      r.path.push(r.sub);
    } else r.sub.push(p);
    return p;
  };
  const wrap = (k: string, after: (r: any, ctx: any, a: any[]) => void) => {
    const orig = O[k];
    if (typeof orig !== "function") return;
    P[k] = function (this: any, ...a: any[]) {
      const out = orig.apply(this, a);
      try {
        const r = R(this);
        if (r) after(r, this, a);
      } catch {}
      return out;
    };
  };
  const arcPts = (r: any, ctx: any, cx: number, cy: number, rx: number, ry: number, rot: number, s: number, e: number, ccw: boolean) => {
    const TAU = Math.PI * 2;
    if (!ccw) {
      if (e - s >= TAU) e = s + TAU;
      else while (e < s) e += TAU;
    } else {
      if (s - e >= TAU) e = s - TAU;
      else while (e > s) e -= TAU;
    }
    const n = Math.max(2, Math.min(64, Math.ceil(Math.abs(e - s) / (Math.PI / 24))));
    const cr = Math.cos(rot), sr = Math.sin(rot);
    for (let i = 0; i <= n; i++) {
      const t = s + ((e - s) * i) / n;
      const x = rx * Math.cos(t), y = ry * Math.sin(t);
      pt(r, ctx, cx + x * cr - y * sr, cy + x * sr + y * cr);
    }
  };
  const newFrame = (r: any) => {
    // Keep where each label was in the frame that just ended, on the host clock.
    if (r.cur.length || r.ops.length) {
      r.hist.push({ t: r.t, items: r.cur });
      if (r.hist.length > 90) r.hist.splice(0, r.hist.length - 90);
    }
    r.ops = [];
    r.cur = [];
    r.frame++;
    r.t = performance.now();
  };
  const copyPath = (path: any[]) => path.filter((s: any) => s.length > 1).map((s: any) => s.slice());

  wrap("beginPath", (r) => {
    r.path = [];
    r.sub = null;
  });
  wrap("moveTo", (r, ctx, a) => {
    r.sub = null;
    pt(r, ctx, a[0], a[1]);
  });
  wrap("lineTo", (r, ctx, a) => void pt(r, ctx, a[0], a[1]));
  wrap("arc", (r, ctx, a) => arcPts(r, ctx, a[0], a[1], a[2], a[2], 0, a[3], a[4], !!a[5]));
  wrap("ellipse", (r, ctx, a) => arcPts(r, ctx, a[0], a[1], a[2], a[3], a[4], a[5], a[6], !!a[7]));
  wrap("arcTo", (r, ctx, a) => {
    pt(r, ctx, a[0], a[1]);
    pt(r, ctx, a[2], a[3]);
  });
  const rectSub = (r: any, ctx: any, x: number, y: number, w: number, h: number) => {
    r.sub = null;
    pt(r, ctx, x, y);
    pt(r, ctx, x + w, y);
    pt(r, ctx, x + w, y + h);
    pt(r, ctx, x, y + h);
    r.sub.closed = true;
    r.sub = null;
  };
  wrap("rect", (r, ctx, a) => rectSub(r, ctx, a[0], a[1], a[2], a[3]));
  wrap("roundRect", (r, ctx, a) => rectSub(r, ctx, a[0], a[1], a[2], a[3]));
  wrap("quadraticCurveTo", (r, ctx, a) => {
    const p0 = r.sub?.[r.sub.length - 1];
    const m = M(ctx);
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      if (!p0) {
        pt(r, ctx, a[2], a[3]);
        break;
      }
      const c = T(m, a[0], a[1]), e = T(m, a[2], a[3]);
      const x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0]! + t * t * e[0]!;
      const y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1]! + t * t * e[1]!;
      r.sub.push([x, y]);
    }
  });
  wrap("bezierCurveTo", (r, ctx, a) => {
    const p0 = r.sub?.[r.sub.length - 1];
    const m = M(ctx);
    if (!p0) return void pt(r, ctx, a[4], a[5]);
    const c1 = T(m, a[0], a[1]), c2 = T(m, a[2], a[3]), e = T(m, a[4], a[5]);
    for (let i = 1; i <= 10; i++) {
      const t = i / 10, u = 1 - t;
      r.sub.push([
        u ** 3 * p0[0] + 3 * u * u * t * c1[0]! + 3 * u * t * t * c2[0]! + t ** 3 * e[0]!,
        u ** 3 * p0[1] + 3 * u * u * t * c1[1]! + 3 * u * t * t * c2[1]! + t ** 3 * e[1]!,
      ]);
    }
  });
  wrap("closePath", (r) => {
    if (r.sub) {
      r.sub.closed = true;
      const first = r.sub[0];
      r.sub = first ? [first.slice()] : null;
      if (r.sub) r.path.push(r.sub);
    }
  });
  const pushOp = (r: any, op: any) => {
    if (r.ops.length < MAXOPS) r.ops.push(op);
  };
  wrap("fill", (r, ctx, a) => {
    const viaPath = a[0] && typeof a[0] === "object";
    pushOp(r, { k: "fill", polys: viaPath ? null : copyPath(r.path), style: String(ctx.fillStyle), alpha: ctx.globalAlpha, clips: r.clips.slice() });
  });
  wrap("stroke", (r, ctx) => {
    pushOp(r, { k: "stroke", polys: copyPath(r.path), style: String(ctx.strokeStyle), lw: ctx.lineWidth, alpha: ctx.globalAlpha });
  });
  wrap("fillRect", (r, ctx, a) => {
    const m = M(ctx);
    const [x, y, w, h] = a;
    pushOp(r, { k: "fill", polys: [[T(m, x, y), T(m, x + w, y), T(m, x + w, y + h), T(m, x, y + h)]], style: String(ctx.fillStyle), alpha: ctx.globalAlpha, clips: r.clips.slice() });
  });
  wrap("clearRect", (r, ctx, a) => {
    const m = M(ctx);
    const p0 = T(m, a[0], a[1]), p1 = T(m, a[0] + a[2], a[1] + a[3]);
    const c = r.canvas;
    if (c && Math.min(p0[0]!, p1[0]!) <= 0.5 && Math.min(p0[1]!, p1[1]!) <= 0.5 && Math.max(p0[0]!, p1[0]!) >= c.width - 0.5 && Math.max(p0[1]!, p1[1]!) >= c.height - 0.5) newFrame(r);
  });
  wrap("clip", (r, ctx, a) => {
    if (a[0] && typeof a[0] === "object") return; // a Path2D: shape unknown
    const p = copyPath(r.path);
    if (p.length) r.clips = [...r.clips, p];
  });
  wrap("save", (r) => r.stack.push(r.clips));
  wrap("restore", (r) => {
    if (r.stack.length) r.clips = r.stack.pop();
  });
  const text = (stroke: boolean) => (r: any, ctx: any, a: any[]) => {
    const s = String(a[0] ?? "");
    if (!s.trim()) return;
    const x = Number(a[1]), y = Number(a[2]);
    const mt = ctx.measureText(s);
    let left = x - (mt.actualBoundingBoxLeft ?? 0);
    let right = x + (mt.actualBoundingBoxRight ?? mt.width);
    const top = y - (mt.actualBoundingBoxAscent ?? 0);
    const bottom = y + (mt.actualBoundingBoxDescent ?? 0);
    const maxW = a[3];
    if (typeof maxW === "number" && maxW > 0 && mt.width > maxW) {
      const f = maxW / mt.width;
      left = x + (left - x) * f;
      right = x + (right - x) * f;
    }
    const m = M(ctx);
    const box = [T(m, left, top), T(m, right, top), T(m, right, bottom), T(m, left, bottom)];
    const scale = Math.sqrt(Math.abs(m[0]! * m[3]! - m[1]! * m[2]!));
    const fm = String(ctx.font).match(/(\d+(?:\.\d+)?)px/);
    const px = (fm ? Number(fm[1]) : 10) * scale;
    const cx = (box[0]![0]! + box[2]![0]!) / 2, cy = (box[0]![1]! + box[2]![1]!) / 2;
    const ang = Math.atan2(m[1]!, m[0]!);
    pushOp(r, {
      k: "text",
      text: s,
      box,
      anchor: T(m, x, y),
      center: [cx, cy],
      px,
      ang,
      weight: String(ctx.font),
      style: String(stroke ? ctx.strokeStyle : ctx.fillStyle),
      alpha: ctx.globalAlpha,
      clips: r.clips.slice(),
      stroke,
    });
    r.cur.push({ text: s, cx, cy, ang });
  };
  wrap("fillText", text(false));
  wrap("strokeText", text(true));

  // Remember each canvas's draw function and the frame it was last called with. The runtime sets
  // `el._d = draw` and compares `c._done === c._d`, so the getter returns one stable wrapper per
  // draw function.
  try {
    const CP = g.HTMLCanvasElement.prototype;
    if (!Object.getOwnPropertyDescriptor(CP, "_d")) {
      const wrappers = new WeakMap<Function, Function>();
      Object.defineProperty(CP, "_d", {
        configurable: true,
        get(this: any) {
          return this.__dw;
        },
        set(this: any, fn: any) {
          if (typeof fn !== "function") {
            this.__dw = fn;
            return;
          }
          let w = wrappers.get(fn);
          if (!w) {
            const el = this;
            w = function (this: any, c: any, f: any) {
              try {
                el.__draw = fn;
                el.__frameArgs = f;
              } catch {}
              return fn.call(this, c, f);
            };
            wrappers.set(fn, w);
          }
          this.__dw = w;
        },
      });
    }
  } catch {}
}

/** The installer as a script string for `page.addInitScript`. */
export const RECORDER_JS = `(${installRecorder.toString()})();`;
