<script lang="ts">
  import "../fb.css";
  import { fb } from "../fbnav.svelte";
  import FbHeader from "./FbHeader.svelte";
  import FbTabBar from "./FbTabBar.svelte";
  import Home from "./Home.svelte";
  import Marketplace from "./Marketplace.svelte";
  import Notifications from "./Notifications.svelte";
  import Reels from "./Reels.svelte";
  import Friends from "./Friends.svelte"; // profile
  import ProfilePage from "./ProfilePage.svelte"; // profile

  /** The Facebook app on the phone: a tab under the floating tab bar. Switching tabs has no transition (AND). */
</script>

<div class="fbapp" class:dark={fb.tab === "reels"} data-fb-tab={fb.tab}>
  {#if fb.tab === "home"}
    <div class="fb-scroll pad">
      <FbHeader />
      <Home />
    </div>
  {:else if fb.tab === "marketplace"}
    <div class="fb-scroll pad"><Marketplace /></div>
  {:else if fb.tab === "notifications"}
    <div class="fb-scroll pad"><Notifications /></div>
  {:else if fb.tab === "friends"}
    <div class="fb-scroll pad"><Friends /></div><!-- profile -->
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
</style>
