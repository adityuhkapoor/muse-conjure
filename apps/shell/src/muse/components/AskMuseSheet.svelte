<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import Icon from "../../components/Icon.svelte";
  import MuseMark from "../../components/MuseMark.svelte";
  import Sheet from "../../components/Sheet.svelte";
  import { store } from "../../store";
  import { candidates, clipWords, kindOf, readLine, useLabel, type Offer } from "../compose";
  import { compose, postKey } from "../compose-live.svelte";
  import ToolPreview from "./ToolPreview.svelte";

  /**
   * "Ask Muse" on a draft. The patterns answer at once; a model reads the post (the factory's post
   * router: picks over the whole lab catalog, then each pick filled for this post and this person)
   * and its answer replaces or reorders them as it lands. Made-up options are listed so the author
   * can change them. When nothing fits, "Make something new for this post" builds one (minutes),
   * and the post can go up before it is ready.
   */
  type Props = { text: string; prefer?: string; onuse: (o: Offer) => void; onpost: () => void; onclose: () => void };
  let { text, prefer, onuse, onpost, onclose }: Props = $props();

  const PICK_BUDGET_MS = 15_000;
  /** after the picks, how long the fills may take before the ones still out are dropped */
  const FILL_BUDGET_MS = 60_000;
  const patterns = $derived(candidates(text, compose.ctx()));

  /** off: no model (replay, unreachable, timed out); reading: waiting for picks; filling; done */
  let phase = $state<"reading" | "filling" | "done" | "off">(store.live ? "reading" : "off");
  let picks = $state<{ id: string; name: string; reason: string }[]>([]);
  let filled = $state<Offer[]>([]);
  let nothingFits = $state(false);
  /** Muse's one line when nothing fits */
  let reply = $state("");
  let failedIds = $state<string[]>([]);
  let ctl: AbortController | null = null;

  async function ask(t: string) {
    ctl?.abort();
    const c = new AbortController();
    ctl = c;
    phase = store.live ? "reading" : "off";
    picks = [];
    filled = [];
    failedIds = [];
    nothingFits = false;
    reply = "";
    if (!store.live) return;
    let picked = false;
    let budget = setTimeout(() => !picked && c.abort(), PICK_BUDGET_MS);
    const r = await compose.route(t, {
      signal: c.signal,
      onpicks: (p, none, line) => {
        picked = true;
        clearTimeout(budget);
        budget = setTimeout(() => c.abort(), FILL_BUDGET_MS);
        picks = p;
        nothingFits = none;
        reply = line;
        phase = "filling";
      },
      onfilled: (o) => (filled = [...filled, o]),
      onunfilled: (id) => (failedIds = [...failedIds, id]),
    });
    clearTimeout(budget);
    if (ctl !== c) return;
    // A pick the stream ended without filling (an error, a cut connection, a fill out of time, a
    // tool this phone does not have) would otherwise stay a placeholder for good.
    const out = picks.filter((p) => !filled.some((o) => o.tool === `lab:${p.id}`) && !failedIds.includes(p.id)).map((p) => p.id);
    if (out.length) failedIds = [...failedIds, ...out];
    phase = r.available && picked ? "done" : "off";
  }
  onMount(() => void ask(text));
  onDestroy(() => ctl?.abort());

  /** the author's changes to what Muse made up, per tool */
  let edits = $state<Record<string, Record<string, string>>>({});
  const apply = (o: Offer): Offer => {
    const e = edits[o.tool];
    if (!e || !Object.keys(e).length) return o;
    const swap = (v: unknown): unknown => (typeof v === "string" ? (e[v] ?? v) : Array.isArray(v) ? v.map(swap) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)])) : v);
    return { ...o, params: swap(o.params) as Record<string, unknown>, suggested: (o.suggested ?? []).map((s) => e[s] ?? s) };
  };

  /** Model offers first (in its order), then patterns it did not repeat; at most three. Nothing when the model says nothing fits. */
  const offers = $derived.by(() => {
    const model = picks.map((p) => filled.find((o) => o.tool === `lab:${p.id}`)).filter((o): o is Offer => !!o);
    // the patterns wait for the model while it reads: they have misread a funeral post as a trip
    const rest = nothingFits || (store.live && phase === "reading") ? [] : patterns.offers.filter((o) => !model.some((m) => m.tool === o.tool));
    return [...model, ...rest].slice(0, 3).map(apply);
  });
  /**
   * The cards, as soon as routing returns: one per pick, in its order, each a placeholder (title
   * and the router's one-line reason) until its fill lands; then the patterns' ideas if there is room.
   */
  const cards = $derived.by(() => {
    const out: ({ offer: Offer } | { ghost: { id: string; name: string; reason: string } })[] = [];
    for (const p of picks) {
      if (failedIds.includes(p.id)) continue;
      const o = offers.find((x) => x.tool === `lab:${p.id}`);
      out.push(o ? { offer: o } : { ghost: p });
    }
    for (const o of offers) if (out.length < 3 && !out.some((c) => "offer" in c && c.offer.tool === o.tool)) out.push({ offer: o });
    return out.slice(0, 3);
  });
  const reading = $derived(phase === "reading" && !cards.length);
  const read = $derived(nothingFits && reply ? reply : offers[0] ? `Read ${readLine(clipWords(offers[0].read, 72))}` : phase === "reading" || phase === "filling" ? "Reading your post" : nothingFits ? "Nothing in the catalog fits this post yet" : "No Mini fits this post yet");

  let chosen = $state<string | null>(null);
  $effect(() => {
    if (chosen && offers.some((o) => o.tool === chosen)) return;
    chosen = (prefer && offers.some((o) => o.tool === prefer) ? prefer : offers[0]?.tool) ?? null;
  });
  const pick = $derived(offers.find((o) => o.tool === chosen) ?? null);

  let want = $state("");
  function free(e: SubmitEvent) {
    e.preventDefault();
    const q = want.trim();
    if (!q) return;
    want = "";
    void ask(`${text}\nWhat I want: ${q}`);
  }

  function edit(tool: string, from: string, to: string) {
    const t = to.trim();
    if (!t || t === from) return;
    const orig = Object.entries(edits[tool] ?? {}).find(([, v]) => v === from)?.[0] ?? from;
    edits = { ...edits, [tool]: { ...(edits[tool] ?? {}), [orig]: t } };
  }

  const making = $derived(compose.making);
  const makingTool = $derived(making ? store.surfaceTools(postKey(making.postId)).at(-1) : undefined);
  const canMake = $derived(store.live && (phase === "done" || phase === "off"));
</script>

<Sheet label="Ask Muse" {onclose} wide>
  <div class="ask" data-ask-muse data-ask-phase={phase}>
    <header class="h">
      <MuseMark size="var(--mark-row)" spin={phase === "reading" || phase === "filling" || (!!making && !making.done && !making.error)} />
      <div class="ht">
        <h2 class="fb-section">Ask Muse</h2>
        <p class="fb-meta" data-ask-read>{making ? "Making a Mini for this post" : read}</p>
      </div>
    </header>

    {#if making}
      <section class="make" data-ask-making={making.done ? "done" : making.error ? "error" : "working"}>
        <div class="mk">
          <MuseMark size="var(--sp-28)" spin={!making.done && !making.error} />
          <div>
            <p class="cn">{making.error ? "Muse couldn't make this one" : making.done ? `${makingTool?.name ?? "It"} is ready` : `${making.stage} · ${compose.makingSeconds} s`}</p>
            <p class="cd">{making.error ? making.error : making.done ? "It is on your post. Add it, or keep editing first." : compose.makingNote}</p>
          </div>
        </div>
      </section>
      <div class="row2">
        {#if making.error}
          <button class="btn" onclick={() => compose.cancelNew()}>Back</button>
          <button class="btn primary" onclick={() => compose.makeNew(text)}>Try again</button>
        {:else}
          <button class="btn" onclick={() => { compose.cancelNew(); }}>Cancel</button>
          <button class="btn" onclick={onclose} data-ask-keep-editing>Keep editing</button>
          <button class="btn primary" onclick={onpost} data-ask-post-now>{making.done ? "Post" : "Post now"}</button>
        {/if}
      </div>
    {:else}
      <div class="cards" role="radiogroup" aria-label="Minis for your post">
        {#each cards as c (("offer" in c ? c.offer.tool : `lab:${c.ghost.id}`))}
          {#if "ghost" in c}
            {@const p = c.ghost}
            <div class="card ghost" aria-label={`Filling ${p.name}`} data-ask-waiting={p.id}>
              <div class="ch"><span class="radio" aria-hidden="true"></span><span class="ct"><span class="cn">{p.name}</span><span class="cd">{p.reason}</span></span></div>
              <div class="sk" aria-hidden="true"><span class="bar b1"></span><span class="bar b2"></span><span class="bar b3"></span></div>
            </div>
          {:else}
          {@const o = c.offer}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="card" class:on={o.tool === chosen} role="radio" aria-checked={o.tool === chosen} aria-label={o.title} tabindex="0" onclick={() => (chosen = o.tool)} onkeydown={(e) => (e.key === "Enter" || e.key === " ") && (chosen = o.tool)} data-ask-card={o.tool} data-source={o.source ?? "pattern"} data-title={o.title}>
            <div class="ch">
              <span class="radio" aria-hidden="true">{#if o.tool === chosen}<Icon name="check" />{/if}</span>
              <span class="ct"><span class="cn">{o.title}</span><span class="cd">{kindOf(o)[0]!.toUpperCase() + kindOf(o).slice(1)} · {clipWords(o.read, 72)}</span></span>
            </div>
            <ToolPreview offer={o} compact />
            {#if o.tool === chosen && o.suggested?.length}
              <div class="sug" data-ask-suggested>
                <p class="cd">Muse suggested these. Change any:</p>
                <div class="edits">
                  {#each o.suggested.slice(0, 8) as s, i (i)}
                    <input class="ed" value={s} aria-label={`Suggestion ${i + 1}`} onclick={(e) => e.stopPropagation()} onkeydown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }} onchange={(e) => edit(o.tool, s, (e.currentTarget as HTMLInputElement).value)} />
                  {/each}
                </div>
              </div>
            {/if}
          </div>
          {/if}
        {/each}
        {#if reading}
          {#each [0, 1] as i (i)}
            <div class="card ghost" aria-hidden="true" data-ask-skeleton>
              <div class="ch"><span class="radio"></span><span class="ct"><span class="bar b2"></span></span></div>
              <div class="sk"><span class="bar b1"></span><span class="bar b2"></span><span class="bar b3"></span></div>
            </div>
          {/each}
        {/if}
      </div>

      {#if canMake && !cards.length}
        <button class="newbig" onclick={() => compose.makeNew(text)} data-ask-make-new>
          <MuseMark size="var(--sp-28)" />
          <span class="ct"><span class="cn">Conjure a new Mini for this post</span><span class="cd">Muse makes a Mini just for this. It takes a few minutes.</span></span>
          <span class="chev" aria-hidden="true"><Icon name="chevronRight" /></span>
        </button>
      {/if}

      {#if store.live && phase !== "off"}
        <form class="free" onsubmit={free}>
          <input class="in" bind:value={want} placeholder="Tell Muse what you want" aria-label="Tell Muse what you want" data-ask-free />
          <button class="send" type="submit" aria-label="Ask" disabled={!want.trim()}><Icon name="send" /></button>
        </form>
      {/if}

      {#if offers.length}
        <button class="btn primary use" disabled={!pick} onclick={() => pick && onuse(pick)} data-ask-use>{pick ? useLabel(pick) : "Add this Mini"}</button>
        {#if canMake}<button class="link" onclick={() => compose.makeNew(text)} data-ask-make-new>Make a new Mini for this post</button>{/if}
      {/if}
    {/if}
  </div>
</Sheet>

<style>
  .ask { display: flex; flex-direction: column; gap: var(--sp-12); }
  .h { display: flex; align-items: center; gap: var(--sp-8); }
  .ht { min-width: 0; }
  .cards { display: flex; flex-direction: column; gap: var(--sp-10); }
  .card { display: flex; flex-direction: column; gap: var(--sp-8); padding: var(--sp-8); border-radius: var(--r-rich-card); background: var(--c-field); box-shadow: inset 0 0 0 1px var(--c-hairline); cursor: pointer; outline: none; }
  .card.on { box-shadow: inset 0 0 0 var(--sp-2) var(--c-primary); background: var(--c-bg); }
  .card:focus-visible { box-shadow: inset 0 0 0 var(--sp-2) var(--c-accent); }
  .card.ghost { cursor: default; }
  .ch { display: flex; align-items: center; gap: var(--sp-8); min-height: var(--sp-32); }
  .radio { flex: none; width: var(--sp-20); height: var(--sp-20); border-radius: var(--r-round); box-shadow: inset 0 0 0 var(--sp-2) var(--c-divider); display: inline-flex; align-items: center; justify-content: center; color: var(--c-white); --icon-size: var(--sp-12); }
  .on .radio { background: var(--c-primary); box-shadow: none; }
  .ct { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: var(--sp-2); }
  .cn { font-size: var(--fs-btn); line-height: var(--lh-btn); font-weight: var(--fw-semibold); color: var(--c-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cd { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  .ct .cd { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sk { height: calc(var(--sp-80) * 1.5); border-radius: var(--r-card); background: var(--c-bg); display: flex; flex-direction: column; justify-content: center; gap: var(--sp-10); padding: 0 var(--sp-16); }
  .bar { display: block; height: var(--sp-12); border-radius: var(--r-pill); background: var(--c-divider); animation: glimmer var(--dur-xl) var(--ease-linear) infinite alternate; }
  .b1 { width: 70%; }
  .b2 { width: 45%; animation-delay: var(--dur-xxs); }
  .b3 { width: 58%; animation-delay: var(--dur-xs); }
  .sug { display: flex; flex-direction: column; gap: var(--sp-6); }
  .edits { display: flex; flex-wrap: wrap; gap: var(--sp-6); }
  .ed { flex: 1 1 40%; min-width: 0; height: var(--sp-32); padding: 0 var(--sp-10); border: 0; border-radius: var(--r-button); background: var(--c-field); color: var(--c-text); font: inherit; font-size: var(--fs-meta); box-shadow: inset 0 0 0 1px var(--c-hairline); outline: none; }
  .ed:focus { box-shadow: inset 0 0 0 var(--sp-2) var(--c-primary); }
  .newbig { display: flex; align-items: center; gap: var(--sp-10); width: 100%; padding: var(--sp-12); border-radius: var(--r-rich-card); background: var(--c-field); text-align: left; }
  .newbig:active { background: var(--c-pressed); }
  .chev { color: var(--c-text-2); --icon-size: var(--sp-16); display: inline-flex; flex: none; }
  .make { display: flex; flex-direction: column; }
  .mk { display: flex; align-items: center; gap: var(--sp-12); padding: var(--sp-16); border-radius: var(--r-rich-card); background: var(--c-field); }
  .row2 { display: flex; gap: var(--sp-8); }
  .row2 .btn { flex: 1; }
  .free { display: flex; align-items: center; gap: var(--sp-6); }
  .in { flex: 1; min-width: 0; height: var(--sp-40); padding: 0 var(--sp-12); border: 0; border-radius: var(--r-pill); background: var(--c-field); color: var(--c-text); font: inherit; font-size: var(--fs-btn); outline: none; }
  .in::placeholder { color: var(--c-text-2); }
  .send { width: var(--hit); height: var(--hit); flex: none; display: inline-flex; align-items: center; justify-content: center; color: var(--c-accent); --icon-size: var(--sp-20); }
  .send:disabled { color: var(--c-text-3); }
  .use { width: 100%; }
  .link { align-self: center; min-height: var(--hit); color: var(--c-link); font-size: var(--fs-meta); line-height: var(--lh-meta); font-weight: var(--fw-semibold); }
  @keyframes glimmer { from { opacity: 0.15; } to { opacity: 0.5; } }
</style>
