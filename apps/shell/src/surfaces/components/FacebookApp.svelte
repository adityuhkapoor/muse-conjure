<script lang="ts">
  import "../fb.css";
  import { fb } from "../fbnav.svelte";
  import FbHeader from "./FbHeader.svelte";
  import FbTabBar from "./FbTabBar.svelte";
  import Home from "./Home.svelte";
  import Marketplace from "./Marketplace.svelte";
  import MarketplaceHeader from "./MarketplaceHeader.svelte";
  import Notifications from "./Notifications.svelte";
  import NotificationsHeader from "./NotificationsHeader.svelte";
  import Reels from "./Reels.svelte";
  import Friends from "./Friends.svelte"; // profile
  import FriendsHeader from "./FriendsHeader.svelte"; // profile
  import ProfilePage from "./ProfilePage.svelte"; // profile

  /** The Facebook app on the phone: a tab under the floating tab bar. Switching tabs has no transition (AND). */
  let homeScroll = $state<HTMLElement | undefined>(undefined);
  let mpScroll = $state<HTMLElement | undefined>(undefined);
  let notifScroll = $state<HTMLElement | undefined>(undefined);
  let friendsScroll = $state<HTMLElement | undefined>(undefined);
</script>

<div class="fbapp" class:dark={fb.tab === "reels"} data-fb-tab={fb.tab}>
  {#if fb.tab === "home"}
    <div class="home">
      <div class="fb-scroll pad home-pad" bind:this={homeScroll}>
        <Home />
      </div>
      {#if homeScroll}<FbHeader scroller={homeScroll} />{/if}
    </div>
  {:else if fb.tab === "marketplace"}
    <div class="pos-rel">
      <div class="fb-scroll pad" bind:this={mpScroll}><Marketplace /></div>
      {#if mpScroll}<MarketplaceHeader scroller={mpScroll} />{/if}
    </div>
  {:else if fb.tab === "notifications"}
    <div class="pos-rel">
      <div class="fb-scroll pad" bind:this={notifScroll}><Notifications /></div>
      {#if notifScroll}<NotificationsHeader scroller={notifScroll} />{/if}
    </div>
  {:else if fb.tab === "friends"}
    <div class="pos-rel">
      <div class="fb-scroll pad" bind:this={friendsScroll}><Friends /></div>
      {#if friendsScroll}<FriendsHeader scroller={friendsScroll} />{/if}
    </div><!-- profile -->
  {:else if fb.tab === "profile"}
    <ProfilePage id="me" tab /><!-- profile -->
  {:else}
    <Reels />
  {/if}
  <FbTabBar />
</div>

<style>
  .fbapp { position: relative; display: flex; flex-direction: column; height: 100%; background: var(--c-bg); }
  .fbapp.dark { background: var(--c-media-dark); }
  .pad { padding-bottom: calc(var(--tabbar-float-h) + var(--tabbar-float-bottom) + var(--sp-24)); }
  .home, .pos-rel { position: relative; flex: 1; min-height: 0; }
  .home > .fb-scroll, .pos-rel > .fb-scroll { height: 100%; }
  .home-pad { padding-top: calc(var(--fb-header-h) + var(--safe-top)); }
</style>
