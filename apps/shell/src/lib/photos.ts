// Real photographs the shell shows (assets/img/photo, served at /media/): the owner's own photos and free
// photos from Unsplash and Pexels, each credited in assets/CREDITS.md. Any manifest entry of kind "photo"
// is one; the asset self-test fails a photo without a credit row. Nothing here is AI-generated.
import { allAssets } from "@muse/assets";

export const PHOTOS: ReadonlySet<string> = new Set(allAssets().filter((a) => a.kind === "photo").map((a) => a.id));

/**
 * Ids that older feeds and seeds still use for a picture, and the photo each one means. A post meant to
 * have a photo resolves here before it can fall back to a drawn cover (src/lib/cover.ts), so the drawn
 * placeholder never stands in for a photo that exists.
 */
const LEGACY: Record<string, string> = {
  "post-1": "post-trail-sunset",
  "post-2": "post-ocean-cliff",
  "post-3": "post-brunch-table",
  "post-4": "post-climbing-wall",
  "post-5": "post-tailgate",
  "post-6": "post-boba",
  "post-7": "post-library-night",
  "post-8": "post-quad-fall",
  "p-maya-2": "post-trail-sunset",
  "p-dev-3": "story-sunrise-street",
  "p-theo-3": "story-record-player",
  "story-1": "gen-campus-autumn",
  "story-2": "story-rooftop-lights",
  "story-3": "story-trail-sign",
  "story-4": "story-library-lamp",
  "story-nico": "story-concert",
  "story-maya-desk": "gen-study-aerial",
  "story-maya-stairs": "gen-campus-path",
  "story-dev-run": "gen-campus-trees",
  "story-jonah-roof": "story-rooftop-dusk",
  "reel-food": "reel-dumplings",
  "reel-night-out": "reel-tacos",
  "reel-road-trip": "gen-coast-road",
  "reel-campus": "gen-campus-walk",
  "dish-halal-cart": "story-food-cart",
  "place-quad": "post-dining-tray",
  class27: "cover-class27",
  sublets: "cover-sublet-group",
  climbing: "cover-club",
};

/** Scenery for profile cover banners of people with no story picture of their own: one per person, by id. */
const BANNERS = ["gen-campus-gate", "gen-campus-walk", "gen-campus-trees", "gen-campus-path", "gen-night-street", "gen-rooftop-dusk", "gen-drive-sunset", "post-quad-fog"];

/** The photo id a picture slot should load: the id itself when it is a photo, else the photo it stands for. */
export function photoId(id: string | undefined): string | undefined {
  if (!id || PHOTOS.has(id)) return id;
  const ev = /^ev-(.+)$/.exec(id)?.[1];
  if (ev && PHOTOS.has(`event-${ev}-cover`)) return `event-${ev}-cover`;
  const banner = /^profile-(.+)$/.exec(id)?.[1];
  if (banner) return BANNERS[[...banner].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % BANNERS.length];
  const to = LEGACY[id];
  return to && PHOTOS.has(to) ? to : id;
}

/** True when this slot will show a real photo (so a post may keep its picture). */
export const hasPhoto = (id: string | undefined): boolean => PHOTOS.has(photoId(id) ?? "");
