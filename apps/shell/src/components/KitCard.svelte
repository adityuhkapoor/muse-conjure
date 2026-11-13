<script lang="ts">
  import MuseMark from "./MuseMark.svelte";
  import Photo from "./Photo.svelte";
  import { store } from "../store";
  import { nav } from "../lib/nav.svelte";
  import { usd } from "../lib/kit";
  import { listing } from "../surfaces/data";
  import type { Message } from "../store/types";

  /**
   * kit: what a plan needs, from Marketplace (services/demo/kit.ts). Each row opens its listing, or the
   * page for a real store product found online; the count leads the name so it is never cut. Then the
   * group divides it up: "Who brings what" (the claims piece) and "Split" (the split piece).
   * Same card as MuseCard (radius, hairline, header); while Muse works it out it is the building state.
   */
  let { msg, chatId, ontool }: { msg: Message; chatId: string; ontool?: (toolId: string) => void } = $props();
  const k = $derived(msg.kit);
  const open = $derived(k ? k.items.filter((i) => !i.covered) : []);
  const covered = $derived(k ? k.items.filter((i) => i.covered) : []);
  const onMp = (i: { listing: string | null }) => !!i.listing && !!listing(i.listing);
  const source = $derived.by(() => {
    const mp = open.some(onMp);
    const web = open.some((i) => !onMp(i) && i.online);
    return mp && web ? "Marketplace + online" : mp ? "From Marketplace" : web ? "Found online" : "Not on Marketplace";
  });
  const claims = $derived(k?.claims ? store.tool(k.claims) : undefined);
  const split = $derived(k?.split ? store.tool(k.split) : undefined);

  function openRow(i: NonNullable<typeof k>["items"][number]) {
    if (i.listing && listing(i.listing)) nav.go({ kind: "fb", page: { name: "listing", id: i.listing } });
    else if (i.online) nav.go({ kind: "fb", page: { name: "online", item: { ...i, online: i.online } } });
  }
</script>

<article class="card" data-kit={msg.id} aria-busy={!k} aria-label={k ? k.title : "Muse is pricing it"}>
  <header class="head">
    <MuseMark spin={!k} />
    <div class="titles">
      <p class="title">{k ? k.title : "Muse is pricing it…"}</p>
      <p class="sub">{k ? source : "Checking Marketplace, then stores online"}</p>
    </div>
  </header>
  {#if !k}
    <div class="body skeleton" aria-hidden="true"><span class="bar b1"></span><span class="bar b2"></span><span class="bar b3"></span></div>
  {:else}
    <ul class="rows">
      {#each open as i, n (n)}
        {@const l = i.listing ? listing(i.listing) : undefined}
        <li>
          <button class="row" onclick={() => openRow(i)} disabled={!l && !i.online}>
            <span class="thumb">
              {#if l}
                <Photo id={l.asset} width={52} alt="" />
              {:else if i.online?.image}
                <img src={i.online.image} alt="" referrerpolicy="no-referrer" />
              {:else}
                <span class="initial">{i.online ? i.online.store.charAt(0).toUpperCase() : "?"}</span>
              {/if}
            </span>
            <span class="text">
              <span class="need">{#if i.qty > 1}<span class="qty">{i.qty}×&nbsp;</span>{/if}{i.need}</span>
              <span class="what">{l ? `${l.title} · Marketplace` : i.online ? `Online at ${i.online.store} · ${i.online.title}` : `Not on Marketplace, none found online · ${i.why}`}</span>
            </span>
            <span class="cost">{l || i.online?.price != null ? usd(i.cost) : "–"}</span>
          </button>
        </li>
      {/each}
    </ul>
    {#if covered.length}<p class="covered">Covered: {covered.map((i) => `${i.need} (${i.covered})`).join(", ")}</p>{/if}
    <p class="total"><span>Total <strong>{usd(k.total)}</strong></span><span><strong>{usd(k.each)}</strong> each for {k.people}</span></p>
    <div class="actions">
      {#if claims}
        <button class="btn soft" onclick={() => ontool?.(claims.id)}>Open bring list</button>
      {:else}
        <button class="btn primary" onclick={() => store.kitClaims?.(chatId, msg.id)}>Who brings what</button>
      {/if}
      {#if k.total > 0}
        {#if split}
          <button class="btn soft" onclick={() => ontool?.(split.id)}>Open split</button>
        {:else}
          <button class="btn soft" onclick={() => store.kitSplit?.(chatId, msg.id)}>Split {usd(k.total)}</button>
        {/if}
      {/if}
    </div>
  {/if}
</article>

<style>
  .card { width: 100%; background: var(--c-bg); border-radius: var(--r-rich-card); box-shadow: inset 0 0 0 1px var(--c-hairline); overflow: hidden; }
  .head { display: flex; align-items: center; gap: var(--sp-8); padding: var(--sp-12) var(--sp-12) var(--sp-4); }
  .titles { flex: 1; min-width: 0; }
  .title { font-size: var(--fs-row-sub); line-height: var(--lh-row-sub); font-weight: var(--fw-semibold); color: var(--c-text); overflow-wrap: anywhere; }
  .sub { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  .rows { list-style: none; margin: 0; padding: 0 var(--sp-8); }
  .row { display: flex; align-items: center; gap: var(--sp-12); width: 100%; padding: var(--sp-6) var(--sp-4); border-radius: var(--r-card); text-align: left; color: inherit; }
  .row:not(:disabled):hover { background: var(--c-hover); }
  .row:disabled { cursor: default; }
  .thumb { flex: none; width: var(--sp-48); height: var(--sp-48); border-radius: var(--r-card); overflow: hidden; background: var(--c-field); display: flex; align-items: center; justify-content: center; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .initial { font-weight: var(--fw-bold); color: var(--c-text-2); }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  /* the name wraps to two lines at most; the count leads it so it always shows */
  .need { font-size: var(--fs-row-sub); line-height: var(--lh-row-sub); font-weight: var(--fw-semibold); display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
  .qty { color: var(--c-primary); }
  .what { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
  .cost { flex: none; font-size: var(--fs-row-sub); line-height: var(--lh-row-sub); font-weight: var(--fw-semibold); }
  .covered { padding: var(--sp-4) var(--sp-12); font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  .total { display: flex; justify-content: space-between; gap: var(--sp-8); margin: var(--sp-6) var(--sp-12) 0; padding-top: var(--sp-8); border-top: 1px solid var(--c-divider); font-size: var(--fs-meta); line-height: var(--lh-meta); }
  .actions { display: flex; gap: var(--sp-8); padding: var(--sp-12); }
  .actions .btn { flex: 1; min-width: 0; white-space: nowrap; }
  .body { margin: 0 var(--sp-8) var(--sp-8); padding: var(--sp-16); border-radius: var(--r-card); background: var(--c-field); display: flex; flex-direction: column; gap: var(--sp-12); }
  .bar { display: block; height: var(--sp-12); background: var(--c-divider); border-radius: var(--r-pill); animation: glimmer var(--dur-xl) var(--ease-linear) infinite alternate; }
  .b1 { width: 70%; }
  .b2 { width: 50%; animation-delay: var(--dur-xxs); }
  .b3 { width: 60%; animation-delay: var(--dur-xs); }
  @keyframes glimmer { from { opacity: 0.15; } to { opacity: 0.5; } }
</style>
