<script lang="ts">
  import Icon from "../../components/Icon.svelte";
  import { nav } from "../../lib/nav.svelte";
  import { fb, type FbTab } from "../fbnav.svelte";
  import { waitingOnMe } from "../flows.svelte";
  import { NOTIFS } from "../data";

  /** IOS: floating frosted bar 366 x 52, 21 above the bottom; Home, Reels, Friends, Marketplace, Notifications, Profile; 61 x 52 each. */
  const unseen = $derived(NOTIFS.filter((n) => n.unread).length + waitingOnMe().length);
  const tabs: { id: FbTab | null; icon: string; on?: string; label: string }[] = [
    { id: "home", icon: "nav_home", on: "nav_home_active", label: "Home" },
    { id: "reels", icon: "nav_reels", label: "Reels" },
    { id: "friends", icon: "nav_friends", label: "Friends" }, // profile
    { id: "marketplace", icon: "nav_marketplace", label: "Marketplace" },
    { id: "notifications", icon: "fbs_bell", label: "Notifications" },
    { id: "profile", icon: "fbs_profile", label: "Profile" }, // profile
  ];
</script>

<nav class="tabbar" aria-label="Facebook">
  {#each tabs as t (t.label)}
    {#if t.id}
      {@const id = t.id}
      <button class="tab" class:on={fb.tab === id} aria-current={fb.tab === id ? "page" : undefined} aria-label={id === "notifications" && unseen ? `${t.label}, ${unseen} new` : t.label} onclick={() => nav.toFacebook(id)}>
        <Icon name={fb.tab === id && t.on ? t.on : t.icon} />
        {#if id === "notifications" && unseen}<span class="badge" aria-hidden="true">{unseen}</span>{/if}
      </button>
    {:else}
      <button class="tab" aria-disabled="true" title="Not in this prototype" aria-label={t.label}><Icon name={t.icon} /></button>
    {/if}
  {/each}
</nav>

<style>
  .tabbar {
    position: absolute;
    z-index: 10;
    left: 50%;
    bottom: var(--tabbar-float-bottom);
    transform: translateX(-50%);
    width: min(var(--tabbar-float-w), calc(100% - var(--sp-16)));
    height: var(--tabbar-float-h);
    display: flex;
    border-radius: var(--r-tabbar-float);
    background: var(--c-tabbar-float);
    -webkit-backdrop-filter: blur(var(--blur-tabbar)) saturate(1.8);
    backdrop-filter: blur(var(--blur-tabbar)) saturate(1.8);
    box-shadow: var(--sh-tabbar-float), inset 0 0 0 1px var(--c-hairline);
  }
  .tab { position: relative; flex: 1; height: 100%; display: inline-flex; align-items: center; justify-content: center; color: var(--c-fb-tab-idle); --icon-size: var(--fb-tab-icon); }
  .tab.on { color: var(--c-fb-tab-selected); }
  /* Over a reel the bar goes dark (assumed: the reel viewer is black in both themes). */
  :global(.fbapp.dark) .tabbar { background: var(--c-media-chip); box-shadow: var(--sh-tabbar-float), inset 0 0 0 1px var(--c-hairline); }
  :global(.fbapp.dark) .tab:not(.on) { color: var(--c-on-media); }
  .badge {
    position: absolute;
    top: var(--sp-6);
    left: 54%;
    min-width: var(--sp-16);
    height: var(--sp-16);
    padding: 0 var(--sp-4);
    border-radius: var(--r-pill);
    background: var(--c-badge);
    color: var(--c-white);
    font-size: var(--fs-tab);
    line-height: var(--sp-16);
    font-weight: var(--fw-medium);
    text-align: center;
  }
</style>
