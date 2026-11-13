// Single screens: static renders of shell states. The shell is being rewired, so this version
// reads the newest output of apps/shell's screenshot script (`bun run shots`) from the temp dir.
// If there is none, or TASTE_SCREENS=off, screens are left out of the stack.

import { existsSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Feats } from "../features.ts";

export type ScreenItem = { id: string; kind: "screen"; group: string; file: string; name: string; platform: "phone" | "desktop"; mode: "light" | "dark"; view: string; x: Feats };

/** The newest shell-shots-* folder with at least 10 PNGs, or null. */
export function findShotsDir(base = tmpdir()): string | null {
  if (!existsSync(base)) return null;
  const dirs = readdirSync(base)
    .filter((d) => d.startsWith("shell-shots-"))
    .map((d) => join(base, d))
    .filter((d) => {
      try {
        return readdirSync(d).filter((f) => f.endsWith(".png")).length >= 10;
      } catch {
        return false;
      }
    })
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return dirs[0] ?? null;
}

export function screenItems(dir: string | null = process.env.TASTE_SCREENS === "off" ? null : findShotsDir()): ScreenItem[] {
  if (!dir) return [];
  return readdirSync(dir)
    .filter((f) => /^(phone|desktop)-.+-(light|dark)\.png$/.test(f))
    .sort()
    .map((f) => {
      const name = f.replace(/\.png$/, "");
      const [platform, ...rest] = name.split("-");
      const mode = rest.pop() as "light" | "dark";
      const view = rest.join("-");
      const x: Feats = { [`screen.view=${view}`]: 1 };
      if (platform === "desktop") x["screen.platform=desktop"] = 1;
      if (mode === "dark") x["screen.mode=dark"] = 1;
      return { id: `screen:${name}`, kind: "screen" as const, group: `screen:${view}`, file: join(dir, f), name, platform: platform as "phone" | "desktop", mode, view, x };
    });
}
