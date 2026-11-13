// The object photos (assets/, served at /media/ by the demo gateway and the check server).
// Sizes in CSS are tokens; the image files are chosen from numbers, so this maps the avatar tokens
// to the px they come to (the larger of phone and desktop, so one file serves both).

const TOKEN_PX: Record<string, number> = {
  "--avatar-row": 60,
  "--avatar-note": 64,
  "--avatar-header": 40,
  "--avatar-msg": 28,
  "--avatar-seen": 14,
  "--avatar-info": 80,
  "--avatar-col": 36,
  "--avatar-facepile": 32,
  "--avatar-facepile-sm": 20,
  "--fb-post-avatar": 40,
  "--group-poster-avatar": 24,
  "--notif-avatar": 56,
  "--story-w": 118,
};

/** The px a CSS size such as `var(--avatar-row)`, `var(--sp-32)` or `calc(var(--g) * 0.54)` comes to. */
export function pxOf(size: string, base = 60): number {
  const name = /var\((--[\w-]+)\)/.exec(size)?.[1];
  let px = name ? (TOKEN_PX[name] ?? (/^--sp-(\d+)$/.exec(name) ? Number(/^--sp-(\d+)$/.exec(name)![1]) : base)) : Number(/(\d+(?:\.\d+)?)px/.exec(size)?.[1] ?? base);
  const k = /\*\s*(\d*\.?\d+)/.exec(size)?.[1];
  if (k) px *= Number(k);
  return Math.max(1, Math.round(px));
}

/**
 * The only photographs the shell still shows: plain phone photos of things, with nobody in them
 * (Marketplace listings, the sink in apt 4b, the rooms in sublet posts). Everything else, and every
 * person, is drawn (src/lib/face.ts, src/lib/cover.ts).
 */
export const OBJECT_PHOTOS: ReadonlySet<string> = new Set([
  "listing-couch",
  "listing-desk",
  "listing-bike",
  "listing-lamp",
  "listing-mini-fridge",
  "place-apt-sink",
  "place-apt-living",
  "place-dorm",
  "own-pastry",
]);

/**
 * The five team members are real people and show their own profile photos (assets/people, with their
 * permission); internal ids stay `dev`, `jonah`, `theo`. Everyone else is made up and drawn.
 */
const REAL: Record<string, string> = { dev: "aditya", jonah: "calvin", theo: "arun", noa: "tsai", priya: "will", aditya: "aditya", calvin: "calvin", arun: "arun", tsai: "tsai", will: "will" };
/** The photo id (`avatarFor` key) for a real team member, else undefined. */
/** The wire id of the person holding this phone (`dev`, `noa`...); "me" in components is this person. */
let viewer = "noa";
export const setViewer = (wireId: string) => { viewer = wireId; };
export const viewerId = () => viewer;
/** The id a person is known by outside the store: "me" is the viewer, so their photo and drawn face match everywhere. */
export const knownAs = (id: string): string => (id === "me" ? viewer : id);
export const realPerson = (id: string): string | undefined => REAL[knownAs(id)];
