<script lang="ts">
  import { onDestroy } from "svelte";
  import MuseCard from "../../components/MuseCard.svelte";
  import { store } from "../../store";
  import { ui } from "../../lib/ui.svelte";
  import { mountTool, type Mounted } from "../../live/frames";
  import { rid } from "../../live/socket";
  import { toolAvatar } from "../../lib/tool-avatar";
  import { compose, localSocket } from "../compose-live.svelte";
  import type { Offer } from "../compose";

  /**
   * The real tool, filled from the draft, in its own sandbox frame on a log that never leaves this
   * phone. `compact`: the top of it at reduced height, under a fade (the suggestion row).
   * `interactive`: taps work (the attached card), else it is shown only. With the fake store the
   * placeholder card stands in.
   */
  type Props = { offer: Offer; compact?: boolean; interactive?: boolean };
  let { offer, compact = false, interactive = false }: Props = $props();

  let slot: HTMLElement | undefined = $state();
  let box: HTMLElement | undefined = $state();
  let height = $state<number | null>(null);
  let failed = $state(false);
  let mounted: Mounted | null = null;
  let key = "";
  let width = 0;
  let ro: ResizeObserver | undefined;

  function unmount() {
    mounted?.destroy();
    mounted = null;
    ro?.disconnect();
  }

  $effect(() => {
    const k = offer.tool + JSON.stringify(offer.params);
    if (!store.live || !slot || !box || k === key) return;
    key = k;
    unmount();
    height = null;
    failed = false;
    const el = slot;
    compose
      .build(offer)
      .then((code) => {
        if (key !== k || !box) return;
        width = box.clientWidth;
        mounted = mountTool({
          el,
          code,
          socket: localSocket(compose.me),
          room: `a:preview-${rid()}`,
          me: compose.me,
          members: compose.previewMembers().map((m) => {
            const avatar = toolAvatar(m.id, m.name);
            return avatar ? { ...m, avatar } : m;
          }),
          dark: ui.dark,
          width,
          onSize: (h) => (height = h),
          onSummary: () => {},
          onError: (_, fatal) => fatal && height === null && (failed = true),
        });
        ro = new ResizeObserver(() => {
          const w = box?.clientWidth ?? width;
          if (w && Math.abs(w - width) >= 1) {
            width = w;
            mounted?.setTheme(ui.dark, w);
          }
        });
        ro.observe(box);
      })
      .catch(() => key === k && (failed = true));
  });

  $effect(() => {
    const dark = ui.dark;
    mounted?.setTheme(dark, width);
  });

  onDestroy(unmount);
</script>

{#if store.live && !failed}
  <div class="pv" class:compact class:ready={height !== null} bind:this={box} aria-hidden={interactive ? undefined : "true"} data-compose-preview={offer.tool} data-ready={height !== null ? "1" : undefined}>
    {#if height === null}
      <div class="wait" aria-hidden="true"><span class="bar b1"></span><span class="bar b2"></span><span class="disc"></span></div>
    {/if}
    <div class="slot" bind:this={slot}></div>
    {#if compact}<span class="fade" aria-hidden="true"></span>{/if}
    {#if !interactive}<span class="shield" aria-hidden="true"></span>{/if}
  </div>
{:else}
  <div class="pv fake" class:compact inert={!interactive} data-compose-preview={offer.tool}>
    <MuseCard appId="poll" title={offer.title} subtitle="Made with Muse · preview" preview />
    {#if compact}<span class="fade" aria-hidden="true"></span>{/if}
  </div>
{/if}

<style>
  .pv { position: relative; width: 100%; border-radius: var(--r-rich-card); overflow: hidden; background: var(--c-bg); box-shadow: inset 0 0 0 1px var(--c-hairline); }
  .pv.ready { box-shadow: none; }
  .pv.ready::after { content: ""; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 1px var(--c-hairline); pointer-events: none; }
  .compact { max-height: calc(var(--sp-80) * 2.25); }
  :global(:root[data-layout="desktop"]) .compact { max-height: calc(var(--sp-80) * 3.5); }
  .slot :global(iframe) { display: block; width: 100%; max-width: 100%; border: 0; }
  /* Over the slot, not above it: a frame pushed out of view by it would never be laid out. */
  .pv:not(.ready) { min-height: calc(var(--sp-80) * 2.25); }
  .wait { position: absolute; inset: 0; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--sp-12); background: var(--c-field); }
  .bar, .disc { display: block; background: var(--c-divider); border-radius: var(--r-pill); animation: glimmer var(--dur-xl) var(--ease-linear) infinite alternate; }
  .bar { height: var(--sp-12); }
  .b1 { width: 55%; }
  .b2 { width: 35%; animation-delay: var(--dur-xxs); }
  .disc { width: var(--sp-48); height: var(--sp-48); border-radius: var(--r-round); animation-delay: var(--dur-xs); }
  .fade { position: absolute; left: 0; right: 0; bottom: 0; height: var(--sp-48); background: linear-gradient(to bottom, transparent, var(--c-bg)); pointer-events: none; z-index: 1; }
  .fake :global([data-muse-card]) { box-shadow: none; }
  /* Shown only: a frame that is inert stops reporting its size, so taps are held off by a cover instead. */
  .shield { position: absolute; inset: 0; z-index: 2; }
  @keyframes glimmer { from { opacity: 0.15; } to { opacity: 0.5; } }
</style>
