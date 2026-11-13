<script lang="ts">
  import { store } from "../store";
  import { fmtEventDate } from "../store/fake-data";
  import { compact, names } from "../lib/format";
  import { nav } from "../lib/nav.svelte";
  import { ui } from "../lib/ui.svelte";
  import { ME, type Rsvp } from "../store/types";
  import Avatar from "./Avatar.svelte";
  import Icon from "./Icon.svelte";
  import EventCatalysts from "../muse/components/EventCatalysts.svelte"; // catalysts
  import Cover from "./Cover.svelte";

  /**
   * Event page, phone and desktop (the design notes section 2). The Muse moment: once you tap Interested or
   * Going, friends who are interested show up as a card in the page flow with one button, "Go together".
   */
  let { eventId }: { eventId: string } = $props();

  const ev = $derived(store.event(eventId)!);
  const rsvp = $derived(store.rsvp(eventId));
  const friends = $derived(ev.friends.map((id) => store.person(id)));
  const interested = $derived(ev.interested + (rsvp === "interested" ? 1 : 0));
  const going = $derived(ev.going + (rsvp === "going" ? 1 : 0));
  const date = $derived(new Date(ev.start));
  let more = $state(false);

  // The cover is 16:9; the phone box is about 1:1, so it is a centred cover crop.
  const coverId = $derived(`event-${ev.id}-cover`); // drawn (src/lib/cover.ts)
  const coverAlt = $derived(`Event cover: ${ev.title}`);

  const toggle = (v: Rsvp) => store.setRsvp(eventId, rsvp === v ? null : v);

  function together() {
    const id = store.createChat({
      key: `event:${ev.id}`,
      name: ev.title,
      members: ev.friends,
      templateId: "whos-in",
      toolName: "Who's in",
      ask: `muse make a who's in for ${ev.title}`,
      piece: "lock",
      params: { title: "Who's in", detail: `${ev.venue} · ${fmtEventDate(ev.start)}`, need: 0 },
    });
    nav.openChat(id);
  }
</script>

{#snippet actions()}
  <div class="actions">
    <button class="btn" class:soft={rsvp === "interested"} aria-pressed={rsvp === "interested"} onclick={() => toggle("interested")}>
      <Icon name={rsvp === "interested" ? "starFilled" : "star"} />Interested
    </button>
    <button class="btn" class:soft={rsvp === "going"} aria-pressed={rsvp === "going"} onclick={() => toggle("going")}>
      <Icon name={rsvp === "going" ? "check" : "calendar"} />Going
    </button>
    <button aria-disabled="true" title="Not in this prototype" class="btn share" aria-label="Share"><Icon name="share_arrow" /></button>
  </div>
{/snippet}

{#snippet moment()}
  <EventCatalysts {ev} {rsvp} /><!-- catalysts: Muse field, offers in the friends card, tools on this event (src/muse) -->
{/snippet}

{#snippet details()}
  <section class="card" aria-labelledby="details-h">
    <h2 id="details-h" class="h">Details</h2>
    <ul class="rows">
      <li><Icon name="people" /><span>{ev.interested.toLocaleString("en-US")} people responded</span></li>
      <li><Icon name="person" /><span>Event by <strong>{ev.host}</strong></span></li>
      <li><Icon name="pin" /><span><strong>{ev.venue}</strong></span></li>
      <li><Icon name="globe" /><span>Public · Anyone on or off Facebook</span></li>
    </ul>
    <p class="desc" class:clamp={!more}>{ev.description}</p>
    {#if !more}<button class="seemore" onclick={() => (more = true)}>See more</button>{/if}
  </section>
{/snippet}

{#snippet head()}
  <p class="date">{fmtEventDate(ev.start)}</p>
  <h1 class="title">{ev.title}</h1>
  <p class="venue">{ev.venue} · Eastfield</p>
  <p class="counts">{compact(interested)} interested · {going} going</p>
{/snippet}

{#snippet cover()}
  <div class="cover" role="img" aria-label={coverAlt}>
    {#if coverId}
      <Cover id={coverId} kind="event" alt="" />
    {:else}
      <span class="sun"></span>
      <span class="hill"></span>
    {/if}
  </div>
{/snippet}

{#if ui.desktop}
  <section class="page desk" aria-label="Event">
    <div class="band">
      {@render cover()}
      <div class="col">
        <div class="tile" aria-hidden="true">
          <span class="strip">{date.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</span>
          <span class="day">{date.getDate()}</span>
        </div>
        <div class="intro">{@render head()}</div>
        <hr class="rule" />
        <div class="tabrow">
          <div class="tabs" role="tablist" aria-label="Event sections">
            <button role="tab" aria-selected="true" class="tab on">About</button>
            <button aria-disabled="true" title="Not in this prototype" role="tab" aria-selected="false" class="tab" tabindex="-1">Discussion</button>
          </div>
          {@render actions()}
        </div>
      </div>
    </div>
    <div class="body">
      <div class="left">
        {@render moment()}
        {@render details()}
      </div>
    </div>
  </section>
{:else}
  <section class="page phone" aria-label="Event">
    <header class="bar">
      <button class="back" aria-label="Back" onclick={() => nav.back()}><Icon name="back" /></button>
      <span class="bar-title">Event</span>
      <button aria-disabled="true" title="Not in this prototype" class="sharebtn" aria-label="Share"><Icon name="share_arrow" /></button>
    </header>
    <div class="scroll">
      {@render cover()}
      <div class="inner">
        <div class="intro">{@render head()}</div>
        {@render actions()}
        {@render moment()}
        {@render details()}
      </div>
    </div>
  </section>
{/if}

<style>
  .page { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--c-bg); }
  .page.desk { overflow-y: auto; background: var(--c-wash); }

  /* ---- phone ---- */
  /* Facebook header (IOS_FINDINGS, Facebook): 52 tall, opaque, no divider line. */
  .bar { flex: none; display: flex; align-items: center; height: calc(var(--fb-header-h) + var(--safe-top)); padding: var(--safe-top) var(--sp-8) 0 var(--sp-4); background: var(--c-fb-header); position: relative; z-index: 1; }
  .back, .sharebtn { width: var(--hit); height: var(--hit); display: inline-flex; align-items: center; justify-content: center; color: var(--c-accent-icon); }
  .back { --icon-size: var(--sp-28); }
  .sharebtn { --icon-size: var(--sp-24); }
  .bar-title { flex: 1; text-align: center; font-size: var(--fs-title); line-height: var(--lh-title); font-weight: var(--fw-semibold); }
  .scroll { flex: 1; min-height: 0; overflow-y: auto; padding-bottom: calc(var(--safe-bottom) + var(--sp-16)); scrollbar-width: none; }
  .scroll::-webkit-scrollbar { display: none; }
  .inner { padding: var(--sp-12) var(--sp-16) 0; display: flex; flex-direction: column; gap: var(--sp-12); }

  /* ANDROID_FINDINGS: the phone cover is about 1:1 (427 x 440); desktop 665 x 350. */
  .cover {
    position: relative;
    width: var(--event-cover-w);
    aspect-ratio: var(--event-cover-aspect);
    background: linear-gradient(var(--c-cover-1), var(--c-cover-2));
    overflow: hidden;
    flex: none;
  }
  .sun { position: absolute; top: 18%; right: 16%; width: 14%; aspect-ratio: 1; border-radius: var(--r-round); background: var(--c-white); opacity: 0.55; }
  .hill { position: absolute; left: 0; right: 0; bottom: 0; height: 30%; border-radius: 50% 50% 0 0 / 100% 100% 0 0; background: var(--c-ph-2); opacity: 0.7; }

  .intro { display: flex; flex-direction: column; }
  .date { font-size: var(--fs-date-line); line-height: var(--lh-date-line); font-weight: var(--fw-bold); color: var(--c-date-line); text-transform: uppercase; }
  .title { margin-top: var(--sp-4); font-size: var(--fs-event-title); line-height: var(--lh-event-title); font-weight: var(--fw-bold); }
  .venue { margin-top: var(--sp-6); font-size: var(--fs-card); line-height: var(--lh-card); color: var(--c-text-2); }
  .counts { margin-top: var(--sp-2); font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }

  .actions { display: flex; gap: var(--sp-8); }
  .phone .actions .btn:not(.share) { flex: 1; }
  .btn.share { width: var(--sp-48); padding: 0; flex: none; }
  .btn :global(.icon) { flex: none; }

  /* The Muse moment: a quiet card in the flow, between the buttons and Details. */
  .reveal { display: grid; grid-template-rows: 1fr; animation: open var(--dur-long) var(--ease-enter) both; }
  .moment {
    overflow: hidden;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-8);
    padding: var(--sp-12) var(--sp-16);
    border-radius: var(--r-card);
    background: var(--c-surface);
    /* ANDROID_FINDINGS: an event card has a 1 px border and no shadow on the phone; desktop keeps its shadow. */
    border: var(--event-card-border-w) solid var(--c-btn-secondary);
    box-shadow: var(--sh-event-card);
  }
  .pile { display: flex; }
  .pile > :global(.avatar + .avatar) { margin-left: calc(var(--sp-4) * -1); }
  .who { font-size: var(--fs-card); line-height: var(--lh-card); font-weight: var(--fw-semibold); }
  .together { width: 100%; }
  @keyframes open { from { grid-template-rows: 0fr; opacity: 0; } to { grid-template-rows: 1fr; opacity: 1; } }

  .card { background: var(--c-surface); border-radius: var(--r-card); box-shadow: var(--sh-card); padding: var(--sp-16); }
  .phone .card { background: none; box-shadow: none; padding: var(--sp-12) 0 0; border-top: 1px solid var(--c-divider); border-radius: 0; }
  .h { font-size: var(--fs-section); line-height: var(--lh-section); font-weight: var(--fw-bold); }
  .rows { margin-top: var(--sp-8); }
  .rows li { display: flex; align-items: center; gap: var(--sp-12); min-height: var(--event-row-h); font-size: var(--fs-card); line-height: var(--lh-card); --icon-size: var(--sp-20); }
  .rows li :global(.icon) { color: var(--c-text-2); }
  .rows strong { font-weight: var(--fw-semibold); }
  .desc { margin-top: var(--sp-12); font-size: var(--fs-card); line-height: var(--lh-card); }
  .desc.clamp { display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .seemore { margin-top: var(--sp-2); font-size: var(--fs-card); line-height: var(--lh-card); font-weight: var(--fw-semibold); color: var(--c-text-2); }

  /* ---- desktop (MP section 2) ---- */
  .band { flex: none; background: var(--c-bg); box-shadow: var(--sh-card); }
  .desk .cover { width: min(calc(var(--event-col-w) - var(--sp-24)), calc(100% - var(--sp-24))); height: var(--event-cover-h); aspect-ratio: auto; margin: 0 auto; border-radius: 0 0 var(--r-button) var(--r-button); }
  .col { width: min(var(--event-col-w), 100%); margin: 0 auto; padding: 0 var(--sp-12); }
  .tile {
    position: relative;
    width: var(--event-tile);
    height: var(--event-tile);
    margin-top: calc((var(--event-tile) - var(--sp-16)) * -1);
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--c-bg);
    border-radius: var(--r-button);
    box-shadow: 0 0 var(--sp-12) var(--c-hairline);
    overflow: hidden;
  }
  .strip { width: 100%; height: var(--event-tile-strip); background: var(--c-date-strip); color: var(--c-white); font-size: var(--fs-tab); line-height: var(--event-tile-strip); font-weight: var(--fw-semibold); text-align: center; }
  .day { flex: 1; display: flex; align-items: center; font-size: var(--sp-40); line-height: 1; font-weight: var(--fw-semibold); }
  .desk .intro { margin-top: var(--sp-12); padding-bottom: var(--sp-16); }
  .desk .venue { font-size: var(--fs-title); line-height: var(--lh-title); }
  .rule { margin: 0; border: 0; height: 1px; background: var(--c-divider); }
  .tabrow { display: flex; align-items: center; justify-content: space-between; height: var(--tab-row-h); }
  .tabs { display: flex; height: 100%; }
  .tab { padding: 0 var(--sp-16); font-size: var(--fs-card); line-height: var(--lh-card); font-weight: var(--fw-semibold); color: var(--c-text-2); border-bottom: var(--sp-3) solid transparent; border-radius: var(--r-button) var(--r-button) 0 0; }
  .tab.on { color: var(--c-btn-soft-text); border-bottom-color: var(--c-accent); }
  .tab:not(.on):hover { background: var(--c-hover); }
  .body { width: min(var(--event-col-w), 100%); margin: var(--sp-16) auto var(--sp-32); padding: 0 var(--sp-12); }
  .left { width: min(var(--event-card-w), 100%); margin: 0 auto; display: flex; flex-direction: column; gap: var(--sp-16); }
  .desk .moment { padding: var(--sp-16); }
  .desk .together { width: auto; }
</style>
