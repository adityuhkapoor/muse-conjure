<script lang="ts">
  import Icon from "../../components/Icon.svelte";
  import { askFromSearch } from "../search";

  /** Search hook (components/Search.svelte): with words typed, one row that asks Muse to make it. */
  let { q }: { q: string } = $props();
</script>

<ul>
  <li>
    <button class="row" data-muse-option onclick={() => askFromSearch(q)}>
      <span class="disc"><Icon name="searchOutline" /></span>
      <span class="txt">
        <span class="name">Ask Muse: “{q.trim()}”</span>
        <span class="meta">Muse makes it for a chat you pick</span>
      </span>
    </button>
  </li>
</ul>

<style>
  .row { width: 100%; display: flex; align-items: center; gap: var(--sp-12); min-height: var(--sp-60); padding: var(--sp-8) var(--sp-16); text-align: left; }
  .row:active { background: var(--c-hover); }
  .disc { flex: none; width: var(--sp-44); height: var(--sp-44); border-radius: var(--r-round); background: var(--c-field); display: inline-flex; align-items: center; justify-content: center; color: var(--c-text-2); --icon-size: var(--sp-20); }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .name { font-size: var(--fs-row-name); line-height: var(--lh-row-name); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
</style>
