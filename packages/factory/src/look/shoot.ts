// Headless pictures of a tool, for the critic and for people. Mounts the compiled tool through the
// real sandbox host (chrome-headless-shell, never a window) at 393 px in light and dark, in four
// scenes, and returns a PNG and a structured description of each.
//
//   rest      the chat's members, nothing tapped yet
//   played    after a short run: my taps and other people's, from the tool's own `arbitrary`
//   two       only two people in the chat, nothing tapped (the thinnest it gets)
//   crowded   twelve people and 40 taps (the most it gets)
//
// One browser per process, one look at a time.

import { chromium, type Browser, type Frame, type Page } from "../../../sandbox/node_modules/playwright/index.mjs";
import { compileApp } from "../../../sandbox/src/compile.ts";
import { hostHtml } from "../../../sandbox/src/harness-build.ts";

export type Scene = "rest" | "played" | "two" | "crowded";
export type Mode = "light" | "dark";
export type Member = { id: string; name: string };

/** One element a person would see, for a text-only critic. Boxes are px inside the tool. */
export type Seen = { tag: string; role: string; text: string; x: number; y: number; w: number; h: number; color: string; bg: string; size: number; weight: number; primary?: boolean };
export type Shot = { scene: Scene; mode: Mode; png: Uint8Array; height: number; seen: Seen[]; summary: string; errors: string[] };
export type ShootOptions = { members?: Member[]; width?: number; scenes?: Scene[]; modes?: Mode[]; steps?: number; /** most members mounted (default 12) */ max?: number };

const FILLER = ["Jordan", "Riley", "Casey", "Avery", "Quinn", "Rowan", "Emery", "Harper", "Jules", "Sasha", "Kai", "Remy"];
export const SCENE_LABEL: Record<Scene, string> = { rest: "At rest", played: "After taps", two: "Two people", crowded: "12 people, 40 taps" };

let browser: Promise<Browser> | null = null;
let page: Promise<Page> | null = null;

function warmPage(): Promise<Page> {
  browser ??= chromium.launch({ headless: true });
  page ??= (async () => {
    const b = await browser!;
    const p = await b.newPage({ viewport: { width: 1200, height: 1800 }, deviceScaleFactor: 2 });
    await p.setContent(await hostHtml());
    await p.waitForFunction(() => (window as any).ready === true);
    await p.evaluate(() => (window as any).H.makePool(4, { srcdoc: true }));
    return p;
  })();
  return page;
}

export async function closeShoot(): Promise<void> {
  const b = browser;
  browser = page = null;
  if (b) await (await b).close().catch(() => {});
}

let chain: Promise<unknown> = Promise.resolve();
/** Pictures of `source` in every scene and mode asked for. Serialised: one host page. */
export function shoot(source: string, o: ShootOptions = {}): Promise<Shot[]> {
  const run = chain.then(() => shootNow(source, o));
  chain = run.catch(() => {});
  return run;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function shootNow(source: string, o: ShootOptions): Promise<Shot[]> {
  const code = compileApp(source).code;
  const width = o.width ?? 393;
  const base = (o.members?.length ? o.members : FILLER.slice(0, 4).map((name, i) => ({ id: `u${i + 1}`, name }))).slice(0, o.max ?? 12);
  const scenes = o.scenes ?? ["rest", "played", "two", "crowded"];
  const modes = o.modes ?? ["light", "dark"];
  const p = await warmPage();
  const H = <T>(fn: string, ...args: unknown[]) => p.evaluate(([f, a]) => (window as any).H[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
  const tag = `s${Math.random().toString(36).slice(2, 8)}`;
  await p.evaluate((tag) => {
    const d = document.createElement("div");
    d.id = tag;
    d.style.cssText = "position:absolute;left:0;top:0;width:520px";
    document.body.append(d);
  }, tag);
  const out: Shot[] = [];
  const ids: number[] = [];
  try {
    for (const mode of modes)
      for (const scene of scenes) {
        const members = scene === "two" ? base.slice(0, 2) : scene === "crowded" ? crowd(base) : base;
        const me = members[0]!.id;
        const room = `a:${tag}-${mode}-${scene}`;
        const m = await H<{ id: number; sized: number }>("mount", code, { width, mode, me, members, debug: true, keep: true, into: tag, room });
        ids.push(m.id);
        if (m.sized < 0) {
          const st = await H<{ errors: string[] }>("state", m.id);
          out.push({ scene, mode, png: new Uint8Array(), height: 0, seen: [], summary: "", errors: st.errors.length ? st.errors : ["the view never rendered"] });
          continue;
        }
        const f = await frameOf(p, m.id);
        await f.waitForFunction(() => (globalThis as any).__m?.replica.live === true, undefined, { timeout: 3000, polling: 10 }).catch(() => {});
        const steps = scene === "played" ? (o.steps ?? 10) : scene === "crowded" ? 40 : 0;
        if (steps) {
          await f.evaluate(playMine, { room, steps: Math.ceil(steps / 3), seed: 41, me });
          const others = members.slice(1).map((x) => x.id);
          for (let i = 0; i < steps; i++) {
            const next = await f.evaluate(proposeNext, { seed: 41 + i, step: i, users: others });
            if (next) await H("act", room, next.user, next.action);
            await sleep(15);
          }
          await f.waitForFunction(() => (globalThis as any).__m.replica.pending.length === 0, undefined, { timeout: 2500, polling: 10 }).catch(() => {});
        }
        // Let arrival motion settle: the picture is the resting frame, not the middle of a tween.
        await sleep(steps ? 1600 : 700);
        const seen = await f.evaluate(describe);
        const st = await H<{ errors: string[]; summaries: string[] }>("state", m.id);
        const el = await p.$(`iframe[data-h="${m.id}"]`);
        const box = await el!.boundingBox();
        const png = new Uint8Array(await el!.screenshot({ type: "png" }));
        out.push({ scene, mode, png, height: Math.round(box?.height ?? 0), seen, summary: st.summaries.at(-1) ?? "", errors: st.errors });
        // The pool holds a few frames; give this one back before the next scene.
        await H("destroy", m.id);
        ids.pop();
      }
  } finally {
    await p
      .evaluate(([ids, tag]) => {
        for (const id of ids as number[]) (window as any).H.destroy(id);
        document.getElementById(tag as string)?.remove();
      }, [ids, tag] as const)
      .catch(() => {});
  }
  return out;
}

function crowd(base: Member[]): Member[] {
  const names = new Set(base.map((m) => m.name));
  const extra = FILLER.filter((n) => !names.has(n)).map((name, i) => ({ id: `x${i + 1}`, name }));
  return [...base, ...extra].slice(0, 12);
}

async function frameOf(p: Page, id: number): Promise<Frame> {
  const f = await (await p.$(`iframe[data-h="${id}"]`))?.contentFrame();
  if (!f) throw new Error("frame not found");
  return f;
}

/** A grid of pictures with labels, as one PNG. Uses the same headless page. */
export async function sheet(cells: { title: string; sub?: string; png: Uint8Array }[], o: { columns?: number; heading?: string; dark?: boolean; cellWidth?: number } = {}): Promise<Uint8Array> {
  const p = await warmPage();
  const cols = o.columns ?? 4;
  const w = o.cellWidth ?? 393;
  const html = `<div id="sheet" style="display:inline-block;padding:24px;background:#F0F2F5;font:13px/16px system-ui,-apple-system,sans-serif;color:#080809">
    ${o.heading ? `<div style="font:600 17px/22px system-ui;margin-bottom:16px;max-width:${cols * (w + 16)}px">${esc(o.heading)}</div>` : ""}
    <div style="display:grid;grid-template-columns:repeat(${cols},${w}px);gap:16px;align-items:start">
    ${cells
      .map(
        (c) => `<div><div style="font-weight:600;margin-bottom:2px">${esc(c.title)}</div>${c.sub ? `<div style="color:#65686C;margin-bottom:6px;white-space:pre-wrap">${esc(c.sub)}</div>` : ""}
        ${c.png.length ? `<img style="width:${w}px;display:block;border-radius:18px;background:#fff" src="data:image/png;base64,${Buffer.from(c.png).toString("base64")}">` : `<div style="height:120px;border-radius:18px;background:#fff;display:grid;place-items:center;color:#65686C">No picture</div>`}</div>`,
      )
      .join("")}
    </div></div>`;
  const id = `sh${Math.random().toString(36).slice(2, 8)}`;
  await p.evaluate(
    ([id, html]) => {
      const d = document.createElement("div");
      d.id = id as string;
      d.style.cssText = "position:absolute;left:0;top:0;z-index:10";
      d.innerHTML = html as string;
      document.body.append(d);
      return Promise.all([...d.querySelectorAll("img")].map((i) => i.decode().catch(() => {})));
    },
    [id, html] as const,
  );
  try {
    const el = await p.$(`#${id} #sheet`);
    return new Uint8Array(await el!.screenshot({ type: "png" }));
  } finally {
    await p.evaluate((id) => document.getElementById(id)?.remove(), id).catch(() => {});
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// ---- run inside the frame (serialised by Playwright, no closures) ----

function playMine(o: { room: string; steps: number; seed: number; me: string }): void {
  const M = (globalThis as any).__m;
  const app = (globalThis as any).__muse;
  for (let i = 0; i < o.steps; i++) {
    try {
      const st = M.replica.state;
      const a = M.def.arbitrary(st.s, o.me, app.rng(o.seed * 7 + i), { room: o.room, members: st.members });
      if (a != null) M.dispatch(JSON.parse(JSON.stringify(a)));
    } catch {}
  }
}

function proposeNext(o: { seed: number; step: number; users: string[] }): { user: string; action: unknown } | null {
  const M = (globalThis as any).__m;
  const app = (globalThis as any).__muse;
  for (let k = 0; k < o.users.length; k++) {
    const user = o.users[(o.step + k) % o.users.length]!;
    try {
      const st = M.replica.state;
      const a = M.def.arbitrary(st.s, user, app.rng(o.seed + k), { room: "x", members: st.members });
      if (a != null) return { user, action: JSON.parse(JSON.stringify(a)) };
    } catch {}
  }
  return null;
}

function describe(): Seen[] {
  const root = document.querySelector(".m-root") as HTMLElement | null;
  if (!root) return [];
  const R = root.getBoundingClientRect();
  const out: Seen[] = [];
  const all = root.querySelectorAll("*");
  for (const el of all) {
    const e = el as HTMLElement;
    const b = e.getBoundingClientRect();
    if (b.width < 2 || b.height < 2) continue;
    const s = getComputedStyle(e);
    if (s.visibility === "hidden" || s.display === "none" || s.opacity === "0") continue;
    const tag = e.tagName.toLowerCase();
    const control = tag === "button" || tag === "input" || tag === "select" || e.getAttribute("role") === "button";
    const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? "").join(" ").trim();
    const picture = tag === "canvas" || tag === "svg" || tag === "img";
    const filled = s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent" && b.width * b.height > 900;
    if (!own && !control && !picture && !filled) continue;
    if (out.length >= 80) break;
    out.push({
      tag,
      role: control ? "control" : picture ? "picture" : own ? "text" : "box",
      text: (control ? (e.innerText || e.getAttribute("aria-label") || "") : picture ? (e.getAttribute("aria-label") || "") : own).replace(/\s+/g, " ").slice(0, 60),
      x: Math.round(b.left - R.left),
      y: Math.round(b.top - R.top),
      w: Math.round(b.width),
      h: Math.round(b.height),
      color: s.color,
      bg: s.backgroundColor,
      size: parseFloat(s.fontSize) || 0,
      weight: Number(s.fontWeight) || 400,
      ...(e.classList.contains("m-btn") && e.classList.contains("p") ? { primary: true } : {}),
    });
  }
  return out;
}
