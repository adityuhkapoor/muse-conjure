// Pictures for things the surfaces put into chats: a shared reel or listing link shows its frame or photo.
import type { Message } from "../store/types";
import { listing, reel } from "./data";

/** The asset id a link preview shows, if any: the event cover, the reel frame, the listing photo. */
export function linkAsset(link: NonNullable<Message["link"]>): string | undefined {
  if (link.eventId) return `event-${link.eventId}-cover`; // drawn (src/lib/cover.ts)
  const s = link.shared;
  if (s?.kind === "reel") return reel(s.id)?.asset;
  if (s?.kind === "listing") return listing(s.id)?.asset;
  return undefined;
}
