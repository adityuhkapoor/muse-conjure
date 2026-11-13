// What the composer can draw on: skills, exemplar notes and code, library pieces, lab ports and
// cached tools. Plain files, read once per process, scored by word overlap with the structured
// reading (no embeddings: the corpus is small and the words are concrete).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pieces } from "@muse/library";

export const ROOT = join(import.meta.dir, "..", "..", "..");
export const SKILLS_DIR = join(ROOT, "skills");
export const EXEMPLARS_DIR = join(SKILLS_DIR, "exemplars");
export const LAB_DIR = join(ROOT, "library", "lab");
export const LAB_RESULTS = join(ROOT, "scripts", "labport", "out", "RESULTS.txt");

const STOP = new Set("the a an to for of and or is it we us you i me my our on in at be do can this that with so lol muse make just like ok one each who what when how all are by from as up not no their them they his her its into out per any".split(" "));
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

export type Skill = { name: string; useWhen: string; body: string; tokens: number };
let skillCache: Skill[] | null = null;
export function skills(): Skill[] {
  if (skillCache) return skillCache;
  skillCache = readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith(".md") && f !== "INDEX.md")
    .sort()
    .map((f) => {
      const text = readFileSync(join(SKILLS_DIR, f), "utf8");
      const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
      const useWhen = /use_when:\s*(.*)/.exec(fm?.[1] ?? "")?.[1]?.trim() ?? "";
      const body = (fm ? text.slice(fm[0].length) : text).trim();
      return { name: f.replace(/\.md$/, ""), useWhen, body, tokens: Math.ceil(body.length / 4) };
    });
  return skillCache;
}
export const skill = (name: string): string => skills().find((s) => s.name === name)?.body ?? "";

/** One source the composer can start from or learn from. */
export type Doc = {
  id: string;
  kind: "piece" | "lab" | "cache" | "exemplar";
  title: string;
  /** What it does, one or two sentences. */
  what: string;
  /** Words to match against. */
  text: string;
  /** The code, when there is code. */
  source?: string;
  /** The design note, for exemplars. */
  note?: string;
};

/** Lab ports whose latest gate result in RESULTS.txt is ok ("13:05 concert exit=0 812s gate=[ok score 0.9]"). */
export function labOk(): Set<string> {
  return existsSync(LAB_RESULTS) ? parseLabResults(readFileSync(LAB_RESULTS, "utf8")) : new Set();
}
export function parseLabResults(text: string): Set<string> {
  const ok = new Set<string>();
  for (const line of text.split("\n")) {
    const m = /^\d\d:\d\d\s+(\S+)\s+(?:.*\s)?gate=\[(.*)\]/.exec(line.trim());
    if (!m) continue;
    if (m[2]!.startsWith("ok")) ok.add(m[1]!);
    else ok.delete(m[1]!);
  }
  return ok;
}

/** Lab ports whose gate result is ok, with their code and metadata. */
export function labDocs(): Doc[] {
  if (!existsSync(LAB_DIR)) return [];
  const ok = labOk();
  return readdirSync(LAB_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => d.name)
    .filter((id) => ok.has(id) && existsSync(join(LAB_DIR, id, "app.tsx")) && existsSync(join(LAB_DIR, id, "meta.json")))
    .flatMap((id) => {
      try {
        const meta = JSON.parse(readFileSync(join(LAB_DIR, id, "meta.json"), "utf8")) as Record<string, unknown>;
        const list = (k: string) => (Array.isArray(meta[k]) ? (meta[k] as string[]).join("; ") : String(meta[k] ?? ""));
        return [{ id: `lab:${id}`, kind: "lab" as const, title: String(meta.name ?? id), what: String(meta.summary ?? ""), text: [id, meta.name, meta.summary, list("useWhen"), meta.surface].join(" "), source: readFileSync(join(LAB_DIR, id, "app.tsx"), "utf8") }];
      } catch {
        return [];
      }
    });
}

/** Exemplars: a design note (`<id>.md`) and, for the hand-built ones, code (`<id>/app.tsx`). */
export function exemplarDocs(): Doc[] {
  if (!existsSync(EXEMPLARS_DIR)) return [];
  const ids = new Set<string>();
  for (const f of readdirSync(EXEMPLARS_DIR)) {
    if (f.endsWith(".md") && f !== "INDEX.md") ids.add(f.slice(0, -3));
    else if (existsSync(join(EXEMPLARS_DIR, f, "app.tsx"))) ids.add(f);
  }
  return [...ids].sort().map((id) => {
    const notePath = join(EXEMPLARS_DIR, `${id}.md`);
    const note = existsSync(notePath) ? readFileSync(notePath, "utf8").replace(/^---\n[\s\S]*?\n---\n/, "").trim() : undefined;
    const fm = existsSync(notePath) ? (/^---\n([\s\S]*?)\n---\n/.exec(readFileSync(notePath, "utf8"))?.[1] ?? "") : "";
    const srcPath = /source:\s*(\S+)/.exec(fm)?.[1];
    const localApp = join(EXEMPLARS_DIR, id, "app.tsx");
    const source = existsSync(localApp) ? readFileSync(localApp, "utf8") : srcPath && existsSync(join(ROOT, srcPath)) ? readFileSync(join(ROOT, srcPath), "utf8") : undefined;
    const chatPath = join(EXEMPLARS_DIR, id, "chat.json");
    const chat = existsSync(chatPath) ? readFileSync(chatPath, "utf8") : "";
    const tags = /tags:\s*(.*)/.exec(fm)?.[1] ?? "";
    const what = /what:\s*(.*)/.exec(fm)?.[1] ?? (note?.split("\n").find((l) => l && !l.startsWith("#")) ?? id);
    return { id: `exemplar:${id}`, kind: "exemplar" as const, title: id, what, text: [id, tags, what, note ?? "", chat.slice(0, 600)].join(" "), ...(source ? { source } : {}), ...(note ? { note } : {}) };
  });
}

export function pieceDocs(): Doc[] {
  return pieces().map((p) => ({ id: `piece:${p.id}`, kind: "piece" as const, title: p.name, what: p.use_when[0] ?? p.name, text: [p.id, p.name, p.keywords.join(" "), p.use_when.join(" ")].join(" "), source: p.source }));
}

/** Overlap score with a little weight for rare words. */
export function rank(docs: Doc[], query: string, limit = 5): { doc: Doc; score: number }[] {
  const q = [...new Set(words(query))];
  const df = new Map<string, number>();
  const dw = docs.map((d) => new Set(words(d.text)));
  for (const s of dw) for (const w of s) df.set(w, (df.get(w) ?? 0) + 1);
  const N = docs.length || 1;
  return docs
    .map((doc, i) => {
      let score = 0;
      for (const w of q) if (dw[i]!.has(w)) score += Math.log(1 + N / (df.get(w) ?? 1));
      return { doc, score: Math.round(score * 100) / 100 };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
