<script lang="ts">
  import { onMount } from "svelte";
  import Avatar from "../../components/Avatar.svelte";
  import Cover from "../../components/Cover.svelte";
  import Icon from "../../components/Icon.svelte";
  import { nav } from "../../lib/nav.svelte";
  import { ui } from "../../lib/ui.svelte";
  import SearchAsk from "../../muse/components/SearchAsk.svelte";
  import { askFromSearch } from "../../muse/search";
  import { GROUPS, LISTINGS, money } from "../data";
  import { fb } from "../fbnav.svelte";
  import { openProfile } from "../profile-data";
  import { person } from "../say";
  import { fbSearch, search, suggestedEvents, suggestedGroups, suggestedListings, SUGGESTED_SEARCHES, type Hit } from "../search.svelte";

  /**
   * Facebook's search: People, Groups, Posts, Events, Marketplace and Minis from what the shell holds,
   * each row opening its page, and "Ask Muse" last. Phone: its own screen with a field. Desktop: the
   * top bar's field drives it and this is the results column.
   */
  let field: HTMLInputElement | undefined = $state();
  const q = $derived(fbSearch.q);
  const sections = $derived(search(q));
  const typed = $derived(q.trim().length > 0);

  onMount(() => {
    if (!ui.desktop) field?.focus({ preventScroll: true });
  });

  function open(h: Hit) {
    if (h.kind === "person") openProfile(h.id);
    else if (h.kind === "group") nav.go({ kind: "fb", page: { name: "group", id: h.id } });
    else if (h.kind === "post") {
      if (h.group) nav.go({ kind: "fb", page: { name: "group", id: h.group } });
      else {
        fb.focusPost = h.id;
        nav.go({ kind: "fb", page: { name: "home" } });
      }
    } else if (h.kind === "event") nav.go({ kind: "event", id: h.id });
    else if (h.kind === "listing") nav.go({ kind: "fb", page: { name: "listing", id: h.id } });
    else nav.openChat(h.chat, h.id);
  }
  const iconFor = (k: Hit["kind"]) => ({ person: "fbs_profile", group: "fbs_groups", post: "fbs_comment", event: "calendar", listing: "nav_marketplace", mini: "fbs_play" })[k];
</script>

<section class="fs" class:phone={!ui.desktop} aria-label="Search Facebook" data-fb-search>
  {#if !ui.desktop}
    <header class="bar">
      <button class="back" aria-label="Back" onclick={() => nav.back()}><Icon name="back" /></button>
      <label class="field">
        <Icon name="searchOutline" />
        <input bind:this={field} type="search" placeholder="Search Facebook" aria-label="Search Facebook" bind:value={fbSearch.q} onkeydown={(e) => { if (e.key === "Enter" && typed) { e.preventDefault(); const t = q; requestAnimationFrame(() => askFromSearch(t)); } }} />
      </label>
    </header>
  {/if}

  <div class="scroll">
    {#if typed}
      {#each sections as s (s.name)}
        <h2 class="sec">{s.name}</h2>
        <ul>
          {#each s.hits as h (h.key)}
            <li>
              <button class="row" data-hit={h.kind} onclick={() => open(h)}>
                {#if h.kind === "person"}
                  <Avatar person={person(h.id)} size="var(--sp-44)" />
                {:else}
                  <span class="disc"><Icon name={iconFor(h.kind)} /></span>
                {/if}
                <span class="txt"><span class="name">{h.title}</span><span class="meta">{h.sub}</span></span>
              </button>
            </li>
          {/each}
        </ul>
      {/each}
      {#if !sections.length}<p class="none">Nothing on Facebook for “{q.trim()}”</p>{/if}
      <h2 class="sec">Ask Muse</h2>
      <SearchAsk {q} />
    {:else}
      <h2 class="sec">Try searching</h2>
      <ul>
        {#each SUGGESTED_SEARCHES as s (s)}
          <li><button class="row" data-recent onclick={() => { fbSearch.q = s; field?.focus(); }}><span class="disc"><Icon name="searchOutline" /></span><span class="txt"><span class="name">{s}</span></span></button></li>
        {/each}
      </ul>
      <h2 class="sec">Groups</h2>
      <ul>
        {#each suggestedGroups() as g (g.id)}
          <li><button class="row" onclick={() => nav.go({ kind: "fb", page: { name: "group", id: g.id } })}><span class="sq"><Cover id={g.cover ?? g.id} width={44} alt="" /></span><span class="txt"><span class="name">{g.name}</span><span class="meta">{g.privacy}</span></span></button></li>
        {/each}
      </ul>
      <h2 class="sec">Events</h2>
      <ul>
        {#each suggestedEvents() as e (e.id)}
          <li><button class="row" onclick={() => nav.go({ kind: "event", id: e.id })}><span class="disc"><Icon name="calendar" /></span><span class="txt"><span class="name">{e.title}</span><span class="meta">{e.venue}</span></span></button></li>
        {/each}
      </ul>
      <h2 class="sec">On Marketplace</h2>
      <ul>
        {#each suggestedListings() as l (l.id)}
          <li><button class="row" onclick={() => nav.go({ kind: "fb", page: { name: "listing", id: l.id } })}><span class="disc"><Icon name="nav_marketplace" /></span><span class="txt"><span class="name">{money(l.price)} · {l.title}</span><span class="meta">{l.where}</span></span></button></li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

<style>
  .fs { position: relative; display: flex; flex-direction: column; height: 100%; background: var(--c-bg); color: var(--c-text); }
  .phone { padding-top: var(--safe-top); }
  .bar { display: flex; align-items: center; gap: var(--sp-4); height: var(--header-h); padding: 0 var(--sp-16) 0 var(--sp-4); }
  .back { width: var(--hit); height: var(--hit); display: inline-flex; align-items: center; justify-content: center; color: var(--c-accent-icon); --icon-size: var(--sp-28); }
  .field { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--sp-8); height: var(--search-h); padding: 0 var(--sp-12); border-radius: var(--r-pill); background: var(--c-field); color: var(--c-text-2); --icon-size: var(--sp-20); }
  .field input { flex: 1; min-width: 0; border: 0; background: none; outline: none; font-size: var(--fs-search); line-height: var(--lh-search); color: var(--c-text); }
  .field input::placeholder { color: var(--c-text-2); opacity: 1; }
  .field:focus-within { box-shadow: 0 0 0 1px var(--c-accent-icon); }
  .scroll { flex: 1; min-height: 0; overflow-y: auto; padding-bottom: var(--safe-bottom); }
  :global(:root[data-layout="desktop"]) .fs { width: min(var(--fb-card-w), 100%); margin: var(--sp-16) auto var(--sp-32); height: auto; border-radius: var(--r-card); box-shadow: var(--sh-card); }
  .sec { padding: var(--sp-16) var(--sp-16) var(--sp-4); font-size: var(--fs-row-sub); line-height: var(--lh-row-sub); font-weight: var(--fw-semibold); color: var(--c-text); }
  .row { width: 100%; display: flex; align-items: center; gap: var(--sp-12); min-height: var(--sp-60); padding: var(--sp-8) var(--sp-16); text-align: left; }
  .row:active, .row:hover { background: var(--c-hover); }
  .disc, .sq { flex: none; width: var(--sp-44); height: var(--sp-44); border-radius: var(--r-round); background: var(--c-field); display: inline-flex; align-items: center; justify-content: center; color: var(--c-text-2); --icon-size: var(--sp-20); overflow: hidden; }
  .sq { border-radius: var(--r-group-avatar); }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .name { font-size: var(--fs-row-name); line-height: var(--lh-row-name); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .none { padding: var(--sp-16); text-align: center; color: var(--c-text-2); font-size: var(--fs-row-sub); line-height: var(--lh-row-sub); }
</style>
