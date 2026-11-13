// The catalyst runtime: what happens when someone asks on a page, taps a suggestion, or uses a
// tool someone else made. One path for all three, the same as Messenger's:
//   scenario match -> the pre-made tool, filled from the page (gateway /premade, about a second)
//   no match       -> the factory's /generate with the page's context attached
// Either way it lands through store.landPiece, with the same building card, on the page (a room
// keyed by the page object) or in a chat. Every request's path is recorded.
//
// Reading is model-first (muse/reader.ts, services/demo/reader.ts): every page object a component
// asks offers for is read once by the reader, with what the viewer did; the rules (readers.ts)
// are the instant first answer and the offline one. Typed asks go to the reader first; the
// scenario keyword match is the offline path, and when the reader finds nothing that fits, the ask
// offers "Make something new" (the factory's build).

import { store } from "../store";
import { readInput, readerKey, type ReaderAnswer, type ReaderOffer, type ReaderPick } from "./reader";
import { readerInput } from "./reader-text";
import type { PersonId } from "../store/types";
import { nav } from "../lib/nav.svelte";
import { picker } from "../surfaces/flows.svelte";
import type { LandSpec, SurfaceName } from "../surfaces/types";
import { factorySurface, toWire } from "./context";
import { match } from "./match";
import { scenario as getScenario } from "./pack";
import { read } from "./readers";
import type { CatSurface, Land, PageContext, PathRecord, Scenario, Situation } from "./types";

const EVERYONE: PersonId[] = ["me", "maya", "dev", "jonah", "priya", "theo"];

const SOURCE: Record<CatSurface, SurfaceName> = { event: "Events", group: "Groups", marketplace: "Marketplace", feed: "Home", reel: "Reels", story: "Stories", gaming: "Gaming", search: "Home" };
const WHERE: Record<CatSurface, string> = { event: "**Events**", group: "a **group**", marketplace: "**Marketplace**", feed: "a post on **Home**", reel: "**Reels**", story: "a **story**", gaming: "**Gaming**", search: "**Search**" };

/** The room behind a page: everyone on the page shares its tools. Groups keep their own key. */
export function pageKey(c: Pick<PageContext, "object">): string {
  return c.object.kind === "group" ? `surface:group:${c.object.id}` : `surface:page:${c.object.kind}:${c.object.id}`;
}

/** Surfaces whose free asks land on the page when nothing in the pack matches. */
const PAGE_SURFACES: CatSurface[] = ["event", "group", "marketplace", "feed"];

const params = new URLSearchParams(location.search);

class Catalyst {
  /** dismissed suggestion ids, per viewer, kept across reloads */
  dismissed = $state<string[]>([]);
  /** every request and the path it took, newest last */
  paths = $state<PathRecord[]>([]);
  /** timed, unprompted suggestions (off unless ?unprompted=1 or the presenter switch) */
  unprompted = $state(false);
  /** unprompted cards dismissed */
  quiet = $state<string[]>([]);
  presenter = $state(false);
  /** the page an on-page tool was just made for, to scroll it into view */
  justMade = $state<{ key: string; n: number } | null>(null);
  #n = 0;

  constructor() {
    try {
      const raw = JSON.parse(localStorage.getItem("muse.catalysts") ?? "{}") as { dismissed?: string[]; unprompted?: boolean; quiet?: string[] };
      this.dismissed = raw.dismissed ?? [];
      this.quiet = raw.quiet ?? [];
      this.unprompted = !!raw.unprompted;
    } catch {}
    const q = params.get("unprompted");
    const injected = (window as unknown as { __MUSE_LIVE__?: { unprompted?: boolean } }).__MUSE_LIVE__;
    if (q === "1") this.unprompted = true;
    else if (q === "0") this.unprompted = false;
    else if (injected?.unprompted) this.unprompted = true;
    (window as unknown as { __musePaths: PathRecord[] }).__musePaths = [];
  }

  #save() {
    try {
      localStorage.setItem("muse.catalysts", JSON.stringify({ dismissed: this.dismissed, unprompted: this.unprompted, quiet: this.quiet }));
    } catch {}
  }

  setUnprompted(on: boolean) {
    this.unprompted = on;
    this.#save();
  }

  /** reader answers by request, filled in as they land */
  answers = $state<Record<string, ReaderAnswer>>({});
  #asked = new Set<string>();
  #typing = new Map<string, { key: string; timer: ReturnType<typeof setTimeout> }>();

  /**
   * Offers for a page, minus dismissed ones and tools already on it: the reader's answer once it
   * is in (an offer whose tool is a rule's own keeps the rule's richer fill), the rules' until then
   * and whenever the reader is off.
   */
  suggest(c: PageContext, max = 2, o: { unprompted?: boolean } = {}): Situation[] {
    const made = store.surfaceTools(pageKey(c)).map((t) => t.name);
    const rules = read(c, { dismissed: this.dismissed, made, max: 6 });
    const input = readerInput(c, undefined, undefined, o);
    const key = readerKey(input);
    const a = this.answers[key];
    if (!a && !this.#asked.has(key)) {
      // never during a derivation: the answer lands as state later. While someone types, only
      // the text they stopped on is read.
      const obj = `${c.object.kind}:${c.object.id}`;
      const typing = typeof c.facts.typing === "string";
      const go = () => {
        if (this.#asked.has(key)) return;
        this.#asked.add(key);
        // the picks show as soon as they are in (a few seconds); a tap on one waits for its fill
        const early = (picks: ReaderPick[]) => {
          if (!this.answers[key] && picks.length) this.answers = { ...this.answers, [key]: { offers: picks.map((p) => ({ ...p, params: {}, pending: true })), nothing: false, available: true, source: "live", ms: 0 } };
        };
        void readInput(input, early).then((x) => (this.answers = { ...this.answers, [key]: x }));
      };
      const waiting = this.#typing.get(obj);
      if (!typing) queueMicrotask(go);
      else if (waiting?.key !== key) {
        // a new draft restarts the wait; the same draft read again leaves it running
        clearTimeout(waiting?.timer);
        this.#typing.set(obj, { key, timer: setTimeout(go, 900) });
      }
    }
    if (!a || !a.available) return rules.slice(0, max);
    const out: Situation[] = [];
    for (const offer of a.offers) {
      const rule = rules.find((r) => getScenario(r.scenario)?.tools.some((t) => t.tool === `lab:${offer.tool}`));
      // a page that already has a tool someone made keeps it: the reader adds no second one for
      // just looking, only for something the viewer did (typing, a like, a save)
      if (!rule && made.length && !c.did.length) continue;
      const s = rule ?? offerSituation(c, offer);
      if (out.some((x) => x.id === s.id) || this.dismissed.includes(s.id) || made.includes(s.label)) continue;
      out.push(s);
    }
    return out.slice(0, max);
  }

  dismiss(ids: string[]) {
    this.dismissed = [...new Set([...this.dismissed, ...ids])];
    this.#save();
  }

  hush(id: string) {
    this.quiet = [...new Set([...this.quiet, id])];
    this.#save();
  }

  /** A suggestion was tapped. */
  take(c: PageContext, s: Situation) {
    if (s.offer?.pending) {
      // picked, still filling: wait for this page's read, then make the filled one (gone if its fill was dropped)
      const tool = s.offer.tool;
      void readInput(readerInput(c)).then((a) => {
        const offer = a.offers.find((o) => o.tool === tool);
        if (offer) this.#run(c, offerScenario(c, [offer]), { ask: s.label, via: "suggestion", confidence: s.score, why: s.why });
      });
      return;
    }
    if (s.offer) return this.#run(c, offerScenario(c, [s.offer]), { ask: s.label, via: "suggestion", confidence: s.score, why: s.why });
    const sc = getScenario(s.scenario);
    if (!sc) return;
    this.#run(c, sc, { ask: s.label, via: "suggestion", confidence: 1, why: s.why });
  }

  /**
   * Free text from a page's Muse field. The reader first: its best pick is made, the others ride
   * along as fallbacks. Nothing fits: the answer offers `build` (the factory makes something new).
   * No reader (replay, offline): the scenario keyword match, then the factory, as before.
   */
  async ask(c: PageContext, text: string, via: PathRecord["via"] = "ask", o: { onPicks?: (picks: ReaderPick[]) => void } = {}): Promise<AskResult> {
    const t = text.trim();
    if (!t) return { made: false };
    const ctx = { ...c, facts: { ...c.facts, ask: t } };
    const a = await readInput(readerInput(c, undefined, t), o.onPicks);
    if (a.available && a.offers.length) {
      this.#run(ctx, offerScenario(ctx, a.offers), { ask: t, via, confidence: a.offers[0]!.confidence, why: a.offers[0]!.read });
      return { made: true, label: a.offers[0]!.label };
    }
    if (a.available) return { made: false, none: true, build: () => this.#factory(ctx, t, via) };
    const offered = read(c, { max: 6 }).map((s) => s.scenario);
    const m = match(t, c.surface, offered);
    if (m) this.#run(ctx, m.scenario, { ask: t, via, confidence: m.confidence, why: m.why });
    else this.#factory(ctx, t, via);
    return { made: true };
  }

  /** "Use for my group": the same scenario, rebuilt in a chat the person picks. */
  useForGroup(c: PageContext, scenarioId: string) {
    const sc = getScenario(scenarioId);
    if (!sc) return;
    const title = sc.title(c).slice(0, 80);
    const choices = sc.tools.flatMap((t) => {
      try {
        return t.tool.startsWith("lab:") ? [{ tool: t.tool, params: t.params(c) }] : [];
      } catch {
        return [];
      }
    });
    if (!choices.length) return;
    // The same tool and idea, refilled by the reader from the chosen chat's people and messages
    // (premade.ts `refill`); the page's own content does not travel with it.
    picker.ask({
      title: "Choose a chat",
      sub: `Muse will make ${title.toLowerCase()} for the people in it.`,
      onpick: (chatId) => {
        this.#record({ surface: c.surface, object: `${c.object.kind}:${c.object.id}`, ask: `use ${title} for my group`, via: "use-for-group", path: "premade", scenario: sc.id, tool: choices[0]!.tool, confidence: 1, why: "made by someone on this page, refilled for this chat", land: "chat" });
        openChat(
          store.landPiece({
            chatId,
            piece: "",
            params: {},
            title,
            ask: `muse make ${title.toLowerCase()} for us`,
            templateId: sc.template,
            summary: sc.summary(c),
            premade: { scenario: sc.id, choices, refill: { idea: title } },
            source: { surface: SOURCE[c.surface], text: `**${store.me.first}** got this from ${WHERE[c.surface]}: ${c.title}`.slice(0, 200) },
          }),
        );
      },
    });
  }

  #record(r: Omit<PathRecord, "at">) {
    const rec = { ...r, at: Date.now() };
    this.paths = [...this.paths.slice(-49), rec];
    (window as unknown as { __musePaths: PathRecord[] }).__musePaths.push(rec);
  }

  #run(c: PageContext, sc: Scenario, o: { ask: string; via: PathRecord["via"]; confidence: number; why: string }) {
    const title = sc.title(c).slice(0, 80);
    // Someone already made it here: show that one instead of a second copy.
    if (sc.land === "page" && store.surfaceTools(pageKey(c)).some((t) => t.name === title)) {
      this.#record({ surface: c.surface, object: `${c.object.kind}:${c.object.id}`, ask: o.ask, via: o.via, path: "existing", scenario: sc.id, tool: null, confidence: o.confidence, why: `${o.why}; already on this page`, land: "page" });
      this.justMade = { key: pageKey(c), n: ++this.#n };
      return;
    }
    const choices = sc.tools.map((t) => {
      try {
        return { tool: t.tool, params: t.params(c) };
      } catch {
        return null;
      }
    }).filter((x): x is { tool: string; params: Record<string, unknown> } => !!x);
    const base: Omit<LandSpec, "chatId" | "newChat" | "source"> = {
      piece: "",
      params: {},
      title,
      ask: `muse ${o.ask}`.slice(0, 300),
      templateId: sc.template,
      summary: sc.summary(c),
      premade: { scenario: sc.id, choices },
      context: toWire(c),
    };
    this.#record({ surface: c.surface, object: `${c.object.kind}:${c.object.id}`, ask: o.ask, via: o.via, path: "premade", scenario: sc.id, tool: choices[0]?.tool ?? null, confidence: o.confidence, why: o.why, land: sc.land });
    this.#land(c, sc.land, base, sc.chat?.(c) ?? null, title, sc.source?.(c));
  }

  #factory(c: PageContext, text: string, via: PathRecord["via"]) {
    const land: Land = PAGE_SURFACES.includes(c.surface) ? "page" : "chat";
    const title = text.length > 40 ? `${text[0]!.toUpperCase()}${text.slice(1, 39)}…` : `${text[0]!.toUpperCase()}${text.slice(1)}`;
    const base: Omit<LandSpec, "chatId" | "newChat" | "source"> = {
      piece: "",
      params: {},
      title,
      ask: /^\s*@?muse\b/i.test(text) ? text : `muse ${text}`,
      templateId: "poll",
      summary: "made for this page",
      context: toWire(c),
      surface: factorySurface(c.surface),
    };
    this.#record({ surface: c.surface, object: `${c.object.kind}:${c.object.id}`, ask: text, via, path: "factory", scenario: null, tool: null, confidence: 0, why: "no scenario matched", land });
    this.#land(c, land, base, null, title);
  }

  #land(c: PageContext, land: Land, base: Omit<LandSpec, "chatId" | "newChat" | "source">, target: ReturnType<NonNullable<Scenario["chat"]>> | null, title: string, line?: string) {
    const text = line ?? (c.surface === "search" ? `**${store.me.first}** asked Muse in **Search**` : `**${store.me.first}** made this from ${WHERE[c.surface]}: ${c.title}`);
    const source = { surface: SOURCE[c.surface], text: text.slice(0, 200) };
    if (land === "page") {
      const key = pageKey(c);
      store.landPiece({ ...base, newChat: { key, name: c.title.slice(0, 60), members: EVERYONE }, source: null });
      this.justMade = { key, n: ++this.#n };
      return;
    }
    const go = (spec: LandSpec) => openChat(store.landPiece(spec));
    if (target && "chatId" in target) return go({ ...base, chatId: target.chatId, source });
    if (target && "key" in target) {
      // Made once per key: a second tap opens the chat that already has it.
      const found = store.chats.find((x) => x.key === target.key);
      if (found && store.toolsFor(found.id).some((t) => t.name === title)) return openChat(found.id);
      if (found && found.messages.some((m) => m.muse?.title === title)) return openChat(found.id);
      return go({ ...base, newChat: target, source });
    }
    if (c.chatId) return go({ ...base, chatId: c.chatId, source });
    const prefer = target && "prefer" in target ? target.prefer : [];
    picker.ask({ title: "Choose a chat", sub: `Muse will make ${title.toLowerCase()} for the people in it.`, prefer, onpick: (chatId) => go({ ...base, chatId, source }) });
  }
}

/** What a typed ask did: made a tool, or found nothing that fits (then `build` makes something new). */
export type AskResult = { made: boolean; label?: string; none?: boolean; build?: () => void };

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** A reader offer as a suggestion row. */
function offerSituation(c: PageContext, offer: ReaderOffer): Situation {
  return { id: `${c.object.kind}:${c.object.id}:reader:${offer.tool}`, scenario: `reader:${offer.tool}`, label: offer.label, detail: cap(offer.read), faces: [], score: offer.confidence, why: `reader: ${offer.read}`, offer };
}

/** Reader offers as a one-off scenario: the first offer's tool, the rest as fallbacks, landing where free asks land. */
function offerScenario(c: PageContext, offers: ReaderOffer[]): Scenario {
  const first = offers[0]!;
  return {
    id: `reader:${first.tool}`,
    surface: c.surface,
    land: PAGE_SURFACES.includes(c.surface) ? "page" : "chat",
    title: () => first.label,
    summary: () => first.read,
    template: "poll",
    asks: [],
    tools: offers.map((o) => ({ tool: `lab:${o.tool}`, params: () => o.params })),
  };
}

/** Opens a chat unless it is already the open page (a tool made from inside the thread). */
function openChat(id: string) {
  const top = nav.layers.filter((l) => !l.leaving).at(-1)?.route;
  if (top?.kind === "chat" && top.id === id) return;
  if (nav.desktopFb === null && nav.desktopEvent === null && nav.selected === id && document.documentElement.dataset.layout === "desktop") return;
  nav.openChat(id);
}

export const catalyst = new Catalyst();
