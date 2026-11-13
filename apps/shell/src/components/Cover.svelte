<script lang="ts">
  import { OBJECT_PHOTOS } from "../lib/media";
  import { hasPhoto, photoId } from "../lib/photos";
  import { coverUrl, type CoverKind } from "../lib/cover";
  import Photo from "./Photo.svelte";

  /**
   * A picture slot: a real photo when `id` is one (PHOTOS, src/lib/photos.ts), drawn with the cover of
   * `kind` behind it while it loads and in its place if it fails. Any other id (or seed) is a drawn cover:
   * soft gradient, a few circles and a line icon. Takes the same props as Photo.
   */
  let {
    id,
    kind,
    width = 0,
    alt,
    eager = false,
    position = "center",
    onfail,
  }: { id: string | undefined; kind?: CoverKind; width?: number; alt?: string; eager?: boolean; position?: string; onfail?: () => void } = $props();
</script>

{#if id && (hasPhoto(id) || (!kind && OBJECT_PHOTOS.has(id)))}
  <Photo id={photoId(id)} {width} {alt} {eager} {position} {kind} {onfail} />
{:else if id}
  <img class="cover-img" data-cover={id} src={coverUrl(id, kind)} alt={alt ?? ""} decoding="async" draggable="false" />
{/if}

<style>
  .cover-img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
