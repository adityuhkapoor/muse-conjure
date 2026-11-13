<script lang="ts">
  import { store } from "../store";
  import { nav } from "../lib/nav.svelte";
  import Icon from "./Icon.svelte";
  import MakeSheet from "./MakeSheet.svelte";
  import SearchAsk from "../muse/components/SearchAsk.svelte"; // catalysts
  import { askFromSearch } from "../muse/search"; // catalysts
  import MuseMark from "./MuseMark.svelte";
  import type { ToolTemplate } from "../store/types";

  /** Phone search screen. Empty state only: tools in your chats, then three things to make. No results logic yet. */
  let q = $state("");
  let make = $state<ToolTemplate | null>(null);
  const suggestions = $derived(["pick-for-us", "whos-in", "bracket"].map((id) => store.template(id)));
</script>

<section class="search" aria-label="Search">
  <header class="bar">
    <button class="back" aria-label="Back" onclick={() => nav.back()}><Icon name="back" /></button>
    <label class="field">
      <Icon name="searchOutline" />
      <input type="search" placeholder="Ask Meta AI or search" aria-label="Search" bind:value={q} onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); const t = q; requestAnimationFrame(() => askFromSearch(t)); } }} /><!-- catalysts: Enter asks Muse -->
    </label>
  </header>

  <div class="scroll">
    {#if q.trim()}
      <SearchAsk {q} /><!-- catalysts: Ask Muse with the words typed -->
    {:else}
      {#if store.tools.length}
        <h2 class="sec">Minis in your chats</h2>
        <ul>
          {#each store.tools as t (t.id)}
            <li>
              <button class="row" onclick={() => nav.openChat(t.chat, t.id)}>
                <span class="disc"><MuseMark size="var(--sp-24)" /></span>
                <span class="txt">
                  <span class="name">{t.name} · {t.summary}</span>
                  <span class="meta">{store.chat(t.chat)?.name}</span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      <h2 class="sec">Make something</h2>
      <ul>
        {#each suggestions as t (t.id)}
          <li>
            <button class="row" aria-haspopup="dialog" onclick={() => (make = t)}>
              <span class="disc"><MuseMark size="var(--sp-24)" /></span>
              <span class="txt">
                <span class="name">{t.name}</span>
                <span class="meta">{t.blurb}</span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  {#if make}<MakeSheet template={make} onclose={() => (make = null)} />{/if}
</section>

<style>
  .search { position: relative; display: flex; flex-direction: column; height: 100%; background: var(--c-bg); padding-top: var(--safe-top); }
  .bar { display: flex; align-items: center; gap: var(--sp-4); height: var(--header-h); padding: 0 var(--sp-16) 0 var(--sp-4); }
  .back { width: var(--hit); height: var(--hit); display: inline-flex; align-items: center; justify-content: center; color: var(--c-accent-icon); --icon-size: var(--sp-28); }
  .field {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    height: var(--search-h);
    padding: 0 var(--sp-12);
    border-radius: var(--r-pill);
    background: var(--c-field);
    color: var(--c-text-2);
    --icon-size: var(--sp-20);
  }
  .field input { flex: 1; min-width: 0; border: 0; background: none; outline: none; font-size: var(--fs-search); line-height: var(--lh-search); color: var(--c-text); }
  .field input::placeholder { color: var(--c-text-2); opacity: 1; }
  .field:focus-within { box-shadow: 0 0 0 1px var(--c-accent-icon); }
  .scroll { flex: 1; min-height: 0; overflow-y: auto; padding-bottom: var(--safe-bottom); scrollbar-width: none; }
  .scroll::-webkit-scrollbar { display: none; }
  .sec { padding: var(--sp-16) var(--sp-16) var(--sp-4); font-size: var(--fs-row-sub); line-height: var(--lh-row-sub); font-weight: var(--fw-semibold); color: var(--c-text); }
  .row { width: 100%; display: flex; align-items: center; gap: var(--sp-12); min-height: var(--sp-60); padding: var(--sp-8) var(--sp-16); text-align: left; }
  .row:active { background: var(--c-hover); }
  .disc { flex: none; width: var(--sp-44); height: var(--sp-44); border-radius: var(--r-round); background: var(--c-field); display: inline-flex; align-items: center; justify-content: center; }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .name { font-size: var(--fs-row-name); line-height: var(--lh-row-name); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .none { padding: var(--sp-32) var(--sp-16); text-align: center; color: var(--c-text-2); font-size: var(--fs-row-sub); line-height: var(--lh-row-sub); }
</style>
