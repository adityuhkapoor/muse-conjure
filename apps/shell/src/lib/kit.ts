// Marketplace as context for a plan (services/demo/kit.ts builds the kit), and which tools are games.
import type { Message } from "../store/types";
import type { WireTool } from "../live/chat-reducer";

/** Plans that usually need gear or supplies. Dinner at a restaurant doesn't; a trip or a party does. */
export const NEEDS_STUFF = /\b(camp(ing)?|trip|hike|hiking|backpack|party|bday|birthday|picnic|potluck|beach|lake|bbq|barbecue|cookout|tailgate|festival|game night|road trip|sleepover|housewarming|friendsgiving|kayak|tube|tubing|climb(ing)?|boulder(ing)?|crag)\b/i;
/** Words that make a plan into "what do we need for it" rather than a tool for it. */
const ABOUT_STUFF = /\b(need|needs|bring|pack|packing|gear|supplies|stuff|buy|cost|costs|price|equipment|start(ing)?|plan(ning)?|want to|wanna)\b/i;

/** "@muse we want to go camping, what do we need?" is a kit; "@muse make a poll for the party" is not. */
export const isKitAsk = (text: string) => NEEDS_STUFF.test(text) && ABOUT_STUFF.test(text) && !/\b(poll|wheel|bracket|vote|bingo|quiz|trivia|game)\b/i.test(text);

/** The chip's suggestion: a chat talking about such a plan, with no kit yet, gets "What do we need?". */
export function planIn(name: string, messages: readonly Message[]): string | null {
  if (messages.some((m) => m.kind === "kit")) return null;
  const said = messages.filter((m) => m.kind === "text").slice(-12).map((m) => m.text ?? "");
  const hit = [name, ...said.reverse()].find((t) => NEEDS_STUFF.test(t));
  return hit ? (NEEDS_STUFF.exec(hit)?.[0] ?? null) : null;
}

/** Library and lab games. A tool Muse wrote from scratch counts when its name says it is one. */
const GAMES = new Set(["trivia-night", "friend-trivia-pub", "trip-quiz", "road-bingo", "setlist-bingo", "doodle-dash", "inside-joke-game", "reg-race", "bday-candles", "study-candles", "slot-machine"]);
const GAME_NAME = /\b(game|trivia|quiz|bingo|chess|checkers|tic.?tac|connect|pong|golf|pool|darts|race|duel|battle|wordle|hangman|charades|showdown|match)\b/i;
export const isGame = (t: Pick<WireTool, "name" | "piece">) => GAMES.has((t.piece ?? "").replace(/^(lab|piece|cache):/, "")) || GAME_NAME.test(t.name);

export const usd = (n: number) => `$${n % 1 ? n.toFixed(2) : n.toLocaleString("en-US")}`;
