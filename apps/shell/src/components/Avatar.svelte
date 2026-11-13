<script lang="ts">
  import type { Person } from "../store/types";
  import { faceUrl } from "../lib/face";
  import { knownAs, pxOf, realPerson } from "../lib/media";
  import { avatarFor } from "@muse/assets";
  import MuseMark from "./MuseMark.svelte";

  let {
    person,
    size = "var(--avatar-row)",
    active = false,
    ring = false,
    px,
  }: { person: Person | undefined; size?: string; active?: boolean; ring?: boolean; /** CSS px the size comes to, when `size` is not a plain token */ px?: number } = $props();

  // The three team members show their own photo (src/lib/media.ts realPerson); everyone else gets a
  // drawn face (src/lib/face.ts): the cast has a fixed look, strangers one from their id, so a person
  // looks the same everywhere. It sits next to a name, so alt is empty.
  const real = $derived(person ? realPerson(person.id) : undefined);
  const photo = $derived(real ? avatarFor(real, px ?? pxOf(size)) : undefined);
  const src = $derived(person && person.id !== "muse" ? faceUrl(knownAs(person.id), person.name, px ?? pxOf(size)) : undefined);
</script>

<span class="avatar" class:ring style:--av={size} style:--tone={`var(--c-av-${person?.tone ?? 1})`}>
  {#if person?.id === "muse"}
    <span class="muse"><MuseMark size="60%" /></span>
  {:else if photo?.kind === "image"}
    <img class="face real" src={photo.src} srcset={photo.srcset} alt="" style:background-color={photo.color} style:background-image={`url(${photo.placeholder})`} decoding="async" draggable="false" />
  {:else if src}
    <img class="face" {src} alt="" decoding="async" draggable="false" />
  {:else}
    <span class="initials" aria-hidden="true" data-i={person?.initials ?? ""}></span>
  {/if}
  {#if active}<span class="dot" aria-hidden="true"></span>{/if}
</span>

<style>
  .avatar {
    position: relative;
    display: inline-flex;
    flex: none;
    width: var(--av);
    height: var(--av);
    border-radius: var(--r-round);
    background: var(--tone);
    color: var(--c-av-text);
    align-items: center;
    justify-content: center;
    box-shadow: inset 0 0 0 1px var(--c-hairline);
  }
  .avatar.ring { box-shadow: 0 0 0 var(--dot-active-ring) var(--c-bg); }
  .face {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: inherit;
    object-fit: cover;
    background-size: cover;
    background-position: center;
  }
  /* the hairline ring stays on top of the photo */
  .avatar:has(.face)::after { content: ""; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 1px var(--c-hairline); pointer-events: none; }
  .avatar.ring:has(.face)::after { box-shadow: none; }
  .initials::before { content: attr(data-i); }
  .initials {
    font-size: calc(var(--av) * 0.38);
    font-weight: var(--fw-semibold);
    line-height: 1;
    letter-spacing: 0;
  }
  .muse {
    display: flex;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;
    background: var(--c-bg);
    border-radius: var(--r-round);
    box-shadow: inset 0 0 0 1px var(--c-hairline);
  }
  .dot {
    position: absolute;
    right: 0;
    bottom: 0;
    width: var(--dot-active);
    height: var(--dot-active);
    border-radius: var(--r-round);
    background: var(--c-active);
    border: var(--dot-active-ring) solid var(--c-bg);
    /* scale the dot down on small avatars */
    transform: scale(clamp(0.6, calc(var(--av) / var(--avatar-row)), 1));
    transform-origin: bottom right;
  }
</style>
