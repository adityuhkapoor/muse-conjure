import { store } from "../store";
import { ui } from "./ui.svelte";
// surfaces: the Facebook side (src/surfaces/fbnav.svelte.ts)
import { fb, fbFromUrl, fbToUrl, isTab, type FbPage, type FbTab } from "../surfaces/fbnav.svelte";

/**
 * Navigation. One place decides where the app is, for both layouts, and it is the only place that
 * touches the History API.
 *
 * Phone: a stack of pushed pages over the inbox or a Facebook tab. Each page slides in; browser back and the edge swipe pop.
 * Desktop: the middle pane shows a chat, or the event page or a Facebook screen replaces the three panes.
 *
 * Every screen has a URL (`chat=`, `event=`, `screen=search`, `fb=`; `as`, `safe`, `theme`, `app` and the
 * rest of the query stay). Each step pushes one history entry holding a snapshot of where the app is, so
 * Back and Forward move between screens, and a reload reads the same screen from the URL.
 */
export type Route =
  | { kind: "chat"; id: string; /** scroll to this tool's card when the thread opens */ focus?: string }
  | { kind: "search" }
  | { kind: "event"; id: string }
  // surfaces: a Facebook screen (phone: a tab or a pushed page; desktop: the main area)
  | { kind: "fb"; page: FbPage };

export type Layer = { key: number; route: Route; shown: boolean; leaving: boolean };

/** Where the app is, for both layouts. Plain data: it goes into history.state. */
type Snap = {
  app: "messenger" | "facebook";
  tab: FbTab;
  /** phone: the pushed pages, bottom first */
  stack: Route[];
  /** desktop */
  fb: FbPage | null;
  event: string | null;
  chat: string;
  focus: string | null;
};

/** A little over --m-push-dur (pop settles in 460 ms); the transition itself is CSS. */
const SLIDE_MS = 480;
const params = new URLSearchParams(location.search);
/** Query keys that name the screen; everything else in the query is kept as it is. */
const SCREEN_KEYS = ["chat", "tool", "event", "screen", "fb", "id", "app"];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function routeOf(p: URLSearchParams): Route | null {
  const chat = p.get("chat");
  if (chat && store.chat(chat)) return { kind: "chat", id: chat, focus: p.get("tool") ?? undefined };
  const ev = p.get("event");
  if (ev && store.event(ev)) return { kind: "event", id: ev };
  if (p.get("screen") === "search") return { kind: "search" };
  const page = fbFromUrl(p);
  if (page && !isTab(page) && !(page.name === "profile" && page.id === "me")) return { kind: "fb", page };
  return null;
}

/** The tab a Facebook page stands for on the phone, or null when it is pushed over one. */
function tabOf(page: FbPage): FbTab | null {
  if (isTab(page)) return page.name;
  if (page.name === "profile" && page.id === "me") return "profile";
  return null;
}

class Nav {
  /** Phone: pushed pages, bottom first. */
  layers = $state<Layer[]>([]);
  /** Desktop: the chat in the middle pane. */
  selected = $state<string>(store.chats[0]!.id);
  /** Desktop: set when the event page is shown instead of Messenger. */
  desktopEvent = $state<string | null>(null);
  /** Desktop: scroll the open thread to a tool; `n` makes a repeat request count. */
  focus = $state<{ tool: string; n: number } | null>(null);
  // ---- surfaces ----
  /** Which app is underneath: Messenger (the default landing screen) or Facebook (`?app=facebook`). */
  app = $state<"messenger" | "facebook">(params.get("app") === "facebook" || params.has("fb") ? "facebook" : "messenger");
  /** Desktop: the Facebook screen in the main area, or null for Messenger. */
  desktopFb = $state<FbPage | null>(null);
  #key = 0;
  #focusN = 0;
  /** index of the current history entry within this tab's history */
  #i = 0;
  /** what the current entry says, to skip a push that changes nothing */
  #cur = "";
  /** how many Back/Forward moves were seen, to tell whether history.back() did anything */
  #moves = 0;

  constructor() {
    const first = routeOf(params);
    const fbFirst = fbFromUrl(params);
    const fbTab = fbFirst ? tabOf(fbFirst) : null;
    if (fbTab) fb.tab = fbTab;
    if (first?.kind === "chat") this.selected = first.id;
    if (first?.kind === "event") this.desktopEvent = first.id;
    if (first?.kind === "chat" && first.focus) this.focus = { tool: first.focus, n: ++this.#focusN };
    if (first?.kind === "fb" || (!first && fbFirst)) this.desktopFb = first?.kind === "fb" ? first.page : fbFirst;
    if (first?.kind === "chat" || first?.kind === "search") this.desktopFb = null;
    if (first && !ui.desktop) this.layers.push({ key: ++this.#key, route: first, shown: true, leaving: false });

    const reloaded = history.state && typeof history.state.i === "number";
    this.#i = reloaded ? history.state.i : 0;
    const snap = this.#snap();
    if (!reloaded && snap.stack.length && !ui.desktop) {
      // a link straight to a page: the screen under it is the first entry, so Back lands there and not outside the app
      const under: Snap = { ...snap, stack: snap.stack.slice(0, -1) };
      history.replaceState({ i: 0, snap: under }, "", this.#url(under));
      this.#i = 1;
      history.pushState({ i: 1, snap }, "", this.#url(snap));
    } else history.replaceState({ i: this.#i, snap }, "", this.#url(snap));
    this.#cur = this.#id(snap);
    addEventListener("popstate", () => this.#restore());
  }

  // ---------------------------------------------------------------- history

  #snap(): Snap {
    // plain data (not state proxies), so history can store it
    return $state.snapshot({
      app: this.app,
      tab: fb.tab,
      stack: this.layers.filter((l) => !l.leaving).map((l) => l.route),
      fb: this.desktopFb,
      event: this.desktopEvent,
      chat: this.selected,
      focus: this.focus?.tool ?? null,
    }) as Snap;
  }

  /** The address for a snapshot: the screen's keys over the query as it is now. */
  #url(s: Snap): string {
    const q = new URLSearchParams(location.search);
    for (const k of SCREEN_KEYS) q.delete(k);
    const route = ui.desktop ? this.#deskRoute(s) : s.stack.at(-1);
    if (route?.kind === "chat") {
      q.set("chat", route.id);
      if (route.focus) q.set("tool", route.focus);
    } else if (route?.kind === "event") q.set("event", route.id);
    else if (route?.kind === "search") q.set("screen", "search");
    else if (route?.kind === "fb") q.set("fb", fbToUrl(route.page));
    else if (s.app === "facebook" && !ui.desktop) q.set("fb", fbToUrl(s.tab === "profile" ? { name: "profile", id: "me" } : { name: s.tab }));
    if (s.app === "facebook" && route?.kind !== "fb") q.set("app", "facebook");
    const qs = q.toString();
    return location.pathname + (qs ? `?${qs}` : "") + location.hash;
  }
  #deskRoute(s: Snap): Route | null {
    if (s.event) return { kind: "event", id: s.event };
    if (s.fb) return { kind: "fb", page: s.fb };
    return { kind: "chat", id: s.chat, focus: s.focus ?? undefined };
  }
  #id = (s: Snap) => `${this.#url(s)}|${JSON.stringify(s)}`;

  /** Writes the current place into history: a new entry, or (replace) over this one. */
  #record(mode: "push" | "replace" = "push") {
    const snap = this.#snap();
    const id = this.#id(snap);
    if (id === this.#cur) return;
    this.#cur = id;
    if (mode === "push") this.#i += 1;
    history[mode === "push" ? "pushState" : "replaceState"]({ i: this.#i, snap }, "", this.#url(snap));
  }

  /** Back, Forward or a reload of an entry: put the app where that entry says. */
  #restore() {
    this.#moves++;
    const snap: Snap | undefined = history.state?.snap;
    if (typeof history.state?.i === "number") this.#i = history.state.i;
    if (!snap) return;
    this.app = snap.app;
    fb.tab = snap.tab;
    this.desktopFb = snap.fb;
    this.desktopEvent = snap.event;
    this.selected = snap.chat;
    this.focus = snap.focus ? { tool: snap.focus, n: ++this.#focusN } : null;
    this.#syncStack(snap.stack);
    this.#cur = this.#id(this.#snap());
  }

  /** Make the pushed pages match `target`: pop what is not shared, push what is missing. */
  #syncStack(target: Route[]) {
    const active = this.layers.filter((l) => !l.leaving);
    let n = 0;
    while (n < active.length && n < target.length && same(active[n]!.route, target[n])) n++;
    this.#popTo(n);
    for (const route of target.slice(n)) this.#pushLayer(route);
  }

  #pushLayer(route: Route) {
    const layer: Layer = { key: ++this.#key, route, shown: false, leaving: false };
    this.layers.push(layer);
    // next frame so the browser sees the page at its off-screen position first
    requestAnimationFrame(() => {
      const live = this.layers.find((l) => l.key === layer.key);
      if (live) live.shown = true;
    });
  }

  // ---------------------------------------------------------------- going

  go(route: Route) {
    if (ui.desktop) {
      if (route.kind === "chat") {
        this.app = "messenger";
        this.selected = route.id;
        this.desktopEvent = null;
        this.desktopFb = null; // surfaces
        this.focus = route.focus ? { tool: route.focus, n: ++this.#focusN } : null;
      } else if (route.kind === "event") {
        this.desktopEvent = route.id;
      } else if (route.kind === "fb") {
        // surfaces
        this.app = "facebook";
        this.desktopFb = route.page;
        this.desktopEvent = null;
      }
      this.#record();
      return;
    }
    // surfaces: a phone tab is not a pushed page
    const tab = route.kind === "fb" ? tabOf(route.page) : null;
    if (tab) {
      this.toFacebook(tab);
      return;
    }
    this.#pushLayer(route);
    this.#record();
  }

  back() {
    if (ui.desktop) {
      if (this.#i > 0) history.back();
      else {
        this.desktopEvent = null;
        this.#record("replace");
      }
      return;
    }
    const before = this.layers.filter((l) => !l.leaving).length;
    if (this.#i > 0) {
      const seen = this.#moves;
      history.back();
      // if history did not move (nothing to go back to), pop the page anyway
      setTimeout(() => {
        if (before > 0 && this.#moves === seen) {
          this.#popTo(before - 1);
          this.#record("replace");
        }
      }, 300);
    } else {
      this.#popTo(Math.max(0, before - 1));
      this.#record("replace");
    }
  }

  openChat(id: string, focus?: string) {
    this.go({ kind: "chat", id, focus });
  }

  /** Scroll the open desktop thread to a tool (phone threads scroll themselves). */
  focusTool(tool: string) {
    this.focus = { tool, n: ++this.#focusN };
  }

  // ---- surfaces ----
  /** Messenger as the app underneath, everything pushed popped. Desktop: the three panes. */
  toMessenger() {
    this.app = "messenger";
    this.desktopFb = null;
    this.desktopEvent = null;
    if (!ui.desktop) this.#popTo(0);
    this.#record();
  }
  /** Facebook as the app underneath, on a tab (Home by default). */
  toFacebook(tab: FbTab = "home") {
    this.app = "facebook";
    fb.tab = tab;
    if (ui.desktop) {
      this.desktopFb = tab === "profile" ? { name: "profile", id: "me" } : { name: tab }; // profile
      this.desktopEvent = null;
    } else this.#popTo(0);
    this.#record();
  }

  #popTo(depth: number) {
    const leaving = this.layers.filter((l) => !l.leaving).slice(depth);
    if (!leaving.length) return;
    leaving.forEach((l) => {
      l.leaving = true;
      l.shown = false;
    });
    const keys = new Set(leaving.map((l) => l.key));
    setTimeout(() => {
      this.layers = this.layers.filter((l) => !keys.has(l.key));
    }, SLIDE_MS);
  }
}

export const nav = new Nav();
