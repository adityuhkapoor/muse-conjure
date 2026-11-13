// POST /kit: Marketplace as context for a plan. When a group plans something (a camping trip, a party,
// an Event), Muse works out what they'd need, finds each thing on Marketplace, and prices the rest at a
// real store online, with a per-person split. The shell turns the answer into a kit card in the chat
// (`kit` in apps/shell/src/live/chat-reducer.ts); "Who brings what" and "Split" then make the library's
// `claims` and `split` pieces from it.
//
// Guardrails, because a plan must never show a product that isn't real:
//   1. The plan call can only name catalog ids (an enum), and a second, cheap call checks every match is
//      really that kind of item ("climbing shoes" is never a t-shirt). A failed check drops the match.
//   2. Needs Marketplace can't fill go to web search for a real product: store, exact name, price, link.
//      Code then loads the link; a dead or made-up one is dropped, never shown. A photo is kept only if
//      its URL really serves an image (the search result's, the store page's og:image, or the maker's page's).
// Prices, counts and the split are computed here, never by the model.

import { LISTINGS } from "../../apps/shell/src/surfaces/data.ts";
import type { WireKit, WireOnline } from "../../apps/shell/src/live/chat-reducer.ts";
import { MuseClient, museKeyAvailable, outputText } from "../../packages/factory/src/models/muse.ts";

type Said = { from: string; text: string };
export type KitRequest = { ask: string; chat?: { title?: string; messages?: Said[] }; members?: { id: string; name: string }[]; event?: { title: string; where?: string; when?: string; going?: number } };

const plan = new MuseClient({ model: "muse-spark-1.3", effort: "low", timeoutMs: 60_000 });
const check = new MuseClient({ model: "muse-ember-1.0", effort: "low", timeoutMs: 30_000 });
const search = new MuseClient({ model: "muse-spark-1.3", effort: "low", timeoutMs: 75_000, retries: 0 });

const listing = (id: string) => LISTINGS.find((l) => l.id === id);
const nullable = (type: string) => ({ anyOf: [{ type }, { type: "null" }] });

/** One structured Muse call; `webSearch` adds the web search tool. */
async function ask<T>(client: MuseClient, o: { label: string; system: string; input: string; name: string; schema: Record<string, unknown>; webSearch?: boolean }): Promise<T> {
  const body = { ...client.body({ label: o.label, system: o.system, messages: [{ role: "user", content: o.input }], json: { name: o.name, schema: o.schema } }), ...(o.webSearch ? { tools: [{ type: "web_search" }] } : {}) };
  const t0 = performance.now();
  // One retry for a dropped connection, a busy backend or a server error.
  const once = () => client.raw(body).catch((e: Error) => ({ status: -1, json: null, text: e.message, ms: 0 }));
  let r = await once();
  if (r.status === -1 || r.status === 429 || r.status >= 500) r = await Bun.sleep(1500).then(once);
  if (r.status !== 200) throw new Error(`Muse ${r.status}: ${r.text.slice(0, 200)}`);
  console.log(`kit: ${o.label} ${Math.round(performance.now() - t0)} ms`);
  return JSON.parse(outputText(r.json)) as T;
}

const INSTRUCTIONS = (names: string[]) => `You are Muse in a friend group chat. The group is planning something together. Work out what they'd actually need to make it happen (gear, supplies, decorations), match each need to a Marketplace listing from the catalog, and note anything someone already said they have or will bring.
- 4 to 9 items, the ones that matter most for THIS plan (a camping night needs shelter, sleeping, cooking; a birthday party needs tableware and decorations). No filler.
- per_person: true for things each person needs their own of (a sleeping bag, a pillow, a party hat); false for shared things (a tent, a table, a cookware set, a tableware kit). qty: for per_person items, how many each person needs (usually 1); for shared items, how many the group needs in total.
- Packs and kits: when the listing already covers several people (a 4-pack of hats, "serves 20"), per_person is false and qty is how many of that listing the group needs (one 4-pack for 3 people is qty 1).
- listing_id: the catalog listing that IS this item, or "none" when no listing is this kind of thing (still list the need). Never pick a near miss: a t-shirt is not climbing shoes, a phone case is not earbuds. "none" is a good answer: Muse looks the item up online instead.
- covered_by: the member who said they have it or will bring it (one of: ${names.join(", ") || "nobody"}), else null. Only when the chat actually says so AND what they have is enough for the whole group. If it only partly covers the need (a 2-person tent for 4 people), covered_by is null and why says so.
- why: a few plain words tied to this plan ("sleeps 4, Maya's fits 2"), never marketing.
- title: the plan in the group's own words, short ("Lake camping", "Will's birthday").
- people: how many are going (the going count if given, else everyone who's in on it from the chat).`;

type Out = { title: string; people: number; items: { need: string; qty: number; per_person: boolean; why: string; listing_id: string; covered_by: string | null }[] };

/** For each (need, listing id): does the listing actually fill the need? Ids that fail come back null. */
async function checkMatches(pairs: { need: string; listingId: string }[]): Promise<(string | null)[]> {
  if (!pairs.length) return [];
  const data = await ask<{ checks: { n: number; ok: boolean; why: string }[] }>(check, {
    label: `match-check x${pairs.length}`,
    system: `For each numbered pair, decide if the Marketplace listing is actually the item needed: a shopper looking for the need would buy this listing for it. Same kind of thing counts, including a themed or more specific version of it (a used tent for "tent"; a 4-pack of hats for "party hats"; HAPPY BIRTHDAY letter balloons for "balloons"). A different kind of thing never counts, even if related (a t-shirt is not climbing shoes; a phone case is not earbuds; snacks are not a cake). why: a few words.`,
    input: pairs.map((p, n) => `${n}. need: ${p.need} | listing: ${listing(p.listingId)?.title ?? p.listingId} (${listing(p.listingId)?.description ?? ""})`).join("\n"),
    name: "match_check",
    schema: { type: "object", additionalProperties: false, required: ["checks"], properties: { checks: { type: "array", items: { type: "object", additionalProperties: false, required: ["n", "ok", "why"], properties: { n: { type: "number" }, ok: { type: "boolean" }, why: { type: "string" } } } } } },
  });
  const ok = new Map(data.checks.map((c) => [c.n, c.ok]));
  return pairs.map((p, n) => (ok.get(n) === true ? p.listingId : null));
}

const host = (u: string) => {
  try {
    const x = new URL(u);
    return x.protocol === "https:" || x.protocol === "http:" ? x.hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
};
// Muse names itself honestly; sites that refuse it just get no photo.
const UA = "Mozilla/5.0 (compatible; MuseDemo/1.0)";

/** Does this URL answer at all? A store blocking bots (403) still proves the page exists; a dead or
 *  made-up URL (DNS failure, 404, 410) does not. Also reads the page's own preview image when it can. */
async function reachable(url: string): Promise<{ ok: boolean; ogImage: string | null }> {
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(6000), headers: { "user-agent": UA, accept: "text/html,image/*,*/*" } });
    const ok = r.status !== 404 && r.status !== 410 && r.status < 500;
    let ogImage: string | null = null;
    if (r.ok && /html/i.test(r.headers.get("content-type") ?? "")) {
      const html = (await r.text()).slice(0, 300_000);
      const m = /<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i.exec(html) ?? /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image["']/i.exec(html);
      if (m) ogImage = new URL(m[1]!.replace(/&amp;/g, "&"), url).toString().replace(/^http:/, "https:");
    }
    return { ok, ogImage };
  } catch (e) {
    // Big stores (REI) stall unknown clients instead of answering. A stall from one of them means the
    // site is up and blocking bots, not that the page is made up; a made-up domain fails DNS at once.
    // ponytail: a fixed store list; a made-up path on one of these stalled sites can't be caught here.
    const stalled = (e as Error).name === "TimeoutError" && BIG_STORES.has(host(url) ?? "");
    return { ok: stalled, ogImage: null };
  }
}
const BIG_STORES = new Set(["rei.com", "amazon.com", "target.com", "walmart.com", "dickssportinggoods.com", "backcountry.com", "bestbuy.com", "homedepot.com", "lowes.com", "costco.com"]);

/** A photo is shown only if the URL really serves an image. */
async function isImage(url: string | null) {
  if (!url || !host(url)) return false;
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(6000), headers: { "user-agent": UA, accept: "image/*,*/*" } });
    return r.ok && /^image\//.test(r.headers.get("content-type") ?? "");
  } catch {
    return false;
  }
}

type Found = { found: boolean; store: string; title: string; price: number | null; url: string; image_url: string | null; brand_url: string | null };

/** One need, one web search: small calls in parallel finish well inside the time one big call takes. */
const searchOne = (need: string, context: string) =>
  ask<Found>(search, {
    label: `online ${need}`,
    webSearch: true,
    system: `A friend group needs this item and Facebook Marketplace has none. Search the web and find ONE real product a beginner would buy, from a real store (REI, Target, Walmart, Amazon, Dick's, a brand's own site). Use only what the search results show: the product's exact name, its current price in USD as a number, the product page URL from the results, an image URL only if the results give one (else null), and brand_url: the same product's page on the maker's own website if the results show one (else null); the maker's page is how the group sees a photo. If you can't find a real product page, found=false and leave the rest empty. Never invent a product, a price or a URL. Context: ${context}`,
    input: need,
    name: "online_product",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["found", "store", "title", "price", "url", "image_url", "brand_url"],
      properties: { found: { type: "boolean" }, store: { type: "string" }, title: { type: "string" }, price: nullable("number"), url: { type: "string" }, image_url: nullable("string"), brand_url: nullable("string") },
    },
  }).catch((e) => {
    console.warn(`kit: online ${need} failed: ${(e as Error).message}`);
    return null;
  });

/** Real products to buy online for needs Marketplace can't fill. Unverified ones are dropped. */
async function findOnline(needs: string[], context: string): Promise<(WireOnline | null)[]> {
  return Promise.all(
    needs.map(async (need) => {
      const it = await searchOne(need, context);
      if (!it?.found || !it.title.trim() || !host(it.url)) return void console.log(`kit: online ${need}: none found (${it ? `found=${it.found} url=${it.url.slice(0, 80)}` : "call failed"})`) ?? null;
      const page = await reachable(it.url);
      if (!page.ok) return void console.log(`kit: online ${need}: dropped, link does not load (${it.url.slice(0, 80)})`) ?? null; // dead or made-up link: never shown
      const price = it.price != null && it.price > 0 && it.price < 5000 ? Math.round(it.price * 100) / 100 : null;
      // Photo: the search result's, else the store page's preview, else the maker's page's (stores like REI block reads).
      let image = (await isImage(it.image_url)) ? it.image_url : (await isImage(page.ogImage)) ? page.ogImage : null;
      if (!image && it.brand_url && host(it.brand_url)) {
        const brand = await reachable(it.brand_url);
        if (await isImage(brand.ogImage)) image = brand.ogImage;
      }
      console.log(`kit: online ${it.store}: ${it.title} · photo ${image ? "ok" : "none"}`);
      return { store: it.store.trim() || host(it.url)!, title: it.title.trim(), price, url: it.url, image };
    }),
  );
}

export async function planKit(req: KitRequest): Promise<WireKit> {
  const t0 = performance.now();
  const names = (req.members ?? []).map((m) => m.name);
  const catalog = LISTINGS.map((l) => `${l.id} | ${l.title} | $${l.price} | ${l.kind}`).join("\n");
  const said = (req.chat?.messages ?? []).slice(-40).map((m) => `${m.from}: ${m.text}`).join("\n");
  const ev = req.event;
  const data = await ask<Out>(plan, {
    label: "plan-kit",
    system: INSTRUCTIONS(names),
    input: [
      ev ? `The plan: ${ev.title}${ev.where ? ` at ${ev.where}` : ""}${ev.when ? `, ${ev.when}` : ""}.${ev.going ? ` ${ev.going} going.` : ""}` : "No plan card: take the plan from the chat.",
      `Asked: ${req.ask}`,
      `Recent chat:\n${said || "(nothing yet)"}`,
      `Marketplace catalog (id | title | price | kind):\n${catalog}`,
    ].join("\n\n"),
    name: "plan_kit",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "people", "items"],
      properties: {
        title: { type: "string" },
        people: { type: "number" },
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["need", "qty", "per_person", "why", "listing_id", "covered_by"],
            properties: { need: { type: "string" }, qty: { type: "number" }, per_person: { type: "boolean" }, why: { type: "string" }, listing_id: { type: "string", enum: ["none", ...LISTINGS.map((l) => l.id)] }, covered_by: nullable("string") },
          },
        },
      },
    },
  });
  // Facts in code: the going count wins over the model's; "we" / "us" is never one person.
  const group = /\b(we|us|our|everyone|y'?all|guys)\b/i.test(req.ask) ? 2 : 1;
  const n = Math.max(1, ev?.going || Math.max(group, Math.round(data.people)) || names.length);
  const raw = data.items.slice(0, 9);
  // Guardrail 1: every matched listing must really be that item.
  const pairs = raw.map((it, i) => ({ i, need: it.need, listingId: it.listing_id })).filter((p) => p.listingId !== "none" && listing(p.listingId));
  const verdicts = await checkMatches(pairs).catch(() => pairs.map(() => null)); // a failed check shows nothing rather than guesses
  const fits = new Map(pairs.map((p, k) => [p.i, verdicts[k]]));
  const items: WireKit["items"] = raw.map((it, i) => {
    const l = fits.get(i) ? listing(fits.get(i)!) : undefined;
    const units = it.per_person ? Math.max(1, Math.round(it.qty)) * n : Math.max(1, Math.round(it.qty));
    const covered = it.covered_by && names.some((x) => x.toLowerCase() === it.covered_by!.toLowerCase()) ? it.covered_by : null;
    return { need: it.need, qty: units, why: it.why, listing: l?.id ?? null, online: null, unit: l?.price ?? null, cost: covered || !l ? 0 : l.price * units, covered };
  });
  // Guardrail 2: what Marketplace can't fill comes from a real store online, checked, or says not found.
  const missing = items.filter((it) => !it.covered && !it.listing).slice(0, 5);
  if (missing.length) {
    const found = await findOnline(missing.map((it) => it.need), data.title).catch((e) => {
      console.warn(`kit: online lookup failed: ${(e as Error).message}`);
      return missing.map(() => null);
    });
    missing.forEach((it, k) => {
      const o = found[k];
      if (!o) return;
      it.online = o;
      it.unit = o.price;
      it.cost = o.price != null ? Math.round(o.price * it.qty * 100) / 100 : 0;
    });
  }
  const total = Math.round(items.reduce((s, i) => s + i.cost, 0) * 100) / 100;
  const kit: WireKit = { title: data.title || ev?.title || "the plan", people: n, items, total, each: Math.ceil((total / n) * 100) / 100 };
  console.log(`kit: ${kit.title} · ${items.length} items · $${total} · $${kit.each} each for ${n} · ${Math.round(performance.now() - t0)} ms`);
  return kit;
}

/** The gateway's handler. */
export async function kitResponse(req: Request): Promise<Response> {
  let body: KitRequest;
  try {
    body = (await req.json()) as KitRequest;
  } catch {
    return Response.json({ error: "body is not JSON" }, { status: 400 });
  }
  if (typeof body?.ask !== "string" || !body.ask.trim() || body.ask.length > 500) return Response.json({ error: "no ask" }, { status: 400 });
  if (!museKeyAvailable()) return Response.json({ error: "Pricing a plan needs the Muse key" }, { status: 503 });
  try {
    return Response.json({ kit: await planKit(body) });
  } catch (e) {
    console.warn(`kit: failed: ${(e as Error).message}`);
    return Response.json({ error: "Muse couldn't price that out right now" }, { status: 502 });
  }
}
