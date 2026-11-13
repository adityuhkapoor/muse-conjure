<script lang="ts">
  import Cover from "../../components/Cover.svelte";
  import Avatar from "../../components/Avatar.svelte";
  import Icon from "../../components/Icon.svelte";
  import { store } from "../../store";
  import { nav } from "../../lib/nav.svelte";
  import { STORIES as ALL_STORIES } from "../data";
  import { viewerId, realPerson } from "../../lib/media";
  import { avatarFor } from "@muse/assets";
  import { who } from "../flows.svelte";
  import { seen } from "../seen.svelte";

  // your own story is the "me" one; a story by the same person under their own id is not shown twice
  const STORIES = ALL_STORIES.filter((s) => s.by !== viewerId());
  // The viewer's own photo fills the top of the Create story tile: ask for a file sized to the photo's
  // height (about 150 px), not an avatar's width, so a 2x or 3x screen does not scale up a small one.
  const mine = $derived(realPerson(store.me.id));
  const photo = $derived(mine ? avatarFor(mine, 160) : undefined);
  /** Stories tray: IOS cards 118 x 211, gap 4, first card at x 4 (MP desktop 110 x 160, gap 8). */
</script>

<section class="tray fb-card" aria-label="Stories">
  <ul class="cards" data-hscroll>
    <li>
      <button class="card create" aria-disabled="true" title="Not in this prototype">
        <span class="top">
          {#if photo?.kind === "image"}
            <img src={photo.src} srcset={photo.srcset} alt="" decoding="async" draggable="false" />
          {:else}
            <Avatar person={store.me} size="var(--story-w)" />
          {/if}
        </span>
        <span class="plus"><Icon name="fbs_plus" /></span>
        <span class="clab">Create story</span>
      </button>
    </li>
    {#each STORIES as s (s.id)}
      {@const p = who(s.by)}
      <li>
        <button class="card t{s.tone}" aria-label={s.by === "me" ? "Your story" : `${p?.first}'s story`} onclick={() => nav.go({ kind: "fb", page: { name: "story", id: s.id } })}>
          <span class="bg"><Cover id={s.asset} width={118} alt="" /></span>
          <span class="ring" class:seen={seen.has(s.id)} data-seen={seen.has(s.id)}><Avatar person={p} size="var(--sp-32)" /></span>
          {#if s.poll}<span class="sticker" aria-hidden="true"><Icon name="fbs_poll" /></span>{/if}
          <span class="name">{s.by === "me" ? "Your story" : p?.first}</span>
        </button>
      </li>
    {/each}
  </ul>
</section>

<style>
  .tray { padding: var(--sp-8) 0; }
  .cards { display: flex; gap: var(--story-gap); overflow-x: auto; padding: 0 var(--story-gap); scrollbar-width: none; }
  .cards::-webkit-scrollbar { display: none; }
  .card {
    position: relative;
    flex: none;
    display: block;
    width: var(--story-w);
    height: var(--story-h);
    border-radius: var(--r-story);
    overflow: hidden;
    background: linear-gradient(170deg, var(--c-ph-1), var(--c-ph-2));
    box-shadow: inset 0 0 0 1px var(--c-hairline);
    text-align: left;
  }
  .card.t2 { background: linear-gradient(170deg, var(--c-ph-3), var(--c-ph-2)); }
  .card.t3 { background: linear-gradient(170deg, var(--c-ph-2), var(--c-ph-3)); }
  .bg { position: absolute; inset: 0; }
  .card::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 40%; background: linear-gradient(transparent, var(--c-media-scrim)); }
  .ring { position: absolute; z-index: 1; top: var(--sp-8); left: var(--sp-8); display: inline-flex; border-radius: var(--r-round); box-shadow: 0 0 0 var(--story-ring) var(--c-fb-tab-selected); }
  .ring.seen { box-shadow: 0 0 0 var(--story-ring) var(--c-text-3); } /* viewed this session: the ring goes grey */
  .sticker { position: absolute; z-index: 1; top: var(--sp-8); right: var(--sp-8); width: var(--sp-28); height: var(--sp-28); border-radius: var(--r-button); background: var(--c-bg); color: var(--c-text); display: inline-flex; align-items: center; justify-content: center; --icon-size: var(--sp-16); }
  .name { position: absolute; z-index: 1; left: var(--sp-8); right: var(--sp-8); bottom: var(--sp-8); font-size: var(--fs-story-name); line-height: var(--lh-story-name); font-weight: var(--fw-semibold); color: var(--c-on-media); }
  .create { background: var(--c-btn-secondary); }
  .create::after { display: none; }
  .create .top { position: absolute; inset: 0 0 32% 0; overflow: hidden; }
  .create .top img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 25%; }
  .create .top :global(.avatar) { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 0; }
  .create .plus { position: absolute; left: 50%; bottom: calc(32% - var(--sp-16)); transform: translateX(-50%); width: var(--sp-32); height: var(--sp-32); border-radius: var(--r-round); background: var(--c-accent); color: var(--c-white); box-shadow: 0 0 0 var(--sp-4) var(--c-bg); display: inline-flex; align-items: center; justify-content: center; --icon-size: var(--sp-20); }
  .create .clab { position: absolute; left: 0; right: 0; bottom: 0; height: 32%; box-sizing: border-box; display: flex; align-items: flex-end; justify-content: center; padding-bottom: var(--sp-8); text-align: center; font-size: var(--fs-story-name); line-height: var(--lh-story-name); font-weight: var(--fw-semibold); color: var(--c-text); }
  .create { box-shadow: inset 0 0 0 1px var(--c-hairline); }
  .create { background: var(--c-bg); }
  .create:hover, .create:active { background: var(--c-bg) !important; }
</style>
