<script lang="ts">
  import Icon from "../../components/Icon.svelte";
  import { nav } from "../../lib/nav.svelte";

  /** Phone pushed page header: back, centred title. Same bar as the event page: 52 under the safe area, no divider (IOS). */
  let { title, dark = false }: { title: string; dark?: boolean } = $props();
</script>

<header class="bar" class:dark>
  <button class="back" aria-label="Back" onclick={() => nav.back()}><Icon name="back" /></button>
  <h1 class="t">{title}</h1>
  <span class="pad" aria-hidden="true"></span>
</header>

<style>
  .bar { flex: none; display: flex; align-items: center; height: calc(var(--fb-header-h) + var(--safe-top)); padding: var(--safe-top) var(--sp-8) 0 var(--sp-4); background: var(--c-fb-header); position: relative; z-index: 2; }
  .bar.dark { background: transparent; box-shadow: none; color: var(--c-on-media); }
  .back, .pad { width: var(--hit); height: var(--hit); display: inline-flex; align-items: center; justify-content: center; color: var(--c-accent-icon); --icon-size: var(--sp-28); flex: none; }
  .dark .back { color: var(--c-on-media); }
  .t { flex: 1; min-width: 0; text-align: center; font-size: var(--fs-title); line-height: var(--lh-title); font-weight: var(--fw-semibold); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
