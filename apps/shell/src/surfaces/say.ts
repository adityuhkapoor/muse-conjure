// Names in surface text, from the people helpers: `{id}` is the person's first name, `{@id}` the
// same but "You" for the viewer ("Your" when followed by 's). Ids are wire ids ("noa" is Tsai Lin).

import type { Person } from "../store/types";
import { store } from "../store";
import { viewerId } from "../lib/media";
import { who } from "./flows.svelte";
import { youRest } from "../lib/you";

/** True for the person viewing (`me`, or their wire id). */
export const isMe = (id: string) => id === "me" || id === viewerId();

/** Anyone by wire id, the viewer included. */
export function person(id: string): Person | undefined {
  if (isMe(id)) return store.me;
  return who(id);
}

export function say(text: string): string {
  return text.replace(/\{(@?)([a-z0-9-]+)\}('s)?( [A-Za-z']+)?/g, (_, rel: string, id: string, s?: string, next?: string) => {
    if (rel && isMe(id)) return s ? "Your" + (next ?? "") : "You" + (next ? youRest(next) : "");
    return (person(id)?.first ?? id) + (s ?? "") + (next ?? "");
  });
}

/** "Maya Chen" or "You" */
export const nameOrYou = (id: string) => (isMe(id) ? "You" : (person(id)?.name ?? id));
