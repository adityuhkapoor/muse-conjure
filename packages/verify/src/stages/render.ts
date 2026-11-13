// Stage 6: render. The compiled app is mounted through the real sandbox (warm frame pool, frame
// runtime, @muse/sync replica, in-page Sequencer as the server) in chrome-headless-shell, at widths
// 320, 393 and 500 in light and dark. One browser lives for the whole process.
//
// Per width and mode, two frames run side by side:
// - "rest": mounted and left alone; layout lint twice, 0.6 s apart (host clock ticking), plus the
//   height budget and a blank check.
// - "taps": taps driven by `arbitrary` (the control whose click dispatches the proposed action is
//   found by probing, else the action is dispatched directly), actions from two other people
//   through the server, and raw pointer events at random points; then layout lint twice.
// An issue counts only when both samples show it, so mid-animation frames are never reported.
// axe-core runs once per mode on a "taps" frame at width 393.
//
// Every frame also gets the canvas recorder (src/render/recorder.ts) and the lints in
// src/render/lints.ts; their findings come back in `more`, and index.ts decides by profile whether
// each is a failure, a warning or off. With `states` (the strict profile), each width and mode
// also mounts one frame per data-shape state (src/coverage/states.ts), replayed through the
// server, and these run on one page per width and mode, in their own browser contexts, so the six
// groups render in parallel.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Frame, type Page } from "playwright";
import { compileApp } from "@muse/sandbox/compile";
import { hostHtml } from "../render/host.ts";
import type { Failure, TraceStep } from "../report.ts";
import { MEMBERS } from "../sim/core.ts";
import { STEP_MS, type CoverageState } from "../coverage/states.ts";
// A state frame shows the state after its last action has settled: spins, reveals and toasts that
// start from meta.time have finished, so a mid-animation frame is not judged as the state.
const SETTLED_MS = 8000;
import { RECORDER_JS } from "../render/recorder.ts";
import { frameCoupling, lintMore, measure, type Box, type Measure, type MoreIssue } from "../render/lints.ts";

export type RenderOptions = {
  widths?: number[];
  modes?: ("light" | "dark")[];
  seed?: number;
  budget?: number;
  timeoutMs?: number;
  /** Data-shape states to mount beside rest and taps (strict profile). */
  states?: CoverageState[];
  /** The viewer can change nothing in the typical (init) state. */
  typicalFinished?: boolean;
  /** Run the extra lints (canvas, SVG, plural, labels, covered controls). Default true. */
  more?: boolean;
  /** Write cropped PNGs of failing regions here (default: a temp folder); false turns crops off. */
  artifacts?: string | false;
  /** Also return each crop as a data URL. */
  images?: boolean;
  /** Max crops per render. */
  crops?: number;
};
export type RenderResult = { failures: Failure[]; warnings: Failure[]; ms: Record<string, number>; more?: Failure[] };

const WIDTHS = [320, 393, 500];
const MODES = ["light", "dark"] as const;
const GAP_MS = 600;
/** Base lint rules that are about layout, reported per state as overload-overflow / state-layout. */
const LAYOUT = new Set(["clipped-text", "text-overlap", "outside-app", "too-tall", "canvas-text-clipped", "canvas-text-overlap"]);

let browser: Promise<Browser> | null = null;
let page: Promise<Page> | null = null;
const strictPages = new Map<number, Promise<Page>>();
let axeSource: string | null = null;

function launch(): Promise<Browser> {
  if (!browser) {
    const mine = (browser = chromium.launch({ headless: true }));
    // a browser that dies must not stay cached: the next render launches a fresh one
    mine.then(
      (b) =>
        b.on("disconnected", () => {
          if (browser !== mine) return;
          browser = page = null;
          strictPages.clear();
        }),
      () => {
        if (browser === mine) browser = page = null;
      },
    );
  }
  return browser;
}

async function hostPage(b: Browser, size: number, viewport: { width: number; height: number }, own: boolean): Promise<Page> {
  const p = own ? await (await b.newContext({ viewport })).newPage() : await b.newPage({ viewport });
  await p.addInitScript(RECORDER_JS);
  await p.setContent(await hostHtml());
  await p.waitForFunction(() => (window as any).ready === true);
  await p.evaluate((n) => (window as any).H.makePool(n, { srcdoc: true }), size);
  return p;
}

/** Launch the browser and load the host page with a warm pool. Idempotent. */
export function warmRender(): Promise<Page> {
  launch();
  // Tall enough that no frame is offscreen: Chrome throttles offscreen cross-origin frames.
  page ??= launch().then((b) => hostPage(b, 12, { width: 1700, height: 1400 }, false));
  return page;
}

/** One page per width and mode for the strict profile, each in its own context (own process). */
export function warmStrict(n = WIDTHS.length * MODES.length): Promise<Page[]> {
  return Promise.all(
    Array.from({ length: n }, (_, i) => {
      let p = strictPages.get(i);
      if (!p) {
        p = launch().then((b) => hostPage(b, 8, { width: 1700, height: 2600 }, true));
        strictPages.set(i, p);
      }
      return p;
    }),
  );
}

export async function closeRender(): Promise<void> {
  const b = browser;
  browser = page = null;
  strictPages.clear();
  if (b) await (await b).close().catch(() => {});
}

type Issue = { rule: string; key: string; message: string; box?: Box; detail?: Record<string, unknown> };
type Mounted = { id: number; room: string; sized: number };
type Kind = "rest" | "taps" | `state:${string}`;
type Slot = { cfg: { mode: "light" | "dark"; width: number }; kind: Kind; state?: CoverageState | undefined; p: Page; m: Mounted; f: Frame; idx: number };

/** Render with a time limit. A frame stuck in a loop can stall the page, so on a timeout the
 * page is dropped and the next call starts a fresh one. */
export async function render(source: string, o: RenderOptions = {}): Promise<RenderResult> {
  const limit = o.timeoutMs ?? 8000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<RenderResult>((res) => {
    timer = setTimeout(() => {
      if (o.states) {
        const olds = [...strictPages.values()];
        strictPages.clear();
        for (const old of olds) void old.then((p) => p.context().close()).catch(() => {});
      } else {
        const old = page;
        page = null;
        void old?.then((p) => p.close()).catch(() => {});
      }
      res({ failures: [{ rule: "timeout", message: `the render stage did not finish within ${limit} ms. Look for loops that never end in reduce or the view.` }], warnings: [], ms: {} });
    }, limit);
  });
  try {
    return await Promise.race([renderOnce(source, o), late]);
  } finally {
    clearTimeout(timer);
  }
}

/** The trace that reproduces a state: who is in the chat, then who did what. */
export function stateTrace(s: CoverageState): TraceStep[] {
  return [{ step: "members", members: s.members.map((m) => m.id) }, ...s.steps.map((x) => ({ step: "act" as const, user: x.user, action: x.action }))];
}

/** A lint expression for one sample: the DOM lint, the extra lints, and the state measure. */
function sampleExpr(o: { budget: number; rest: boolean; more: boolean; measure: boolean }): string {
  const parts = [`base: (${lint.toString()})(${JSON.stringify({ budget: o.budget, rest: o.rest })})`];
  if (o.more) parts.push(`more: (() => { try { return (${lintMore.toString()})({ checkCanvas: true, checkDom: true }); } catch (e) { return []; } })()`);
  if (o.measure) parts.push(`measure: (() => { try { return (${measure.toString()})(); } catch (e) { return null; } })()`);
  return `(() => ({ ${parts.join(", ")} }))()`;
}
type Sample = { base: Issue[]; more?: MoreIssue[]; measure?: Measure | null };

async function renderOnce(source: string, o: RenderOptions): Promise<RenderResult> {
  const t0 = performance.now();
  const ms: Record<string, number> = {};
  const lap = (k: string) => (ms[k] = Math.round(performance.now() - t0));
  let code: string;
  try {
    code = compileApp(source).code;
  } catch (e) {
    return { failures: [{ rule: "compile", message: String((e as Error).message) }], warnings: [], ms };
  }
  const widths = o.widths ?? WIDTHS;
  const modes = o.modes ?? MODES;
  const budget = o.budget ?? 420;
  const seed = o.seed ?? 1;
  const more = o.more ?? true;
  const states = o.states ?? [];
  const strict = !!o.states;
  const configs = modes.flatMap((mode) => widths.map((width) => ({ mode, width })));
  const pages = strict ? await warmStrict(configs.length) : [await warmRender()];
  lap("browser");
  const pageOf = (i: number) => (strict ? pages[i]! : pages[0]!);
  const tag = `r${Math.random().toString(36).slice(2, 8)}`;
  const kinds: Kind[] = ["rest", "taps", ...states.map((s) => `state:${s.name}` as Kind)];

  // One slot per frame: config i, kind k.
  const plan = configs.flatMap((cfg, i) => kinds.map((kind, k) => ({ cfg, i, kind, k, state: kind.startsWith("state:") ? states[k - 2] : undefined })));
  const perPage = new Map<Page, number>();
  for (const x of plan) perPage.set(pageOf(x.i), (perPage.get(pageOf(x.i)) ?? 0) + 1);
  await Promise.all(
    [...perPage].map(([p, n]) =>
      p.evaluate(
        ([tag, n]) => {
          const box = document.createElement("div");
          box.id = tag;
          box.style.cssText = "position:absolute;left:0;top:0;display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;width:1700px";
          for (let i = 0; i < n; i++) {
            const d = document.createElement("div");
            d.id = `${tag}-${i}`;
            box.append(d);
          }
          document.body.append(box);
        },
        [tag, n] as const,
      ),
    ),
  );
  const H = <T>(p: Page, fn: string, ...args: unknown[]) => p.evaluate(([f, a]) => (window as any).H[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
  const failures: Failure[] = [];
  const warnings: Failure[] = [];
  const found: Failure[] = [];
  const mounted: { p: Page; id: number }[] = [];
  const counter = new Map<Page, number>();
  try {
    const mounts = await Promise.all(
      plan.map(async (x) => {
        const p = pageOf(x.i);
        const n = counter.get(p) ?? 0;
        counter.set(p, n + 1);
        const room = `a:${tag}-${x.i}-${x.kind.replace(":", "-")}`;
        const members = x.state?.members ?? MEMBERS;
        if (x.state) {
          const st = x.state;
          await p.evaluate(
            ([room, members, steps, step, settled]) => {
              const H = (window as any).H;
              const n = (steps as unknown[]).length;
              H.act(room, "host", { t: "@members", members }, (n + 1) * (step as number) + (settled as number));
              (steps as { user: string; action: unknown }[]).forEach((s, i) => H.act(room, s.user, s.action, (n - i) * (step as number) + (settled as number)));
            },
            [room, st.members, st.steps, STEP_MS, SETTLED_MS] as const,
          );
        }
        const m = await H<Mounted>(p, "mount", code, { width: x.cfg.width, mode: x.cfg.mode, me: "u1", members, debug: true, keep: true, into: `${tag}-${n}`, room });
        mounted.push({ p, id: m.id });
        return { ...x, p, m };
      }),
    );
    lap("mount");
    if (mounts.some((m) => m.m.sized < 0)) {
      const errs = (await errorsOf(mounts)).join("; ");
      const bad = mounts.find((m) => m.m.sized < 0)!;
      if (bad.kind === "rest" || bad.kind === "taps" || !strict) return { failures: [frameError(errs || "the app never reported a size")], warnings, ms };
    }
    const okMounts = mounts.filter((m) => m.m.sized >= 0);
    const frames = await Promise.all(okMounts.map((m) => frameOf(m.p, m.m)));
    const slots: Slot[] = okMounts.map((m, j) => ({ cfg: m.cfg, kind: m.kind, state: m.state, p: m.p, m: m.m, f: frames[j]!, idx: m.i }));
    const rest = slots.filter((s) => s.kind !== "taps");
    const taps = slots.filter((s) => s.kind === "taps");
    const live = (s: Slot) => s.f.waitForFunction(() => (globalThis as any).__m?.replica.live === true, undefined, { timeout: 3000, polling: 10 });
    const sample = (s: Slot, restKind: boolean) => s.f.evaluate(sampleExpr({ budget, rest: restKind, more, measure: strict && s.kind !== "taps" })) as Promise<Sample>;

    // Rest and state frames: sample, wait, sample. Taps frames play meanwhile.
    const restRun = (async () => {
      await Promise.all(rest.map(live));
      const a = await Promise.all(rest.map((r) => sample(r, true)));
      await new Promise((res) => setTimeout(res, GAP_MS));
      const b = await Promise.all(rest.map((r) => sample(r, true)));
      // Frame-coupled timing and actions nobody took, once the samples are in.
      const extra = more
        ? await Promise.all(
            rest.map(async (r) => {
              const fc = await r.f.evaluate(`(() => { try { return (${frameCoupling.toString()})(); } catch (e) { return []; } })()`).catch(() => []) as MoreIssue[];
              const st = await H<{ acts: unknown[] }>(r.p, "state", r.m.id);
              const own = st.acts.filter((x) => !(x && typeof x === "object" && typeof (x as { t?: unknown }).t === "string" && (x as { t: string }).t.startsWith("@")));
              if (own.length && r.kind === "rest")
                fc.push({ rule: "acts-before-person", key: "root", message: `the app sent ${own.length} action${own.length === 1 ? "" : "s"} on its own within a second of opening, before anyone tapped: ${JSON.stringify(own[0]).slice(0, 80)}`, detail: { actions: own.slice(0, 3) } });
              return fc;
            }),
          )
        : rest.map(() => []);
      return rest.map((r, i) => ({ r, issues: both(a[i]!.base, b[i]!.base), more: [...bothMore(a[i]!.more ?? [], b[i]!.more ?? []), ...extra[i]!], measure: b[i]!.measure ?? null, measureA: a[i]!.measure ?? null }));
    })();
    const tapRun = (async () => {
      await Promise.all(
        taps.map(async (t, i) => {
          await live(t);
          for (let round = 0; round < 2; round++) {
            await t.f.evaluate(tapSteps, { seed: seed * 1000 + i * 31 + round, me: "u1", room: t.m.room, n: 6 });
            const others = await t.f.evaluate(propose, { seed: seed * 7 + i + round * 101, users: ["u2", "u3"], room: t.m.room });
            for (const x of others) await H(t.p, "act", t.m.room, x.user, x.action);
          }
          await t.f.evaluate(pointerFuzz, { seed: seed * 13 + i, n: 12 });
          await t.f.waitForFunction(() => (globalThis as any).__m.replica.pending.length === 0, undefined, { timeout: 2000, polling: 10 }).catch(() => {});
        }),
      );
      lap("taps");
      const a = await Promise.all(taps.map((t) => sample(t, false)));
      await new Promise((res) => setTimeout(res, GAP_MS));
      const b = await Promise.all(taps.map((t) => sample(t, false)));
      return taps.map((r, i) => ({ r, issues: both(a[i]!.base, b[i]!.base), more: bothMore(a[i]!.more ?? [], b[i]!.more ?? []), measure: null as Measure | null, measureA: null as Measure | null }));
    })();
    const [restOut, tapOut] = await Promise.all([restRun, tapRun]);
    lap("lint");

    const axe = (axeSource ??= readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8"));
    const axeOut = await Promise.all(
      taps
        .filter((t) => t.cfg.width === 393 || (!widths.includes(393) && t.cfg.width === widths[0]))
        .map(async (t) => {
          // Evaluated by the debugger protocol, so the frame's CSP (no eval) does not apply.
          if (!(await t.f.evaluate(() => !!(globalThis as any).axe))) await t.f.evaluate(axe);
          return { t, v: await t.f.evaluate(runAxe) };
        }),
    );
    lap("axe");

    // Frame errors (a view that throws, a blank render).
    const baseMounts = mounts.filter((m) => m.kind === "rest" || m.kind === "taps");
    const errs = await errorsOf(baseMounts);
    const blank = errs.find((e) => /Rendered nothing/.test(e));
    if (blank) failures.push({ rule: "blank-render", message: "the app rendered nothing visible after mount" });
    const other = errs.filter((e) => !/Rendered nothing/.test(e));
    if (other.length) failures.push(frameError(other.join("; ")));
    if (strict) {
      for (const m of mounts.filter((x) => x.state)) {
        const e = await errorsOf([m]);
        if (e.length && !found.some((f) => f.rule === "state-render-error" && f.detail?.state === m.state!.name))
          found.push({ rule: "state-render-error", message: `in the ${m.state!.name} state the view threw or rendered nothing: ${e.join("; ").slice(0, 200)}`, trace: stateTrace(m.state!), detail: { state: m.state!.name } });
      }
    }

    // One failure per rule and element, naming every width/mode it showed in.
    type Seen = { issue: Issue; where: string[]; slot: Slot; rule: string; base: boolean; state?: CoverageState };
    const seen = new Map<string, Seen>();
    const note = (rule: string, is: Issue, r: Slot, map: "base" | "found") => {
      const sname = r.state?.name ?? "typical";
      const k = `${map}|${rule}|${is.key}|${sname}`;
      const e = seen.get(k) ?? { issue: is, where: [], slot: r, rule, base: map === "base", ...(r.state ? { state: r.state } : {}) };
      e.where.push(`${r.cfg.width} ${r.cfg.mode}`);
      seen.set(k, e);
    };
    // Layout issues of the typical rest frame per config, so state frames report only what is new.
    const typicalKeys = new Set<string>();
    // A rule that already fails in the typical state is reported there; states add only new rules.
    for (const { r, issues, more: m } of [...restOut, ...tapOut]) if (r.kind === "rest" || r.kind === "taps") for (const is of [...issues, ...m]) typicalKeys.add(`${r.idx}|${is.rule}`);
    const hashes = new Map<string, string>();
    for (const out of [...restOut, ...tapOut]) {
      const r = out.r;
      if (!r.state) {
        for (const is of out.issues) {
          if (is.rule === "blank-render" && blank) continue;
          note(is.rule, is, r, "base");
        }
        for (const is of out.more) note(is.rule, is, r, "found");
      } else {
        // Same picture as a state already checked at this config: nothing new to say.
        const h = out.measure?.hash;
        if (h) {
          const k = `${r.idx}|${h}`;
          if (hashes.has(k)) continue;
          hashes.set(k, r.state.name);
        }
        for (const is of [...out.issues, ...out.more]) {
          if (typicalKeys.has(`${r.idx}|${is.rule}`)) continue;
          if (is.rule === "blank-render") continue;
          const rule = LAYOUT.has(is.rule) ? (r.state.name === "overloaded" ? "overload-overflow" : "state-layout") : is.rule;
          note(rule, { ...is, message: `${is.message}`, detail: { ...is.detail, lint: is.rule } }, r, "found");
        }
      }
      // Data-shape checks on rest and state frames.
      const me = out.measure;
      if (strict && me && r.kind !== "taps") {
        const done = (r.state ? r.state.finishedForMe : !!o.typicalFinished) || me.finishedLook;
        if (me.innerH >= 120 && (me.band >= Math.max(96, 0.4 * me.innerH) || me.fill < 0.15))
          note("empty-state-blank", { rule: "empty-state-blank", key: "root", message: `the card is mostly empty: a ${me.band} px blank band in ${me.innerH} px, ${Math.round(me.fill * 100)} in 100 of it filled`, ...(me.bandBox ? { box: me.bandBox } : {}), detail: { band: me.band, height: me.innerH, fill: me.fill } }, r, "found");
        // A card with no controls at all is showing a result; one whose only controls are disabled is stuck.
        if (!done && me.enabled === 0 && me.controls > 0)
          note("no-enabled-action", { rule: "no-enabled-action", key: "root", box: me.rootBox, message: me.disabledPrimaries.length ? `the only action offered is the disabled "${me.disabledPrimaries[0]}" button, and nothing else can be tapped, though the state is not finished` : "nothing can be tapped or typed, though the state is not finished", detail: { disabled: me.disabledPrimaries } }, r, "found");
        for (const orph of me.orphans) note("orphan-decoration", { rule: "orphan-decoration", key: orph.key, message: `${orph.what}: a pointer or decoration shown without its subject`, box: orph.box }, r, "found");
      }
    }
    const crops: { f: Failure; slot: Slot; box: Box }[] = [];
    for (const { issue, where, slot, rule, state, base: isBase } of seen.values()) {
      const at = [...new Set(where)].join(", ");
      const f: Failure = {
        rule,
        message: `${state ? `in the ${state.name} state: ` : ""}${issue.message} (at ${at})`,
        detail: { element: issue.key, ...(issue.detail ?? {}), state: state?.name ?? (slot.kind === "taps" ? "after taps" : "typical"), at: [...new Set(where)], ...(state ? { stateNote: state.note } : {}) },
        ...(state ? { trace: stateTrace(state) } : {}),
      };
      if (isBase) failures.push({ rule: f.rule, message: `${issue.message} (at ${at})`, detail: { element: issue.key, ...(strict ? { box: issue.box } : {}) } });
      else found.push(f);
      if (issue.box) crops.push({ f: isBase ? failures[failures.length - 1]! : f, slot, box: issue.box });
    }
    for (const { t, v } of axeOut)
      for (const x of v) {
        const f: Failure = { rule: "axe", message: `${x.id}: ${x.help} (${x.nodes} element${x.nodes === 1 ? "" : "s"}, ${t.cfg.mode})`, detail: { impact: x.impact, target: x.target } };
        if (x.impact === "critical" || x.impact === "serious") {
          if (!failures.some((g) => g.rule === "axe" && g.message.startsWith(x.id + ":"))) failures.push(f);
        } else if (!warnings.some((g) => g.message.startsWith(x.id + ":"))) warnings.push(f);
      }

    const grouped = group(found);
    found.length = 0;
    found.push(...grouped);
    // Cropped pictures of the first few failing regions, with the box outlined.
    const kept = new Set<Failure>([...failures, ...found]);
    const cropOne = new Set<Failure>();
    const todo = crops.filter((c) => kept.has(c.f) && !cropOne.has(c.f) && cropOne.add(c.f));
    if (o.artifacts !== false && todo.length) {
      const dir = typeof o.artifacts === "string" ? o.artifacts : join(tmpdir(), "muse-verify", tag);
      const want = todo.slice(0, o.crops ?? 4);
      for (const [n, c] of want.entries()) {
        try {
          const png = await crop(c.slot, c.box);
          if (!png) continue;
          mkdirSync(dir, { recursive: true });
          const file = join(dir, `${n + 1}-${c.f.rule}-${c.slot.cfg.width}-${c.slot.cfg.mode}.png`);
          writeFileSync(file, png);
          c.f.image = file;
          if (o.images) c.f.imageData = `data:image/png;base64,${png.toString("base64")}`;
        } catch {}
      }
      lap("crops");
    }
  } finally {
    await Promise.all(
      [...perPage.keys()].map((p) =>
        p
          .evaluate(([ids, tag]) => {
            for (const id of ids as number[]) (window as any).H.destroy(id);
            document.getElementById(tag as string)?.remove();
          }, [mounted.filter((m) => m.p === p).map((m) => m.id), tag] as const)
          .catch(() => {}),
      ),
    );
    lap("total");
  }
  return { failures, warnings, ms, more: found };
}

/** One failure per rule, state and underlying lint: the first, with how many more are like it. */
function group(list: Failure[]): Failure[] {
  const by = new Map<string, { f: Failure; n: number }>();
  for (const f of list) {
    const d = (f.detail ?? {}) as Record<string, unknown>;
    const k = `${f.rule}|${d.state ?? ""}|${d.lint ?? ""}`;
    const e = by.get(k);
    if (!e) by.set(k, { f, n: 0 });
    else e.n++;
  }
  return [...by.values()].map(({ f, n }) => {
    if (n) {
      f.message = `${f.message}; and ${n} more like it`;
      f.detail = { ...f.detail, more: n };
    }
    return f;
  });
}

/** A PNG of the box (frame coordinates) plus a margin, with the box outlined. */
async function crop(s: Slot, box: Box): Promise<Buffer | null> {
  const el = await s.p.$(`iframe[data-h="${s.m.id}"]`);
  const fr = await el?.boundingBox();
  if (!fr) return null;
  await s.f.evaluate((b) => {
    const d = document.createElement("div");
    d.id = "__muse_outline";
    d.style.cssText = `position:absolute;left:${b.x - 2}px;top:${b.y - 2}px;width:${b.w + 4}px;height:${b.h + 4}px;outline:2px solid rgb(255,0,80);z-index:2147483647;pointer-events:none`;
    document.body.append(d);
  }, box);
  const m = 16;
  const x = Math.max(fr.x, fr.x + box.x - m), y = Math.max(fr.y, fr.y + box.y - m);
  const w = Math.min(fr.x + fr.width, fr.x + box.x + box.w + m) - x, h = Math.min(fr.y + fr.height, fr.y + box.y + box.h + m) - y;
  try {
    if (w < 2 || h < 2) return null;
    return await s.p.screenshot({ clip: { x, y, width: w, height: h }, fullPage: true, animations: "allow" });
  } finally {
    await s.f.evaluate(() => document.getElementById("__muse_outline")?.remove()).catch(() => {});
  }
}

function frameError(message: string): Failure {
  return { rule: "render-error", message: `the view threw or the frame reported an error: ${message.slice(0, 300)}` };
}

async function errorsOf(ms: { p: Page; m: Mounted }[]): Promise<string[]> {
  const out = await Promise.all(ms.map((m) => m.p.evaluate((id) => (window as any).H.state(id), m.m.id) as Promise<{ errors: string[] }>));
  return [...new Set(out.flatMap((s) => s.errors))];
}

async function frameOf(p: Page, m: Mounted): Promise<Frame> {
  const f = await (await p.$(`iframe[data-h="${m.id}"]`))?.contentFrame();
  if (!f) throw new Error("frame not found");
  return f;
}

function both(a: Issue[], b: Issue[]): Issue[] {
  const keys = new Set(b.map((x) => `${x.rule}|${x.key}`));
  return a.filter((x) => keys.has(`${x.rule}|${x.key}`));
}

/** Like `both`, and a spin must keep its speed between the samples (a legit spin slows down). */
function bothMore(a: MoreIssue[], b: MoreIssue[]): MoreIssue[] {
  const byKey = new Map(b.map((x) => [`${x.rule}|${x.key}`, x]));
  return a.flatMap((x) => {
    const y = byKey.get(`${x.rule}|${x.key}`);
    if (!y) return [];
    if (x.rule === "runaway-spin" && Number(y.detail?.omega) < 0.7 * Number(x.detail?.omega)) return [];
    return [y];
  });
}

// ---- Functions below run inside the frame (serialized by Playwright; no closures). ----

// ---- Functions below run inside the frame (serialized by Playwright; no closures). ----

/** Taps driven by arbitrary: find the control whose click dispatches the proposed action. */
export async function tapSteps(o: { seed: number; me: string; room: string; n: number }): Promise<void> {
  const M = (globalThis as any).__m;
  const app = (globalThis as any).__muse;
  const r = app.rng(o.seed);
  const visible = (el: Element) => {
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };
  const controls = () =>
    [...document.querySelectorAll(".m-root button:not(:disabled), .m-root [role=button], .m-root input[type=checkbox], .m-root a[href], .m-root input:not([type]), .m-root input[type=text]")].filter(visible) as HTMLElement[];
  for (let i = 0; i < o.n; i++) {
    const st = M.replica.state;
    let want: unknown = null;
    try {
      want = M.def.arbitrary(st.s, o.me, app.rng(o.seed * 7 + i), { room: o.room, members: st.members });
    } catch {}
    const list = controls().filter((c) => c.tagName !== "INPUT");
    let target: HTMLElement | null = null;
    if (want != null) {
      const orig = M.replica.dispatch;
      let got: unknown = null;
      M.replica.dispatch = (a: unknown) => void (got = a);
      try {
        for (const c of list) {
          got = null;
          c.click();
          if (got !== null && JSON.stringify(got) === JSON.stringify(want)) {
            target = c;
            break;
          }
        }
      } finally {
        M.replica.dispatch = orig;
      }
    }
    // Type into a text field now and then, so forms get exercised.
    const inputs = controls().filter((c) => c.tagName === "INPUT") as HTMLInputElement[];
    if (inputs.length && r.next() < 0.3) {
      const inp = r.pick(inputs);
      inp.value = r.pick(["Sushi", "12.50", "A much longer entry than anyone would type here", "", "7"]);
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (target) target.click();
    else if (want != null && r.next() < 0.6) M.dispatch(want);
    else {
      const l = controls().filter((c) => c.tagName !== "INPUT");
      if (l.length) r.pick(l).click();
    }
    await new Promise((res) => setTimeout(res, 4));
  }
}

/** Actions other people would take now, from arbitrary. */
export function propose(o: { seed: number; users: string[]; room: string }): { user: string; action: unknown }[] {
  const M = (globalThis as any).__m;
  const app = (globalThis as any).__muse;
  const out: { user: string; action: unknown }[] = [];
  o.users.forEach((user, i) => {
    try {
      const st = M.replica.state;
      const a = M.def.arbitrary(st.s, user, app.rng(o.seed + i), { room: o.room, members: st.members });
      if (a != null) out.push({ user, action: JSON.parse(JSON.stringify(a)) });
    } catch {}
  });
  return out;
}

/** Raw pointer events at random points of the app. */
export function pointerFuzz(o: { seed: number; n: number }): void {
  const r = (globalThis as any).__muse.rng(o.seed);
  const root = document.querySelector(".m-root")!.getBoundingClientRect();
  for (let i = 0; i < o.n; i++) {
    const x = root.left + r.next() * root.width;
    const y = root.top + r.next() * root.height;
    const el = document.elementFromPoint(x, y);
    if (!el) continue;
    const init = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0 };
    el.dispatchEvent(new PointerEvent("pointerdown", init));
    el.dispatchEvent(new MouseEvent("mousedown", init));
    el.dispatchEvent(new PointerEvent("pointermove", { ...init, clientX: x + 3 }));
    el.dispatchEvent(new PointerEvent("pointerup", init));
    el.dispatchEvent(new MouseEvent("mouseup", init));
    (el as HTMLElement).click?.();
  }
}

/** Layout lint from DOM geometry and computed colors. Keys are stable element paths. */
export function lint(o: { budget: number; rest: boolean }): Issue[] {
  const root = document.querySelector(".m-root") as HTMLElement;
  const R = root.getBoundingClientRect();
  const out: Issue[] = [];
  const path = (el: Element): string => {
    const parts: string[] = [];
    for (let e: Element | null = el; e && e !== root; e = e.parentElement) {
      const i = e.parentElement ? [...e.parentElement.children].indexOf(e) : 0;
      parts.unshift(`${e.tagName.toLowerCase()}${e.classList[0] ? "." + e.classList[0] : ""}:${i}`);
    }
    return parts.join(">") || "root";
  };
  const boxOf = (el: Element) => {
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) };
  };
  const say = (rule: string, el: Element, message: string, extra = "") => out.push({ rule, key: path(el) + extra, message, box: boxOf(el) });
  const cs = (el: Element) => getComputedStyle(el);
  const hidden = (el: Element) => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const s = cs(e);
      if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return true;
      if (e.getAttribute("aria-hidden") === "true") return true;
      if (e === root) break;
    }
    return false;
  };
  const rotated = (el: Element) => {
    for (let e: Element | null = el; e && e !== root; e = e.parentElement) {
      const t = cs(e).transform;
      if (t && t !== "none") {
        const m = new DOMMatrix(t);
        if (Math.abs(m.b) > 0.01 || Math.abs(m.c) > 0.01) return true;
      }
    }
    return false;
  };
  /** The nearest animated element at or above `el`, if any. */
  const moving = (el: Element): Element | null => {
    for (let e: Element | null = el; e && e !== root; e = e.parentElement) if (e.getAnimations?.().length) return e;
    return null;
  };

  // Blank render.
  const media = [...root.querySelectorAll("canvas,img,svg")].some((m) => m.getBoundingClientRect().width * m.getBoundingClientRect().height > 64);
  if (!root.innerText.trim() && !media) say("blank-render", root, "the app shows nothing: no text and no picture");
  // Height at rest.
  if (o.rest && R.height > o.budget + 0.5) say("too-tall", root, `the app is ${Math.round(R.height)} px tall at rest; the budget is ${o.budget}`);

  // Text boxes.
  type T = { el: Element; node: Text; rects: DOMRect[]; vis: DOMRect[]; text: string };
  const texts: T[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const text = n.data.trim();
    if (!text || !n.parentElement || hidden(n.parentElement)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
    let vis = rects;
    // Text in a box that clips it (an ellipsis, or overflow: hidden) is drawn only inside the box;
    // whether it is cut off is the clipped-text check's business, not the overlap check's.
    const ps = cs(n.parentElement);
    if (ps.overflowX !== "visible") {
      const pb = n.parentElement.getBoundingClientRect();
      vis = rects.map((r) => new DOMRect(Math.max(r.left, pb.left), r.top, Math.max(0, Math.min(r.right, pb.right) - Math.max(r.left, pb.left)), r.height)).filter((r) => r.width > 0.5);
    }
    if (rects.length) texts.push({ el: n.parentElement, node: n, rects, vis, text });
  }

  // Clipped text: glyphs past an ancestor that clips them, without an ellipsis or a marquee.
  for (const t of texts) {
    const s = cs(t.el);
    const ellipsis = s.textOverflow === "ellipsis" && s.whiteSpace.startsWith("nowrap");
    for (let a: Element | null = t.el; a; a = a.parentElement) {
      const as = cs(a);
      const clipX = as.overflowX !== "visible", clipY = as.overflowY !== "visible";
      if (clipX || clipY) {
        const b = a.getBoundingClientRect();
        const over = t.rects.some((r) => (clipX && (r.right > b.right + 1 || r.left < b.left - 1)) || (clipY && (r.bottom > b.bottom + 1 || r.top < b.top - 1)));
        // A marquee: an animated line much wider than the box it scrolls through.
        const mv = moving(t.el);
        const marquee = !!mv && mv.getBoundingClientRect().width > b.width * 1.5;
        if (over && !(ellipsis && !t.rects.some((r) => clipY && (r.bottom > b.bottom + 1 || r.top < b.top - 1))) && !marquee)
          say("clipped-text", t.el, `text "${t.text.slice(0, 40)}" is cut off by its box; let it wrap or end it with an ellipsis`);
        break;
      }
      if (a === root) break;
    }
  }

  // Text over text.
  const area = (r: DOMRect) => r.width * r.height;
  const badge = (t: T) => t.text.length <= 3 && t.rects.every((r) => r.width <= 28 && r.height <= 28);
  for (let i = 0; i < texts.length; i++)
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i]!, b = texts[j]!;
      if (a.el === b.el || badge(a) || badge(b) || rotated(a.el) || rotated(b.el)) continue;
      let hit = false;
      for (const ra of a.vis)
        for (const rb of b.vis) {
          const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (w > 0 && h > 0 && w * h > 0.25 * Math.min(area(ra), area(rb))) hit = true;
        }
      if (hit) out.push({ rule: "text-overlap", key: path(a.el) + "~" + path(b.el), message: `"${a.text.slice(0, 30)}" and "${b.text.slice(0, 30)}" overlap`, box: boxOf(a.el) });
    }

  // Outside the app: visible boxes reaching more than 6 px past the app's sides.
  for (const el of root.querySelectorAll("*")) {
    if (hidden(el)) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 12 || b.height < 12) continue;
    if (b.left < R.left - 6 || b.right > R.right + 6) {
      let clipped = false;
      for (let a = el.parentElement; a && a !== root; a = a.parentElement) {
        const s = cs(a);
        if (s.overflowX !== "visible") {
          const q = a.getBoundingClientRect();
          if (q.left >= R.left - 6 && q.right <= R.right + 6) clipped = true;
          break;
        }
      }
      if (!clipped && !rotated(el)) say("outside-app", el, `a ${el.tagName.toLowerCase()} reaches ${Math.round(Math.max(R.left - b.left, b.right - R.right))} px past the app's edge`);
    }
  }

  // Contrast, from computed colors.
  const parse = (c: string): number[] | null => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
  };
  const lum = (c: number[]) => {
    const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!);
  };
  const over = (fg: number[], bg: number[]) => [0, 1, 2].map((i) => fg[i]! * fg[3]! + bg[i]! * (1 - fg[3]!)).concat(1);
  const background = (el: Element): number[] | null => {
    const layers: number[][] = [];
    for (let e: Element | null = el; e; e = e.parentElement) {
      const s = cs(e);
      if (s.backgroundImage && s.backgroundImage !== "none") return null;
      const c = parse(s.backgroundColor);
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
  const checked = new Set<Element>();
  for (const t of texts) {
    if (checked.has(t.el)) continue;
    checked.add(t.el);
    if (t.el.closest("button:disabled,[aria-disabled=true],input:disabled,select:disabled")) continue;
    const s = cs(t.el);
    let fg = parse(s.color);
    const bg = background(t.el);
    if (!fg || !bg) continue;
    let op = 1;
    for (let e: Element | null = t.el; e && e !== document.documentElement; e = e.parentElement) op *= Number(cs(e).opacity);
    fg = [fg[0]!, fg[1]!, fg[2]!, fg[3]! * op];
    const solid = over(fg, bg);
    const ratio = (Math.max(lum(solid), lum(bg)) + 0.05) / (Math.min(lum(solid), lum(bg)) + 0.05);
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    const need = large ? 3 : 4.5;
    if (ratio < need - 0.005) say("contrast", t.el, `"${t.text.slice(0, 30)}" has contrast ${ratio.toFixed(2)}:1, under ${need}:1`);
  }

  // Hit areas: interactive elements, including a ::before/::after that extends them.
  const px = (v: string) => (v.endsWith("px") ? parseFloat(v) : 0);
  for (const el of root.querySelectorAll("button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=checkbox],[role=switch],[role=radio],[role=tab]")) {
    if (hidden(el) || (el as HTMLButtonElement).disabled) continue;
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    let w = b.width, h = b.height;
    for (const pseudo of ["::before", "::after"]) {
      const s = getComputedStyle(el, pseudo);
      if (s.content === "none" || s.position !== "absolute") continue;
      w = Math.max(w, b.width - Math.min(0, px(s.left)) - Math.min(0, px(s.right)));
      h = Math.max(h, b.height - Math.min(0, px(s.top)) - Math.min(0, px(s.bottom)));
    }
    if (w < 43.5 || h < 43.5) say("hit-area", el, `a ${el.tagName.toLowerCase()} has a ${Math.round(w)}x${Math.round(h)} px hit area; tap targets need 44x44`);
  }
  return out;
}

type AxeViolation = { id: string; help: string; impact: string; nodes: number; target: string[] };

/** axe-core on the app root, without the page-level and color rules (contrast is linted above). */
export async function runAxe(): Promise<AxeViolation[]> {
  const g = globalThis as any;
  const r = await g.axe.run(document.querySelector(".m-root"), {
    resultTypes: ["violations"],
    rules: { "color-contrast": { enabled: false }, region: { enabled: false }, "landmark-one-main": { enabled: false }, "page-has-heading-one": { enabled: false } },
  });
  return r.violations.map((v: any) => ({ id: v.id, help: v.help, impact: v.impact ?? "minor", nodes: v.nodes.length, target: v.nodes.slice(0, 3).map((n: any) => String(n.target)) }));
}
