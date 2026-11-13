<script lang="ts">
  import { onMount } from "svelte";
  import { api, type Summary } from "./api.ts";

  let { onback }: { onback: () => void } = $props();
  let s = $state<Summary | null>(null);
  let failed = $state(false);
  onMount(() => {
    api.summary().then((x) => (s = x), () => (failed = true));
  });
  const learned = $derived(s?.lines.filter((l) => l.confidence === "strong" || l.confidence === "likely") ?? []);
  const priors = $derived(s?.lines.filter((l) => l.confidence === "prior") ?? []);
  // One line per tool, screen or transition would bury the rest; those show up once they have a lean.
  const open = $derived(s?.lines.filter((l) => l.confidence === "none" && !/^(tool\.piece|screen\.view|motion\.transition)=/.test(l.feature)) ?? []);
  const chip = { strong: "Strong", likely: "Likely", prior: "Prior", none: "" } as const;
  const cap = (t: string) => t[0]!.toUpperCase() + t.slice(1);
</script>

<section class="sum" aria-labelledby="sum-title">
  <header>
    <button class="back" onclick={onback} aria-label="Back to judging">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <h1 id="sum-title">What you like</h1>
  </header>
  {#if failed}
    <p class="meta">Couldn't load. Check the server</p>
  {:else if !s}
    <p class="meta">Loading</p>
  {:else}
    <p class="meta">{s.judgments} judgments</p>
    {#if learned.length}
      <h2>From your swipes</h2>
      <ul>
        {#each learned as l (l.feature)}
          <li><span>{cap(l.phrase)}</span><em class={l.confidence}>{chip[l.confidence]}</em></li>
        {/each}
      </ul>
    {/if}
    {#if priors.length}
      <h2>From what you said, not tested yet</h2>
      <ul>
        {#each priors as l (l.feature)}
          <li><span>{cap(l.phrase)}</span><em class="prior">{chip.prior}</em></li>
        {/each}
      </ul>
    {/if}
    {#if s.best.length}
      <h2>Best line so far</h2>
      <ul>
        {#each s.best as b (b.group)}
          <li><span>{b.text}</span><em class="prior">{b.comparisons} {b.comparisons === 1 ? "pair" : "pairs"}</em></li>
        {/each}
      </ul>
    {/if}
    {#if open.length}
      <h2>No clear preference yet</h2>
      <p class="open">{cap(open.map((l) => l.family).join(", "))}</p>
    {/if}
  {/if}
</section>

<style>
  .sum {
    width: 100%;
    max-width: 560px;
    margin: 0 auto;
    padding: 8px 16px 32px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 52px;
  }
  .back {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    margin-left: -10px;
  }
  .back:hover {
    background: var(--hover);
  }
  h1 {
    margin: 0;
    font-size: 20px;
    line-height: 24px;
    font-weight: 700;
  }
  h2 {
    margin: 20px 0 8px;
    font-size: 15px;
    line-height: 20px;
    font-weight: 600;
  }
  .meta,
  .open {
    margin: 0;
    color: var(--secondary);
    font-size: 13px;
    line-height: 18px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    background: var(--card);
    border-radius: 12px;
    overflow: hidden;
  }
  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
    padding: 10px 12px;
  }
  li + li {
    border-top: 1px solid var(--divider);
  }
  li span {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  em {
    flex: none;
    font-style: normal;
    font-size: 12px;
    line-height: 16px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 99px;
    background: var(--secondary-button);
    color: var(--text);
  }
  em.strong {
    background: var(--primary);
    color: var(--on-primary);
  }
</style>
