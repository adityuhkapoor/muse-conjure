import type { ChatStore } from "./chat-store";
import { CLOCK_BASE, MUSE, PEOPLE, seedChats, seedEvents, seedNotes, seedTools } from "./fake-data";
import { BUILD_MS, inferTemplate, isMention, looksStuck, template, TEMPLATES } from "../lib/muse";
import type { Chat, ChatSpec, EventInfo, Message, Note, Person, PersonId, Rsvp, Suggestion, Tool } from "./types";
import { ME } from "./types";
import { viewerId } from "../lib/media";
// surfaces (src/surfaces)
import { BACKING, isSurfaceKey } from "../surfaces/backing";
import { REELS } from "../surfaces/data";
import { SOURCE_PREFIX, type LandSpec, type SurfaceTool } from "../surfaces/types";
import { fakePageTools } from "../muse/fake"; // catalysts

const SYSTEM: Person = { id: "system", name: "System", first: "System", initials: "", tone: 1, active: false };

/** Muse answers a mention a beat after the message is sent. */
const ANSWER_DELAY_MS = 500;

/** In-memory ChatStore. Replace with the sync-backed store behind the same interface. */
export class FakeStore implements ChatStore {
  #seed = viewerSeed();
  #chats = $state<Chat[]>(this.#seed.chats);
  #tools = $state<Tool[]>(this.#seed.tools);
  #notes = $state<Note[]>(forViewer(seedNotes()).filter((n) => n.by !== ME));
  #events = $state<EventInfo[]>(forViewer(seedEvents()).map((e) => ({ ...e, friends: e.friends.filter((f) => f !== ME) })));
  #rsvp = $state<Record<string, Rsvp | null>>({});
  #dismissed = $state<string[]>([]);
  #started = performance.now();
  #seq = 1000;
  /** The cast by wire id, plus the viewer again under "me" (the seed has no "me"; the store maps the viewer to it). */
  readonly #people = new Map<string, Person>([
    ...[...PEOPLE, MUSE, SYSTEM].map((x) => [x.id, x] as const),
    ...PEOPLE.filter((p) => p.id === viewerId()).map((p) => [ME, { ...p, id: ME }] as const),
  ]);

  get me(): Person {
    return this.#people.get(ME)!;
  }

  get chats(): readonly Chat[] {
    return [...this.#chats].sort((a, b) => lastAt(b) - lastAt(a));
  }

  person(id: PersonId): Person | undefined {
    return this.#people.get(id);
  }

  chat(id: string): Chat | undefined {
    return this.#chats.find((c) => c.id === id);
  }

  now(): number {
    return CLOCK_BASE + (performance.now() - this.#started);
  }

  send(chatId: string, text: string): void {
    const chat = this.chat(chatId);
    const body = text.trim();
    if (!chat || !body) return;
    const msg: Message = {
      id: `n${++this.#seq}`,
      from: ME,
      kind: "text",
      text: body,
      at: this.now(),
      reactions: [],
      pending: true,
    };
    chat.messages.push(msg);
    chat.seenBy = [];
    chat.unread = false;
    setTimeout(() => {
      const live = chat.messages.find((x) => x.id === msg.id);
      if (live) live.pending = false;
    }, 400);
    if (isMention(body)) setTimeout(() => this.buildTool(chatId, inferTemplate(body)), ANSWER_DELAY_MS);
  }

  react(chatId: string, messageId: string, emoji: string): void {
    this.#toggle(chatId, messageId, emoji, false);
  }

  reactOnce(chatId: string, messageId: string, emoji: string): void {
    this.#toggle(chatId, messageId, emoji, true);
  }

  markRead(chatId: string): void {
    const chat = this.chat(chatId);
    if (chat) chat.unread = false;
  }

  // --- tools -------------------------------------------------------------------------------

  get tools(): readonly Tool[] {
    return [...this.#tools].sort((a, b) => Number(b.needsMe) - Number(a.needsMe) || (b.last?.at ?? 0) - (a.last?.at ?? 0));
  }
  tool(id: string): Tool | undefined {
    return this.#tools.find((t) => t.id === id);
  }
  toolsFor(chatId: string): readonly Tool[] {
    return this.tools.filter((t) => t.chat === chatId);
  }
  get templates() {
    return TEMPLATES;
  }
  template(id: string) {
    return template(id);
  }
  get notes(): readonly Note[] {
    return this.#notes;
  }

  suggestion(chatId: string): Suggestion | null {
    const chat = this.chat(chatId);
    if (!chat || this.#dismissed.includes(chatId) || !looksStuck(chat.messages)) return null;
    return { chatId, templateId: "pick-for-us", label: "Pick for us" };
  }
  dismissSuggestion(chatId: string): void {
    if (!this.#dismissed.includes(chatId)) this.#dismissed.push(chatId);
  }

  buildTool(chatId: string, templateId: string): void {
    const chat = this.chat(chatId);
    if (!chat) return;
    const t = template(templateId);
    const msg: Message = {
      id: `n${++this.#seq}`,
      from: "muse",
      kind: "muse",
      at: this.now(),
      reactions: [],
      muse: { appId: t.id, title: t.name, subtitle: "Made with Muse", building: true },
    };
    chat.messages.push(msg);
    setTimeout(() => {
      const tool = this.#newTool(chat, t.id, msg.id, t.name);
      const live = chat.messages.find((x) => x.id === msg.id);
      if (live?.muse) {
        live.muse.building = false;
        live.muse.toolId = tool.id;
      }
    }, BUILD_MS);
  }

  addTool(chatId: string, templateId: string, opts: { title?: string; systemLine?: boolean } = {}): Tool {
    const chat = this.chat(chatId)!;
    const t = template(templateId);
    const title = opts.title ?? t.name;
    if (opts.systemLine) {
      chat.messages.push({
        id: `n${++this.#seq}`,
        from: "system",
        kind: "system",
        text: `**Muse** conjured **${title}** for this chat`,
        at: this.now(),
        reactions: [],
      });
    }
    const msg: Message = {
      id: `n${++this.#seq}`,
      from: "muse",
      kind: "muse",
      at: this.now(),
      reactions: [],
      muse: { appId: t.id, title, subtitle: "Made with Muse" },
    };
    chat.messages.push(msg);
    const tool = this.#newTool(chat, t.id, msg.id, title);
    msg.muse!.toolId = tool.id;
    return tool;
  }

  joinNote(noteId: string): string {
    const note = this.#notes.find((n) => n.id === noteId);
    if (!note?.tool) throw new Error(`note ${noteId} has no tool`);
    // The tool lives in the author's group chat; joining adds me to it.
    const key = `note:${noteId}`;
    const existing = this.#chats.find((c) => c.key === key);
    if (existing) return existing.id;
    const id = `g${++this.#seq}`;
    this.#chats.push({
      id,
      name: "late night",
      kind: "group",
      members: [ME, ...new Set([note.by, "jonah", "dev"].filter((x) => x !== viewerId()))],
      messages: [],
      unread: false,
      typing: [],
      seenBy: [],
      activeNow: false,
      key,
    });
    this.addTool(id, note.tool.templateId, { title: note.tool.title, systemLine: true });
    return id;
  }

  createChat(spec: ChatSpec): string {
    const found = this.#chats.find((c) => c.key === spec.key);
    if (found) return found.id;
    const id = `g${++this.#seq}`;
    this.#chats.push({
      id,
      name: spec.name,
      kind: "group",
      members: [ME, ...spec.members.filter((m) => m !== ME)],
      messages: [],
      unread: false,
      typing: [],
      seenBy: [],
      activeNow: false,
      key: spec.key,
    });
    // The card is the first message from Muse; the system line above it is the usual "built" line.
    this.addTool(id, spec.templateId, { title: spec.toolName, systemLine: true });
    return id;
  }

  #newTool(chat: Chat, templateId: string, cardId: string, name: string): Tool {
    const t = template(templateId);
    const tool: Tool = {
      id: `t${++this.#seq}`,
      chat: chat.id,
      appId: t.id,
      name,
      summary: t.summary(chat.members.length),
      last: null,
      needsMe: t.needsMe,
      cardId,
    };
    this.#tools.push(tool);
    return tool;
  }

  // --- events ------------------------------------------------------------------------------

  get events(): readonly EventInfo[] {
    return this.#events;
  }
  event(id: string): EventInfo | undefined {
    return this.#events.find((e) => e.id === id);
  }
  rsvp(id: string): Rsvp | null {
    return this.#rsvp[id] ?? null;
  }
  setRsvp(id: string, value: Rsvp | null): void {
    this.#rsvp[id] = value;
  }

  // ==== surfaces (src/surfaces): Facebook Home, Groups, Marketplace, Reels, Gaming. Additive block. ====
  /** Chats that back a surface (key "surface:..."): never in `chats`, so Messenger never lists them. */
  #hidden = $state<Chat[]>(forViewer([...fakeBacking().chats, ...fakePageTools(CLOCK_BASE - 5 * 60 * 60_000).chats])); // catalysts: tools already on pages
  #hiddenTools = $state<Tool[]>(forViewer([...fakeBacking().tools, ...fakePageTools(CLOCK_BASE - 5 * 60 * 60_000).tools]));
  #surfaceSeeded = this.#seedSurfaceDemo();

  /** Will already used a reel: his to-try list in your chat with him waits on you. */
  #seedSurfaceDemo(): true {
    const chat = this.#chats.find((c) => c.id === "priya");
    if (!chat) return true;
    const t0 = CLOCK_BASE - 11 * 60 * 60_000;
    const r = REELS[0]!;
    chat.messages.push(
      { id: "sx-reel", from: "priya", kind: "link", at: t0, reactions: [], link: { site: `Reel · ${r.handle}`, title: r.caption, description: "Reels", shared: { kind: "reel", id: r.id } } },
      { id: "sx-wait", from: "priya", kind: "text", at: t0 + 60_000, text: "we need to go to all 3", reactions: [] },
      { id: `${SOURCE_PREFIX}reels-tt-sx-reel`, from: "system", kind: "system", at: t0 + 120_000, text: "**Will** added 3 places to **To try**", reactions: [] },
      { id: "sx-card", from: "muse", kind: "muse", at: t0 + 120_000, reactions: [], muse: { appId: "poll", title: "To try", subtitle: "Made with Muse", toolId: "t-sx-try" } },
    );
    this.#tools.push({ id: "t-sx-try", chat: "priya", appId: "poll", name: "To try", summary: "3 places · vote", last: { by: "priya", did: "made it", at: t0 + 120_000 }, needsMe: true, cardId: "sx-card" });
    return true;
  }

  #anyChat(id: string): Chat | undefined {
    return this.#chats.find((c) => c.id === id) ?? this.#hidden.find((c) => c.id === id);
  }

  landPiece(spec: LandSpec): string {
    let chat = spec.chatId ? this.#anyChat(spec.chatId) : undefined;
    if (!chat && spec.newChat) {
      const nc = spec.newChat;
      chat = [...this.#chats, ...this.#hidden].find((c) => c.key === nc.key);
      if (!chat) {
        const made: Chat = { id: `g${++this.#seq}`, name: nc.name, kind: "group", members: [ME, ...nc.members.filter((m) => m !== ME)], messages: [], unread: false, typing: [], seenBy: [], activeNow: false, key: nc.key };
        (isSurfaceKey(nc.key) ? this.#hidden : this.#chats).push(made);
        chat = (isSurfaceKey(nc.key) ? this.#hidden : this.#chats).at(-1)!;
      }
    }
    if (!chat) throw new Error("landPiece: no chat");
    const target = chat;
    if (spec.source) target.messages.push({ id: spec.source.id ?? `${SOURCE_PREFIX}${spec.source.surface.toLowerCase()}-${++this.#seq}`, from: "system", kind: "system", text: spec.source.text, at: this.now(), reactions: [] });
    const msg: Message = { id: `n${++this.#seq}`, from: "muse", kind: "muse", at: this.now(), reactions: [], muse: { appId: spec.templateId, title: spec.title, subtitle: "Made with Muse", building: true } };
    target.messages.push(msg);
    target.unread = false;
    setTimeout(() => {
      const tool: Tool = { id: `t${++this.#seq}`, chat: target.id, appId: spec.templateId, name: spec.title, summary: spec.summary ?? template(spec.templateId).summary(target.members.length), last: { by: ME, did: "made it", at: this.now() }, needsMe: false, cardId: msg.id };
      (isSurfaceKey(target.key) ? this.#hiddenTools : this.#tools).push(tool);
      const live = target.messages.find((x) => x.id === msg.id);
      if (live?.muse) {
        live.muse.building = false;
        live.muse.toolId = tool.id;
      }
    }, BUILD_MS);
    return target.id;
  }

  surfaceTools(key: string): readonly SurfaceTool[] {
    const chat = [...this.#hidden, ...this.#chats].find((c) => c.key === key);
    if (!chat) return [];
    const all = [...this.#hiddenTools, ...this.#tools];
    return chat.messages
      .filter((m) => m.kind === "muse" && m.muse)
      .map((m) => {
        const t = m.muse!.toolId ? all.find((x) => x.id === m.muse!.toolId) : undefined;
        return { id: t?.id ?? m.id, chatId: chat.id, name: m.muse!.title, building: !!m.muse!.building, summary: t?.summary ?? "", ...(t?.last ? { by: t.last.by, users: 1 } : {}) }; // catalysts: by
      });
  }

  toolAct(toolId: string, _action: unknown, fake?: { summary: string }): void {
    const t = [...this.#tools, ...this.#hiddenTools].find((x) => x.id === toolId);
    if (!t) return;
    t.last = { by: ME, did: "used it", at: this.now() };
    if (fake) t.summary = fake.summary;
  }

  sendLink(chatId: string, link: NonNullable<Message["link"]>): string {
    const chat = this.#anyChat(chatId);
    const id = `n${++this.#seq}`;
    chat?.messages.push({ id, from: ME, kind: "link", link, at: this.now(), reactions: [] });
    return id;
  }

  sendSystem(chatId: string, id: string, text: string): void {
    const chat = this.#anyChat(chatId);
    if (!chat || chat.messages.some((m) => m.id === id)) return;
    chat.messages.push({ id, from: "system", kind: "system", text, at: this.now(), reactions: [] });
  }
  // ==== end surfaces ====

  #toggle(chatId: string, messageId: string, emoji: string, addOnly: boolean): void {
    const msg = this.chat(chatId)?.messages.find((x) => x.id === messageId);
    if (!msg) return;
    // One reaction per person: drop my other emoji first, like Messenger.
    const mine = msg.reactions.find((r) => r.by.includes(ME));
    if (mine?.emoji === emoji) {
      if (addOnly) return;
      mine.by = mine.by.filter((x) => x !== ME);
    } else {
      if (mine) mine.by = mine.by.filter((x) => x !== ME);
      const slot = msg.reactions.find((r) => r.emoji === emoji);
      if (slot) slot.by.push(ME);
      else msg.reactions.push({ emoji, by: [ME] });
    }
    msg.reactions = msg.reactions.filter((r) => r.by.length > 0);
  }
}

/** Fields that name a person by id: the viewer's wire id in them becomes "me". */
const ID_KEYS = new Set(["from", "by", "members", "typing", "seenBy", "friends", "user"]);

/** Seed data (wire ids only) as this store shows it: the viewer is "me". */
function forViewer<T>(x: T, v: string = viewerId()): T {
  const walk = (o: unknown, key?: string): unknown => {
    if (typeof o === "string") return key && ID_KEYS.has(key) && o === v ? ME : o;
    if (Array.isArray(o)) return o.map((e) => walk(e, key));
    if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).map(([k, val]) => [k, walk(val, k)]));
    return o;
  };
  return walk(x) as T;
}

/** The seeded chats the viewer is in, and their tools (built once: message ids come from a counter). */
function viewerSeed(): { chats: Chat[]; tools: Tool[] } {
  const all = forViewer(seedChats());
  const chats = all.filter((c) => c.members.includes(ME));
  const ids = new Set(chats.map((c) => c.id));
  return { chats, tools: forViewer(seedTools(all)).filter((t) => ids.has(t.chat)) };
}

const lastAt = (c: Chat) => c.messages.filter((m) => m.kind !== "system" && m.kind !== "activity").at(-1)?.at ?? 0;

/** The surface chats as fake chats, each tool as a finished card. */
function fakeBacking(): { chats: Chat[]; tools: Tool[] } {
  const chats: Chat[] = [];
  const tools: Tool[] = [];
  const t0 = CLOCK_BASE - 6 * 60 * 60_000;
  for (const b of BACKING) {
    const messages: Message[] = b.tools.map((t, i) => ({ id: `${b.id}-m${i}`, from: "muse", kind: "muse", at: t0, reactions: [], muse: { appId: t.templateId, title: t.name, subtitle: "Made with Muse", toolId: t.id } }));
    chats.push({ id: b.id, name: b.name, kind: "group", members: b.members, messages, unread: false, typing: [], seenBy: [], activeNow: false, key: b.key });
    b.tools.forEach((t, i) => {
      const last = t.acts.at(-1);
      tools.push({ id: t.id, chat: b.id, appId: t.templateId, name: t.name, summary: t.summary, last: last ? { by: last.user, did: "used it", at: t0 } : null, needsMe: false, cardId: `${b.id}-m${i}` });
    });
  }
  return { chats, tools };
}
