<script lang="ts">
  import { onDestroy } from "svelte";
  import MuseMark from "./MuseMark.svelte";
  import Icon from "./Icon.svelte";
  import { store } from "../store";
  import { ui } from "../lib/ui.svelte";
  import type { MountedTool } from "../store/chat-store";

  /**
   * SEAM 2: MuseCard slot.
   *
   * Placeholder (fake store, previews, the building state): header (Muse mark, title, subtitle)
   * and a 300 px body (--muse-body-h). Live tool (`live`): the store mounts the app's sandboxed
   * frame into `[data-muse-mount]`. The app draws its own header, so the card is only the frame
   * plus one hairline. Until the frame reports its height the card keeps the building look, then
   * its height eases from there to the frame's height, so nothing jumps.
   */
  type Props = { appId: string; title: string; subtitle: string; toolId?: string; building?: boolean; preview?: boolean; live?: boolean; /** a look at someone else's Mini that cannot be tapped: no button to take the frame */ readonly?: boolean; /** bumped when Muse changes the tool in place: mount it again */ rev?: number };
  let { appId, title, subtitle, toolId, building = false, preview = false, live = false, readonly = false, rev = 0 }: Props = $props();

  let card: HTMLElement | undefined = $state();
  let slot: HTMLElement | undefined = $state();
  let frameH = $state<number | null>(null);
  let cardH = $state<number | null>(null);
  let failed = $state(false);
  let autoRetried = false;
  let evicted = $state(false);
  let leaveQueue: (() => void) | undefined;
  // Each retry mounts again; with a pre-made tool the store first rebuilds it from the next lab choice.
  let attempt = $state(0);
  let retrying = $state(false);
  let mounted: MountedTool | null = null;
  let ro: ResizeObserver | undefined;
  let width = 0;

  const showFrame = $derived(live && frameH !== null && !failed);

  function onSize(h: number) {
    if (frameH === null && card) {
      // Freeze the building height, then ease to the frame's height on the next frame.
      cardH = card.offsetHeight;
      requestAnimationFrame(() => (cardH = frameH));
    } else cardH = h;
    frameH = h;
  }

  // Can the person see this card now? Not covered by another page, not display: none, not scrolled
  // out of view. The room's frame goes to a card they can see (frames.ts follows this).
  let inView = true;
  $effect(() => {
    if (!card || !live || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => (inView = e?.isIntersecting ?? true));
    io.observe(card);
    return () => io.disconnect();
  });
  const seen = () => !!card?.isConnected && inView && !card.closest(".page")?.hasAttribute("inert") && (card.checkVisibility?.() ?? true);

  // Layer mode (Safari): a frame is laid over its slot from outside the page, so a card on a page
  // that is covered by another page lets go of its frame, and takes one again when uncovered.
  let covered = $state(false);
  $effect(() => {
    const page = card?.closest(".page");
    if (!live || !page || document.documentElement.dataset.frames !== "layer") return;
    const sync = () => (covered = page.hasAttribute("inert"));
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(page, { attributes: true, attributeFilter: ["inert"] });
    return () => mo.disconnect();
  });
  $effect(() => {
    if (covered && mounted) {
      mounted.destroy();
      mounted = null;
      ro?.disconnect();
    }
  });

  // A change in place (new code, maybe a new room): the same card mounts the new version, at the
  // height it has now, and eases to the new one.
  let mountedRev = rev;
  $effect(() => {
    const r = rev;
    if (r === mountedRev) return;
    mountedRev = r;
    mounted?.destroy();
    mounted = null;
    ro?.disconnect();
    failed = false;
    attempt += 1;
  });

  $effect(() => {
    void attempt;
    if (!live || !toolId || !slot || !card || mounted || covered || failed || evicted || !store.mountTool) return;
    width = card.clientWidth;
    try {
      mounted = store.mountTool(slot, toolId, {
        dark: ui.dark,
        width,
        onSize,
        visible: seen,
        // One quiet second try before saying it didn't open.
        onError: (_, fatal) => {
          if (!fatal || frameH !== null) return;
          if (autoRetried) return void (failed = true);
          autoRetried = true;
          mounted?.destroy();
          mounted = null;
          setTimeout(() => (attempt += 1), 700);
        },
        // The same Mini opened elsewhere on this page took the frame. This card shows a still
        // preview and takes the frame back when tapped or when the other card lets go of it.
        onEvicted: (wait) => {
          mounted = null;
          ro?.disconnect();
          frameH = null;
          cardH = null;
          failed = false;
          evicted = true;
          leaveQueue?.();
          leaveQueue = wait(reopen, seen);
        },
      });
    } catch (e) {
      console.warn(e);
      failed = true;
      return;
    }
    ro = new ResizeObserver(() => {
      const w = card?.clientWidth ?? width;
      if (w && Math.abs(w - width) >= 1) {
        width = w;
        mounted?.setTheme(ui.dark, w);
      }
    });
    ro.observe(card);
  });

  $effect(() => {
    const dark = ui.dark;
    mounted?.setTheme(dark, width);
  });

  function reopen() {
    leaveQueue?.();
    leaveQueue = undefined;
    if (!evicted) return;
    evicted = false;
    attempt += 1;
  }

  onDestroy(() => {
    leaveQueue?.();
    ro?.disconnect();
    mounted?.destroy();
    mounted = null;
  });

  async function retry() {
    if (!toolId || retrying) return;
    retrying = true;
    await store.retryTool?.(toolId).catch(() => false);
    mounted?.destroy();
    mounted = null;
    frameH = null;
    cardH = null;
    failed = false;
    retrying = false;
    attempt += 1;
  }

  const busy = $derived(building || (live && !showFrame && !failed && !evicted));
</script>

<!--
  The building state is the same card at the same size, so when the real card replaces it nothing moves.
  Meta-style loading: the mark spins, "Muse is building…", skeleton bars.
-->
<article
  bind:this={card}
  class="card"
  class:building={busy}
  class:framed={showFrame}
  data-muse-card
  data-app-id={appId}
  data-tool-id={toolId}
  data-live={live ? (showFrame ? "ready" : evicted ? "elsewhere" : "loading") : undefined}
  aria-label={building ? "Muse is conjuring" : title}
  aria-busy={busy}
  class:sized={live && cardH !== null}
  style:--card-h={live && cardH !== null ? cardH : undefined}
>
  {#if !showFrame}
    <header class="head">
      <MuseMark spin={busy} />
      <div class="titles">
        <p class="title">{building ? "Muse is conjuring…" : title}</p>
        <p class="sub">{building ? (subtitle !== "Made with Muse" ? subtitle : title) : subtitle}</p>
      </div>
      <button class="more" aria-label="More options" disabled={busy || preview || live}><span style:--icon-size="var(--sp-16)"><Icon name="more_dots" /></span></button>
    </header>
    <div class="body" data-muse-mount={live ? undefined : ""}>
      {#if evicted}
        {#if readonly}
          <p class="note">Preview</p>
        {:else}
          <p class="note">This Mini is open elsewhere on this page</p>
          <button class="btn" onclick={reopen}>Tap to open here</button>
        {/if}
      {:else}
        <div class="skeleton" aria-hidden="true">
          <span class="bar b1"></span>
          <span class="bar b2"></span>
          <span class="disc"></span>
          <span class="bar b3"></span>
        </div>
        <p class="note" class:hide={busy}>{failed ? "This Mini didn't open" : preview ? "Preview" : "Your Mini opens here"}</p>
      {/if}
      {#if failed && live && toolId}<button class="btn retry" disabled={retrying} onclick={retry}>{retrying ? "Trying" : "Try again"}</button>{/if}
    </div>
  {/if}
  {#if live}
    <div class="slot" class:shown={showFrame} bind:this={slot} data-muse-mount></div>
  {/if}
</article>

<style>
  .card {
    position: relative;
    width: 100%;
    background: var(--c-bg);
    border-radius: var(--r-rich-card);
    box-shadow: inset 0 0 0 1px var(--c-hairline);
    overflow: hidden;
    transition: height var(--dur-medium) var(--ease-move);
  }
  .card.sized { height: calc(var(--card-h) * 1px); }
  /* A live card is the frame plus one hairline drawn over it (the frame would cover an inset shadow). */
  .card.framed { box-shadow: none; background: transparent; }
  .card.framed::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px var(--c-hairline);
    pointer-events: none;
  }
  .slot { position: absolute; left: 0; top: 0; width: 100%; opacity: 0; pointer-events: none; }
  .slot.shown { position: static; opacity: 1; pointer-events: auto; }
  .slot :global(iframe) { display: block; max-width: 100%; }
  .head {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    padding: var(--sp-12) var(--sp-8) var(--sp-8) var(--sp-12);
  }
  .titles { flex: 1; min-width: 0; }
  .title {
    font-size: var(--fs-row-sub);
    line-height: var(--lh-row-sub);
    font-weight: var(--fw-semibold);
    color: var(--c-text);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .sub { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  .more {
    width: var(--sp-36);
    height: var(--sp-36);
    border-radius: var(--r-round);
    color: var(--c-text-2);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .more:hover { background: var(--c-hover); }
  .body {
    height: var(--muse-body-h);
    margin: 0 var(--sp-8) var(--sp-8);
    border-radius: var(--r-card);
    background: var(--c-field);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-16);
    padding: var(--sp-16);
  }
  .skeleton {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-12);
  }
  .bar, .disc {
    background: var(--c-divider);
    border-radius: var(--r-pill);
    animation: glimmer var(--dur-xl) var(--ease-linear) infinite alternate;
  }
  .bar { display: block; height: var(--sp-12); }
  .b1 { width: 60%; }
  .b2 { width: 40%; animation-delay: var(--dur-xxs); }
  .b3 { width: 50%; animation-delay: var(--dur-xs); }
  .disc { width: var(--sp-80); height: var(--sp-80); border-radius: var(--r-round); animation-delay: var(--dur-xs-in); }
  .note { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  .note.hide { visibility: hidden; }
  .more:disabled { visibility: hidden; }
  @keyframes glimmer { from { opacity: 0.15; } to { opacity: 0.5; } } /* FB skeleton opacity .15 to .5, 1s: measured-web */
</style>
