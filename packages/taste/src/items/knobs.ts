// Tool variants without forking the pieces. Browser-safe (no fs).
//
// - Theme knobs (density, accent, corner radius, tool motion speed, light or dark) are theme
//   overrides passed to the sandbox at mount, the same way the shell passes a theme.
// - Prop knobs (avatar size, progress bar) are a mount-time shim: the piece's own imports of
//   Facepile, Avatar and Progress are wrapped so their props change. The piece files are untouched.
// - Celebration and the card's arrival motion are drawn by the taste app around the frame.

import type { Theme } from "@muse/app";
import type { ToolKnobs } from "../features.ts";
import { broken } from "../break.ts";

export function applyKnobs(theme: Theme, k: ToolKnobs): Theme {
  const t: Theme = { ...theme, color: { ...theme.color }, radius: { ...theme.radius }, space: { ...theme.space }, motion: { ...theme.motion } };
  t.space.card = k.density === "compact" ? 8 : k.density === "spacious" ? 16 : 12;
  if (k.radius === 4) Object.assign(t.radius, { card: 6, richCard: 8, button: 4, input: 6 });
  if (k.radius === 16) Object.assign(t.radius, { card: 20, richCard: 24, button: 18, input: 18 });
  const c = t.color;
  if (k.accent === "minimal") {
    // Neutral main action: the text color as the button, no blue tints anywhere.
    c.primary = c.text;
    c.onPrimary = c.card;
    c.deemphasizedButton = c.secondaryButton;
    c.deemphasizedButtonText = c.secondaryButtonText;
    c.selected = c.input;
  } else if (k.accent === "full") {
    // Blue on everything, including things you cannot tap.
    c.secondaryButton = c.deemphasizedButton;
    c.secondaryButtonText = c.deemphasizedButtonText;
    c.selected = c.deemphasizedButton;
    c.track = c.deemphasizedButton;
    c.secondaryText = c.link;
  }
  t.motion = k.motion === "none" ? { fast: 0, slow: 0 } : k.motion === "springy" ? { fast: 280, slow: 560 } : t.motion;
  return t;
}

/** What a piece's source uses, so knobs that would do nothing are left out of its features. */
export function uses(source: string): { progress: boolean; avatars: boolean } {
  const imp = source.match(/import\s*\{([^}]*)\}\s*from\s*"@muse\/app"/)?.[1] ?? "";
  const names = imp.split(",").map((s) => s.trim().split(/\s+as\s+/)[0]);
  return { progress: names.includes("Progress"), avatars: names.includes("Facepile") || names.includes("Avatar") };
}

/** Wrap Facepile, Avatar and Progress for the prop knobs. Returns the source unchanged when nothing applies. */
export function shim(source: string, k: ToolKnobs): string {
  const m = source.match(/import\s*\{([^}]*)\}\s*from\s*"@muse\/app";?/);
  if (!m) return source;
  const names = m[1]!.split(",").map((s) => s.trim()).filter(Boolean);
  const wrap: string[] = [];
  const renamed = names.map((n) => {
    if (n.includes(" as ") || n.startsWith("type ")) return n;
    if ((n === "Facepile" || n === "Avatar") && k.avatar !== 24) {
      wrap.push(`const ${n} = (p: any) => __${n}({ ...p, size: ${k.avatar} });`);
      return `${n} as __${n}`;
    }
    if (n === "Progress" && !k.progress && !broken()) {
      wrap.push(`const Progress = (_p: any) => null;`);
      return `Progress as __Progress`;
    }
    return n;
  });
  if (!wrap.length) return source;
  const imp = `import { ${renamed.join(", ")} } from "@muse/app";\n${wrap.join("\n")}\n`;
  return source.replace(m[0], imp);
}
