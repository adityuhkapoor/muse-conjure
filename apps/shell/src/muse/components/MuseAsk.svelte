<script lang="ts">
  import Icon from "../../components/Icon.svelte";
  import type { AskResult } from "../catalyst.svelte";

  /**
   * Catalyst 1, you ask: a field on the page, in the page's own control style (a grey pill like
   * Facebook's composer and search). Enter or the arrow sends; the page's context goes with it.
   * `tone="media"`: on a story or reel, over dark media. When `onask` answers with a promise (the
   * reader reading the page), a quiet line says so; when nothing fits, it offers to make
   * something new.
   */
  type Props = { placeholder: string; onask: (text: string) => unknown; tone?: "page" | "media"; label?: string };
  let { placeholder, onask, tone = "page", label = placeholder }: Props = $props();
  let text = $state("");
  let status = $state<{ t: "reading" } | { t: "none"; build: () => void } | null>(null);
  let n = 0;

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    text = "";
    const mine = ++n;
    // After the key that sent it, so a sheet that opens does not take the same Enter.
    requestAnimationFrame(() => {
      const r = onask(t);
      if (!(r instanceof Promise)) return;
      status = { t: "reading" };
      (r as Promise<AskResult>).then(
        (a) => {
          if (mine !== n) return;
          status = a?.none && a.build ? { t: "none", build: a.build } : null;
        },
        () => mine === n && (status = null),
      );
    });
  }

  function build() {
    if (status?.t !== "none") return;
    const b = status.build;
    status = null;
    b();
  }
</script>

<div class="wrap" class:media={tone === "media"} data-muse-ask-wrap>
  <form class="ask" onsubmit={submit} data-muse-ask>
    <input type="text" enterkeyhint="send" autocomplete="off" {placeholder} aria-label={label} bind:value={text} />
    {#if text.trim()}<button class="go" type="submit" aria-label="Ask Muse"><Icon name="send" /></button>{/if}
  </form>
  {#if status?.t === "reading"}
    <p class="st" role="status" data-muse-ask-status="reading">Muse is reading this page</p>
  {:else if status?.t === "none"}
    <p class="st" role="status" data-muse-ask-status="none">
      <span>Nothing ready-made fits this.</span>
      <button class="btn new" type="button" onclick={build} data-muse-make-new>Make something new</button>
    </p>
  {/if}
</div>

<style>
  .wrap { display: flex; flex-direction: column; gap: var(--sp-6); }
  .ask {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    min-height: var(--sp-40);
    padding: 0 var(--sp-4) 0 var(--sp-12);
    border-radius: var(--r-pill);
    background: var(--c-field);
  }
  .ask:focus-within { box-shadow: 0 0 0 1px var(--c-accent-icon); }
  input {
    flex: 1;
    min-width: 0;
    height: var(--sp-40);
    border: 0;
    background: none;
    outline: none;
    font-size: var(--fs-fb-body);
    line-height: var(--lh-fb-body);
    color: var(--c-text);
  }
  input::placeholder { color: var(--c-text-2); opacity: 1; }
  .go { width: var(--sp-36); height: var(--sp-36); border-radius: var(--r-round); display: inline-flex; align-items: center; justify-content: center; color: var(--c-accent-icon); --icon-size: var(--sp-20); flex: none; position: relative; }
  .go::after { content: ""; position: absolute; inset: calc(var(--sp-4) * -1); }
  .st { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-8); padding: 0 var(--sp-12); font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  .new { min-height: var(--sp-36); }
  .media .ask { background: var(--c-media-chip); box-shadow: inset 0 0 0 1px var(--c-on-media-2); }
  .media input, .media input::placeholder { color: var(--c-on-media); }
  .media .go, .media .st { color: var(--c-on-media); }
</style>
