<script lang="ts">
  import Avatar from "../../components/Avatar.svelte";
  import Icon from "../../components/Icon.svelte";
  import { viewerId } from "../../lib/media";
  import { nav } from "../../lib/nav.svelte";
  import { ui } from "../../lib/ui.svelte";
  import { catalyst } from "../../muse/catalyst.svelte";
  import MuseSuggest from "../../muse/components/MuseSuggest.svelte";
  import { postContext } from "../../muse/context";
  import { nameOf } from "../../muse/page";
  import { FEED_POSTS } from "../../muse/seed";
  import type { Situation } from "../../muse/types";
  import { BIRTHDAYS, compId, friendsOf, friendsText, mayKnowFor, mutual, mutualText, personOf, requestsFor } from "../profile-data";

  /**
   * Friends (Facebook iOS Friends tab; desktop Friends home): friend requests with Confirm and
   * Delete, birthdays, people you may know with Add friend, and your friends with a search field.
   * Everything changes here only. The Muse touch: under an upcoming birthday, "Plan something for
   * Will", the feed's birthday scenario (lab bday-pool, else gift-pool) in a new group chat without him.
   */
  const me = $derived(viewerId());
  const requests = $derived(requestsFor(me));
  const mayKnow = $derived(mayKnowFor(me));
  let answered = $state<Record<string, "confirmed" | "deleted">>({});
  let sent = $state<string[]>([]);
  let removed = $state<string[]>([]);
  let q = $state("");
  const mine = $derived([...friendsOf(me), ...requests.filter((r) => answered[r] === "confirmed")]);
  const shown = $derived(mine.filter((f) => (personOf(f)?.name ?? "").toLowerCase().includes(q.trim().toLowerCase())));
  const pending = $derived(requests.filter((r) => !answered[r]).length);
  const birthdays = $derived(BIRTHDAYS.filter((b) => b.key !== me));
  const open = (k: string) => nav.go({ kind: "fb", page: { name: "profile", id: k } });

  // the birthday offer rides on the feed's birthday post (muse/seed.ts p-bday) and its scenario
  const bdayPost = FEED_POSTS.find((p) => p.kind === "birthday");
  const bdayCtx = $derived(bdayPost ? postContext(bdayPost, { liked: false, nameOf }) : null);
  function planFor(key: string): Situation[] {
    const p = personOf(key);
    if (!bdayPost || !p || bdayPost.subject !== compId(key)) return [];
    const id = `friends:bday:${key}`;
    if (catalyst.dismissed.includes(id)) return [];
    return [{ id, scenario: "feed-birthday", label: `Plan something for ${p.first}`, detail: `A card and a pot for ${p.first}'s 21st, with friends`, faces: ["jonah", "maya", "theo"].filter((x) => compId(x) !== "me"), score: 1, why: "a friend's birthday this week" }];
  }
  const mutualLine = (k: string) => mutualText(me, k);
</script>

{#snippet face(k: string)}
  <span class="mpile" aria-hidden="true">{#each mutual(me, k).slice(0, 2) as m (m)}<Avatar person={personOf(m)} size="var(--avatar-facepile-sm)" ring />{/each}</span>
{/snippet}

<section class="friends" class:desk={ui.desktop} class:top-pad={!ui.desktop} aria-label="Friends" data-friends>
  {#if !ui.desktop}
    <div class="chips">
      <a class="chip" href="#suggestions">Suggestions</a>
      <a class="chip" href="#your-friends">Your friends</a>
    </div>
  {/if}

  <section class="sec" aria-labelledby="req-h">
    <div class="sh">
      <h2 class="fb-h2" id="req-h">Friend requests {#if pending}<span class="count">{pending}</span>{/if}</h2>
    </div>
    <ul class="list" class:cards={ui.desktop}>
      {#each requests as r (r)}
        {@const p = personOf(r)}
        <li class="req" data-request={r}>
          <button class="av" aria-label={`${p?.name}'s profile`} onclick={() => open(r)}><Avatar person={p} size={ui.desktop ? "100%" : "var(--avatar-info)"} px={ui.desktop ? 220 : 80} /></button>
          <div class="txt">
            <p class="nmrow"><button class="nm" onclick={() => open(r)}>{p?.name}</button>{#if !ui.desktop}<span class="fb-meta when">{r === requests[0] ? "2d" : r === requests[1] ? "4d" : "1w"}</span>{/if}</p>
            {#if mutualLine(r)}<p class="mut">{@render face(r)}<span class="fb-meta">{mutualLine(r)}</span></p>{/if}
            {#if answered[r] === "confirmed"}
              <p class="fb-meta done" role="status">Request accepted</p>
            {:else if answered[r] === "deleted"}
              <p class="fb-meta done" role="status">Request removed</p>
            {:else}
              <div class="btns">
                <button class="btn primary" onclick={() => (answered = { ...answered, [r]: "confirmed" })}>Confirm</button>
                <button class="btn" onclick={() => (answered = { ...answered, [r]: "deleted" })}>Delete</button>
              </div>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  </section>

  {#if birthdays.length}
    <section class="sec" aria-labelledby="bday-h" data-birthdays>
      <h2 class="fb-h2" id="bday-h">Birthdays</h2>
      {#each birthdays as bd (bd.key)}
        {@const p = personOf(bd.key)}
        <div class="bday">
          <span class="cake"><Icon name="pf_cake" /></span>
          <p class="fb-body"><button class="nm inl" onclick={() => open(bd.key)}>{p?.name}</button>'s birthday is {bd.when}. Turning {bd.turning}.</p>
        </div>
        {#if bdayCtx}
          <MuseSuggest items={planFor(bd.key)} ontake={(s) => catalyst.take(bdayCtx, s)} ondismiss={(ids) => catalyst.dismiss(ids)} />
        {/if}
      {/each}
    </section>
  {/if}

  <section class="sec" aria-labelledby="pymk-h" id="suggestions">
    <h2 class="fb-h2" id="pymk-h">People you may know</h2>
    <ul class="list" class:cards={ui.desktop}>
      {#each mayKnow.filter((k) => !removed.includes(k)) as k (k)}
        {@const p = personOf(k)}
        <li class="req" data-may-know={k}>
          <button class="av" aria-label={`${p?.name}'s profile`} onclick={() => open(k)}><Avatar person={p} size={ui.desktop ? "100%" : "var(--avatar-info)"} px={ui.desktop ? 220 : 80} /></button>
          <div class="txt">
            <p class="nmrow"><button class="nm" onclick={() => open(k)}>{p?.name}</button></p>
            {#if mutualLine(k)}<p class="mut">{@render face(k)}<span class="fb-meta">{mutualLine(k)}</span></p>{/if}
            <div class="btns">
              {#if sent.includes(k)}
                <button class="btn soft" onclick={() => (sent = sent.filter((x) => x !== k))}>Cancel</button>
                {#if !ui.desktop}<span class="fb-meta sentl" role="status">Request sent</span>{/if}
              {:else}
                <button class="btn primary" onclick={() => (sent = [...sent, k])}><Icon name="pf_friend_add" />Add friend</button>
                <button class="btn" onclick={() => (removed = [...removed, k])}>Remove</button>
              {/if}
            </div>
          </div>
        </li>
      {/each}
    </ul>
  </section>

  <section class="sec" aria-labelledby="yours-h" id="your-friends">
    <div class="sh">
      <h2 class="fb-h2" id="yours-h">Your friends</h2>
      <span class="fb-meta">{friendsText(mine.length)}</span>
    </div>
    <label class="search">
      <Icon name="search_magnifier" />
      <input type="search" placeholder="Search friends" aria-label="Search friends" bind:value={q} />
    </label>
    <ul class="mine" class:grid={ui.desktop}>
      {#each shown as f (f)}
        {@const p = personOf(f)}
        <li>
          <button class="row" onclick={() => open(f)}>
            <Avatar person={p} size="var(--avatar-row)" />
            <span class="rt">
              <span class="nm">{p?.name}</span>
              {#if mutualLine(f)}<span class="fb-meta">{mutualLine(f)}</span>{/if}
            </span>
          </button>
        </li>
      {:else}
        <li class="fb-meta none">No friends match "{q.trim()}"</li>
      {/each}
    </ul>
  </section>
</section>

<style>
  .friends { display: flex; flex-direction: column; background: var(--c-bg); }
  .friends.top-pad { padding-top: calc(var(--fb-header-h) + var(--safe-top)); }
  .chips { display: flex; gap: var(--sp-8); padding: 0 var(--sp-16) var(--sp-12); }
  .chip { display: inline-flex; align-items: center; height: var(--btn-h); padding: 0 var(--sp-12); border-radius: var(--r-pill); background: var(--c-btn-secondary); color: var(--c-text); font-size: var(--fs-btn); line-height: var(--lh-btn); font-weight: var(--fw-semibold); text-decoration: none; }
  .sec { display: flex; flex-direction: column; gap: var(--sp-12); padding: var(--sp-12) var(--sp-16) var(--sp-16); border-top: 1px solid var(--c-divider); scroll-margin-top: var(--sp-16); }
  .sh { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-8); }
  .count { color: var(--c-badge); }
  .list { display: flex; flex-direction: column; gap: var(--sp-16); }
  .req { display: flex; gap: var(--sp-12); align-items: flex-start; }
  .av { flex: none; border-radius: var(--r-round); display: inline-flex; }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--sp-4); }
  .nmrow { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-8); }
  .nm { font-size: var(--fs-fb-name); line-height: var(--lh-fb-name); font-weight: var(--fw-semibold); color: var(--c-text); text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .nm.inl { display: inline; white-space: normal; font-size: inherit; line-height: inherit; }
  .when { flex: none; }
  .mut { display: flex; align-items: center; gap: var(--sp-6); }
  .mpile { display: inline-flex; }
  .mpile:empty { display: none; }
  .mpile > :global(.avatar + .avatar) { margin-left: calc(var(--sp-4) * -1); }
  .btns { display: flex; align-items: center; gap: var(--sp-8); margin-top: var(--sp-4); }
  .btns .btn { flex: 1; min-width: 0; }
  .btns .btn.soft { flex: none; padding: 0 var(--sp-24); }
  .sentl { flex: 1; }
  .done { margin-top: var(--sp-4); min-height: var(--btn-h); display: flex; align-items: center; }
  .bday { display: flex; align-items: center; gap: var(--sp-12); }
  .cake { flex: none; width: var(--sp-40); height: var(--sp-40); border-radius: var(--r-round); background: var(--c-btn-soft); color: var(--c-btn-soft-text); display: inline-flex; align-items: center; justify-content: center; --icon-size: var(--sp-20); }
  .search { display: flex; align-items: center; gap: var(--sp-8); height: var(--sp-40); padding: 0 var(--sp-12); border-radius: var(--r-pill); background: var(--c-field); color: var(--c-text-2); --icon-size: var(--sp-16); }
  .search input { flex: 1; min-width: 0; height: 100%; border: 0; background: none; outline: none; font-size: var(--fs-fb-body); line-height: var(--lh-fb-body); color: var(--c-text); }
  .search input::placeholder { color: var(--c-text-2); opacity: 1; }
  .search:focus-within { box-shadow: 0 0 0 1px var(--c-accent-icon); }
  .mine { display: flex; flex-direction: column; }
  .row { width: 100%; display: flex; align-items: center; gap: var(--sp-12); padding: var(--sp-6) 0; text-align: left; border-radius: var(--r-button); }
  .row:active { background: var(--c-pressed); }
  .rt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .none { padding: var(--sp-12) 0; }

  /* Desktop: Facebook's Friends home, cards in a grid on the wash. */
  .desk { min-height: 100%; background: var(--c-wash); padding: var(--sp-16) var(--sp-32) var(--sp-32); gap: var(--sp-16); }
  .desk .sec { border-top: 0; padding: 0; }
  .desk .sec + .sec { padding-top: var(--sp-16); border-top: 1px solid var(--c-divider); }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(calc(var(--sp-40) * 5), 1fr)); gap: var(--sp-8); }
  .cards .req { flex-direction: column; gap: 0; background: var(--c-surface); border-radius: var(--r-card); box-shadow: var(--sh-card); overflow: hidden; }
  .cards .av { width: 100%; aspect-ratio: 1; border-radius: 0; }
  .cards .av :global(.avatar) { border-radius: 0; }
  .cards .txt { padding: var(--sp-12); width: 100%; }
  .cards .btns { flex-direction: column; align-items: stretch; }
  .cards .btns .btn { flex: none; width: 100%; }
  .desk [data-birthdays] { max-width: var(--event-card-w); }
  .desk .search { max-width: var(--fb-rail-w); background: var(--c-surface); box-shadow: var(--sh-card); }
  .mine.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--fb-rail-w), 1fr)); gap: var(--sp-8); }
  .grid .row { padding: var(--sp-12); background: var(--c-surface); border-radius: var(--r-card); box-shadow: var(--sh-card); }
  :global(:root[data-layout="desktop"]) .row:hover { background: var(--c-hover); }
</style>
