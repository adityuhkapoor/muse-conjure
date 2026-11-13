<script lang="ts">
  import MuseMark from "../../components/MuseMark.svelte";
  import Icon from "../../components/Icon.svelte";

  /** One quiet extra option at the moment of intent: Muse mark, a short line, a chevron. Never a promo. */
  let { label, detail = "", onclick }: { label: string; detail?: string; onclick: () => void } = $props();
</script>

<button class="opt" data-muse-option {onclick}>
  <MuseMark size="var(--mark-row)" />
  <span class="txt">
    <span class="lab">{label}</span>
    {#if detail}<span class="det">{detail}</span>{/if}
  </span>
  <span class="chev"><Icon name="chevronRight" /></span>
</button>

<style>
  .opt {
    width: 100%;
    min-height: var(--hit);
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    padding: var(--sp-6) var(--sp-8) var(--sp-6) var(--sp-12);
    border-radius: var(--r-button);
    background: var(--c-field);
    text-align: left;
  }
  .opt:active { background: var(--c-pressed); }
  :global(:root[data-layout="desktop"]) .opt:hover { background: var(--c-btn-secondary); }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .lab { font-size: var(--fs-btn); line-height: var(--lh-btn); font-weight: var(--fw-semibold); color: var(--c-text); }
  .det { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  .chev { color: var(--c-text-2); --icon-size: var(--sp-16); display: inline-flex; }
</style>
