<script lang="ts">
  import { ui } from "./lib/ui.svelte";
  import { nav } from "./lib/nav.svelte";
  import DesktopList from "./components/DesktopList.svelte";
  import EventPage from "./components/EventPage.svelte";
  import InfoPanel from "./components/InfoPanel.svelte";
  import Inbox from "./components/Inbox.svelte";
  import Search from "./components/Search.svelte";
  import Thread from "./components/Thread.svelte";
  import TopBar from "./components/TopBar.svelte";
  // surfaces: the Facebook app (src/surfaces)
  import FacebookApp from "./surfaces/components/FacebookApp.svelte";
  import FbDesk from "./surfaces/components/FbDesk.svelte";
  import FbPushed from "./surfaces/components/FbPushed.svelte";
  import SurfaceLayer from "./surfaces/components/SurfaceLayer.svelte";
  import { springFromTokens, commit as phoneCommit } from "./phone/motion"; // phone
  import { springAt, settleTime } from "./phone/spring";
  // catalysts (src/muse)
  import PresenterOptions from "./muse/components/PresenterOptions.svelte";
  import { catalyst } from "./muse/catalyst.svelte";

  // --- swipe back from the left edge (top page only) ---
  // phone: the top page follows the finger 1:1 (once per frame) and the page under it follows in parallax. Release
  // completes past --m-commit-dist of the width or faster than --m-commit-vel px/s, else cancels, both with the push
  // spring carrying the finger's speed (src/phone/spring.ts). Starts only on a mostly horizontal move. In an iOS
  // browser tab the browser's own back swipe is left alone.
  let drag = $state<number | null>(null); // progress 0..1 of the way back, null when idle
  let startX = 0;
  let startY = 0;
  let width = 1;
  let want = 0;
  let live = false; // horizontal intent confirmed
  let frame = 0;
  let settling = 0;
  let vel = 0; // px per second, smoothed
  let lastX = 0;
  let lastT = 0;
  const edgeOn = !(document.documentElement.dataset.os === "ios" && document.documentElement.dataset.standalone !== "1");
  function edgeDown(e: PointerEvent) {
    if (settling) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    startX = lastX = e.clientX;
    startY = e.clientY;
    lastT = e.timeStamp;
    vel = 0;
    width = (e.currentTarget as HTMLElement).parentElement!.offsetWidth;
    live = false;
    want = 0;
    drag = 0;
  }
  function edgeMove(e: PointerEvent) {
    if (drag === null || settling) return;
    const dx = e.clientX - startX;
    if (!live) {
      if (Math.abs(e.clientY - startY) > 10 && Math.abs(e.clientY - startY) > Math.abs(dx)) return edgeEnd(false, e);
      if (dx < 6) return;
      live = true;
    }
    const dt = Math.max(1, e.timeStamp - lastT);
    vel = 0.6 * vel + 0.4 * (((e.clientX - lastX) / dt) * 1000);
    lastX = e.clientX;
    lastT = e.timeStamp;
    want = Math.max(0, Math.min(1, dx / width));
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      if (drag !== null && !settling) drag = want;
    });
  }
  function edgeEnd(commit: boolean, e: PointerEvent) {
    if (drag === null || settling) return;
    cancelAnimationFrame(frame);
    frame = 0;
    const p = Math.max(0, Math.min(1, (e.clientX - startX) / width));
    if (e.timeStamp - lastT > 80) vel = 0; // held still before letting go: no flick
    const c = phoneCommit();
    const done = commit && live && (p > c.dist || vel > c.vel);
    if (!live) {
      drag = null;
      return;
    }
    // Spring from where the finger left it to 1 (back) or 0 (stay), carrying the finger's speed when going on.
    const spring = springFromTokens();
    const from = p;
    const target = done ? 1 : 0;
    const v0 = done ? vel / width / Math.max(0.05, target - from) : 0;
    const end = settleTime(spring);
    const t0 = performance.now();
    settling = 1;
    const step = (now: number) => {
      const t = (now - t0) / 1000;
      if (t >= end) {
        drag = target;
        settling = 0;
        if (done) nav.back();
        drag = null;
        return;
      }
      drag = from + (target - from) * springAt(spring, t, v0);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const edgeUp = (e: PointerEvent) => edgeEnd(true, e);
  const edgeCancel = (e: PointerEvent) => edgeEnd(false, e);

  const active = $derived(nav.layers.filter((l) => !l.leaving));
  const topKey = $derived(active.at(-1)?.key);
  /** How far in the page is: 1 at rest, 0 off screen. The top page follows the finger. */
  const prog = (l: { key: number; shown: boolean }) => (!l.shown ? 0 : l.key === topKey && drag !== null ? 1 - drag : 1);

  // surfaces: phone dark is true black in Messenger (measured) and the Meta palette on Facebook pages
  // (Home, Groups, Marketplace, Notifications, Gaming, Events: Facebook's own dark was never captured, so
  // this follows design/tokens.json, data-dark="meta"). Desktop dark is the Meta palette already.
  const onFacebook = $derived.by(() => {
    const top = active.at(-1)?.route;
    return top ? top.kind === "fb" || top.kind === "event" : nav.app === "facebook";
  });
  $effect(() => {
    const root = document.documentElement;
    if (onFacebook) root.dataset.dark = "meta";
    else delete root.dataset.dark;
  });
</script>

<svg width="0" height="0" style:position="absolute" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="muse-grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" style="stop-color: var(--c-ai-1)" />
      <stop offset="0.35" style="stop-color: var(--c-ai-2)" />
      <stop offset="0.65" style="stop-color: var(--c-ai-3)" />
      <stop offset="1" style="stop-color: var(--c-ai-4)" />
    </linearGradient>
  </defs>
</svg>

{#if ui.desktop}
  <div class="desk">
    <TopBar />
    {#if nav.desktopEvent}
      <main class="event"><EventPage eventId={nav.desktopEvent} /></main>
    {:else if nav.desktopFb}
      <main class="event"><FbDesk page={nav.desktopFb} /></main><!-- surfaces -->
    {:else}
      <main class="panes">
        <DesktopList selectedId={nav.selected} />
        <div class="panel">
          {#key nav.selected}<Thread chatId={nav.selected} focus={nav.focus} />{/key}
        </div>
        <div class="panel info"><InfoPanel chatId={nav.selected} /></div>
      </main>
    {/if}
  </div>
{:else}
  <main class="stack" class:dragging={drag !== null}>
    <section
      class="page inbox"
      style:--u={nav.layers[0] ? prog(nav.layers[0]) : 0}
      inert={active.length > 0}
      aria-hidden={active.length > 0}
    >
      {#if nav.app === "facebook"}<FacebookApp />{:else}<Inbox />{/if}<!-- surfaces -->
    </section>
    {#each nav.layers as layer, i (layer.key)}
      {@const isTop = layer.key === topKey}
      <section
        class="page push"
        class:shown={layer.shown}
        class:leaving={layer.leaving}
        style:--p={prog(layer)}
        style:--u={nav.layers[i + 1] ? prog(nav.layers[i + 1]!) : 0}
        inert={!isTop}
        aria-hidden={!isTop}
        data-route={layer.route.kind}
      >
        {#if layer.route.kind === "chat"}
          <Thread
            chatId={layer.route.id}
            onback={() => nav.back()}
            focus={layer.route.focus ? { tool: layer.route.focus, n: layer.key } : null}
          />
        {:else if layer.route.kind === "search"}
          <Search />
        {:else if layer.route.kind === "fb"}
          <FbPushed page={layer.route.page} /><!-- surfaces -->
        {:else}
          <EventPage eventId={layer.route.id} />
        {/if}
        {#if isTop && layer.shown && edgeOn}
          <div
            class="edge"
            role="presentation"
            onpointerdown={edgeDown}
            onpointermove={edgeMove}
            onpointerup={edgeUp}
            onpointercancel={edgeCancel}
          ></div>
        {/if}
      </section>
    {/each}
  </main>
{/if}

<SurfaceLayer /><!-- surfaces: chat picker and toast -->

<aside class="proto" aria-label="Prototype notice">
  <span>Prototype</span>
  <button onclick={() => ui.toggleTheme()} aria-label={ui.dark ? "Switch to light mode" : "Switch to dark mode"}>{ui.dark ? "Light" : "Dark"}</button>
  <button onclick={() => (catalyst.presenter = true)} aria-label="Presenter options">Options</button><!-- catalysts -->
</aside>
<PresenterOptions /><!-- catalysts -->

<style>
  .stack { position: absolute; inset: 0; overflow: hidden; background: var(--c-bg); }
  .page { position: absolute; inset: 0; isolation: isolate; background: var(--c-bg); }
  /*
   * Push and pop, iOS style (phone look; tokens --m-*): the page slides in from the right edge over the one beneath,
   * which moves left by --m-under-shift and dims by --m-under-dim, both on the push spring. Only transform and opacity
   * move, so it runs on the compositor. --p is how far in the page is (1 at rest), --u how far the page above this
   * one is in. While the edge swipe drags, nothing transitions: the pages follow the finger.
   */
  .page { transform: translate3d(calc(var(--u, 0) * var(--m-under-shift)), 0, 0); transition: transform var(--m-push-dur) var(--m-push-ease); will-change: transform; }
  .page::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 30;
    background: var(--c-black);
    opacity: calc(var(--u, 0) * var(--m-under-dim));
    transition: opacity var(--m-pop-dur) var(--m-pop-ease);
    pointer-events: none;
  }
  .stack:not(:has(.push.leaving)) > .page::after { transition-duration: var(--m-push-dur); transition-timing-function: var(--m-push-ease); }
  .push {
    transform: translate3d(calc((1 - var(--p)) * 100% + var(--u, 0) * var(--m-under-shift)), 0, 0);
    transition: transform var(--m-pop-dur) var(--m-pop-ease), visibility 0s linear var(--m-pop-dur);
    visibility: hidden;
  }
  .push.shown { visibility: visible; transition: transform var(--m-push-dur) var(--m-push-ease); }
  /* pop: whatever is on its way out, and the page beneath coming back, use the pop timing */
  .stack:has(.push.leaving) > .page:not(.push), .stack:has(.push.leaving) > .page:not(.push)::after { transition-duration: var(--m-pop-dur); transition-timing-function: var(--m-pop-ease); }
  /* The edge shadow of the page on top, as a strip that fades with it instead of a repainted box-shadow. */
  .push::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    right: 100%;
    width: var(--sp-24);
    background: linear-gradient(to left, var(--c-edge-shadow), transparent);
    opacity: var(--p);
    transition: opacity var(--m-pop-dur) var(--m-pop-ease);
    pointer-events: none;
  }
  .dragging .page, .dragging .page::after, .dragging .push::before { transition: none; }
  .edge {
    position: absolute;
    z-index: 5;
    top: calc(var(--header-h) + var(--safe-top));
    bottom: 0;
    left: 0;
    width: var(--edge-swipe);
    touch-action: pan-y;
  }

  .desk { position: absolute; inset: 0; display: flex; flex-direction: column; background: var(--c-wash); }
  .panes {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: var(--list-w) minmax(0, 1fr) var(--info-w);
    gap: var(--gutter);
    padding-right: var(--gutter);
  }
  .panel {
    min-height: 0;
    margin: var(--sp-8) 0 var(--gutter);
    background: var(--c-bg);
    border-radius: var(--r-card);
    box-shadow: var(--sh-card);
    overflow: hidden;
  }
  .panes > :global(.list) { background: var(--c-bg); }
  .event { flex: 1; min-height: 0; }

  .proto {
    position: fixed;
    z-index: 100;
    left: var(--sp-8);
    bottom: var(--sp-2);
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    height: var(--sp-16);
    padding: 0 var(--sp-6);
    border-radius: var(--r-pill);
    background: var(--c-proto-bg);
    color: var(--c-proto-text);
    font-size: var(--fs-proto);
    line-height: var(--lh-proto);
    pointer-events: none;
  }
  .proto button {
    pointer-events: auto;
    position: relative;
    font-size: var(--fs-proto);
    line-height: var(--lh-proto);
    font-weight: var(--fw-semibold);
    text-decoration: underline;
  }
  .proto button::after { content: ""; position: absolute; inset: calc(var(--sp-4) * -1) calc(var(--sp-8) * -1); }
</style>
