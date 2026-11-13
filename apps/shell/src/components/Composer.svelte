<script lang="ts">
  import Icon from "./Icon.svelte";
  import { ui } from "../lib/ui.svelte";
  import { splitMention } from "../lib/muse";

  type Props = {
    onsend: (text: string) => void;
    onlike: () => void;
    ontyping?: (typing: boolean) => void;
    ontools?: () => void;
    /** "Tell Muse what to change": the tool this message will change, shown as a chip above the field */
    target?: { title: string } | null;
    oncleartarget?: () => void;
    /** bump to focus the field */
    focusKey?: number;
  };
  let { onsend, onlike, ontyping, ontools, target = null, oncleartarget, focusKey = 0 }: Props = $props();

  let text = $state("");
  let focused = $state(false);
  let forceOpen = $state(false);
  let field: HTMLTextAreaElement | undefined = $state();
  $effect(() => {
    if (focusKey > 0) field?.focus();
  });

  const hasText = $derived(text.trim().length > 0);
  /** A leading "muse" or "@Muse" is highlighted as a mention; sending it also asks Muse to build. */
  const mention = $derived(splitMention(text));
  $effect(() => ontyping?.(hasText));
  // IOS_FINDINGS: focused and empty, the four icons stay; they fold into a chevron once there is text.
  const collapsed = $derived(!ui.desktop && hasText && !forceOpen);

  function send() {
    if (!hasText) return;
    onsend(text);
    text = "";
    forceOpen = false;
    field?.focus();
  }
  function key(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  }
</script>

{#if target}
  <div class="target" data-change-target>
    <span class="target-text"><span class="target-lead">Changing:</span> {target.title}</span>
    <button type="button" class="target-x" aria-label="Stop changing this Mini" onclick={() => oncleartarget?.()}><Icon name="close" /></button>
  </div>
{/if}
<form class="composer" onsubmit={(e) => { e.preventDefault(); send(); }}>
  {#if ui.desktop}
    <div class="tools">
      {#if ontools}<button type="button" aria-label="Conjure a Mini" onclick={ontools}><Icon name="plusCircle" /></button>{/if}
      <button aria-disabled="true" title="Not in this prototype" type="button" aria-label="Send a voice clip"><Icon name="msgr_mic_voice_clip" /></button>
      <button aria-disabled="true" title="Not in this prototype" type="button" aria-label="Attach a file"><Icon name="msgr_gallery_attach" /></button>
      <button aria-disabled="true" title="Not in this prototype" type="button" aria-label="Choose a sticker"><Icon name="msgr_sticker" /></button>
      <button aria-disabled="true" title="Not in this prototype" type="button" aria-label="Choose a GIF"><Icon name="msgr_gif" /></button>
    </div>
  {:else if collapsed}
    <button type="button" class="tool open" aria-label="Show more actions" onclick={() => (forceOpen = true)}><Icon name="chevronRight" /></button>
  {:else}
    <div class="tools">
      <button type="button" aria-label="Conjure a Mini" onclick={ontools} aria-disabled={ontools ? undefined : "true"}><Icon name="plusCircle" /></button>
      <button aria-disabled="true" title="Not in this prototype" type="button" class="secondary" aria-label="Camera"><Icon name="camera" /></button>
      <button aria-disabled="true" title="Not in this prototype" type="button" class="secondary" aria-label="Photos"><Icon name="msgr_gallery_attach" /></button>
      <button aria-disabled="true" title="Not in this prototype" type="button" class="secondary" aria-label="Voice message"><Icon name="msgr_mic_voice_clip" /></button>
    </div>
  {/if}

  <div class="field">
    {#if mention}
      <div class="mirror" aria-hidden="true"><span class="mention">{mention.lead}</span>{mention.rest}</div>
    {/if}
    <textarea
      class:masked={!!mention}
      bind:this={field}
      bind:value={text}
      rows="1"
      placeholder="Message"
      aria-label="Message"
      enterkeyhint="send"
      onkeydown={key}
      onfocus={() => (focused = true)}
      onblur={() => { focused = false; forceOpen = false; }}
    ></textarea>
    <button aria-disabled="true" title="Not in this prototype" type="button" class="emoji" aria-label="Choose an emoji"><Icon name="emoji" /></button>
  </div>

  {#if hasText}
    <button type="submit" class="end" aria-label="Send"><Icon name="send" /></button>
  {:else}
    <button type="button" class="end" aria-label="Send a like" onclick={onlike}><Icon name="msgr_like_thumb" /></button>
  {/if}
</form>

<style>
  /* The reply-to chip for "Tell Muse what to change", like Messenger's "Replying to" bar. */
  .target {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    padding: var(--sp-8) var(--sp-4) 0 var(--sp-16);
    background: var(--c-bg);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    color: var(--c-text-2);
  }
  .target-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .target-lead { color: var(--c-text); font-weight: var(--fw-semibold); }
  .target .target-x { --icon-size: var(--sp-16); width: var(--sp-44); height: var(--sp-44); color: var(--c-text-2); }
  /*
   * IOS_FINDINGS: the group is 56 tall; four 44 buttons with no gap from x 4, the 40 field 8 after
   * them, the like button 8 after the field and 4 from the edge. Web: a 60 row, 36 buttons, 36 field.
   */
  .composer {
    display: flex;
    align-items: flex-end;
    gap: var(--sp-8);
    min-height: var(--composer-bar-h);
    padding: calc((var(--composer-bar-h) - var(--composer-btn)) / 2) var(--sp-4);
    background: var(--c-bg);
    --icon-size: var(--composer-icon);
    color: var(--c-accent-icon);
    container-type: inline-size;
  }
  /* On a narrow phone (320 wide) the camera, photos and voice buttons would squeeze the field below
     a usable width: the field keeps at least 140 px, and those three give way (the plus stays). */
  @container (max-width: 379px) { .tools .secondary { display: none; } }
  :global(:root[data-layout="desktop"]) .composer { min-height: 0; padding: var(--sp-12) var(--sp-4); }
  .tools { display: flex; flex: none; }
  button {
    width: var(--composer-btn);
    height: var(--composer-btn);
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-round);
    color: var(--c-accent-icon);
  }
  :global(:root[data-layout="desktop"]) button:hover { background: var(--c-hover); }
  .field {
    position: relative;
    flex: 1;
    min-width: 0;
    margin-bottom: calc((var(--composer-btn) - var(--composer-field-h)) / 2);
    background: var(--c-field);
    border-radius: var(--r-input);
    display: flex;
    align-items: flex-end;
  }
  textarea {
    flex: 1;
    min-width: 0;
    resize: none;
    border: 0;
    background: none;
    field-sizing: content;
    min-height: var(--composer-field-h);
    max-height: var(--composer-max-h);
    padding: calc((var(--composer-field-h) - var(--lh-body)) / 2) var(--sp-4) calc((var(--composer-field-h) - var(--lh-body)) / 2) var(--sp-12);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    color: var(--c-text);
    caret-color: var(--c-accent-icon);
    border-radius: var(--r-input);
  }
  textarea.masked { color: transparent; }
  .mirror {
    position: absolute;
    inset: 0 var(--composer-field-h) 0 0;
    padding: calc((var(--composer-field-h) - var(--lh-body)) / 2) var(--sp-4) 0 var(--sp-12);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    color: var(--c-text);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    overflow: hidden;
    pointer-events: none;
  }
  .mention { color: var(--c-btn-soft-text); font-weight: var(--fw-semibold); background: var(--c-btn-soft); border-radius: var(--sp-4); }
  textarea::placeholder { color: var(--c-text-2); opacity: 1; }
  textarea:focus-visible { outline: none; }
  .field:has(textarea:focus-visible) { box-shadow: 0 0 0 1px var(--c-accent-icon); }
  .emoji { width: var(--composer-field-btn); height: var(--composer-field-btn); margin: calc((var(--composer-field-h) - var(--composer-field-btn)) / 2); }
</style>
