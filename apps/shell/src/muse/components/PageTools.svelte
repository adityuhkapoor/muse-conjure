<script lang="ts">
  import { tick } from "svelte";
  import MuseMark from "../../components/MuseMark.svelte";
  import { store } from "../../store";
  import { ME } from "../../store/types";
  import SurfaceToolCard from "../../surfaces/components/SurfaceToolCard.svelte";
  import { who } from "../../surfaces/flows.svelte";
  import { catalyst, pageKey } from "../catalyst.svelte";
  import { PACK } from "../pack";
  import type { PageContext } from "../types";

  /**
   * Catalyst 3, someone already made it: the tools that live on this page for everyone here,
   * each a real synced tool in the page's own room, credited and usable in place, and "Use for my
   * group" to take it to a chat. `skip`: tools the page already shows elsewhere.
   */
  type Props = { ctx: PageContext; credit: string; skip?: string[] };
  let { ctx, credit, skip = [] }: Props = $props();

  const key = $derived(pageKey(ctx));
  const tools = $derived(store.surfaceTools(key).filter((t) => !skip.includes(t.id) && !skip.includes(t.name)));
  const scenarioFor = (name: string) => PACK.find((s) => s.surface === ctx.surface && s.title(ctx) === name);
  const maker = (by: string | undefined) => (!by ? "" : by === ME ? "You made this" : `${store.person(by)?.first ?? who(by)?.first ?? "A friend"} made this`);
  let el: HTMLElement | undefined = $state();

  $effect(() => {
    const j = catalyst.justMade;
    if (!j || j.key !== key) return;
    tick().then(() => [...(el?.querySelectorAll(".tool") ?? [])].at(-1)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  });
</script>

{#if tools.length}
  <section class="tools" aria-label={`Made with Muse ${credit}`} bind:this={el} data-page-tools={key}>
    {#each tools as t (t.id)}
      {@const sc = scenarioFor(t.name)}
      <div class="tool">
        <p class="credit">
          <MuseMark size="var(--sp-16)" />
          <span class="ct"><strong>Made with Muse</strong> · {credit}</span>
        </p>
        {#if t.by && t.by !== "muse"}<p class="by">{maker(t.by)}{t.users && t.users > 1 ? ` · ${t.users} used it` : ""}</p>{/if}
        <SurfaceToolCard backingKey={key} toolId={t.id} subtitle={`Made with Muse · ${credit}`} />
        {#if sc && !t.building}
          <button class="btn use" onclick={() => catalyst.useForGroup(ctx, sc.id)}>Use for my group</button>
        {/if}
      </div>
    {/each}
  </section>
{/if}

<style>
  .tools { display: flex; flex-direction: column; gap: var(--sp-16); }
  .tool { display: flex; flex-direction: column; gap: var(--sp-6); }
  .credit { display: flex; align-items: center; gap: var(--sp-6); font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  .credit strong { font-weight: var(--fw-semibold); color: var(--c-text); }
  .ct { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .by { margin-top: calc(var(--sp-4) * -1); font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  .use { align-self: flex-start; }
</style>
