<script lang="ts">
  import type { Person } from "../store/types";
  import Avatar from "./Avatar.svelte";
  import { pxOf } from "../lib/media";

  let {
    people,
    size = "var(--avatar-row)",
    active = false,
  }: { people: (Person | undefined)[]; size?: string; active?: boolean } = $props();
  const face = $derived(Math.round(pxOf(size) * 0.54));
</script>

<span class="group" style:--g={size}>
  <span class="back"><Avatar person={people[0]} size="calc(var(--g) * 0.54)" px={face} /></span>
  <span class="front"><Avatar person={people[1]} size="calc(var(--g) * 0.54)" px={face} ring /></span>
  {#if active}<span class="dot" aria-hidden="true"></span>{/if}
</span>

<style>
  .group { position: relative; display: inline-block; flex: none; width: var(--g); height: var(--g); }
  .back { position: absolute; top: 0; right: 0; }
  .front { position: absolute; bottom: 0; left: 0; }
  .dot {
    position: absolute;
    right: 0;
    bottom: 0;
    width: var(--dot-active);
    height: var(--dot-active);
    border-radius: var(--r-round);
    background: var(--c-active);
    border: var(--dot-active-ring) solid var(--c-bg);
    transform: scale(clamp(0.6, calc(var(--g) / var(--avatar-row)), 1));
    transform-origin: bottom right;
  }
</style>
