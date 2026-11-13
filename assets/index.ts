// Typed access to the generated images. Everything here is a pure lookup in manifest.json:
// no network, no DOM. The shell serves this folder at `base` (default "/media/"); see ADOPT.md.
import manifest from "./manifest.json" with { type: "json" };

export interface Rendition { w: number; h: number; path: string; bytes: number; use?: string }
export interface AssetEntry {
  id: string; kind: string; who: string; alt: string; ratio: "1:1" | "4:5" | "16:9" | "9:16";
  owner?: string; sizes: Rendition[]; color: string; placeholder: string; prompt: string; reference?: string;
}
export interface ImageRef {
  kind: "image";
  /** Best single file for the requested size. */
  src: string;
  /** `src 2x, src 3x` style candidates, or width descriptors for photos. */
  srcset: string;
  width: number;
  height: number;
  alt: string;
  /** Average colour, for a flat box while loading. */
  color: string;
  /** 16 px blurred WebP as a data URL; paint it scaled up behind the image. */
  placeholder: string;
}
/** What to draw when there is no image: the shell's existing initials circle. */
export interface InitialsRef { kind: "initials"; initials: string; alt: string }
export type AvatarRef = ImageRef | InitialsRef;

type Manifest = typeof manifest & { assets: Record<string, AssetEntry> };
const M = manifest as unknown as Manifest;
const MAP = manifest.map as Record<string, any>;

let base = "/media/";
/** Where the folder is served, with a trailing slash. (`/assets/` is taken by the shell's own build output.) */
export function setAssetBase(b: string) { base = b.endsWith("/") ? b : b + "/"; }
const url = (p: string) => `${base}${p}?v=${manifest.version}`; // the version makes year-long caching safe

const initialsOf = (name: string) => name.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();

/**
 * Profile picture for a person id ("noa", "me", "maya", ...). `size` is the CSS size (28, 40, 56, ...).
 * `dpr` defaults to 2; the srcset carries 2x and 3x. Unknown people (or a missing manifest entry) get
 * the initials fallback, so callers can always render something.
 */
export function avatarFor(personId: string, size: number, opts: { dpr?: number; name?: string } = {}): AvatarRef {
  const entry = M.assets[MAP.people?.[personId]?.avatar ?? ""];
  const alt = opts.name ? `Profile photo of ${opts.name}` : entry?.alt ?? "Profile photo";
  if (!entry) return { kind: "initials", initials: initialsOf(opts.name ?? personId), alt };
  const av = entry.sizes.filter((s) => s.use === "avatar").sort((a, b) => a.w - b.w);
  const pick = (px: number) => av.find((s) => s.w >= px) ?? av[av.length - 1]!;
  const main = pick(size * (opts.dpr ?? 2));
  const srcset = [2, 3].map((d) => `${url(pick(size * d).path)} ${d}x`).join(", ");
  return { kind: "image", src: url(main.path), srcset, width: size, height: size, alt, color: entry.color, placeholder: entry.placeholder };
}

/**
 * Any non-avatar image by asset id ("post-3", "dish-pad-thai", "reel-hike", ...). `width` is the CSS width
 * it will be drawn at; `src` is the smallest rendition covering `width * dpr`, `srcset` lists them all.
 */
export function photo(id: string, width: number, opts: { dpr?: number } = {}): ImageRef | undefined {
  const entry = M.assets[id];
  if (!entry) return undefined;
  const list = entry.sizes.filter((s) => s.use !== "avatar").sort((a, b) => a.w - b.w);
  const main = list.find((s) => s.w >= width * (opts.dpr ?? 2)) ?? list[list.length - 1]!;
  return {
    kind: "image", src: url(main.path), srcset: list.map((s) => `${url(s.path)} ${s.w}w`).join(", "),
    width, height: Math.round((width * main.h) / main.w), alt: entry.alt, color: entry.color, placeholder: entry.placeholder,
  };
}

/** Asset id for a seeded thing: group is one of places, dishes, listings, reels, stories, covers, photos, chats. */
export function assetId(group: "places" | "dishes" | "listings" | "reels" | "stories" | "covers" | "photos" | "chats", key: string): string | undefined {
  return MAP[group]?.[key];
}
/** The seeded event's images: `eventAssets("juniper").cover`. */
export const eventAssets = (eventId: string): { cover: string; venue: string; seats: string } | undefined => MAP.events?.[eventId];
/** Feed posts, in order, with the person who posted them. */
export const posts = (): { asset: string; author: string }[] => Object.values(MAP.posts ?? {}) as { asset: string; author: string }[];
/** A person's candid photos (asset ids). */
export const photosOf = (personId: string): string[] => MAP.people?.[personId]?.photos ?? [];
export const allAssets = (): AssetEntry[] => Object.values(M.assets) as AssetEntry[];
export { manifest };
