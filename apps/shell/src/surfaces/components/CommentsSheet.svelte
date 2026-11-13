<script lang="ts">
  import { onMount } from "svelte";
  import Sheet from "../../components/Sheet.svelte";
  import { ui } from "../../lib/ui.svelte";
  import { comments } from "../comments-live.svelte";
  import Comments from "./Comments.svelte";

  /** Phone: the comments view as a tall bottom sheet over the app (SurfaceLayer mounts it). */
  const t = $derived(comments.sheet);
  // the posts' comment counts follow the feed room, so it is joined from the start (live only)
  onMount(() => comments.connect());
</script>

{#if t && !ui.desktop}
  {#key t.id}
    <Sheet label="Comments" tall onclose={() => comments.close()}>
      <Comments target={t} />
    </Sheet>
  {/key}
{/if}
