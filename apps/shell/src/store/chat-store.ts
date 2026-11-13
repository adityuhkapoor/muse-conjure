import type { Chat, ChatSpec, EventInfo, Message, Note, Person, PersonId, Rsvp, Suggestion, Tool, ToolTemplate } from "./types";
import type { LandSpec, SurfaceTool } from "../surfaces/types";

/**
 * SEAM 1: ChatStore.
 *
 * Today this is backed by in-memory fake data (fake-store.svelte.ts). Later it is backed by the
 * packages/sync replica: send() and react() become dispatched actions, `chats` becomes a fold of
 * the room log. Components only ever talk to this interface and read plain data from it.
 *
 * Reads must be reactive: the implementation returns data from Svelte $state so that a change
 * re-renders. The sync-backed version should wrap `replica.subscribe` in a $state the same way.
 *
 * Tools: `tools` is the list of live Muse apps across chats. Each carries the one-line summary and
 * who acted last, which the real store reads from the app's own `summary` and log. Anything that
 * builds an app (`buildTool`, `addTool`, `createChat`) will call the factory and the sandbox later;
 * today it inserts a placeholder card after a fixed delay.
 */
export interface ChatStore {
  readonly me: Person;
  /** Inbox order: most recent activity first. */
  readonly chats: readonly Chat[];
  person(id: PersonId | "muse" | "system"): Person | undefined;
  chat(id: string): Chat | undefined;
  /** Store clock in ms. The fake store uses a fixed morning so screenshots are stable. */
  now(): number;
  /** Sends text. A leading "muse" or "@Muse" also asks Muse to build something. */
  send(chatId: string, text: string, opts?: { /** "Tell Muse what to change": this text changes that tool (live store only) */ changeTool?: string }): void;
  /** Toggles my reaction on a message. Passing the emoji I already used removes it. */
  react(chatId: string, messageId: string, emoji: string): void;
  /** Adds my reaction only if I do not have it yet (double-tap to heart). */
  reactOnce(chatId: string, messageId: string, emoji: string): void;
  markRead(chatId: string): void;

  // --- tools ---
  /** Every live tool, the ones that need me first. */
  readonly tools: readonly Tool[];
  tool(id: string): Tool | undefined;
  toolsFor(chatId: string): readonly Tool[];
  readonly templates: readonly ToolTemplate[];
  template(id: string): ToolTemplate;
  /** Notes tray. A note with `tool` is a friend's shared tool. */
  readonly notes: readonly Note[];
  /** A quiet offer for a chat that looks stuck, or null (also null once dismissed or taken). */
  suggestion(chatId: string): Suggestion | null;
  /** Two or three tools worth offering after the last messages (live store only). */
  suggestions?(chatId: string): Suggestion[];
  dismissSuggestion(chatId: string): void;
  /** Inserts a card from Muse that shows "Muse is building" for a moment, then becomes the tool card. */
  buildTool(chatId: string, templateId: string, opts?: { title?: string; /** made from the menu, not from the conversation: start empty */ blank?: boolean; /** templateId is a lab Mini's id (a chip Muse offered), menu or not */ lab?: boolean }): void;
  /** Inserts the finished card at once (for flows that showed their own building state). Returns the new tool. */
  addTool(chatId: string, templateId: string, opts?: { title?: string; systemLine?: boolean }): Tool;
  /** Adds me to the chat the note's tool lives in. Returns the chat id. */
  joinNote(noteId: string): string;
  /** Makes a group chat once per `key`, with a tool card from Muse as its first message. Returns the chat id. */
  createChat(spec: ChatSpec): string;

  // --- events ---
  readonly events: readonly EventInfo[];
  event(id: string): EventInfo | undefined;
  rsvp(id: string): Rsvp | null;
  setRsvp(id: string, value: Rsvp | null): void;

  // --- surfaces: Facebook Home, Groups, Marketplace, Reels, Gaming (see src/surfaces) ---
  /** Posts the source line, then builds the piece in the chat with the same building card as a chat ask. Returns the chat id. */
  landPiece(spec: LandSpec): string;
  /** Tools in the chat with this key, including chats that back a surface and chats I am not in. */
  surfaceTools(key: string): readonly SurfaceTool[];
  /** One app action from me into a tool's own room (adds a place to a to-try list). */
  toolAct(toolId: string, action: unknown, fake?: { summary: string }): void;
  /** Posts a link message from me (a shared reel or listing). Returns the message id. */
  sendLink(chatId: string, link: NonNullable<Message["link"]>): string;
  /** Posts a system line ("**Tsai Lin** added a place to **To try**") with this id, once. */
  sendSystem(chatId: string, id: string, text: string): void;

  // --- live only (the fake store leaves these out) ---
  /** true when backed by the server */
  readonly live?: boolean;
  /** I am typing in this chat (or stopped). */
  setTyping?(chatId: string, typing: boolean): void;
  /** Mounts a tool's sandboxed frame into `el`. The card reports its height through `onSize`. */
  mountTool?(el: HTMLElement, toolId: string, opts: { dark: boolean; width: number; onSize: (h: number) => void; onError?: (m: string, fatal: boolean) => void; onEvicted?: (wait: (cb: () => void, visible?: () => boolean) => () => void) => void; visible?: () => boolean }): MountedTool;
  /** catalysts: a tool that did not open is rebuilt in place from its next pre-made choice; false when there is none. */
  retryTool?(toolId: string): Promise<boolean>;
}

export type MountedTool = { setTheme(dark: boolean, width: number): void; destroy(): void };
