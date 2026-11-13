<script lang="ts">
  import { onDestroy } from "svelte";
  import { store } from "../store";
  import { ME, type Note, type ToolTemplate } from "../store/types";
  import { BUILD_MS } from "../lib/muse";
  import { nav } from "../lib/nav.svelte";
  import GroupAvatar from "./GroupAvatar.svelte";
  import MuseCard from "./MuseCard.svelte";
  import Sheet from "./Sheet.svelte";

  /**
   * Fake flow, real navigation. From a friend's note (`note` set): preview, then "Join" or
   * "Use for my group". From search (no note): straight to the chat picker. Picking a chat shows the
   * building state for a moment, then lands in that chat with the placeholder card.
   */
  type Props = { template: ToolTemplate; note?: Note; onclose: () => void };
  let { template, note, onclose }: Props = $props();

  // svelte-ignore state_referenced_locally
  let step = $state<"preview" | "pick" | "building">(note ? "preview" : "pick");
  let timer: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(timer));

  const by = $derived(note ? store.person(note.by) : undefined);
  const title = $derived(note?.tool?.title ?? template.name);
  const groups = $derived(store.chats.filter((c) => c.kind === "group"));

  function join() {
    if (!note) return;
    const chat = store.joinNote(note.id);
    const tool = store.toolsFor(chat).find((t) => t.name === title);
    onclose();
    nav.openChat(chat, tool?.id);
  }
  function build(chatId: string) {
    if (store.live) {
      // Live: the building card goes into the chat itself, for everyone in it.
      store.buildTool(chatId, template.id, { title, blank: true });
      onclose();
      nav.openChat(chatId);
      return;
    }
    step = "building";
    timer = setTimeout(() => {
      const tool = store.addTool(chatId, template.id, { title, systemLine: true });
      onclose();
      nav.openChat(chatId, tool.id);
    }, BUILD_MS);
  }
</script>

<Sheet label={step === "pick" ? "Choose a chat" : step === "building" ? "Muse is conjuring" : title} {onclose} busy={step === "building"}>
  {#if step === "preview" && note}
    <h2 class="title">{by?.first} made a {template.name.toLowerCase()}</h2>
    <p class="sub">Try it with {by?.first}, or start your own.</p>
    <div class="card" style:--muse-body-h="var(--sheet-card-body)">
      <MuseCard appId={template.id} {title} subtitle={`Made with Muse · ${by?.first}`} preview />
    </div>
    <div class="actions">
      <button class="btn primary" onclick={join}>Join</button>
      <button class="btn" onclick={() => (step = "pick")}>Use for my group</button>
    </div>
  {:else if step === "pick"}
    <h2 class="title">Choose a chat</h2>
    <p class="sub">Muse will build {title} there.</p>
    <ul class="chats">
      {#each groups as chat (chat.id)}
        <li>
          <button class="chat" onclick={() => build(chat.id)}>
            <GroupAvatar people={chat.members.filter((m) => m !== ME).map((m) => store.person(m))} size="var(--sp-48)" />
            <span class="cn">{chat.name}</span>
            <span class="cs">{chat.members.length} people</span>
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <h2 class="sr-only">Muse is conjuring</h2>
    <div class="card" style:--muse-body-h="var(--sheet-card-body)" role="status">
      <MuseCard appId={template.id} {title} subtitle="Made with Muse" building />
    </div>
  {/if}
</Sheet>

<style>
  .title { font-size: var(--fs-title); line-height: var(--lh-title); font-weight: var(--fw-bold); text-align: center; }
  .sub { margin-top: var(--sp-2); text-align: center; font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  .card { margin-top: var(--sp-16); }
  .actions { display: flex; flex-direction: column; gap: var(--sp-8); margin-top: var(--sp-16); }
  .actions .btn { width: 100%; }
  .chats { margin-top: var(--sp-8); }
  .chat { width: 100%; display: flex; align-items: center; gap: var(--sp-12); padding: var(--sp-8) 0; text-align: left; border-radius: var(--r-button); }
  .chat:active { background: var(--c-hover); }
  .cn { flex: 1; min-width: 0; font-size: var(--fs-row-name); line-height: var(--lh-row-name); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cs { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
</style>
