<script lang="ts">
  import Avatar from "../../components/Avatar.svelte";
  import Icon from "../../components/Icon.svelte";
  import { store } from "../../store";
  import { who } from "../../surfaces/flows.svelte";
  import type { Situation } from "../types";

  /**
   * Catalyst 2, Muse suggests: one or two quiet rows, each written for this moment, with the
   * faces it is about. Tapping builds it; the cross puts it away for good on this page.
   */
  type Props = { items: Situation[]; ontake: (s: Situation) => void; ondismiss: (ids: string[]) => void; tone?: "page" | "media" };
  let { items, ontake, ondismiss, tone = "page" }: Props = $props();
  const person = (id: string) => store.person(id) ?? who(id);
</script>

{#if items.length}
  <ul class="sug" class:media={tone === "media"} aria-label="Suggestions from Muse" data-muse-suggest>
    {#each items as s (s.id)}
      <li class="row">
        <button class="take" data-muse-option data-scenario={s.scenario} onclick={() => ontake(s)}>
          {#if s.faces.length}
            <span class="pile" aria-hidden="true">{#each s.faces.slice(0, 3) as f (f)}<Avatar person={person(f)} size="var(--avatar-facepile-sm)" ring />{/each}</span>
          {/if}
          <span class="txt">
            <span class="lab" id={`sug-${s.id.replace(/[^a-z0-9-]/gi, "-")}`}>{s.label}</span>
            {#if s.detail}<span class="det">{s.detail}</span>{/if}
          </span>
          <span class="chev" aria-hidden="true"><Icon name="chevronRight" /></span>
        </button>
        <button class="x" aria-label="Not now" aria-describedby={`sug-${s.id.replace(/[^a-z0-9-]/gi, "-")}`} onclick={() => ondismiss([s.id])}><Icon name="close" /></button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .sug { display: flex; flex-direction: column; gap: var(--sp-6); }
  .row { display: flex; align-items: stretch; border-radius: var(--r-button); background: var(--c-field); }
  .take { flex: 1; min-width: 0; min-height: var(--hit); display: flex; align-items: center; gap: var(--sp-8); padding: var(--sp-6) var(--sp-4) var(--sp-6) var(--sp-12); text-align: left; border-radius: var(--r-button) 0 0 var(--r-button); }
  .take:active { background: var(--c-pressed); }
  :global(:root[data-layout="desktop"]) .take:hover .lab { text-decoration: underline; }
  .pile { display: inline-flex; flex: none; }
  .pile > :global(.avatar + .avatar) { margin-left: calc(var(--sp-4) * -1); }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .lab { font-size: var(--fs-btn); line-height: var(--lh-btn); font-weight: var(--fw-semibold); color: var(--c-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .det { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chev { color: var(--c-text-2); --icon-size: var(--sp-16); display: inline-flex; flex: none; }
  .x { width: var(--hit); flex: none; display: inline-flex; align-items: center; justify-content: center; color: var(--c-text-2); --icon-size: var(--sp-16); border-radius: 0 var(--r-button) var(--r-button) 0; }
  .x:active { background: var(--c-pressed); }
  .media .row { background: var(--c-bg); box-shadow: var(--sh-float); }
</style>
