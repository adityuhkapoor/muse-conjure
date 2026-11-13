<script lang="ts">
  import Cover from "../../components/Cover.svelte";
  import { ui } from "../../lib/ui.svelte";
  import Avatar from "../../components/Avatar.svelte";
  import Icon from "../../components/Icon.svelte";
  import { compact } from "../../lib/format";
  import { tokenMs } from "../../phone/motion";
  import { REELS, type Reel } from "../data";
  import { sendReel, who } from "../flows.svelte";
  import ShareSheet from "./ShareSheet.svelte";
  import ReelCatalysts from "../../muse/components/ReelCatalysts.svelte"; // catalysts

  /**
   * Reels: 9:16, one at a time, scroll snaps (DS: full-bleed in 9:16, author and time on dark).
   * No video files: each still moves slowly and a line loops along the bottom, so a reel reads as playing.
   * Tap pauses (both stop), double tap likes, the caption opens on tap. Only the reel on screen and the
   * two beside it are mounted. A swipe that starts on a tool card and goes mostly up or down still pages.
   * Sharing a reel to a chat is the action; the Muse option appears under the shared reel in the thread.
   */
  let liked = $state<string[]>([]);
  let sharing = $state<Reel | null>(null);
  let cur = $state(0);
  let paused = $state<string[]>([]);
  let open = $state<string[]>([]);
  let muted = $state(true);
  let glyph = $state<{ id: string; kind: "play" | "pause"; n: number } | null>(null);
  let hearts = $state<{ n: number; id: string; x: number; y: number }[]>([]);
  let list: HTMLElement | undefined = $state();
  let n = 0;

  const has = (a: string[], id: string) => a.includes(id);
  const flip = (a: string[], id: string) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]);
  const toggle = (id: string) => (liked = flip(liked, id));
  /** a length for the loop, 0:08 to 0:30, the same every time for the same reel */
  const secs = (id: string) => 8 + ([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 23);
  const clock = (id: string) => `0:${String(secs(id)).padStart(2, "0")}`;

  // which reel is on screen: from the scroll position, once per frame
  let raf = 0;
  function onscroll() {
    if (raf || !list) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!list) return;
      const k = Math.round(list.scrollTop / Math.max(1, list.clientHeight));
      cur = Math.min(REELS.length - 1, Math.max(0, k));
    });
  }

  // tap: pause or play; a second tap inside the window is a double tap: like, with a heart under the finger
  let tapTimer: ReturnType<typeof setTimeout> | undefined;
  function pauseToggle(id: string) {
    const was = has(paused, id);
    paused = flip(paused, id);
    n += 1;
    glyph = { id, kind: was ? "play" : "pause", n };
  }
  function tap(r: Reel, e: MouseEvent) {
    if (e.detail === 0) return pauseToggle(r.id); // keyboard
    if (tapTimer) {
      clearTimeout(tapTimer);
      tapTimer = undefined;
      if (!has(liked, r.id)) toggle(r.id);
      const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
      n += 1;
      hearts = [...hearts, { n, id: r.id, x: e.clientX - box.left, y: e.clientY - box.top }];
      return;
    }
    tapTimer = setTimeout(() => {
      tapTimer = undefined;
      pauseToggle(r.id);
    }, tokenMs("--m-reel-tap"));
  }

  // A swipe that starts on a tool card: if it goes mostly up or down it pages the reels, unless the
  // card itself can still scroll that way. Sideways and short moves stay with the card.
  let sw: { id: number; x: number; y: number; top: number; paging: boolean; sy: number } | null = null;
  const slop = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--m-reel-swipe-slop")) || 12;
  function cardDown(e: PointerEvent) {
    if (e.pointerType === "mouse" || !list) return;
    sw = { id: e.pointerId, x: e.clientX, y: e.clientY, top: list.scrollTop, paging: false, sy: e.clientY };
  }
  function cardMove(e: PointerEvent) {
    if (!sw || sw.id !== e.pointerId || !list) return;
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    if (!sw.paging) {
      if (Math.hypot(dx, dy) < slop()) return;
      const box = (e.currentTarget as HTMLElement).closest<HTMLElement>(".tools");
      const inner = box ? box.scrollHeight > box.clientHeight + 1 && ((dy < 0 && box.scrollTop + box.clientHeight < box.scrollHeight - 1) || (dy > 0 && box.scrollTop > 0)) : false;
      if (Math.abs(dy) > Math.abs(dx) * 1.5 && !inner) sw.paging = true;
      else if (Math.abs(dx) > Math.abs(dy)) sw = null;
      if (!sw) return;
    }
  }
  function cardUp(e: PointerEvent) {
    const s = sw;
    sw = null;
    if (!s || !s.paging || !list || s.id !== e.pointerId) return;
    const dy = e.clientY - s.y;
    const H = list.clientHeight;
    const to = Math.min(REELS.length - 1, Math.max(0, cur + (dy < 0 ? 1 : -1)));
    if (Math.abs(dy) > H * 0.08) list.scrollTo({ top: to * H, behavior: "smooth" });
  }
</script>

<section class="reels" aria-label="Reels">
  <h1 class="rt">Reels</h1>
  <ul class="list" bind:this={list} onscroll={onscroll} data-cur={cur}>
    {#each REELS as r, k (r.id)}
      {#if Math.abs(k - cur) <= 1}
        {@const by = who(r.by)}
        {@const on = has(liked, r.id)}
        {@const stopped = has(paused, r.id)}
        {@const more = has(open, r.id)}
        <li class="reel" data-reel={r.id} data-live={k === cur} data-paused={stopped}>
          <div class="frame" style:--secs={`${secs(r.id)}s`}>
            <span class="media t{r.tone}" role="img" aria-label={`Video: ${r.caption}`}><span class="mv" style:--dir={k % 2 ? -1 : 1}><Cover id={r.asset} width={ui.desktop ? 393 : 393} alt="" eager={k <= 1} /></span></span>
            <button class="hit" aria-label={stopped ? "Play" : "Pause"} aria-pressed={stopped} onclick={(e) => tap(r, e)}></button>
            {#if glyph?.id === r.id}{#key glyph.n}<span class="glyph" aria-hidden="true" onanimationend={() => (glyph = null)}><Icon name={glyph.kind === "pause" ? "reel_pause" : "fbs_play"} /></span>{/key}{/if}
            {#each hearts.filter((h) => h.id === r.id) as h (h.n)}<span class="burst" style:left={`${h.x}px`} style:top={`${h.y}px`} aria-hidden="true" onanimationend={() => (hearts = hearts.filter((x) => x.n !== h.n))}><Icon name="fbs_heart" /></span>{/each}
            <div class="chips">
              <span class="dur" aria-label={`Length ${clock(r.id)}`}>{clock(r.id)}</span>
              <button class="mute" aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted} onclick={() => (muted = !muted)}><Icon name={muted ? "reel_muted" : "reel_sound"} /></button>
            </div>
            <div class="tools" onpointerdown={cardDown} onpointermove={cardMove} onpointerup={cardUp} onpointercancel={() => (sw = null)}><ReelCatalysts {r} part="page" /></div><!-- catalysts: tools friends made on this reel, live -->
            <div class="meta" class:more>
              <p class="by"><Avatar person={by} size="var(--sp-32)" /><span class="h">{r.handle}</span><button class="follow" aria-disabled="true" title="Not in this prototype">Follow</button></p>
              <button class="cap" aria-expanded={more} onclick={() => (open = flip(open, r.id))}>{r.caption}</button>
              <p class="audio"><span class="disc" aria-hidden="true"></span><span class="note" aria-hidden="true"><Icon name="reel_music" /></span><span class="song">Original audio · {r.handle}</span></p>
            </div>
            <div class="side">
              <button class="sa" class:on aria-pressed={on} aria-label={`Like, ${compact(r.likes + (on ? 1 : 0))}`} onclick={() => toggle(r.id)}><span class="ic"><Icon name="fbs_heart" /></span><span>{compact(r.likes + (on ? 1 : 0))}</span></button>
              <button class="sa" aria-disabled="true" title="Not in this prototype" aria-label={`Comment, ${compact(r.comments)}`}><span class="ic"><Icon name="fbs_comment" /></span><span>{compact(r.comments)}</span></button>
              <button class="sa" aria-label={`Share, ${compact(r.shares)}`} aria-haspopup="dialog" onclick={() => (sharing = r)}><span class="ic"><Icon name="fbs_send" /></span><span>{compact(r.shares)}</span></button>
              <button class="sa" aria-disabled="true" title="Not in this prototype" aria-label="More"><span class="ic"><Icon name="more_dots" /></span></button>
            </div>
            <div class="line" aria-hidden="true"><span class="lf"></span></div>
          </div>
        </li>
      {:else}
        <li class="reel empty" data-reel={r.id} aria-hidden="true"></li>
      {/if}
    {/each}
  </ul>
</section>

{#if sharing}
  {@const r = sharing}
  <ShareSheet label="Send to" onclose={() => (sharing = null)} onsend={(c) => { sendReel(c, r); sharing = null; }}>
    {#snippet muse()}<ReelCatalysts {r} part="share" onclose={() => (sharing = null)} />{/snippet}<!-- catalysts -->
  </ShareSheet>
{/if}

<style>
  .reels { position: relative; height: 100%; min-height: 0; background: var(--c-media-dark); color: var(--c-on-media); }
  .rt { position: absolute; z-index: 2; top: calc(var(--safe-top) + var(--sp-12)); left: var(--sp-16); font-size: var(--fs-bar-title); line-height: var(--lh-bar-title); font-weight: var(--fw-bold); color: var(--c-on-media); pointer-events: none; }
  .list { height: 100%; overflow-y: auto; scroll-snap-type: y mandatory; overscroll-behavior-y: contain; scrollbar-width: none; }
  .list::-webkit-scrollbar { display: none; }
  .reel { height: 100%; scroll-snap-align: start; scroll-snap-stop: always; display: flex; justify-content: center; }
  .frame { position: relative; width: 100%; height: 100%; overflow: hidden; }
  .media { position: absolute; inset: 0; display: block; overflow: hidden; background: linear-gradient(170deg, var(--c-reel-1), var(--c-reel-2)); }
  .media.t2 { background: linear-gradient(170deg, var(--c-reel-2), var(--c-reel-1)); }
  .media.t3 { background: linear-gradient(170deg, var(--c-reel-3), var(--c-reel-1)); }
  .media.t4 { background: linear-gradient(170deg, var(--c-reel-4), var(--c-reel-3)); }
  .media::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 45%; background: linear-gradient(transparent, var(--c-media-scrim)); }
  /* the still: one slow move, back and forth, only on the reel on screen */
  .mv { position: absolute; inset: 0; display: block; will-change: transform; transform: scale(var(--m-reel-scale)); }
  .mv > :global(img) { position: absolute; inset: 0; }
  .reel[data-live="true"] .mv { animation: drift var(--m-reel-drift-dur) ease-in-out infinite alternate; }
  .reel[data-paused="true"] :is(.mv, .lf, .disc) { animation-play-state: paused; }
  @keyframes drift {
    from { transform: translate3d(calc(var(--m-reel-drift) * var(--dir) * -1), 0, 0) scale(1.04); }
    to { transform: translate3d(calc(var(--m-reel-drift) * var(--dir)), calc(var(--m-reel-drift) * -1), 0) scale(var(--m-reel-scale)); }
  }
  .hit { position: absolute; inset: 0; z-index: 0; -webkit-tap-highlight-color: transparent; }
  .glyph, .burst { position: absolute; z-index: 1; display: inline-flex; align-items: center; justify-content: center; pointer-events: none; }
  .glyph { left: 50%; top: 50%; width: var(--sp-64); height: var(--sp-64); margin: calc(var(--sp-32) * -1) 0 0 calc(var(--sp-32) * -1); border-radius: var(--r-round); background: var(--c-media-chip); color: var(--c-on-media); --icon-size: var(--sp-32); animation: glyph var(--m-reel-glyph-dur) ease-out both; }
  @keyframes glyph { from { transform: scale(0.7); opacity: 0; } 25% { transform: scale(1); opacity: 1; } to { transform: scale(1.15); opacity: 0; } }
  .burst { width: var(--sp-64); height: var(--sp-64); margin: calc(var(--sp-32) * -1) 0 0 calc(var(--sp-32) * -1); color: var(--c-badge); --icon-size: var(--sp-64); animation: burst var(--m-reel-heart-dur) cubic-bezier(0.22, 1, 0.36, 1) both; }
  @keyframes burst { from { transform: scale(0.3) rotate(-12deg); opacity: 0; } 25% { transform: scale(1.2) rotate(-8deg); opacity: 1; } 60% { transform: scale(1) rotate(-8deg); opacity: 1; } to { transform: translate3d(0, calc(var(--sp-32) * -1), 0) scale(1.1) rotate(-8deg); opacity: 0; } }
  .chips { position: absolute; z-index: 2; top: calc(var(--safe-top) + var(--sp-8)); right: var(--sp-8); display: flex; align-items: center; gap: var(--sp-8); pointer-events: none; }
  .chips > * { pointer-events: auto; }
  .dur { padding: var(--sp-2) var(--sp-8); border-radius: var(--r-pill); background: var(--c-media-chip); font-size: var(--fs-meta); line-height: var(--lh-meta); font-weight: var(--fw-semibold); font-variant-numeric: tabular-nums; }
  .mute { width: var(--sp-40); height: var(--sp-40); border-radius: var(--r-round); background: var(--c-media-chip); color: var(--c-on-media); display: inline-flex; align-items: center; justify-content: center; --icon-size: var(--sp-20); }
  .meta { position: absolute; z-index: 1; left: var(--sp-16); right: calc(var(--sp-64) + var(--sp-8)); bottom: calc(var(--tabbar-float-h) + var(--tabbar-float-bottom) + var(--sp-16)); display: flex; flex-direction: column; gap: var(--sp-8); }
  .by { display: flex; align-items: center; gap: var(--sp-8); }
  .h { font-size: var(--fs-fb-name); line-height: var(--lh-fb-name); font-weight: var(--fw-semibold); }
  .follow { height: var(--sp-28); padding: 0 var(--sp-12); border-radius: var(--r-button); box-shadow: inset 0 0 0 1px var(--c-on-media); color: var(--c-on-media); font-size: var(--fs-meta); line-height: var(--lh-meta); font-weight: var(--fw-semibold); }
  .cap { text-align: left; font-size: var(--fs-fb-body); line-height: var(--lh-fb-body); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .meta.more .cap { display: block; -webkit-line-clamp: unset; line-clamp: unset; max-height: calc(var(--lh-fb-body) * 8); overflow-y: auto; }
  .audio { display: flex; align-items: center; gap: var(--sp-6); font-size: var(--fs-meta); line-height: var(--lh-meta); min-width: 0; }
  .disc { flex: none; width: var(--sp-20); height: var(--sp-20); border-radius: var(--r-round); background: conic-gradient(var(--c-on-media), var(--c-reel-3), var(--c-on-media-2), var(--c-reel-4), var(--c-on-media)); box-shadow: inset 0 0 0 var(--sp-6) var(--c-media-dark); }
  .reel[data-live="true"] .disc { animation: spin var(--m-reel-disc-dur) linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .note { flex: none; display: inline-flex; --icon-size: var(--sp-14); }
  .song { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .side { position: absolute; z-index: 1; right: var(--sp-8); bottom: calc(var(--tabbar-float-h) + var(--tabbar-float-bottom) + var(--sp-16)); display: flex; flex-direction: column; gap: var(--sp-16); }
  /* the loop line along the bottom: it fills over the length shown and starts again */
  .line { position: absolute; z-index: 1; left: var(--sp-16); right: var(--sp-16); bottom: calc(var(--tabbar-float-h) + var(--tabbar-float-bottom) + var(--sp-4)); height: var(--sp-2); border-radius: var(--r-pill); background: var(--c-on-media-2); overflow: hidden; pointer-events: none; }
  .lf { position: absolute; inset: 0; background: var(--c-on-media); transform-origin: 0 50%; transform: scaleX(0); will-change: transform; }
  .reel[data-live="true"] .lf { animation: loop var(--secs) linear infinite; }
  @keyframes loop { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  /* catalysts: a tool on the reel sits above the caption and the side buttons, scrolling when tall */
  .tools { position: absolute; z-index: 2; left: var(--sp-12); right: var(--sp-12); top: calc(var(--safe-top) + var(--sp-56)); bottom: calc(var(--tabbar-float-h) + var(--tabbar-float-bottom) + var(--reel-side-h)); overflow-y: auto; display: flex; flex-direction: column; pointer-events: none; scrollbar-width: none; overscroll-behavior-y: auto; }
  .tools:not(:has([data-surface-tool])) { display: none; }
  .tools > :global(*) { pointer-events: auto; flex: none; }
  .sa { width: var(--sp-56); display: flex; flex-direction: column; align-items: center; gap: var(--sp-2); color: var(--c-on-media); font-size: var(--fs-caption); line-height: var(--lh-caption); font-weight: var(--fw-semibold); }
  .ic { display: inline-flex; --icon-size: var(--sp-28); }
  .sa.on .ic { color: var(--c-badge); }
  @media (prefers-reduced-motion: reduce) {
    /* no drift and no spinning disc; the line is progress, so it still runs at its own length */
    .mv, .disc { animation: none !important; }
    .reel[data-live="true"] .lf { animation-duration: var(--secs) !important; }
  }
  :global(:root[data-layout="desktop"]) .reels { background: var(--c-media-dark); }
  :global(:root[data-layout="desktop"]) .frame { width: var(--reel-w); height: calc(var(--reel-w) * 16 / 9); max-height: calc(100% - var(--sp-32)); margin: var(--sp-16) 0; border-radius: var(--r-card); }
  :global(:root[data-layout="desktop"]) .reel { align-items: center; }
  :global(:root[data-layout="desktop"]) .meta, :global(:root[data-layout="desktop"]) .side { bottom: var(--sp-16); }
  :global(:root[data-layout="desktop"]) .line { bottom: var(--sp-4); }
</style>
