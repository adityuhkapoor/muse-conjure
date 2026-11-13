<script lang="ts">
  import Icon from "../../components/Icon.svelte";
  import MuseMark from "../../components/MuseMark.svelte";
  import type { DraftRead, Offer } from "../compose";
  import ToolPreview from "./ToolPreview.svelte";
  import SurfaceToolCard from "../../surfaces/components/SurfaceToolCard.svelte";
  import { store } from "../../store";
  import { compose, postKey } from "../compose-live.svelte";

  /**
   * Under the post's text, a light hint: one row from Muse with what it read and a small live
   * preview, and a cross. Tapping it opens the Ask Muse sheet with that tool chosen. An attached
   * tool shows here in full with "Remove". Nothing shows when nothing fits.
   */
  type Props = { read: DraftRead | null; attached: Offer | null; making?: typeof compose.making; onopen: (o: Offer) => void; onremove: () => void; ondismiss: (scenario: string) => void };
  let { read, attached, making = null, onopen, onremove, ondismiss }: Props = $props();
  const madeTool = $derived(making ? store.surfaceTools(postKey(making.postId)).at(-1) : undefined);

  const shown = $derived(read?.offers[0] ?? null);
  const more = $derived((read?.offers.length ?? 1) - 1);
</script>

{#if making}
  <section class="att" aria-label="Something new for this post" data-compose-making={making.done ? "done" : making.error ? "error" : "working"}>
    <header class="ah">
      <MuseMark size="var(--mark-row)" spin={!making.done && !making.error} />
      <div class="at">
        <p class="fb-name">{making.error ? "Muse couldn't make this one" : making.done ? "Made for this post" : making.stage}</p>
        <p class="fb-meta">{making.error ? making.error : making.done ? "Made with Muse · on this post" : `${compose.makingNote} (${compose.makingSeconds} s)`}</p>
      </div>
      <button class="btn rm" onclick={() => compose.cancelNew()}>Remove</button>
    </header>
    {#if madeTool && !madeTool.building}
      <SurfaceToolCard backingKey={postKey(making.postId)} toolId={madeTool.id} subtitle="Made with Muse · on this post" />
    {/if}
  </section>
{:else if attached}
  <section class="att" aria-label={`${attached.title}, attached`} data-compose-attached={attached.tool}>
    <header class="ah">
      <MuseMark size="var(--mark-row)" />
      <div class="at">
        <p class="fb-name">{attached.title}</p>
        <p class="fb-meta">Made with Muse · on this post</p>
      </div>
      <button class="btn rm" onclick={onremove}>Remove</button>
    </header>
    <button class="btn use" onclick={() => compose.useInChat(attached)} data-compose-use-chat>Use in a chat</button>
    <ToolPreview offer={attached} interactive />
  </section>
{:else if shown}
  {#key shown.tool}
    <section class="sug" aria-label="Idea from Muse" data-compose-suggest={shown.scenario} data-tool={shown.tool}>
      <div class="top">
        <button class="take" onclick={() => onopen(shown)}>
          <MuseMark size="var(--mark-row)" />
          <span class="txt">
            <span class="lab">{shown.label}</span>
            <span class="det">{shown.read}{more ? ` · ${more + 1} ideas` : ""}</span>
          </span>
          <span class="plus" aria-hidden="true"><Icon name="chevronRight" /></span>
        </button>
        <button class="x" aria-label="Not now" onclick={() => ondismiss(shown.scenario)}><Icon name="close" /></button>
      </div>
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="pvb" onclick={() => onopen(shown)}>
        <ToolPreview offer={shown} compact />
        <span class="shield" aria-hidden="true"></span>
      </div>
    </section>
  {/key}
{/if}

<style>
  .sug {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
    padding: var(--sp-4) var(--sp-8) var(--sp-8);
    border-radius: var(--r-rich-card);
    background: var(--c-field);
    animation: slide var(--dur-short-in) var(--ease-enter) both;
  }
  .top { display: flex; align-items: center; }
  .take { flex: 1; min-width: 0; min-height: var(--hit); display: flex; align-items: center; gap: var(--sp-8); padding: 0 var(--sp-4); text-align: left; border-radius: var(--r-button); }
  .take:active { background: var(--c-pressed); }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .lab { font-size: var(--fs-btn); line-height: var(--lh-btn); font-weight: var(--fw-semibold); color: var(--c-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .det { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .plus { display: inline-flex; flex: none; width: var(--sp-28); height: var(--sp-28); align-items: center; justify-content: center; border-radius: var(--r-round); background: var(--c-btn-soft); color: var(--c-btn-soft-text); --icon-size: var(--sp-16); }
  .x { width: var(--hit); height: var(--hit); flex: none; display: inline-flex; align-items: center; justify-content: center; color: var(--c-text-2); --icon-size: var(--sp-16); border-radius: var(--r-round); }
  .x:active { background: var(--c-pressed); }
  .pvb { position: relative; display: block; width: 100%; border-radius: var(--r-rich-card); cursor: pointer; }
  .shield { position: absolute; inset: 0; z-index: 2; }
  :global(:root[data-layout="desktop"]) .take:hover .lab { text-decoration: underline; }
  .att { display: flex; flex-direction: column; gap: var(--sp-8); animation: slide var(--dur-short-in) var(--ease-enter) both; }
  .ah { display: flex; align-items: center; gap: var(--sp-8); }
  .at { flex: 1; min-width: 0; }
  .at .fb-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rm { flex: none; }
  .use { align-self: flex-start; }
  @keyframes slide { from { opacity: 0; transform: translateY(var(--sp-12)); } to { opacity: 1; transform: none; } }
</style>
