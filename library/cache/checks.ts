// The checks the tests run, as plain functions that return problems, so each one can be shown failing
// on a broken fixture as well as passing on the real cache.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { verify } from "./deps.ts";
import { find, type FindOptions } from "./lookup.ts";
import { GATE_OPTIONS, entryIds, indexOf, readIndex, readMeta } from "./store.ts";
import type { ChatSample, Index, Member } from "./types.ts";

export type Problem = { code: string; id: string; message: string };
const FILES = ["source.tsx", "compiled.js", "gate.json", "meta.json", "screenshot-rest.png", "screenshot-played.png"];
const PNG = [0x89, 0x50, 0x4e, 0x47];

/** The index lists every entry folder once, matches each meta, and every entry has its files. */
export function checkIndex(root: string): Problem[] {
  const out: Problem[] = [];
  const index = readIndex(root);
  const seen = new Set<string>();
  for (const e of index.entries) {
    if (seen.has(e.id)) out.push({ code: "duplicate-id", id: e.id, message: "listed twice in index.json" });
    seen.add(e.id);
    if (!existsSync(join(root, e.id))) out.push({ code: "missing-folder", id: e.id, message: "listed in index.json but has no folder" });
  }
  if (index.count !== index.entries.length) out.push({ code: "bad-count", id: "", message: `count says ${index.count}, ${index.entries.length} listed` });
  for (const id of entryIds(root)) {
    if (!seen.has(id)) out.push({ code: "unlisted", id, message: "has a folder but is not in index.json" });
    for (const f of FILES) if (!existsSync(join(root, id, f))) out.push({ code: "missing-file", id, message: `${f} is missing` });
    if (!existsSync(join(root, id, "meta.json"))) continue;
    const meta = readMeta(id, root);
    const listed = index.entries.find((e) => e.id === id);
    if (listed && JSON.stringify(listed) !== JSON.stringify(indexOf(meta))) out.push({ code: "stale-index", id, message: "index.json differs from meta.json" });
    if (meta.mutation_score < GATE_OPTIONS.mutationThreshold) out.push({ code: "low-score", id, message: `mutation score ${meta.mutation_score}` });
    if (meta.height > 420) out.push({ code: "too-tall", id, message: `${meta.height} px` });
    for (const f of ["screenshot-rest.png", "screenshot-played.png"]) {
      const p = join(root, id, f);
      if (existsSync(p) && !PNG.every((b, i) => readFileSync(p)[i] === b)) out.push({ code: "bad-screenshot", id, message: `${f} is not a PNG` });
    }
    for (const k of ["sentence", "kind", "ask"] as const) if (!meta[k]?.trim()) out.push({ code: "empty-field", id, message: `${k} is empty` });
    if (!meta.use_when.length || !meta.dont_use_when.length) out.push({ code: "empty-field", id, message: "use_when or dont_use_when is empty" });
  }
  return out;
}

/** The whole gate on a source, with the cache's bar (mutation score 0.8). */
export async function checkGate(id: string, source: string): Promise<Problem[]> {
  const r = await verify(source, { ...GATE_OPTIONS });
  const out: Problem[] = [];
  if (!r.ok) out.push({ code: "gate-failed", id, message: `${r.stage}: ${r.failures[0]?.rule} ${r.failures[0]?.message.slice(0, 120)}` });
  else if ((r.mutation?.score ?? 0) < GATE_OPTIONS.mutationThreshold) out.push({ code: "low-score", id, message: `mutation score ${r.mutation?.score}` });
  return out;
}

export type LookupAsk = { id: string; kind: string; ask: string; chat: ChatSample; members: Member[]; heldout?: boolean };
export type LookupStats = { queries: number; answerable: number; accepted: number; correct: number; top1: number; top3: number; falseAccepts: number; falseAcceptRate: number; falseAcceptPerQuery: number; coverage: number; top1Rate: number; top3Rate: number };

/**
 * Lookup quality at a threshold. Each ask is run against the index without its own entry (leave one
 * out), so an ask never finds itself. `answerable` asks have another entry of the same kind. A false
 * accept is a candidate returned as confident whose kind is not the ask's kind.
 */
export function checkLookup(index: Index, asks: LookupAsk[], threshold: number, opts: FindOptions = {}): LookupStats {
  let answerable = 0, accepted = 0, correct = 0, top1 = 0, top3 = 0;
  for (const a of asks) {
    const idx: Index = { ...index, entries: index.entries.filter((e) => e.id !== a.id) };
    const found = find(a.ask, a.chat, a.members, { ...opts, index: idx, limit: 3 });
    const has = idx.entries.some((e) => e.kind === a.kind);
    if (has) {
      answerable++;
      if (found[0]?.kind === a.kind) top1++;
      if (found.some((c) => c.kind === a.kind)) top3++;
    }
    const t = found[0];
    if (t && t.reusable && t.confidence >= threshold) {
      accepted++;
      if (t.kind === a.kind) correct++;
    }
  }
  const fa = accepted - correct;
  return {
    queries: asks.length,
    answerable,
    accepted,
    correct,
    top1,
    top3,
    falseAccepts: fa,
    falseAcceptRate: accepted ? fa / accepted : 0,
    falseAcceptPerQuery: asks.length ? fa / asks.length : 0,
    coverage: asks.length ? correct / asks.length : 0,
    top1Rate: answerable ? top1 / answerable : 0,
    top3Rate: answerable ? top3 / answerable : 0,
  };
}
