<script lang="ts">
  /** Muse mark: gradient ring (Meta AI family colors). Our own drawing. The gradient def lives in App.svelte. */
  let { size = "var(--muse-mark)", spin = false }: { size?: string; spin?: boolean } = $props();
</script>

<svg class="mark" class:spin style:--s={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <circle cx="12" cy="12" r="8.5" fill="none" stroke="url(#muse-grad)" stroke-width="3.4" />
</svg>

<style>
  .mark { width: var(--s); height: var(--s); display: block; flex: none; }
  /* The ring is a gradient, so a turn is visible. DS: the mark spins while Muse builds. */
  .spin { animation: turn var(--dur-spin) var(--ease-linear) infinite; }
  @keyframes turn { to { transform: rotate(360deg); } }
</style>
