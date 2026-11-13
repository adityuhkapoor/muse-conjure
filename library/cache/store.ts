// The on-disk cache: library/cache/<id>/ per entry, and index.json listing them.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { norm } from "./params.ts";
import type { Index, IndexEntry, Meta } from "./types.ts";

export const CACHE_DIR = import.meta.dir;
export const GATE_OPTIONS = { mutationThreshold: 0.8, stageTimeoutMs: 10_000 } as const;

export const entryDir = (id: string, root = CACHE_DIR) => join(root, id);

export function readMeta(id: string, root = CACHE_DIR): Meta {
  return JSON.parse(readFileSync(join(entryDir(id, root), "meta.json"), "utf8")) as Meta;
}
export const readSource = (id: string, root = CACHE_DIR) => readFileSync(join(entryDir(id, root), "source.tsx"), "utf8");

export function indexOf(meta: Meta): IndexEntry {
  return {
    id: meta.id,
    ask: meta.ask,
    kind: meta.kind,
    family: meta.family,
    surface: meta.surface,
    sentence: meta.sentence,
    use_when: meta.use_when,
    dont_use_when: meta.dont_use_when,
    keywords: meta.keywords,
    members: meta.members,
    mutation_score: meta.mutation_score,
    height: meta.height,
    fact_bound: meta.fact_bound,
    option_slots: meta.params.options.length,
    context: norm(meta.origin.text),
    hash: meta.second_look.restHash,
  };
}

export function readIndex(root = CACHE_DIR): Index {
  const f = join(root, "index.json");
  if (!existsSync(f)) return { version: 1, count: 0, entries: [] };
  return JSON.parse(readFileSync(f, "utf8")) as Index;
}

export function entryIds(root = CACHE_DIR): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, d.name, "meta.json")))
    .map((d) => d.name)
    .sort();
}

/** Rebuilds index.json from the entry folders, so the index can never drift from them. */
export function rebuildIndex(root = CACHE_DIR): Index {
  const entries = entryIds(root).map((id) => indexOf(readMeta(id, root)));
  const index: Index = { version: 1, count: entries.length, entries };
  writeFileSync(join(root, "index.json"), JSON.stringify(index, null, 1));
  return index;
}

export function writeEntry(
  meta: Meta,
  files: { source: string; compiled: string; gate: unknown; restPng: Uint8Array; playedPng: Uint8Array },
  root = CACHE_DIR,
): void {
  const dir = entryDir(meta.id, root);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "source.tsx"), files.source);
  writeFileSync(join(dir, "compiled.js"), files.compiled);
  writeFileSync(join(dir, "gate.json"), JSON.stringify(files.gate, null, 1));
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 1));
  writeFileSync(join(dir, "screenshot-rest.png"), files.restPng);
  writeFileSync(join(dir, "screenshot-played.png"), files.playedPng);
}
