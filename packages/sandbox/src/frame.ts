// Runs inside the sandboxed frame. Bundled to one classic script and inlined in the frame document
// (see frame-html.ts). Boot: expose the @muse/app runtime, map the bare imports to it, wait for
// the host's MessagePort. Mount: import the app code from a blob URL, then run
// @muse/sync replica -> app fold -> view -> DOM, and report size, summary, clock and errors.

import * as app from "@muse/app";
import * as jsxRuntime from "@muse/app/jsx-runtime";
import { render, ctx, paintCanvases, css, cssVars, batch, appReducer, sameMembers, wantsClock, type Folded } from "@muse/app/internal";
import type { AppDef, Json, Theme } from "@muse/app";
import type { Member, S2C } from "@muse/protocol";
import { ReplicaCore } from "@muse/sync/replica";
import type { TransportHandlers } from "@muse/sync/transport";
import type { FrameToHost, HostToFrame, Mount } from "./protocol.ts";

const g = globalThis as any;
g.__muse = app;
g.__musejsx = jsxRuntime;
const shim = (global: string, names: string[]) =>
  URL.createObjectURL(new Blob([`const m=globalThis.${global};export const {${names.join(",")}}=m;`], { type: "text/javascript" }));
const map = document.createElement("script");
map.type = "importmap";
map.textContent = JSON.stringify({
  imports: { "@muse/app": shim("__muse", Object.keys(app)), "@muse/app/jsx-runtime": shim("__musejsx", Object.keys(jsxRuntime)) },
});
document.head.append(map);

const style = document.createElement("style");
style.textContent = `html,body{margin:0;background:transparent}` + css;
document.head.append(style);
const root = document.createElement("div");
root.className = "m-root";
document.body.append(root);

let port: MessagePort | undefined;
const post = (m: FrameToHost) => port?.postMessage(m);
/** `fatal`: the tool has nothing to show (it did not load, or its first render threw or drew nothing). */
const fail = (e: unknown, fatal = false) => {
  const err = e instanceof Error ? e : new Error(String(e));
  post({ t: "error", message: err.message, ...(err.stack ? { stack: err.stack } : {}), ...(fatal ? { fatal: true } : {}) });
};
window.addEventListener("error", (e) => fail(e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => fail(e.reason));
ctx.haptic = (kind) => post({ t: "haptic", kind });
// Apps never submit a form for real: that would navigate the frame away.
document.addEventListener("submit", (e) => e.preventDefault(), true);

// Server-aligned time: the last tick (or mount) plus local time since.
let base = 0, baseAt = 0;
const now = () => Math.round(base + performance.now() - baseAt);
ctx.now = now;

// For measurement: when the last render committed to the DOM and when the next frame began.
const paints = () => {
  const commit = performance.timeOrigin + performance.now();
  requestAnimationFrame(() => (g.__musePaint = { n: (g.__musePaint?.n ?? 0) + 1, commit, at: performance.timeOrigin + performance.now() }));
};

// Messages that arrive while the app module is still loading.
const early: HostToFrame[] = [];
let handle = (m: HostToFrame) => void early.push(m);
let clockOn = false;
const syncClock = () => {
  const on = wantsClock();
  if (on !== clockOn) post({ t: "clock", on: (clockOn = on) });
};

async function mount(m: Mount) {
  base = m.now;
  baseAt = performance.now();
  app.clock.value = m.now;
  const url = URL.createObjectURL(new Blob([m.code], { type: "text/javascript" }));
  const def = (await import(url)).default as AppDef<Json, Json>;
  URL.revokeObjectURL(url);
  if (!def || typeof def.view !== "function" || typeof def.reduce !== "function" || typeof def.init !== "function")
    throw new Error("The module's default export is not an app (use defineApp)");

  let h: TransportHandlers | undefined;
  const replica = new ReplicaCore<Folded<Json>>(
    appReducer(def, m.room),
    { start: (x) => void (h = x), send: (c) => post({ t: "send", m: c }), stop() {} },
    { room: m.room, user: m.me, client: m.client, now },
  );
  const view = app.signal({ state: replica.state, confirmed: replica.confirmed, pending: false });
  // Avatars are pictures (data URIs), so they stay out of the log: `want` is what gets recorded
  // (id and name), `faces` is laid back over the members an app sees.
  const faces = new Map<string, string>();
  const bare = (list: Member[]) => {
    faces.clear();
    for (const x of list) if (x.avatar) faces.set(x.id, x.avatar);
    return list.map(({ id, name }) => ({ id, name }));
  };
  const dressed = (list: Member[]) => (faces.size ? list.map((x) => (faces.has(x.id) ? { ...x, avatar: faces.get(x.id)! } : x)) : list);
  let want: Member[] | undefined = m.members && bare(m.members);
  // The list this frame last recorded. Members reach the app through its log: a frame records its
  // list when the log has none yet, or once for each new list the host gives it. It never answers
  // another phone's list with its own: two phones that disagree (a tab left open on older code, a
  // chat still loading its members) would otherwise take turns rewriting the list, hundreds of
  // entries a second for as long as both stay open, and every frame on the page would starve.
  let recorded: Member[] | null = null;
  const update = () => {
    batch(() => {
      app.clock.value = now();
      view.value = { state: replica.state, confirmed: replica.confirmed, pending: replica.pending.length > 0 };
    });
    if (!want || !replica.live || sameMembers(want, replica.state.members)) return;
    if (replica.state.members.length > 0 && recorded && sameMembers(want, recorded)) return;
    recorded = want;
    replica.dispatch({ t: "@members", members: want });
  };
  replica.subscribe(update);
  const local = app.signal<Record<string, unknown>>({ ...(def.local ?? {}) });
  const theme = app.signal<Theme>(m.theme);
  const setLocal = (p: Record<string, unknown>) => (local.value = { ...local.value, ...p });
  const dispatch = (a: Json) => {
    // System actions are the host's; an app cannot send them.
    if (a && typeof a === "object" && !Array.isArray(a) && typeof a.t === "string" && a.t.startsWith("@")) return;
    if (m.debug) g.__m.sent.push(a);
    replica.dispatch(a);
  };
  if (m.debug) g.__m = { def, replica, dispatch, sent: [] as unknown[] };

  handle = (x) => {
    if (x.t === "recv") {
      if (x.m.t === "entry") {
        // Never let the clock run behind an entry we already hold.
        const t = x.m.entry.time;
        if (t > now()) (base = t), (baseAt = performance.now());
      }
      h?.message(x.m as S2C);
      update();
    } else if (x.t === "reconnect") {
      h?.close();
      h?.open();
    } else if (x.t === "members") {
      want = bare(x.members);
      update();
    } else if (x.t === "theme") theme.value = x.theme;
  };

  app.effect(() => {
    document.documentElement.style.cssText = cssVars(theme.value);
  });
  // Whether a render has drawn anything yet. A render that throws keeps the last good one on screen
  // (the app's view throws before the DOM is touched); only a first render that throws is fatal.
  let drawn = false;
  app.effect(() => {
    const v = view.value;
    const people = dressed(v.state.members);
    ctx.members = people;
    ctx.theme = theme.value;
    const props = {
      state: v.state.s,
      confirmed: v.confirmed.s,
      pending: v.pending,
      me: m.me,
      members: people,
      dispatch,
      theme: theme.value,
      local: local.value,
      setLocal,
    };
    try {
      render(def.view(props as never) as app.Child, root);
      drawn = true;
    } catch (e) {
      fail(e, !drawn);
    }
    try {
      paintCanvases(app.clock.peek());
    } catch (e) {
      fail(e);
    }
    syncClock();
    paints();
  });
  let summary = "";
  app.effect(() => {
    const v = view.value;
    let text = "";
    try {
      text = String(def.summary(v.state.s, { room: m.room, members: v.state.members }));
    } catch (e) {
      fail(e);
    }
    if (text !== summary) post({ t: "summary", text: (summary = text) });
  });
  // Sizes, and whether the first render drew anything, are read when the frame has been laid out:
  // a ResizeObserver runs after layout, and not at all while the frame is not rendered. Chrome does
  // not lay out a cross-origin frame that was hidden (the pool parks warm frames hidden) until the
  // page has rendered it where it now sits, so measuring right after the first render read 0 and
  // failed every tool that mounted in that gap. A frame with no width at all (its slot is not laid
  // out, or the host gave it width 0) is not an empty tool either: it waits for a width.
  let height = -1;
  let judged = false;
  const measure = () => {
    if (innerWidth === 0) return;
    if (!judged && drawn) {
      judged = true;
      const r = document.createRange();
      r.selectNodeContents(root);
      if (!root.firstChild || r.getBoundingClientRect().height === 0) fail(new Error("Rendered nothing after mount"), true);
    }
    const hgt = Math.ceil(root.getBoundingClientRect().height);
    if (hgt !== height) post({ t: "size", height: (height = hgt) });
    // Canvases skipped while the frame had no layout draw now.
    try {
      paintCanvases(app.clock.peek());
    } catch (e) {
      fail(e);
    }
  };
  new ResizeObserver(measure).observe(root);
  // An empty root does not resize when the frame gets its width; the frame's own resize does.
  addEventListener("resize", measure);
  for (const x of early.splice(0)) handle(x);
}

function onMessage(e: MessageEvent<HostToFrame>) {
  const m = e.data;
  if (m.t === "tick") {
    base = m.now;
    baseAt = performance.now();
    batch(() => (app.clock.value = m.now));
    paintCanvases(m.now);
    syncClock();
  } else if (m.t === "mount") mount(m).catch((e) => fail(e, true));
  else handle(m);
}

window.addEventListener("message", (e) => {
  if (port || e.source !== parent || !e.ports[0]) return;
  port = e.ports[0];
  port.onmessage = onMessage;
  const build = document.querySelector<HTMLMetaElement>('meta[name="muse-build"]')?.content;
  post({ t: "ready", ...(build ? { build } : {}) });
});
