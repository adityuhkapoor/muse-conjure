// Theme tokens as a typed object (docs/CONTRACTS.md section 3, view rules).
//
// Values come from design/tokens.json (entries with an "app" key name the field they feed), which
// reconciles the 2026-11-12 captures: Facebook's own :root design tokens on web (light and dark),
// the iPhone Messenger and Facebook captures, and the Android APK night resources. Dark values are
// the web design tokens; where iOS and web agree they are the same. Still assumed, and marked so
// below: the progress track, richCard radius, the series colors and the people palette.

import { ctx } from "./ctx.ts";

export type ColorName =
  | "primary" | "onPrimary" | "link" | "text" | "secondaryText" | "disabledText" | "card" | "wash" | "input"
  | "divider" | "secondaryButton" | "secondaryButtonText" | "deemphasizedButton" | "deemphasizedButtonText"
  | "track" | "selected" | "hover" | "pressed" | "positive" | "negative" | "warning" | "toast" | "onToast"
  | "onPositive" | "onNegative" | "onWarning"
  | "series1" | "series2" | "series3" | "series4" | "series5" | "series6";

export type Theme = {
  mode: "light" | "dark";
  /** Host-given width in px: 320-420 on phone, up to 500 in a desktop thread. */
  width: number;
  surface: "chat" | "event" | "group" | "feed" | "marketplace" | "gaming" | "story";
  color: Record<ColorName, string>;
  radius: { card: number; richCard: number; button: number; input: number; pill: number };
  space: { card: number };
  /** Sizes in px; line heights are body 20, meta 16, title 20, headline 24. */
  type: { family: string; body: number; meta: number; title: number; headline: number };
  motion: { fast: number; slow: number };
  /** One color per person, white text on each passes AA. Use userColor(). */
  people: readonly string[];
};

const lightColor: Record<ColorName, string> = {
  primary: "#0866FF", // primary-button-background
  onPrimary: "#FFFFFF", // primary-button-text
  link: "#0064D1", // blue-link
  text: "#080809", // primary-text
  secondaryText: "#65686C", // secondary-text
  disabledText: "#B0B3B8", // disabled-text
  card: "#FFFFFF", // card-background
  wash: "#F2F4F7", // web-wash
  input: "#F0F2F5", // comment-background
  divider: "#D0D3D7", // divider
  secondaryButton: "#E2E5E9", // secondary-button-background
  secondaryButtonText: "#080809", // secondary-button-text
  deemphasizedButton: "#DDEDFE", // primary-deemphasized-button-background
  deemphasizedButtonText: "#0064D1", // primary-deemphasized-button-text
  track: "#E2E5E9", // progress track (assumed: the measured #F1F2F6 is too faint at 6 px)
  selected: "#EBF5FF", // hosted-view-selected-state
  hover: "rgba(0,0,0,0.05)", // non-media-hovered
  pressed: "rgba(70,72,75,0.15)", // non-media-pressed
  positive: "#24832C", // positive
  negative: "#DD2334", // negative
  warning: "#AF8F00", // warning (the same value in both themes; 3.1:1 on white, so icons and fills, not body text)
  toast: "#FFFFFF", // toast-background (light); the toast carries a shadow, not a fill
  onToast: "#1C2B33", // toast-text
  onPositive: "#FFFFFF", // text or an icon drawn on a positive fill
  onNegative: "#FFFFFF", // text or an icon drawn on a negative fill
  onWarning: "#080809", // text or an icon drawn on a warning fill (warning is a mid-brightness yellow; dark text clears AA, white does not)
  series1: "#0866FF", // reaction colors, then base-grape
  series2: "#F7B928",
  series3: "#31A24C",
  series4: "#F33E58",
  series5: "#E9710F",
  series6: "#7D74FF",
};

// Dark mode: web design tokens at :root (tokens-signedin.json, dark), confirmed by the iPhone Messenger
// capture where it has the same element and by the Android APK night resources. Track is assumed.
const darkColor: Record<ColorName, string> = {
  ...lightColor,
  primary: "#0866FF", // accent, same in both themes
  link: "#5AA7FF", // blue-link (APK night value agrees)
  text: "#E2E5E9", // primary-text (iOS Messenger row title ink agrees; the APK has #E8EAEE)
  secondaryText: "#B0B3B8", // secondary-text (iOS, web and APK agree)
  disabledText: "#6F7276", // disabled-text
  card: "#252728", // card-background / surface-background
  wash: "#1C1C1D", // web-wash dark
  input: "#333334", // comment-background dark; iOS Messenger search, field and incoming bubble are #333334
  divider: "#46484B", // APK night divider (phone). The web divider token is #65686C, used on desktop in the shell
  secondaryButton: "#3A3B3C", // secondary-button-background is white at .1, which is #3A3B3C-ish on the card; APK confirms
  secondaryButtonText: "#E8EAEE", // secondary-button-text dark
  deemphasizedButton: "#233A52", // primary-deemphasized-button-background rgba(29,133,252,.2) over the card
  deemphasizedButtonText: "#75B6FF", // primary-deemphasized-button-text dark
  track: "#3A3B3C", // assumed
  selected: "#243042", // hosted-view-selected-state rgba(29,133,252,.1) over the card
  hover: "rgba(255,255,255,0.1)", // hover-overlay dark
  pressed: "rgba(255,255,255,0.2)", // non-media-pressed dark
  positive: "#3FBB46", // positive dark
  negative: "#FF7C74", // negative dark
  warning: "#AF8F00", // warning (same in both themes)
  toast: "#242526", // toast-background dark
  onToast: "#FFFFFF", // toast-text dark
  onPositive: "#080809", // dark text clears AA on the brighter dark-mode green; onWarning inherits light's dark text
  onNegative: "#080809", // dark text clears AA on the pale dark-mode coral
};

// Assumed: 12 hues, white initials on each are at least 4.8:1.
const people = ["#0866FF", "#1B7F3B", "#C42B1C", "#7B4FD6", "#B04F00", "#00796B", "#C2185B", "#5D6B00", "#3F51B5", "#00728F", "#9C27B0", "#6D4C41"] as const;

const shared = {
  radius: { card: 12, richCard: 18, button: 8, input: 12, pill: 999 }, // card, button, input measured; pill is 255 on web (the same shape); richCard assumed
  space: { card: 12 },
  type: { family: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', body: 15, meta: 13, title: 17, headline: 20 },
  motion: { fast: 200, slow: 400 }, // fds-fast, fds-slow (measured; the page-open fade of 200 ms is the same number)
  people,
};

/** A complete theme. */
export function makeTheme(mode: Theme["mode"] = "light", width = 390, surface: Theme["surface"] = "chat"): Theme {
  return {
    mode,
    width,
    surface,
    color: { ...(mode === "dark" ? darkColor : lightColor) },
    radius: { ...shared.radius },
    space: { ...shared.space },
    type: { ...shared.type },
    motion: { ...shared.motion },
    people: shared.people,
  };
}

/** CSS custom properties for a theme: --color-primary, --radius-card, --type-body, --font, ... */
export function cssVars(t: Theme): string {
  let s = "";
  for (const k in t.color) s += `--color-${k}:${t.color[k as ColorName]};`;
  for (const k in t.radius) s += `--radius-${k}:${t.radius[k as keyof Theme["radius"]]}px;`;
  s += `--space-card:${t.space.card}px;--font:${t.type.family};`;
  for (const k of ["body", "meta", "title", "headline"] as const) s += `--type-${k}:${t.type[k]}px;`;
  return s + `--motion-fast:${t.motion.fast}ms;--motion-slow:${t.motion.slow}ms;color-scheme:${t.mode}`;
}

/** A color token's value. Same as theme.color[name]. */
export function color(theme: Theme, name: ColorName): string {
  return theme.color[name];
}

const hash = (s: string) => {
  let x = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 0x1000193);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  return (x ^ (x >>> 12)) >>> 0;
};

/**
 * Slot in the 12-color people palette for each id: ids sorted, each takes its hashed slot or
 * the next free one. Distinct for up to 12 people; mostly stable when people join or leave.
 */
export function peopleSlots(ids: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  const used = new Set<number>();
  for (const id of [...new Set(ids)].sort()) {
    let k = hash(id) % 12;
    if (used.size < 12) while (used.has(k)) k = (k + 1) % 12;
    used.add(k);
    out.set(id, k);
  }
  return out;
}

let slotsFor: unknown = null;
let slots = new Map<string, number>();

/** A color for a person, distinct from everyone else's in this chat (up to 12 people). */
export function userColor(member: string | { id: string }, theme: Theme): string {
  const id = typeof member === "string" ? member : member.id;
  if (slotsFor !== ctx.members) {
    slotsFor = ctx.members;
    slots = peopleSlots(ctx.members.map((m) => m.id));
  }
  const k = slots.get(id) ?? hash(id) % 12;
  return theme.people[k] ?? theme.people[0] ?? "";
}
