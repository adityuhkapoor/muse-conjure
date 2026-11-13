<script lang="ts">
  import Avatar from "../../components/Avatar.svelte";
  import { names } from "../../lib/format";
  import { store } from "../../store";
  import type { EventInfo, Rsvp } from "../../store/types";
  import { catalyst } from "../catalyst.svelte";
  import { eventContext } from "../context";
  import { nameOf, viewer } from "../page";
  import MuseAsk from "./MuseAsk.svelte";
  import MuseSuggest from "./MuseSuggest.svelte";
  import PageTools from "./PageTools.svelte";

  /**
   * Event page hook (components/EventPage.svelte): the Muse field, the reader's offers in the
   * friends card once you tap Interested or Going, and the tools that live on this event.
   */
  let { ev, rsvp }: { ev: EventInfo; rsvp: Rsvp | null } = $props();
  const ctx = $derived(eventContext(ev, { rsvp, now: store.now(), nameOf, viewer: viewer() }));
  const offers = $derived(catalyst.suggest(ctx));
  const friends = $derived(ev.friends.map((id) => store.person(id)));
  const hosting = $derived(ctx.facts.hosting === true);
</script>

<div class="cat">
  <PageTools {ctx} credit="for this event" /><!-- the live tool first, then ask for your own -->
  <MuseAsk placeholder={hosting ? "Ask Muse to help you host" : "Ask Muse about this event"} onask={(t) => catalyst.ask(ctx, t)} />
  {#if offers.length}
    <div class="reveal">
      <section class="moment" aria-label={rsvp ? "Friends who are interested" : "Suggestions"}>
        {#if rsvp && ctx.facts.kind === "concert"}
          <div class="pile" aria-hidden="true">
            {#each friends as p (p?.id)}<Avatar person={p} size="var(--avatar-facepile)" ring />{/each}
          </div>
          <p class="who">{names(friends.map((p) => p?.first ?? ""))} are interested too</p>
        {/if}
        <div class="rows"><MuseSuggest items={offers} ontake={(s) => catalyst.take(ctx, s)} ondismiss={(ids) => catalyst.dismiss(ids)} /></div>
      </section>
    </div>
  {/if}
</div>

<style>
  .cat { display: flex; flex-direction: column; gap: var(--sp-12); }
  /* Desktop: the column sits on the wash, so the field gets the card's own surface. */
  :global(:root[data-layout="desktop"]) .cat > :global([data-muse-ask-wrap] > [data-muse-ask]) { background: var(--c-surface); box-shadow: var(--sh-card); }
  .reveal { display: grid; grid-template-rows: 1fr; animation: open var(--dur-long) var(--ease-enter) both; }
  .moment {
    overflow: hidden;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
    padding: var(--sp-12) var(--sp-16);
    border-radius: var(--r-card);
    background: var(--c-surface);
    border: var(--event-card-border-w) solid var(--c-btn-secondary);
    box-shadow: var(--sh-event-card);
  }
  :global(:root[data-layout="desktop"]) .moment { padding: var(--sp-16); }
  .pile { display: flex; }
  .pile > :global(.avatar + .avatar) { margin-left: calc(var(--sp-4) * -1); }
  .who { font-size: var(--fs-card); line-height: var(--lh-card); font-weight: var(--fw-semibold); }
  .rows { align-self: stretch; }
  @keyframes open { from { grid-template-rows: 0fr; opacity: 0; } to { grid-template-rows: 1fr; opacity: 1; } }
</style>
