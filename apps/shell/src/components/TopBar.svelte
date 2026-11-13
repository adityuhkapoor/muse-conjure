<script lang="ts">
  import { store } from "../store";
  import Avatar from "./Avatar.svelte";
  import Icon from "./Icon.svelte";
  import { nav } from "../lib/nav.svelte";
  // surfaces: working Home, Reels, Marketplace, Groups and Gaming slots, the bell's panel
  import TopBarFb from "../surfaces/components/TopBarFb.svelte";
  import { fbSlot, onFb } from "../surfaces/topbar";
  import { fbSearch } from "../surfaces/search.svelte";

  /** Five slots as on Facebook. Events are reached from the link bubble, not from here. */
  const items = [
    { icon: "nav_home", label: "Home" },
    { icon: "nav_friends", label: "Friends" },
    { icon: "nav_reels", label: "Reels" },
    { icon: "nav_marketplace", label: "Marketplace" },
    { icon: "fbs_groups", label: "Groups" }, // surfaces
    { icon: "nav_gaming", label: "Gaming" },
  ];
  /** The top bar's field drives Facebook's results: typing opens them. */
  function openSearch() {
    if (nav.desktopFb?.name !== "search" || nav.desktopEvent) nav.go({ kind: "fb", page: { name: "search" } });
  }
  const onEvents = $derived(nav.desktopEvent !== null || onFb()); // surfaces: Messenger is "on" only in Messenger
</script>

<header class="bar">
  <div class="left">
    <button class="logo" aria-label="Facebook" onclick={() => nav.toFacebook()}><Icon name="facebook_logo" /></button><!-- surfaces: logo goes to Facebook Home -->
    <label class="search">
      <Icon name="search_magnifier" />
      <input type="search" placeholder="Search Facebook" aria-label="Search" bind:value={fbSearch.q} onfocus={openSearch} oninput={openSearch} onkeydown={(e) => e.key === "Enter" && openSearch()} />
    </label>
  </div>
  <nav class="center" aria-label="Main">
    {#each items as n (n.icon)}
      {@const slot = fbSlot(n.label)}
      {#if slot}
        <button class="nav" class:on={slot.on} aria-current={slot.on ? "page" : undefined} aria-label={n.label} onclick={slot.go}><Icon name={slot.on && n.icon === "nav_home" ? "nav_home_active" : n.icon} /></button><!-- surfaces -->
      {:else}
        <button
          class="nav"
          aria-disabled="true"
          title="Not in this prototype"
          aria-label={n.label}
        ><Icon name={n.icon} /></button>
      {/if}
    {/each}
  </nav>
  <div class="right">
    <button aria-disabled="true" title="Not in this prototype" class="circle" aria-label="Menu"><Icon name="top_menu_grid" /></button>
    <button class="circle" class:on={!onEvents} aria-label="Messenger" aria-current={onEvents ? undefined : "page"} onclick={() => nav.toMessenger()}><Icon name="top_messenger" /></button>
    <TopBarFb /><!-- surfaces: the bell opens Notifications -->
    <button class="me" aria-label="Your profile" onclick={() => nav.go({ kind: "fb", page: { name: "profile", id: "me" } })}><Avatar person={store.me} size="var(--sp-40)" /></button><!-- profile -->
  </div>
</header>

<style>
  .bar {
    height: var(--topbar-h);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-8);
    padding: 0 var(--sp-16);
    background: var(--c-bg);
    box-shadow: var(--sh-card);
    position: relative;
    z-index: 2;
  }
  .left { display: flex; align-items: center; gap: var(--sp-8); flex: none; }
  .logo { width: var(--sp-40); height: var(--sp-40); color: var(--c-accent); --icon-size: var(--sp-40); display: inline-flex; }
  .search {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    width: calc(var(--sp-80) * 3);
    height: var(--sp-40);
    padding: 0 var(--sp-12);
    border-radius: var(--r-pill);
    background: var(--c-field);
    color: var(--c-text-2);
    --icon-size: var(--sp-16);
  }
  .search input { flex: 1; min-width: 0; border: 0; background: none; outline: none; font-size: var(--fs-search); line-height: var(--lh-search); color: var(--c-text); }
  .search input::placeholder { color: var(--c-text-2); opacity: 1; }
  .center { flex: 1; display: flex; justify-content: center; min-width: 0; }
  .nav {
    flex: 0 1 var(--nav-w);
    height: var(--topbar-h);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--c-nav-inactive);
    border-radius: var(--r-button);
    --icon-size: var(--sp-24);
  }
  .nav:hover { background: var(--c-hover); }
  /* surfaces: the selected slot (MP: blue glyph, 3 px blue bar at the bottom) */
  .nav.on { color: var(--c-accent); box-shadow: inset 0 calc(var(--sp-3) * -1) 0 var(--c-accent); border-radius: 0; }
  .nav.on:hover { background: none; }
  .right { display: flex; align-items: center; gap: var(--sp-8); flex: none; }
  .circle {
    position: relative;
    width: var(--sp-40);
    height: var(--sp-40);
    border-radius: var(--r-round);
    background: var(--c-btn-secondary);
    color: var(--c-text);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    --icon-size: var(--sp-20);
  }
  .circle.on { background: var(--c-selected); color: var(--c-accent); }
  .me { display: inline-flex; border-radius: var(--r-round); }
</style>
