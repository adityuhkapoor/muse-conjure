<script lang="ts">
  import { store } from "../store";
  import { ME, type Chat } from "../store/types";
  import { rowTime } from "../lib/thread";
  import Avatar from "./Avatar.svelte";
  import GroupAvatar from "./GroupAvatar.svelte";
  import MuseMark from "./MuseMark.svelte";
  import { nav } from "../lib/nav.svelte";
  import { listView } from "../lib/ui.svelte";

  let { selectedId = null }: { selectedId?: string | null } = $props();

  /** A live tool that needs me takes the place of the last-message preview. */
  const liveTool = (chat: Chat) => store.toolsFor(chat.id).find((t) => t.needsMe);

  function preview(chat: Chat): string {
    const m = chat.messages.filter((x) => x.kind !== "system" && x.kind !== "activity").at(-1);
    if (!m) return "";
    const who = m.from === ME ? "You: " : chat.kind === "group" ? `${store.person(m.from)?.first ?? ""}: ` : "";
    const body = m.kind === "photo" ? "sent a photo" : m.kind === "link" ? "sent a link" : m.kind === "muse" ? (m.muse?.building ? "Muse is conjuring a Mini…" : `Muse conjured ${m.muse?.title ?? ""}`) : (m.text ?? "");
    return m.kind === "muse" ? body : who + body;
  }
  const lastAt = (chat: Chat) => chat.messages.filter((x) => x.kind !== "system" && x.kind !== "activity").at(-1)?.at ?? 0;
  const others = (chat: Chat) => chat.members.filter((id) => id !== ME).map((id) => store.person(id));
  const isActive = (chat: Chat) => (chat.kind === "dm" ? chat.activeNow : false);

  const shown = $derived.by(() => {
    const q = listView.query.trim().toLowerCase();
    return store.chats.filter(
      (c) =>
        (listView.filter === "all" || (listView.filter === "unread" ? c.unread : c.kind === "group")) &&
        (!q || c.name.toLowerCase().includes(q) || others(c).some((p) => p?.name.toLowerCase().includes(q))),
    );
  });
  const emptyText = $derived(listView.query.trim() ? "No chats match" : listView.filter === "unread" ? "No unread chats" : "No group chats");
</script>

{#if !shown.length}<p class="none">{emptyText}</p>{/if}
<ul class="rows">
  {#each shown as chat (chat.id)}
    {@const live = liveTool(chat)}
    <li>
      <button
        class="row"
        class:unread={chat.unread}
        class:selected={selectedId === chat.id}
        aria-current={selectedId === chat.id ? "true" : undefined}
        onclick={() => nav.openChat(chat.id, live?.id)}
      >
        {#if chat.kind === "group"}
          <GroupAvatar people={others(chat)} />
        {:else}
          <Avatar person={others(chat)[0]} active={isActive(chat)} />
        {/if}
        <span class="text">
          <span class="name">{chat.name}</span>
          <span class="sub" class:live={!!live}>
            {#if live}
              <span class="mark"><MuseMark size="var(--sp-16)" /></span>
              <span class="preview" data-live-tool>{live.name} · {live.summary}</span>
            {:else}
              <span class="preview">{preview(chat)}</span>
            {/if}
            <span class="time">&nbsp;·&nbsp;{rowTime(lastAt(chat), store.now())}</span>
          </span>
        </span>
        {#if chat.unread}<span class="udot" role="img" aria-label="Unread"></span>{/if}
      </button>
    </li>
  {/each}
</ul>

<style>
  /* IOS_FINDINGS: row pitch 76, avatar 60 at x 24, text 12 after it, unread dot 8 at x 8. */
  .row {
    position: relative;
    width: 100%;
    min-height: var(--row-min-h);
    display: flex;
    align-items: center;
    gap: var(--row-text-gap);
    padding: var(--sp-8) var(--sp-16) var(--sp-8) var(--row-pad-left);
    text-align: left;
  }
  /* SIGNED_IN_FINDINGS: a 72 row inset 8, radius 8; hover is an overlay child fading in over 100 ms. */
  :global(:root[data-layout="desktop"]) .row {
    width: calc(100% - var(--sp-16));
    margin: 0 var(--sp-8);
    padding: var(--sp-8);
    border-radius: var(--r-button);
  }
  .row::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--c-hover);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--dur-xxs) var(--ease-linear);
  }
  :global(:root[data-layout="desktop"]) .row:hover::after, .row:active::after { opacity: 1; }
  .row.selected { background: var(--c-selected); }
  .none { padding: var(--sp-24) var(--sp-16); text-align: center; font-size: var(--fs-row-sub); line-height: var(--lh-row-sub); color: var(--c-text-2); }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .name {
    font-size: var(--fs-row-name);
    line-height: var(--lh-row-name);
    color: var(--c-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub {
    display: flex;
    min-width: 0;
    font-size: var(--fs-row-sub);
    line-height: var(--lh-row-sub);
    color: var(--c-text-2);
  }
  .mark { flex: none; display: inline-flex; align-items: center; margin-right: var(--sp-4); }
  .sub.live { color: var(--c-text); font-weight: var(--fw-medium); }
  .preview { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .time { flex: none; white-space: nowrap; }
  .unread .name, .unread .sub { font-weight: var(--fw-semibold); }
  .unread .sub { color: var(--c-text); }
  :global(:root[data-layout="desktop"]) .name { font-weight: var(--fw-medium); }
  .udot {
    flex: none;
    width: var(--dot-unread);
    height: var(--dot-unread);
    border-radius: var(--r-round);
    background: var(--c-unread-dot);
    margin-left: var(--sp-4);
  }
  /* Phone: at the far left, in the row's inset, not at the right edge. */
  :global(:root[data-layout="phone"]) .udot {
    position: absolute;
    left: calc((var(--row-pad-left) - var(--dot-unread)) / 2);
    top: calc(50% - var(--dot-unread) / 2);
    margin: 0;
  }
</style>
