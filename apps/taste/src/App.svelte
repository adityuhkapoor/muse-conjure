<script lang="ts">
  import { onMount } from "svelte";
  import { api, type Decision, type Shown } from "./lib/api.ts";
  import CopyLine from "./lib/CopyLine.svelte";
  import MotionClip from "./lib/MotionClip.svelte";
  import SummaryView from "./lib/SummaryView.svelte";
  import ToolView from "./lib/ToolView.svelte";
  import { warm } from "./lib/live.ts";

  type Dir = "left" | "right" | "up" | "down";
  const AHEAD = 3;
  const session = (crypto.randomUUID?.() ?? String(Math.random())).slice(0, 8);

  let queue = $state.raw<Shown[]>([]);
  let n = $state(0);
  let loaded = $state(false);
  let failed = $state(false);
  let view = $state<"judge" | "summary">("judge");
  let drag = $state({ x: 0, y: 0, on: false });
  let leaving = $state<Dir | null>(null);
  let toast = $state<{ text: string; id: number; undo: boolean } | null>(null);
  const current = $derived(queue[0]);

  let shownAt = 0;
  let interacted = false;
  let order = 0;
  let busy = false;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const past: { item: Shown; id: Promise<string | null> }[] = [];

  $effect(() => {
    if (current?.key) {
      shownAt = performance.now();
      interacted = false;
      order++;
    }
  });

  let filling = false;
  async function refill() {
    if (filling || queue.length >= AHEAD) return;
    filling = true;
    try {
      const more = await api.next(AHEAD - queue.length, queue.map((q) => q.key));
      const have = new Set(queue.map((q) => q.key));
      queue = [...queue, ...more.filter((m) => !have.has(m.key))];
      if (more.some((m) => m.kind === "tool")) warm();
    } catch {
      failed = true;
    } finally {
      filling = false;
      loaded = true;
    }
  }

  onMount(() => {
    api.stats().then((s) => (n = s.n), () => (failed = true));
    refill();
  });

  const SINGLE: Record<Dir, Decision> = { right: "like", left: "dislike", up: "love", down: "skip" };
  const PAIR: Partial<Record<Dir, Decision>> = { left: "a", right: "b", down: "skip", up: "skip" };
  const SAID: Record<Decision, string> = { like: "Liked", dislike: "Disliked", love: "Loved", skip: "Skipped", a: "Picked", b: "Picked" };

  function say(text: string, undo: boolean) {
    clearTimeout(toastTimer);
    toast = { text, id: (toast?.id ?? 0) + 1, undo };
    toastTimer = setTimeout(() => (toast = null), 4000);
  }

  async function decide(d: Decision, dir: Dir) {
    const item = current;
    if (!item || busy) return;
    busy = true;
    const ms = performance.now() - shownAt;
    // Persist at once; the id comes back for undo.
    const id = api.judge({ key: item.key, decision: d, ms, interacted, order, session }).then(
      (r) => ((n = r.n), r.id),
      () => ((failed = true), null),
    );
    past.push({ item, id });
    say(SAID[d], true);
    leaving = dir;
    await new Promise((r) => setTimeout(r, 160));
    queue = queue.slice(1);
    leaving = null;
    drag = { x: 0, y: 0, on: false };
    busy = false;
    refill();
  }

  function go(dir: Dir) {
    if (!current) return;
    const d = current.mode === "pair" ? PAIR[dir] : SINGLE[dir];
    if (d) decide(d, dir);
  }

  async function undo() {
    const last = past.pop();
    if (!last || busy) return;
    const id = await last.id;
    if (!id) return;
    const r = await api.undo(id);
    n = r.n;
    queue = [last.item, ...queue.filter((q) => q.key !== last.item.key)];
    say("Undone", false);
  }

  function onkey(e: KeyboardEvent) {
    if (view !== "judge") {
      if (e.key === "Escape") view = "judge";
      return;
    }
    if (e.target instanceof HTMLInputElement) return;
    if ((e.metaKey || e.ctrlKey) && e.key === "z") {
      e.preventDefault();
      undo();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const dir = ({ ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" } as Record<string, Dir>)[e.key];
    if (dir) {
      e.preventDefault();
      go(dir);
    } else if (e.key === "Backspace" || e.key === "z") {
      e.preventDefault();
      undo();
    }
  }

  // Swipe: drag the card past 90 px (or flick) in a direction.
  let start = { x: 0, y: 0, t: 0, id: -1 };
  function down(e: PointerEvent) {
    if (!current || busy || current.mode === "pair" || (e.target as HTMLElement).closest("button,iframe")) return;
    start = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { x: 0, y: 0, on: true };
  }
  function move(e: PointerEvent) {
    if (!drag.on || e.pointerId !== start.id) return;
    drag = { x: e.clientX - start.x, y: e.clientY - start.y, on: true };
  }
  function up(e: PointerEvent) {
    if (!drag.on || e.pointerId !== start.id) return;
    const { x, y } = drag;
    const dt = Math.max(1, performance.now() - start.t);
    const fast = Math.hypot(x, y) / dt > 0.6;
    const far = (v: number) => Math.abs(v) > 90 || (fast && Math.abs(v) > 30);
    drag = { x: 0, y: 0, on: false };
    if (Math.abs(x) >= Math.abs(y) && far(x)) go(x > 0 ? "right" : "left");
    else if (Math.abs(y) > Math.abs(x) && far(y)) go(y < 0 ? "up" : "down");
  }

  const hint = $derived.by(() => {
    const { x, y } = drag;
    if (!drag.on || Math.hypot(x, y) < 24) return null;
    const dir: Dir = Math.abs(x) >= Math.abs(y) ? (x > 0 ? "right" : "left") : y < 0 ? "up" : "down";
    return { dir, text: { right: "Like", left: "Dislike", up: "Love", down: "Skip" }[dir], o: Math.min(1, Math.hypot(x, y) / 90) };
  });
  const OUT: Record<Dir, string> = { right: "translate(120%, 0) rotate(12deg)", left: "translate(-120%, 0) rotate(-12deg)", up: "translate(0, -110%)", down: "translate(0, 110%)" };
  const cardTransform = $derived(leaving ? OUT[leaving] : drag.on ? `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 24}deg)` : "none");

  const ROLE: Record<string, string> = { button: "Button", title: "Card title", summary: "Chat preview", system: "System line", empty: "Empty state", building: "Muse status", error: "Error", toast: "Toast" };
  const MOTION: Record<string, string> = { card: "A card arriving", bar: "A vote bar filling", wheel: "A wheel settling", row: "A row being claimed" };
  const caption = (s: Shown) => (s.mode === "pair" ? `Which reads better? · ${ROLE[s.a.role] ?? "Copy"}` : s.kind === "copy" ? ROLE[s.role] ?? "Copy" : s.kind === "tool" ? s.name : s.kind === "motion" ? MOTION[s.transition] ?? "Motion" : "Screen");
  const mark = () => (interacted = true);
</script>

<svelte:window onkeydown={onkey} />

{#if view === "summary"}
  <main class="app scroll"><SummaryView onback={() => (view = "judge")} /></main>
{:else}
  <main class="app">
    <h1 class="sr">Taste</h1>
    <header>
      <div class="toasts" aria-live="polite">
        {#if toast}
          {#key toast.id}
            <p class="toast">
              <span>{toast.text}</span>
              {#if toast.undo}<button onclick={undo}>Undo</button>{/if}
            </p>
          {/key}
        {/if}
      </div>
      <button class="count" onclick={() => (view = "summary")} aria-label="{n} judged. See what you like">{n}</button>
    </header>

    <div class="stage">
      {#if current}
        {#each [current] as item (item.key)}
          <article
            class="card"
            class:pair={item.mode === "pair"}
            class:moving={drag.on}
            style:transform={cardTransform}
            style:opacity={leaving ? 0 : 1}
            onpointerdown={down}
            onpointermove={move}
            onpointerup={up}
            onpointercancel={() => (drag = { x: 0, y: 0, on: false })}
            aria-label={caption(item)}
            data-kind={item.mode === "pair" ? "pair" : item.kind}
            data-key={item.key}
          >
            <p class="cap">{caption(item)}</p>
            {#if item.mode === "pair"}
              {@const [a, b] = [item.a, item.b]}
              <div class="choices">
                <button class="choice" onclick={() => decide("a", "left")} aria-label="Pick: {a.text}"><CopyLine text={a.text} role={a.role} /></button>
                <button class="choice" onclick={() => decide("b", "right")} aria-label="Pick: {b.text}"><CopyLine text={b.text} role={b.role} /></button>
              </div>
            {:else if item.kind === "copy"}
              <div class="solo"><CopyLine text={item.text} role={item.role} /></div>
            {:else if item.kind === "tool"}
              <ToolView code={item.code} me={item.me} members={item.members} knobs={item.knobs} script={item.script} oninteract={mark} />
            {:else if item.kind === "motion"}
              <MotionClip transition={item.transition} curve={item.curve as never} oninteract={mark} />
            {:else}
              <img class="screen" src={item.url} alt={item.alt} draggable="false" />
            {/if}
            {#if hint}
              <span class="hint {hint.dir}" style:opacity={hint.o} aria-hidden="true">{hint.text}</span>
            {/if}
          </article>
        {/each}
      {:else if failed}
        <p class="quiet">Couldn't reach the server</p>
      {:else if loaded}
        <p class="quiet">Nothing left to judge</p>
      {/if}
    </div>

    <nav class="controls" aria-label="Judge">
      {#if current?.mode === "pair"}
        <button class="ctl" onclick={() => go("down")} aria-label="Skip">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14m0 0-5-5m5 5 5-5" /></svg>
        </button>
      {:else}
        <button class="ctl dislike" onclick={() => go("left")} aria-label="Dislike" disabled={!current}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        <button class="ctl sm" onclick={() => go("down")} aria-label="Skip" disabled={!current}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14m0 0-5-5m5 5 5-5" /></svg>
        </button>
        <button class="ctl sm love" onclick={() => go("up")} aria-label="Love" disabled={!current}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
        </button>
        <button class="ctl like" onclick={() => go("right")} aria-label="Like" disabled={!current}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </button>
      {/if}
    </nav>

  </main>
{/if}

<style>
  .app {
    height: 100dvh;
    max-width: 640px;
    margin: 0 auto;
    padding: env(safe-area-inset-top) 16px 0;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .app.scroll {
    height: auto;
    min-height: 100dvh;
  }
  header {
    flex: none;
    height: 48px;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
  }
  .count {
    min-width: 44px;
    height: 44px;
    padding: 0 12px;
    margin-right: -12px;
    border-radius: 22px;
    color: var(--secondary);
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .count:hover {
    background: var(--hover);
  }
  .stage {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .card {
    position: relative;
    width: 100%;
    max-height: 100%;
    overflow-y: auto;
    background: var(--card);
    border-radius: 16px;
    box-shadow: var(--shadow);
    padding: 12px 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    transition:
      transform 0.18s cubic-bezier(0.2, 0, 0, 1),
      opacity 0.16s;
    animation: enter 0.18s cubic-bezier(0.14, 1, 0.34, 1);
  }
  .card.moving {
    transition: none;
  }
  @keyframes enter {
    from {
      transform: scale(0.97);
      opacity: 0;
    }
  }
  .cap {
    margin: 0 4px;
    color: var(--secondary);
    font-size: 13px;
    line-height: 16px;
    font-weight: 600;
  }
  .solo {
    min-height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
  }
  .choices {
    display: grid;
    gap: 12px;
  }
  @media (min-width: 720px) {
    .choices {
      grid-template-columns: 1fr 1fr;
    }
  }
  .choice {
    min-height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid var(--divider);
    background: var(--card);
  }
  .choice:hover {
    background: var(--hover);
  }
  .choice:active {
    background: var(--pressed);
  }
  .screen {
    display: block;
    max-width: 100%;
    max-height: calc(100dvh - 220px);
    margin: 0 auto;
    border-radius: 12px;
    object-fit: contain;
    pointer-events: none;
  }
  .hint {
    position: absolute;
    top: 12px;
    padding: 4px 10px;
    border-radius: 6px;
    font-weight: 700;
    font-size: 15px;
    background: var(--card);
    box-shadow: var(--shadow);
    pointer-events: none;
  }
  .hint.right {
    right: 12px;
    color: var(--positive);
  }
  .hint.left {
    left: 12px;
    color: var(--secondary);
  }
  .hint.up,
  .hint.down {
    left: 50%;
    transform: translateX(-50%);
  }
  .hint.up {
    color: var(--love);
  }
  .hint.down {
    color: var(--secondary);
    top: auto;
    bottom: 12px;
  }
  .quiet {
    color: var(--secondary);
  }
  .controls {
    flex: none;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 20px;
    padding: 16px 0 calc(20px + env(safe-area-inset-bottom));
  }
  .ctl {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--card);
    box-shadow: var(--shadow);
    display: grid;
    place-items: center;
    color: var(--secondary);
  }
  .ctl.sm {
    width: 44px;
    height: 44px;
    color: var(--secondary);
  }
  .ctl.dislike {
    color: var(--negative);
  }
  .ctl.love {
    color: var(--love);
  }
  .ctl.like {
    color: var(--positive);
  }
  .ctl:active {
    background: var(--pressed);
  }
  .ctl:disabled {
    opacity: 0.4;
  }
  .ctl svg {
    width: 24px;
    height: 24px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .ctl.sm svg {
    width: 20px;
    height: 20px;
  }
  .toasts {
    flex: 1;
    min-width: 0;
    display: flex;
  }
  .toast {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 4px 0 14px;
    min-height: 36px;
    border-radius: 18px;
    background: var(--toast);
    color: var(--on-toast);
    font-size: 13px;
    font-weight: 600;
    pointer-events: auto;
    animation: enter 0.18s cubic-bezier(0.14, 1, 0.34, 1);
  }
  .toast button {
    min-height: 44px;
    padding: 0 10px;
    color: #6eb1ff;
    font-weight: 600;
  }
</style>
