// Lookup: no model call, a few milliseconds. `find` ranks cached tools for an ask and the recent chat;
// `refill` swaps a cached tool's names and options for the current chat's.
//
// Scoring is TF-IDF cosine over normalised keywords, with four plain adjustments, all visible in
// `Candidate.why`:
//   - the ask counts three times as much as the chat;
//   - a token not in the vocabulary is matched to a vocabulary word one edit away (typos);
//   - the member count must fit the entry's range, or confidence is cut;
//   - a runner-up of another kind that scores close cuts confidence (the margin);
//   - a fact-bound tool (its content is its own chat's facts) is only reusable for that same chat.
// `confidence` is the cosine scaled so that THRESHOLD separates right from wrong on the held-out asks
// (see eval-lookup.ts and README.md). Returning a wrong tool confidently is worse than falling back to
// live generation, so THRESHOLD is set for a false-accept rate under 5% of the tools returned.

import { readIndex, readMeta, readSource } from "./store.ts";
import { refillSource, norm } from "./params.ts";
import type { Candidate, ChatSample, Index, IndexEntry, Member } from "./types.ts";

/** Accept a candidate at or above this confidence. Calibrated by `bun library/cache/eval-lookup.ts`. */
export const THRESHOLD = 0.5;
/** Cosine that maps to confidence 1. */
export const SCALE = 0.6;

const STOP = new Set(
  "the a an to for of and or is it we us you i me my our on in at be do can this that with so lol lmao muse pls please make just like rn ok okay yeah ya u im its all are was were have has had not but if then what who when where how why there here they them he she his her their will would could should about up out get got go going want wanna need one more some any too very really also tn tbh ngl fr idk yes no yep nope hey wait oh cant dont didnt wont thats whats lets let thing things stuff something someone guys everyone sure thanks thx".split(" "),
);

const stem = (w: string) => (w.length > 5 && w.endsWith("ing") ? w.slice(0, -3) : w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w.length > 4 && w.endsWith("ed") ? w.slice(0, -2) : w);

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9$]+/)
    .filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w))
    .map(stem);
}

type Prepared = {
  index: Index;
  /** term -> [entry, weight] */
  postings: Map<string, [number, number][]>;
  idf: Map<string, number>;
  /** entry vector length (tf-idf) */
  norms: number[];
  vocabByLen: Map<number, string[]>;
  ctx: Set<string>[];
};

const prepared = new WeakMap<Index, Prepared>();

function prepare(index: Index): Prepared {
  const hit = prepared.get(index);
  if (hit) return hit;
  const docs = index.entries.map((e) => {
    const tf = new Map<string, number>();
    const put = (text: string, w: number) => {
      for (const t of new Set(tokens(text))) tf.set(t, Math.min(3, (tf.get(t) ?? 0) + w));
    };
    put(e.ask, 3);
    put(e.kind.replace(/-/g, " "), 3);
    for (const k of e.keywords) put(k, 3);
    put(e.sentence, 1.5);
    for (const u of e.use_when) put(u, 1.5);
    return tf;
  });
  const df = new Map<string, number>();
  for (const tf of docs) for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const n = Math.max(1, docs.length);
  const idf = new Map([...df].map(([t, d]) => [t, Math.log(1 + n / d)]));
  const postings = new Map<string, [number, number][]>();
  const norms = docs.map((tf, i) => {
    let s = 0;
    for (const [t, w] of tf) {
      const x = w * idf.get(t)!;
      s += x * x;
      (postings.get(t) ?? postings.set(t, []).get(t)!).push([i, x]);
    }
    return Math.sqrt(s) || 1;
  });
  const vocabByLen = new Map<number, string[]>();
  for (const t of df.keys()) (vocabByLen.get(t.length) ?? vocabByLen.set(t.length, []).get(t.length)!).push(t);
  const p: Prepared = { index, postings, idf, norms, vocabByLen, ctx: index.entries.map((e) => new Set(tokens(e.context))) };
  prepared.set(index, p);
  return p;
}

/** One edit away: a substitution, an insertion, a deletion or a swap of neighbours. */
function near(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

function fixTypo(t: string, p: Prepared): string | null {
  if (p.postings.has(t)) return t;
  if (t.length < 5) return null;
  for (const l of [t.length - 1, t.length, t.length + 1]) for (const v of p.vocabByLen.get(l) ?? []) if (near(t, v)) return v;
  return null;
}

export type FindOptions = { index?: Index; limit?: number; threshold?: number };

export function find(ask: string, chat: ChatSample, members: Member[], opts: FindOptions = {}): Candidate[] {
  const index = opts.index ?? defaultIndex();
  if (!index.entries.length) return [];
  const p = prepare(index);
  // Query weights: ask 3, chat tail 1 (the last 12 messages).
  const q = new Map<string, number>();
  const tail = chat.messages.slice(-12).map((m) => m.text).join(" ");
  for (const [text, w] of [[ask, 3], [tail, 1]] as const)
    for (const raw of tokens(text)) {
      const t = fixTypo(raw, p);
      if (t) q.set(t, Math.min(4, (q.get(t) ?? 0) + (w === 3 ? 3 : 0.5 + (q.has(t) ? 0.2 : 0.5))));
    }
  let qNorm = 0;
  const acc = new Float64Array(index.entries.length);
  const hits: Map<number, string[]> = new Map();
  for (const [t, w] of q) {
    const idf = p.idf.get(t)!;
    qNorm += (w * idf) ** 2;
    for (const [i, x] of p.postings.get(t)!) {
      acc[i]! += w * idf * x;
      if (w >= 3) (hits.get(i) ?? hits.set(i, []).get(i)!).push(t);
    }
  }
  qNorm = Math.sqrt(qNorm) || 1;
  const chatTokens = new Set(tokens(chat.messages.map((m) => m.text).join(" ")));
  const out: Candidate[] = [];
  index.entries.forEach((e, i) => {
    if (!acc[i]) return;
    const cos = acc[i]! / (qNorm * p.norms[i]!);
    const why: string[] = [`text ${cos.toFixed(2)}`];
    let conf = Math.min(1, cos / SCALE);
    // Member fit.
    const n = members.length;
    if (n < e.members.min || n > e.members.max) {
      conf *= 0.5;
      why.push(`${n} members outside ${e.members.min}-${e.members.max}`);
    }
    if (hits.get(i)?.length) why.push(`matched ${[...new Set(hits.get(i))].slice(0, 4).join(", ")}`);
    // Same chat?
    let overlap = 0;
    if (chatTokens.size) {
      let c = 0;
      for (const t of chatTokens) if (p.ctx[i]!.has(t)) c++;
      overlap = c / Math.max(1, Math.min(chatTokens.size, p.ctx[i]!.size));
    }
    const sameChat = overlap >= 0.6;
    let reusable = true;
    if (e.fact_bound && !sameChat) {
      reusable = false;
      conf = Math.min(conf, 0.3);
      why.push("fact-bound: its content is another chat's facts");
    }
    if (sameChat) why.push("same chat");
    out.push({ id: e.id, kind: e.kind, confidence: conf, score: cos, reusable, why });
  });
  out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  // Margin: a close runner-up of another kind means the request is ambiguous.
  const top = out[0];
  if (top) {
    const rival = out.find((c) => c.kind !== top.kind);
    if (rival && top.score > 0) {
      const gap = (top.score - rival.score) / top.score;
      const f = Math.min(1, 0.55 + gap * 2.5);
      if (f < 1) {
        top.confidence *= f;
        top.why.push(`${rival.kind} is close (gap ${gap.toFixed(2)})`);
      }
    }
  }
  out.sort((a, b) => b.confidence - a.confidence || b.score - a.score || a.id.localeCompare(b.id));
  return out.slice(0, opts.limit ?? 5);
}

/** The best candidate if it is confident enough and reusable here, else null (fall back to live generation). */
export function best(ask: string, chat: ChatSample, members: Member[], opts: FindOptions = {}): Candidate | null {
  const top = find(ask, chat, members, { ...opts, limit: 1 })[0];
  return top && top.reusable && top.confidence >= (opts.threshold ?? THRESHOLD) ? top : null;
}

let indexCache: Index | null = null;
function defaultIndex(): Index {
  return (indexCache ??= readIndex());
}

/** For tests and after a rebuild. */
export function resetIndexCache(): void {
  indexCache = null;
}

/** The cached tool's source with this chat's people and options in place of the original's. */
export function refill(entry: string | Pick<IndexEntry, "id">, chat: ChatSample, members: Member[], opts: { root?: string; ask?: string } = {}): string {
  return refillDetailed(entry, chat, members, opts).source;
}

export function refillDetailed(entry: string | Pick<IndexEntry, "id">, chat: ChatSample, members: Member[], opts: { root?: string; ask?: string } = {}) {
  const id = typeof entry === "string" ? entry : entry.id;
  const meta = readMeta(id, opts.root);
  return refillSource(readSource(id, opts.root), meta.params, chat, members, opts.ask ?? "");
}

export { norm };
