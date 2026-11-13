<script lang="ts">
  import { onMount } from "svelte";
  import Avatar from "../../components/Avatar.svelte";
  import Icon from "../../components/Icon.svelte";
  import MuseMark from "../../components/MuseMark.svelte";
  import { compact, names } from "../../lib/format";
  import { store } from "../../store";
  import { ME } from "../../store/types";
  import SurfaceToolCard from "../../surfaces/components/SurfaceToolCard.svelte";
  import { who } from "../../surfaces/flows.svelte";
  import { ago } from "../../surfaces/time";
  import { compose, postKey, type HomePost } from "../compose-live.svelte";
  import Comments from "../../surfaces/components/Comments.svelte"; // comments
  import { comments } from "../../surfaces/comments-live.svelte"; // comments
  import { ui } from "../../lib/ui.svelte"; // comments
  import HomePostOffers from "./HomePostOffers.svelte"; // reader

  /**
   * Home hook (surfaces/components/Home.svelte): posts made from the composer, newest first, for
   * everyone. A post with a tool shows it live under the text, "Made with Muse · on this post",
   * and "Use for my group". Likes are the feed room's reactions.
   */
  onMount(() => compose.connect());
  let now = $state(Date.now());
  onMount(() => {
    const t = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(t);
  });

  const when = (p: HomePost) => (now - p.at < 60_000 ? "Just now" : ago(now - p.at));
  const likers = (p: HomePost) => {
    const firsts = p.likes.map((id) => (id === ME ? "You" : (who(id)?.first ?? id)));
    return firsts.length <= 2 ? names(firsts) : `${firsts[0]} and ${firsts.length - 1} others`;
  };
</script>

{#each compose.posts as p (p.id)}
  {@const by = who(p.by)}
  {@const tool = store.surfaceTools(postKey(p.id)).at(-1)}
  {@const mine = p.likes.includes(ME)}
  <article class="post fb-card" aria-label={`Post by ${by?.name}`} data-post={p.id} data-home-post>
    <header class="head">
      <Avatar person={by} size="var(--fb-post-avatar)" />
      <div class="who">
        <p class="fb-name">{by?.name}</p>
        <p class="fb-meta">{when(p)} · <span class="priv"><Icon name="people" /></span></p>
      </div>
      <button class="hb" aria-disabled="true" title="Not in this prototype" aria-label="More"><Icon name="more_dots_post_header" /></button>
    </header>
    <p class="fb-body text">{p.text}</p>
    {#if tool}
      <section class="attach" aria-label={tool.name}>
        {#if tool.building}
          <p class="credit" data-post-making><MuseMark size="var(--sp-16)" spin /><span class="ct"><strong>Muse is conjuring a Mini for this</strong></span></p>
        {:else}
          <p class="credit"><MuseMark size="var(--sp-16)" /><span class="ct"><strong>Made with Muse</strong> · on this post</span></p>
        {/if}
        <SurfaceToolCard backingKey={postKey(p.id)} toolId={tool.id} subtitle="Made with Muse · on this post" />
        {#if !tool.building && tool.users}<p class="fb-meta" data-post-used={tool.users}>{tool.users === 1 ? "1 person used it" : `${tool.users} people used it`}</p>{/if}
        {#if !tool.building && compose.offerFor(p, tool.name)}
          <button class="btn use" onclick={() => compose.useForGroup(p, tool.name)}>Use for my group</button>
        {/if}
      </section>
    {:else if !p.pending}
      <HomePostOffers post={p} /><!-- reader: what Muse could make from this post, usually nothing -->
    {/if}
    {#if p.likes.length}
      <p class="likes" data-post-likes={p.likes.length}><span class="rx" aria-hidden="true"><Icon name="reaction_like" /></span><span class="fb-meta">{likers(p)}</span></p>
    {/if}
    <footer class="bar">
      <button class="act" class:on={mine} aria-pressed={mine} aria-label={`Like, ${p.likes.length}`} onclick={() => compose.like(p.id)}><Icon name="fbs_like" /><span>{p.likes.length ? compact(p.likes.length) : "Like"}</span></button>
      <button class="act" aria-label={`Comment, ${comments.count(p.id)}`} onclick={() => comments.open({ id: p.id, likes: p.likes.length })}><Icon name="fbs_comment" /><span>{comments.count(p.id) ? compact(comments.count(p.id)) : "Comment"}</span></button>
      <button class="act" aria-disabled="true" title="Not in this prototype" aria-label="Share"><Icon name="fbs_share" /><span>Share</span></button>
    </footer>
    {#if ui.desktop && comments.isInline(p.id)}<Comments target={{ id: p.id, likes: p.likes.length }} inline />{/if}<!-- comments -->
  </article>
{/each}

<style>
  .head { display: flex; align-items: center; gap: var(--sp-8); padding: var(--sp-12) var(--sp-4) 0 var(--sp-12); }
  .who { flex: 1; min-width: 0; }
  .who .fb-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .priv { display: inline-flex; vertical-align: -1px; --icon-size: var(--sp-12); }
  .hb { width: var(--sp-36); height: var(--sp-36); border-radius: var(--r-round); display: inline-flex; align-items: center; justify-content: center; color: var(--c-text-2); --icon-size: var(--sp-20); flex: none; }
  .text { padding: var(--sp-8) var(--sp-12) var(--sp-12); white-space: pre-line; }
  .attach { display: flex; flex-direction: column; gap: var(--sp-8); padding: 0 var(--sp-12) var(--sp-12); }
  .credit { display: flex; align-items: center; gap: var(--sp-6); font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  .credit strong { font-weight: var(--fw-semibold); color: var(--c-text); }
  .ct { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .use { align-self: flex-start; }
  .likes { display: flex; align-items: center; gap: var(--sp-6); padding: 0 var(--sp-12) var(--sp-8); }
  .rx { display: inline-flex; width: var(--sp-20); height: var(--sp-20); --icon-size: var(--sp-20); }
  .bar { display: flex; align-items: center; height: var(--fb-action-h); padding: 0 var(--sp-4); border-top: 1px solid var(--c-divider); margin: 0 var(--sp-12); }
  .act { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: var(--sp-6); height: var(--sp-36); border-radius: var(--r-button); color: var(--c-text-2); font-size: var(--fs-meta); line-height: var(--lh-meta); font-weight: var(--fw-semibold); --icon-size: var(--sp-20); }
  .act.on { color: var(--c-btn-soft-text); }
  .act:not([aria-disabled]):active { background: var(--c-hover); }
</style>
