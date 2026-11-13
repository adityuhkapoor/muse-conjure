// The client side of the reader (services/demo/reader.ts, at /reader/read on the gateway).
//
//   readPage(context, act?, ask?) -> Promise<ReaderAnswer>
//
// `context` is a PageContext (muse/context.ts builds one per surface); `act` is what the viewer
// just did, if the context's `did` does not say it yet ("liked", "saved", "going", "shared");
// `ask` is a typed ask. The answer: up to two offers (three for an ask), each a lab tool already
// filled for this page, or nothing. Each distinct page, act and ask is read once per session;
// later calls share the first one's promise. `available` is false when the demo runs without a
// model (--model replay) and the page was not precomputed: callers then keep the rules' answer.

import type { PageContext } from "./types";
import { readerInput, type ReaderInput } from "./reader-text";

export type ReaderOffer = {
  /** lab tool id (library/lab), without the `lab:` prefix */
  tool: string;
  /** a short label in the page's voice: "Split it with roommates" */
  label: string;
  /** one line on what was read: "the $240 drum kit and your 3 roommates" */
  read: string;
  confidence: number;
  /** the tool's whole params, filled for this page */
  params: Record<string, unknown>;
  /** picked but not filled yet: the row shows, a tap waits for the fill */
  pending?: boolean;
};

/** An offer before its fill: what the pick step chose. */
export type ReaderPick = Omit<ReaderOffer, "params" | "pending">;

export type ReaderAnswer = { offers: ReaderOffer[]; nothing: boolean; available: boolean; source: "seed" | "live" | "cache" | "off" | "error"; ms: number };

const OFF: ReaderAnswer = { offers: [], nothing: false, available: false, source: "off", ms: 0 };
const cache = new Map<string, Promise<ReaderAnswer>>();

export const readerKey = (i: ReaderInput) => JSON.stringify([i.surface, i.object.kind, i.object.id, i.page, i.did, i.ask ?? "", i.unprompted ? 1 : 0, i.people.map((p) => p.name)]);

/** Read the page. `onPicks` hears the picks (tool, label, read, confidence) before the fills land. */
export function readPage(context: PageContext, act?: string, ask?: string, o: { unprompted?: boolean; onPicks?: (picks: ReaderPick[]) => void } = {}): Promise<ReaderAnswer> {
  return readInput(readerInput(context, act, ask, o), o.onPicks);
}

export function readInput(i: ReaderInput, onPicks?: (picks: ReaderPick[]) => void): Promise<ReaderAnswer> {
  const key = readerKey(i);
  const hit = cache.get(key);
  if (hit) return hit;
  const p = fetchRead(i, onPicks).then((a) => {
    // a failed read can be tried again on the next visit
    if (a.source === "error") cache.delete(key);
    return a;
  });
  cache.set(key, p);
  return p;
}

async function fetchRead(i: ReaderInput, onPicks?: (picks: ReaderPick[]) => void): Promise<ReaderAnswer> {
  const t0 = performance.now();
  try {
    const r = await fetch(`${location.origin}/reader/read`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(i) });
    if (!r.ok || !r.body) return { ...OFF, source: "error" };
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let at: number;
      while ((at = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, at);
        buf = buf.slice(at + 2);
        const event = /^event: (.*)$/m.exec(block)?.[1];
        const data = /^data: (.*)$/m.exec(block)?.[1];
        if (!event || !data) continue;
        const d = JSON.parse(data) as Record<string, unknown>;
        if (event === "picks") onPicks?.((d.picks ?? []) as ReaderPick[]);
        if (event === "done") {
          const offers = ((d.offers ?? []) as ReaderOffer[]).map((x) => ({ tool: x.tool, label: x.label, read: x.read, confidence: x.confidence, params: x.params }));
          const source = d.source as ReaderAnswer["source"];
          return { offers, nothing: !!d.nothing, available: source !== "off", source, ms: Math.round(performance.now() - t0) };
        }
      }
    }
  } catch {}
  return { ...OFF, source: "error" };
}

/** "Use for my group": the same tool and idea, refilled from a chat's members and messages. */
export async function refillForChat(o: { tool: string; idea: string; chat: { title?: string; messages: { from: string; text: string }[] }; members: { id: string; name: string }[] }): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${location.origin}/reader/refill`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) });
    const d = (await r.json()) as { params?: Record<string, unknown> };
    return d.params ?? null;
  } catch {
    return null;
  }
}
