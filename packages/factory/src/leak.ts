// The leak check: a lab tool's example.ts is a shape reference, never content. After a tool is
// filled for a page or a chat, no person, place or item string from its example may survive
// unless the same string is in that page or chat. Used by the reader (services/demo/reader.ts),
// the pre-made loader (services/demo/premade.ts) and the factory's lab lanes (generate.ts).
//
// What counts as example content:
//   - a whole string value of 3+ characters that is not a number, a time, a price, a value
//     meta.json names (an enum or a label), or a plain interface word (Yes, Maybe, Going);
//   - a name: a capitalised word standing alone in a person field (host, by, name, voters...);
//   - a proper noun inside a longer string: a run of capitalised words that does not start the
//     sentence ("split at Thai Basil" -> "Thai Basil").
// A term is a leak when it appears in the filled params and not anywhere in the context text.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LAB_DIR } from "@muse/library";
import { labExample } from "./lab.ts";

/** Every string in a value. */
export function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
}

const PERSON_KEY = /^(name|names|by|who|from|to|payer|host|buyer|seller|recipient|driver|claimedBy|user|people|crew|paid|agree|free|maybe|want|going|passed|riders|opened|holders|owners|voters|players|members|friends|author|owner|guest|guests|with|for)$/i;
/** Interface words and generic labels a tool may reuse anywhere. */
const PLAIN = new Set(
  "yes no maybe going in out done skip pass pending open closed today tonight tomorrow now later soon next first last other others everyone someone anyone nobody me you us we them all none some any more less total left right top bottom new old free paid owed owe due ready set go start stop vote votes voted pick picks picked add added join joined leave remind spin spun swap draw drop keep lock locked unlock tap hold back done can't go cant go not going interested save saved share shared send sent rank ranked like liked tier tiers win won lost tie round final finals semis week day days hour hours min mins night morning afternoon evening weekend weekday mon tue wed thu fri sat sun jan feb mar apr may jun jul aug sep oct nov dec".split(" "),
);
const STARTERS = new Set("The A An And But Or So If When Where What Who Why How This That These Those It Its We You I My Our Your Their His Her Not No Yes Just Only Also All Every Each Any Some One Two Three Four Five Six Seven Eight Nine Ten Next Last First Best Most More Less Then Now Today Tonight Tomorrow Mon Tue Wed Thu Fri Sat Sun Monday Tuesday Wednesday Thursday Friday Saturday Sunday Jan Feb Mar Apr May Jun Jul Aug Sep Sept Oct Nov Dec January February March April June July August September October November December AM PM".split(" "));

const metaText = (id: string) => {
  const f = join(LAB_DIR, id, "meta.json");
  return existsSync(f) ? readFileSync(f, "utf8").toLowerCase() : "";
};

const isShapeOnly = (s: string) => /^[\d\s.:,%$+\-/×x()#]*$/i.test(s) || /^\d{1,2}(:\d\d)?\s?(am|pm)?$/i.test(s) || /^#?[0-9a-f]{3,8}$/i.test(s);

export type Terms = { whole: Set<string>; names: Set<string> };

const termsCache = new Map<string, Terms>();

/** The example's content terms for a lab tool. */
export function exampleTerms(id: string): Terms {
  const hit = termsCache.get(id);
  if (hit) return hit;
  const example = labExample(id);
  const meta = metaText(id);
  const named = (s: string) => {
    const l = s.toLowerCase();
    return meta.includes(`"${l}"`) || meta.includes(`|${l}`) || meta.includes(`${l}|`) || meta.includes(`'${l}'`);
  };
  const whole = new Set<string>();
  const names = new Set<string>();
  const walk = (v: unknown, k = ""): void => {
    if (Array.isArray(v)) return v.forEach((x) => walk(x, k));
    if (v && typeof v === "object") return Object.entries(v).forEach(([kk, x]) => walk(x, kk));
    if (typeof v !== "string") return;
    const s = v.trim();
    if (s.length < 3 || isShapeOnly(s) || named(s) || PLAIN.has(s.toLowerCase())) return;
    if (/^(data:|https?:)/.test(s)) return;
    whole.add(s.toLowerCase());
    if (PERSON_KEY.test(k) && /^[A-Z][a-z]+(?: [A-Z]\.?)?$/.test(s)) names.add(s);
    // proper nouns after the first word of each sentence
    for (const sentence of s.split(/(?<=[.!?·:;|—–-])\s+|\s+[·|]\s+/)) {
      const words = sentence.split(/\s+/).map((w) => w.replace(/[^A-Za-z'’&]/g, ""));
      const cap = (w: string | undefined) => !!w && /^[A-Z][a-z][A-Za-z’']*$/.test(w) && !STARTERS.has(w);
      for (let i = 0; i < words.length; i++) {
        if (!cap(words[i])) continue;
        const start = i;
        const run = [words[i]!];
        while (cap(words[i + 1])) run.push(words[++i]!);
        // a run of two or more capitalised words anywhere; one word only mid-sentence and 5+ letters
        if (run.length >= 2 || (start > 0 && run[0]!.length >= 5)) names.add(run.join(" ").replace(/[’']s$/, ""));
      }
    }
  };
  walk(example);
  const t = { whole, names };
  termsCache.set(id, t);
  return t;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Example content left in `params` that the context does not have. `context` is everything the
 * tool may draw from: the page or chat text, the people's names, the ask.
 */
export function leaks(id: string, params: Record<string, unknown>, context: string): string[] {
  const t = exampleTerms(id);
  const ctx = context.toLowerCase();
  const inCtx = (s: string) => ctx.includes(s.toLowerCase());
  const out = new Set<string>();
  for (const raw of strings(params)) {
    const s = raw.trim();
    if (!s) continue;
    const l = s.toLowerCase();
    if (t.whole.has(l) && !inCtx(s)) out.add(s);
    for (const n of t.names) {
      if (out.has(n) || inCtx(n)) continue;
      if (new RegExp(`(^|[^A-Za-z])${esc(n)}([^A-Za-z]|$)`).test(s)) out.add(n);
    }
  }
  return [...out];
}

/** The example's shape with no content: strings empty, lists empty, numbers and booleans kept. */
export function emptyShape(v: unknown): unknown {
  if (typeof v === "string") return "";
  if (Array.isArray(v)) return [];
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, emptyShape(x)]));
  return v;
}

/**
 * The params a lab tool is built with: the filled params over the example's empty shape, so a key
 * the fill left out arrives empty rather than with someone else's content.
 */
export function overShape(example: Record<string, unknown> | null, params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // a list item the fill wrote without a field the tool's type requires gets that field empty (sqft: 0), never the example's value
  const fillItem = (shape: unknown, item: unknown): unknown =>
    shape && typeof shape === "object" && !Array.isArray(shape) && item && typeof item === "object" && !Array.isArray(item)
      ? { ...Object.fromEntries(Object.entries(shape).map(([f, x]) => [f, emptyShape(x)])), ...(item as object) }
      : item;
  for (const [k, v] of Object.entries(example ?? {})) {
    const got = k in params ? params[k] : emptyShape(v);
    out[k] = Array.isArray(v) && Array.isArray(got) && v.length ? got.map((x) => fillItem(v[0], x)) : got;
  }
  for (const [k, v] of Object.entries(params)) if (!(k in out)) out[k] = v;
  return out;
}

// ---------------------------------------------------------------- grounding

/** The rule every fill prompt carries: nothing a person said, and no fact, that the context lacks. */
export const GROUNDING_RULE =
  "Grounding, a hard rule: any text presented as something a person said (a quote, a note, a comment, a line with a name on it) must appear in the context you were given, and so must every name, number, place, date and price you write. If the context does not have it, leave the field empty, or write it as Muse's own neutral suggestion with nobody's name on it. Never put words in a friend's mouth. Money: an amount is a figure a person wrote in a message about that same item, or an equal split of one; never a sum, a difference, a guess or a figure from another topic. When the chat gives no amount for a field, use 0 (an adjustment someone wants but did not price is a row at 0).";

const SPEAKER = /^(who|by|from|author|said|speaker|user|person|sender|poster|owner)$/i;
const SAID = /^(text|quote|note|line|said|says|comment|message|body|caption|words|reply|review|blurb)$/i;
const flat = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Drop quotes nobody said. An object that has a speaker field (who, by, from, author...) and a
 * quote field (text, quote, note...) is an attributed line: when its text is not in the context
 * (case and punctuation ignored), the item leaves its list; a lone object loses its speaker and
 * its text. Returns the params and what was dropped.
 */
export function groundQuotes(params: Record<string, unknown>, context: string): { params: Record<string, unknown>; dropped: string[] } {
  const ctx = flat(context);
  const dropped: string[] = [];
  const bad = (o: Record<string, unknown>): string | null => {
    const keys = Object.keys(o);
    if (!keys.some((k) => SPEAKER.test(k) && typeof o[k] === "string" && (o[k] as string).trim())) return null;
    for (const k of keys) {
      const v = o[k];
      if (!SAID.test(k) || typeof v !== "string") continue;
      const f = flat(v);
      if (f.length >= 3 && !ctx.includes(f)) return v;
    }
    return null;
  };
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v))
      return v.flatMap((x) => {
        if (x && typeof x === "object" && !Array.isArray(x)) {
          const q = bad(x as Record<string, unknown>);
          if (q) return dropped.push(q), [];
        }
        return [walk(x)];
      });
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const q = bad(o);
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(o)) out[k] = q && (SPEAKER.test(k) || (SAID.test(k) && x === q)) ? "" : walk(x);
      if (q) dropped.push(q);
      return out;
    }
    return v;
  };
  return { params: walk(params) as Record<string, unknown>, dropped };
}
