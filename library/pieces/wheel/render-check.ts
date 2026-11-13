// Test helpers for the wheel and chore wheel pieces (used by their *.test.ts files only).
//
// 1. `sliceLabels`: calls a piece's own canvas `draw` with a recording 2D context and checks that
//    every slice label lies inside its slice: between the hub and the rim, and between the slice's
//    two edges. Text width is 0.6 em per character, the same in the piece and in the check.
// 2. `blankShare`: mounts a piece through the real sandbox in headless Chrome and returns, at rest,
//    the share of the card's height that shows nothing (no text, control, avatar or painted canvas
//    pixel in that row) and the tallest such blank band in px.

import { makeTheme } from "@muse/app/theme";
import type { Member } from "@muse/app";
import type { VEl } from "../../../packages/app/src/h.ts";

type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const apply = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const pxOf = (font: string) => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10);

type Text = { text: string; x: number; y: number; m: M; px: number; align: string };
type Arc = { cx: number; cy: number; r: number; s: number; e: number };

/** A 2D context that records arcs and text with the transform in force. */
export class RecordingContext {
  m: M = [1, 0, 0, 1, 0, 0];
  stack: M[] = [];
  font = "10px sans-serif";
  textAlign = "start";
  textBaseline = "alphabetic";
  fillStyle = "";
  arcs: Arc[] = [];
  texts: Text[] = [];
  save() {
    this.stack.push([...this.m] as M);
  }
  restore() {
    this.m = this.stack.pop() ?? [1, 0, 0, 1, 0, 0];
  }
  translate(x: number, y: number) {
    this.m = mul(this.m, [1, 0, 0, 1, x, y]);
  }
  rotate(a: number) {
    this.m = mul(this.m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]);
  }
  beginPath() {}
  moveTo() {}
  lineTo() {}
  closePath() {}
  fill() {}
  arc(cx: number, cy: number, r: number, s: number, e: number) {
    this.arcs.push({ cx, cy, r, s, e });
  }
  measureText(t: string) {
    return { width: t.length * pxOf(this.font) * 0.6 };
  }
  fillText(text: string, x: number, y: number) {
    this.texts.push({ text, x, y, m: [...this.m] as M, px: pxOf(this.font), align: this.textAlign });
  }
}

/** The `draw` prop of the first Canvas in a view tree. */
export function findDraw(node: unknown): ((g: CanvasRenderingContext2D, f: { now: number; width: number; height: number }) => unknown) | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const c of node) {
      const d = findDraw(c);
      if (d) return d;
    }
    return null;
  }
  const v = node as VEl;
  if (typeof v.p?.draw === "function") return v.p.draw;
  return findDraw(v.c) ?? findDraw(v.p?.children);
}

export type AppLike = { view: (p: any) => unknown };

/** Renders the view once (light theme, card width) and draws its canvas into a recording context. */
export function drawOnce(app: AppLike, state: unknown, members: Member[], width = 300, height = 220): RecordingContext | null {
  const theme = makeTheme("light", 393, "chat");
  const tree = app.view({ state, confirmed: state, pending: false, me: members[0]?.id ?? "u1", members, dispatch: () => {}, theme, local: { draft: "", adding: false }, setLocal: () => {} });
  const draw = findDraw(tree);
  if (!draw) return null;
  const g = new RecordingContext();
  draw(g as unknown as CanvasRenderingContext2D, { now: 0, width, height });
  return g;
}

/** Problems with the slice labels: a label outside its slice, or cut without an ellipsis. */
export function sliceLabelProblems(g: RecordingContext, labels: string[], hub = 12): string[] {
  const out: string[] = [];
  const wedges = g.arcs.filter((a) => a.r > hub + 1);
  const TAU = Math.PI * 2;
  g.texts.forEach((t, i) => {
    const w = wedges[i];
    const want = labels[i] ?? "";
    if (!w) return out.push(`text ${i} has no slice`);
    if (t.text !== want && !(t.text.endsWith("…") && want.startsWith(t.text.slice(0, -1).trimEnd()))) out.push(`"${want}" was drawn as "${t.text}" (cut without an ellipsis)`);
    if (!t.text) return;
    const width = t.text.length * t.px * 0.6;
    const [x0, x1] = t.align === "right" || t.align === "end" ? [t.x - width, t.x] : [t.x, t.x + width];
    const span = w.e - w.s;
    for (const [x, y] of [[x0, -t.px / 2], [x0, t.px / 2], [x1, -t.px / 2], [x1, t.px / 2]] as const) {
      const [px, py] = apply(t.m, x, y);
      const d = Math.hypot(px - w.cx, py - w.cy);
      const ang = (((Math.atan2(py - w.cy, px - w.cx) - w.s) % TAU) + TAU) % TAU;
      if (d > w.r + 0.5 || d < hub) out.push(`"${t.text}" leaves the slice radially (${d.toFixed(1)} of ${w.r.toFixed(1)})`);
      else if (span < TAU - 1e-6 && ang > span + 1e-6) out.push(`"${t.text}" crosses the slice edge`);
    }
  });
  return [...new Set(out)];
}

/** Share of the mounted card's height, at rest, with nothing drawn in it. */
export async function blankShare(source: string, members: Member[], width = 393): Promise<{ share: number; band: number; height: number }> {
  const { compileApp } = await import("../../../packages/sandbox/src/compile.ts");
  const { launch, openHost, startServers } = await import("../../../packages/sandbox/scripts/serve.ts");
  const s = await startServers();
  const browser = await launch("chromium");
  try {
    const page = await openHost(browser, s, width);
    await page.evaluate(() => (window as any).H.makePool(1));
    const m = await page.evaluate(([code, mem]) => (window as any).H.mount(code, { members: mem }), [compileApp(source).code, members] as const);
    const frame = (await (await page.$(`iframe[data-h="${(m as { id: number }).id}"]`))!.contentFrame())!;
    await frame.waitForSelector(".m-root > *");
    await page.waitForTimeout(400);
    return await frame.evaluate(() => {
      const root = document.querySelector<HTMLElement>(".m-root")!;
      const rb = root.getBoundingClientRect();
      const rows = new Uint8Array(Math.ceil(rb.height));
      const mark = (top: number, bottom: number) => {
        for (let y = Math.max(0, Math.floor(top - rb.top)); y < Math.min(rows.length, Math.ceil(bottom - rb.top)); y++) rows[y] = 1;
      };
      // Text, controls and avatars.
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent?.trim()) continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        for (const b of r.getClientRects()) mark(b.top, b.bottom);
      }
      for (const el of root.querySelectorAll<HTMLElement>("input, button, .m-av")) {
        const b = el.getBoundingClientRect();
        mark(b.top, b.bottom);
      }
      // Canvas rows with any painted pixel.
      for (const c of root.querySelectorAll<HTMLCanvasElement>("canvas")) {
        const b = c.getBoundingClientRect();
        const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
        const k = c.height / b.height;
        for (let y = 0; y < b.height; y++) {
          const row = Math.floor(y * k) * c.width * 4;
          for (let x = 0; x < c.width; x++) {
            if (data[row + x * 4 + 3]! > 0) {
              mark(b.top + y, b.top + y + 1);
              break;
            }
          }
        }
      }
      const blank = rows.length - rows.reduce((a, b) => a + b, 0);
      let band = 0;
      let run = 0;
      for (const r of rows) band = Math.max(band, (run = r ? 0 : run + 1));
      return { share: blank / Math.max(1, rows.length), band, height: Math.round(rb.height) };
    });
  } finally {
    await browser.close();
    s.stop();
  }
}
