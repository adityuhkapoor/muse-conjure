<script lang="ts">
  import Icon from "../../components/Icon.svelte";
  import { scrollHide } from "../../lib/scrollHide";

  let { scroller }: { scroller: HTMLElement } = $props();
</script>

<div class="safe-strip" aria-hidden="true"></div>
<header class="top" use:scrollHide={scroller}>
  <h1 class="fb-bar-title">Marketplace</h1>
  <div class="icons">
    <button class="fb-round" aria-disabled="true" title="Not in this prototype" aria-label="Your account"><Icon name="fbs_profile" /></button>
    <button class="fb-round" aria-disabled="true" title="Not in this prototype" aria-label="Search Marketplace"><Icon name="searchOutline" /></button>
  </div>
</header>

<style>
  .safe-strip { position: absolute; z-index: 4; top: 0; left: 0; right: 0; height: var(--safe-top); background: var(--c-bg); }
  .top {
    position: absolute;
    z-index: 3;
    top: var(--safe-top);
    left: 0;
    right: 0;
    height: var(--fb-header-h);
    padding: 0 var(--sp-12);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--c-bg);
    transform: translateY(0);
    transition: transform var(--m-push-dur) var(--m-push-ease);
  }
  /* data-hide is set by the scrollHide action, not the template; :global() keeps Svelte from
     pruning the rule as "unused". */
  .top:global([data-hide]) { transform: translateY(-100%); }
  .icons { display: flex; gap: var(--sp-8); }
</style>
