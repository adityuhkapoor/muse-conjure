// Host side: a pool of warm frames and a pipe to each mounted app. The host never evaluates app
// code; it moves wire messages between the frame and a Transport (one room on the shared socket).
//
// Warm frames must never reload. With `Element.moveBefore` a warm frame is moved into the slot
// atomically. Without it (Safari, WKWebView) re-parenting an iframe reloads it, so frames stay
// in a positioned layer at the end of <body> and each mounted frame is laid over its slot (a
// placeholder of the same size) and clipped to the slot's scroll containers, every frame.

import type { C2S, Member, S2C } from "@muse/protocol";
import type { Theme } from "@muse/app";
import type { Transport } from "@muse/sync/transport";
import { frameHtml, SANDBOX } from "./frame-html.ts";
import type { FrameToHost, HostToFrame } from "./protocol.ts";

export type MountOpts = {
  code: string;
  room: string;
  me: string;
  theme: Theme;
  /** Fresh per session; generated when left out. */
  client?: string;
  /** The chat's members; the frame records them in the app's log (`@members`). */
  members?: Member[];
  /** The app room's transport, e.g. `sharedSocket(url).transport(room)`. Without one, pipe by hand with receive/onSend. */
  transport?: Transport;
  debug?: boolean;
};

export interface AppHandle {
  readonly frame: HTMLIFrameElement;
  /** How the frame was placed: moved into the slot, laid over it from the layer, or loaded cold. */
  readonly placement: "moved" | "layer" | "cold";
  setTheme(theme: Theme): void;
  setMembers(members: Member[]): void;
  /** Hand-piping (no transport): a server message for this room, and the socket coming back. */
  receive(m: S2C): void;
  reconnect(): void;
  onSend(fn: (m: C2S) => void): () => void;
  onSize(fn: (height: number) => void): () => void;
  onError(fn: (e: { message: string; stack?: string; fatal?: boolean }) => void): () => void;
  onSummary(fn: (text: string) => void): () => void;
  onHaptic(fn: (kind: "light" | "medium" | "success") => void): () => void;
  destroy(): void;
}

export interface Pool {
  mount(el: Element, opts: MountOpts): AppHandle;
  /** Frames warmed and waiting. */
  readonly warm: number;
  /** "move" with Element.moveBefore, else "layer". */
  readonly mode: "move" | "layer";
  /** Frames that asked for clock ticks right now. */
  readonly ticking: number;
  /** Resolves when every waiting frame has loaded the runtime. */
  ready(): Promise<void>;
  destroy(): void;
}

type Warm = { frame: HTMLIFrameElement; box: HTMLElement; port: MessagePort; ready: Promise<void> };

export type PoolOpts = {
  size: number;
  /** Load the frame from this URL (a different origin) instead of `srcdoc`. */
  frameUrl?: string;
  /**
   * Frame URLs to try in order, instead of `frameUrl`: a frame that does not report ready within
   * `fallbackMs` is loaded again from the next URL, and later frames start from the first URL that
   * worked. Every frame keeps `sandbox="allow-scripts"`, so its origin is opaque wherever it is served.
   */
  frameUrls?: string[];
  /** How long a frame URL gets before the next one is tried (default 1500 ms). */
  fallbackMs?: number;
  /** Called once, the first time a frame falls back to a URL after the first. */
  onFallback?: (url: string) => void;
  /** Force the positioned-layer path even where Element.moveBefore exists (for tests). */
  layer?: boolean;
  /**
   * This page's server start. A frame that says it comes from another start (the page was left
   * open across a restart, so its host code and the frame's may no longer agree) is not mounted:
   * it fails as not ready, and `onStale` is called with the frame's build.
   */
  build?: string;
  onStale?: (frameBuild: string) => void;
};

let clients = 0;
const freshClient = () => `c-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2)}-${++clients}`;

/** Rectangle of `el` clipped by every scrolling or clipping ancestor, in viewport px. */
function visibleRect(el: Element): { l: number; t: number; r: number; b: number } {
  const r = el.getBoundingClientRect();
  let l = r.left, t = r.top, rt = r.right, b = r.bottom;
  for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (s.overflowX === "visible" && s.overflowY === "visible") continue;
    const q = p.getBoundingClientRect();
    l = Math.max(l, q.left);
    t = Math.max(t, q.top);
    rt = Math.min(rt, q.right);
    b = Math.min(b, q.bottom);
  }
  return { l, t, r: rt, b };
}

export function createPool(o: PoolOpts): Pool {
  const urls = o.frameUrls?.length ? o.frameUrls : o.frameUrl ? [o.frameUrl] : [];
  const html = urls.length ? "" : frameHtml();
  /** The first URL that has worked (or is still being tried), for frames warmed from now on. */
  let urlAt = 0;
  /** How many times a frame goes through its URLs before it reports an error. */
  const ROUNDS = 3;
  let fellBack = false;
  const mode: Pool["mode"] = !o.layer && typeof Element !== "undefined" && "moveBefore" in Element.prototype ? "move" : "layer";
  const holder = document.body.appendChild(document.createElement("div"));
  holder.setAttribute("aria-hidden", "true");
  holder.style.cssText = "position:absolute;left:0;top:0;width:0;height:0";
  const idle: Warm[] = [];
  let staleSaid = false;
  const stale = (m: { build?: string }) => {
    if (!o.build || !m.build || m.build === o.build) return false;
    if (!staleSaid) (staleSaid = true), o.onStale?.(m.build);
    return true;
  };
  const ticking = new Set<MessagePort>();
  const laid = new Set<() => void>();
  let raf = 0;
  let destroyed = false;

  function warmFrame(parent: Element): Warm {
    const box = document.createElement("div");
    box.style.cssText = "position:absolute;left:-10000px;top:0;width:420px;visibility:hidden;pointer-events:none";
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", SANDBOX);
    frame.setAttribute("allow", "");
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.title = "App";
    frame.style.cssText = "display:block;border:0;width:100%;height:1px;background:transparent";
    if (urls.length > 1) {
      box.append(frame);
      parent.appendChild(box);
      return withFallback(frame, box);
    }
    if (urls[0]) frame.src = urls[0];
    else frame.srcdoc = html;
    const ch = new MessageChannel();
    const ready = new Promise<void>((res, rej) => {
      ch.port1.addEventListener("message", (e) => e.data?.t === "ready" && (stale(e.data) ? rej(new Error("Frame is from another start of the demo")) : res()));
      ch.port1.start();
      frame.addEventListener("load", () => frame.contentWindow?.postMessage({ t: "port" }, "*", [ch.port2]), { once: true });
      setTimeout(() => rej(new Error("Frame did not get ready in 10 s")), 10_000);
    });
    ready.catch(() => {});
    box.append(frame);
    parent.appendChild(box);
    return { frame, box, port: ch.port1, ready };
  }

  /**
   * A frame that tries `urls` in turn. The port handed out stays the same: messages are relayed to
   * and from the current attempt's channel, so a mount made while it is still trying works.
   */
  function withFallback(frame: HTMLIFrameElement, box: HTMLElement): Warm {
    const outer = new MessageChannel();
    let inner: MessagePort | null = null;
    let onReady: (() => void) | null = null;
    outer.port2.onmessage = (e) => inner?.postMessage(e.data);
    // Listeners on the handed-out port use addEventListener, which needs start().
    outer.port1.start();
    // Every document that loads in the frame gets its own fresh channel. A slow first URL can fire
    // its load after the next URL was set; a port made ahead of time would then go to the document
    // that is about to be replaced, and the one that stays would never hear from the host.
    frame.addEventListener("load", () => {
      const ch = new MessageChannel();
      inner?.close();
      inner = ch.port1;
      ch.port1.onmessage = (e) => {
        if (e.data?.t === "ready") {
          if (stale(e.data)) return void onStaleFrame?.();
          onReady?.();
        }
        outer.port2.postMessage(e.data);
      };
      frame.contentWindow?.postMessage({ t: "port" }, "*", [ch.port2]);
    });
    let onStaleFrame: (() => void) | null = null;
    let loaded = false;
    const attempt = (i: number, round = 0): Promise<void> =>
      new Promise<void>((res, rej) => {
        onReady = res;
        onStaleFrame = () => rej(new Error("Frame is from another start of the demo"));
        // A frame already in the page that navigates again adds an entry to the tab's history, so the
        // app's back would step back inside the frame instead. The first load sets src (it replaces the
        // initial about:blank); every retry and fallback replaces the frame's document instead.
        if (loaded && frame.contentWindow) frame.contentWindow.location.replace(urls[i]!);
        else frame.src = urls[i]!;
        loaded = true;
        frame.dataset.url = urls[i]!; // the URL in use (src keeps the first one after a replace)
        // A busy machine or a background tab can take far longer than the first wait; later rounds give every URL 15 s.
        setTimeout(() => rej(new Error(i < urls.length - 1 ? "fallback" : "Frame did not get ready")), round > 0 ? 15_000 : i < urls.length - 1 ? (o.fallbackMs ?? 1500) : 10_000);
      }).then(
        () => {
          urlAt = Math.max(urlAt, i);
          if (i > 0 && !fellBack) {
            fellBack = true;
            o.onFallback?.(urls[i]!);
          }
        },
        (e: Error) => {
          if (i >= urls.length - 1) {
            if (round >= ROUNDS - 1 || destroyed) throw e;
            return attempt(0, round + 1);
          }
          if (round === 0) urlAt = Math.max(urlAt, i + 1);
          return attempt(i + 1, round);
        },
      );
    const ready = attempt(urlAt);
    ready.catch(() => {});
    return { frame, box, port: outer.port1, ready };
  }

  const refill = () => {
    while (!destroyed && idle.length < o.size) {
      const w = warmFrame(holder);
      idle.push(w);
      w.ready.catch(() => {
        const at = idle.indexOf(w);
        if (at < 0) return;
        idle.splice(at, 1);
        w.box.remove();
        setTimeout(refill, 2000);
      });
    }
  };
  const schedule = (fn: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 500 }) : setTimeout(fn, 50));
  refill();

  // One loop: clock ticks for frames that asked, and positions for frames in the layer.
  const loop = () => {
    raf = 0;
    if (ticking.size) {
      const now = Date.now() + skew;
      for (const p of ticking) p.postMessage({ t: "tick", now } satisfies HostToFrame);
    }
    for (const place of laid) place();
    if (ticking.size || laid.size) raf = requestAnimationFrame(loop);
  };
  const kick = () => {
    if (!raf && !destroyed) raf = requestAnimationFrame(loop);
  };
  // Server time minus local time. A live entry's server time is never later than its arrival,
  // so the largest difference seen is a safe estimate.
  let skew = 0;
  let skewSeen = false;

  return {
    mode,
    get ticking() {
      return ticking.size;
    },
    get warm() {
      return idle.length;
    },
    ready: () => Promise.all(idle.map((w) => w.ready)).then(() => {}),
    destroy() {
      destroyed = true;
      for (const w of idle.splice(0)) w.box.remove();
      cancelAnimationFrame(raf);
      holder.remove();
    },
    mount(el, opts) {
      let w = idle.shift();
      let placement: AppHandle["placement"];
      let placeholder: HTMLElement | null = null;
      if (w && mode === "move") {
        (el as Element & { moveBefore(n: Node, r: Node | null): void }).moveBefore(w.frame, null);
        w.box.remove();
        placement = "moved";
      } else if (w) {
        placeholder = el.appendChild(document.createElement("div"));
        placeholder.style.cssText = `height:1px;width:${opts.theme.width}px;max-width:100%`;
        w.box.style.cssText = "position:absolute;left:0;top:0;visibility:visible";
        placement = "layer";
      } else {
        w = warmFrame(el);
        w.box.style.cssText = "";
        placement = "cold";
      }
      if (idle.length < o.size) schedule(refill);
      const { frame, port, box } = w;
      frame.style.width = opts.theme.width + "px";
      const subs: { [K in FrameToHost["t"]]?: Set<(m: any) => void> } = {};
      const on = <K extends FrameToHost["t"]>(t: K, fn: (m: Extract<FrameToHost, { t: K }>) => void) => {
        (subs[t] ??= new Set()).add(fn);
        return () => void subs[t]!.delete(fn);
      };
      const send = (m: HostToFrame) => port.postMessage(m);
      let place: (() => void) | null = null;
      if (placeholder) {
        const ph = placeholder;
        let last = "";
        place = () => {
          const r = ph.getBoundingClientRect();
          const v = visibleRect(ph);
          const key = `${r.left},${r.top},${v.l},${v.t},${v.r},${v.b}`;
          if (key === last) return;
          last = key;
          box.style.transform = `translate(${r.left + scrollX}px,${r.top + scrollY}px)`;
          const clip = `inset(${Math.max(0, v.t - r.top)}px ${Math.max(0, r.right - v.r)}px ${Math.max(0, r.bottom - v.b)}px ${Math.max(0, v.l - r.left)}px)`;
          box.style.clipPath = clip;
        };
        laid.add(place);
        place();
        kick();
      }
      port.addEventListener("message", (e: MessageEvent<FrameToHost>) => {
        const m = e.data;
        if (m.t === "size") {
          frame.style.height = m.height + "px";
          if (placeholder) placeholder.style.height = m.height + "px";
          place?.();
        } else if (m.t === "clock") {
          if (m.on) ticking.add(port);
          else ticking.delete(port);
          kick();
        } else if (m.t === "send") {
          if (m.m.room !== opts.room) return;
          opts.transport?.send(m.m);
        }
        subs[m.t]?.forEach((f) => f(m));
      });
      const receive = (m: S2C) => {
        if (m.t === "entry") {
          const d = m.entry.time - Date.now();
          if (!skewSeen || d > skew) (skew = d), (skewSeen = true);
        }
        send({ t: "recv", m });
      };
      w.ready.then(
        () => {
          const { code, room, me, theme, members, debug } = opts;
          send({ t: "mount", code, room, me, theme, client: opts.client ?? freshClient(), now: Date.now() + skew, ...(members ? { members } : {}), ...(debug ? { debug } : {}) });
          opts.transport?.start({ open: () => send({ t: "reconnect" }), close: () => {}, message: receive });
        },
        (e: Error) => subs.error?.forEach((f) => f({ t: "error", message: e.message, fatal: true })),
      );
      return {
        frame,
        placement,
        setTheme: (theme) => {
          frame.style.width = theme.width + "px";
          if (placeholder) placeholder.style.width = theme.width + "px";
          send({ t: "theme", theme });
        },
        setMembers: (members) => send({ t: "members", members }),
        receive,
        reconnect: () => send({ t: "reconnect" }),
        onSend: (fn) => on("send", (m) => fn(m.m)),
        onSize: (fn) => on("size", (m) => fn(m.height)),
        onError: (fn) => on("error", ({ t: _, ...e }) => fn(e)),
        onSummary: (fn) => on("summary", (m) => fn(m.text)),
        onHaptic: (fn) => on("haptic", (m) => fn(m.kind)),
        destroy() {
          ticking.delete(port);
          if (place) laid.delete(place);
          opts.transport?.stop();
          port.close();
          box.remove();
          frame.remove();
          placeholder?.remove();
        },
      };
    },
  };
}
