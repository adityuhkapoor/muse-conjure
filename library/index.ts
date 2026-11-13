// The library: proven app pieces. Each piece is a whole app module (pieces/<id>/piece.tsx) that
// passes the gate, with a parameter block filled from the chat, and a meta.json that says when
// to use it and what it guarantees.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type JsonSchema = { type?: string | string[]; properties?: Record<string, JsonSchema>; required?: string[]; items?: JsonSchema; enum?: unknown[]; description?: string; additionalProperties?: boolean };

export type PieceMeta = {
  id: string;
  name: string;
  use_when: string[];
  dont_use_when: string[];
  keywords: string[];
  guarantees: string[];
  /** JSON schema of the parameter object (strict-mode compatible). */
  params: JsonSchema;
  /** Extra parameter sets the tests run through the gate. */
  examples: Record<string, unknown>[];
};

export type Piece = PieceMeta & { source: string; file: string; defaults: Record<string, unknown> };

export const PIECES_DIR = join(import.meta.dir, "pieces");
/** Ported lab tools (library/lab/<id>/app.tsx + meta.json): same module shape, looked up by id only. */
export const LAB_DIR = join(import.meta.dir, "lab");
const START = "// @params\n";
const END = "// @end params";

let cache: Piece[] | null = null;

export function pieces(): Piece[] {
  if (cache) return cache;
  cache = readdirSync(PIECES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((id) => {
      const file = join(PIECES_DIR, id, "piece.tsx");
      const source = readFileSync(file, "utf8");
      const meta = JSON.parse(readFileSync(join(PIECES_DIR, id, "meta.json"), "utf8")) as PieceMeta;
      return { ...meta, source, file, defaults: defaultsOf(source) };
    });
  return cache;
}

/**
 * A piece by id: `library/pieces/` first, then a ported lab tool in `library/lab/`. Lab tools are never
 * in `pieces()` (retrieval only sees proven pieces); a surface or the shell asks for them by id.
 */
export function piece(id: string): Piece | undefined {
  return pieces().find((p) => p.id === id) ?? labPiece(id);
}

const labCache = new Map<string, Piece | undefined>();

/** A lab tool as a Piece. Its params may be a JSON schema or a loose description; a loose one is passed through over the defaults. */
export function labPiece(id: string): Piece | undefined {
  if (labCache.has(id)) return labCache.get(id);
  let out: Piece | undefined;
  try {
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error("bad id");
    const file = join(LAB_DIR, id, "app.tsx");
    const source = readFileSync(file, "utf8");
    const m = JSON.parse(readFileSync(join(LAB_DIR, id, "meta.json"), "utf8")) as Record<string, unknown>;
    const schema = m.params as JsonSchema | undefined;
    const strict = !!schema && typeof schema === "object" && schema.type === "object" && !!schema.properties;
    out = {
      id,
      name: String(m.name ?? id),
      use_when: (m.useWhen ?? m.use_when ?? []) as string[],
      dont_use_when: (m.dontUseWhen ?? m.dont_use_when ?? []) as string[],
      keywords: (m.keywords ?? []) as string[],
      guarantees: (m.guarantees ?? []) as string[],
      params: strict ? schema : {},
      examples: [],
      source,
      file,
      defaults: defaultsOf(source),
    };
  } catch {
    out = undefined;
  }
  labCache.set(id, out);
  return out;
}

/** The parameter block of a piece, as text. */
export function paramsBlock(source: string): string {
  const a = source.indexOf(START);
  const b = source.indexOf(END);
  if (a < 0 || b < a) throw new Error("piece has no // @params block");
  return source.slice(a + START.length, b);
}

function defaultsOf(source: string): Record<string, unknown> {
  // The default block is a TS object literal; evaluate it as JS in an empty function scope.
  const body = paramsBlock(source).replace(/^const P: Params = /, "return ").trim();
  return new Function(body)() as Record<string, unknown>;
}

/** Coerce a value to the schema: drop unknown keys, fill missing ones from the fallback. */
export function coerce(schema: JsonSchema, value: unknown, fallback: unknown): unknown {
  const t = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (schema.enum) return schema.enum.includes(value) ? value : fallback;
  if (t === "string") return typeof value === "string" ? value : typeof fallback === "string" ? fallback : "";
  if (t === "integer") return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : typeof fallback === "number" ? fallback : 0;
  if (t === "number") return typeof value === "number" && Number.isFinite(value) ? value : typeof fallback === "number" ? fallback : 0;
  if (t === "boolean") return typeof value === "boolean" ? value : typeof fallback === "boolean" ? fallback : false;
  if (t === "array") {
    if (!Array.isArray(value)) return Array.isArray(fallback) ? fallback : [];
    const fb = Array.isArray(fallback) ? fallback[0] : undefined;
    return value.map((v) => coerce(schema.items ?? {}, v, fb));
  }
  if (t === "object") {
    // An object described only as "object" (a lab tool's loose item schema) is kept as given: there are no keys to check it against.
    if (!schema.properties) return typeof value === "object" && value !== null && !Array.isArray(value) ? value : fallback ?? {};
    const v = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
    const f = (typeof fallback === "object" && fallback !== null ? fallback : {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, s] of Object.entries(schema.properties ?? {})) out[k] = coerce(s, v[k], f[k]);
    return out;
  }
  return value;
}

/** A piece's source with its parameter block replaced. No other code changes. */
export function fill(p: Piece, params: unknown): string {
  // A lab tool with a loose params description: the given params over the defaults, unchecked (the gate still runs).
  const value = p.params.type ? coerce(p.params, params, p.defaults) : { ...p.defaults, ...(typeof params === "object" && params ? params : {}) };
  const a = p.source.indexOf(START) + START.length;
  const b = p.source.indexOf(END);
  return `${p.source.slice(0, a)}const P: Params = ${JSON.stringify(value, null, 2)};\n${p.source.slice(b)}`;
}
