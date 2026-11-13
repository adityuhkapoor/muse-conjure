<script lang="ts">
  import Cover from "../../components/Cover.svelte";
  import "../fb.css";
  import Avatar from "../../components/Avatar.svelte";
  import Icon from "../../components/Icon.svelte";
  import { nav } from "../../lib/nav.svelte";
  import { store } from "../../store";
  import type { FbPage } from "../fbnav.svelte";
  import { GROUPS } from "../data";
  import Gaming from "./Gaming.svelte";
  import GroupPage from "./GroupPage.svelte";
  import Home from "./Home.svelte";
  import ListingPage from "./ListingPage.svelte";
  import Marketplace from "./Marketplace.svelte";
  import Notifications from "./Notifications.svelte";
  import Reels from "./Reels.svelte";
  import StoryViewer from "./StoryViewer.svelte";
  import FbSearch from "./FbSearch.svelte";
  import Friends from "./Friends.svelte"; // profile
  import ProfilePage from "./ProfilePage.svelte"; // profile

  /** Desktop Facebook: the main area under the top bar. Home has the left rail; other screens their own layout. */
  let { page }: { page: FbPage } = $props();
  const go = (p: FbPage) => nav.go({ kind: "fb", page: p });
</script>

{#snippet rail(title: string | null)}
  <nav class="rail" aria-label={title ?? "Shortcuts"}>
    {#if title}<h1 class="rt">{title}</h1>{/if}
    <ul>
      <li><button class="r" onclick={() => go({ name: "profile", id: "me" })}><Avatar person={store.me} size="var(--sp-36)" /><span>{store.me.name}</span></button></li><!-- profile -->
      <li><button class="r" class:on={page.name === "friends"} onclick={() => go({ name: "friends" })}><span class="ic"><Icon name="nav_friends" /></span><span>Friends</span></button></li><!-- profile -->
      <li><button class="r" class:on={page.name === "marketplace"} onclick={() => go({ name: "marketplace" })}><span class="ic"><Icon name="nav_marketplace" /></span><span>Marketplace</span></button></li>
      <li><button class="r" class:on={page.name === "gaming"} onclick={() => go({ name: "gaming" })}><span class="ic"><Icon name="nav_gaming" /></span><span>Gaming</span></button></li>
      <li><button class="r" onclick={() => go({ name: "reels" })}><span class="ic"><Icon name="nav_reels" /></span><span>Reels</span></button></li>
      <li><button class="r" onclick={() => nav.go({ kind: "event", id: "juniper" })}><span class="ic"><Icon name="calendar" /></span><span>Events</span></button></li>
    </ul>
    <h2 class="rh">Your groups</h2>
    <ul>
      {#each GROUPS as g (g.id)}
        <li><button class="r" onclick={() => go({ name: "group", id: g.id })}><span class="gsq t{g.tone}" aria-hidden="true"><Cover id={g.cover} width={36} alt="" /></span><span>{g.name}</span></button></li>
      {/each}
    </ul>
  </nav>
{/snippet}

{#if page.name === "profile"}
  <ProfilePage id={page.id} /><!-- profile -->
{:else if page.name === "friends"}
  <div class="two">{@render rail("Friends")}<div class="main"><Friends /></div></div><!-- profile -->
{:else if page.name === "listing"}
  <ListingPage id={page.id} />
{:else if page.name === "group" || page.name === "groups"}
  <GroupPage id={page.name === "group" ? page.id : GROUPS[0]!.id} />
{:else if page.name === "reels"}
  <Reels />
{:else if page.name === "search"}
  <div class="main"><FbSearch /></div>
{:else if page.name === "story"}
  <div class="storywrap"><div class="storybox"><StoryViewer id={page.id} /></div></div>
{:else if page.name === "marketplace"}
  <div class="two">{@render rail("Marketplace")}<div class="main"><Marketplace /></div></div>
{:else if page.name === "gaming"}
  <div class="two">{@render rail("Gaming")}<div class="main"><Gaming /></div></div>
{:else if page.name === "notifications"}
  <div class="two">{@render rail(null)}<div class="main"><div class="col fb-card"><Notifications /></div></div></div>
{:else}
  <div class="two">{@render rail(null)}<div class="main"><div class="col"><Home /></div></div></div>
{/if}

<style>
  .two { display: grid; grid-template-columns: var(--fb-rail-w) minmax(0, 1fr); height: 100%; min-height: 0; }
  .rail { overflow-y: auto; padding: var(--sp-16) var(--sp-8); }
  .rt { padding: 0 var(--sp-8) var(--sp-8); font-size: var(--fs-chats-title); line-height: var(--lh-chats-title); font-weight: var(--fw-bold); }
  .rh { padding: var(--sp-16) var(--sp-8) var(--sp-4); font-size: var(--fs-fb-section); line-height: var(--lh-fb-section); font-weight: var(--fw-semibold); color: var(--c-text-2); border-top: 1px solid var(--c-divider); margin-top: var(--sp-8); }
  .r { width: 100%; min-height: var(--sp-44); display: flex; align-items: center; gap: var(--sp-12); padding: var(--sp-4) var(--sp-8); border-radius: var(--r-button); text-align: left; font-size: var(--fs-fb-body); line-height: var(--lh-fb-body); font-weight: var(--fw-medium); }
  .r:hover { background: var(--c-hover); }
  .r.on { background: var(--c-hover); }
  .ic { width: var(--sp-36); height: var(--sp-36); border-radius: var(--r-round); background: var(--c-btn-secondary); color: var(--c-accent); display: inline-flex; align-items: center; justify-content: center; --icon-size: var(--sp-20); flex: none; }
  .gsq { overflow: hidden; display: inline-block; width: var(--sp-36); height: var(--sp-36); border-radius: var(--r-group-avatar); background: linear-gradient(140deg, var(--c-ph-1), var(--c-ph-2)); flex: none; }
  .gsq.t3 { background: linear-gradient(140deg, var(--c-ph-3), var(--c-ph-2)); }
  .main { min-width: 0; min-height: 0; overflow-y: auto; }
  .col { width: min(var(--fb-card-w), 100%); margin: var(--sp-16) auto var(--sp-32); }
  .storywrap { height: 100%; display: flex; justify-content: center; background: var(--c-media-dark); }
  .storybox { width: var(--reel-w); height: 100%; }
</style>
