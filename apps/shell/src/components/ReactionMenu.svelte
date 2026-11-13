<script lang="ts">
  import { onMount } from "svelte";
  import { tokenMs } from "../phone/motion"; // phone
  import { REACTION_SET } from "../store/types";

  type Props = {
    anchor: HTMLElement;
    outgoing: boolean;
    mine: string | undefined;
    onpick: (emoji: string) => void;
    onclose: () => void;
  };
  let { anchor, outgoing, mine, onpick, onclose }: Props = $props();

  // phone: release reverses quickly (0 ms on desktop)
  let closing = $state(false);
  function leave(then: () => void) {
    const ms = tokenMs("--m-menu-out-dur");
    if (!ms || closing) return ms ? undefined : then();
    closing = true;
    setTimeout(then, ms);
  }

  let bar: HTMLElement | undefined = $state();
  let ghost: HTMLElement | undefined = $state();
  let barPos = $state({ left: 0, top: 0 });
  let rect = $state({ left: 0, top: 0, width: 0, height: 0 });

  onMount(() => {
    const r = anchor.getBoundingClientRect();
    rect = { left: r.left, top: r.top, width: r.width, height: r.height };
    // lift a copy of the bubble above the scrim
    const clone = anchor.cloneNode(true) as HTMLElement;
    clone.removeAttribute("data-id");
    clone.querySelectorAll(".actions").forEach((n) => n.remove());
    clone.classList.remove("fresh");
    const row = getComputedStyle(anchor.closest(".row")!);
    for (const v of ["--tl", "--tr", "--bl", "--br"]) clone.style.setProperty(v, row.getPropertyValue(v));
    ghost?.replaceChildren(clone);

    const bw = bar?.offsetWidth ?? 0;
    const bh = bar?.offsetHeight ?? 0;
    const margin = 8;
    let left = outgoing ? r.right - bw : r.left;
    left = Math.max(margin, Math.min(left, innerWidth - bw - margin));
    const above = r.top - bh - margin;
    const top = above >= margin ? above : r.bottom + margin;
    barPos = { left, top };
    bar?.querySelector<HTMLElement>("button")?.focus();

    const key = (e: KeyboardEvent) => e.key === "Escape" && leave(onclose);
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" class:closing onclick={() => leave(onclose)} data-reaction-menu>
  <div class="ghost" class:out={outgoing} bind:this={ghost} style:left={`${rect.left}px`} style:top={`${rect.top}px`} style:width={`${rect.width}px`}></div>
  <div
    class="bar"
    role="toolbar"
    tabindex="-1"
    aria-label="Reactions"
    bind:this={bar}
    style:left={`${barPos.left}px`}
    style:top={`${barPos.top}px`}
    onclick={(e) => e.stopPropagation()}
  >
    {#each REACTION_SET as e, i (e)}
      <button
        class:on={mine === e}
        style:--i={i}
        aria-label={`${mine === e ? "Remove" : "React with"} ${e}`}
        aria-pressed={mine === e}
        onclick={() => leave(() => onpick(e))}
      >{e}</button>
    {/each}
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: var(--c-scrim);
    -webkit-backdrop-filter: blur(var(--blur-glass));
    backdrop-filter: blur(var(--blur-glass));
    animation: fade var(--dur-xs-in) var(--ease-linear) both;
  }
  .ghost { position: fixed; pointer-events: none; display: flex; }
  .ghost.out { justify-content: flex-end; }
  .ghost :global(.stack) { max-width: 100%; }
  .bar {
    position: fixed;
    display: flex;
    gap: var(--sp-2);
    padding: var(--sp-4);
    background: var(--c-bg);
    border-radius: var(--r-pill);
    box-shadow: var(--sh-float);
    box-shadow: var(--sh-float), inset 0 0 0 1px var(--c-hairline);
    animation: rise var(--dur-short-in) var(--ease-enter) both;
  }
  .bar button {
    width: var(--react-bar-btn);
    height: var(--react-bar-btn);
    border-radius: var(--r-round);
    font-size: var(--fs-emoji-bar);
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    animation: rise var(--dur-short-in) var(--ease-enter) both;
    animation-delay: calc(var(--i) * var(--dur-xxs) / 5);
    transition: transform var(--dur-xs) var(--ease-press);
  }
  .bar button:hover { transform: scale(1.25); }
  .bar button.on { background: var(--c-selected); }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes rise { from { opacity: 0; transform: translateY(var(--sp-8)) scale(0.9); } to { opacity: 1; transform: none; } }
</style>
