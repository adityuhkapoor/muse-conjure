<script lang="ts">
  import MuseCard from "../../components/MuseCard.svelte";
  import { store } from "../../store";

  /**
   * A tool that lives in a chat behind a surface (a post, a group), mounted through the same
   * MuseCard and sandbox path as in a thread. `toolId` picks one tool; `name` picks by name; with
   * neither, the newest. `readonly`: a preview of someone else's tool (taps are blocked).
   *
   * Lazy: the card mounts when it comes within about two screens of the visible part of its scroll
   * container and lets its frame go when it is more than about four screens away, keeping its last
   * height so nothing above the reader moves. The Home feed carries 25 live tools.
   */
  type Props = { backingKey: string; toolId?: string; name?: string; readonly?: boolean; subtitle?: string };
  let { backingKey, toolId, name, readonly = false, subtitle = "Made with Muse" }: Props = $props();

  const tools = $derived(store.surfaceTools(backingKey));
  const tool = $derived(toolId ? tools.find((t) => t.id === toolId) : name ? tools.findLast((t) => t.name === name) : tools.at(-1));

  let box: HTMLElement | undefined = $state();
  let near = $state(false);
  /** the height last shown, held while away and while a frame comes back */
  let held = $state<number | null>(null);

  function scroller(el: HTMLElement): HTMLElement | null {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
    }
    return null;
  }

  $effect(() => {
    const el = box;
    if (!el || typeof IntersectionObserver === "undefined") {
      near = true;
      return;
    }
    const root = scroller(el);
    const h = (root?.clientHeight ?? window.innerHeight) || 800;
    const come = new IntersectionObserver(([e]) => e?.isIntersecting && (near = true), { root, rootMargin: `${2 * h}px 0px` });
    const go = new IntersectionObserver(
      ([e]) => {
        if (e && !e.isIntersecting && near) {
          held = el.offsetHeight || held;
          near = false;
        }
      },
      { root, rootMargin: `${4 * h}px 0px` },
    );
    come.observe(el);
    go.observe(el);
    return () => {
      come.disconnect();
      go.disconnect();
    };
  });

  // Once the remounted frame reports its size, the held height lets go.
  $effect(() => {
    const el = box;
    if (!el || !near || held === null) return;
    const ro = new ResizeObserver(() => {
      if (el.querySelector('[data-live="ready"]') || !el.querySelector("[data-muse-card][data-live]")) held = null;
    });
    ro.observe(el);
    const t = setTimeout(() => (held = null), 8000);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  });
</script>

{#if tool}
  <div class="wrap" class:ro={readonly} inert={readonly} data-surface-tool={tool.id} data-near={near ? "" : undefined} bind:this={box} style:height={held !== null ? `${held}px` : undefined} style:min-height={!near && held === null ? "var(--muse-body-h)" : undefined}>
    {#if near}
      <MuseCard appId={tool.building ? "building" : "live"} title={tool.name} {subtitle} toolId={tool.building ? undefined : tool.id} building={tool.building} live={!!store.live && !tool.building} preview={readonly && !store.live} {readonly} />
    {/if}
    {#if readonly}<span class="shield" aria-hidden="true"></span>{/if}
  </div>
{/if}

<style>
  .wrap { position: relative; overflow-anchor: none; }
  .wrap[style*="height"] { overflow: hidden; }
  .shield { position: absolute; inset: 0; border-radius: var(--r-rich-card); }
</style>
