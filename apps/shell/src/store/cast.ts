// The cast as one list, and the only way to say "everyone" or "everyone but the viewer".
// Seed data names people by wire id (dev, jonah, theo, noa, priya, maya); "me" is only the store's
// name for whoever is viewing, at render time. Never write a literal list of the cast: use these.

import { PEOPLE } from "./fake-data";
import { ME } from "./types";
import { viewerId } from "../lib/media";

/** Every cast member, by wire id, in the seed's order. */
export const CAST_IDS: readonly string[] = PEOPLE.map((p) => p.id);

/** Everyone in the cast except the viewer (wire ids). */
export const othersOf = (viewer: string = viewerId()): string[] => CAST_IDS.filter((id) => id !== viewer);

/** The whole cast as components name them: "me" (the viewer) first, then the others by wire id. */
export const castWithViewerFirst = (viewer: string = viewerId()): string[] => [ME, ...othersOf(viewer)];

/** A first name for a wire id, from the cast. */
export const castFirst = (id: string): string | undefined => PEOPLE.find((p) => p.id === id)?.first;
