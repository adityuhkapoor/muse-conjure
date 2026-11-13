<script lang="ts">
  import Avatar from "./Avatar.svelte";
  import { PICK_ORDER, rememberIdentity } from "../live/config";

  /**
   * Prototype convenience, not a login: pick who this phone is.
   * `connecting` is the same screen while the chat server is out of reach.
   */
  let { mode }: { mode: "pick" | "connecting" } = $props();

  function pick(id: string) {
    rememberIdentity(id);
    const u = new URL(location.href);
    u.searchParams.set("as", id);
    location.replace(u.toString());
  }
</script>

<main class="picker" aria-label={mode === "pick" ? "Continue as" : "Connecting"}>
  {#if mode === "pick"}
    <h1 class="h">Continue as</h1>
    <p class="sub">Prototype. Pick who this phone is. Use another phone or tab for someone else.</p>
    <ul class="list">
      {#each PICK_ORDER as p (p.id)}
        <li>
          <button class="row" onclick={() => pick(p.id)}>
            <Avatar person={p} size="var(--avatar-row)" />
            <span class="name">{p.name}</span>
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="sub" role="status">Connecting to the chat server</p>
  {/if}
</main>

<aside class="proto" aria-label="Prototype notice"><span>Prototype</span></aside>

<style>
  .picker {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    padding: calc(var(--safe-top) + var(--sp-24)) var(--sp-16) var(--sp-24);
    background: var(--c-bg);
    color: var(--c-text);
  }
  .h { font-size: var(--fs-wordmark); line-height: var(--lh-wordmark); font-weight: var(--fw-bold); }
  .sub { margin-top: var(--sp-8); font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  .list { margin-top: var(--sp-16); }
  .row { width: 100%; min-height: var(--row-min-h); display: flex; align-items: center; gap: var(--sp-12); padding: var(--sp-8) 0; text-align: left; border-radius: var(--r-button); }
  .row:active { background: var(--c-hover); }
  .name { font-size: var(--fs-row-name); line-height: var(--lh-row-name); }
  .proto {
    position: fixed;
    z-index: 100;
    left: var(--sp-8);
    bottom: var(--sp-2);
    height: var(--sp-16);
    padding: 0 var(--sp-6);
    display: flex;
    align-items: center;
    border-radius: var(--r-pill);
    background: var(--c-proto-bg);
    color: var(--c-proto-text);
    font-size: var(--fs-proto);
    line-height: var(--lh-proto);
  }
</style>
