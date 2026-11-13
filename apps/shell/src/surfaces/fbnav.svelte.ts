// Where the Facebook side of the app is. lib/nav.svelte.ts owns the stack and the desktop panes and
// calls into this file through its small "surfaces" hooks; everything Facebook-specific lives here.

export type FbTab = "home" | "reels" | "marketplace" | "notifications" | "friends" | "profile"; // profile: Friends and your own profile

export type FbPage =
  | { name: "home" }
  | { name: "reels"; id?: string }
  | { name: "marketplace" }
  | { name: "notifications" }
  | { name: "listing"; id: string }
  /** a real store product a plan's kit found online (Marketplace had none); `item` is the kit row */
  | { name: "online"; item: import("../live/chat-reducer").WireKit["items"][number] & { online: import("../live/chat-reducer").WireOnline } }
  | { name: "groups" }
  | { name: "group"; id: string }
  | { name: "gaming" }
  | { name: "story"; id: string }
  | { name: "menu" }
  | { name: "compose" } // compose: Create post (phone)
  | { name: "friends" }
  | { name: "search" } // search: Facebook's own results (surfaces/search.ts)
  | { name: "profile"; id: string }; // profile: anyone's profile; id is the wire id (noa, dev, maya, lena...)

type PageTab = Exclude<FbTab, "profile">; // the Profile tab is a page with an id
export const TABS: PageTab[] = ["home", "reels", "marketplace", "notifications", "friends"];
export const isTab = (p: FbPage): p is { name: PageTab } => (TABS as string[]).includes(p.name);

/** `?app=facebook&fb=marketplace`, `fb=group:sublets`, `fb=listing:l-futon`, `fb=story:s-dev-poll`... */
export function fbFromUrl(params: URLSearchParams): FbPage | null {
  const raw = params.get("fb");
  if (!raw) return params.get("app") === "facebook" ? { name: "home" } : null;
  const [name, id] = raw.split(":") as [string, string | undefined];
  switch (name) {
    case "home":
    case "marketplace":
    case "notifications":
    case "groups":
    case "gaming":
    case "menu":
    case "compose":
    case "search":
      return { name };
    case "reels":
      return id ? { name, id } : { name };
    case "listing":
    case "group":
    case "story":
      return id ? { name, id } : null;
    // profile: `fb=friends`, `fb=profile&id=calvin` (or `fb=profile:jonah`); no id is your own
    case "friends":
      return { name };
    case "profile":
      return { name, id: id ?? params.get("id") ?? "me" };
  }
  return null;
}

/** The `fb=` value for a page: what fbFromUrl reads back. */
export function fbToUrl(page: FbPage): string {
  return "id" in page && page.id ? `${page.name}:${page.id}` : page.name;
}

/** Small state the Facebook screens share: the phone tab, a toast, and where Home was scrolled to. */
class Fb {
  tab = $state<FbTab>("home");
  /** one short line at the top of the screen, with an optional action */
  toast = $state<{ text: string; action?: { label: string; run: () => void }; n: number } | null>(null);
  /** a post to scroll Home to once (from a notification) */
  focusPost = $state<string | null>(null);
  #n = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;

  say(text: string, action?: { label: string; run: () => void }) {
    clearTimeout(this.#timer);
    this.toast = { text, ...(action ? { action } : {}), n: ++this.#n };
    this.#timer = setTimeout(() => (this.toast = null), 4000);
  }
}

export const fb = new Fb();
