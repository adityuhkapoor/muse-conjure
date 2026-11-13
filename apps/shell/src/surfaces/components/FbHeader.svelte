<script lang="ts">
  import Icon from "../../components/Icon.svelte";
  import { nav } from "../../lib/nav.svelte";
  import { store } from "../../store";
  import { fbSearch } from "../search.svelte";
  import { scrollHide } from "../../lib/scrollHide";

  /** IOS: 52 tall, opaque, no divider. Pinned over the feed (not scrolling with it): hides on
   * scroll down, reveals on scroll up, same as the real app. menu 44, wordmark, search 52, Messenger 52. */
  let { scroller }: { scroller: HTMLElement } = $props();
  const unread = $derived(store.chats.filter((c) => c.unread).length);
</script>

<!-- Covers the safe-top strip (status bar / notch) permanently: never slides away, so a hidden
     header can never expose scrolled content up there. -->
<div class="safe-strip" aria-hidden="true"></div>
<header class="fbh" use:scrollHide={scroller}>
  <button class="menu" aria-label="Menu" onclick={() => nav.go({ kind: "fb", page: { name: "menu" } })}><Icon name="fbs_menu" /></button>
  <h1 class="wordmark">facebook</h1>
  <button class="hb" aria-label="Search" onclick={() => { fbSearch.q = ""; nav.go({ kind: "fb", page: { name: "search" } }); }}><Icon name="searchOutline" /></button><!-- catalysts: Ask Meta AI or search -->
  <button class="hb" aria-label={unread ? `Messenger, ${unread} unread` : "Messenger"} onclick={() => nav.toMessenger()}>
    <Icon name="top_messenger" />
    {#if unread}<span class="badge" aria-hidden="true">{unread}</span>{/if}
  </button>
</header>

<style>
  .safe-strip { position: absolute; z-index: 4; top: 0; left: 0; right: 0; height: var(--safe-top); background: var(--c-fb-header); }
  .fbh {
    position: absolute;
    z-index: 3;
    top: var(--safe-top);
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    height: var(--fb-header-h);
    background: var(--c-fb-header);
    color: var(--c-fb-tab-idle);
    transform: translateY(0);
    transition: transform var(--m-push-dur) var(--m-push-ease);
  }
  /* data-hide is set by the scrollHide action (vanilla DOM), not the template, so Svelte's scoped-CSS
     pruning can't see it is ever used and drops the rule unless the attribute part is marked global. */
  .fbh:global([data-hide]) { transform: translateY(-100%); }
  .menu { width: var(--fb-menu-btn-w); height: var(--fb-header-h); display: inline-flex; align-items: center; justify-content: center; --icon-size: var(--sp-24); flex: none; }
  .wordmark { flex: 1; min-width: 0; height: var(--fb-wordmark-h); font-size: var(--fs-fb-wordmark); line-height: var(--fb-wordmark-h); font-weight: var(--fw-bold); color: var(--c-accent); letter-spacing: -0.02em; }
  .hb { position: relative; width: var(--fb-header-btn); height: var(--fb-header-btn); display: inline-flex; align-items: center; justify-content: center; --icon-size: var(--sp-24); flex: none; }
  .badge { position: absolute; top: var(--sp-8); right: var(--sp-6); min-width: var(--sp-16); height: var(--sp-16); padding: 0 var(--sp-4); border-radius: var(--r-pill); background: var(--c-badge); color: var(--c-white); font-size: var(--fs-tab); line-height: var(--sp-16); font-weight: var(--fw-medium); text-align: center; }
</style>
