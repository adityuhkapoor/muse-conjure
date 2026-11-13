<script lang="ts">
  import { hasPhoto } from "../../lib/photos";
  let deadPics = $state<string[]>([]); // posts whose photo did not load read as text only
  import Cover from "../../components/Cover.svelte";
  import { photo } from "@muse/assets";
  import { tick } from "svelte";
  import Avatar from "../../components/Avatar.svelte";
  import Icon from "../../components/Icon.svelte";
  import { compact } from "../../lib/format";
  import { ui } from "../../lib/ui.svelte";
  import { store } from "../../store";
  import { ME } from "../../store/types";
  import { GROUPS, SUBLETS, type GroupPost } from "../data";
  import { openFinder, who } from "../flows.svelte";
  import { ago } from "../time";
  import MuseOption from "./MuseOption.svelte";
  import PageBar from "./PageBar.svelte";
  import SurfaceToolCard from "./SurfaceToolCard.svelte";
  import GroupCatalysts from "../../muse/components/GroupCatalysts.svelte"; // catalysts
  import { openProfile } from "../profile-data"; // profile

  /**
   * Group page (LC section 9: cover, name, "Private group · N members", facepile, tabs, composer,
   * posts). Muse moments: a post that would repeat earlier ones offers "See N that match" under the
   * composer, which opens the group's pinned finder instead of posting; tools pinned by admins; a
   * post that became a tool.
   */
  let { id }: { id: string } = $props();
  const g = $derived(GROUPS.find((x) => x.id === id)!);
  let draft = $state("");
  let mine = $state<GroupPost[]>([]);
  let pinnedEl: HTMLElement | undefined = $state();

  const matches = $derived(g.match && draft.trim().length > 8 && g.match.words.test(draft) ? SUBLETS.length : 0);
  const finder = $derived(g.match ? store.surfaceTools(g.backingKey).findLast((t) => t.name === g.match!.title) : undefined);
  const posts = $derived([...g.posts.filter((p) => p.pinned), ...mine, ...g.posts.filter((p) => !p.pinned)]);

  async function seeMatches() {
    if (!finder) openFinder(g.id);
    await tick();
    pinnedEl?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  function post() {
    const text = draft.trim();
    if (!text) return;
    mine = [{ id: `mine-${mine.length}`, by: ME, ago: 60_000, text, likes: 0, comments: 0 }, ...mine];
    draft = "";
  }
</script>

{#snippet header()}
  <div class="cover t{g.tone}" role="img" aria-label={g.cover ? `Group cover photo: ${photo(g.cover, 1)?.alt ?? g.name}` : "Group cover photo"}><Cover id={g.cover} width={ui.desktop ? 1100 : 393} alt="" eager /></div>
  <div class="intro">
    <h1 class="name">{g.name}</h1>
    <p class="meta"><Icon name="privacy_private_group_12" />{g.privacy} · <strong>{compact(g.members)}</strong> members</p>
    <div class="row">
      <span class="pile">{#each g.faces as f (f)}<button class="pf" aria-label={`${who(f)?.name}'s profile`} onclick={() => openProfile(f)}><Avatar person={who(f)} size="var(--avatar-facepile)" ring /></button>{/each}</span><!-- profile -->
      <span class="btns">
        <button class="btn" aria-disabled="true" title="Not in this prototype"><Icon name="fbs_groups" />Joined</button>
        <button class="btn primary" aria-disabled="true" title="Not in this prototype"><Icon name="fbs_plus" />Invite</button>
      </span>
    </div>
  </div>
  <div class="tabs" role="tablist" aria-label="Group sections" data-hscroll>
    <button role="tab" aria-selected="true" class="tab on">Discussion</button>
    <button role="tab" aria-selected="false" tabindex="-1" class="tab" aria-disabled="true" title="Not in this prototype">Featured</button>
    <button role="tab" aria-selected="false" tabindex="-1" class="tab" aria-disabled="true" title="Not in this prototype">Members</button>
    <button role="tab" aria-selected="false" tabindex="-1" class="tab" aria-disabled="true" title="Not in this prototype">Events</button>
  </div>
{/snippet}

{#snippet body()}
  <section class="composer fb-card" aria-label="Write a post">
    <div class="crow">
      <Avatar person={store.me} size="var(--fb-post-avatar)" />
      <textarea class="field" rows="1" placeholder="Write something..." aria-label="Write something" bind:value={draft}></textarea>
      {#if draft.trim()}<button class="btn primary" onclick={post}>Post</button>{/if}
    </div>
    <div class="match"><GroupCatalysts {g} {draft} part="composer" ontaken={() => tick().then(() => pinnedEl?.scrollIntoView({ block: "start", behavior: "smooth" }))} /></div><!-- catalysts: offers from what you type, and the Muse field (src/muse) -->
  </section>

  {#if g.pinned.length || finder}
    <section class="pinned fb-card" aria-label="Pinned" bind:this={pinnedEl}>
      {#each g.pinned as p (p.toolId)}
        <p class="plabel"><Icon name="pin" />Pinned by admins</p>
        <SurfaceToolCard backingKey={g.backingKey} toolId={p.toolId} subtitle={`Made with Muse · ${who(p.by)?.first}`} />
      {/each}
      {#if finder && g.match}
        <p class="plabel"><Icon name="pin" />Pinned · from {SUBLETS.length} posts in this group</p>
        <SurfaceToolCard backingKey={g.backingKey} name={g.match.title} />
      {/if}
    </section>
  {/if}

  <section class="pinned fb-card extra" aria-label="Pinned for this group"><GroupCatalysts {g} part="tools" skip={[...g.pinned.map((x) => x.toolId), ...g.posts.flatMap((x) => (x.toolId ? [x.toolId] : [])), ...(g.match ? [g.match.title] : [])]} /></section><!-- catalysts: tools pinned from asks and offers -->

  {#each posts as p (p.id)}
    {@const by = who(p.by)}
    <article class="post fb-card" aria-label={`Post by ${by?.name}`}>
      {#if p.pinned}<p class="plabel ppin"><Icon name="pin" />Pinned by admins</p>{/if}
      <header class="ph">
        <button class="pf" aria-label={`${by?.name}'s profile`} onclick={() => openProfile(p.by)}><Avatar person={by} size="var(--fb-post-avatar)" /></button><!-- profile -->
        <div class="who">
          <button class="fb-name pn" onclick={() => openProfile(p.by)}>{by?.name}</button><!-- profile -->
          <p class="fb-meta">{ago(p.ago)} · <span class="priv"><Icon name="privacy_private_group_12" /></span></p>
        </div>
        <button class="hb" aria-disabled="true" title="Not in this prototype" aria-label="More"><Icon name="more_dots_post_header" /></button>
      </header>
      <p class="fb-body text">{p.text}</p>
      {#if p.media && hasPhoto(p.media.asset) && !deadPics.includes(p.id)}
        {@const ref = p.media.asset ? photo(p.media.asset, 393) : undefined}
        <span class="fb-media gphoto t{p.media.tone}" style:aspect-ratio={ref ? `${ref.width} / ${ref.height}` : undefined}><Cover id={p.media.asset} width={ui.desktop ? 680 : 393} alt={p.media.label} onfail={() => (deadPics = [...deadPics, p.id])} /></span>
      {/if}
      {#if p.toolId}
        <div class="tool">
          <p class="fb-meta made">Made with Muse from {p.madeFrom}</p>
          <SurfaceToolCard backingKey={g.backingKey} toolId={p.toolId} subtitle={`Made with Muse · ${by?.first}`} />
        </div>
      {/if}
      <footer class="bar">
        <button class="act" aria-disabled="true" title="Not in this prototype" aria-label={`Like, ${p.likes}`}><Icon name="fbs_like" /><span>{p.likes}</span></button>
        <button class="act" aria-disabled="true" title="Not in this prototype" aria-label={`Comment, ${p.comments}`}><Icon name="fbs_comment" /><span>{p.comments}</span></button>
        <button class="act" aria-disabled="true" title="Not in this prototype" aria-label="Send"><Icon name="fbs_send" /></button>
      </footer>
    </article>
  {/each}
{/snippet}

{#if ui.desktop}
  <section class="desk" aria-label="Group">
    <div class="band"><div class="bcol">{@render header()}</div></div>
    <div class="cols">
      <div class="feed">{@render body()}</div>
      <aside class="about fb-card" aria-label="About">
        <h2 class="fb-section">About</h2>
        <p class="fb-body">{g.id === "sublets" ? "Sublets, leases and roommates near campus. Search before you post." : "Weekly climbs, gear room shifts and rides to the gym."}</p>
        <p class="arow"><Icon name="privacy_private_group_12" /><span><strong>Private</strong><br />Only members can see who's in the group and what they post.</span></p>
      </aside>
    </div>
  </section>
{:else}
  <section class="fb-page" aria-label="Group">
    <PageBar title={g.name} />
    <div class="fb-scroll">
      {@render header()}
      <div class="feed">{@render body()}</div>
    </div>
  </section>
{/if}

<style>
  .gphoto { overflow: hidden; max-height: 70vh; }
  .cover { overflow: hidden; height: var(--group-cover-h); background: linear-gradient(160deg, var(--c-cover-1), var(--c-cover-2)); }
  .cover.t3 { background: linear-gradient(160deg, var(--c-cover-2), var(--c-ph-2)); }
  .intro { padding: var(--sp-12) var(--sp-16) var(--sp-8); display: flex; flex-direction: column; gap: var(--sp-6); }
  .name { font-size: var(--fs-event-title); line-height: var(--lh-event-title); font-weight: var(--fw-bold); }
  .meta { display: flex; align-items: center; gap: var(--sp-4); font-size: var(--fs-fb-body); line-height: var(--lh-fb-body); color: var(--c-text-2); --icon-size: var(--sp-12); }
  .meta strong { font-weight: var(--fw-semibold); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-8); flex-wrap: wrap; }
  .pile { display: inline-flex; }
  .pile > :global(.pf + .pf) { margin-left: calc(var(--sp-6) * -1); } /* profile */
  .pf { display: inline-flex; flex: none; border-radius: var(--r-round); } /* profile */
  .pn { display: block; text-align: left; } /* profile */
  .btns { display: flex; gap: var(--sp-8); }
  .tabs { display: flex; padding: 0 var(--sp-8); border-bottom: 1px solid var(--c-divider); overflow-x: auto; scrollbar-width: none; }
  .tab { flex: none; height: var(--sp-48); padding: 0 var(--sp-12); font-size: var(--fs-card); line-height: var(--lh-card); font-weight: var(--fw-semibold); color: var(--c-text-2); border-bottom: var(--sp-3) solid transparent; }
  .tab.on { color: var(--c-btn-soft-text); border-bottom-color: var(--c-accent); }

  .feed { display: flex; flex-direction: column; }
  .composer { padding: var(--sp-12); display: flex; flex-direction: column; gap: var(--sp-8); }
  .crow { display: flex; align-items: center; gap: var(--sp-8); }
  .field { flex: 1; min-width: 0; min-height: var(--sp-40); max-height: var(--composer-max-h); padding: var(--sp-10) var(--sp-12); border: 0; border-radius: var(--r-input); background: var(--c-field); resize: none; outline: none; font-size: var(--fs-fb-composer); line-height: var(--lh-fb-composer); field-sizing: content; }
  .field::placeholder { color: var(--c-text-2); opacity: 1; }
  .extra:not(:has([data-surface-tool])) { display: none; } /* catalysts */
  .pinned { padding: var(--sp-12); display: flex; flex-direction: column; gap: var(--sp-8); scroll-margin-top: var(--sp-16); }
  .plabel { display: flex; align-items: center; gap: var(--sp-6); font-size: var(--fs-meta); line-height: var(--lh-meta); font-weight: var(--fw-semibold); color: var(--c-text-2); --icon-size: var(--sp-16); }
  .ppin { padding: var(--sp-12) var(--sp-12) 0; }
  .ph { display: flex; align-items: center; gap: var(--sp-8); padding: var(--sp-12) var(--sp-4) 0 var(--sp-12); }
  .who { flex: 1; min-width: 0; }
  .priv { display: inline-flex; vertical-align: -1px; --icon-size: var(--sp-12); }
  .hb { width: var(--sp-36); height: var(--sp-36); border-radius: var(--r-round); display: inline-flex; align-items: center; justify-content: center; color: var(--c-text-2); --icon-size: var(--sp-20); }
  .text { padding: var(--sp-8) var(--sp-12) var(--sp-12); }
  .tool { padding: 0 var(--sp-12) var(--sp-12); display: flex; flex-direction: column; gap: var(--sp-8); }
  .bar { display: flex; height: var(--fb-action-h); align-items: center; padding: 0 var(--sp-4); }
  .act { display: inline-flex; align-items: center; gap: var(--sp-6); height: var(--sp-36); padding: 0 var(--sp-12); color: var(--c-text-2); font-size: var(--fs-meta); line-height: var(--lh-meta); font-weight: var(--fw-semibold); --icon-size: var(--sp-20); }

  .desk { height: 100%; overflow-y: auto; background: var(--c-wash); }
  .band { background: var(--c-bg); box-shadow: var(--sh-card); }
  .bcol { width: min(var(--event-col-w), 100%); margin: 0 auto; }
  .desk .cover { height: var(--group-cover-h-desk); border-radius: 0 0 var(--r-button) var(--r-button); }
  .desk .name { font-size: var(--fs-event-title); line-height: var(--lh-event-title); }
  .cols { width: min(var(--event-col-w), 100%); margin: var(--sp-16) auto var(--sp-32); display: grid; grid-template-columns: minmax(0, var(--event-card-w)) minmax(0, 1fr); gap: var(--sp-16); padding: 0 var(--sp-12); align-items: start; }
  .desk .feed { gap: var(--fb-card-gap); }
  .about { padding: var(--sp-16); display: flex; flex-direction: column; gap: var(--sp-12); }
  .arow { display: flex; gap: var(--sp-12); font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); --icon-size: var(--sp-20); }
  .arow strong { color: var(--c-text); font-size: var(--fs-fb-body); font-weight: var(--fw-medium); }
</style>
