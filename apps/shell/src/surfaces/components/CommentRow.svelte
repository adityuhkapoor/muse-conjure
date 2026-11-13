<script lang="ts">
  import Avatar from "../../components/Avatar.svelte";
  import Icon from "../../components/Icon.svelte";
  import { compact } from "../../lib/format";
  import { comments, commenter, pieces, type Row } from "../comments-live.svelte";
  import CommentRow from "./CommentRow.svelte";
  import { openProfile } from "../profile-data"; // profile

  /**
   * One comment, Facebook's way: avatar, a grey bubble with the bold name and the text, "2h · Like ·
   * Reply" under it, a small reaction pill on the bubble's lower right, and replies one level in
   * under "View 3 replies".
   */
  type Props = { row: Row; reply?: boolean; onreply: (row: Row) => void };
  let { row, reply = false, onreply }: Props = $props();

  const by = $derived(commenter(row.by));
  const open = $derived(!!comments.expanded[row.id]);
  const n = $derived(row.replies.length);
  const profile = (id: string) => { comments.close(); openProfile(id); }; // profile: the sheet goes away first
</script>

<li class="c" class:reply data-comment={row.id} data-pending={row.pending || undefined}>
  <button class="pav" aria-label={`${by?.name ?? row.by}'s profile`} onclick={() => profile(row.by)}><Avatar person={by} size={reply ? "var(--sp-24)" : "var(--sp-32)"} /></button><!-- profile -->
  <div class="main">
    <div class="bubble" class:hasrx={row.likes > 0}>
      <p class="nm"><button class="pn" onclick={() => profile(row.by)}>{by?.name ?? row.by}</button></p><!-- profile -->
      <p class="tx">{#each (row.typed ? [{ text: row.text }] : pieces(row.text)) as p}{#if "tag" in p}<span class="tag">{p.tag}</span>{:else}{p.text}{/if}{/each}</p>
      {#if row.likes > 0}
        <span class="pill" data-comment-likes={row.likes} aria-label={`${row.likes} reactions`}>
          <span class="faces" aria-hidden="true">{#each row.faces as f (f)}<span class="face"><Icon name={f === "love" ? "reaction_love" : "reaction_like"} /></span>{/each}</span>
          <span class="rn">{compact(row.likes)}</span>
        </span>
      {/if}
    </div>
    <p class="meta">
      <span class="when">{row.ago}</span>
      <span class="dot" aria-hidden="true">·</span>
      <button class="act" class:on={row.liked} aria-pressed={row.liked} onclick={() => comments.like(row.id)}>Like</button>
      <span class="dot" aria-hidden="true">·</span>
      <button class="act" onclick={() => onreply(row)}>Reply</button>
    </p>
    {#if n && !reply}
      {#if open}
        <ul class="replies" aria-label={`Replies to ${by?.first ?? "comment"}`}>
          {#each row.replies as r (r.id)}<CommentRow row={r} reply {onreply} />{/each}
        </ul>
      {:else}
        <button class="view" onclick={() => comments.toggleReplies(row.id)} data-view-replies><Icon name="back" /><span>View {n === 1 ? "1 reply" : `${n} replies`}</span></button>
      {/if}
    {/if}
  </div>
</li>

<style>
  .c { display: flex; align-items: flex-start; gap: var(--sp-8); padding: var(--sp-4) 0; }
  .main { flex: 1; min-width: 0; }
  .bubble { position: relative; display: inline-block; max-width: 100%; padding: var(--sp-8) var(--sp-12); border-radius: var(--r-bubble); background: var(--c-field); vertical-align: top; }
  .bubble.hasrx { margin-bottom: var(--sp-12); }
  .nm { font-size: var(--fs-meta); line-height: var(--lh-meta); font-weight: var(--fw-semibold); color: var(--c-text); }
  .pav { position: relative; display: inline-flex; flex: none; border-radius: var(--r-round); } /* profile */
  .pav::after { content: ""; position: absolute; inset: calc(var(--sp-6) * -1) 0; } /* a 36 px tall hit area without a bigger avatar */
  .pn { display: inline-block; font: inherit; color: inherit; text-align: left; position: relative; z-index: 1; padding-block: var(--sp-10); margin-block: calc(var(--sp-10) * -1); } /* profile */
  .tx { font-size: var(--fs-fb-body); line-height: var(--lh-fb-body); color: var(--c-text); overflow-wrap: anywhere; white-space: pre-line; }
  .tag { font-weight: var(--fw-semibold); color: var(--c-link); }
  .pill { position: absolute; right: calc(var(--sp-8) * -1); bottom: calc(var(--sp-14) * -1); display: inline-flex; align-items: center; gap: var(--sp-4); height: var(--sp-20); padding: 0 var(--sp-6) 0 var(--sp-2); border-radius: var(--r-pill); background: var(--c-bg); box-shadow: 0 0 0 var(--sp-2) var(--c-bg), 0 1px var(--sp-2) var(--c-hairline); color: var(--c-text-2); font-size: var(--fs-fb-meta); line-height: var(--lh-fb-meta); }
  .faces { display: inline-flex; }
  .face { display: inline-flex; width: var(--sp-16); height: var(--sp-16); --icon-size: var(--sp-16); }
  .face + .face { margin-left: calc(var(--sp-4) * -1); }
  .meta { display: flex; align-items: center; gap: var(--sp-4); padding: var(--sp-2) var(--sp-12) 0; font-size: var(--fs-fb-meta); line-height: var(--lh-fb-meta); color: var(--c-text-2); }
  .when { white-space: nowrap; }
  .act { font: inherit; font-weight: var(--fw-semibold); color: var(--c-text-2); padding: var(--sp-4) var(--sp-2); }
  .act.on { color: var(--c-btn-soft-text); }
  .act:active { text-decoration: underline; }
  .view { display: inline-flex; align-items: center; gap: var(--sp-6); margin-top: var(--sp-4); padding: var(--sp-4) var(--sp-12); font-size: var(--fs-fb-meta); line-height: var(--lh-fb-meta); font-weight: var(--fw-semibold); color: var(--c-text-2); --icon-size: var(--sp-16); }
  .view :global(.icon) { transform: scaleX(-1) rotate(-90deg); }
  .replies { margin-top: var(--sp-4); }
  .reply .bubble { padding: var(--sp-6) var(--sp-12); }
</style>
