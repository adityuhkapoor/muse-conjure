<script lang="ts">
  import Avatar from "../../components/Avatar.svelte";
  import Icon from "../../components/Icon.svelte";
  import MuseMark from "../../components/MuseMark.svelte";
  import { nav } from "../../lib/nav.svelte";
  import { ui } from "../../lib/ui.svelte";
  import { store } from "../../store";
  import { fb } from "../fbnav.svelte";
  import { notifsFor, type Notif } from "../data";
  import { viewerId } from "../../lib/media";
  import { waitingOnMe, who } from "../flows.svelte";
  import { ago } from "../time";
  import Unprompted from "../../muse/components/Unprompted.svelte"; // catalysts

  /** Notifications (LC section 8.4: avatar 56 + 28 badge, text 15/20, time blue when unread, 12 dot). */
  let { onpick }: { onpick?: () => void } = $props();
  const waiting = $derived(waitingOnMe());
  const parts = (t: string) => t.split("**").map((x, i) => ({ b: i % 2 === 1, t: x }));
  const BADGE: Record<Notif["badge"], string> = { comment: "fbs_comment", event: "calendar", group: "fbs_groups", share: "fbs_share", story: "fbs_poll" };

  function go(n: Notif) {
    onpick?.();
    if (n.go.kind === "post") {
      fb.focusPost = n.go.id;
      nav.go({ kind: "fb", page: { name: "home" } });
    } else if (n.go.kind === "event") nav.go({ kind: "event", id: n.go.id });
    else if (n.go.kind === "group") nav.go({ kind: "fb", page: { name: "group", id: n.go.id } });
    else if (n.go.kind === "chat") nav.openChat(n.go.id, n.go.tool);
    else nav.go({ kind: "fb", page: { name: "story", id: n.go.id } });
  }
  function open(chatId: string, toolId: string) {
    onpick?.();
    nav.openChat(chatId, toolId);
  }
</script>

<section class="nt" class:top-pad={!ui.desktop} aria-label="Notifications">
  {#if ui.desktop}
    <h2 class="dh">Notifications</h2>
  {/if}

  <Unprompted place="notifications" {onpick} /><!-- catalysts: timed offers, only when switched on -->

  {#if waiting.length}
    <h2 class="fb-section sh">Needs you</h2>
    <ul>
      {#each waiting as w (w.toolId)}
        <li>
          <button class="row unread" data-needs-you={w.toolId} onclick={() => open(w.chatId, w.toolId)}>
            <span class="av muse"><MuseMark size="var(--sp-28)" /></span>
            <span class="txt">
              <span class="line"><strong>{w.name}</strong> in <strong>{w.chat}</strong> is waiting on you{w.summary ? ` · ${w.summary}` : ""}</span>
              <span class="time">From {w.surface} · {ago(Math.max(60_000, store.now() - w.at))}</span>
            </span>
            <span class="dot" role="img" aria-label="Unread"></span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <h2 class="fb-section sh">New</h2>
  <ul>
    {#each notifsFor(viewerId()) as n (n.id)}
      <li>
        <button class="row" class:unread={n.unread} onclick={() => go(n)}>
          <span class="av"><Avatar person={who(n.by)} size="var(--notif-avatar)" /><span class="badge"><Icon name={BADGE[n.badge]} /></span></span>
          <span class="txt">
            <span class="line">{#each parts(n.html) as p, i (i)}{#if p.b}<strong>{p.t}</strong>{:else}{p.t}{/if}{/each}</span>
            <span class="time">{ago(n.ago)}</span>
          </span>
          {#if n.unread}<span class="dot" role="img" aria-label="Unread"></span>{/if}
        </button>
      </li>
    {/each}
  </ul>
</section>

<style>
  .nt { padding: 0 var(--sp-8) calc(var(--tabbar-float-h) + var(--tabbar-float-bottom) + var(--sp-24)); }
  :global(:root[data-layout="desktop"]) .nt { padding-bottom: var(--sp-16); }
  .nt.top-pad { padding-top: calc(var(--fb-header-h) + var(--safe-top)); }
  .dh { padding: var(--sp-12) var(--sp-8) var(--sp-4); font-size: var(--fs-chats-title); line-height: var(--lh-chats-title); font-weight: var(--fw-bold); }
  .sh { padding: var(--sp-12) var(--sp-8) var(--sp-4); }
  .row { width: 100%; display: flex; align-items: center; gap: var(--sp-12); padding: var(--sp-8); border-radius: var(--r-button); text-align: left; }
  .row:active { background: var(--c-hover); }
  :global(:root[data-layout="desktop"]) .row:hover { background: var(--c-hover); }
  .av { position: relative; flex: none; display: inline-flex; width: var(--notif-avatar); height: var(--notif-avatar); }
  .av.muse { align-items: center; justify-content: center; border-radius: var(--r-round); background: var(--c-field); }
  .badge { position: absolute; right: calc(var(--sp-4) * -1); bottom: calc(var(--sp-4) * -1); width: var(--notif-badge); height: var(--notif-badge); border-radius: var(--r-round); background: var(--c-accent); color: var(--c-white); display: inline-flex; align-items: center; justify-content: center; --icon-size: var(--sp-16); box-shadow: 0 0 0 var(--sp-2) var(--c-bg); }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .line { font-size: var(--fs-fb-body); line-height: var(--lh-fb-body); color: var(--c-text); }
  .line strong { font-weight: var(--fw-semibold); }
  .time { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  .unread .time { color: var(--c-link); font-weight: var(--fw-semibold); }
  .dot { flex: none; width: var(--dot-notif); height: var(--dot-notif); border-radius: var(--r-round); background: var(--c-unread-dot); }
</style>
