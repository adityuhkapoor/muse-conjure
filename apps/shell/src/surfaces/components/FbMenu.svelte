<script lang="ts">
  import Cover from "../../components/Cover.svelte";
  import Avatar from "../../components/Avatar.svelte";
  import Icon from "../../components/Icon.svelte";
  import { nav } from "../../lib/nav.svelte";
  import { store } from "../../store";
  import { GROUPS } from "../data";
  import PageBar from "./PageBar.svelte";

  /** Phone menu (AND: rows 48 pitch, 40 high, 12 inset): the way to Groups, Gaming, Events and Messenger. */
  const rows: { icon: string; label: string; go?: () => void }[] = [
    { icon: "fbs_groups", label: "Groups", go: () => nav.go({ kind: "fb", page: { name: "groups" } }) },
    { icon: "nav_gaming", label: "Gaming", go: () => nav.go({ kind: "fb", page: { name: "gaming" } }) },
    { icon: "calendar", label: "Events", go: () => nav.go({ kind: "event", id: "juniper" }) },
    { icon: "nav_marketplace", label: "Marketplace", go: () => nav.toFacebook("marketplace") },
    { icon: "top_messenger", label: "Messenger", go: () => nav.toMessenger() },
    { icon: "nav_friends", label: "Friends" },
    { icon: "fbs_bookmark", label: "Saved" },
    { icon: "fbs_profile", label: "Settings and privacy" },
  ];
  let { groups = false }: { groups?: boolean } = $props();
</script>

<section class="fb-page" aria-label={groups ? "Groups" : "Menu"}>
  <PageBar title={groups ? "Groups" : "Menu"} />
  <div class="fb-scroll">
    {#if groups}
      <h2 class="fb-section sh">Your groups</h2>
      <ul class="rows">
        {#each GROUPS as g (g.id)}
          <li><button class="row" onclick={() => nav.go({ kind: "fb", page: { name: "group", id: g.id } })}><span class="gsq t{g.tone}" aria-hidden="true"><Cover id={g.cover} width={36} alt="" /></span><span class="lab">{g.name}</span><span class="chev"><Icon name="chevronRight" /></span></button></li>
        {/each}
      </ul>
    {:else}
      <div class="me"><Avatar person={store.me} size="var(--sp-40)" /><span class="lab">{store.me.name}</span></div>
      <ul class="rows">
        {#each rows as r (r.label)}
          <li>
            {#if r.go}
              {@const go = r.go}
              <button class="row" onclick={go}><span class="ic"><Icon name={r.icon} /></span><span class="lab">{r.label}</span><span class="chev"><Icon name="chevronRight" /></span></button>
            {:else}
              <button class="row" aria-disabled="true" title="Not in this prototype"><span class="ic"><Icon name={r.icon} /></span><span class="lab">{r.label}</span></button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

<style>
  .me { display: flex; align-items: center; gap: var(--sp-12); padding: var(--sp-12) var(--sp-16); }
  .sh { padding: var(--sp-12) var(--sp-16) var(--sp-4); }
  .rows { padding: 0 var(--sp-8); }
  .row { width: 100%; min-height: var(--sp-48); display: flex; align-items: center; gap: var(--sp-12); padding: var(--sp-4) var(--sp-8); border-radius: var(--r-button); text-align: left; }
  .row:active { background: var(--c-hover); }
  .ic { width: var(--sp-36); height: var(--sp-36); border-radius: var(--r-round); background: var(--c-btn-secondary); display: inline-flex; align-items: center; justify-content: center; --icon-size: var(--sp-20); flex: none; }
  .gsq { overflow: hidden; display: inline-block; width: var(--group-avatar); height: var(--group-avatar); border-radius: var(--r-group-avatar); background: linear-gradient(140deg, var(--c-ph-1), var(--c-ph-2)); flex: none; }
  .gsq.t3 { background: linear-gradient(140deg, var(--c-ph-3), var(--c-ph-2)); }
  .lab { flex: 1; min-width: 0; font-size: var(--fs-fb-body); line-height: var(--lh-fb-body); font-weight: var(--fw-medium); }
  .chev { color: var(--c-text-2); --icon-size: var(--sp-16); display: inline-flex; }
</style>
