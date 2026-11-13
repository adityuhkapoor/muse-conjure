<script lang="ts">
  import { LISTINGS, type Listing } from "../../surfaces/data";
  import { saved } from "../../surfaces/flows.svelte";
  import { catalyst } from "../catalyst.svelte";
  import { listingContext } from "../context";
  import { nameOf } from "../page";
  import MuseAsk from "./MuseAsk.svelte";
  import MuseSuggest from "./MuseSuggest.svelte";
  import PageTools from "./PageTools.svelte";

  /**
   * Listing hook (surfaces/components/ListingPage.svelte): the Muse field, the reader's offers
   * once you save it (a second of its kind, its size, its price), and tools on this listing.
   * `share`: the Share sheet's own offers, read with "share" as what you just did.
   */
  let { l, share = false, onpicked }: { l: Listing; share?: boolean; onpicked?: () => void } = $props();
  const savedList = $derived(LISTINGS.filter((x) => saved.ids.includes(x.id)));
  const ctx = $derived(listingContext(l, { saved: savedList, isSaved: saved.has(l.id), nameOf, did: share ? ["share"] : [] }));
  const offers = $derived(share ? catalyst.suggest(ctx, 6).filter((s) => s.scenario === "mp-decide" || s.scenario === "mp-split").slice(0, 1) : catalyst.suggest(ctx));
</script>

{#if share}
  <MuseSuggest items={offers} ontake={(s) => { onpicked?.(); catalyst.take(ctx, s); }} ondismiss={(ids) => catalyst.dismiss(ids)} />
{:else}
  <div class="cat">
    <PageTools {ctx} credit="for this listing" />
    <MuseAsk placeholder="Ask Muse about this listing" onask={(t) => catalyst.ask(ctx, t)} />
    <MuseSuggest items={offers} ontake={(s) => catalyst.take(ctx, s)} ondismiss={(ids) => catalyst.dismiss(ids)} />
  </div>
{/if}

<style>
  .cat { margin-top: var(--sp-12); display: flex; flex-direction: column; gap: var(--sp-12); }
</style>
