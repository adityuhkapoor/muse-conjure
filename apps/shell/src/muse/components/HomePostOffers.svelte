<script lang="ts">
  import { store } from "../../store";
  import { ME, type PersonId } from "../../store/types";
  import { castWithViewerFirst } from "../../store/cast";
  import { catalyst } from "../catalyst.svelte";
  import { nameOf } from "../page";
  import type { PageContext } from "../types";
  import MuseSuggest from "./MuseSuggest.svelte";

  /**
   * Offers on a post someone wrote at run time (ComposedPosts.svelte): the reader reads its text
   * the way a friend sees it, once you open Home and again once you like it. Most posts get
   * nothing; nothing shows then.
   */
  let { post }: { post: { id: string; by: PersonId; text: string; likes: PersonId[] } } = $props();
  const ctx = $derived.by((): PageContext => {
    const people = castWithViewerFirst();
    return {
      surface: "feed",
      object: { kind: "post", id: post.id },
      title: `${nameOf(post.by)}'s post`,
      facts: { by: nameOf(post.by), text: post.text },
      people,
      names: Object.fromEntries(people.map((id) => [id, nameOf(id)])),
      did: post.likes.includes(ME) ? ["liked"] : [],
    };
  });
  // your own post: the composer already offered its tools
  const offers = $derived(post.by === ME || store.surfaceTools(`surface:page:post:${post.id}`).length ? [] : catalyst.suggest(ctx, 1));
</script>

{#if offers.length}
  <div class="offers" data-reader-offers={post.id}>
    <MuseSuggest items={offers} ontake={(s) => catalyst.take(ctx, s)} ondismiss={(ids) => catalyst.dismiss(ids)} />
  </div>
{/if}

<style>
  .offers { padding: 0 var(--sp-12) var(--sp-12); }
</style>
