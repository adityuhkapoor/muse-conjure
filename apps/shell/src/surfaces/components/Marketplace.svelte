<script lang="ts">
  import Photo from "../../components/Photo.svelte";
  import Icon from "../../components/Icon.svelte";
  import { nav } from "../../lib/nav.svelte";
  import { ui } from "../../lib/ui.svelte";
  import { LISTINGS, money } from "../data";
  import { saved } from "../flows.svelte";

  /** Marketplace grid (MP section 4: card 266, image r6 with a hairline, price 17/20 w600, title 15/20, place 13/16). */
</script>

<section class="mp" class:top-pad={!ui.desktop} aria-label="Marketplace">
  {#if !ui.desktop}
    <div class="chips" data-hscroll>
      <button class="chip" aria-disabled="true" title="Not in this prototype">Sell</button>
      <button class="chip on" aria-current="page">For you</button>
      <button class="chip" aria-disabled="true" title="Not in this prototype">Local</button>
      <button class="chip" aria-disabled="true" title="Not in this prototype">Categories</button>
    </div>
  {/if}
  <div class="head">
    <h2 class="fb-h2">Today's picks</h2>
    <span class="loc"><Icon name="location_pin" />Eastfield · 10 mi</span>
  </div>
  <ul class="grid">
    {#each LISTINGS as l (l.id)}
      <li>
        <button class="item" aria-label={`${money(l.price)}, ${l.title}, ${l.where}`} onclick={() => nav.go({ kind: "fb", page: { name: "listing", id: l.id } })}>
          <span class="img fb-media t{l.tone}" aria-hidden="true">
            <Photo id={l.asset} width={ui.desktop ? 266 : 180} alt="" />
            {#if saved.has(l.id)}<span class="sv"><Icon name="bookmark_save" /></span>{/if}
          </span>
          <span class="price">{money(l.price)}</span>
          <span class="title">{l.title}</span>
          <span class="where">{l.where}</span>
        </button>
      </li>
    {/each}
  </ul>
</section>

<style>
  .mp { padding: 0 var(--sp-12) var(--sp-16); }
  .mp.top-pad { padding-top: calc(var(--fb-header-h) + var(--safe-top)); }
  .chips { display: flex; gap: var(--sp-8); padding: var(--sp-4) 0 var(--sp-12); overflow-x: auto; scrollbar-width: none; }
  .chip { flex: none; height: var(--btn-h); padding: 0 var(--sp-12); border-radius: var(--r-pill); background: var(--c-btn-secondary); font-size: var(--fs-btn); line-height: var(--lh-btn); font-weight: var(--fw-semibold); }
  .chip.on { background: var(--c-btn-soft); color: var(--c-btn-soft-text); }
  .head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-8); padding: var(--sp-4) 0 var(--sp-12); }
  .loc { display: inline-flex; align-items: center; gap: var(--sp-4); font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); --icon-size: var(--sp-16); white-space: nowrap; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-16) var(--mp-gap); }
  :global(:root[data-layout="desktop"]) .grid { grid-template-columns: repeat(auto-fill, minmax(var(--mp-card-w), 1fr)); }
  :global(:root[data-layout="desktop"]) .mp { padding: var(--sp-16) var(--sp-16) var(--sp-32); }
  .item { width: 100%; display: flex; flex-direction: column; text-align: left; }
  .img { position: relative; overflow: hidden; aspect-ratio: 1; border-radius: var(--r-mp-thumb); box-shadow: inset 0 0 0 1px var(--c-hairline); }
  .img::after { content: ""; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 1px var(--c-hairline); }
  .sv { z-index: 1; position: absolute; top: var(--sp-8); right: var(--sp-8); width: var(--sp-28); height: var(--sp-28); border-radius: var(--r-round); background: var(--c-bg); color: var(--c-text); display: inline-flex; align-items: center; justify-content: center; --icon-size: var(--sp-16); }
  .price { margin-top: var(--sp-8); font-size: var(--fs-price); line-height: var(--lh-price); font-weight: var(--fw-semibold); }
  .title { font-size: var(--fs-fb-body); line-height: var(--lh-fb-body); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .where { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
</style>
