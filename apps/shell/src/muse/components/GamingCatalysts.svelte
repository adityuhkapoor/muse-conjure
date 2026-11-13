<script lang="ts">
  import { store } from "../../store";
  import { catalyst } from "../catalyst.svelte";
  import { gamingContext } from "../context";
  import { nameOf } from "../page";
  import MuseAsk from "./MuseAsk.svelte";
  import MuseSuggest from "./MuseSuggest.svelte";
  import PageTools from "./PageTools.svelte";

  /** Gaming hook (surfaces/components/Gaming.svelte): games Muse can make from your chats, and "make us a game about ...". */
  const ctx = $derived(gamingContext({ nameOf, chats: store.chats.filter((c) => c.kind === "group").map((c) => ({ id: c.id, name: c.name, members: c.members })) }));
  const offers = $derived(catalyst.suggest(ctx));
</script>

<div class="cat">
  <PageTools {ctx} credit="for your group" />
  <MuseAsk placeholder="Make a game for your group" onask={(t) => catalyst.ask(ctx, t)} />
  <MuseSuggest items={offers} ontake={(s) => catalyst.take(ctx, s)} ondismiss={(ids) => catalyst.dismiss(ids)} />
</div>

<style>
  .cat { display: flex; flex-direction: column; gap: var(--sp-8); margin-bottom: var(--sp-16); }
</style>
