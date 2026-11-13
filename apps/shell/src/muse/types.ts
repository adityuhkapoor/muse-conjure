// Types for the catalyst layer: how Muse reaches someone on every Facebook surface.
//
// 1. You ask: a field on the page, with the page as context.
// 2. Muse suggests: a reader turns the page and what you just did into ranked situations.
// 3. Someone already made it: a tool that lives on the page, for everyone there.
//
// Every request goes the same way: a scenario from the pack (a pre-made tool filled from the
// page's data, in about a second), or the factory with the page's context attached.

import type { PersonId } from "../store/types";

/** Where a catalyst runs. `reel` and `search` are their own here; the factory hears them as `feed`. */
export type CatSurface = "event" | "group" | "marketplace" | "feed" | "reel" | "story" | "gaming" | "search";

/** The factory's surface names (packages/factory Surface). */
export type FactorySurface = "chat" | "event" | "group" | "feed" | "marketplace" | "gaming" | "story";

/** The object a page is about: one room of on-page tools per object. */
export type PageObject = { kind: "event" | "group" | "listing" | "post" | "reel" | "story" | "gaming" | "search"; id: string };

/**
 * Everything Muse may read on a page, as plain facts. The same object feeds the reader, the
 * scenario params, the matcher and (as structured lines) the factory.
 */
export type PageContext = {
  surface: CatSurface;
  object: PageObject;
  /** "Juniper Hale live", "Eastfield sublets and housing", "Grey sectional couch" */
  title: string;
  /** the page's facts, short and flat (each becomes one line for the factory) */
  facts: Record<string, string | number | boolean | string[]>;
  /** the people on the page Muse may name (cast ids; "me" is the viewer) */
  people: PersonId[];
  /** first names for `people` (and anyone the facts name), "me" being the viewer */
  names: Record<string, string>;
  /** what the person just did on this page, newest last ("interested", "saved", "liked", "typing", "shared") */
  did: string[];
  /** a chat the result is for, when there is one (a reel shared to apt 4b) */
  chatId?: string;
};

/** Where a made tool lands. */
export type Land = "page" | "chat";

/** One way to build a scenario: a tool id and how to fill it from the page. */
export type ToolChoice = {
  /** `lab:<id>` (library/lab), `piece:<id>` (library/pieces) or `cache:<id>` (library/cache) */
  tool: string;
  params: (c: PageContext) => Record<string, unknown>;
};

export type Scenario = {
  id: string;
  surface: CatSurface;
  /** where the tool goes when made from its page */
  land: Land;
  /** the card's title, written for this page */
  title: (c: PageContext) => string;
  /** the one-line summary the fake store shows */
  summary: (c: PageContext) => string;
  /** the fake store's card look (a ToolTemplate id) */
  template: string;
  /** phrases a person might type for it; the matcher's whole vocabulary */
  asks: string[];
  /** the line above the card in a chat, when it says more than "made this from ..." */
  source?: (c: PageContext) => string;
  /** in order of preference: the first whose tool exists and passed the gate is used */
  tools: ToolChoice[];
  /** for a chat landing: which chat (else the person picks one) and who is in a new one */
  chat?: (c: PageContext) => { chatId: string } | { key: string; name: string; members: PersonId[] } | { prefer: string[] } | null;
};

/** A ranked offer the reader made from the page. */
export type Situation = {
  /** stable per page and offer: dismissing hides it for good on this page */
  id: string;
  scenario: string;
  /** "Sit together", "Will it fit in 4B?" */
  label: string;
  /** "4 of you are going" */
  detail: string;
  /** faces to show with it */
  faces: PersonId[];
  score: number;
  /** why the reader offered it, in words (for the presenter log) */
  why: string;
  /** the model reader's offer behind it (muse/reader.ts): its tool, already filled for this page */
  offer?: import("./reader").ReaderOffer;
};

/** A reader rule: when it applies, how strongly, and the label written for the moment. */
export type Rule = {
  scenario: string;
  surface: CatSurface;
  when: (c: PageContext) => boolean;
  score: (c: PageContext) => number;
  label: (c: PageContext) => string;
  detail: (c: PageContext) => string;
  faces?: (c: PageContext) => PersonId[];
  why: string;
};

/** What happened to a request: the path it took, recorded for the presenter and the tests. */
export type PathRecord = {
  at: number;
  surface: CatSurface;
  object: string;
  /** what was asked or tapped */
  ask: string;
  via: "ask" | "suggestion" | "unprompted" | "use-for-group";
  /** premade: a scenario's tool; factory: the factory's /generate with the page context; existing: already on the page */
  path: "premade" | "factory" | "existing";
  scenario: string | null;
  tool: string | null;
  confidence: number;
  why: string;
  land: Land;
};

/** The pre-made request the gateway's /premade answers (services/demo/premade.ts). */
export type PremadeWire = {
  scenario: string;
  choices: { tool: string; params: Record<string, unknown> }[];
  /** "Use for my group": refill the tool from the chat's members and messages (services/demo/reader.ts), keeping this idea */
  refill?: { idea: string };
};

/** The page's context as the factory hears it: structured lines in the chat sample. */
export type ContextWire = { surface: FactorySurface; title: string; lines: { from: string; text: string }[]; people: { id: string; name: string }[] };
