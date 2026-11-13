<script lang="ts">
  import { listView, type InboxFilter } from "../lib/ui.svelte";

  /** IOS_FINDINGS: All, Unread, Groups under the search field. Web: the same three, 36 tall. */
  const CHIPS: [InboxFilter, string][] = [
    ["all", "All"],
    ["unread", "Unread"],
    ["groups", "Groups"],
  ];
</script>

<div class="filters" role="group" aria-label="Filter chats">
  {#each CHIPS as [id, label] (id)}
    <button class="chip" class:on={listView.filter === id} aria-pressed={listView.filter === id} onclick={() => (listView.filter = id)}>{label}</button>
  {/each}
</div>

<style>
  .filters { display: flex; gap: var(--chip-gap); padding: var(--sp-4) var(--sp-16) var(--sp-8); }
  .chip {
    position: relative;
    height: var(--inbox-chip-h);
    min-width: var(--inbox-chip-w-min);
    padding: 0 var(--inbox-chip-pad-x);
    border-radius: var(--r-pill);
    box-shadow: inset 0 0 0 1px var(--c-divider);
    color: var(--c-text);
    font-size: var(--fs-row-sub);
    line-height: var(--lh-row-sub);
    font-weight: var(--fw-semibold);
  }
  /* A 29 tall chip still gets a 44 tall target. */
  .chip::after { content: ""; position: absolute; inset: calc((var(--hit) - var(--inbox-chip-h)) / -2) 0; }
  .chip.on { background: var(--c-btn-soft); color: var(--c-btn-soft-text); box-shadow: none; }
  :global(:root[data-layout="desktop"]) .filters { gap: var(--sp-4); padding: 0 var(--sp-16) var(--sp-8); }
  :global(:root[data-layout="desktop"]) .chip { height: var(--chip-h); box-shadow: none; font-size: var(--fs-btn); line-height: var(--lh-btn); }
  :global(:root[data-layout="desktop"]) .chip:not(.on):hover { background: var(--c-hover); }
</style>
