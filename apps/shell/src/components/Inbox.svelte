<script lang="ts">
  import { store } from "../store";
  import { knownAs, viewerId } from "../lib/media";
  import Avatar from "./Avatar.svelte";
  import ChatRows from "./ChatRows.svelte";
  import Filters from "./Filters.svelte";
  import Icon from "./Icon.svelte";
  import MakeSheet from "./MakeSheet.svelte";
  import MuseMark from "./MuseMark.svelte";
  import { nav } from "../lib/nav.svelte";
  import type { Note } from "../store/types";
  import NeedsYou from "../surfaces/components/NeedsYou.svelte"; // surfaces

  let open = $state<Note | null>(null);
  const notes = $derived(store.notes);
  const unreadCount = $derived(store.chats.filter((c) => c.unread).length);
</script>

<div class="inbox">
  <div class="scroll">
    <header class="top">
      <h1 class="wordmark">messenger</h1>
      <div class="actions">
        <button aria-disabled="true" title="Not in this prototype" aria-label="New message"><Icon name="new_message_compose" /></button>
        <button aria-label="Facebook" onclick={() => nav.toFacebook()}><Icon name="facebook_f_circle" /></button><!-- surfaces: was "Not in this prototype" -->
      </div>
    </header>

    <div class="search-wrap">
      <button class="search" aria-label="Ask Meta AI or search" onclick={() => nav.go({ kind: "search" })}>
        <MuseMark size="var(--sp-20)" />
        <span class="ph">Ask Meta AI or search</span>
        <span class="wave"><Icon name="wave" /></span>
      </button>
    </div>

    <ul class="notes" aria-label="Notes">
      <li class="note me">
        <span class="bubble chip">Post a note</span>
        <button aria-disabled="true" title="Not in this prototype" class="who">
          <Avatar person={store.me} size="var(--avatar-note)" />
          <span class="label">Create note</span>
        </button>
      </li>
      {#each notes.filter((x) => knownAs(x.by) !== viewerId()) as n (n.id)}
        {@const p = store.person(n.by)}
        <li class="note">
          <span class="bubble" class:tool={!!n.tool}>{#if n.tool}<span class="bm"><MuseMark size="var(--sp-14)" /></span>{/if}{n.text}</span>
          <button
            class="who"
            aria-label={n.tool ? `${p?.first}, note: ${n.text}. Open` : `${p?.first}, note: ${n.text}`}
            aria-haspopup={n.tool ? "dialog" : undefined}
            aria-disabled={n.tool ? undefined : "true"}
            title={n.tool ? undefined : "Not in this prototype"}
            onclick={() => n.tool && (open = n)}
          >
            <Avatar person={p} size="var(--avatar-note)" active={p?.active} />
            <span class="label">{p?.first}</span>
          </button>
        </li>
      {/each}
    </ul>

    <Filters />
    <NeedsYou /><!-- surfaces -->
    <ChatRows />
  </div>

  {#if open?.tool}
    <MakeSheet template={store.template(open.tool.templateId)} note={open} onclose={() => (open = null)} />
  {/if}

  <nav class="tabs" aria-label="Messenger">
    <button class="tab on" aria-current="page">
      <span class="ico"><Icon name="chats" />{#if unreadCount}<span class="badge">{unreadCount}</span>{/if}</span>
      <span class="lab">Chats</span>
    </button>
    <button aria-disabled="true" title="Not in this prototype" class="tab"><span class="ico"><Icon name="stories" /></span><span class="lab">Stories</span></button>
    <button aria-disabled="true" title="Not in this prototype" class="tab"><span class="ico"><Icon name="menu" /></span><span class="lab">Menu</span></button>
  </nav>
</div>

<style>
  .inbox { position: relative; display: flex; flex-direction: column; height: 100%; background: var(--c-bg); }
  .scroll { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-top: var(--safe-top); }
  .top {
    height: var(--inbox-header-h);
    padding: 0 var(--sp-16);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .wordmark {
    font-size: var(--fs-wordmark);
    line-height: var(--lh-wordmark);
    font-weight: var(--fw-bold);
    color: var(--c-accent);
    letter-spacing: 0;
  }
  .actions { display: flex; gap: var(--sp-4); --icon-size: var(--sp-24); }
  .actions button {
    width: var(--hit);
    height: var(--hit);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-round);
    color: var(--c-text);
  }

  .search-wrap { padding: var(--sp-4) var(--sp-16) var(--sp-8); }
  .search {
    width: 100%;
    height: var(--search-h);
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    padding: 0 var(--sp-12);
    /* IOS_FINDINGS: a rounded rectangle, radius 10, 37 tall, not a pill. */
    border-radius: var(--r-search);
    background: var(--c-field);
    text-align: left;
  }
  .ph { flex: 1; font-size: var(--fs-search); line-height: var(--lh-search); color: var(--c-text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .wave { color: var(--c-text-2); --icon-size: var(--sp-20); display: inline-flex; }

  /*
   * Notes scroll sideways with the avatars. Each note is a column: its bubble sits in the flow above
   * the avatar and is narrower than the column, so a bubble can never touch its neighbour.
   */
  .notes {
    display: flex;
    align-items: flex-end;
    gap: var(--sp-8);
    overflow-x: auto;
    padding: var(--sp-4) var(--sp-16) var(--sp-8);
    scrollbar-width: none;
  }
  .notes::-webkit-scrollbar { display: none; }
  .note { flex: none; width: var(--note-w); display: flex; flex-direction: column; align-items: center; }
  .bubble {
    position: relative;
    z-index: 1;
    margin-bottom: calc(var(--sp-12) * -1);
    max-width: var(--note-bubble-max-w);
    padding: var(--sp-6) var(--sp-8);
    border-radius: var(--r-note);
    background: var(--c-note-bubble);
    box-shadow: var(--sh-note);
    font-size: var(--fs-caption);
    line-height: var(--lh-caption);
    color: var(--c-text);
    text-align: center;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .bubble.chip { color: var(--c-text-2); }
  .bm { display: inline-flex; vertical-align: text-bottom; margin-right: var(--sp-4); }
  /* A note with nothing behind it is just a face and a line: not dimmed, not a target. */
  .who[aria-disabled="true"] { opacity: 1; }
  .who { display: flex; flex-direction: column; align-items: center; gap: var(--sp-4); width: 100%; }
  .label { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .tabs {
    flex: none;
    display: flex;
    padding-bottom: var(--safe-bottom);
    background: var(--c-tabbar);
    box-shadow: 0 -1px 0 var(--c-hairline);
  }
  .tab {
    flex: 1;
    height: var(--tabbar-h);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    color: var(--c-text);
  }
  .tab .lab { font-size: var(--fs-tab); line-height: var(--lh-tab); color: var(--c-text-2); }
  /* The icon takes the brand blue; the small label uses the link blue, which keeps 4.5:1 on black. */
  .tab.on { color: var(--c-accent); }
  .tab.on .lab { color: var(--c-link); }
  .ico { position: relative; display: inline-flex; --icon-size: var(--tab-icon); }
  .badge {
    position: absolute;
    top: calc(var(--sp-4) * -1);
    left: 60%;
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
