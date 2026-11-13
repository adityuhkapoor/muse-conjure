<script lang="ts">
  import { tick } from "svelte";
  import { fb } from "../fbnav.svelte";
  import { FEED, isModule } from "../data";
  import Unprompted from "../../muse/components/Unprompted.svelte"; // catalysts
  import ComposerCard from "./ComposerCard.svelte";
  import ComposedPosts from "../../muse/components/ComposedPosts.svelte"; // compose
  import FeedModule from "./FeedModule.svelte";
  import PostCard from "./PostCard.svelte";
  import StoriesTray from "./StoriesTray.svelte";

  /** Home feed: composer, stories, then friends' posts (many carrying a live tool), pages and modules. */
  let feed: HTMLElement | undefined = $state();
  $effect(() => {
    const id = fb.focusPost;
    if (!id || !feed) return;
    fb.focusPost = null;
    tick().then(() => feed?.querySelector(`[data-post="${id}"]`)?.scrollIntoView({ block: "start" }));
  });
</script>

<div class="feed" bind:this={feed}>
  <ComposerCard />
  <Unprompted place="home" /><!-- catalysts: timed offers, only when switched on -->
  <StoriesTray />
  <ComposedPosts /><!-- compose: posts made from the composer, newest first -->
  {#each FEED as item (item.id)}
    {#if isModule(item)}<FeedModule {item} />{:else}<PostCard post={item} />{/if}
  {/each}
  <p class="end">You're all caught up</p>
</div>

<style>
  .feed { display: flex; flex-direction: column; }
  :global(:root[data-layout="desktop"]) .feed { gap: var(--fb-card-gap); }
  .end { padding: var(--sp-16); text-align: center; font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
</style>
