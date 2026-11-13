<script lang="ts">
  import type { Story } from "../../surfaces/data";
  import { catalyst } from "../catalyst.svelte";
  import { storyContext } from "../context";
  import { nameOf } from "../page";
  import MuseAsk from "./MuseAsk.svelte";
  import MuseSuggest from "./MuseSuggest.svelte";
  import PageTools from "./PageTools.svelte";

  /**
   * Story viewer hooks (surfaces/components/StoryViewer.svelte). `part="offers"`: what Muse can make
   * from this story (a poll that ended, a trip a year ago). `part="ask"`: the Muse field in the
   * viewer's bottom bar.
   */
  let { s, part }: { s: Story; part: "offers" | "ask" } = $props();
  const ctx = $derived.by(() => {
    const p = s.poll;
    const win = p ? [...p.options].sort((a, b) => b.voters.length + b.others - (a.voters.length + a.others))[0] : undefined;
    return storyContext(s, { nameOf, ...(p && win ? { poll: { question: p.question, winner: win.label, voters: win.voters, place: p.place, when: p.when, ended: p.ended } } : {}) });
  });
  const offers = $derived(catalyst.suggest(ctx));
</script>

{#if part === "offers"}
  <div class="card"><PageTools {ctx} credit="for this story" /></div>
  <MuseSuggest items={offers} ontake={(x) => catalyst.take(ctx, x)} ondismiss={(ids) => catalyst.dismiss(ids)} tone="media" />
{:else}
  <MuseAsk tone="media" placeholder="Ask Muse about this story" onask={(t) => catalyst.ask(ctx, t)} />
{/if}

<style>
  /* On the story's photo: the tool and its credit sit on the page surface, full width. */
  .card { padding: var(--sp-12); border-radius: var(--r-rich-card); background: var(--c-bg); color: var(--c-text); box-shadow: var(--sh-float); }
  .card:not(:has([data-surface-tool])) { display: none; }
</style>
