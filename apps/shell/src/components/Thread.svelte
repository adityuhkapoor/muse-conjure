<script lang="ts">
  import { onMount, tick } from "svelte";
  import { store } from "../store";
  import { ME, type Message } from "../store/types";
  import { buildRows, clockTime, stampLabel } from "../lib/thread";
  import { ui } from "../lib/ui.svelte";
  import { nav } from "../lib/nav.svelte";
  import Avatar from "./Avatar.svelte";
  import Bubble from "./Bubble.svelte";
  import Composer from "./Composer.svelte";
  import GroupAvatar from "./GroupAvatar.svelte";
  import Icon from "./Icon.svelte";
  import MuseMark from "./MuseMark.svelte";
  import ReactionMenu from "./ReactionMenu.svelte";
  import Sheet from "./Sheet.svelte";
  import Jump from "../phone/Jump.svelte"; // phone: scroll-to-bottom button
  import ReelShareOption from "../surfaces/components/ReelShareOption.svelte"; // surfaces

  /** `focus`: scroll to a tool's card once (`n` tells a repeat request from the same one). */
  type Props = { chatId: string; onback?: () => void; focus?: { tool: string; n: number } | null };
  let { chatId, onback, focus = null }: Props = $props();

  const chat = $derived(store.chat(chatId)!);
  const rows = $derived(buildRows(chat.messages, chat.kind === "group", ME));
  const byId = $derived(new Map(chat.messages.map((m) => [m.id, m])));
  const others = $derived(chat.members.filter((id) => id !== ME).map((id) => store.person(id)));
  const anyActive = $derived(chat.kind === "dm" ? chat.activeNow : others.some((p) => p?.active));
  const last = $derived(chat.messages.at(-1));
  const showSeen = $derived(!!last && last.from === ME && chat.seenBy.length > 0 && !last.pending);
  const seenNames = $derived(chat.seenBy.map((id) => store.person(id)?.first).filter(Boolean).join(" and "));

  /** "Tell Muse what to change": the next message from the composer changes this tool. */
  let changeTarget = $state<{ toolId: string; title: string } | null>(null);
  let focusKey = $state(0);
  function startChange(m: Message) {
    if (!m.muse?.toolId) return;
    changeTarget = { toolId: m.muse.toolId, title: m.muse.title };
    focusKey += 1;
  }
  $effect(() => {
    void chatId;
    changeTarget = null;
  });

  const tools = $derived(store.toolsFor(chatId));
  const pinTool = $derived(tools[0]);
  /** The pinned bar steps aside while the one tool it points at is on screen. */
  let cardOnScreen = $state(false);
  // Safari's layer mode starts the list under the bar, so a bar that stepped aside would leave a
  // blank band there: it stays.
  const layerMode = document.documentElement.dataset.frames === "layer";
  const pinAway = $derived(tools.length === 1 && cardOnScreen && !layerMode);
  /** The chat's theme: one gradient behind the list, and the icons take its colour at their place. */
  const theme = $derived(chat.theme ?? "default");
  $effect(() => {
    const id = tools.length === 1 ? pinTool?.cardId : undefined;
    const root = listEl;
    if (!id || !root) return;
    let io: IntersectionObserver | undefined;
    let seenEl: Element | null = null;
    const watch = () => {
      const el = root.querySelector(`[data-id="${id}"] [data-muse-card]`);
      if (!el || el === seenEl) return;
      seenEl = el;
      io?.disconnect();
      const top = parseFloat(getComputedStyle(root).paddingTop) || 0;
      io = new IntersectionObserver(([e]) => (cardOnScreen = !!e && e.isIntersecting), { root, rootMargin: `-${top}px 0px 0px 0px`, threshold: 0.35 });
      io.observe(el);
    };
    watch();
    const mo = new MutationObserver(watch);
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      io?.disconnect();
      cardOnScreen = false;
    };
  });
  const chips = $derived(store.suggestions ? store.suggestions(chatId) : ((s) => (s ? [s] : []))(store.suggestion(chatId)));
  let addSheet = $state(false);
  let toolSheet = $state(false);
  let flashId = $state<string | null>(null);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  /** "**Maya** spun the wheel" -> [{b:false,t:""},{b:true,t:"Maya"},...] */
  const parts = (text: string) => text.split("**").map((t, i) => ({ b: i % 2 === 1, t }));

  /** Scrolls the list so the tool's card sits just under the header and pinned bar. */
  function toTool(toolId: string, smooth = true) {
    const tool = store.tool(toolId);
    const el = listEl?.querySelector<HTMLElement>(`[data-id="${tool?.cardId}"]`);
    if (!listEl || !el) return;
    const inset = parseFloat(getComputedStyle(listEl).paddingTop) || 0;
    const top = listEl.scrollTop + el.getBoundingClientRect().top - listEl.getBoundingClientRect().top - inset;
    listEl.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "instant" });
    flashId = tool!.cardId;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (flashId = null), 1200);
  }
  function pinTap() {
    if (tools.length > 1) toolSheet = true;
    else if (pinTool) toTool(pinTool.id);
  }
  function pickTool(id: string) {
    toolSheet = false;
    toTool(id);
  }
  function acceptSuggestion(templateId: string) {
    store.dismissSuggestion(chatId); // taking it counts as handled: it does not come back
    addSheet = false;
    store.buildTool(chatId, templateId);
  }

  // The pinned bar adds height at the top of the list. When the first tool lands in a chat, keep
  // the messages where they are on screen instead of letting them drop by the bar's height.
  // svelte-ignore state_referenced_locally
  let hadPin = !!pinTool;
  $effect(() => {
    const has = !!pinTool;
    if (has === hadPin || !listEl) return;
    hadPin = has;
    if (ui.desktop) return; // on desktop the bar is in flow above the list
    const h = parseFloat(getComputedStyle(listEl).getPropertyValue("--pin-h")) || 0;
    const el = listEl;
    tick().then(() => (el.scrollTop += has ? h : -h));
  });

  let handled = -1;
  $effect(() => {
    const f = focus;
    if (!f || f.n === handled || !listEl) return;
    handled = f.n;
    tick().then(() => toTool(f.tool, false));
  });

  const initialIds = new Set<string>();
  let listEl: HTMLElement | undefined = $state();
  let menu = $state<{ msg: Message; el: HTMLElement } | undefined>();

  onMount(() => {
    chat.messages.forEach((m) => initialIds.add(m.id));
    store.markRead(chatId);
    if (listEl) listEl.scrollTop = listEl.scrollHeight;
  });

  // The outgoing bubbles show the part of the chat's gradient behind them: the gradient is as tall
  // as the list's visible area (Bubble.svelte positions it from a scroll-driven animation).
  // On a phone the gradient is fixed to the screen (the thread page), so a bubble shows the same
  // colour at the same screen height whether the list starts under the header (Chrome) or below it
  // (Safari's frame layer); the header and composer icons take it at their own place. On desktop it
  // is carried by the scroller, as on the web.
  $effect(() => {
    const el = listEl;
    const page = el?.closest<HTMLElement>(".thread");
    if (!el || !page) return;
    const set = () => {
      const desk = ui.desktop;
      el.style.setProperty("--scroll-h", `${el.clientHeight}px`);
      el.style.setProperty("--grad-h", `${desk ? el.clientHeight : page.clientHeight}px`);
      el.style.setProperty("--grad-off", `${desk ? 0 : el.getBoundingClientRect().top - page.getBoundingClientRect().top}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    ro.observe(page);
    // A change of layout or frame mode moves the list without resizing it.
    const mo = new MutationObserver(set);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-frames", "data-layout"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  });

  // Keep the list pinned to the bottom when something new arrives. Real overflow scrolling stays
  // in charge of physics; this only sets the resting position.
  let seen = -1;
  // phone: when scrolled up, new messages from others do not yank the list; a button offers the jump.
  let stuck = true;
  let unread = $state(0);
  let seenMsgs = -1;
  const onlist = () => {
    if (!listEl) return;
    stuck = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 80;
    if (stuck) unread = 0;
  };
  const jump = () => listEl?.scrollTo({ top: listEl.scrollHeight, behavior: "smooth" });
  $effect(() => {
    const count = chat.messages.length + chat.typing.length;
    const msgs = chat.messages.length;
    const grew = seenMsgs === -1 ? 0 : msgs - seenMsgs;
    seenMsgs = msgs;
    if (seen === -1) {
      seen = count;
      return;
    }
    if (count === seen) return;
    seen = count;
    store.markRead(chatId);
    if (!stuck && last?.from !== ME) {
      if (grew > 0) unread += grew;
      return;
    }
    tick().then(() => listEl?.scrollTo({ top: listEl.scrollHeight, behavior: "smooth" }));
  });

  function openMenu(msg: Message, el: HTMLElement) {
    menu = { msg, el };
  }
  function pick(emoji: string) {
    if (menu) store.react(chatId, menu.msg.id, emoji);
    menu = undefined;
  }
  const status = $derived(anyActive ? "Active now" : "Active 2h ago");
</script>

<section
  class="thread"
  class:has-pin={!!pinTool}
  class:pin-away={pinAway}
  aria-label={`Chat with ${chat.name}`}
  data-theme-name={theme}
  data-chat={chatId}
  style:--t-top={`var(--theme-${theme}-top)`}
  style:--t-bottom={`var(--theme-${theme}-bottom)`}
>
  <div class="top">
  <header class="head">
    {#if onback}
      <button class="back" aria-label="Back to chats" onclick={onback}><Icon name="back" /></button>
    {/if}
    <div class="who">
      {#if chat.kind === "group"}
        <GroupAvatar people={others} size="var(--avatar-header)" />
      {:else}
        <Avatar person={others[0]} size="var(--avatar-header)" active={anyActive} />
      {/if}
      <div class="names">
        <h1 class="name">{chat.name}</h1>
        <p class="status">{status}</p>
      </div>
    </div>
    <div class="icons">
      <button aria-disabled="true" title="Not in this prototype" aria-label="Audio call"><Icon name="msgr_call" /></button>
      <button aria-disabled="true" title="Not in this prototype" aria-label="Video call"><Icon name="msgr_video" /></button>
      {#if ui.desktop}<button aria-disabled="true" title="Not in this prototype" aria-label="Chat info"><Icon name="msgr_info" /></button>{/if}
    </div>
  </header>
  {#if pinTool}
    <button class="pin" class:away={pinAway} inert={pinAway} onclick={pinTap} aria-haspopup={tools.length > 1 ? "dialog" : undefined}>
      <span class="pt"><strong>{pinTool.name}</strong> · {pinTool.summary}</span>
      {#if tools.length > 1}<span class="count">{tools.length}<span class="sr-only"> Minis in this chat</span></span>{/if}
      <span class="chev"><Icon name="chevronRight" /></span>
    </button>
  {/if}
  </div>

  <div class="list" bind:this={listEl} tabindex="-1" onscroll={onlist}>
    {#if ui.desktop}
      <div class="intro">
        {#if chat.kind === "group"}
          <GroupAvatar people={others} size="var(--avatar-info)" />
        {:else}
          <Avatar person={others[0]} size="var(--avatar-info)" />
        {/if}
        <h2 class="intro-name">{chat.name}</h2>
        <p class="intro-sub">{chat.kind === "group" ? `${chat.members.length} members` : "College friends"}</p>
      </div>
    {/if}

    {#each rows as row (row.key)}
      {#if row.type === "stamp"}
        <p class="stamp">{stampLabel(row.at, store.now())}</p>
      {:else if row.type === "system"}
        <p class="system">{#each parts(row.msg.text ?? "") as p, i (i)}{#if p.b}<strong>{p.t}</strong>{:else}{p.t}{/if}{/each}</p>
      {:else if row.type === "activity"}
        <button class="system activity" data-activity onclick={() => row.msg.activity && toTool(row.msg.activity.toolId)}>{#each parts(row.msg.text ?? "") as p, i (i)}{#if p.b}<strong>{p.t}</strong>{:else}{p.t}{/if}{/each}</button>
      {:else}
        {@const q = row.msg.replyTo ? byId.get(row.msg.replyTo) : undefined}
        <Bubble
          msg={row.msg}
          pos={row.pos}
          senderLabel={row.senderLabel}
          showAvatar={row.avatar}
          gapBefore={row.gapBefore}
          sender={store.person(row.msg.from)}
          quoted={q}
          quotedSender={q ? store.person(q.from) : undefined}
          fresh={!initialIds.has(row.msg.id) && initialIds.size > 0}
          resolve={(id) => store.person(id)}
          onmenu={openMenu}
          onheart={(m) => store.reactOnce(chatId, m.id, "❤️")}
          onlink={(m) => m.link?.eventId && nav.go({ kind: "event", id: m.link.eventId })}
          flash={flashId === row.msg.id}
          onchangetool={store.live ? startChange : undefined}
          onchip={store.live ? (m) => m.chip && store.buildTool(chatId, m.chip.id, { title: m.chip.name, lab: true }): undefined}
        />
        {#if row.msg.link?.shared}<ReelShareOption {chatId} msg={row.msg} />{/if}<!-- surfaces -->
      {/if}
    {/each}

    {#if showSeen}
      <div class="seen" role="img" aria-label={`Seen by ${seenNames}`}>
        {#each [...new Set(chat.seenBy)] as id (id)}
          <Avatar person={store.person(id)} size="var(--avatar-seen)" />
        {/each}
      </div>
    {:else if last && last.from === ME && last.pending}
      <p class="sending">Sending</p>
    {/if}

    {#if chat.typing.length}
      <div class="typing-row" role="status" aria-label={`${store.person(chat.typing[0]!)?.first} is typing`}>
        <div class="av-col"><Avatar person={store.person(chat.typing[0]!)} size="var(--avatar-msg)" /></div>
        <div class="typing"><span></span><span></span><span></span></div>
      </div>
    {/if}
    <div class="tail"></div>
  </div>

  <div class="dock">
    {#if unread > 0}<Jump count={unread} onjump={jump} />{/if}
    {#if chips.length}
      <div class="chips" role="group" aria-label="Minis for this chat">
        {#each chips as c, i (c.templateId)}
          <span class="chip">
            <button class="go" onclick={() => acceptSuggestion(c.templateId)}><MuseMark size="var(--sp-16)" />{c.label}</button>
            {#if i === chips.length - 1}<button class="x" aria-label="Dismiss suggestions" onclick={() => store.dismissSuggestion(chatId)}><Icon name="close" /></button>{/if}
          </span>
        {/each}
      </div>
    {/if}
    <Composer
      ontools={() => (addSheet = true)}
      onsend={(t) => {
        if (changeTarget) store.send(chatId, t, { changeTool: changeTarget.toolId });
        else store.send(chatId, t);
        changeTarget = null;
      }}
      onlike={() => store.send(chatId, "👍")}
      ontyping={(on) => store.setTyping?.(chatId, on)}
      target={changeTarget}
      oncleartarget={() => (changeTarget = null)}
      {focusKey}
    />
  </div>

  {#if addSheet}
    <Sheet label="Conjure" onclose={() => (addSheet = false)}>
      <h2 class="sheet-title">Conjure</h2>
      <ul class="tool-list">
        {#each store.templates as t (t.id)}
          <li>
            <button class="tool-row" onclick={() => acceptSuggestion(t.id)}>
              <MuseMark size="var(--sp-28)" />
              <span class="tr-text">
                <span class="tr-name">{t.name}</span>
                <span class="tr-sub">{t.blurb}</span>
              </span>
              <span class="chev"><Icon name="chevronRight" /></span>
            </button>
          </li>
        {/each}
      </ul>
    </Sheet>
  {/if}

  {#if toolSheet}
    <Sheet label="Minis in this chat" onclose={() => (toolSheet = false)}>
      <h2 class="sheet-title">Minis in this chat</h2>
      <ul class="tool-list">
        {#each tools as t (t.id)}
          <li>
            <button class="tool-row" onclick={() => pickTool(t.id)}>
              <MuseMark size="var(--sp-28)" />
              <span class="tr-text">
                <span class="tr-name">{t.name}</span>
                <span class="tr-sub">{t.summary}{t.last ? ` · ${store.person(t.last.by)?.first} ${t.last.did}` : ""}</span>
              </span>
              <span class="chev"><Icon name="chevronRight" /></span>
            </button>
          </li>
        {/each}
      </ul>
    </Sheet>
  {/if}

  {#if menu}
    <ReactionMenu
      anchor={menu.el}
      outgoing={menu.msg.from === ME}
      mine={menu.msg.reactions.find((r) => r.by.includes(ME))?.emoji}
      onpick={pick}
      onclose={() => (menu = undefined)}
    />
  {/if}
</section>

<span class="sr-only" aria-live="polite">{last?.from === ME && !last.pending ? `Sent ${clockTime(last.at)}` : ""}</span>

<style>
  .thread {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--c-bg);
    overflow: hidden;
  }

  /*
   * Header block (bar plus pinned tool bar): a frosted bar on phone (DF S6). The glass is mostly opaque
   * with a blur behind it, so content scrolls under it but cannot be read through it. Opaque with a
   * shadow on desktop (MP).
   */
  .top {
    position: absolute;
    z-index: 3;
    top: 0;
    left: 0;
    right: 0;
    padding-top: var(--safe-top);
    background: var(--c-header-glass);
    box-shadow: 0 1px 0 var(--c-hairline);
    /* Header icons take the theme's colour near the top of the screen (IOS_FINDINGS: 13% down). */
    --c-accent-icon: color-mix(in srgb, var(--t-top) 87%, var(--t-bottom));
  }
  /*
   * Chrome blurs weakly near the edge of a backdrop-filter box (it mirrors the edge), so text sliding
   * under the bottom edge stayed sharp. The blur lives on a taller box, clipped back to the bar, so
   * the bar's own edge is in the middle of the blurred area.
   */
  .top::before {
    content: "";
    position: absolute;
    z-index: -1;
    left: 0;
    right: 0;
    top: 0;
    bottom: calc(var(--sp-48) * -1);
    clip-path: inset(0 0 var(--sp-48) 0);
    -webkit-backdrop-filter: blur(var(--blur-glass)) saturate(1.8);
    backdrop-filter: blur(var(--blur-glass)) saturate(1.8);
  }
  :global(:root[data-layout="desktop"]) .top {
    position: relative;
    padding-top: 0;
    box-shadow: var(--sh-header);
  }
  :global(:root[data-layout="desktop"]) .top::before { display: none; }
  .head {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    height: var(--header-h);
    padding: 0 var(--sp-8) 0 var(--sp-4);
    --icon-size: var(--header-icon);
  }
  :global(:root[data-layout="desktop"]) .head { padding: 0 var(--sp-14) 0 var(--sp-16); }

  .pin {
    width: 100%;
    height: var(--pin-h);
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    padding: 0 var(--sp-12) 0 var(--sp-16);
    border-top: 1px solid var(--c-hairline);
    text-align: left;
    font-size: var(--fs-row-sub);
    line-height: var(--lh-row-sub);
    color: var(--c-text-2);
  }
  :global(:root[data-layout="desktop"]) .pin { padding-left: var(--sp-16); }
  :global(:root[data-layout="desktop"]) .pin:hover { background: var(--c-hover); }
  .pin:active { background: var(--c-hover); }
  .pin { transition: opacity var(--dur-xxs) var(--ease-linear); }
  /* Stepped aside while its card is on screen: no height, so the header is only the bar. */
  .pin.away { height: 0; border-top-width: 0; overflow: hidden; opacity: 0; pointer-events: none; }
  .pt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pt strong { font-weight: var(--fw-semibold); color: var(--c-text); }
  .count {
    flex: none;
    min-width: var(--sp-20);
    height: var(--sp-20);
    padding: 0 var(--sp-6);
    border-radius: var(--r-pill);
    background: var(--c-btn-secondary);
    color: var(--c-text);
    font-size: var(--fs-caption);
    line-height: var(--sp-20);
    font-weight: var(--fw-semibold);
    text-align: center;
  }
  .chev { flex: none; display: inline-flex; --icon-size: var(--sp-16); color: var(--c-text-2); }
  .back {
    width: var(--hit);
    height: var(--hit);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--c-accent-icon);
    --icon-size: var(--sp-28);
  }
  .who { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--sp-8); }
  .names { min-width: 0; }
  .name {
    margin: 0;
    font-size: var(--fs-title);
    line-height: var(--lh-title);
    font-weight: var(--fw-semibold);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  .icons { display: flex; flex: none; gap: var(--sp-4); }
  .icons button {
    width: var(--hit);
    height: var(--hit);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-round);
    color: var(--c-accent-icon);
  }
  :global(:root[data-layout="desktop"]) .icons { gap: var(--sp-8); }
  :global(:root[data-layout="desktop"]) .icons button { width: var(--sp-36); height: var(--sp-36); }
  :global(:root[data-layout="desktop"]) .icons button:hover { background: var(--c-hover); }

  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
    padding-top: calc(var(--header-h) + var(--safe-top) + var(--sp-8));
    padding-bottom: var(--sp-8);
    outline: none;
  }
  /* Constant while the bar steps aside, so the messages never jump; it only matters at the very top. */
  .has-pin .list { padding-top: calc(var(--header-h) + var(--safe-top) + var(--pin-h) + var(--sp-8)); }
  /*
   * Layer-mode frames (Safari) are clipped to their scroll container. Start the list under the
   * header there, so a tool scrolled up never draws over the header or the pinned bar.
   */
  :global(:root[data-frames="layer"][data-layout="phone"]) .list { margin-top: calc(var(--header-h) + var(--safe-top)); padding-top: var(--sp-8); }
  :global(:root[data-frames="layer"][data-layout="phone"]) .has-pin .list { margin-top: calc(var(--header-h) + var(--safe-top) + var(--pin-h)); }
  :global(:root[data-layout="desktop"]) .list, :global(:root[data-layout="desktop"]) .has-pin .list { padding-top: var(--sp-8); }

  .intro { display: flex; flex-direction: column; align-items: center; gap: var(--sp-4); padding: var(--sp-24) 0 var(--sp-16); }
  .intro-name { margin-top: var(--sp-8); font-size: var(--fs-title); line-height: var(--lh-title); font-weight: var(--fw-semibold); }
  .intro-sub { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }

  .stamp, .system {
    text-align: center;
    margin: 0;
    padding: var(--stamp-pad-y) var(--sp-16) var(--sp-4);
    font-size: var(--fs-caption);
    line-height: var(--lh-caption);
    font-weight: var(--fw-medium);
    color: var(--c-text-2);
  }
  .system { font-weight: var(--fw-regular); padding-top: var(--sp-12); }
  /* IOS_FINDINGS: the timestamp row between groups is 45 tall; SIGNED_IN_FINDINGS: 40 on the web. */
  .stamp { display: flex; align-items: center; justify-content: center; min-height: var(--stamp-row-h); padding: 0 var(--sp-16); }
  .system strong { font-weight: var(--fw-semibold); color: var(--c-text); }
  /* the activity line is a system line you can tap */
  .activity { display: block; width: 100%; border-radius: var(--r-button); }
  .activity:active, :global(:root[data-layout="desktop"]) .activity:hover { background: var(--c-hover); }

  .seen { display: flex; justify-content: flex-end; padding: var(--sp-4) var(--msg-pad) 0; }
  .seen > :global(.avatar + .avatar) { margin-left: calc(var(--sp-4) * -1); }
  .seen :global(.avatar) { box-shadow: 0 0 0 1px var(--c-bg); }
  .sending {
    text-align: right;
    padding: var(--sp-2) var(--msg-pad) 0;
    font-size: var(--fs-caption);
    line-height: var(--lh-caption);
    color: var(--c-text-2);
  }

  .typing-row { display: flex; align-items: flex-end; padding: var(--msg-gap-group) var(--msg-pad) 0; }
  .av-col { flex: none; width: var(--avatar-col); }
  .typing {
    display: inline-flex;
    gap: var(--sp-4);
    align-items: center;
    height: calc(var(--lh-body) + var(--bubble-pad-y) * 2);
    padding: 0 var(--sp-14);
    border-radius: var(--r-bubble);
    background: var(--c-bubble-in);
  }
  .typing span {
    width: var(--dot-typing);
    height: var(--dot-typing);
    border-radius: var(--r-round);
    background: var(--c-typing-dot);
    animation: bounce var(--dur-typing) var(--ease-linear) infinite;
  }
  .typing span:nth-child(2) { animation-delay: calc(var(--dur-typing) / 6); }
  .typing span:nth-child(3) { animation-delay: calc(var(--dur-typing) / 3); }
  @keyframes bounce {
    0%, 60%, 100% { opacity: 0.35; transform: none; }
    30% { opacity: 1; transform: translateY(calc(var(--sp-4) * -1)); }
  }
  .tail { height: var(--sp-8); }

  .chips { padding: var(--sp-4) var(--sp-12) 0; display: flex; flex-wrap: wrap; gap: var(--sp-6); }
  .chip {
    display: inline-flex;
    align-items: center;
    height: var(--chip-h);
    border-radius: var(--r-pill);
    background: var(--c-chip);
    box-shadow: inset 0 0 0 1px var(--c-hairline);
    font-size: var(--fs-row-sub);
    line-height: var(--lh-row-sub);
    font-weight: var(--fw-semibold);
  }
  .chip .go { display: inline-flex; align-items: center; gap: var(--sp-6); height: 100%; padding: 0 var(--sp-4) 0 var(--sp-12); border-radius: var(--r-pill); }
  .chip .x { display: inline-flex; align-items: center; justify-content: center; width: var(--chip-h); height: 100%; border-radius: var(--r-pill); color: var(--c-text-2); --icon-size: var(--sp-14); }
  .chip .x:hover { background: var(--c-hover); }

  .sheet-title { text-align: center; font-size: var(--fs-title); line-height: var(--lh-title); font-weight: var(--fw-bold); margin-bottom: var(--sp-8); }
  .tool-row { width: 100%; display: flex; align-items: center; gap: var(--sp-12); padding: var(--sp-8) 0; text-align: left; border-radius: var(--r-button); }
  .tr-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .tr-name { font-size: var(--fs-row-name); line-height: var(--lh-row-name); font-weight: var(--fw-medium); }
  .tr-sub { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }

  .dock {
    flex: none;
    padding-bottom: var(--safe-bottom);
    background: var(--c-bg);
    /* Composer icons take the theme's colour near the bottom of the screen (IOS_FINDINGS: 92% down). */
    --c-accent-icon: color-mix(in srgb, var(--t-top) 8%, var(--t-bottom));
  }
  :global(:root[data-layout="desktop"]) .dock { padding-bottom: 0; }
</style>
