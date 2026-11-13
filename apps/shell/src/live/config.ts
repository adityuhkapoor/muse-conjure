// Live mode is on when the page was served by the demo gateway (it injects window.__MUSE_LIVE__)
// and `?live=0` is not set. A plain static server or the Vite dev server gets the fake store.

import { PEOPLE } from "../store/fake-data";
import { ME, type Person } from "../store/types";

/** `framePath`: the same frame document on this origin, used when the frame port cannot be reached. */
/** `start`: changes with every start of the demo (see `reloadOnRestart`). */
export type LiveConfig = { framePort: number; framePath?: string; model?: string; start?: string };

const params = new URLSearchParams(location.search);
const injected = (window as unknown as { __MUSE_LIVE__?: LiveConfig }).__MUSE_LIVE__;

export const liveConfig: LiveConfig | null = injected && params.get("live") !== "0" ? injected : null;

const RELOADED = "muse-reloaded-for";

/**
 * Reload once for the server start `start`. A second time for the same start means the reload did
 * not bring the new page (a cached copy, a proxy): stay, rather than reload forever.
 */
export function reloadFor(start: string, why: string): void {
  try {
    if (sessionStorage.getItem(RELOADED) === start) return void console.warn(`Muse: ${why}; already reloaded once for this start of the demo`);
    sessionStorage.setItem(RELOADED, start);
  } catch {}
  console.info(`Muse: ${why}; reloading`);
  location.reload();
}

/**
 * A tab left open across a restart of the demo runs the old shell against the new server: old
 * code, old names, rooms that were wiped, tool frames from a newer build. Its tools fail to open or
 * fight the new ones over the members list. The page carries the start it was served by; when the
 * server says it started again (asked at load, on every reconnect of `socket`, on coming back to
 * the tab, and every 30 s), the tab reloads itself once.
 */
export function reloadOnRestart(c: LiveConfig, socket?: { readonly open: boolean }) {
  if (!c.start) return;
  const check = () =>
    fetch(`${location.origin}/health`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ start?: string }>)
      .then((h) => h.start && h.start !== c.start && reloadFor(h.start, "the demo restarted"))
      .catch(() => {});
  void check();
  setInterval(check, 30_000);
  let wasOpen = socket?.open ?? false;
  if (socket)
    setInterval(() => {
      if (socket.open && !wasOpen) void check();
      wasOpen = socket.open;
    }, 500);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check());
}

export const wsUrl = () => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
export const generateUrl = () => `${location.origin}/generate`;
export const frameUrl = (c: LiveConfig) => `${location.protocol}//${location.hostname}:${c.framePort}/frame.html`;
/** Where tool frames load from, in order: the frame port, then this origin's fallback path. */
export const frameUrls = (c: LiveConfig) => [frameUrl(c), ...(c.framePath ? [location.origin + c.framePath] : [])];

/** The cast, with wire ids. Tsai Lin is "me" in the fake data; on the wire she is "noa". */
export const CAST: Person[] = PEOPLE.map((p) => (p.id === ME ? { ...p, id: "noa" } : { ...p }));
export const wireId = (fakeId: string) => (fakeId === ME ? "noa" : fakeId);

/** The five team members also answer to their first names: `?as=aditya` is `dev`. */
export const ALIASES: Record<string, string> = { aditya: "dev", calvin: "jonah", arun: "theo", tsai: "noa", will: "priya" };
/** Real people first in the picker, then the made-up cast. */
export const PICK_ORDER: Person[] = [...["dev", "jonah", "theo", "noa", "priya"].map((id) => CAST.find((p) => p.id === id)!).filter(Boolean), ...CAST.filter((p) => !["dev", "jonah", "theo", "noa", "priya"].includes(p.id))];

const KEY = "muse.as";

/** The identity named by `?as=` alone (aliases resolved), without the remembered one: the fake store uses it too. */
export function urlIdentity(): string | null {
  const raw = params.get("as")?.toLowerCase() ?? null;
  const q = raw ? (ALIASES[raw] ?? raw) : null;
  return q && CAST.some((p) => p.id === q) ? q : null;
}

/** `?as=<id>` wins and is remembered; else the remembered one; else null (show the picker). */
export function chosenIdentity(): string | null {
  const raw = params.get("as")?.toLowerCase() ?? null;
  const q = raw ? (ALIASES[raw] ?? raw) : null;
  const known = (id: string | null) => (id && CAST.some((p) => p.id === id) ? id : null);
  if (known(q)) {
    try {
      localStorage.setItem(KEY, q!);
    } catch {}
    return q;
  }
  try {
    return known(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function rememberIdentity(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {}
}
