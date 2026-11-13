<script lang="ts">
  import MuseMark from "../../components/MuseMark.svelte";
  import { viewerId } from "../../lib/media";
  import { nav } from "../../lib/nav.svelte";
  import { store } from "../../store";
  import { catalyst } from "../../muse/catalyst.svelte";
  import MuseAsk from "../../muse/components/MuseAsk.svelte";
  import MuseSuggest from "../../muse/components/MuseSuggest.svelte";
  import type { Situation } from "../../muse/types";
  import { chatWith, compId, landOffer, museItems, offerForAsk, offersFor, personOf } from "../profile-data";
  import SurfaceToolCard from "./SurfaceToolCard.svelte";

  /**
   * Muse on a profile. `made`: "Made with Muse", a row of the tools this person made or took part
   * in, each a small live preview that opens the tool where it lives (a post, a group, a listing).
   * `ask`: on a friend's profile, the catalyst for the two of you: a Muse field and one offer from
   * what you share (a birthday, a tab in Apt 4B, the concert, a ride to the crag). Both land a lab
   * tool in your one-to-one chat through the gateway's /premade, filled so it opens in progress.
   */
  let { key, part }: { key: string; part: "made" | "ask" } = $props();

  const items = $derived(part === "made" ? museItems(key) : []);
  const first = $derived(personOf(key)?.first ?? "");
  const offers = $derived(part === "ask" ? offersFor(viewerId(), key) : []);
  const sid = (id: string) => `profile:${viewerId()}:${key}:${id}`;
  const offer = $derived(offers.find((o) => !catalyst.dismissed.includes(sid(o.id))));
  // made already: the offer opens the chat it is in instead of making a second one
  const madeIn = $derived.by(() => {
    if (!offer) return undefined;
    const chat = chatWith(key);
    return chat && store.toolsFor(chat.id).some((t) => t.name === offer.title.slice(0, 80)) ? chat : undefined;
  });
  const situation = $derived<Situation[]>(offer ? [{ id: sid(offer.id), scenario: `profile-${offer.id.split("-")[0]}`, label: madeIn ? `Open ${offer.title}` : offer.label, detail: madeIn ? `In your chat with ${first}` : offer.detail, faces: offer.faces.map(compId), score: 1, why: offer.detail }] : []);

  function take() {
    if (!offer) return;
    if (madeIn) return nav.openChat(madeIn.id);
    landOffer(key, offer, offer.label);
  }
  function ask(text: string) {
    if (!offers.length) return;
    landOffer(key, offerForAsk(offer ? [offer] : offers, text), text); // the readPage switch is inside offerForAsk
  }
</script>

{#if part === "made" && items.length}
  <section class="made fb-card" aria-labelledby={`made-${key}`} data-profile-muse>
    <h2 class="fb-h2 mh" id={`made-${key}`}><MuseMark size="var(--sp-20)" />Made with Muse</h2>
    <ul class="row" data-hscroll>
      {#each items as t (t.id)}
        <li class="card">
          <div class="pv" aria-hidden="true">
            <div class="stage"><SurfaceToolCard backingKey={t.backingKey} toolId={t.toolId} readonly subtitle="Made with Muse" /></div>
            <span class="fade"></span>
          </div>
          <p class="nm">{t.name}</p>
          <p class="fb-meta wh">{t.role === "made" ? "Made it" : "Took part"} · {t.where}</p>
          <button class="hit" aria-label={`Open ${t.name}, ${t.where.toLowerCase()}`} onclick={t.open} data-muse-item={t.toolId}></button>
        </li>
      {/each}
    </ul>
  </section>
{:else if part === "ask" && offers.length}
  <section class="cat" aria-label={`Muse for you and ${first}`} data-profile-ask>
    <MuseAsk placeholder={`Ask Muse about you and ${first}`} onask={ask} />
    <MuseSuggest items={situation} ontake={take} ondismiss={(ids) => catalyst.dismiss(ids)} />
  </section>
{/if}

<style>
  .made { padding: var(--sp-12) 0 var(--sp-16); }
  .mh { display: flex; align-items: center; gap: var(--sp-8); padding: 0 var(--sp-16) var(--sp-12); }
  .row { display: flex; gap: var(--sp-8); overflow-x: auto; padding: 0 var(--sp-16); scrollbar-width: none; scroll-padding: var(--sp-16); scroll-snap-type: x proximity; }
  .row::-webkit-scrollbar { display: none; }
  /* A card is a fifth of the measured 1031 column on desktop, 200 on the phone (assumed). */
  .card { position: relative; flex: none; width: calc(var(--sp-40) * 5); scroll-snap-align: start; display: flex; flex-direction: column; gap: var(--sp-2); }
  .pv { position: relative; height: calc(var(--sp-48) * 3); overflow: hidden; border-radius: var(--r-card); background: var(--c-field); box-shadow: inset 0 0 0 1px var(--c-hairline); margin-bottom: var(--sp-6); }
  /* The tool is laid out at 320 and drawn at 0.625, so it reads like the card in the chat, smaller. */
  .stage { width: calc(var(--sp-80) * 4); transform: scale(0.625); transform-origin: 0 0; pointer-events: none; }
  .fade { position: absolute; left: 0; right: 0; bottom: 0; height: var(--sp-32); background: linear-gradient(to bottom, transparent, var(--c-bg)); }
  .nm { font-size: var(--fs-fb-name); line-height: var(--lh-fb-name); font-weight: var(--fw-semibold); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .wh { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hit { position: absolute; inset: 0; border-radius: var(--r-card); }
  .hit:active { background: var(--c-pressed); }
  :global(:root[data-layout="desktop"]) .hit:hover { background: var(--c-hover); }
  .cat { display: flex; flex-direction: column; gap: var(--sp-8); padding: var(--sp-12) var(--sp-16); }
</style>
