<script lang="ts">
  import { ICONS } from "../lib/icons";
  let { name }: { name: string } = $props();
</script>

<span class="icon" aria-hidden="true">{@html ICONS[name] ?? ""}</span>

<style>
  .icon {
    display: inline-flex;
    width: var(--icon-size, var(--sp-24));
    height: var(--icon-size, var(--sp-24));
    flex: none;
  }
  .icon :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
