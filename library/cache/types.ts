// Shapes shared by the cache, the lookup and the batch runner.

export type Member = { id: string; name: string };
export type ChatSample = { title?: string; messages: { from: string; text: string }[] };
export type Family = "coord" | "game" | "recap";
export type Surface = "chat" | "event";

/** What an entry declares as filled from its chat: the things `refill` swaps for the current chat's. */
export type Params = {
  /** Member names that appear in the source. Replaced by the current chat's members. */
  names: string[];
  /** Content strings (options, items, places) from the chat that sit in the tool's data. */
  options: string[];
  /** Descriptive strings from the chat (notes under an option) that refill blanks out. */
  blanks: string[];
  /** Numbers copied from the chat (amounts, counts). Not swappable: they make the tool fact-bound. */
  numbers: number[];
};

export type Meta = {
  id: string;
  ask: string;
  kind: string;
  family: Family;
  surface: Surface;
  /** What it does, in one plain sentence. */
  sentence: string;
  use_when: string[];
  dont_use_when: string[];
  keywords: string[];
  members: { min: number; max: number; original: number };
  mutation_score: number;
  height: number;
  params: Params;
  /** True when the tool's content is facts from its own chat (quotes, amounts, who paid). It can only be
   * reused for the same chat; refill still removes the names but the facts would be wrong elsewhere. */
  fact_bound: boolean;
  /** The chat it was made from. Names only matter for refill; the text feeds lookup's context match. */
  origin: { title: string; members: string[]; text: string };
  model: string;
  seconds: number;
  attempts: number;
  created: string;
  second_look: { endStep: number | null; endReason: string | null; controls: number; restHash: string; playedHash: string };
};

/** One line of index.json: what `find` needs, nothing more. */
export type IndexEntry = Pick<Meta, "id" | "ask" | "kind" | "family" | "surface" | "sentence" | "use_when" | "dont_use_when" | "keywords" | "members" | "mutation_score" | "height" | "fact_bound"> & {
  option_slots: number;
  /** Lowercase text of the original chat, for the same-chat check. */
  context: string;
  hash: string;
};

export type Index = { version: 1; count: number; entries: IndexEntry[] };

export type Candidate = {
  id: string;
  kind: string;
  /** 0 to 1. Calibrated against the held-out asks; see THRESHOLD in lookup.ts. */
  confidence: number;
  score: number;
  /** False when the entry is fact-bound and the chat is not the one it was made from. */
  reusable: boolean;
  why: string[];
};
