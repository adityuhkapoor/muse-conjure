<script lang="ts">
  import { photo } from "@muse/assets";
  import { OBJECT_PHOTOS } from "../lib/media";
  import { PHOTOS, photoId } from "../lib/photos";
  import { coverUrl, type CoverKind } from "../lib/cover";

  /**
   * A real photo filling its box (object-fit: cover). Ids in PHOTOS (src/lib/photos.ts: the owner's photos and
   * credited Unsplash and Pexels photos) load a file; the drawn cover (src/lib/cover.ts) paints behind it while
   * it loads and replaces it if the file fails. Any other id is drawn, so no photo of a made-up person can come
   * back through here. `width` is the CSS width it is drawn at, for choosing the file.
   */
  let {
    id,
    width,
    alt,
    eager = false,
    position = "center",
    kind,
    onfail,
  }: { id: string | undefined; width: number; alt?: string; eager?: boolean; position?: string; kind?: CoverKind; onfail?: () => void } = $props();
  let failed = $state(false);
  const pid = $derived(photoId(id));
  const img = $derived(pid && !failed && (PHOTOS.has(pid) || OBJECT_PHOTOS.has(pid)) ? photo(pid, width) : undefined);
</script>

{#if img}
  <img
    class="photo-img"
    src={img.src}
    srcset={img.srcset}
    sizes={`${width}px`}
    alt={alt ?? img.alt}
    width={img.width}
    height={img.height}
    loading={eager ? "eager" : "lazy"}
    decoding="async"
    draggable="false"
    style:background-color={img.color}
    style:background-image={`url("${coverUrl(id!, kind)}")`}
    style:object-position={position}
    onerror={() => { failed = true; onfail?.(); }}
  />
{:else if id}
  <img class="cover-img" data-cover={id} src={coverUrl(id, kind)} alt={alt ?? ""} decoding="async" draggable="false" />
{/if}

<style>
  .photo-img,
  .cover-img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    background-size: cover;
    background-position: center;
  }
</style>
