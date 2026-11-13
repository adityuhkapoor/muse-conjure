<script lang="ts">
  import type { Group } from "../../surfaces/data";
  import { catalyst } from "../catalyst.svelte";
  import { groupContext } from "../context";
  import { nameOf } from "../page";
  import MuseAsk from "./MuseAsk.svelte";
  import MuseSuggest from "./MuseSuggest.svelte";
  import PageTools from "./PageTools.svelte";

  /**
   * Group hook (surfaces/components/GroupPage.svelte). `part="composer"`: the reader's offers under
   * what you are typing (posts that already answer it), and the Muse field. `part="tools"`: tools
   * pinned for the group that the page does not already show (`skip`).
   */
  let { g, draft = "", part, skip = [], ontaken }: { g: Group; draft?: string; part: "composer" | "tools"; skip?: string[]; ontaken?: () => void } = $props();
  const ctx = $derived(groupContext(g, { draft, nameOf }));
  const offers = $derived(catalyst.suggest(ctx));
</script>

{#if part === "composer"}
  <MuseSuggest items={offers} ontake={(s) => { catalyst.take(ctx, s); ontaken?.(); }} ondismiss={(ids) => catalyst.dismiss(ids)} />
  <MuseAsk placeholder="Ask Muse about this group" onask={(t) => { const r = catalyst.ask(ctx, t); void r.then((a) => a.made && ontaken?.()); return r; }} />
{:else}
  <PageTools {ctx} credit="pinned for this group" {skip} />
{/if}
