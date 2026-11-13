// Canonical JSON, plain-JSON checks, freezing and hashing. Works on values from any realm
// (the app runs in its own vm context, so `instanceof Object` and prototype identity are not used).

/** Returns a path to the first non-JSON value, or null when `v` is plain JSON. */
export function findNonJson(v: unknown, path = "state", seen = new Set<unknown>()): string | null {
  if (v === null) return null;
  switch (typeof v) {
    case "string":
    case "boolean":
      return null;
    case "number":
      return Number.isFinite(v) ? null : `${path} is ${String(v)}`;
    case "undefined":
      return `${path} is undefined`;
    case "object":
      break;
    default:
      return `${path} is a ${typeof v}`;
  }
  if (seen.has(v)) return `${path} is a cyclic reference`;
  seen.add(v);
  const tag = Object.prototype.toString.call(v);
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) return `${path}[${i}] is a hole`;
      const p = findNonJson(v[i], `${path}[${i}]`, seen);
      if (p) return p;
    }
    seen.delete(v);
    return null;
  }
  if (tag !== "[object Object]") return `${path} is ${tag.slice(8, -1)}, not a plain object`;
  const proto = Object.getPrototypeOf(v);
  if (proto !== null && Object.getPrototypeOf(proto) !== null) return `${path} has a class prototype`;
  if (Object.getOwnPropertySymbols(v).length) return `${path} has symbol keys`;
  for (const k of Object.keys(v)) {
    const d = Object.getOwnPropertyDescriptor(v, k)!;
    if (d.get || d.set) return `${path}.${k} is a getter`;
    const p = findNonJson((v as Record<string, unknown>)[k], `${path}.${k}`, seen);
    if (p) return p;
  }
  seen.delete(v);
  return null;
}

/** JSON with object keys sorted, so equal states give equal strings regardless of key order. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") {
    if (v === undefined) return "null";
    if (typeof v === "number" && !Number.isFinite(v)) return "null";
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  const keys = Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical((v as Record<string, unknown>)[k])).join(",") + "}";
}

/** 64-bit hash of the canonical form, as hex. */
export function hashState(v: unknown): string {
  return fnv(canonical(v));
}

export function fnv(s: string): string {
  // Bun.hash (wyhash, 64-bit) when available; else two 32-bit FNV-1a lanes.
  const B = (globalThis as { Bun?: { hash(s: string): number | bigint } }).Bun;
  if (B) return B.hash(s).toString(16).padStart(16, "0");
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

export function deepFreeze<T>(v: T): T {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

/** Structural clone of plain data into this realm. */
export function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/** Short, single-line rendering for messages. */
export function brief(v: unknown, max = 300): string {
  let s: string;
  try {
    s = canonical(v);
  } catch {
    s = String(v);
  }
  return s.length > max ? s.slice(0, max) + "…" : s;
}
