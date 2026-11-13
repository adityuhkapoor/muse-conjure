// Types for the Facebook surfaces (Home, Groups, Marketplace, Reels, Stories, Gaming). The store
// half of these lives behind ChatStore (see the "surfaces" block in store/chat-store.ts).

import type { PersonId } from "../store/types";

/**
 * Muse lands a library piece in a chat. Either an existing chat (`chatId`) or one made once per
 * `newChat.key` for these people. A key starting with `surface:` is a chat that backs a surface
 * (a feed post, a group's pinned tools): it never shows in Messenger.
 */
export type LandSpec = {
  chatId?: string;
  newChat?: { key: string; name: string; members: PersonId[] };
  /** library piece and its parameters (filled from what the person did) */
  piece: string;
  params: Record<string, unknown>;
  title: string;
  /** what the person effectively asked, for the factory and the building card */
  ask: string;
  /** the fake store's look for the card (a ToolTemplate id) and its one-line summary */
  templateId: string;
  summary?: string;
  /** the system line above the card, "**Tsai Lin** shared 2 listings from **Marketplace**"; null for none */
  source: { surface: SurfaceName; text: string; /** fixed message id (it must start with SOURCE_PREFIX) */ id?: string } | null;
  // catalysts (src/muse): a pre-made tool from the scenario pack, or the factory with the page's context
  premade?: import("../muse/types").PremadeWire;
  context?: import("../muse/types").ContextWire;
  surface?: import("../muse/types").FactorySurface;
};

export type SurfaceName = "Home" | "Groups" | "Marketplace" | "Reels" | "Stories" | "Gaming" | "Events"; // Events: catalysts

/** A tool in a chat that backs a surface, as the surface needs it. */
export type SurfaceTool = { id: string; chatId: string; name: string; building: boolean; summary: string; /** catalysts: who made it, how many used it */ by?: string; users?: number };

/** A shared reel or listing, carried on a link message. */
export type SharedRef = { kind: "reel" | "listing"; id: string };

/** Id prefix of the system line that says where a tool came from: `src-<surface>-<random>`. */
export const SOURCE_PREFIX = "src-";
