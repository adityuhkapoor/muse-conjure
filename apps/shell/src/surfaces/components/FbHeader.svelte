<script lang="ts">
  import Icon from "../../components/Icon.svelte";
  import { nav } from "../../lib/nav.svelte";
  import { store } from "../../store";
  import { fbSearch } from "../search.svelte";

  /** IOS: 52 tall, opaque, no divider, scrolls with the feed: menu 44, wordmark, search 52, Messenger 52. */
  const unread = $derived(store.chats.filter((c) => c.unread).length);
</script>

<header class="fbh">
  <button class="menu" aria-label="Menu" onclick={() => nav.go({ kind: "fb", page: { name: "menu" } })}><Icon name="fbs_menu" /></button>
  <h1 class="wordmark">facebook</h1>
  <button class="hb" aria-label="Search" onclick={() => { fbSearch.q = ""; nav.go({ kind: "fb", page: { name: "search" } }); }}><Icon name="searchOutline" /></button><!-- catalysts: Ask Meta AI or search -->
  <button class="hb" aria-label={unread ? `Messenger, ${unread} unread` : "Messenger"} onclick={() => nav.toMessenger()}>
    <Icon name="top_messenger" />
    {#if unread}<span class="badge" aria-hidden="true">{unread}</span>{/if}
  </button>
</header>

<style>
  .fbh { display: flex; align-items: center; height: calc(var(--fb-header-h) + var(--safe-top)); padding-top: var(--safe-top); background: var(--c-fb-header); color: var(--c-fb-tab-idle); }
  .menu { width: var(--fb-menu-btn-w); height: var(--fb-header-h); display: inline-flex; align-items: center; justify-content: center; --icon-size: var(--sp-24); flex: none; }
  .wordmark { flex: 1; min-width: 0; height: var(--fb-wordmark-h); font-size: var(--fs-fb-wordmark); line-height: var(--fb-wordmark-h); font-weight: var(--fw-bold); color: var(--c-accent); letter-spacing: -0.02em; }
  .hb { position: relative; width: var(--fb-header-btn); height: var(--fb-header-btn); display: inline-flex; align-items: center; justify-content: center; --icon-size: var(--sp-24); flex: none; }
  .badge { position: absolute; top: var(--sp-8); right: var(--sp-6); min-width: var(--sp-16); height: var(--sp-16); padding: 0 var(--sp-4); border-radius: var(--r-pill); background: var(--c-badge); color: var(--c-white); font-size: var(--fs-tab); line-height: var(--sp-16); font-weight: var(--fw-medium); text-align: center; }
</style>
