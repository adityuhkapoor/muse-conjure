<script lang="ts">
  import type { FbPage } from "../fbnav.svelte";
  import FbMenu from "./FbMenu.svelte";
  import Gaming from "./Gaming.svelte";
  import GroupPage from "./GroupPage.svelte";
  import ListingPage from "./ListingPage.svelte";
  import OnlinePage from "./OnlinePage.svelte"; // kit
  import StoryViewer from "./StoryViewer.svelte";
  import FbSearch from "./FbSearch.svelte";
  import CreatePost from "./CreatePost.svelte"; // compose
  import { nav } from "../../lib/nav.svelte"; // compose
  import "../fb.css";
  import ProfilePage from "./ProfilePage.svelte"; // profile

  /** Phone: a Facebook page pushed over the app (lib/nav.svelte.ts route kind "fb"). */
  let { page }: { page: FbPage } = $props();
</script>

{#if page.name === "listing"}
  <ListingPage id={page.id} />
{:else if page.name === "online"}
  <OnlinePage item={page.item} /><!-- kit -->
{:else if page.name === "group"}
  <GroupPage id={page.id} />
{:else if page.name === "groups"}
  <FbMenu groups />
{:else if page.name === "gaming"}
  <Gaming />
{:else if page.name === "compose"}
  <CreatePost mode="page" onclose={() => nav.back()} /><!-- compose -->
{:else if page.name === "search"}
  <FbSearch />
{:else if page.name === "story"}
  <StoryViewer id={page.id} />
{:else if page.name === "profile"}
  <ProfilePage id={page.id} /><!-- profile -->
{:else}
  <FbMenu />
{/if}
