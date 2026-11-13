// The tools friends already made on pages, for the fake store (checks, screenshots, the dev
// server). The live demo seeds the same ones as real tools (services/demo/seed-catalysts.ts).

import type { Chat, Message, Tool } from "../store/types";

export const MADE_ON_PAGES = [
  { key: "surface:page:event:juniper", page: "Juniper Hale live", id: "t-cat-event-carpool", name: "Rides to Meridian Hall", by: "maya", summary: "Maya is driving · 3 seats open", template: "poll" },
  { key: "surface:page:post:p-boba", page: "Maya's post", id: "t-cat-feed-ranking", name: "Best boba on telegraph", by: "maya", summary: "4 places · add yours", template: "bracket" },
  { key: "surface:page:listing:l-sectional", page: "Grey sectional couch", id: "t-cat-mp-price-check", name: "Is $180 fair?", by: "priya", summary: "Will asked · rate it", template: "poll" },
  { key: "surface:page:listing:l-loveseat", page: "Green velvet loveseat", id: "t-cat-mp-room-fit-l-loveseat", name: "Will it fit in 4B?", by: "dev", summary: "Aditya is placing it", template: "poll" },
  { key: "surface:page:listing:l-desk", page: "Standing desk", id: "t-cat-mp-price-check-l-desk", name: "Is $150 fair?", by: "maya", summary: "Maya asked · rate it", template: "poll" },
  { key: "surface:page:story:s-trip", page: "Aditya's story", id: "t-cat-story-trip-s-trip", name: "Big Sur · a year ago", by: "dev", summary: "3 days · tap through", template: "poll" },
  { key: "surface:page:gaming:gaming", page: "Gaming", id: "t-cat-game-trivia", name: "Apt 4b trivia", by: "maya", summary: "2 questions · play", template: "poll" },
];

export function fakePageTools(at: number): { chats: Chat[]; tools: Tool[] } {
  const chats: Chat[] = [];
  const tools: Tool[] = [];
  for (const m of MADE_ON_PAGES) {
    const msg: Message = { id: `${m.id}-m`, from: "muse", kind: "muse", at, reactions: [], muse: { appId: m.template, title: m.name, subtitle: "Made with Muse", toolId: m.id } };
    chats.push({ id: `cat-${m.id}`, name: m.page, kind: "group", members: ["me", "maya", "dev", "jonah", "priya", "theo"], messages: [msg], unread: false, typing: [], seenBy: [], activeNow: false, key: m.key });
    tools.push({ id: m.id, chat: `cat-${m.id}`, appId: m.template, name: m.name, summary: m.summary, last: { by: m.by, did: "made it", at }, needsMe: false, cardId: msg.id });
  }
  return { chats, tools };
}
