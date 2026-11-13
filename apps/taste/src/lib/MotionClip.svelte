<script lang="ts">
  // One small transition under one curve, rendered live with @muse/app's tween/spring. Plays on
  // show, holds, and plays again. Tap to replay (counts as interacting).
  import { onMount } from "svelte";
  import { spring, tween, type Motion } from "@muse/app";

  type Curve = { kind: "bezier"; p: [number, number, number, number]; duration: number } | { kind: "spring"; stiffness: number; damping: number; mass: number };
  let { transition, curve, oninteract }: { transition: string; curve: Curve; oninteract: () => void } = $props();

  const motion: Motion = $derived(curve.kind === "bezier" ? tween({ duration: curve.duration, easing: curve.p }) : spring({ stiffness: curve.stiffness, damping: curve.damping, mass: curve.mass }));
  let p = $state(0);
  let t0 = 0;
  let raf = 0;
  let wait: ReturnType<typeof setTimeout> | undefined;

  function play() {
    cancelAnimationFrame(raf);
    clearTimeout(wait);
    p = 0;
    wait = setTimeout(() => {
      t0 = performance.now();
      const step = () => {
        const e = performance.now() - t0;
        p = motion(e);
        if (e < motion.duration) raf = requestAnimationFrame(step);
        else wait = setTimeout(play, 1100);
      };
      raf = requestAnimationFrame(step);
    }, 450);
  }
  onMount(() => {
    play();
    return () => (cancelAnimationFrame(raf), clearTimeout(wait));
  });
  const replay = () => (oninteract(), play());
  const label: Record<string, string> = { card: "A card arriving in the chat", bar: "A vote bar filling", wheel: "A wheel settling on a name", row: "A row being claimed" };
</script>

<button class="stage" onclick={replay} aria-label="{label[transition] ?? 'Motion'}. Tap to replay">
  {#if transition === "card"}
    <div class="bubble">ok who's in for saturday</div>
    <div class="card" style:transform="translateY({(1 - p) * 40}px) scale({0.94 + 0.06 * p})" style:opacity={Math.min(1, Math.max(0, p * 1.6))}>
      <div class="head"><span class="mark"></span><b>Who's in</b></div>
      <div class="bar"><i style:width="60%"></i></div>
      <small>3 of 5 in</small>
    </div>
  {:else if transition === "bar"}
    <div class="card">
      <div class="opt">
        <span>Tacos</span><em>{p > 0.5 ? 3 : 2}</em>
        <i class="fill" style:width="{30 + 30 * p}%"></i>
      </div>
      <div class="opt"><span>Pho</span><em>1</em><i class="fill dim" style:width="20%"></i></div>
    </div>
  {:else if transition === "wheel"}
    <div class="wheelbox">
      <span class="pin" aria-hidden="true"></span>
      <svg viewBox="-50 -50 100 100" width="168" height="168" style:transform="rotate({p * 1170}deg)" aria-hidden="true">
        {#each ["#0866FF", "#F7B928", "#31A24C", "#F33E58"] as c, i (i)}
          <path d="M0 0 L{48 * Math.cos((i * Math.PI) / 2)} {48 * Math.sin((i * Math.PI) / 2)} A48 48 0 0 1 {48 * Math.cos(((i + 1) * Math.PI) / 2)} {48 * Math.sin(((i + 1) * Math.PI) / 2)} Z" fill={c} />
        {/each}
        <circle r="8" fill="white" />
      </svg>
    </div>
  {:else}
    <div class="card">
      <div class="claim" style:background-color="color-mix(in srgb, var(--primary) {Math.round(Math.min(1, Math.max(0, p)) * 12)}%, var(--wash))">
        <span>Drinks</span>
        <span class="av" style:transform="translateX({(1 - p) * 60}px)" style:opacity={Math.min(1, Math.max(0, p * 2))}>M</span>
      </div>
      <div class="claim"><span>Napkins</span></div>
    </div>
  {/if}
</button>

<style>
  .stage {
    width: 100%;
    min-height: 260px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    border-radius: 16px;
    background: var(--wash);
    padding: 16px;
    overflow: hidden;
    cursor: pointer;
  }
  .bubble {
    align-self: flex-start;
    background: var(--secondary-button);
    border-radius: 18px;
    padding: 8px 12px;
  }
  .card {
    width: 100%;
    max-width: 300px;
    background: var(--card);
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: left;
    box-shadow: var(--shadow);
  }
  .head {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .mark {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: conic-gradient(from 200deg, #0866ff, #a033ff, #ff5c87, #0866ff);
  }
  .bar {
    height: 6px;
    border-radius: 3px;
    background: var(--secondary-button);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--primary);
  }
  small {
    color: var(--secondary);
    font-size: 13px;
  }
  .opt {
    position: relative;
    display: flex;
    justify-content: space-between;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--wash);
    overflow: hidden;
  }
  .opt span,
  .opt em {
    position: relative;
    z-index: 1;
    font-style: normal;
    font-weight: 600;
  }
  .fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: color-mix(in srgb, var(--primary) 22%, transparent);
  }
  .fill.dim {
    background: color-mix(in srgb, var(--secondary) 18%, transparent);
  }
  .wheelbox {
    position: relative;
    padding-top: 14px;
  }
  .pin {
    position: absolute;
    left: 50%;
    top: 0;
    transform: translateX(-50%);
    border: 10px solid transparent;
    border-top: 16px solid var(--text);
    z-index: 1;
  }
  .claim {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 44px;
    padding: 0 12px;
    border-radius: 8px;
    background: var(--wash);
    font-weight: 600;
    overflow: hidden;
  }
  .av {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #7b4fd6;
    color: #fff;
    display: grid;
    place-items: center;
    font-size: 13px;
  }
</style>
