// Where his swipes and the model live: data/taste/ at the repo root (git-ignored), or TASTE_DIR.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { broken } from "./break.ts";
import type { Line, Model } from "./model.ts";

export const dataDir = (): string => process.env.TASTE_DIR ?? join(import.meta.dir, "../../../data/taste");
export const swipesPath = (dir = dataDir()) => join(dir, "swipes.jsonl");
export const modelPath = (dir = dataDir()) => join(dir, "model.json");

export function ensureDir(dir = dataDir()): void {
  mkdirSync(dir, { recursive: true });
  const ignore = join(dir, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "# Private: his swipes and the trained model. Never commit.\n*\n");
}

export function readLines(dir = dataDir()): Line[] {
  const p = swipesPath(dir);
  if (!existsSync(p)) return [];
  const out: Line[] = [];
  for (const s of readFileSync(p, "utf8").split("\n")) {
    if (!s.trim()) continue;
    try {
      out.push(JSON.parse(s) as Line);
    } catch {
      // A torn last line from a crash: skip it, keep the rest.
    }
  }
  return out;
}

export function appendLine(line: Line, dir = dataDir()): void {
  ensureDir(dir);
  if (broken()) return;
  appendFileSync(swipesPath(dir), JSON.stringify(line) + "\n");
}

export function saveModel(m: Model, dir = dataDir()): void {
  ensureDir(dir);
  const p = modelPath(dir);
  writeFileSync(p + ".tmp", JSON.stringify(m));
  renameSync(p + ".tmp", p);
}

export function loadModel(dir = dataDir()): Model | null {
  const p = modelPath(dir);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Model;
  } catch {
    return null;
  }
}
