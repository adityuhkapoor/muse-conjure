<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import { exitMs, sheetDrag } from "../phone/sheet"; // phone: exit animation and drag to dismiss

  /**
   * Bottom sheet on phone, centred dialog on desktop. Frosted light backdrop (DS: dialogs use a light
   * frosted backdrop). Fills the nearest positioned ancestor, so it stays inside the page that opened it.
   */
  /** `tall`: rises to nearly full height and does not scroll itself (a pinned footer and its own list, as the comments view has). */
  type Props = { label: string; onclose: () => void; children: Snippet; busy?: boolean; tall?: boolean; /** desktop: a roomier dialog (about 560 wide, up to 80% of the window high, scrolling inside) */ wide?: boolean };
  let { label, onclose, children, busy = false, tall = false, wide = false }: Props = $props();

  let panel: HTMLElement | undefined = $state();
  let scrim: HTMLElement | undefined = $state();
  let opener: Element | null = null;

  onMount(() => {
    opener = document.activeElement;
    const first = panel?.querySelector<HTMLElement>("button, [href], input, textarea, [tabindex]:not([tabindex='-1'])");
    (first ?? panel)?.focus();
    // Escape closes the top sheet wherever focus is (a tap on the page, a field that lost it)
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || busy || e.defaultPrevented) return;
      const all = document.querySelectorAll("[data-sheet]");
      if (all[all.length - 1] !== scrim) return;
      e.preventDefault();
      close();
    };
    addEventListener("keydown", esc);
    return () => {
      removeEventListener("keydown", esc);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  });

  // phone: a sheet plays its exit (0 ms on desktop) before it is removed
  let closing = $state(false);
  function close() {
    if (closing) return;
    const ms = exitMs();
    if (!ms) return onclose();
    closing = true;
    setTimeout(onclose, ms);
  }

  function key(e: KeyboardEvent) {
    // keep Tab inside the dialog
    if (e.key === "Tab" && panel) {
      const items = [...panel.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input, textarea, [tabindex]:not([tabindex='-1'])")];
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
      else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" class:closing bind:this={scrim} onclick={() => !busy && close()} onkeydown={key} data-sheet>
  <div class="panel" class:tall class:wide role="dialog" aria-modal="true" aria-label={label} tabindex="-1" bind:this={panel} use:sheetDrag={{ leave: onclose, enabled: () => !busy }} onclick={(e) => e.stopPropagation()}>
    <span class="handle" aria-hidden="true"></span>
    {@render children()}
  </div>
</div>

<style>
  .scrim {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    background: var(--c-scrim);
    -webkit-backdrop-filter: blur(var(--blur-sheet));
    backdrop-filter: blur(var(--blur-sheet));
    animation: fade var(--dur-xs-in) var(--ease-linear) both;
  }
  .panel {
    width: 100%;
    max-width: var(--sheet-max-w);
    max-height: var(--sheet-max-h);
    overflow-y: auto;
    background: var(--c-bg);
    color: var(--c-text);
    border-radius: var(--r-rich-card) var(--r-rich-card) 0 0;
    box-shadow: var(--sh-sheet);
    padding: var(--sp-8) var(--sp-16) calc(var(--sp-16) + var(--safe-bottom));
    outline: none;
    animation: rise var(--dur-short-in) var(--ease-enter) both;
  }
  .panel.tall {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: var(--sp-8) 0 0;
    max-height: none;
    height: calc(100% - var(--safe-top) - var(--sp-24) - var(--kb));
    margin-bottom: var(--kb);
  }
  .panel.tall .handle { flex: none; touch-action: none; }
  .handle {
    display: block;
    width: var(--sheet-handle-w);
    height: var(--sheet-handle-h);
    margin: 0 auto var(--sp-12);
    border-radius: var(--r-pill);
    background: var(--c-divider);
  }
  :global(:root[data-layout="desktop"]) .scrim { align-items: center; }
  :global(:root[data-layout="desktop"]) .panel { border-radius: var(--r-rich-card); padding-bottom: var(--sp-16); max-height: calc(100% - var(--sp-32)); }
  :global(:root[data-layout="desktop"]) .panel.wide { width: 560px; max-width: none; min-width: 560px; flex: none; max-height: 80vh; overflow-y: auto; }
  :global(:root[data-layout="desktop"]) .panel.tall { height: auto; max-height: calc(100% - var(--sp-32)); margin-bottom: 0; }
  :global(:root[data-layout="desktop"]) .handle { display: none; }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes rise { from { transform: translateY(var(--sp-48)); opacity: 0; } to { transform: none; opacity: 1; } }
</style>
