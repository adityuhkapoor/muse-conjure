<script lang="ts">
  import { tick } from "svelte";
  import Cover from "../../components/Cover.svelte";
  import { ui } from "../../lib/ui.svelte";
  import Avatar from "../../components/Avatar.svelte";
  import Icon from "../../components/Icon.svelte";
  import { nav } from "../../lib/nav.svelte";
  import { STORIES as ALL_STORIES } from "../data";
  import { viewerId } from "../../lib/media";
  import { who } from "../flows.svelte";
  import { openProfile } from "../profile-data";
  import { tokenMs } from "../../phone/motion";
  import { REACTION_SET } from "../../store/types";
  import { seen } from "../seen.svelte";
  import { framesOf } from "../story-frames";
  import StoryCatalysts from "../../muse/components/StoryCatalysts.svelte"; // catalysts

  /**
   * Story viewer (DS: full-bleed 9:16, author and time on dark, stickers over media). Your own story
   * carries a poll sticker; once the poll has ended, one option under the result: "Make it a plan",
   * which makes a chat with the people who voted for the winner and a who's in.
   *
   * It behaves like the real one with no video: segmented bars fill over --m-story-seg and advance on
   * their own (a CSS animation; its end is the clock), the still drifts and zooms a little over the
   * same time, tap right or left to skip or go back, hold to pause, swipe down to close, swipe across
   * to the next or previous person. A tool story stops the clock while the viewer works the tool and
   * restarts it --m-story-resume after the last touch. Only the current story is mounted.
   */
  const STORIES = ALL_STORIES.filter((s) => s.by !== viewerId());
  let { id }: { id: string } = $props();
  // svelte-ignore state_referenced_locally
  let i = $state(Math.max(0, STORIES.findIndex((s) => s.id === id)));
  let seg = $state(0);
  /** bumped on every move, so the bars and the picture restart their animation */
  let epoch = $state(0);
  const s = $derived(STORIES[i]!);
  const by = $derived(who(s.by));
  const frames = $derived(framesOf(s));
  const total = $derived(s.poll ? s.poll.options.reduce((n, o) => n + o.voters.length + o.others, 0) : 0);

  let held = $state(false); // finger down and still, or dragging
  let tool = $state(false); // working a tool, until --m-story-resume after the last touch
  let typing = $state(false); // a text field in the story has focus
  let busy = $state(false); // sliding to another person
  const paused = $derived(held || tool || typing || busy);

  let card: HTMLElement | undefined = $state();
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const KB = [[1, -1], [-1, 1], [1, 1], [-1, -1]] as const;
  const kb = $derived(KB[(i + seg) % KB.length]!);

  $effect(() => {
    seen.mark(s.id);
  });

  const restart = () => (epoch += 1);

  function nextSeg() {
    if (seg < frames.length - 1) {
      seg += 1;
      restart();
    } else void person(1);
  }
  function prevSeg() {
    if (seg > 0) {
      seg -= 1;
      restart();
    } else if (i > 0) void person(-1);
    else restart();
  }

  let cubeDeg = -1;
  const cube = () => (cubeDeg < 0 ? (cubeDeg = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--m-story-cube")) || 0) : cubeDeg);
  const face = (x: number, W: number) => `translate3d(${x}px, 0, 0) rotateY(${(-x / W) * cube()}deg)`;
  const ease = () => getComputedStyle(document.documentElement).getPropertyValue("--m-story-slide-ease").trim() || "ease-out";

  /** To the next (1) or previous (-1) person: the card leaves, the other one comes in from the far side. */
  async function person(dir: 1 | -1, from = 0) {
    if (busy || !card) return;
    const j = i + dir;
    if (j >= STORIES.length) return void leave();
    if (j < 0) return restart();
    busy = true;
    const W = card.clientWidth || 1;
    const dur = reduced() ? 0 : tokenMs("--m-story-slide-dur");
    const out = card.animate([{ transform: face(from, W) }, { transform: face(-dir * W, W) }], { duration: dur, easing: ease(), fill: "forwards" });
    await out.finished.catch(() => {});
    i = j;
    seg = 0;
    restart();
    await tick();
    const inn = card.animate([{ transform: face(dir * W, W) }, { transform: face(0, W) }], { duration: dur, easing: ease(), fill: "forwards" });
    out.cancel();
    await inn.finished.catch(() => {});
    inn.cancel();
    busy = false;
  }

  /** Back to the page underneath; the app's own pop does the sliding. */
  function leave() {
    nav.back();
  }

  async function closeDown(from: number) {
    if (!card || busy) return leave();
    busy = true;
    const H = card.clientHeight || 1;
    const dur = reduced() ? 0 : tokenMs("--m-story-close-dur");
    const a = card.animate([{ transform: `translate3d(0, ${from}px, 0) scale(${1 - (from / H) * 0.2})` }, { transform: `translate3d(0, ${H * 0.4}px, 0) scale(0.8)` }], { duration: dur, easing: ease(), fill: "forwards" });
    await a.finished.catch(() => {});
    leave();
  }

  function settle(fromX: number, fromY: number) {
    if (!card) return;
    const W = card.clientWidth || 1;
    const a = card.animate([{ transform: fromY ? `translate3d(0, ${fromY}px, 0)` : face(fromX, W) }, { transform: face(0, W) }], { duration: reduced() ? 0 : tokenMs("--m-story-slide-dur"), easing: ease() });
    a.onfinish = () => (card!.style.transform = "");
    card.style.transform = "";
  }

  // ---- the gesture layer: tap zones, hold, swipes
  type Touch = { id: number; x: number; y: number; t: number; mode: "" | "x" | "y" | "none"; dx: number; dy: number; held: boolean; timer: ReturnType<typeof setTimeout>; vx: number; lx: number; lt: number };
  let g: Touch | null = null;
  const slop = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--m-story-slop")) || 10;

  function down(e: PointerEvent) {
    if (busy || (e.pointerType === "mouse" && e.button !== 0)) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const timer = setTimeout(() => {
      if (g && !g.mode) {
        g.held = true;
        held = true;
      }
    }, tokenMs("--m-story-hold"));
    g = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, mode: "", dx: 0, dy: 0, held: false, timer, vx: 0, lx: e.clientX, lt: e.timeStamp };
  }
  function move(e: PointerEvent) {
    if (!g || g.id !== e.pointerId || !card) return;
    g.dx = e.clientX - g.x;
    g.dy = e.clientY - g.y;
    const dt = e.timeStamp - g.lt;
    if (dt > 0) g.vx = (e.clientX - g.lx) / dt;
    g.lx = e.clientX;
    g.lt = e.timeStamp;
    if (!g.mode) {
      if (Math.hypot(g.dx, g.dy) < slop()) return;
      clearTimeout(g.timer);
      g.mode = Math.abs(g.dx) > Math.abs(g.dy) ? "x" : g.dy > 0 ? "y" : "none";
      if (g.mode !== "none") held = true;
    }
    const W = card.clientWidth || 1;
    if (g.mode === "x") card.style.transform = face(g.dx, W);
    else if (g.mode === "y") card.style.transform = `translate3d(0, ${Math.max(0, g.dy)}px, 0) scale(${1 - (Math.max(0, g.dy) / (card.clientHeight || 1)) * 0.2})`;
  }
  function up(e: PointerEvent) {
    if (!g || g.id !== e.pointerId || !card) return;
    const t = g;
    g = null;
    clearTimeout(t.timer);
    held = false;
    const W = card.clientWidth || 1;
    if (t.mode === "x") {
      const far = Math.abs(t.dx) > W * 0.25 || Math.abs(t.vx) > 0.5;
      if (far && (t.dx < 0 ? i < STORIES.length - 1 : i > 0)) {
        card.style.transform = "";
        void person(t.dx < 0 ? 1 : -1, t.dx);
      } else settle(t.dx, 0);
    } else if (t.mode === "y") {
      if (t.dy > (card.clientHeight || 1) * 0.15) void closeDown(t.dy);
      else settle(0, t.dy);
    } else if (!t.mode && !t.held) {
      const r = card.getBoundingClientRect();
      if (e.clientX - r.left < r.width * 0.3) prevSeg();
      else nextSeg();
    }
  }
  function cancel(e: PointerEvent) {
    if (!g || g.id !== e.pointerId) return;
    clearTimeout(g.timer);
    const t = g;
    g = null;
    held = false;
    if (t.mode) settle(t.dx, t.mode === "y" ? t.dy : 0);
  }

  // ---- a tool in the story: the clock waits while it is used
  let toolTimer: ReturnType<typeof setTimeout> | undefined;
  function engaged() {
    tool = true;
    clearTimeout(toolTimer);
    toolTimer = setTimeout(() => (tool = false), tokenMs("--m-story-resume"));
  }
  const isField = (el: EventTarget | null) => el instanceof HTMLElement && el.matches("input, textarea, select, [contenteditable]");
  function watch(node: HTMLElement) {
    const on = () => engaged();
    const drag = (e: Event) => ((e as PointerEvent).buttons ? engaged() : undefined);
    const fin = (e: Event) => {
      if (isField(e.target)) typing = true;
      engaged();
    };
    const fout = (e: Event) => {
      if (isField(e.target)) typing = false;
      engaged();
    };
    const evs: [string, EventListener][] = [["pointerdown", on], ["pointermove", drag], ["keydown", on], ["input", on], ["wheel", on], ["focusin", fin], ["focusout", fout]];
    for (const [n, f] of evs) node.addEventListener(n, f, true);
    return { destroy: () => evs.forEach(([n, f]) => node.removeEventListener(n, f, true)) };
  }
  $effect(() => () => clearTimeout(toolTimer));

  // ---- quick reactions in the reply bar: the emoji floats up
  const REACT = [["Love", REACTION_SET[0]], ["Haha", REACTION_SET[1]], ["Wow", REACTION_SET[2]], ["Sad", REACTION_SET[3]], ["Angry", REACTION_SET[4]], ["Like", REACTION_SET[5]]] as const;
  let floats = $state<{ n: number; e: string; k: number }[]>([]);
  let nf = 0;
  function react(emoji: string, k: number) {
    nf += 1;
    floats = [...floats, { n: nf, e: emoji, k }];
  }
</script>

<section class="story" aria-label={s.by === "me" ? "Your story" : `${by?.first}'s story`} data-paused={paused} data-seg={seg} data-segs={frames.length}>
  <div class="stage">
    <div class="card" bind:this={card}>
      {#key epoch}
        <div class="media t{s.tone}" role="img" aria-label={s.caption ? `Story photo: ${s.caption}` : "Story photo"}>
          <div class="kb" style:--kx={kb[0]} style:--ky={kb[1]}><Cover id={frames[seg]} width={ui.desktop ? 405 : 393} alt="" eager /></div>
        </div>
      {/key}
      <div class="gesture" role="presentation" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={cancel}>
        <button class="half left" aria-label="Previous story" onclick={(e) => e.detail === 0 && prevSeg()}></button>
        <button class="half right" aria-label="Next story" onclick={(e) => e.detail === 0 && nextSeg()}></button>
      </div>

      <div class="top">
        <div class="bars" aria-hidden="true" data-paused={paused}>
          {#key epoch}
            {#each frames as _, k (k)}
              <span class="b" class:done={k < seg} class:cur={k === seg}><span class="f" onanimationend={k === seg ? nextSeg : undefined}></span></span>
            {/each}
          {/key}
        </div>
        <div class="head">
          <button class="who" aria-label={`${s.by === "me" ? "Your" : `${by?.name}'s`} profile`} onclick={() => openProfile(s.by)}>
            <Avatar person={by} size="var(--sp-32)" />
            <span class="nm">{s.by === "me" ? "Your story" : by?.name}</span>
          </button>
          <span class="tm">{s.by === "me" ? "20h" : "3h"}</span>
          <button class="x" aria-label="More" aria-disabled="true" title="Not in this prototype"><Icon name="more_dots" /></button>
          <button class="x" aria-label="Close" onclick={() => nav.back()}><Icon name="close" /></button>
        </div>
      </div>

      {#key s.id}
        {#if s.poll}
          {@const poll = s.poll}
          <div class="sticker" aria-label="Poll" use:watch>
            <p class="q">{poll.question}</p>
            <ul class="opts">
              {#each poll.options as o (o.label)}
                {@const n = o.voters.length + o.others}
                <li class="opt" style:--w={`${(n / Math.max(1, total)) * 100}%`}>
                  <span class="fill" aria-hidden="true"></span>
                  <span class="ol">{o.label}</span>
                  <span class="pile" aria-hidden="true">{#each o.voters.slice(0, 3) as v (v)}<Avatar person={who(v)} size="var(--avatar-facepile-sm)" ring />{/each}</span>
                  <span class="on">{n}</span>
                </li>
              {/each}
            </ul>
            <p class="end">Poll ended · {total === 1 ? "1 vote" : `${total} votes`}</p>
            <StoryCatalysts {s} part="offers" /><!-- catalysts: offers from the story (src/muse) -->
          </div>
        {:else if s.tool}
          <div class="offers full" use:watch><StoryCatalysts {s} part="offers" /></div><!-- catalysts: a Muse story is its live tool -->
        {:else}
          <p class="cap">{s.caption}</p>
          <div class="offers" use:watch><StoryCatalysts {s} part="offers" /></div><!-- catalysts -->
        {/if}
      {/key}

      <div class="reply" use:watch>
        <div class="react" role="group" aria-label="Quick reactions">
          {#each REACT as [name, e], k (name)}
            <button class="rx" aria-label={name} onclick={() => react(e, k)}>{e}</button>
          {/each}
          {#each floats as f (f.n)}
            <span class="fl" style:--k={f.k} aria-hidden="true" onanimationend={() => (floats = floats.filter((x) => x.n !== f.n))}>{f.e}</span>
          {/each}
        </div>
        {#key s.id}<StoryCatalysts {s} part="ask" />{/key}<!-- catalysts: the Muse field in the reply bar -->
      </div>
    </div>
  </div>
</section>

<style>
  .story { position: relative; height: 100%; overflow: hidden; background: var(--c-media-dark); color: var(--c-on-media); }
  .stage { position: absolute; inset: 0; perspective: calc(var(--sp-64) * 20); }
  .card { position: absolute; inset: 0; overflow: hidden; background: var(--c-media-dark); }
  .media { position: absolute; inset: 0; overflow: hidden; background: linear-gradient(170deg, var(--c-reel-3), var(--c-reel-4)); }
  .media.t1 { background: linear-gradient(170deg, var(--c-reel-1), var(--c-reel-3)); }
  .media.t3 { background: linear-gradient(170deg, var(--c-reel-2), var(--c-reel-1)); }
  /* the still: a slow zoom and a few pixels of drift over one segment; the same clock as the bar, so a pause stops both */
  .kb { position: absolute; inset: 0; will-change: transform; animation: kb var(--m-story-seg) linear both; }
  @keyframes kb {
    from { transform: translate3d(0, 0, 0) scale(1); }
    to { transform: translate3d(calc(var(--m-kb-drift) * var(--kx)), calc(var(--m-kb-drift) * var(--ky)), 0) scale(var(--m-kb-scale)); }
  }
  .story[data-paused="true"] .kb, .story[data-paused="true"] .b .f { animation-play-state: paused; }
  .gesture { position: absolute; inset: 0; z-index: 1; touch-action: none; -webkit-user-select: none; user-select: none; }
  .half { position: absolute; top: 0; bottom: 0; width: 30%; }
  .left { left: 0; }
  .right { right: 0; }
  .top { position: absolute; z-index: 2; left: 0; right: 0; top: 0; padding: calc(var(--safe-top) + var(--sp-8)) var(--sp-8) 0; background: linear-gradient(var(--c-media-scrim), transparent); pointer-events: none; }
  .top button { pointer-events: auto; }
  .bars { display: flex; gap: var(--sp-4); }
  .b { position: relative; flex: 1; height: var(--sp-2); border-radius: var(--r-pill); background: var(--c-on-media-2); overflow: hidden; }
  .b:not(.done, .cur) { opacity: 0.4; }
  .f { position: absolute; inset: 0; background: var(--c-on-media); transform-origin: 0 50%; transform: scaleX(0); will-change: transform; }
  .b.done .f { transform: scaleX(1); }
  .b.cur .f { animation: fill var(--m-story-seg) linear forwards; }
  @keyframes fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  .bars[data-paused="true"] .b.cur { opacity: var(--m-story-paused-opacity); }
  .b { transition: opacity var(--m-press-dur) ease; }
  .head { display: flex; align-items: center; gap: var(--sp-8); padding: var(--sp-8) 0; }
  .who { display: inline-flex; align-items: center; gap: var(--sp-8); min-width: 0; color: inherit; }
  .top .who { pointer-events: auto; }
  .nm { font-size: var(--fs-fb-name); line-height: var(--lh-fb-name); font-weight: var(--fw-semibold); }
  .tm { flex: 1; font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-on-media-2); }
  .x { width: var(--hit); height: var(--hit); display: inline-flex; align-items: center; justify-content: center; color: var(--c-on-media); --icon-size: var(--sp-24); }
  .cap { text-shadow: 0 1px var(--sp-4) var(--c-media-scrim); position: absolute; z-index: 1; left: var(--sp-16); right: var(--sp-16); top: 45%; text-align: center; font-size: var(--fs-section); line-height: var(--lh-section); font-weight: var(--fw-bold); pointer-events: none; }
  .sticker { position: absolute; z-index: 2; left: 50%; top: 30%; transform: translateX(-50%); width: min(calc(100% - var(--sp-48)), var(--sheet-max-w)); padding: var(--sp-16); border-radius: var(--r-rich-card); background: var(--c-bg); color: var(--c-text); box-shadow: var(--sh-float); display: flex; flex-direction: column; gap: var(--sp-8); }
  .q { text-align: center; font-size: var(--fs-title); line-height: var(--lh-title); font-weight: var(--fw-bold); }
  .opts { display: flex; flex-direction: column; gap: var(--sp-8); }
  .opt { position: relative; display: flex; align-items: center; gap: var(--sp-8); height: var(--hit); padding: 0 var(--sp-12); border-radius: var(--r-button); background: var(--c-field); overflow: hidden; }
  .fill { position: absolute; left: 0; top: 0; bottom: 0; width: var(--w); background: var(--c-poll-fill); }
  .ol { position: relative; flex: 1; font-size: var(--fs-btn); line-height: var(--lh-btn); font-weight: var(--fw-semibold); }
  .pile { position: relative; display: inline-flex; }
  .pile > :global(.avatar + .avatar) { margin-left: calc(var(--sp-4) * -1); }
  .on { position: relative; font-size: var(--fs-meta); line-height: var(--lh-meta); font-weight: var(--fw-semibold); color: var(--c-text-2); min-width: var(--sp-16); text-align: right; }
  .end { text-align: center; font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  .plan { width: 100%; }
  .offers { position: absolute; z-index: 2; left: var(--sp-16); right: var(--sp-16); top: calc(var(--safe-top) + var(--sp-64)); bottom: calc(var(--safe-bottom) + var(--sp-64) + var(--sp-48)); overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-8); pointer-events: none; }
  .offers > :global(:first-child) { margin-top: auto; } /* bottom-aligned when short, scrolls from the top when tall */ /* catalysts: the story's tool and offers */
  .offers > :global(*) { pointer-events: auto; flex: none; }
  /* a Mini in a story: the white holder has the Mini card's own radius and no padding around it, so no white corners show behind the rounded card (light and dark); the credit lines keep their own padding */
  .offers > :global(.card) { padding: 0; overflow: hidden; border-radius: var(--r-rich-card); }
  .offers > :global(.card) :global(.credit) { padding: var(--sp-12) var(--sp-12) var(--sp-4); }
  .offers > :global(.card) :global(.by) { margin-top: 0; padding: 0 var(--sp-12); }
  .offers > :global(.card) :global(.use) { margin: 0 var(--sp-12) var(--sp-12); }
  .offers.full { top: calc(var(--safe-top) + var(--sp-56)); }
  .offers.full > :global(:first-child) { margin-top: 0; }
  .reply { position: absolute; z-index: 2; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; gap: var(--sp-8); background: linear-gradient(transparent, var(--c-media-scrim)); padding: var(--sp-8) var(--sp-12) calc(var(--safe-bottom) + var(--sp-8)); }
  .react { position: relative; display: flex; justify-content: space-between; padding: 0 var(--sp-4); }
  .rx { width: var(--hit); height: var(--sp-40); display: inline-flex; align-items: center; justify-content: center; font-size: var(--fs-section); line-height: 1; }
  /* a reaction floats up from its button: transform and opacity only */
  .fl { position: absolute; bottom: 0; left: calc((var(--k) + 0.5) * 100% / 6); margin-left: calc(var(--sp-12) * -1); font-size: var(--fs-section); line-height: 1; pointer-events: none; animation: float var(--m-react-dur) cubic-bezier(0.22, 1, 0.36, 1) both; }
  @keyframes float { from { transform: translate3d(0, 0, 0) scale(0.6); opacity: 1; } 70% { opacity: 1; } to { transform: translate3d(0, calc(var(--sp-64) * -2.5), 0) scale(1.5); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) {
    /* no drift; the bar is the clock and still runs, at its own length */
    .kb { animation: none !important; }
    .b.cur .f { animation-duration: var(--m-story-seg) !important; }
  }
</style>
