// Desktop top bar hooks (components/TopBar.svelte): which slots work and which one is selected.
import { nav } from "../lib/nav.svelte";
import { GROUPS } from "./data";
import type { FbPage } from "./fbnav.svelte";

const SLOTS: Record<string, { page: FbPage; on: (p: FbPage) => boolean }> = {
  Home: { page: { name: "home" }, on: (p) => p.name === "home" },
  Friends: { page: { name: "friends" }, on: (p) => p.name === "friends" }, // profile
  Reels: { page: { name: "reels" }, on: (p) => p.name === "reels" },
  Marketplace: { page: { name: "marketplace" }, on: (p) => p.name === "marketplace" || p.name === "listing" },
  Groups: { page: { name: "group", id: GROUPS[0]!.id }, on: (p) => p.name === "group" || p.name === "groups" },
  Gaming: { page: { name: "gaming" }, on: (p) => p.name === "gaming" },
};

/** A working slot, or null for one that stays dimmed. */
export function fbSlot(label: string): { on: boolean; go: () => void } | null {
  const s = SLOTS[label];
  if (!s) return null;
  const cur = nav.desktopFb;
  return { on: !nav.desktopEvent && !!cur && s.on(cur), go: () => nav.go({ kind: "fb", page: s.page }) };
}

/** On a Facebook screen (not Messenger, not the event page). */
export const onFb = () => nav.desktopFb !== null;
