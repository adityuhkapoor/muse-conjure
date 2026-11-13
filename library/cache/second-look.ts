// The second, independent look. The builder never sees this and it does not trust the gate's own
// render stage: it mounts the compiled tool through the real sandbox (headless Chrome, the same
// host harness the gate uses), at 393 px in light and dark, at rest and after a scripted run of
// actions taken from the tool's own `arbitrary`, and measures what a person would see.
//
// Reasons it can give (the `rule` of each): too-tall, blank, no-action, overflow, render-error,
// game-never-ends, game-result-not-confirmed. The visual-sameness check needs the cache and lives
// in admit.ts; this file hands it a perceptual hash.

import { chromium, compileApp, hostHtml, type Browser, type Frame, type Page } from "./deps.ts";

export type Reason = { rule: string; message: string };
export type LookOptions = { game?: boolean; budget?: number; width?: number; steps?: number; members?: { id: string; name: string }[] };
export type Look = {
  ok: boolean;
  reasons: Reason[];
  /** Height of the tool at rest, 393 px light, in px. */
  height: number;
  restHash: string;
  playedHash: string;
  restPng: Uint8Array | null;
  playedPng: Uint8Array | null;
  /** Games: the step at which a simulated game reached an end state, or null. */
  endStep: number | null;
  endReason: string | null;
  /** Controls found at rest (light). */
  controls: number;
  ms: number;
};

let browser: Promise<Browser> | null = null;
let page: Promise<Page> | null = null;

const DEFAULT_MEMBERS = [
  { id: "u1", name: "Maya" },
  { id: "u2", name: "Leo" },
  { id: "u3", name: "Ana" },
  { id: "u4", name: "Sam" },
];

function warmLook(): Promise<Page> {
  browser ??= chromium.launch({ headless: true });
  page ??= (async () => {
    const b = await browser!;
    const p = await b.newPage({ viewport: { width: 900, height: 1600 } });
    await p.setContent(await hostHtml());
    await p.waitForFunction(() => (window as any).ready === true);
    await p.evaluate(() => (window as any).H.makePool(4, { srcdoc: true }));
    // Perceptual hash helper lives in the host page, so no image decoder is needed here.
    await p.evaluate(HASH_HELPERS);
    return p;
  })();
  return page;
}

export async function closeLook(): Promise<void> {
  const b = browser;
  browser = page = null;
  if (b) await (await b).close().catch(() => {});
}

// Only one look at a time: it shares one host page.
let chain: Promise<unknown> = Promise.resolve();
export function secondLook(source: string, o: LookOptions = {}): Promise<Look> {
  const run = chain.then(() => look(source, o));
  chain = run.catch(() => {});
  return run;
}

async function look(source: string, o: LookOptions): Promise<Look> {
  const t0 = performance.now();
  const reasons: Reason[] = [];
  const say = (rule: string, message: string) => {
    if (!reasons.some((r) => r.rule === rule)) reasons.push({ rule, message });
  };
  const empty = (): Look => ({ ok: false, reasons, height: 0, restHash: "", playedHash: "", restPng: null, playedPng: null, endStep: null, endReason: null, controls: 0, ms: Math.round(performance.now() - t0) });
  let code: string;
  try {
    code = compileApp(source).code;
  } catch (e) {
    say("render-error", `does not compile: ${String((e as Error).message).slice(0, 200)}`);
    return empty();
  }
  const width = o.width ?? 393;
  const budget = o.budget ?? 420;
  const steps = o.steps ?? 14;
  const MEMBERS = (o.members && o.members.length >= 2 ? o.members : DEFAULT_MEMBERS).slice(0, 8);
  const me = MEMBERS[0]!.id;
  const others = MEMBERS.slice(1).map((m) => m.id);
  const p = await warmLook();
  const tag = `l${Math.random().toString(36).slice(2, 8)}`;
  await p.evaluate((tag) => {
    const d = document.createElement("div");
    d.id = tag;
    d.style.cssText = "position:absolute;left:0;top:0;width:420px";
    for (const m of ["light", "dark"]) {
      const s = document.createElement("div");
      s.id = `${tag}-${m}`;
      d.append(s);
    }
    document.body.append(d);
  }, tag);
  const H = <T>(fn: string, ...args: unknown[]) => p.evaluate(([f, a]) => (window as any).H[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
  const mountedIds: number[] = [];
  let restPng: Uint8Array | null = null;
  let playedPng: Uint8Array | null = null;
  let height = 0;
  let controls = 0;
  let endStep: number | null = null;
  let endReason: string | null = null;
  try {
    for (const mode of ["light", "dark"] as const) {
      const room = `a:${tag}-${mode}`;
      const m = await H<{ id: number; room: string; sized: number }>("mount", code, { width, mode, me, members: MEMBERS, debug: true, keep: true, into: `${tag}-${mode}`, room });
      mountedIds.push(m.id);
      if (m.sized < 0) {
        const errs = (await H<{ errors: string[] }>("state", m.id)).errors;
        say("render-error", `the view threw or never reported a size${errs.length ? `: ${errs.join("; ").slice(0, 200)}` : ""}`);
        continue;
      }
      const frame = await frameOf(p, m.id);
      await frame.waitForFunction(() => (globalThis as any).__m?.replica.live === true, undefined, { timeout: 3000, polling: 10 }).catch(() => {});
      await sleep(450);
      const a = await frame.evaluate(measure, { budget });
      await sleep(500);
      const b = await frame.evaluate(measure, { budget });
      const rest = merge(a, b);
      if (mode === "light") {
        height = Math.round(rest.height);
        controls = rest.controls;
        restPng = await shot(p, m.id);
      }
      // Someone may legitimately have nothing to tap (the payer of a split): try the next two people.
      if (rest.tappable < 1) {
        for (const alt of MEMBERS.slice(1, 3)) {
          const m2 = await H<{ id: number; room: string; sized: number }>("mount", code, { width, mode, me: alt.id, members: MEMBERS, debug: true, keep: true, into: `${tag}-${mode}`, room: `${room}-${alt.id}` });
          mountedIds.push(m2.id);
          if (m2.sized < 0) continue;
          const f2 = await frameOf(p, m2.id);
          await f2.waitForFunction(() => (globalThis as any).__m?.replica.live === true, undefined, { timeout: 3000, polling: 10 }).catch(() => {});
          await sleep(400);
          const alt1 = await f2.evaluate(measure, { budget });
          if (alt1.tappable >= 1) {
            rest.tappable = alt1.tappable;
            break;
          }
        }
      }
      collect(rest, "at rest", mode, say, budget);

      // A scripted run: actions from `arbitrary`, mine and other people's.
      await frame.evaluate(play, { room, steps, seed: 41, me });
      for (let i = 0; i < steps; i++) {
        const next = await frame.evaluate(proposeNext, { seed: 41 + i, step: i, users: others });
        if (next) await H("act", room, next.user, next.action);
        await sleep(25);
      }
      await frame.waitForFunction(() => (globalThis as any).__m.replica.pending.length === 0, undefined, { timeout: 2000, polling: 10 }).catch(() => {});
      await sleep(500);
      const a2 = await frame.evaluate(measure, { budget: 100000 });
      await sleep(500);
      const b2 = await frame.evaluate(measure, { budget: 100000 });
      collect(merge(a2, b2), "after a run", mode, say, 100000);
      const errs = (await H<{ errors: string[] }>("state", m.id)).errors;
      if (errs.length) say("render-error", `the frame reported an error: ${errs.join("; ").slice(0, 200)}`);
      if (mode === "light") playedPng = await shot(p, m.id);
    }

    if (o.game) {
      const id = mountedIds[0];
      if (id !== undefined) {
        const frame = await frameOf(p, id);
        await frame.evaluate(installSignals);
        const sim = await frame.evaluate(simulate, { members: MEMBERS, steps: 2000 });
        endStep = sim.endStep;
        endReason = sim.reason;
        if (sim.endStep === null) say("game-never-ends", `${sim.reason || "no end state"} in ${sim.ran} simulated steps`);
        // The result must be shown from confirmed state. Play to the winning move in real frames, hold that
        // move back from the server, and see whether the view already shows the result.
        if (sim.endStep !== null) {
          const verdict = await confirmedProbe(p, tag, code, MEMBERS, width, H);
          if (verdict === "violation") say("game-result-not-confirmed", "the result shows as soon as the winning move is tapped, before the server confirms it; show it from `confirmed`");
          else if (verdict === "inconclusive" && !readsConfirmed(source)) say("game-result-not-confirmed", "the winning move could not be observed and the view never reads `confirmed`");
        }
      }
    }
  } catch (e) {
    say("render-error", `the second look could not finish: ${String((e as Error).message).slice(0, 200)}`);
  } finally {
    await p
      .evaluate(([ids, tag]) => {
        for (const id of ids as number[]) (window as any).H.destroy(id);
        document.getElementById(tag as string)?.remove();
      }, [mountedIds, tag] as const)
      .catch(() => {});
  }

  let restHash = "";
  let playedHash = "";
  if (restPng) restHash = await hashOf(p, restPng);
  if (playedPng) playedHash = await hashOf(p, playedPng);
  if (restPng) {
    const blank = await p.evaluate(([b64]) => (window as any).__blankRatio(b64), [Buffer.from(restPng).toString("base64")] as const);
    if (blank < 0.004) say("blank", `almost nothing is drawn (${(blank * 100).toFixed(2)}% of the pixels differ from the background)`);
  }
  return { ok: reasons.length === 0, reasons, height, restHash, playedHash, restPng, playedPng, endStep, endReason, controls, ms: Math.round(performance.now() - t0) };
}


/** "ok": the result waits for confirmation. "violation": it shows while the winning move is unconfirmed. */
async function confirmedProbe(p: Page, tag: string, code: string, members: { id: string; name: string }[], width: number, H: <T>(fn: string, ...a: unknown[]) => Promise<T>): Promise<"ok" | "violation" | "inconclusive"> {
  const people = members.slice(0, 5);
  const room = `a:${tag}-probe`;
  await p.evaluate(([tag, n]) => {
    const d = document.getElementById(tag as string)!;
    for (let i = 0; i < (n as number); i++) {
      const s = document.createElement("div");
      s.id = `${tag}-p${i}`;
      d.append(s);
    }
  }, [tag, people.length] as const);
  const ids: number[] = [];
  const frames = new Map<string, { id: number; f: Frame }>();
  try {
    for (const [i, m] of people.entries()) {
      const r = await H<{ id: number; sized: number }>("mount", code, { width, mode: "light", me: m.id, members: people, debug: true, keep: true, into: `${tag}-p${i}`, room });
      ids.push(r.id);
      if (r.sized < 0) return "inconclusive";
      const f = await frameOf(p, r.id);
      await f.waitForFunction(() => (globalThis as any).__m?.replica.live === true, undefined, { timeout: 3000, polling: 10 }).catch(() => {});
      await f.evaluate(installSignals);
      frames.set(m.id, { id: r.id, f });
    }
    let idle = 0;
    for (let step = 0; step < 500 && idle < 60; step++) {
      const u = people[(step * 7 + Math.floor(step / 3)) % people.length]!.id;
      const fr = frames.get(u)!;
      const mv = await fr.f.evaluate(nextMove, { user: u, seed: step });
      if (!mv) {
        idle++;
        continue;
      }
      idle = 0;
      if (!mv.final) {
        await H("act", room, u, mv.action);
        await sleep(12);
        continue;
      }
      await sleep(150);
      const before = await fr.f.evaluate(rootText);
      await H("cut", fr.id);
      await sleep(60);
      await fr.f.evaluate(dispatchOne, mv.action);
      await sleep(300);
      const pending = await fr.f.evaluate(rootText);
      await H("restore", fr.id);
      await fr.f.waitForFunction(() => (globalThis as any).__m.replica.pending.length === 0, undefined, { timeout: 3000, polling: 20 }).catch(() => {});
      await sleep(500);
      const after = await fr.f.evaluate(rootText);
      if (after === before) return "inconclusive";
      return pending === after ? "violation" : "ok";
    }
    return "inconclusive";
  } catch {
    return "inconclusive";
  } finally {
    await p.evaluate((ids) => { for (const id of ids as number[]) (window as any).H.destroy(id); }, ids).catch(() => {});
  }
}

/** True when `confirmed` is used, not merely received in a props pattern. */
export function readsConfirmed(source: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const used = code.replace(/\{[^{}]*\bconfirmed\b[^{}]*\}(?=\s*(?::[^)=]*)?\)\s*(?:=>|\{)|\s*=\s*)/g, "{}");
  return /\bconfirmed\b/.test(used);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function frameOf(p: Page, id: number): Promise<Frame> {
  const f = await (await p.$(`iframe[data-h="${id}"]`))?.contentFrame();
  if (!f) throw new Error("frame not found");
  return f;
}

async function shot(p: Page, id: number): Promise<Uint8Array> {
  const el = await p.$(`iframe[data-h="${id}"]`);
  return new Uint8Array(await el!.screenshot({ type: "png" }));
}

function hashOf(p: Page, png: Uint8Array): Promise<string> {
  return p.evaluate(([b64]) => (window as any).__phash(b64), [Buffer.from(png).toString("base64")] as const);
}

/** Hamming distance between two 64 bit hex hashes. */
export function distance(a: string, b: string): number {
  if (a.length !== b.length || !a) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    while (x) (d += x & 1), (x >>= 1);
  }
  return d;
}

// ---- reading the measurements ----

type M = { height: number; textLen: number; canvas: number; controls: number; tappable: number; overflow: string[]; docOverflow: number };

/** An issue counts only if both samples show it (mid-animation frames are never reported). */
function merge(a: M, b: M): M {
  return {
    height: Math.max(a.height, b.height),
    textLen: Math.min(a.textLen, b.textLen),
    canvas: Math.min(a.canvas, b.canvas),
    controls: Math.min(a.controls, b.controls),
    tappable: Math.min(a.tappable, b.tappable),
    overflow: a.overflow.filter((x) => b.overflow.includes(x)),
    docOverflow: Math.min(a.docOverflow, b.docOverflow),
  };
}

function collect(m: M, when: string, mode: string, say: (r: string, msg: string) => void, budget: number): void {
  if (when === "at rest" && m.height > budget + 0.5) say("too-tall", `${Math.round(m.height)} px tall at rest in ${mode} mode; the limit is ${budget}`);
  if (m.textLen < 8 && m.canvas === 0) say("blank", `almost no text and no picture ${when} in ${mode} mode (${m.textLen} characters)`);
  if (when === "at rest" && m.tappable < 1) say("no-action", `no tappable primary action at rest in ${mode} mode`);
  if (m.overflow.length) say("overflow", `${when} in ${mode} mode: ${m.overflow.slice(0, 2).join("; ")}`);
  if (m.docOverflow > 2) say("overflow", `${when} in ${mode} mode: the page scrolls sideways by ${Math.round(m.docOverflow)} px`);
}

// ---- functions that run inside the frame (serialised by Playwright, no closures) ----

function measure(o: { budget: number }): M {
  const root = document.querySelector(".m-root") as HTMLElement | null;
  if (!root) return { height: 0, textLen: 0, canvas: 0, controls: 0, tappable: 0, overflow: ["no app root"], docOverflow: 0 };
  const R = root.getBoundingClientRect();
  const cs = (el: Element) => getComputedStyle(el);
  const hidden = (el: Element) => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const s = cs(e);
      if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return true;
      if (e === root) break;
    }
    return false;
  };
  const overflow: string[] = [];
  // Text boxes against the app's own sides, and against clipping ancestors.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const text = n.data.trim();
    const el = n.parentElement;
    if (!text || !el || hidden(el)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
    if (!rects.length) continue;
    // Marquees and rotated stamps are allowed to leave the box.
    let moving = false;
    for (let e: Element | null = el; e && e !== root; e = e.parentElement) {
      if (e.getAnimations?.().length) moving = true;
      const t = cs(e).transform;
      if (t && t !== "none") {
        const mm = new DOMMatrix(t);
        if (Math.abs(mm.b) > 0.01 || Math.abs(mm.c) > 0.01) moving = true;
      }
    }
    if (moving) continue;
    // The nearest box that clips sideways decides: with an ellipsis the text is meant to be cut; a
    // scroller is meant to scroll; otherwise the text must stay inside that box (or the tool).
    let clip: Element | null = null;
    let scroller = false;
    let ell = false;
    for (let a: Element | null = el; a && a !== root.parentElement; a = a.parentElement) {
      const s = cs(a);
      if (s.textOverflow === "ellipsis") ell = true;
      if (s.overflowX === "auto" || s.overflowX === "scroll") {
        scroller = true;
        break;
      }
      if (s.overflowX === "hidden" || s.overflowX === "clip") {
        clip = a;
        break;
      }
    }
    if (scroller) continue;
    const box = clip ? clip.getBoundingClientRect() : R;
    if (!(clip && ell) && rects.some((r) => r.right > box.right + 1.5 || r.left < box.left - 1.5)) {
      overflow.push(clip ? `"${text.slice(0, 32)}" is cut off by its box` : `"${text.slice(0, 32)}" runs past the edge of the tool`);
      continue;
    }
    for (let a: Element | null = el; a && a !== root.parentElement; a = a.parentElement) {
      const s = cs(a);
      if (s.overflowY === "hidden" || s.overflowY === "clip") {
        const b = a.getBoundingClientRect();
        if (rects.some((r) => r.bottom > b.bottom + 2 || r.top < b.top - 2)) overflow.push(`"${text.slice(0, 32)}" is cut off at the bottom of its box`);
        break;
      }
    }
  }
  const visible = (el: Element) => {
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0 && !hidden(el);
  };
  const ctl = [...root.querySelectorAll("button,[role=button],a[href],input:not([type=hidden]),select,textarea,[role=checkbox],[role=switch],[role=radio],canvas,summary")].filter(visible) as HTMLElement[];
  const enabled = ctl.filter((c) => !(c as HTMLButtonElement).disabled && c.getAttribute("aria-disabled") !== "true");
  const tappable = enabled.filter((c) => {
    const b = c.getBoundingClientRect();
    if (c.tagName === "CANVAS") return b.width >= 80 && b.height >= 60;
    if (c.tagName === "INPUT" && /^(text|search|number|)$/.test((c as HTMLInputElement).type)) return b.width >= 60 && b.height >= 28;
    return b.width >= 40 && b.height >= 30;
  });
  const media = [...root.querySelectorAll("canvas,img,svg")].filter(visible).length;
  return {
    height: R.height,
    textLen: (root.innerText ?? "").trim().length,
    canvas: media,
    controls: ctl.length,
    tappable: tappable.length,
    overflow: [...new Set(overflow)],
    docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
}

/** My own actions, from `arbitrary`, applied through the replica as a tap would. */
function play(o: { room: string; steps: number; seed: number; me: string }): void {
  const M = (globalThis as any).__m;
  const app = (globalThis as any).__muse;
  for (let i = 0; i < Math.ceil(o.steps / 2); i++) {
    try {
      const st = M.replica.state;
      const a = M.def.arbitrary(st.s, o.me, app.rng(o.seed * 7 + i), { room: o.room, members: st.members });
      if (a != null) M.dispatch(JSON.parse(JSON.stringify(a)));
    } catch {}
  }
}

/** The next action somebody else would take, from `arbitrary`. */
function proposeNext(o: { seed: number; step: number; users: string[] }): { user: string; action: unknown } | null {
  const M = (globalThis as any).__m;
  const app = (globalThis as any).__muse;
  const users = o.users;
  for (let k = 0; k < users.length; k++) {
    const user = users[(o.step + k) % users.length]!;
    try {
      const st = M.replica.state;
      const a = M.def.arbitrary(st.s, user, app.rng(o.seed + k), { room: "x", members: st.members });
      if (a != null) return { user, action: JSON.parse(JSON.stringify(a)) };
    } catch {}
  }
  return null;
}

/** Puts the end-state detector in the frame: `__sig(state)` lists the end-looking facts a state has. */
function installSignals(): void {
  const END_BOOL = /^(done|over|ended|finished|complete|completed|gameover|isover|closed|settled|decided|finalized|finalised|revealed|won|lost|solved|guessed|cleared|full)$/i;
  const END_VAL = /^(winner|winners|champion|result|results|verdict|outcome|podium|final|finalists|loser|loserid|winnerid|solution)$/i;
  const END_PHASE = /^(phase|status|stage|mode|step|state|screen)$/i;
  const PHASE_V = /^(done|over|end|ended|final|finished|complete|completed|results?|reveal|revealed|podium|winner|won|lost|solved|scored|gameover|finale|summary|recap|win|lose|draw|tie)$/;
  const SUMMARY_V = /\b(won|wins|winner|champion|final|game over|draw|tie|finished|done|complete|results?)\b/i;
  // A round that ends by recording a result: an array that starts empty and gets an entry.
  const END_ARRAY = /^(scores|results|leaderboard|standings|history|runs|rounds|finished|winners)$/i;
  const signals = (s: unknown): Record<string, string> => {
    const out: Record<string, string> = {};
    const walk = (v: unknown, path: string, depth: number) => {
      if (!v || typeof v !== "object" || depth > 3) return;
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        const p = path ? `${path}.${k}` : k;
        if (END_ARRAY.test(k) && Array.isArray(x) && x.length) out[p] = "recorded";
        else if (END_BOOL.test(k) && x === true) out[p] = "true";
        else if (END_VAL.test(k) && x != null && x !== false && x !== "" && !(Array.isArray(x) && !x.length) && !(typeof x === "object" && !Array.isArray(x) && !Object.keys(x as object).length)) out[p] = JSON.stringify(x).slice(0, 60);
        else if (END_PHASE.test(k) && typeof x === "string" && PHASE_V.test(x.toLowerCase().replace(/[_\s-]/g, ""))) out[p] = x;
        else if (x && typeof x === "object") walk(x, p, depth + 1);
      }
    };
    walk(s, "", 0);
    return out;
  };
  (globalThis as any).__sig = signals;
  (globalThis as any).__summaryV = SUMMARY_V;
}

/** The next move somebody would make, and whether it would end the game (on the local fold, seed 0). */
function nextMove(o: { user: string; seed: number }): { action: unknown; final: boolean } | null {
  const M = (globalThis as any).__m;
  const app = (globalThis as any).__muse;
  const sig = (globalThis as any).__sig as (s: unknown) => Record<string, string>;
  const st = M.replica.state;
  const ctx = { room: "a:probe", members: st.members };
  const base = JSON.stringify(sig(M.def.init(ctx)));
  let a: unknown = null;
  try {
    a = M.def.arbitrary(st.s, o.user, app.rng(o.seed * 13 + 5), ctx);
  } catch {}
  if (a == null || typeof a !== "object" || typeof (a as any).t !== "string") return null;
  const action = JSON.parse(JSON.stringify(a));
  try {
    const next = M.def.reduce(st.s, action, { seq: 999, user: o.user, time: 1_760_000_000_000, seed: 0 }, ctx);
    if (JSON.stringify(next) === JSON.stringify(st.s)) return null;
    const now = sig(next);
    return { action, final: JSON.stringify(now) !== base && Object.keys(now).length > 0 && JSON.stringify(sig(st.s)) === base };
  } catch {
    return null;
  }
}

function rootText(): string {
  return ((document.querySelector(".m-root") as HTMLElement | null)?.innerText ?? "").replace(/\s+/g, " ").trim();
}

function dispatchOne(action: unknown): void {
  (globalThis as any).__m.dispatch(action);
}

/** Plays a whole game with the tool's own reducer and `arbitrary`; looks for an end state. */
function simulate(o: { members: { id: string; name: string }[]; steps: number }): { endStep: number | null; reason: string; ran: number } {
  const M = (globalThis as any).__m;
  const app = (globalThis as any).__muse;
  const def = M.def;
  const ctx = { room: "a:sim", members: o.members };
  const signals = (globalThis as any).__sig as (s: unknown) => Record<string, string>;
  const SUMMARY_V = (globalThis as any).__summaryV as RegExp;
  const sum = (s: unknown) => {
    try {
      return String(def.summary(s, ctx));
    } catch {
      return "";
    }
  };
  let state: unknown;
  try {
    state = def.init(ctx);
  } catch (e) {
    return { endStep: null, reason: `init threw: ${String(e)}`, ran: 0 };
  }
  const base = JSON.stringify(signals(state));
  const baseSum = SUMMARY_V.test(sum(state));
  const r = app.rng(99);
  let stalled = 0;
  for (let i = 1; i <= o.steps; i++) {
    const order = [...o.members].sort(() => r.next() - 0.5);
    let moved = false;
    for (const u of order) {
      let a: unknown = null;
      try {
        a = def.arbitrary(state, u.id, app.rng(i * 31 + u.id.charCodeAt(1)), ctx);
      } catch {}
      if (a == null || typeof a !== "object" || typeof (a as any).t !== "string") continue;
      try {
        const next = def.reduce(state, JSON.parse(JSON.stringify(a)), { seq: i, user: u.id, time: 1_760_000_000_000 + i * 1000, seed: Math.floor(r.next() * 4294967295) }, ctx);
        if (JSON.stringify(next) !== JSON.stringify(state)) {
          state = next;
          moved = true;
          break;
        }
      } catch {}
    }
    stalled = moved ? 0 : stalled + 1;
    const now = signals(state);
    const keys = Object.keys(now);
    if (JSON.stringify(now) !== base && keys.length) return { endStep: i, reason: `reached ${keys[0]} = ${now[keys[0]!]}`, ran: i };
    if (!baseSum && SUMMARY_V.test(sum(state))) return { endStep: i, reason: `summary says "${sum(state).slice(0, 50)}"`, ran: i };
    if (stalled >= 30) return { endStep: null, reason: "the game stalled with no end state (no action changes it)", ran: i };
  }
  return { endStep: null, reason: "no end state", ran: o.steps };
}

// ---- host page helpers: perceptual hash and blank ratio ----

const HASH_HELPERS = () => {
  const load = async (b64: string) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    return img;
  };
  (window as any).__phash = async (b64: string): Promise<string> => {
    const img = await load(b64);
    const N = 32;
    const c = document.createElement("canvas");
    c.width = c.height = N;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, N, N);
    g.drawImage(img, 0, 0, N, N);
    const d = g.getImageData(0, 0, N, N).data;
    const gray: number[][] = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => 0.299 * d[(y * N + x) * 4]! + 0.587 * d[(y * N + x) * 4 + 1]! + 0.114 * d[(y * N + x) * 4 + 2]!));
    const cos = (u: number, x: number) => Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
    const coef: number[] = [];
    for (let u = 0; u < 8; u++)
      for (let v = 0; v < 8; v++) {
        let s = 0;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) s += gray[y]![x]! * cos(u, y) * cos(v, x);
        coef.push(s);
      }
    const rest = coef.slice(1).sort((a, b) => a - b);
    const med = rest[Math.floor(rest.length / 2)]!;
    let hex = "";
    for (let i = 0; i < 64; i += 4) {
      let nib = 0;
      for (let j = 0; j < 4; j++) nib = (nib << 1) | (coef[i + j]! > med ? 1 : 0);
      hex += nib.toString(16);
    }
    return hex;
  };
  (window as any).__blankRatio = async (b64: string): Promise<number> => {
    const img = await load(b64);
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const counts = new Map<number, number>();
    for (let i = 0; i < d.length; i += 4) {
      const k = ((d[i]! >> 3) << 10) | ((d[i + 1]! >> 3) << 5) | (d[i + 2]! >> 3);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let top = 0;
    for (const v of counts.values()) top = Math.max(top, v);
    return 1 - top / (d.length / 4);
  };
};
