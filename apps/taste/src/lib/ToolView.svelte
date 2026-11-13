<script lang="ts">
  // A whole tool, live in the sandbox. He can tap it before judging; any action counts as
  // interacting. Celebration and arrival motion are drawn here, around the frame.
  import { onMount } from "svelte";
  import { spring, springs, tween } from "@muse/app";
  import type { Member } from "@muse/protocol";
  import type { ToolKnobs } from "@muse/taste";
  import { mountTool, themeFor } from "./live.ts";

  let { code, me, members, knobs, script, oninteract }: { code: string; me: string; members: Member[]; knobs: ToolKnobs; script: { user: string; action: unknown }[]; oninteract: () => void } = $props();

  let box: HTMLDivElement;
  let slot: HTMLDivElement;
  let burst: HTMLCanvasElement;
  let flash = $state(false);
  let failed = $state("");
  const t = $derived(themeFor(knobs, 390));

  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  function arrive() {
    if (knobs.motion === "none" || reduced()) return;
    const m = knobs.motion === "springy" ? spring(springs.iosBouncy) : tween({ duration: 280, easing: "enter" });
    const t0 = performance.now();
    const step = () => {
      if (!slot) return;
      const e = performance.now() - t0;
      const p = m(e);
      const o = Math.min(1, e / 160);
      slot.style.transform = knobs.motion === "springy" ? `scale(${0.92 + 0.08 * p})` : `translateY(${(1 - p) * 16}px)`;
      slot.style.opacity = String(o);
      if (e < m.duration) requestAnimationFrame(step);
      else slot.style.transform = "";
    };
    slot.style.opacity = "0";
    requestAnimationFrame(step);
  }

  function celebrate() {
    if (knobs.celebrate === "none" || reduced() || !burst || !box) return;
    if (knobs.celebrate === "color") {
      flash = true;
      setTimeout(() => (flash = false), 700);
      return;
    }
    const g = burst.getContext("2d");
    if (!g) return;
    const w = (burst.width = box.clientWidth * devicePixelRatio);
    const h = (burst.height = box.clientHeight * devicePixelRatio);
    const colors = [t.color.series1, t.color.series2, t.color.series3, t.color.series4, t.color.series6];
    const parts = Array.from({ length: 28 }, (_, i) => ({ a: (i / 28) * Math.PI * 2, v: 0.6 + ((i * 37) % 10) / 10, c: colors[i % colors.length]! }));
    const t0 = performance.now();
    const step = () => {
      const e = (performance.now() - t0) / 700;
      g.clearRect(0, 0, w, h);
      if (e >= 1) return;
      for (const p of parts) {
        const r = (1 - (1 - e) ** 3) * Math.min(w, h) * 0.32 * p.v;
        g.globalAlpha = 1 - e;
        g.fillStyle = p.c;
        g.beginPath();
        g.arc(w / 2 + Math.cos(p.a) * r, h * 0.45 + Math.sin(p.a) * r, 4 * devicePixelRatio, 0, Math.PI * 2);
        g.fill();
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  onMount(() => {
    const width = Math.max(320, Math.min(420, Math.floor(box.clientWidth - 16)));
    let acted = 0;
    const m = mountTool(slot, { code, me, members, knobs, width, script }, {
      act: () => {
        oninteract();
        // Celebrate once the server has confirmed it, not on the optimistic tap.
        const n = ++acted;
        setTimeout(() => n === acted && celebrate(), 160);
      },
      error: (msg) => (failed = msg),
    });
    arrive();
    return () => m.destroy();
  });
</script>

<div class="backdrop" class:dark={knobs.mode === "dark"} bind:this={box} style:--tool-wash={t.color.wash} style:--tool-flash={t.color.selected}>
  <div class="slot" class:flash bind:this={slot} style:border-radius="{t.radius.card}px"></div>
  <canvas class="burst" bind:this={burst} aria-hidden="true"></canvas>
  {#if failed}<p class="err">This tool did not load</p>{/if}
</div>

<style>
  .backdrop {
    position: relative;
    width: 100%;
    display: flex;
    justify-content: center;
    padding: 8px;
    border-radius: 16px;
    background: var(--tool-wash);
    overflow: hidden;
  }
  .slot {
    overflow: hidden;
    max-width: 100%;
    transition: box-shadow 0.6s;
  }
  .slot :global(iframe) {
    display: block;
  }
  .slot.flash {
    box-shadow: 0 0 0 3px var(--tool-flash), 0 0 0 6px var(--tool-flash);
  }
  .burst {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .err {
    color: var(--secondary);
    font-size: 13px;
  }
</style>
