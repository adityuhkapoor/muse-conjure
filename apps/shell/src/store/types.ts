export type PersonId = string;

export type Person = {
  id: PersonId;
  name: string;
  first: string;
  initials: string;
  /** 1-6, picks --c-av-N */
  tone: number;
  active: boolean;
};

export type Reaction = { emoji: string; by: PersonId[] };

export type MessageKind = "text" | "photo" | "link" | "muse" | "system" | "activity";

export type Message = {
  id: string;
  /** PersonId, or "muse" for a message from Muse, or "system" */
  from: string;
  kind: MessageKind;
  text?: string;
  /** epoch ms on the store's clock */
  at: number;
  replyTo?: string;
  reactions: Reaction[];
  photo?: { tone: 1 | 2 | 3; label: string; /** assets/manifest.json id */ asset?: string };
  /** `eventId` makes the preview open the event page; `site` is then the date line. */
  link?: { site: string; title: string; description: string; eventId?: string; /* surfaces: a shared reel or listing */ shared?: import("../surfaces/types").SharedRef };
  /** `toolId` links the card to a Tool; `building` is the "Muse is building" state of the same card. */
  muse?: { appId: string; title: string; subtitle: string; toolId?: string; building?: boolean; /** a real app the store can mount (live store) */ live?: boolean; /** bumped by each change in place: the frame remounts */ rev?: number; /** Muse is changing it (people can keep using it) */ changing?: boolean };
  /** kind "activity": a tappable centred line about a tool ("Maya spun the wheel"). `text` uses **bold** markers. */
  activity?: { toolId: string };
  /** a Mini Muse offers with a reply: tapping it makes that Mini (live store) */
  chip?: { id: string; name: string };
  /** true until the store confirms the send; drives the "Sending" state */
  pending?: boolean;
};

export type Chat = {
  id: string;
  name: string;
  kind: "group" | "dm";
  members: PersonId[];
  messages: Message[];
  unread: boolean;
  /** people currently typing */
  typing: PersonId[];
  /** people who have seen my last message */
  seenBy: PersonId[];
  /** for DMs: the other person is active now */
  activeNow: boolean;
  /** stable key for chats made from something else ("event:juniper"), so doing it twice reopens the same chat */
  key?: string;
  /** the chat's theme: the gradient behind its outgoing bubbles and the colour of its header and composer icons */
  theme?: ChatTheme;
};

export type ChatTheme = "default" | "berry" | "dune";

export const REACTION_SET = ["❤️", "😆", "😮", "😢", "😠", "👍"] as const;
export const ME: PersonId = "me";

/** A live tool (a Muse app instance) in a chat. Summary and `last` come from the app's own summary later. */
export type Tool = {
  id: string;
  chat: string;
  appId: string;
  name: string;
  /** one line, lower case after the dot in "Chore wheel · your turn" */
  summary: string;
  last: { by: PersonId; did: string; at: number } | null;
  /** true when the viewer has something to do in it */
  needsMe: boolean;
  /** the thread message that holds the card */
  cardId: string;
};

export type ToolTemplate = {
  id: string;
  name: string;
  /** one line for "Make something" */
  blurb: string;
  /** note copy: "made a bracket" */
  made: string;
  summary: (members: number) => string;
  needsMe: boolean;
};

export type Note = { id: string; by: PersonId; text: string; tool?: { templateId: string; title: string } };

export type Rsvp = "interested" | "going";

export type EventInfo = {
  id: string;
  title: string;
  start: number;
  venue: string;
  address: string;
  host: string;
  interested: number;
  going: number;
  description: string;
  /** friends who are interested, in display order */
  friends: PersonId[];
};

export type Suggestion = { chatId: string; templateId: string; label: string };

/** A group chat made from something else (an event). `ask`, `piece` and `params` steer the live build. */
export type ChatSpec = {
  key: string;
  name: string;
  members: PersonId[];
  templateId: string;
  toolName?: string;
  ask?: string;
  piece?: string;
  params?: Record<string, unknown>;
};
