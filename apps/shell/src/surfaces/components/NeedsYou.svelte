<script lang="ts">
  import MuseMark from "../../components/MuseMark.svelte";
  import { nav } from "../../lib/nav.svelte";
  import { waitingOnMe } from "../flows.svelte";
  import { listView } from "../../lib/ui.svelte";

  /** Inbox hook (components/Inbox.svelte): a row for each tool made from a Facebook surface that waits on you. */
  const waiting = $derived(waitingOnMe());
</script>

{#if waiting.length && listView.filter === "all"}
  <ul class="needs" aria-label="Needs you">
    {#each waiting as w (w.toolId)}
      <li>
        <button class="nrow" data-needs-you={w.toolId} onclick={() => nav.openChat(w.chatId, w.toolId)}>
          <span class="mk"><MuseMark size="var(--sp-24)" /></span>
          <span class="txt">
            <span class="t"><strong>{w.name}</strong> is waiting on you</span>
            <span class="s">{w.chat} · from {w.surface}</span>
          </span>
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .needs { padding: 0 var(--sp-8) var(--sp-4); }
  .nrow { width: 100%; display: flex; align-items: center; gap: var(--sp-12); padding: var(--sp-8); border-radius: var(--r-button); text-align: left; background: var(--c-field); }
  .nrow:active { background: var(--c-pressed); }
  :global(:root[data-layout="desktop"]) .nrow:hover { background: var(--c-btn-secondary); }
  .mk { width: var(--sp-40); height: var(--sp-40); border-radius: var(--r-round); background: var(--c-bg); display: inline-flex; align-items: center; justify-content: center; flex: none; }
  .txt { min-width: 0; display: flex; flex-direction: column; }
  .t { font-size: var(--fs-row-sub); line-height: var(--lh-row-sub); color: var(--c-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .t strong { font-weight: var(--fw-semibold); }
  .s { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
</style>
