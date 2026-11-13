<script lang="ts">
  import { catalyst } from "../catalyst.svelte";
  import { postContext } from "../context";
  import { nameOf } from "../page";
  import { FEED_POSTS } from "../seed";
  import MuseSuggest from "./MuseSuggest.svelte";
  import PageTools from "./PageTools.svelte";

  /**
   * Feed post hook (surfaces/components/PostCard.svelte): tools friends made on this post, and,
   * once you like it, what Muse could make from what the post is about. Nothing appears for
   * scrolling past.
   */
  let { id, liked, skip = [] }: { id: string; liked: boolean; /** tools the post already shows */ skip?: string[] } = $props();
  const post = $derived(FEED_POSTS.find((p) => p.id === id));
  const ctx = $derived(post ? postContext(post, { liked, nameOf }) : null);
  const offers = $derived(ctx ? catalyst.suggest(ctx, 1) : []);
  // "Made with Muse · for <name>'s 21st": who the tool on this post is for (seed.ts credit), names from the cast
  const credit = $derived(post?.credit ? post.credit.replace("{by}", nameOf(post.by)).replace("{subject}", post.subject ? nameOf(post.subject) : "") : "on this post");
</script>

{#if ctx}
  <div class="cat">
    <PageTools {ctx} {credit} {skip} />
    <MuseSuggest items={offers} ontake={(s) => catalyst.take(ctx, s)} ondismiss={(ids) => catalyst.dismiss(ids)} />
  </div>
{/if}

<style>
  .cat { display: flex; flex-direction: column; gap: var(--sp-12); padding: 0 var(--sp-12); }
  .cat { padding-bottom: var(--sp-12); }
  .cat:not(:has(:global(*))) { display: none; }
</style>
