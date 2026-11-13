<script lang="ts">
  import Icon from "../../components/Icon.svelte";
  import { NOTIFS } from "../data";
  import { waitingOnMe } from "../flows.svelte";
  import Notifications from "./Notifications.svelte";

  /** The top bar's bell: count badge and the Notifications panel (LC 7.3: popover 360 wide). */
  let open = $state(false);
  const count = $derived(NOTIFS.filter((n) => n.unread).length + waitingOnMe().length);
  function key(e: KeyboardEvent) {
    if (e.key === "Escape") open = false;
  }
</script>

<svelte:window onkeydown={key} />

<div class="wrap">
  <button class="circle" class:on={open} aria-label={`${count} notifications`} aria-expanded={open} aria-haspopup="dialog" onclick={() => (open = !open)}>
    <Icon name="top_notifications_bell" />{#if count}<span class="badge">{count}</span>{/if}
  </button>
  {#if open}
    <div class="panel" role="dialog" aria-label="Notifications"><Notifications onpick={() => (open = false)} /></div>
  {/if}
</div>

<style>
  .wrap { position: relative; }
  .circle {
    position: relative;
    width: var(--sp-40);
    height: var(--sp-40);
    border-radius: var(--r-round);
    background: var(--c-btn-secondary);
    color: var(--c-text);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    --icon-size: var(--sp-20);
  }
  .circle.on { background: var(--c-selected); color: var(--c-accent); }
  .badge {
    position: absolute;
    top: calc(var(--sp-6) * -1);
    right: calc(var(--sp-4) * -1);
    min-width: var(--sp-20);
    height: var(--sp-20);
    padding: 0 var(--sp-5);
    border-radius: var(--r-pill);
    background: var(--c-badge);
    color: var(--c-white);
    font-size: var(--fs-meta);
    line-height: var(--sp-20);
    font-weight: var(--fw-medium);
    text-align: center;
  }
  .panel {
    position: absolute;
    z-index: 30;
    top: calc(100% + var(--sp-8));
    right: calc(var(--sp-48) * -1);
    width: var(--fb-rail-w);
    max-height: calc(100vh - var(--topbar-h) - var(--sp-32));
    overflow-y: auto;
    background: var(--c-bg);
    border-radius: var(--r-card);
    box-shadow: var(--sh-float);
  }
</style>
