<script lang="ts">
  import { ui } from "../../lib/ui.svelte";
  import Cover from "../../components/Cover.svelte";
  import { hasPhoto } from "../../lib/photos";
  import { photo } from "@muse/assets";
  import Avatar from "../../components/Avatar.svelte";
  import Icon from "../../components/Icon.svelte";
  import MuseMark from "../../components/MuseMark.svelte";
  import { compact, names } from "../../lib/format";
  import { nav } from "../../lib/nav.svelte";
  import { GROUPS, listing, money, type Media, type Post, type Rx } from "../data";
  import { useForGroup, who } from "../flows.svelte";
  import { compose } from "../../muse/compose-live.svelte";
  import { isMe, nameOrYou, person, say } from "../say";
  import { ago } from "../time";
  import SurfaceToolCard from "./SurfaceToolCard.svelte";
  import Comments from "./Comments.svelte"; // comments
  import { comments } from "../comments-live.svelte"; // comments
  import PostCatalysts from "../../muse/components/PostCatalysts.svelte"; // catalysts
  import { openProfile } from "../profile-data"; // profile

  /**
   * Feed post card (MP section 1; IOS action row 45). Kinds: an ordinary post (text, photo, a post in
   * a group), a friend's post with a live tool in it (`live`: headline, the tool, who made it), and
   * Facebook's other post types: a memory, a friend's comment that brought a post here, a link, a
   * page or sponsored post, a shared event or listing, a life event, a share of another post.
   * `tool` and `bracket` are the older tool posts.
   */
  let { post }: { post: Post } = $props();

  const page = $derived(post.kind === "page" ? post.page : undefined);
  const by = $derived(page ? undefined : person(post.by));
  const authorName = $derived(page?.name ?? by?.name ?? "");
  const group = $derived(post.group ? GROUPS.find((g) => g.id === post.group) : undefined);
  // A picture that is not a real photo, or whose file does not load, is dropped: the post reads as text only,
  // never as a drawn placeholder (src/lib/cover.ts stays behind stories, reels and tiles).
  let deadPics = $state<string[]>([]);
  const showPic = (id: string) => hasPhoto(id) && !deadPics.includes(id);
  const failPic = (id: string) => { deadPics = [...deadPics, id]; };
  comments.connect(); // the feed room carries the likes and comments, so Home joins it
  const liked = $derived(comments.postLiked(post.id)); // likes: shared through the feed room, one per person
  const likes = $derived(comments.postLikeCount(post.id, post.likes));
  const nComments = $derived(comments.count(post.id)); // comments: the thread's own size
  const shares = $derived(post.shares);
  // the icons are the reactions that are there: none at zero, the post's own mix while it has its written likes, else just the like
  const rx = $derived<Rx[]>(likes <= 0 ? [] : post.likes > 0 ? (post.rx ?? ["like", "love"]).slice(0, 3) : ["like"]);
  const EMOJI: Record<Rx, string> = { like: "👍", love: "❤️", haha: "😆", wow: "😮", care: "🥰", sad: "😢" };
  const credit = (p: Extract<Post, { kind: "live" }>) => ("muse" in p.credit ? `Made with Muse · ${p.credit.muse}` : `${isMe(p.by) ? "You" : (by?.first ?? "")} made this · ${p.credit.usedBy === 1 ? "1 person" : compact(p.credit.usedBy)} used it`);
  const ratio = (m: Media) => {
    const ref = m.asset ? photo(m.asset, 393) : undefined;
    return ref ? `${ref.width} / ${ref.height}` : undefined;
  };
  const sold = $derived(post.kind === "listing" ? listing(post.listing) : undefined);
</script>

<article class="post fb-card" aria-label={`Post by ${authorName}`} data-post={post.id} data-kind={post.kind}>
  {#if post.kind === "activity"}
    <p class="above"><strong>{nameOrYou(post.actor)}</strong> commented on {isMe(post.by) ? "your" : `${by?.first}'s`} post</p>
  {:else if post.kind === "memory"}
    <p class="above"><span class="ico"><Icon name="pf_cake" /></span>{post.years} year{post.years === 1 ? "" : "s"} ago</p>
  {/if}
  <header class="head">
    {#if group}
      <button class="gav" aria-label={`Open ${group.name}`} onclick={() => nav.go({ kind: "fb", page: { name: "group", id: group.id } })}>
        <span class="gsq t{group.tone}" aria-hidden="true"><Cover id={group.cover} width={36} alt="" /></span>
        <span class="gp"><Avatar person={by} size="var(--group-poster-avatar)" ring /></span>
      </button>
      <div class="who">
        <button class="fb-name gname" onclick={() => nav.go({ kind: "fb", page: { name: "group", id: group.id } })}>{group.name}</button>
        <p class="fb-meta"><button class="pn" onclick={() => openProfile(post.by)}>{by?.name}</button> · {ago(post.ago)} · <span class="priv"><Icon name="privacy_private_group_12" /></span></p><!-- profile -->
      </div>
    {:else if page}
      <span class="pgav t{page.tone}" aria-hidden="true">{page.name.slice(0, 1)}</span>
      <div class="who">
        <p class="fb-name">{page.name}</p>
        <p class="fb-meta">{page.sponsored ? "Sponsored" : ago(post.ago)} · <span class="priv"><Icon name="globe_public_12" /></span></p>
      </div>
    {:else}
      <button class="pav" aria-label={`${by?.name}'s profile`} onclick={() => openProfile(post.by)}><Avatar person={by} size="var(--fb-post-avatar)" /></button><!-- profile -->
      <div class="who">
        <p class="fb-name nm"><button class="nmb" onclick={() => openProfile(post.by)}>{by?.name}</button>{#if post.kind === "memory"}<span class="with">{" "}is with {names(post.with.map((w) => (isMe(w) ? "you" : (person(w)?.name ?? w))))}</span>{:else if post.kind === "life"}<span class="with">{" "}· {post.life.title.toLowerCase()}</span>{:else if post.kind === "share"}<span class="with">{" "}shared a post</span>{/if}</p><!-- profile -->
        <p class="fb-meta">{ago(post.ago)} · <span class="priv"><Icon name="globe_public_12" /></span></p>
      </div>
    {/if}
    <button class="hb" aria-disabled="true" title="Not in this prototype" aria-label="More"><Icon name="more_dots_post_header" /></button>
    <button class="hb" aria-disabled="true" title="Not in this prototype" aria-label="Hide post"><Icon name="close" /></button>
  </header>

  {#if post.text}<p class="fb-body text">{say(post.text)}</p>{:else}<span class="gap" aria-hidden="true"></span>{/if}

  {#if post.kind === "memory"}
    <div class="inner">
      <p class="fb-meta ih"><Avatar person={by} size="var(--avatar-facepile-sm)" /> <strong>{by?.name}</strong> · Nov 11, 2025</p>
      <p class="fb-body itext">{post.original}</p>
      {#if post.media && showPic(post.media.asset ?? post.id)}<span class="fb-media photo t{post.media.tone}" style:aspect-ratio={ratio(post.media) ?? "4 / 3"}><Cover id={post.media.asset ?? post.id} width={ui.desktop ? 680 : 393} alt={post.media.label} onfail={() => failPic(post.media!.asset ?? post.id)} /></span>{/if}
    </div>
  {:else if post.kind === "share"}
    {@const ib = person(post.inner.by)}
    <div class="inner">
      <p class="fb-meta ih"><Avatar person={ib} size="var(--avatar-facepile-sm)" /> <strong>{ib?.name}</strong> · {ago(post.inner.ago)}</p>
      <p class="fb-body itext">{say(post.inner.text)}</p>
      {#if post.inner.media && showPic(post.inner.media.asset ?? post.id)}<span class="fb-media photo t{post.inner.media.tone}" style:aspect-ratio={ratio(post.inner.media) ?? "4 / 3"}><Cover id={post.inner.media.asset ?? post.id} width={ui.desktop ? 680 : 393} alt={post.inner.media.label} onfail={() => failPic(post.inner.media!.asset ?? post.id)} /></span>{/if}
    </div>
  {:else if post.media && showPic(post.media.asset ?? post.id)}
    <span class="fb-media photo t{post.media.tone}" style:aspect-ratio={ratio(post.media) ?? "4 / 3"}>
      <Cover id={post.media.asset ?? post.id} width={ui.desktop ? 680 : 393} alt={post.media.label} onfail={() => failPic(post.media!.asset ?? post.id)} />
    </span>
  {/if}

  {#if post.kind === "live"}
    <section class="attach" aria-label={say(post.headline)} data-live-post>
      <div class="ah">
        <MuseMark size="var(--mark-row)" />
        <p class="fb-name hl">{say(post.headline)}</p>
      </div>
      {#if post.reel}
        <div class="reel" aria-label={`Reel by ${post.reel.handle}`}>
          <span class="rthumb t{post.reel.tone}"><Cover id={post.reel.asset ?? `${post.id}-reel`} width={96} kind="game" alt="" /><span class="play"><Icon name="fbs_play" /></span></span>
          <span class="rt"><strong>{post.reel.handle}</strong><span>{post.reel.caption}</span><span class="fb-meta">{post.reel.plays} likes · Reel</span></span>
        </div>
      {/if}
      <SurfaceToolCard backingKey={post.backingKey} toolId={post.toolId} subtitle={credit(post)} />
      <p class="fb-meta byline">{credit(post)}</p><!-- hidden while the card's own header shows the same line (see .attach:has) -->
      {#if post.use}
        {@const u = post.use}
        <button class="btn use" onclick={() => useForGroup({ by: post.by, piece: u.piece, lab: compose.ctx().has(`lab:${u.piece}`), params: u.params, templateId: "poll", summary: u.title, headline: say(post.headline) })}>Use for my group</button>
      {/if}
    </section>
  {:else if post.kind === "activity"}
    {@const a = person(post.actor)}
    <p class="said"><Avatar person={a} size="var(--avatar-facepile)" /><span class="bub"><strong>{a?.name}</strong>{post.said}</span></p>
  {:else if post.kind === "link"}
    <a class="card" href={`https://${post.link.host}`} onclick={(e) => e.preventDefault()} aria-label={post.link.title}>
      <span class="cimg t{post.link.tone}"><Cover id={post.link.asset ?? post.id} kind="event" alt="" /></span>
      <span class="ct"><span class="fb-meta host">{post.link.host.toUpperCase()}</span><strong>{post.link.title}</strong><span class="fb-meta">{post.link.blurb}</span></span>
    </a>
  {:else if post.kind === "event"}
    {@const ev = post.event}
    <button class="card" onclick={() => nav.go({ kind: "event", id: ev.id })} aria-label={ev.title}>
      <span class="cimg"><Cover id={ev.id === "juniper" ? "event-juniper-cover" : `ev-${ev.id}`} width={393} kind="event" alt="" /></span>
      <span class="ct"><span class="fb-meta when">{ev.when.toUpperCase()}</span><strong>{ev.title}</strong><span class="fb-meta">{ev.where} · {ev.going} going</span></span>
    </button>
  {:else if post.kind === "listing" && sold}
    <button class="card" onclick={() => nav.go({ kind: "fb", page: { name: "listing", id: sold.id } })} aria-label={sold.title}>
      <span class="cimg"><Cover id={sold.asset} width={393} alt={sold.title} /></span>
      <span class="ct"><strong>{money(sold.price)} · {sold.title}</strong><span class="fb-meta">{sold.where} · Marketplace</span></span>
    </button>
  {:else if post.kind === "life"}
    <div class="life"><span class="lico"><Icon name="fbs_trophy" /></span><strong>{post.life.title}</strong><span class="fb-meta">{post.life.sub}</span></div>
  {:else if page?.sponsored}
    <div class="cta"><span class="fb-meta">{page.name.toLowerCase().replace(/[^a-z]+/g, "")}.example</span><button class="btn" aria-disabled="true" title="Not in this prototype">{page.sponsored.cta}</button></div>
  {:else if post.kind === "tool"}
    <section class="attach" aria-label={post.headline}>
      <div class="ah">
        <MuseMark size="var(--mark-row)" />
        <div class="at">
          <p class="fb-name">{post.headline}</p>
          <p class="fb-meta">Made with Muse · {post.credit}</p>
          <p class="fb-meta">{by?.first} made this · {post.usedBy === 1 ? "1 person" : post.usedBy} used it</p>
        </div>
      </div>
      <SurfaceToolCard backingKey={post.backingKey} toolId={post.toolId} readonly subtitle={`Made with Muse · ${by?.first}`} />
      <button class="btn primary use" onclick={() => useForGroup({ by: post.by, piece: post.piece, lab: compose.ctx().has(`lab:${post.piece}`), params: post.params, templateId: post.templateId, summary: post.summary, headline: post.headline })}>Use for my group</button>
    </section>
  {:else if post.kind === "bracket"}
    <section class="attach" aria-label="Bracket">
      <div class="ah">
        <MuseMark size="var(--mark-row)" />
        <div class="at">
          <p class="fb-meta">Made with Muse · {post.credit}</p>
          <p class="fb-meta">{by?.first} made this · {post.voters.length === 1 ? "1 person" : post.voters.length} used it</p>
        </div>
      </div>
      <SurfaceToolCard backingKey={post.backingKey} toolId={post.toolId} subtitle={`Made with Muse · ${by?.first}`} />
      <p class="voted">
        <span class="pile" aria-hidden="true">{#each post.voters as v (v)}<Avatar person={who(v)} size="var(--avatar-facepile-sm)" ring />{/each}</span>
        <span class="fb-meta">{names(post.voters.map((v) => who(v)?.first ?? ""))} voted</span>
      </p>
    </section>
  {/if}

  <PostCatalysts id={post.id} {liked} skip={"toolId" in post ? [post.toolId] : []} /><!-- catalysts: tools on this post, and offers once you like it (src/muse) -->

  <footer class="bar">
    <button class="act" class:on={liked} aria-pressed={liked} aria-label={`Like, ${likes}`} onclick={() => comments.togglePostLike(post.id)}><Icon name="fbs_like" /><span>{compact(likes)}</span></button>
    <button class="act" aria-label={`Comment, ${nComments}`} onclick={() => comments.open({ id: post.id, likes })}><Icon name="fbs_comment" /><span>{compact(nComments)}</span></button>
    <button class="act" aria-disabled="true" title="Not in this prototype" aria-label={`Share, ${shares}`}><Icon name="fbs_share" />{#if shares}<span>{compact(shares)}</span>{/if}</button>
    <span class="stack" aria-hidden="true">{#each rx as r (r)}<span class="rx">{#if r === "like" || r === "love"}<Icon name={`reaction_${r}`} />{:else}<span class="emo">{EMOJI[r]}</span>{/if}</span>{/each}</span>
  </footer>
  {#if ui.desktop && comments.isInline(post.id)}<Comments target={{ id: post.id, likes }} inline />{/if}<!-- comments -->
</article>

<style>
  .head { display: flex; align-items: center; gap: var(--sp-8); padding: var(--sp-12) var(--sp-4) 0 var(--sp-12); }
  .who { flex: 1; min-width: 0; }
  .pav { display: inline-flex; flex: none; border-radius: var(--r-round); } /* profile */
  .pn { display: inline-block; font-weight: var(--fw-semibold); color: inherit; position: relative; z-index: 1; padding-block: var(--sp-10); margin-block: calc(var(--sp-10) * -1); } /* profile; the padding gives the link a 36 px tall hit area */
  .who .fb-name { padding-block: var(--sp-8); margin-block: calc(var(--sp-8) * -1); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; text-align: left; }
  .priv { display: inline-flex; vertical-align: -1px; --icon-size: var(--sp-12); }
  .hb { width: var(--sp-36); height: var(--sp-36); border-radius: var(--r-round); display: inline-flex; align-items: center; justify-content: center; color: var(--c-text-2); --icon-size: var(--sp-20); flex: none; }
  .gav { position: relative; width: calc(var(--group-avatar) + var(--sp-4)); height: calc(var(--group-avatar) + var(--sp-4)); flex: none; }
  .photo { max-height: min(70vh, calc(var(--fb-card-w) * 1.25)); overflow: hidden; }
  .gsq { overflow: hidden; position: absolute; left: 0; top: 0; width: var(--group-avatar); height: var(--group-avatar); border-radius: var(--r-group-avatar); background: linear-gradient(140deg, var(--c-ph-1), var(--c-ph-2)); }
  .gsq.t3 { background: linear-gradient(140deg, var(--c-ph-3), var(--c-ph-2)); }
  .gp { position: absolute; right: 0; bottom: 0; display: inline-flex; }
  .text { padding: var(--sp-8) var(--sp-12) var(--sp-12); white-space: pre-line; }
  .attach { display: flex; flex-direction: column; gap: var(--sp-12); padding: 0 var(--sp-12) var(--sp-12); }
  .ah { display: flex; align-items: center; gap: var(--sp-8); }
  .at { min-width: 0; }
  .use { width: 100%; }
  .voted { display: flex; align-items: center; gap: var(--sp-8); }
  .pile { display: inline-flex; }
  .pile > :global(.avatar + .avatar) { margin-left: calc(var(--sp-4) * -1); }
  .bar { display: flex; align-items: center; height: var(--fb-action-h); padding: 0 var(--sp-12) 0 var(--sp-4); }
  .act { display: inline-flex; align-items: center; gap: var(--sp-6); height: var(--sp-36); padding: 0 var(--sp-12); border-radius: var(--r-button); color: var(--c-text-2); font-size: var(--fs-meta); line-height: var(--lh-meta); font-weight: var(--fw-semibold); --icon-size: var(--sp-20); }
  .act.on { color: var(--c-btn-soft-text); } /* catalysts: 4.5:1 in dark too (was --c-accent) */
  .act:not([aria-disabled]):active { background: var(--c-hover); }
  .stack { margin-left: auto; display: inline-flex; }
  .rx { display: inline-flex; width: var(--sp-20); height: var(--sp-20); border-radius: var(--r-round); box-shadow: 0 0 0 var(--sp-2) var(--c-bg); background: var(--c-bg); --icon-size: var(--sp-20); }
  .above { display: flex; align-items: center; gap: var(--sp-6); padding: var(--sp-10) var(--sp-12) 0; font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  .above strong { font-weight: var(--fw-semibold); color: var(--c-text); }
  .ico { display: inline-flex; --icon-size: var(--sp-16); color: var(--c-accent-icon); }
  .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nmb { display: inline-block; font: inherit; color: inherit; padding-block: var(--sp-8); margin-block: calc(var(--sp-8) * -1); }
  .gname { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; vertical-align: top; }
  .with { font-weight: var(--fw-regular); color: var(--c-text-2); }
  .gap { display: block; height: var(--sp-8); }
  .pgav { display: inline-flex; align-items: center; justify-content: center; flex: none; width: var(--fb-post-avatar); height: var(--fb-post-avatar); border-radius: var(--r-round); background: linear-gradient(140deg, var(--c-ph-1), var(--c-ph-2)); color: var(--c-white); font-weight: var(--fw-bold); font-size: var(--fs-fb-name); }
  .pgav.t2 { background: linear-gradient(140deg, var(--c-ph-2), var(--c-ph-3)); }
  .pgav.t3 { background: linear-gradient(140deg, var(--c-ph-3), var(--c-ph-1)); }
  .inner { margin: 0 var(--sp-12) var(--sp-12); border-radius: var(--r-card); box-shadow: inset 0 0 0 1px var(--c-hairline); overflow: hidden; }
  .ih { display: flex; align-items: center; gap: var(--sp-6); padding: var(--sp-10) var(--sp-12) 0; }
  .ih strong { font-weight: var(--fw-semibold); color: var(--c-text); }
  .itext { padding: var(--sp-6) var(--sp-12) var(--sp-10); }
  .hl { min-width: 0; }
  .byline { margin-top: calc(var(--sp-6) * -1); }
  /* the card's own header carries this line until the Mini is live */
  .attach:has(:global([data-muse-card]:not([data-live="ready"]))) .byline { display: none; }
  .use { align-self: flex-start; }
  .reel { display: flex; gap: var(--sp-12); align-items: center; padding: var(--sp-8); border-radius: var(--r-card); background: var(--c-wash); }
  .rthumb { position: relative; flex: none; width: var(--sp-56); height: var(--sp-80); border-radius: var(--r-mp-thumb); overflow: hidden; }
  .play { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--c-on-media); --icon-size: var(--sp-24); }
  .rt { display: flex; flex-direction: column; gap: var(--sp-2); min-width: 0; font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text); }
  .rt strong { font-weight: var(--fw-semibold); }
  .said { display: flex; align-items: flex-start; gap: var(--sp-8); padding: 0 var(--sp-12) var(--sp-12); }
  .bub { display: flex; flex-direction: column; padding: var(--sp-8) var(--sp-12); border-radius: var(--r-bubble); background: var(--c-bubble-in); color: var(--c-bubble-in-text); font-size: var(--fs-fb-body); line-height: var(--lh-body); }
  .bub strong { font-size: var(--fs-meta); font-weight: var(--fw-semibold); }
  a.card, a.card * { text-decoration: none; }
  .card { display: flex; flex-direction: column; text-align: left; margin: 0 var(--sp-12) var(--sp-12); border-radius: var(--r-card); overflow: hidden; background: var(--c-wash-link-card); color: var(--c-text); width: calc(100% - var(--sp-24)); }
  .cimg { display: block; aspect-ratio: 1.91 / 1; overflow: hidden; background: linear-gradient(140deg, var(--c-ph-1), var(--c-ph-2)); }
  .ct { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-10) var(--sp-12); font-size: var(--fs-row-sub); line-height: var(--lh-row-sub); }
  .ct strong { font-weight: var(--fw-semibold); }
  .host, .when { letter-spacing: 0.02em; }
  .life { display: flex; flex-direction: column; align-items: center; gap: var(--sp-4); margin: 0 var(--sp-12) var(--sp-12); padding: var(--sp-20) var(--sp-16); border-radius: var(--r-card); background: var(--c-wash); text-align: center; font-size: var(--fs-fb-h2); color: var(--c-text); }
  .life strong { font-weight: var(--fw-bold); }
  .lico { display: inline-flex; align-items: center; justify-content: center; width: var(--sp-56); height: var(--sp-56); border-radius: var(--r-round); background: var(--c-primary); color: var(--c-white); --icon-size: var(--sp-28); }
  .cta { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-8); padding: var(--sp-8) var(--sp-12); background: var(--c-wash); }
  .emo { display: inline-flex; align-items: center; justify-content: center; width: 100%; font-size: var(--fs-meta); line-height: 1; }
  .rx + .rx { margin-left: calc(var(--sp-4) * -1); }
</style>
