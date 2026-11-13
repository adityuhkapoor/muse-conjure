<script lang="ts">
  import Avatar from "../../components/Avatar.svelte";
  import Icon from "../../components/Icon.svelte";
  import { store } from "../../store";
  import { ui } from "../../lib/ui.svelte";
  import { nav } from "../../lib/nav.svelte"; // compose
  import CreatePost from "./CreatePost.svelte"; // compose
  let dialog = $state(false); // compose: the desktop dialog
  const open = () => (ui.desktop ? (dialog = true) : nav.go({ kind: "fb", page: { name: "compose" } })); // compose

  /** "What's on your mind?" (IOS row 64 tall; MP desktop card). Opens Create post (compose). */
</script>

<section class="composer fb-card" aria-label="Create a post">
  <div class="row">
    <Avatar person={store.me} size="var(--fb-post-avatar)" />
    <button class="pill" onclick={open} data-compose-open>{ui.desktop ? `What's on your mind, ${store.me.first}?` : "What's on your mind?"}</button>
    {#if ui.desktop}
      <button class="ib live" aria-disabled="true" title="Not in this prototype" aria-label="Live video"><Icon name="fbs_live" /></button>
      <button class="ib feeling" aria-disabled="true" title="Not in this prototype" aria-label="Feeling or activity"><Icon name="fbs_feeling" /></button>
    {/if}
    <button class="ib photo" aria-disabled="true" title="Not in this prototype" aria-label="Photo"><Icon name="fbs_photo" /></button>
  </div>
</section>
{#if dialog}<CreatePost mode="dialog" onclose={() => (dialog = false)} />{/if}<!-- compose -->

<style>
  .row { height: var(--fb-composer-row-h); display: flex; align-items: center; gap: var(--sp-8); padding: 0 var(--sp-12); }
  .pill {
    flex: 1;
    min-width: 0;
    height: var(--sp-40);
    padding: 0 var(--sp-12);
    border-radius: var(--r-input);
    background: var(--c-field);
    color: var(--c-text-2);
    text-align: left;
    font-size: var(--fs-fb-composer);
    line-height: var(--lh-fb-composer);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ib { width: var(--sp-40); height: var(--sp-40); border-radius: var(--r-button); display: inline-flex; align-items: center; justify-content: center; --icon-size: var(--sp-24); flex: none; }
  .photo { color: var(--c-fb-photo); }
  .live { color: var(--c-fb-live); }
  .feeling { color: var(--c-fb-feeling); }
</style>
