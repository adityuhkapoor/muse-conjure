<script lang="ts">
  import { onDown } from "./conn";
  let down = $state(false);
  $effect(() => onDown((v) => (down = v)));
</script>

{#if down}
  <p class="toast line" role="status">Reconnecting</p>
{/if}
