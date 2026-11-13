<script lang="ts">
  import Avatar from "../../components/Avatar.svelte";
  import Cover from "../../components/Cover.svelte";
  import Icon from "../../components/Icon.svelte";
  import { viewerId } from "../../lib/media";
  import { nav } from "../../lib/nav.svelte";
  import { ui } from "../../lib/ui.svelte";
  import { chatWith, friendsOf, friendsText, isViewer, mutual, personOf, photosOf, postsBy, profile, profileKey, reelsBy } from "../profile-data";
  import ComposerCard from "./ComposerCard.svelte";
  import PageBar from "./PageBar.svelte";
  import PostCard from "./PostCard.svelte";
  import ProfileMuse from "./ProfileMuse.svelte";
  import { scrollHide } from "../../lib/scrollHide";

  let scrollEl = $state<HTMLElement | undefined>(undefined);

  /**
   * A profile (Facebook iOS and desktop profile layouts): cover, large avatar over it, name, a
   * one-line bio, friends and mutual friends, the action row, Posts / About / Photos / Reels, an
   * intro card, six friends, Made with Muse, then their own posts from the feed, tools live.
   * `tab`: the phone's Profile tab (no back button).
   */
  let { id, tab = false }: { id: string; tab?: boolean } = $props();
  const key = $derived(profileKey(id));
  const pr = $derived(profile(key));
  const own = $derived(isViewer(key));
  const friends = $derived(friendsOf(key));
  const mutuals = $derived(own ? [] : mutual(viewerId(), key));
  const chat = $derived(own ? undefined : chatWith(key));
  const posts = $derived(postsBy(key));
  const photos = $derived(photosOf(key));
  const reels = $derived(reelsBy(key));
  type Sec = "posts" | "about" | "photos" | "reels";
  const SECS: [Sec, string][] = [["posts", "Posts"], ["about", "About"], ["photos", "Photos"], ["reels", "Reels"]];
  let sec = $state<Sec>("posts");
  const openKey = (k: string) => nav.go({ kind: "fb", page: { name: "profile", id: k } });
  const AV = 168; // the measured-proportion profile picture, in px for the picture file (CSS size below)
</script>

{#snippet actions()}
  <div class="acts">
    {#if own}
      <button class="btn primary grow" aria-disabled="true" title="Not in this prototype"><Icon name="fbs_plus" />Add to story</button>
      <button class="btn grow" aria-disabled="true" title="Not in this prototype"><Icon name="pf_edit" />Edit profile</button>
    {:else}
      <button class="btn grow" aria-disabled="true" title="Not in this prototype"><Icon name="pf_friend_check" />Friends</button>
      {#if chat}
        <button class="btn primary grow" onclick={() => nav.openChat(chat.id)} data-profile-message><Icon name="top_messenger" />Message</button>
      {:else}
        <button class="btn primary grow" aria-disabled="true" title="Not in this prototype"><Icon name="top_messenger" />Message</button>
      {/if}
    {/if}
    <button class="btn sq" aria-disabled="true" title="Not in this prototype" aria-label="More"><Icon name="more_dots" /></button>
  </div>
{/snippet}

{#snippet head()}
  {#if pr}
    <div class="cover"><Cover id={pr.cover} width={ui.desktop ? 1031 : 393} alt="" eager /></div>
    <div class="who">
      <span class="pic"><Avatar person={pr.person} size="var(--profile-av)" px={AV} /></span>
      <div class="id">
        <h1 class="name">{pr.person.name}</h1>
        <p class="counts"><strong>{pr.friends}</strong> {pr.friends === 1 ? "friend" : "friends"}{#if !own && mutuals.length}{" · "}<strong>{mutuals.length}</strong> mutual{/if}</p>
        {#if ui.desktop}
          <span class="pile" aria-hidden="true">{#each friends.slice(0, 8) as f (f)}<Avatar person={personOf(f)} size="var(--avatar-facepile)" ring />{/each}</span>
        {/if}
      </div>
      {#if ui.desktop}{@render actions()}{/if}
    </div>
    {#if pr.bio && !ui.desktop}<p class="bio">{pr.bio}</p>{/if}
    {#if !ui.desktop}{@render actions()}{/if}
    <div class="tabs" role="tablist" aria-label="Profile sections" data-hscroll>
      {#each SECS as [s, label] (s)}
        <button role="tab" class="tab" class:on={sec === s} aria-selected={sec === s} tabindex={sec === s ? 0 : -1} onclick={() => (sec = s)}>{label}</button>
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet intro()}
  {#if pr}
    <section class="card fb-card" aria-labelledby="intro-h">
      <h2 class="fb-h2" id="intro-h">{ui.desktop ? "Intro" : "Details"}</h2>
      {#if pr.bio && ui.desktop}<p class="dbio">{pr.bio}</p>{/if}
      <ul class="rows">
        {#each pr.intro as r (r.html)}
          <li><Icon name={r.icon} /><span>{@html r.html}</span></li>
        {/each}
      </ul>
      {#if !ui.desktop}<button class="btn wide" onclick={() => (sec = "about")}>See {own ? "your" : `${pr.person.first}'s`} About info</button>{/if}
    </section>
  {/if}
{/snippet}

{#snippet friendsCard()}
  <section class="card fb-card" aria-labelledby="friends-h">
    <div class="fh">
      <div>
        <h2 class="fb-h2" id="friends-h">Friends</h2>
        <p class="fb-meta">{friendsText(pr?.friends ?? 0)}{#if !own && mutuals.length}{" · "}{mutuals.length} mutual{/if}</p>
      </div>
      {#if own}<button class="link" onclick={() => nav.go({ kind: "fb", page: { name: "friends" } })}>Find friends</button>{/if}
    </div>
    <ul class="grid">
      {#each friends.slice(0, 6) as f (f)}
        {@const p = personOf(f)}
        <li>
          <button class="fr" onclick={() => openKey(f)} aria-label={`${p?.name}'s profile`}>
            <span class="sqr"><Avatar person={p} size="100%" px={120} /></span>
            <span class="fn">{p?.name}</span>
          </button>
        </li>
      {/each}
    </ul>
    <button class="btn wide" onclick={() => nav.go({ kind: "fb", page: { name: "friends" } })}>See all friends</button>
  </section>
{/snippet}

{#snippet postsList()}
  {#if own}
    <ComposerCard />
  {:else}
    <section class="card fb-card wrt" aria-label="Write a post">
      <Avatar person={personOf(viewerId())} size="var(--fb-post-avatar)" />
      <button class="pill" aria-disabled="true" title="Not in this prototype">Write something to {pr?.person.first}...</button>
    </section>
  {/if}
  <h2 class="fb-h2 ph fb-card">Posts</h2>
  {#each posts as post (post.id)}
    <PostCard {post} />
  {:else}
    <p class="none fb-card">No posts yet</p>
  {/each}
{/snippet}

{#snippet aboutCard()}
  {#if pr}
    <section class="card fb-card" aria-labelledby="about-h">
      <h2 class="fb-h2" id="about-h">About</h2>
      {#if pr.bio}<p class="dbio left">{pr.bio}</p>{/if}
      <ul class="rows">
        {#each pr.intro as r (r.html)}
          <li><Icon name={r.icon} /><span>{@html r.html}</span></li>
        {/each}
        <li><Icon name="people" /><span><strong>{pr.friends}</strong> {pr.friends === 1 ? "friend" : "friends"}</span></li>
      </ul>
    </section>
  {/if}
{/snippet}

{#snippet photosCard(limit: number)}
  <section class="card fb-card" aria-labelledby="photos-h">
    <h2 class="fb-h2" id="photos-h">Photos</h2>
    {#if photos.length}
      <ul class="pgrid">
        {#each photos.slice(0, limit) as ph (ph.id)}
          <li class="pt"><Cover id={ph.id} width={130} alt={ph.label} /></li>
        {/each}
      </ul>
    {:else}
      <p class="fb-meta">No photos yet</p>
    {/if}
  </section>
{/snippet}

{#snippet reelsCard()}
  <section class="card fb-card" aria-labelledby="reels-h">
    <h2 class="fb-h2" id="reels-h">Reels</h2>
    {#if reels.length}
      <ul class="rgrid">
        {#each reels as r (r.id)}
          <li><button class="rt" aria-label={`Reel: ${r.caption}`} onclick={() => nav.go({ kind: "fb", page: { name: "reels", id: r.id } })}><Cover id={r.asset} width={130} alt="" /></button></li>
        {/each}
      </ul>
    {:else}
      <p class="fb-meta">No reels yet</p>
    {/if}
  </section>
{/snippet}

{#snippet body()}
  {#if sec === "posts"}
    {#if ui.desktop}
      <div class="cols">
        <div class="side">{@render intro()}{@render photosCard(9)}{@render friendsCard()}</div>
        <div class="main">
          {#if !own}<div class="fb-card askc"><ProfileMuse {key} part="ask" /></div>{/if}
          <ProfileMuse {key} part="made" />
          {@render postsList()}
        </div>
      </div>
    {:else}
      {@render intro()}
      <ProfileMuse {key} part="made" />
      {#if !own}<div class="fb-card"><ProfileMuse {key} part="ask" /></div>{/if}
      {@render friendsCard()}
      {@render postsList()}
    {/if}
  {:else if sec === "about"}
    <div class="one">{@render aboutCard()}</div>
  {:else if sec === "photos"}
    <div class="one">{@render photosCard(30)}</div>
  {:else}
    <div class="one">{@render reelsCard()}</div>
  {/if}
{/snippet}

{#if !pr}
  <section class="fb-page" aria-label="Profile">
    <PageBar title="Profile" />
    <p class="none">This profile isn't available</p>
  </section>
{:else if ui.desktop}
  <section class="desk" aria-label={`${pr.person.name}'s profile`} data-profile={key}>
    <div class="band"><div class="bcol">{@render head()}</div></div>
    <div class="dbody">{@render body()}</div>
  </section>
{:else}
  <section class="fb-page" aria-label={`${pr.person.name}'s profile`} data-profile={key}>
    {#if !tab}
      <PageBar title={pr.person.name} />
    {/if}
    <div class="fb-scroll" class:padtab={tab} class:tab-pad={tab} bind:this={scrollEl}>
      <div class="phead fb-card">{@render head()}</div>
      <div class="feed">{@render body()}</div>
    </div>
    {#if tab && scrollEl}
      <div class="safe-strip" aria-hidden="true"></div>
      <header class="tbar" use:scrollHide={scrollEl}><h1 class="tt">{pr.person.name}</h1></header>
    {/if}
  </section>
{/if}

<style>
  /* Profile picture 168 (Facebook's desktop size; on the phone the same share of the width as the
     iOS app's), cover 16:9 on the phone and 27:10 on desktop. Assumed, see the README. */
  section { --profile-av: calc(var(--sp-56) * 3); }
  .cover { overflow: hidden; aspect-ratio: 16 / 9; background: linear-gradient(160deg, var(--c-cover-1), var(--c-cover-2)); }
  .who { position: relative; padding: 0 var(--sp-16); }
  .pic { display: inline-flex; margin-top: calc(var(--profile-av) * -0.5); border-radius: var(--r-round); box-shadow: 0 0 0 var(--sp-4) var(--c-bg); background: var(--c-bg); }
  .id { margin-top: var(--sp-8); }
  .name { font-size: var(--fs-event-title); line-height: var(--lh-event-title); font-weight: var(--fw-bold); }
  .counts { margin-top: var(--sp-2); font-size: var(--fs-fb-body); line-height: var(--lh-fb-body); color: var(--c-text-2); }
  .counts strong { color: var(--c-text); font-weight: var(--fw-semibold); }
  .bio { padding: var(--sp-8) var(--sp-16) 0; font-size: var(--fs-fb-body); line-height: var(--lh-fb-body); }
  .acts { display: flex; gap: var(--sp-8); padding: var(--sp-12) var(--sp-16) var(--sp-4); }
  .grow { flex: 1; min-width: 0; }
  .sq { width: var(--sp-48); padding: 0; flex: none; --icon-size: var(--sp-20); }
  .tabs { display: flex; gap: var(--sp-8); padding: var(--sp-12) var(--sp-16); overflow-x: auto; scrollbar-width: none; }
  .tab { flex: none; height: var(--btn-h); padding: 0 var(--sp-12); border-radius: var(--r-pill); font-size: var(--fs-btn); line-height: var(--lh-btn); font-weight: var(--fw-semibold); color: var(--c-text-2); }
  .tab.on { background: var(--c-btn-soft); color: var(--c-btn-soft-text); }

  .feed { display: flex; flex-direction: column; }
  .card { padding: var(--sp-12) var(--sp-16) var(--sp-16); display: flex; flex-direction: column; gap: var(--sp-12); }
  .rows { display: flex; flex-direction: column; gap: var(--sp-12); }
  .rows li { display: flex; align-items: center; gap: var(--sp-12); font-size: var(--fs-fb-body); line-height: var(--lh-fb-body); color: var(--c-text); --icon-size: var(--sp-20); }
  .rows li :global(.icon) { color: var(--c-text-2); }
  .rows :global(strong) { font-weight: var(--fw-semibold); }
  .wide { width: 100%; }
  .fh { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-8); }
  .link { height: var(--btn-h); padding: 0 var(--sp-8); margin-right: calc(var(--sp-8) * -1); border-radius: var(--r-button); color: var(--c-btn-soft-text); font-size: var(--fs-fb-body); line-height: var(--lh-fb-body); }
  .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-12) var(--sp-8); }
  .fr { width: 100%; display: flex; flex-direction: column; gap: var(--sp-6); text-align: left; }
  .sqr { display: block; width: 100%; aspect-ratio: 1; }
  .sqr :global(.avatar) { border-radius: var(--r-button); }
  .fn { font-size: var(--fs-meta); line-height: var(--lh-meta); font-weight: var(--fw-semibold); color: var(--c-text); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .wrt { flex-direction: row; align-items: center; gap: var(--sp-8); padding: var(--sp-12) var(--sp-16); }
  .pill { flex: 1; min-width: 0; height: var(--sp-40); padding: 0 var(--sp-12); border-radius: var(--r-pill); background: var(--c-field); color: var(--c-text-2); text-align: left; font-size: var(--fs-fb-composer); line-height: var(--lh-fb-composer); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ph { padding: var(--sp-12) var(--sp-16); }
  .none { padding: var(--sp-24) var(--sp-16); text-align: center; font-size: var(--fs-fb-body); line-height: var(--lh-fb-body); color: var(--c-text-2); }
  .dbio { text-align: center; font-size: var(--fs-fb-body); line-height: var(--lh-fb-body); padding-bottom: var(--sp-12); border-bottom: 1px solid var(--c-divider); }
  .dbio.left { text-align: left; border-bottom: 0; padding-bottom: 0; }
  .pgrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-4); border-radius: var(--r-button); overflow: hidden; }
  .pt { aspect-ratio: 1; overflow: hidden; background: var(--c-field); }
  .rgrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-4); }
  .rt { display: block; width: 100%; aspect-ratio: 9 / 16; overflow: hidden; border-radius: var(--r-button); background: var(--c-media-dark); }
  .safe-strip { position: absolute; z-index: 4; top: 0; left: 0; right: 0; height: var(--safe-top); background: var(--c-fb-header); }
  .tbar {
    position: absolute;
    z-index: 3;
    top: var(--safe-top);
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--fb-header-h);
    padding: 0 var(--sp-16);
    background: var(--c-fb-header);
    transform: translateY(0);
    transition: transform var(--m-push-dur) var(--m-push-ease);
  }
  .tbar:global([data-hide]) { transform: translateY(-100%); }
  .tt { font-size: var(--fs-title); line-height: var(--lh-title); font-weight: var(--fw-semibold); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .padtab { padding-bottom: calc(var(--tabbar-float-h) + var(--tabbar-float-bottom) + var(--sp-24)); }
  .tab-pad { padding-top: calc(var(--fb-header-h) + var(--safe-top)); }

  /* Desktop: the measured 1031 column (as the event and group pages), intro left, posts right at the measured 590. */
  .desk { height: 100%; overflow-y: auto; background: var(--c-wash); }
  .band { background: var(--c-bg); box-shadow: var(--sh-card); }
  .bcol { width: min(var(--event-col-w), 100%); margin: 0 auto; }
  .desk .cover { aspect-ratio: 27 / 10; border-radius: 0 0 var(--r-button) var(--r-button); }
  .desk .who { display: flex; align-items: flex-end; gap: var(--sp-16); padding: 0 var(--sp-32) var(--sp-16); border-bottom: 1px solid var(--c-divider); }
  .desk .pic { margin-top: calc(var(--profile-av) * -0.25); }
  .desk .id { flex: 1; min-width: 0; padding-bottom: var(--sp-4); }
  .desk .name { font-size: var(--fs-event-title); line-height: var(--lh-event-title); }
  .pile { display: inline-flex; margin-top: var(--sp-8); }
  .pile > :global(.avatar + .avatar) { margin-left: calc(var(--sp-6) * -1); }
  .desk .acts { padding: 0 0 var(--sp-4); }
  .desk .acts .grow { flex: none; }
  .desk .sq { width: var(--btn-h); }
  .desk .tabs { padding: 0 var(--sp-16); gap: 0; }
  .desk .tab { height: var(--sp-60); border-radius: 0; padding: 0 var(--sp-16); border-bottom: var(--sp-3) solid transparent; }
  .desk .tab.on { background: none; color: var(--c-btn-soft-text); border-bottom-color: var(--c-accent); }
  .desk .tab:not(.on):hover { background: var(--c-hover); }
  .dbody { width: min(var(--event-col-w), 100%); margin: var(--sp-16) auto var(--sp-32); padding: 0 var(--sp-16); }
  .cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, var(--event-card-w)); gap: var(--sp-16); align-items: start; }
  .side, .main { display: flex; flex-direction: column; gap: var(--sp-16); min-width: 0; }
  .side { position: sticky; top: var(--sp-16); }
  .one { width: min(var(--event-card-w), 100%); margin: 0 auto; }
  .askc { padding: var(--sp-4) 0; }
  .desk .ph { padding: var(--sp-12) var(--sp-16); }
</style>
