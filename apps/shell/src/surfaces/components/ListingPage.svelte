<script lang="ts">
  import Photo from "../../components/Photo.svelte";
  import Avatar from "../../components/Avatar.svelte";
  import Icon from "../../components/Icon.svelte";
  import { ui } from "../../lib/ui.svelte";
  import { nav } from "../../lib/nav.svelte";
  import { fb } from "../fbnav.svelte";
  import { listing, money } from "../data";
  import { decideWithRoommates, saved, sendListing, shortlistFor, splitIt, who } from "../flows.svelte";
  import MuseOption from "./MuseOption.svelte";
  import PageBar from "./PageBar.svelte";
  import ShareSheet from "./ShareSheet.svelte";
  import ListingCatalysts from "../../muse/components/ListingCatalysts.svelte"; // catalysts

  /**
   * Listing (MP section 4: title 24/28 w700, price 17/20 w500, "Listed ... in ...", Message then
   * Save / Share / more). The Muse moment: the second saved listing of a kind, or Share, offers
   * one option: "Decide with roommates" (or "Split it" when there is nothing to choose between).
   */
  let { id }: { id: string } = $props();
  const l = $derived(listing(id)!);
  const seller = $derived(who(l.seller));
  const isSaved = $derived(saved.has(l.id));
  const sameKind = $derived(saved.sameKind(l));
  let share = $state(false);
  const deciding = $derived(sameKind.filter((x) => x.id !== l.id).length >= 1);
</script>

{#snippet info()}
  <div class="info">
    <h1 class="title">{l.title}</h1>
    <p class="price">{money(l.price)}</p>
    <p class="listed">Listed {l.ago} in {l.where}</p>
    <div class="actions">
      <button class="btn msg" onclick={() => fb.say("Not in this prototype")}><Icon name="top_messenger" />Message</button>
      <button class="btn ib" class:soft={isSaved} aria-pressed={isSaved} aria-label={isSaved ? "Saved" : "Save"} onclick={() => saved.toggle(l.id)}><Icon name={isSaved ? "bookmark_save" : "fbs_bookmark"} /></button>
      <button class="btn ib" aria-label="Share" aria-haspopup="dialog" onclick={() => (share = true)}><Icon name="share_arrow" /></button>
      <button class="btn ib" aria-disabled="true" title="Not in this prototype" aria-label="More"><Icon name="more_dots" /></button>
    </div>
    <ListingCatalysts {l} /><!-- catalysts: Muse field, offers from what you saved, tools on this listing (src/muse) -->
    <section class="sec">
      <h2 class="fb-section">Details</h2>
      <p class="kv"><span class="k">Condition</span><span>{l.condition}</span></p>
      <p class="desc">{l.description}</p>
      <p class="loc"><strong>{l.where}</strong> · Location is approximate</p>
    </section>
    <section class="sec">
      <h2 class="fb-section">Seller information</h2>
      <div class="seller">
        <Avatar person={seller} size="var(--sp-48)" />
        <span class="sn">{seller?.name}</span>
      </div>
    </section>
  </div>
{/snippet}

{#if ui.desktop}
  <section class="desk" aria-label="Listing">
    <div class="viewer">
      <button class="fb-round close" aria-label="Back to Marketplace" onclick={() => nav.go({ kind: "fb", page: { name: "marketplace" } })}><Icon name="close" /></button>
      <span class="photo fb-media t{l.tone}"><Photo id={l.asset} width={720} alt={`Photo of the ${l.title.toLowerCase()} for sale`} eager /></span>
    </div>
    <div class="panel">{@render info()}</div>
  </section>
{:else}
  <section class="fb-page" aria-label="Listing">
    <PageBar title="Marketplace" />
    <div class="fb-scroll">
      <span class="photo fb-media t{l.tone}"><Photo id={l.asset} width={393} alt={`Photo of the ${l.title.toLowerCase()} for sale`} eager /></span>
      {@render info()}
    </div>
  </section>
{/if}

{#if share}
  <ShareSheet label="Share listing" onclose={() => (share = false)} onsend={(c) => { share = false; sendListing(c, l); }}>
    {#snippet muse()}
      <ListingCatalysts {l} share onpicked={() => (share = false)} /><!-- catalysts -->
    {/snippet}
  </ShareSheet>
{/if}

<style>
  .photo { aspect-ratio: 1; overflow: hidden; }
  .info { padding: var(--sp-12) var(--sp-16) var(--sp-32); display: flex; flex-direction: column; }
  .title { font-size: var(--fs-event-title); line-height: var(--lh-event-title); font-weight: var(--fw-bold); }
  .price { margin-top: var(--sp-3); font-size: var(--fs-price); line-height: var(--lh-price); font-weight: var(--fw-medium); }
  .listed { margin-top: var(--sp-2); font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  .actions { display: flex; gap: var(--sp-8); margin-top: var(--sp-12); }
  .msg { flex: 1; }
  .ib { width: var(--sp-48); padding: 0; flex: none; --icon-size: var(--sp-20); }
  .moment { margin-top: var(--sp-12); }
  .sec { margin-top: var(--sp-16); padding-top: var(--sp-16); border-top: 1px solid var(--c-divider); display: flex; flex-direction: column; gap: var(--sp-8); }
  .kv { display: flex; gap: var(--sp-16); font-size: var(--fs-fb-body); line-height: var(--lh-fb-body); }
  .k { font-weight: var(--fw-semibold); }
  .desc { font-size: var(--fs-fb-body); line-height: var(--lh-fb-body); }
  .loc { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  .loc strong { color: var(--c-text); font-weight: var(--fw-regular); }
  .seller { display: flex; align-items: center; gap: var(--sp-12); }
  .sn { font-size: var(--fs-fb-name); line-height: var(--lh-fb-name); font-weight: var(--fw-semibold); }

  .desk { display: grid; grid-template-columns: minmax(0, 1fr) var(--mp-info-w); height: 100%; min-height: 0; }
  .viewer { position: relative; display: flex; align-items: center; justify-content: center; background: var(--c-media-dark); padding: var(--sp-32); min-height: 0; }
  .viewer .photo { width: min(100%, 70vh); }
  .close { position: absolute; top: var(--sp-16); left: var(--sp-16); }
  .panel { background: var(--c-bg); overflow-y: auto; min-height: 0; box-shadow: var(--sh-card); }
</style>
