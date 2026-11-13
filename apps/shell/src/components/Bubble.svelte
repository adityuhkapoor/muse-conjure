<script lang="ts">
  import Photo from "./Photo.svelte";
  import Cover from "./Cover.svelte";
  import { linkAsset } from "../surfaces/media"; // surfaces: link previews show their picture
  import type { Message, Person } from "../store/types";
  import { ME } from "../store/types";
  import type { Pos } from "../lib/thread";
  import Avatar from "./Avatar.svelte";
  import Icon from "./Icon.svelte";
  import MuseCard from "./MuseCard.svelte";
  import MuseMark from "./MuseMark.svelte";
  import { splitMention } from "../lib/muse";
  import { haptic } from "../phone/touch"; // phone

  type Props = {
    msg: Message;
    pos: Pos;
    senderLabel: boolean;
    showAvatar: boolean;
    gapBefore: "same" | "group";
    sender: Person | undefined;
    quoted: Message | undefined;
    quotedSender: Person | undefined;
    fresh: boolean;
    resolve: (id: string) => Person | undefined;
    onmenu: (msg: Message, el: HTMLElement) => void;
    onheart: (msg: Message) => void;
    /** open the page a link preview points to (an event) */
    onlink?: (msg: Message) => void;
    /** brief highlight after a jump to this message */
    flash?: boolean;
    /** "Tell Muse what to change" under a live tool (live store only) */
    onchangetool?: (msg: Message) => void;
    /** a Mini Muse offered with a reply: make it */
    onchip?: (msg: Message) => void;
  };
  let { msg, pos, senderLabel, showAvatar, gapBefore, sender, quoted, quotedSender, fresh, resolve, onmenu, onheart, onlink, flash = false, onchangetool, onchip }: Props =
    $props();

  const mention = $derived(msg.kind === "text" && msg.text ? splitMention(msg.text) : null);
  const eventLink = $derived(msg.kind === "link" && !!msg.link?.eventId);
  const linkPic = $derived(msg.kind === "link" && msg.link ? linkAsset(msg.link) : undefined);

  const chipLabel = $derived(msg.chip ? `Make ${"aeiou".includes(msg.chip.name[0]?.toLowerCase() ?? "") ? "an" : "a"} ${msg.chip.name.toLowerCase()}` : "");
  const out = $derived(msg.from === ME);
  const isMuse = $derived(msg.kind === "muse");
  const emojiOnly = $derived(msg.kind === "text" && !!msg.text && /^(\p{Extended_Pictographic}️?\s*){1,3}$/u.test(msg.text));
  const total = $derived(msg.reactions.reduce((n, r) => n + r.by.length, 0));
  const mine = $derived(msg.reactions.find((r) => r.by.includes(ME))?.emoji);

  let stack: HTMLElement | undefined = $state();
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let pressed = false;
  let startX = 0;
  let startY = 0;

  const openMenu = () => stack && onmenu(msg, stack);

  function down(e: PointerEvent) {
    if (e.pointerType === "mouse") return; // mouse uses right-click
    startX = e.clientX;
    startY = e.clientY;
    pressed = false;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      pressed = true;
      haptic(); // phone: a tick on Android
      openMenu();
    }, 500);
  }
  function move(e: PointerEvent) {
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) clearTimeout(pressTimer);
  }
  function up() {
    clearTimeout(pressTimer);
  }
  function context(e: MouseEvent) {
    e.preventDefault();
    if (!pressed) openMenu();
    pressed = false;
  }

</script>

<div
  class="row"
  class:out
  class:muse={isMuse}
  class:same={gapBefore === "same"}
  class:has-react={total > 0}
  class:has-reply={!!quoted}
  class:flash
  data-pos={pos}
  data-id={msg.id}
  data-tool-id={msg.muse?.toolId}
>
  {#if senderLabel}
    <p class="sender">{isMuse ? "Muse" : sender?.first}</p>
  {/if}
  {#if quoted}
    <p class="reply-ctx">
      <Icon name="reply" />
      {out ? "You" : sender?.first} replied to {quoted.from === ME ? "you" : quotedSender?.first}
    </p>
  {/if}
  <div class="line">
    {#if !out}
      <div class="av-col">
        {#if showAvatar && !isMuse}<Avatar person={sender} size="var(--avatar-msg)" />{/if}
      </div>
    {/if}
    <div class="stack" class:fresh class:pending={msg.pending} bind:this={stack}>
      {#if quoted}
        <div class="quote" aria-hidden="true">{quoted.text ?? (quoted.kind === "muse" ? (quoted.muse?.title ?? "Muse") : quoted.kind === "photo" ? "Photo" : "Link")}</div>
      {/if}

      {#if isMuse && msg.muse}
        <div class="muse-wrap"><MuseCard appId={msg.muse.appId} title={msg.muse.title} subtitle={msg.muse.subtitle} toolId={msg.muse.toolId} building={msg.muse.building} live={msg.muse.live} rev={msg.muse.rev ?? 0} /></div>
        {#if msg.muse.live && msg.muse.changing}
          <p class="tool-change changing" role="status" data-tool-changing><MuseMark size="var(--sp-16)" spin />Muse is changing this…</p>
        {:else if msg.muse.live && onchangetool}
          <button class="tool-change" data-tool-change onclick={() => onchangetool(msg)}>Tell Muse what to change</button>
        {/if}
      {:else if msg.kind === "photo" && msg.photo}
        <div
          class="bubble photo"
          role="button"
          tabindex="0"
          aria-haspopup="dialog"
          aria-label={msg.photo.label}
          style:--ph={`var(--c-ph-${msg.photo.tone})`}
          onpointerdown={down}
          onpointermove={move}
          onpointerup={up}
          onpointercancel={up}
          oncontextmenu={context}
          ondblclick={() => onheart(msg)}
          onkeydown={(e) => e.key === "Enter" && openMenu()}
        >
          {#if msg.photo.asset}
            <Photo id={msg.photo.asset} width={220} alt="" />
          {:else}
            <span class="sun"></span>
            <span class="hill"></span>
          {/if}
        </div>
      {:else if msg.kind === "link" && msg.link}
        <div
          class="bubble link"
          class:event={eventLink}
          role="button"
          tabindex="0"
          aria-haspopup={eventLink ? undefined : "dialog"}
          onpointerdown={down}
          onpointermove={move}
          onpointerup={up}
          onpointercancel={up}
          oncontextmenu={context}
          onclick={() => eventLink && onlink?.(msg)}
          ondblclick={() => !eventLink && onheart(msg)}
          onkeydown={(e) => e.key === "Enter" && (eventLink ? onlink?.(msg) : openMenu())}
        >
          <span class="link-img" class:pic={!!linkPic} aria-hidden="true">
            {#if linkPic}<Cover id={linkPic} width={252} alt="" />{:else}<Icon name={eventLink ? "calendar" : "share_arrow"} />{/if}
          </span>
          <span class="link-body">
            <span class="link-site">{msg.link.site}</span>
            <span class="link-title">{msg.link.title}</span>
            <span class="link-desc">{msg.link.description}</span>
          </span>
        </div>
      {:else}
        <div
          class="bubble text"
          class:emoji={emojiOnly}
          role="button"
          tabindex="0"
          aria-haspopup="dialog"
          onpointerdown={down}
          onpointermove={move}
          onpointerup={up}
          onpointercancel={up}
          oncontextmenu={context}
          ondblclick={() => onheart(msg)}
          onkeydown={(e) => e.key === "Enter" && openMenu()}
        ><span class="sr-only">{out ? "You" : sender?.first}: </span>{#if mention}<span class="mention">{mention.lead}</span>{mention.rest}{:else}{msg.text}{/if}</div>
        {#if msg.chip && onchip}<button class="tool-change" data-muse-chip={msg.chip.id} onclick={() => onchip(msg)}>{chipLabel}</button>{/if}
      {/if}

      {#if total > 0}
        <button class="pill" aria-label={`Reactions: ${msg.reactions.map((r) => `${r.emoji} ${r.by.length}`).join(", ")}`} onclick={openMenu}>
          <span class="emojis">{#each msg.reactions.slice(0, 3) as r (r.emoji)}<span>{r.emoji}</span>{/each}</span>
          {#if total > 1}<span class="count">{total}</span>{/if}
        </button>
      {/if}

      {#if !isMuse}
        <div class="actions">
          <button aria-label="React" onclick={openMenu}><span style:--icon-size="var(--sp-16)"><Icon name="emoji" /></span></button>
          <button aria-disabled="true" title="Not in this prototype" aria-label="Reply"><span style:--icon-size="var(--sp-16)"><Icon name="reply" /></span></button>
          <button aria-disabled="true" title="Not in this prototype" aria-label="More"><span style:--icon-size="var(--sp-16)"><Icon name="more_dots" /></span></button>
        </div>
      {/if}
    </div>
  </div>
  <span class="sr-only">{mine ? `You reacted ${mine}` : ""}</span>
</div>

<style>
  .row {
    --tl: var(--r-bubble);
    --tr: var(--r-bubble);
    --bl: var(--r-bubble);
    --br: var(--r-bubble);
    padding: 0 var(--msg-pad);
    margin-top: var(--msg-gap-group);
  }
  .row.same { margin-top: var(--msg-gap-same); }
  /* About 30 of space after a bubble with a reaction (IOS_FINDINGS, default theme): room for the pill. */
  .row.has-react { margin-bottom: var(--react-after); }

  /* Grouped corners: inner corners (toward neighbours) drop to --r-bubble-inner. */
  .row:not(.out)[data-pos="first"] { --bl: var(--r-bubble-inner); }
  .row:not(.out)[data-pos="middle"] { --tl: var(--r-bubble-inner); --bl: var(--r-bubble-inner); }
  .row:not(.out)[data-pos="last"] { --tl: var(--r-bubble-inner); }
  .row.out[data-pos="first"] { --br: var(--r-bubble-inner); }
  .row.out[data-pos="middle"] { --tr: var(--r-bubble-inner); --br: var(--r-bubble-inner); }
  .row.out[data-pos="last"] { --tr: var(--r-bubble-inner); }

  .sender {
    margin: 0 0 var(--sp-2) calc(var(--avatar-col) + var(--bubble-pad-x));
    font-size: var(--fs-caption);
    line-height: var(--lh-caption);
    color: var(--c-text-2);
  }
  .reply-ctx {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    --icon-size: var(--sp-12);
    margin: 0 0 var(--sp-2) calc(var(--avatar-col) + var(--bubble-pad-x));
    font-size: var(--fs-caption);
    line-height: var(--lh-caption);
    color: var(--c-reply-quote-text);
  }
  .row.out .reply-ctx { justify-content: flex-end; margin: 0 var(--bubble-pad-x) var(--sp-2) 0; }
  .row.out .sender { display: none; }

  .line { display: flex; align-items: flex-end; }
  .row.out .line { justify-content: flex-end; }
  .av-col { flex: none; width: var(--avatar-col); display: flex; align-items: flex-end; }

  .stack {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    max-width: var(--bubble-max);
  }
  .row.out .stack { align-items: flex-end; }
  .row.muse .stack { max-width: var(--muse-max); width: var(--muse-max); }
  .muse-wrap { width: 100%; }
  /* "Tell Muse what to change": a quiet text action under a live tool; "Muse is changing this" in its place while it works. */
  .tool-change {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-6);
    min-height: var(--sp-44);
    padding: 0 var(--sp-4);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    font-weight: var(--fw-semibold);
    color: var(--c-text-2);
  }
  button.tool-change:hover { color: var(--c-text); }
  .tool-change.changing { font-weight: var(--fw-regular, 400); }

  .quote {
    background: var(--c-reply-quote);
    color: var(--c-reply-quote-text);
    border-radius: var(--r-bubble);
    padding: var(--bubble-pad-y) var(--bubble-pad-x) calc(var(--bubble-pad-y) + var(--sp-14));
    margin-bottom: calc(var(--sp-14) * -1);
    font-size: var(--fs-row-sub);
    line-height: var(--lh-row-sub);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bubble {
    position: relative;
    border-radius: var(--tl) var(--tr) var(--br) var(--bl);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
    touch-action: manipulation;
    outline-offset: var(--sp-2);
  }
  .text {
    padding: var(--bubble-pad-y) var(--bubble-pad-x);
    background: var(--c-bubble-in);
    color: var(--c-bubble-in-text);
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  /*
   * Outgoing bubbles are not a flat fill. As in the real apps, the chat's theme is one vertical
   * gradient as tall as the list's visible area and fixed to it, and each outgoing bubble is a window
   * onto the part behind it: a bubble near the top is the top colour, near the composer the bottom
   * one, and the colour changes as it scrolls. Here each bubble paints the gradient itself, sized to
   * the list (--scroll-h, set by Thread) and offset by its own place in the list with a scroll-driven
   * animation, so it needs no script while scrolling and works the same under Safari's frame layer.
   * The gradient is G tall (--grad-h: the screen on a phone, the list on desktop) and starts o above
   * the list's top (--grad-off). Over the view timeline (cover range) the bubble's top goes from the
   * list's bottom edge (H, --scroll-h) to one bubble height above its top (-h), so the background
   * must sit at -(top + o): from -(H + o) to h - o, written as calc(100% + G - o), where 100% of a
   * background position is (h - G).
   * Without scroll-driven animations the bubble shows the whole gradient.
   */
  .row.out .text {
    background-color: var(--t-bottom, var(--theme-default-bottom));
    background-image: linear-gradient(var(--t-top, var(--theme-default-top)), var(--t-bottom, var(--theme-default-bottom)));
    background-repeat: no-repeat;
    color: var(--c-bubble-out-text);
  }
  @supports (animation-timeline: view()) {
    .row.out .text {
      background-size: 100% var(--grad-h, var(--scroll-h, 100vh));
      animation: through-window linear both;
      animation-timeline: view();
    }
  }
  @keyframes through-window {
    from { background-position: 0 calc(var(--scroll-h, 100vh) * -1 - var(--grad-off, 0px)); }
    to { background-position: 0 calc(100% + var(--grad-h, var(--scroll-h, 100vh)) - var(--grad-off, 0px)); }
  }
  @media (prefers-reduced-motion: reduce) {
    /* Not motion: it is where the bubble is. Keep it under the global reduced-motion rule. */
    .row.out .text { animation-duration: auto !important; }
  }
  .text.emoji {
    background: none !important;
    padding: 0;
    font-size: var(--fs-emoji-big);
    line-height: var(--lh-emoji-big);
  }

  .photo {
    width: var(--photo-w);
    max-width: 100%;
    height: var(--photo-h);
    background: linear-gradient(var(--c-ph-1), var(--ph));
    overflow: hidden;
    box-shadow: inset 0 0 0 1px var(--c-hairline);
  }
  .sun {
    position: absolute;
    top: 18%;
    right: 18%;
    width: 22%;
    aspect-ratio: 1;
    border-radius: var(--r-round);
    background: var(--c-white);
    opacity: 0.55;
  }
  .hill {
    position: absolute;
    left: -20%;
    right: -20%;
    bottom: -30%;
    height: 60%;
    border-radius: var(--r-round);
    background: var(--c-ph-2);
    opacity: 0.8;
  }

  .link {
    width: 100%;
    background: var(--c-bubble-in);
    color: var(--c-bubble-in-text);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    width: calc(var(--photo-w) + var(--sp-32));
    max-width: 100%;
  }
  .link-img {
    height: var(--link-img-h);
    background: var(--c-ph-1);
    color: var(--c-white);
    display: flex;
    align-items: center;
    justify-content: center;
    --icon-size: var(--sp-32);
  }
  .link-img.pic { overflow: hidden; }
  .link-body { display: flex; flex-direction: column; padding: var(--sp-8) var(--sp-12) var(--sp-12); gap: var(--sp-2); }
  .link-site { font-size: var(--fs-caption); line-height: var(--lh-caption); color: var(--c-text-2); }
  /* DS: the event date line is the one all-caps, red line in Meta. */
  .link.event .link-site { color: var(--c-date-line-tint); font-weight: var(--fw-bold); text-transform: uppercase; }
  .link.event { cursor: pointer; }
  .mention { font-weight: var(--fw-semibold); }
  .row.flash .muse-wrap { animation: flash var(--dur-xl) var(--ease-linear) 1 both; border-radius: var(--r-rich-card); }
  @keyframes flash { from { background: var(--c-flash); } to { background: transparent; } }
  .link-title { font-size: var(--fs-row-sub); line-height: var(--lh-row-sub); font-weight: var(--fw-semibold); }
  .link-desc { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }

  /*
   * Reaction pill (MESSENGER_PUBLIC_FINDINGS section 3): a 22.6 tall full pill in the incoming bubble
   * fill, cut out of the bubble by a 2 px ring in the page colour (no shadow), its right edge 2 px
   * inside the bubble's, hanging 18.5 below the bubble. The ring is drawn outside the pill's box.
   */
  .pill {
    position: absolute;
    bottom: calc(var(--react-overlap) * -1);
    right: var(--react-inset);
    height: var(--react-pill-h);
    min-width: var(--react-pill-h);
    padding: 0 var(--sp-6);
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    border-radius: var(--r-pill);
    background: var(--c-bubble-in);
    box-shadow: 0 0 0 var(--react-ring) var(--c-bg), var(--sh-pill);
    font-size: var(--fs-emoji-react);
    line-height: 1;
    z-index: 1;
  }
  .emojis { display: inline-flex; gap: var(--sp-2); }
  .count { font-size: var(--fs-caption); font-weight: var(--fw-regular); color: var(--c-text); padding-right: var(--sp-2); }

  .actions {
    display: none;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    gap: var(--sp-2);
    opacity: 0;
    /* SIGNED_IN_FINDINGS: hover overlays fade in over 100 ms, linear. */
    transition: opacity var(--dur-xxs) var(--ease-linear);
  }
  .actions button {
    width: var(--sp-28);
    height: var(--sp-28);
    border-radius: var(--r-round);
    color: var(--c-text-2);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .actions button:hover { background: var(--c-hover); }
  :global(:root[data-layout="desktop"]) .actions { display: flex; }
  .row:not(.out) .actions { left: 100%; margin-left: var(--sp-8); }
  .row.out .actions { right: 100%; margin-right: var(--sp-8); flex-direction: row-reverse; }
  .line:hover .actions, .line:focus-within .actions { opacity: 1; }

  .stack.fresh { animation: pop var(--dur-short-in) var(--ease-enter) both; transform-origin: bottom right; }
  .row:not(.out) .stack.fresh { transform-origin: bottom left; }
  .stack.pending .bubble { opacity: 0.7; }
  @keyframes pop {
    from { opacity: 0; transform: translateY(var(--sp-12)) scale(0.85); }
    to { opacity: 1; transform: none; }
  }
</style>
