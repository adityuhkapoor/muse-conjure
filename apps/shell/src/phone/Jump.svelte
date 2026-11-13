<script lang="ts">
  /** Shown over the thread list when you have scrolled up and something new arrived. */
  let { count, onjump }: { count: number; onjump: () => void } = $props();
</script>

<button class="jump" onclick={onjump} aria-label={count > 1 ? `Jump to latest, ${count} new messages` : "Jump to latest, 1 new message"}>
  <span class="dot" aria-hidden="true"></span>New messages
</button>
