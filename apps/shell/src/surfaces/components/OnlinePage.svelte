<script lang="ts">
  import Icon from "../../components/Icon.svelte";
  import { ui } from "../../lib/ui.svelte";
  import { nav } from "../../lib/nav.svelte";
  import { usd } from "../../lib/kit";
  import type { WireKit, WireOnline } from "../../live/chat-reducer";
  import PageBar from "./PageBar.svelte";

  /**
   * kit: a real store product Muse found online for a plan, because Marketplace had none
   * (services/demo/kit.ts checked the link loads, and the photo, before showing it). Laid out like
   * ListingPage: photo, price, title, where it's sold, what the plan needs it for, one way out.
   */
  let { item }: { item: WireKit["items"][number] & { online: WireOnline } } = $props();
  const o = $derived(item.online);
  let broken = $state(false);
  const view = () => window.open(o.url, "_blank", "noopener,noreferrer");
</script>

{#snippet info()}
  <div class="info">
    <h1 class="title">{o.title}</h1>
    <p class="price">{o.price != null ? usd(o.price) : "Price on the store's site"}</p>
    <p class="listed">Sold by {o.store} · not on Marketplace</p>
    <div class="actions">
      <button class="btn primary go" onclick={view}><Icon name="share_arrow" />View on {o.store}</button>
    </div>
    <section class="sec">
      <h2 class="fb-section">For your plan</h2>
      <p class="kv"><span class="k">Need</span><span>{item.need}{item.qty > 1 ? ` ×${item.qty}` : ""}</span></p>
      {#if item.qty > 1 && item.cost}<p class="kv"><span class="k">Total</span><span>{usd(item.cost)}</span></p>{/if}
      {#if item.why}<p class="desc">{item.why}</p>{/if}
    </section>
    <p class="note">Muse checked this link works. Prices can change on the store's site.</p>
  </div>
{/snippet}

{#snippet photo(w: number)}
  <span class="photo fb-media">
    {#if o.image && !broken}
      <img src={o.image} alt={`Photo of ${o.title}`} width={w} referrerpolicy="no-referrer" onerror={() => (broken = true)} />
    {:else}
      <span class="initial" aria-hidden="true">{o.store.charAt(0).toUpperCase()}</span>
    {/if}
  </span>
{/snippet}

{#if ui.desktop}
  <section class="desk" aria-label="Found online">
    <div class="viewer">
      <button class="fb-round close" aria-label="Back" onclick={() => nav.back()}><Icon name="close" /></button>
      {@render photo(720)}
    </div>
    <div class="panel">{@render info()}</div>
  </section>
{:else}
  <section class="fb-page" aria-label="Found online">
    <PageBar title="Found online" />
    <div class="fb-scroll">
      {@render photo(393)}
      {@render info()}
    </div>
  </section>
{/if}

<style>
  .photo { aspect-ratio: 1; overflow: hidden; display: flex; align-items: center; justify-content: center; background: var(--c-field); }
  .photo img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .initial { font-size: var(--fs-event-title); font-weight: var(--fw-bold); color: var(--c-text-2); }
  .info { padding: var(--sp-12) var(--sp-16) var(--sp-32); display: flex; flex-direction: column; }
  .title { font-size: var(--fs-event-title); line-height: var(--lh-event-title); font-weight: var(--fw-bold); }
  .price { margin-top: var(--sp-3); font-size: var(--fs-price); line-height: var(--lh-price); font-weight: var(--fw-medium); }
  .listed { margin-top: var(--sp-2); font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  .actions { display: flex; gap: var(--sp-8); margin-top: var(--sp-12); }
  .go { flex: 1; --icon-size: var(--sp-20); }
  .sec { margin-top: var(--sp-16); padding-top: var(--sp-16); border-top: 1px solid var(--c-divider); display: flex; flex-direction: column; gap: var(--sp-8); }
  .kv { display: flex; gap: var(--sp-16); font-size: var(--fs-fb-body); line-height: var(--lh-fb-body); }
  .k { font-weight: var(--fw-semibold); }
  .desc { font-size: var(--fs-fb-body); line-height: var(--lh-fb-body); }
  .note { margin-top: var(--sp-16); font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }

  .desk { display: grid; grid-template-columns: minmax(0, 1fr) var(--mp-info-w); height: 100%; min-height: 0; }
  .viewer { position: relative; display: flex; align-items: center; justify-content: center; background: var(--c-media-dark); padding: var(--sp-32); min-height: 0; }
  .viewer .photo { width: min(100%, 70vh); }
  .close { position: absolute; top: var(--sp-16); left: var(--sp-16); }
  .panel { background: var(--c-bg); overflow-y: auto; min-height: 0; box-shadow: var(--sh-card); }
</style>
