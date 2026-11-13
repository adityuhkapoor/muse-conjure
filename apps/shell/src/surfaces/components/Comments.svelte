<script lang="ts">
  import { tick } from "svelte";
  import Avatar from "../../components/Avatar.svelte";
  import Icon from "../../components/Icon.svelte";
  import { compact } from "../../lib/format";
  import { store } from "../../store";
  import { comments, commenter, COUNTER_FROM, MAX_COMMENT, MAX_LINES, PAGE, type Row, type Target } from "../comments-live.svelte";
  import CommentRow from "./CommentRow.svelte";

  /**
   * A post's comments, Facebook's way. On the phone this fills the bottom sheet (reaction summary on
   * top, the thread scrolling, the composer pinned under it). On desktop (`inline`) it is the thread
   * under the post with the composer below it, so the post and its tool stay above.
   */
  type Props = { target: Target; inline?: boolean };
  let { target, inline = false }: Props = $props();

  const rows = $derived(comments.thread(target.id));
  const total = $derived(comments.count(target.id));
  let shown = $state(PAGE);
  const visible = $derived(rows.slice(0, shown));
  const loaded = $derived(visible.reduce((n, r) => n + 1 + r.replies.length, 0));
  let text = $state("");
  let replyTo = $state<Row | null>(null);
  let list: HTMLElement | undefined = $state();
  let field: HTMLTextAreaElement | undefined = $state();
  let problem = $state("");

  const replyName = $derived(replyTo ? (commenter(replyTo.by)?.first ?? "") : "");

  function grow() {
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 120)}px`;
  }
  function key(e: KeyboardEvent) {
    if (e.key !== "Enter" || e.isComposing) return;
    if (e.shiftKey) {
      if (text.split("\n").length >= MAX_LINES) e.preventDefault();
      return;
    }
    e.preventDefault();
    (e.currentTarget as HTMLElement).closest("form")?.requestSubmit();
  }

  function reply(r: Row) {
    replyTo = r;
    field?.focus();
  }

  async function submit(e: Event) {
    e.preventDefault();
    if (!text.trim()) return;
    const id = comments.add(target.id, text, replyTo?.id);
    if (!id) {
      problem = "Couldn't post that comment. Your text is still here";
      return;
    }
    problem = "";
    text = "";
    replyTo = null;
    if (field) field.style.height = "";
    shown = Math.max(shown, rows.length + 1); // the new comment is the last one: show it
    await tick();
    list?.querySelector(`[data-comment="${id}"]`)?.scrollIntoView({ block: "nearest" });
  }
</script>

<section class="cm" class:inline data-comments={target.id} aria-label="Comments">
  {#if !inline}
    <header class="top">
      <span class="faces" aria-hidden="true"><span class="rx"><Icon name="reaction_like" /></span><span class="rx"><Icon name="reaction_love" /></span></span>
      <span class="n" data-summary-likes={target.likes}>{compact(target.likes)}</span>
      <span class="all">{total === 1 ? "1 comment" : `${compact(total)} comments`}</span>
    </header>
  {/if}

  <div class="list" bind:this={list}>
    {#if rows.length}
      <ul class="thread" aria-label="Comments">
        {#each visible as r (r.id)}<CommentRow row={r} onreply={reply} />{/each}
      </ul>
      {#if shown < rows.length}
        <p class="more">
          <button class="mv" onclick={() => (shown += PAGE)} data-view-more>View more comments</button>
          <span class="of">{loaded} of {compact(total)}</span>
        </p>
      {/if}
    {:else}
      <p class="none">No comments yet. Be the first</p>
    {/if}
  </div>

  <form class="composer" onsubmit={submit}>
    {#if replyTo}
      <p class="replying" data-replying>Replying to <strong>{replyName}</strong><button type="button" class="x" aria-label="Cancel reply" onclick={() => (replyTo = null)}><Icon name="close" /></button></p>
    {/if}
    <div class="line">
      <Avatar person={store.me} size="var(--sp-32)" />
      <textarea bind:this={field} bind:value={text} class="in" rows="1" maxlength={MAX_COMMENT} placeholder="Write a comment…" aria-label="Write a comment" autocomplete="off" enterkeyhint="send" oninput={() => { problem = ""; grow(); }} onkeydown={key}></textarea>
      <button class="send" type="submit" aria-label="Send comment" disabled={!text.trim()}><Icon name="send" /></button>
    </div>
    {#if problem}<p class="problem" role="alert" data-comment-error>{problem}</p>
    {:else if text.length >= COUNTER_FROM}<p class="count" data-comment-count>{text.length} of {MAX_COMMENT}</p>{/if}
  </form>
</section>

<style>
  .cm { display: flex; flex-direction: column; min-height: 0; flex: 1; color: var(--c-text); }
  .top { flex: none; display: flex; align-items: center; gap: var(--sp-6); padding: var(--sp-4) var(--sp-16) var(--sp-12); border-bottom: 1px solid var(--c-hairline); touch-action: none; }
  .faces { display: inline-flex; }
  .rx { display: inline-flex; width: var(--sp-20); height: var(--sp-20); border-radius: var(--r-round); box-shadow: 0 0 0 var(--sp-2) var(--c-bg); background: var(--c-bg); --icon-size: var(--sp-20); }
  .rx + .rx { margin-left: calc(var(--sp-4) * -1); }
  .n { font-size: var(--fs-fb-meta); line-height: var(--lh-fb-meta); color: var(--c-text-2); }
  .all { margin-left: auto; font-size: var(--fs-fb-meta); line-height: var(--lh-fb-meta); color: var(--c-text-2); }
  .list { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: var(--sp-12) var(--sp-12) var(--sp-8); scrollbar-width: none; }
  .list::-webkit-scrollbar { display: none; }
  .more { display: flex; align-items: center; justify-content: space-between; padding: var(--sp-8) var(--sp-4) var(--sp-4); }
  .mv { font-size: var(--fs-fb-meta); line-height: var(--lh-fb-meta); font-weight: var(--fw-semibold); color: var(--c-text-2); padding: var(--sp-4) 0; }
  .of { font-size: var(--fs-fb-meta); line-height: var(--lh-fb-meta); color: var(--c-text-2); }
  .none { padding: var(--sp-24) var(--sp-16); text-align: center; font-size: var(--fs-fb-body); line-height: var(--lh-fb-body); color: var(--c-text-2); }
  .composer { flex: none; padding: var(--sp-8) var(--sp-12) calc(var(--sp-8) + var(--safe-bottom)); border-top: 1px solid var(--c-hairline); background: var(--c-bg); }
  .line { display: flex; align-items: center; gap: var(--sp-8); }
  .in { flex: 1; min-width: 0; height: var(--sp-36); max-height: calc(var(--sp-36) * 3); resize: none; font-family: inherit; padding: var(--sp-8) var(--sp-12); border-radius: var(--r-input); background: var(--c-field); color: var(--c-text); font-size: var(--fs-fb-composer); line-height: var(--lh-fb-composer); outline: none; border: 0; }
  .in::placeholder { color: var(--c-text-2); }
  .in:focus-visible { box-shadow: 0 0 0 var(--sp-2) var(--c-accent); }
  .send { display: inline-flex; align-items: center; justify-content: center; width: var(--sp-36); height: var(--sp-36); border-radius: var(--r-round); color: var(--c-accent-icon); --icon-size: var(--sp-24); flex: none; }
  .send:disabled { color: var(--c-text-3); }
  .send:not(:disabled):active { background: var(--c-hover); }
  .count, .problem { padding: var(--sp-4) var(--sp-4) 0; font-size: var(--fs-fb-meta); line-height: var(--lh-fb-meta); color: var(--c-text-2); text-align: right; }
  .problem { text-align: left; color: var(--c-text); }
  .replying { display: flex; align-items: center; gap: var(--sp-4); padding: 0 var(--sp-4) var(--sp-6); font-size: var(--fs-fb-meta); line-height: var(--lh-fb-meta); color: var(--c-text-2); }
  .replying strong { font-weight: var(--fw-semibold); color: var(--c-text); }
  .x { display: inline-flex; width: var(--sp-20); height: var(--sp-20); margin-left: auto; color: var(--c-text-2); --icon-size: var(--sp-16); align-items: center; justify-content: center; }

  /* desktop: under the post, the page scrolls (not the list); the composer is the last line */
  .inline { flex: none; border-top: 1px solid var(--c-hairline); }
  .inline .list { overflow: visible; padding: var(--sp-8) var(--sp-16) var(--sp-4); }
  .inline .composer { border-top: 0; padding: var(--sp-4) var(--sp-16) var(--sp-12); }
</style>
