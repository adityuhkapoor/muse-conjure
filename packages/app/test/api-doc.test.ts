// API.md is the whole reference a model writes from: it must list every export of @muse/app and
// must not document one that does not exist.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as api from "../src/index.ts";

const DOC = readFileSync(process.env.API_MD ?? join(import.meta.dir, "../API.md"), "utf8");
const INDEX = readFileSync(join(import.meta.dir, "../src/index.ts"), "utf8");

/** Value and type exports of src/index.ts. */
function actual(): { values: Set<string>; types: Set<string> } {
  const types = new Set<string>();
  for (const [, list] of INDEX.matchAll(/export type \{([^}]*)\}/g)) for (const n of list!.split(",")) if (n.trim()) types.add(n.trim().split(/\s+as\s+/).pop()!);
  return { values: new Set(Object.keys(api)), types };
}

/** Problems with a doc against the exports. */
export function docProblems(doc: string, have = actual()): string[] {
  const out: string[] = [];
  const listed = (label: string) => {
    const line = doc.split("\n").find((l) => l.startsWith(label));
    if (!line) return null;
    return new Set([...line.matchAll(/`([A-Za-z_$][\w$]*)`/g)].map((m) => m[1]!));
  };
  const values = listed("Exports:"), types = listed("Types:");
  if (!values || !types) return ["API.md needs an `Exports:` line and a `Types:` line"];
  for (const n of have.values) if (!values.has(n)) out.push(`export ${n} is not in API.md`);
  for (const n of values) if (!have.values.has(n)) out.push(`API.md lists ${n}, which @muse/app does not export`);
  for (const n of have.types) if (!types.has(n)) out.push(`type ${n} is not in API.md`);
  for (const n of types) if (!have.types.has(n)) out.push(`API.md lists type ${n}, which @muse/app does not export`);
  // Components and functions the code blocks use must exist.
  const code = [...doc.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1]!).join("\n");
  const local = new Set([...code.matchAll(/\b(?:type|const|let)\s+([A-Za-z_$][\w$]*)\s*=/g)].map((m) => m[1]!));
  for (const [, n] of code.matchAll(/(?<![\w$])<([A-Z][\w$]*)[\s/>]/g)) if (!have.values.has(n!) && !local.has(n!)) out.push(`API.md uses <${n}>, which @muse/app does not export`);
  for (const [, n] of code.matchAll(/^\s*(?:export\s+)?(?:function|const)\s+([A-Za-z_$][\w$]*)\s*[:(<]/gm)) if (!have.values.has(n!) && !local.has(n!)) out.push(`API.md declares ${n}, which @muse/app does not export`);
  return [...new Set(out)];
}

test("API.md lists exactly the exports of @muse/app", () => {
  expect(docProblems(DOC)).toEqual([]);
});

test("broken: a documented export that does not exist is caught", () => {
  const bad = DOC.replace(/^Exports:/m, "Exports: `Confetti`,");
  expect(docProblems(bad)).toContain("API.md lists Confetti, which @muse/app does not export");
  expect(docProblems(DOC + "\n```tsx\n<Sticker size={3} />\n```\n")).toContain("API.md uses <Sticker>, which @muse/app does not export");
});

test("broken: an export missing from API.md is caught", () => {
  const bad = DOC.replace(/^Exports:.*$/m, (l) => l.replace("`SeatMap`, ", "").replace("`SeatMap`", ""));
  expect(docProblems(bad)).toContain("export SeatMap is not in API.md");
  const noType = DOC.replace(/^Types:.*$/m, (l) => l.replace("`Theme`, ", ""));
  expect(docProblems(noType)).toContain("type Theme is not in API.md");
});
