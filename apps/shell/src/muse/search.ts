// "Ask Meta AI or search": free text from search goes to Muse with where it was asked from.

import { nav } from "../lib/nav.svelte";
import { catalyst } from "./catalyst.svelte";
import { searchContext } from "./context";
import { nameOf } from "./page";

export function askFromSearch(q: string) {
  const t = q.trim();
  if (t) catalyst.ask(searchContext({ nameOf, from: nav.app === "facebook" ? "facebook" : "messenger" }), t);
}
