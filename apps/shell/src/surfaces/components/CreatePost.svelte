<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import Avatar from "../../components/Avatar.svelte";
  import Icon from "../../components/Icon.svelte";
  import MuseMark from "../../components/MuseMark.svelte";
  import Sheet from "../../components/Sheet.svelte";
  import { store } from "../../store";
  import { fb } from "../fbnav.svelte";
  import { EXAMPLES, MIN_WORDS, STRONG, wordCount, type DraftRead, type Offer } from "../../muse/compose";
  import { compose } from "../../muse/compose-live.svelte";
  import ComposeCatalyst from "../../muse/components/ComposeCatalyst.svelte";
  import ToolPreview from "../../muse/components/ToolPreview.svelte";
  import AskMuseSheet from "../../muse/components/AskMuseSheet.svelte";

  /**
   * Facebook's "Create post". Phone: a pushed page (back, "Create post", Post top right; you, the
   * audience, the text, the attachment row at the bottom). Desktop: the centred dialog.
   * Muse reads the draft after a 500 ms pause and may offer one tool under the text (src/muse).
   */
  type Props = { mode: "page" | "dialog"; onclose: () => void };
  let { mode, onclose }: Props = $props();

  let box: HTMLTextAreaElement | undefined = $state();
  let read = $state<DraftRead | null>(null);
  let asking = $state<Offer | null>(null);
  /** the Ask Muse sheet, with a tool to start on */
  let muse = $state<{ prefer?: string } | null>(null);
  /** scenarios already asked about at Post, for this draft */
  let asked: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let modelTimer: ReturnType<typeof setTimeout> | undefined;
  let modelCtl: AbortController | null = null;
  const PAUSE_MS = 500;
  /** the model's hint waits for a longer pause */
  const MODEL_PAUSE_MS = 1500;

  const empty = $derived(!compose.text.trim());
  const big = $derived(compose.text.length < 86 && !compose.attached && !read);

  onMount(() => {
    const opener = document.activeElement;
    compose.opened();
    tick().then(() => {
      grow();
      box?.focus({ preventScroll: true });
      settle();
    });
    // desktop dialog: Escape closes it (unless a sheet over it takes the key), and focus goes back to what opened it
    const esc = (e: KeyboardEvent) => {
      if (mode !== "dialog" || e.key !== "Escape" || e.defaultPrevented || document.querySelector("[data-sheet]")) return;
      e.preventDefault();
      onclose();
    };
    addEventListener("keydown", esc);
    return () => {
      removeEventListener("keydown", esc);
      if (mode === "dialog" && opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  });
  onDestroy(() => {
    clearTimeout(timer);
    clearTimeout(modelTimer);
    modelCtl?.abort();
  });

  function grow() {
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
  }

  /**
   * After a short pause the patterns answer at once; after a longer one the model reads the post
   * and its first tool, filled for this post, replaces the hint (on any post, not only a match).
   */
  function settle() {
    clearTimeout(timer);
    clearTimeout(modelTimer);
    modelCtl?.abort();
    const text = compose.text;
    if (wordCount(text) < MIN_WORDS) {
      read = null;
      return;
    }
    timer = setTimeout(async () => {
      if (!compose.ready) await compose.refreshTools();
      if (compose.text === text) read = compose.read(text);
    }, PAUSE_MS);
    modelTimer = setTimeout(async () => {
      if (compose.text !== text || compose.dismissed.includes("compose-model")) return;
      const c = new AbortController();
      modelCtl = c;
      const t = setTimeout(() => c.abort(), 30_000);
      await compose.route(text, {
        fill: 1,
        signal: c.signal,
        onfilled: (o) => {
          if (compose.text !== text || compose.dismissed.includes("compose-model")) return;
          const rest = (read?.offers ?? []).filter((x) => x.tool !== o.tool);
          read = { scenario: "compose-model", strength: Math.max(read?.strength ?? 0, 0.8), offers: [o, ...rest].slice(0, 3) };
        },
      });
      clearTimeout(t);
    }, MODEL_PAUSE_MS);
  }

  function input() {
    grow();
    settle();
  }

  function example(text: string) {
    compose.text = text;
    asked = [];
    tick().then(() => {
      grow();
      settle();
    });
  }

  function attach(o: Offer) {
    muse = null;
    compose.attached = o;
  }

  function post(offer: Offer | null = compose.attached) {
    const id = compose.post(offer);
    asking = null;
    read = null;
    if (id) fb.focusPost = id;
    onclose();
  }

  /** Post: with nothing attached and a strong read, ask once for this draft. */
  function tapPost() {
    if (empty) return;
    if (compose.attached || compose.making) return post();
    const r = compose.read(compose.text);
    const o = r && r.strength >= STRONG && !asked.includes(r.scenario) ? (read?.scenario === r.scenario ? (read.offers[0] ?? r.offers[0]) : r.offers[0]) : null;
    if (r && o) {
      asked = [...asked, r.scenario];
      asking = o;
      return;
    }
    post(null);
  }

  const what = (o: Offer) => o.label.replace(/^Add /, "");
</script>

{#snippet body()}
  <div class="author">
    <Avatar person={store.me} size="var(--fb-post-avatar)" />
    <div class="aw">
      <p class="fb-name">{store.me.name}</p>
      <button class="aud" aria-disabled="true" title="Not in this prototype"><span class="ai"><Icon name="people" /></span>Friends<span class="ac"><Icon name="chevron_down_small" /></span></button>
    </div>
  </div>
  <textarea
    bind:this={box}
    bind:value={compose.text}
    class="text"
    class:big
    rows={mode === "page" ? 4 : 3}
    placeholder={mode === "dialog" ? `What's on your mind, ${store.me.first}?` : "What's on your mind?"}
    aria-label="What's on your mind?"
    oninput={input}
    data-compose-text
  ></textarea>
  {#if empty}
    <div class="tries" aria-label="Try a post">
      {#each EXAMPLES as e (e.label)}
        <button class="try" onclick={() => example(e.text)} data-compose-example={e.label}><MuseMark size="var(--sp-16)" />{e.label}</button>
      {/each}
    </div>
  {/if}
  <div class="cat">
    <ComposeCatalyst {read} attached={compose.attached} onopen={(o) => (muse = { prefer: o.tool })} onremove={() => (compose.attached = null)} making={compose.making} ondismiss={(s) => { compose.dismiss(s); compose.dismiss("compose-model"); read = null; }} />
  </div>
{/snippet}

{#snippet choices()}
  {#if !empty}
    <div class="choices" class:boxed={mode === "dialog"} data-compose-choices>
      <button class="btn" onclick={() => post()} data-compose-plain>Post</button>
      <button class="btn primary askm" onclick={() => (muse = {})} data-compose-ask-muse><MuseMark size="var(--sp-20)" />Ask Muse</button>
    </div>
  {/if}
{/snippet}

{#snippet attachRow()}
  <div class="adds" class:boxed={mode === "dialog"}>
    <span class="addl">Add to your post</span>
    <span class="addi">
      <button class="ib photo" aria-disabled="true" title="Not in this prototype" aria-label="Photo or video"><Icon name="fbs_photo" /></button>
      <button class="ib tag" aria-disabled="true" title="Not in this prototype" aria-label="Tag people"><Icon name="people" /></button>
      <button class="ib feeling" aria-disabled="true" title="Not in this prototype" aria-label="Feeling or activity"><Icon name="fbs_feeling" /></button>
      <button class="ib place" aria-disabled="true" title="Not in this prototype" aria-label="Check in"><Icon name="location_pin" /></button>
      <button class="ib live" aria-disabled="true" title="Not in this prototype" aria-label="Live video"><Icon name="fbs_live" /></button>
    </span>
  </div>
{/snippet}

{#snippet ask()}
  {#if asking}
    {@const o = asking}
    <Sheet label={`Post with ${what(o)}?`} onclose={() => (asking = null)}>
      <div class="askp" data-compose-ask={o.tool}>
        <h2 class="fb-section">Post with {what(o)}?</h2>
        <p class="fb-meta">{o.read}. Friends can use it right on your post.</p>
        <ToolPreview offer={o} compact />
        <div class="askb">
          <button class="btn primary" onclick={() => post(o)}>Add it</button>
          <button class="btn" onclick={() => { compose.dismiss(o.scenario); post(null); }}>Post without</button>
        </div>
      </div>
    </Sheet>
  {/if}
{/snippet}

{#snippet museSheet()}
  {#if muse}
    <AskMuseSheet text={compose.text} prefer={muse.prefer} onuse={attach} onpost={() => post()} onclose={() => (muse = null)} />
  {/if}
{/snippet}

{#if mode === "page"}
  <div class="fb-page cp" data-create-post="page">
    <header class="bar">
      <button class="back" aria-label="Back" onclick={onclose}><Icon name="back" /></button>
      <h1 class="t">Create post</h1>
      <button class="postb" disabled={empty} onclick={tapPost} data-compose-post>Post</button>
    </header>
    <div class="fb-scroll scroll">{@render body()}</div>
    {@render choices()}
    {@render attachRow()}
    {@render ask()}
    {@render museSheet()}
  </div>
{:else}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={onclose} data-create-post="dialog">
    <div class="dlg" role="dialog" aria-modal="true" aria-label="Create post" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <header class="dh">
        <h1 class="fb-h2">Create post</h1>
        <button class="fb-round x" aria-label="Close" onclick={onclose}><Icon name="close" /></button>
      </header>
      <div class="db">
        {@render body()}
        {@render attachRow()}
        {#if empty}<button class="btn primary wide" disabled data-compose-post>Post</button>{:else}{@render choices()}{/if}
      </div>
      {@render ask()}
    </div>
    <!-- outside the dialog (it clips and animates), so the roomier Ask Muse dialog is centred in the window -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div style="display: contents" onclick={(e) => e.stopPropagation()}>{@render museSheet()}</div>
  </div>
{/if}

<style>
  .cp { background: var(--c-bg); }
  .bar { flex: none; display: flex; align-items: center; gap: var(--sp-4); height: calc(var(--fb-header-h) + var(--safe-top)); padding: var(--safe-top) var(--sp-12) 0 var(--sp-4); border-bottom: 1px solid var(--c-divider); background: var(--c-bg); }
  .back { width: var(--hit); height: var(--hit); display: inline-flex; align-items: center; justify-content: center; color: var(--c-text); --icon-size: var(--sp-28); flex: none; }
  .t { flex: 1; min-width: 0; font-size: var(--fs-title); line-height: var(--lh-title); font-weight: var(--fw-semibold); }
  .postb { flex: none; height: var(--sp-32); padding: 0 var(--sp-14); border-radius: var(--r-button); background: var(--c-primary); color: var(--c-white); font-size: var(--fs-btn); line-height: var(--lh-btn); font-weight: var(--fw-semibold); }
  .postb:disabled { background: var(--c-btn-secondary); color: var(--c-text-3); }
  .scroll { padding: var(--sp-12) var(--sp-12) var(--sp-16); display: flex; flex-direction: column; }

  .author { display: flex; align-items: center; gap: var(--sp-8); }
  .aw { display: flex; flex-direction: column; align-items: flex-start; gap: var(--sp-2); min-width: 0; }
  .aud { display: inline-flex; align-items: center; gap: var(--sp-4); height: var(--sp-24); padding: 0 var(--sp-8); border-radius: var(--r-button); background: var(--c-btn-soft); color: var(--c-btn-soft-text); font-size: var(--fs-meta); line-height: var(--lh-meta); font-weight: var(--fw-semibold); }
  .ai { display: inline-flex; --icon-size: var(--sp-12); }
  .ac { display: inline-flex; --icon-size: var(--sp-12); }

  .text { display: block; width: 100%; margin-top: var(--sp-12); padding: 0; border: 0; outline: none; resize: none; background: transparent; color: var(--c-text); font: inherit; font-size: var(--fs-fb-body); line-height: var(--lh-fb-body); overflow: hidden; }
  .text.big { font-size: var(--fs-fb-h2); line-height: var(--lh-fb-h2); }
  .text::placeholder { color: var(--c-text-2); }
  .cp .text { min-height: calc(var(--sp-80) * 1.5); }

  .tries { display: flex; flex-wrap: wrap; gap: var(--sp-6); margin-top: var(--sp-12); }
  .try { display: inline-flex; align-items: center; gap: var(--sp-6); height: var(--chip-h); padding: 0 var(--sp-12) 0 var(--sp-8); border-radius: var(--r-pill); background: var(--c-field); color: var(--c-text-2); font-size: var(--fs-meta); line-height: var(--lh-meta); max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .try:active { background: var(--c-pressed); }
  :global(:root[data-layout="desktop"]) .try:hover { background: var(--c-hover); color: var(--c-text); }
  .cat { margin-top: var(--sp-16); }
  .cat:not(:has(:global(*))) { display: none; }

  .adds { flex: none; display: flex; align-items: center; justify-content: space-between; gap: var(--sp-8); padding: var(--sp-8) var(--sp-12) calc(var(--sp-8) + var(--safe-bottom)); border-top: 1px solid var(--c-divider); background: var(--c-bg); }
  .adds.boxed { margin-top: var(--sp-16); padding: var(--sp-8) var(--sp-8) var(--sp-8) var(--sp-16); border: 1px solid var(--c-divider); border-radius: var(--r-card); }
  .addl { font-size: var(--fs-btn); line-height: var(--lh-btn); font-weight: var(--fw-semibold); color: var(--c-text); white-space: nowrap; }
  .addi { display: inline-flex; }
  .ib { width: var(--sp-36); height: var(--sp-36); border-radius: var(--r-round); display: inline-flex; align-items: center; justify-content: center; --icon-size: var(--sp-24); flex: none; }
  .photo { color: var(--c-fb-photo); }
  .tag { color: var(--c-accent); }
  .feeling { color: var(--c-fb-feeling); }
  .place { color: var(--c-negative); }
  .live { color: var(--c-fb-live); }

  .choices { flex: none; display: flex; gap: var(--sp-8); padding: var(--sp-8) var(--sp-12); background: var(--c-bg); border-top: 1px solid var(--c-divider); }
  .choices .btn { flex: 1; height: var(--sp-40); }
  .choices.boxed { margin-top: var(--sp-16); padding: 0; border: 0; }
  .askm :global(.mark circle) { stroke: var(--c-white); }
  .askp { display: flex; flex-direction: column; gap: var(--sp-8); }
  .askp .fb-meta { margin-bottom: var(--sp-4); }
  .askb { display: flex; flex-direction: column; gap: var(--sp-8); margin-top: var(--sp-8); }
  .askb .btn { width: 100%; }

  .scrim { position: fixed; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center; padding: var(--sp-16); background: var(--c-scrim); }
  .dlg { position: relative; width: min(100%, calc(var(--sp-80) * 6.25)); max-height: calc(100% - var(--sp-32)); display: flex; flex-direction: column; background: var(--c-bg); color: var(--c-text); border-radius: var(--r-card); box-shadow: var(--sh-sheet); outline: none; overflow: hidden; animation: pop var(--dur-short-in) var(--ease-enter) both; }
  .dh { position: relative; flex: none; display: flex; align-items: center; justify-content: center; height: var(--sp-60); border-bottom: 1px solid var(--c-divider); }
  .dh .x { position: absolute; right: var(--sp-16); top: 50%; transform: translateY(-50%); }
  .db { padding: var(--sp-16); overflow-y: auto; }
  .dlg .text { min-height: calc(var(--sp-80) * 1.25); }
  .wide { width: 100%; margin-top: var(--sp-16); }
  @keyframes pop { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: none; } }
</style>
