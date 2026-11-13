/**
 * Restore after the OS reloads the tab: the open chat and how far from the bottom the list was.
 * Kept in sessionStorage (per tab) and written when the page is hidden, which is the last chance on a phone.
 */
const KEY = "phone.session";
type Saved = { chat: string; fromBottom: number };

function read(): Saved | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Saved | null;
    return v && typeof v.chat === "string" ? v : null;
  } catch {
    return null;
  }
}

function openList(): { chat: string; list: HTMLElement } | null {
  const page = document.querySelector<HTMLElement>('[data-route="chat"]:not([inert])');
  const list = page?.querySelector<HTMLElement>(".list");
  const label = page?.querySelector("section.thread")?.getAttribute("data-chat");
  return page && list && label ? { chat: label, list } : null;
}

export function initSession(): void {
  const save = () => {
    try {
      const o = openList();
      if (o) sessionStorage.setItem(KEY, JSON.stringify({ chat: o.chat, fromBottom: Math.round(o.list.scrollHeight - o.list.scrollTop - o.list.clientHeight) } satisfies Saved));
      else sessionStorage.removeItem(KEY);
    } catch {}
  };
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && save());
  addEventListener("pagehide", save);
  // Put the scroll position back once the restored thread has rendered.
  const s = read();
  // the address names the open chat now (lib/nav.svelte.ts); this only puts the scroll back when it is that one
  if (!s) return;
  let tries = 0;
  const iv = setInterval(() => {
    const o = openList();
    if (o && o.chat === s.chat) {
      clearInterval(iv);
      requestAnimationFrame(() => (o.list.scrollTop = o.list.scrollHeight - o.list.clientHeight - s.fromBottom));
    } else if (++tries > 40) clearInterval(iv);
  }, 100);
}
