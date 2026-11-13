<script lang="ts">
  import ChatRows from "./ChatRows.svelte";
  import Filters from "./Filters.svelte";
  import { listView } from "../lib/ui.svelte";
  import Icon from "./Icon.svelte";
  import NeedsYou from "../surfaces/components/NeedsYou.svelte"; // surfaces

  let { selectedId }: { selectedId: string | null } = $props();
</script>

<aside class="list" aria-label="Chats">
  <header class="top">
    <h1 class="title">Chats</h1>
    <div class="btns">
      <button aria-disabled="true" title="Not in this prototype" aria-label="Options"><Icon name="more_dots" /></button>
      <button aria-disabled="true" title="Not in this prototype" aria-label="New message"><Icon name="new_message_compose" /></button>
    </div>
  </header>
  <div class="search-wrap">
    <label class="search">
      <Icon name="search_magnifier" />
      <input type="search" placeholder="Search Messenger" aria-label="Search Messenger" bind:value={listView.query} />
    </label>
  </div>
  <Filters />
  <div class="scroll"><NeedsYou /><!-- surfaces --><ChatRows {selectedId} /></div>
</aside>

<style>
  .list { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .top { display: flex; align-items: center; justify-content: space-between; padding: var(--sp-16) var(--sp-16) var(--sp-8); }
  .title { font-size: var(--fs-chats-title); line-height: var(--lh-chats-title); font-weight: var(--fw-bold); }
  .btns { display: flex; gap: var(--sp-8); --icon-size: var(--sp-16); }
  .btns button {
    width: var(--sp-36);
    height: var(--sp-36);
    border-radius: var(--r-round);
    background: var(--c-btn-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .search-wrap { padding: var(--sp-4) var(--sp-16) var(--sp-8); }
  .search {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    height: var(--search-h);
    padding: 0 var(--sp-12);
    border-radius: var(--r-pill);
    background: var(--c-field);
    color: var(--c-text-2);
    --icon-size: var(--sp-16);
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    outline: none;
    font-size: var(--fs-search);
    line-height: var(--lh-search);
    color: var(--c-text);
  }
  .search input::placeholder { color: var(--c-text-2); opacity: 1; }
  .search:focus-within { box-shadow: 0 0 0 1px var(--c-accent); }
  .scroll { flex: 1; min-height: 0; overflow-y: auto; }
</style>
