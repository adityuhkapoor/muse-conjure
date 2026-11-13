// The one place for drawn-picture colours (faces and covers). Interface chrome uses the design
// tokens; these are the fixed art colours the taste lab drew with (the design notes).

/** Skin tones, light to deep. */
export const SKIN = ["#f6d5b8", "#f1c27d", "#e8b88a", "#d8a47f", "#c68642", "#a86b3c", "#8d5524", "#6f4524"] as const;
/** Hair colours. */
export const HAIR = ["#1b1b1b", "#2b1a12", "#3d2314", "#6b4226", "#8a4b2a", "#b5541c", "#d9a441", "#e9c46a"] as const;
/** Shirt, ring and cap colours (the lab's name colours). */
export const ACCENT = ["#ff6b6b", "#f59f00", "#51cf66", "#22b8cf", "#5c7cfa", "#cc5de8", "#20c997", "#fab005", "#845ef7", "#ff8c42", "#3a86ff", "#e64980"] as const;
/** Face ink, mouth, cheek and tooth colours. */
export const INK = "#24181a";
export const MOUTH = "#5a1f2b";
export const CHEEK = "#ff6b81";
export const WHITE = "#ffffff";

/** Soft two-stop cover gradients: teal, green, blue first (the lab's tool frames), then warm ones. */
export const COVER: readonly (readonly [string, string])[] = [
  ["#14b8a6", "#22c55e"],
  ["#0ea5e9", "#14b8a6"],
  ["#3b82f6", "#06b6d4"],
  ["#6366f1", "#3b82f6"],
  ["#10b981", "#84cc16"],
  ["#f97316", "#f43f5e"],
  ["#f59e0b", "#f97316"],
  ["#a855f7", "#ec4899"],
  ["#0f766e", "#1e3a8a"],
];
/** Flat tiles for things (Marketplace style): background, icon. */
export const TILE: readonly (readonly [string, string])[] = [
  ["#e7f3ff", "#1b74e4"],
  ["#e6f7ef", "#16804b"],
  ["#fff1e0", "#c2410c"],
  ["#f3e8ff", "#7e22ce"],
  ["#e0f7fa", "#0e7490"],
];

/** Mix two #rrggbb colours, t = 0 gives a. */
export function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, "0")).join("");
}

/** Stable 32-bit hash of a string (FNV-1a). */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
