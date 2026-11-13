<script lang="ts">
  import Sheet from "../../components/Sheet.svelte";
  import GroupAvatar from "../../components/GroupAvatar.svelte";
  import { store } from "../../store";
  import { ME } from "../../store/types";
  import { fb } from "../fbnav.svelte";
  import { groupChats, picker } from "../flows.svelte";
  import CommentsSheet from "./CommentsSheet.svelte"; // comments

  /** App-wide overlays for the surfaces: the chat picker every "lands in a chat" flow uses, and the toast. */
  const p = $derived(picker.open);
  const chats = $derived(groupChats(p?.prefer ?? []));

  function choose(id: string) {
    const run = p!.onpick;
    picker.close();
    run(id);
  }
</script>

{#if p}
  <div class="pick"><!-- above the desktop Create post dialog (z-index 30) -->
  <Sheet label={p.title} onclose={() => picker.close()}>
    <h2 class="title">{p.title}</h2>
    <p class="sub">{p.sub}</p>
    <ul class="chats">
      {#each chats as chat (chat.id)}
        <li>
          <button class="chat" onclick={() => choose(chat.id)}>
            <GroupAvatar people={chat.members.filter((m) => m !== ME).map((m) => store.person(m))} size="var(--sp-48)" />
            <span class="cn">{chat.name}</span>
            <span class="cs">{chat.members.length} people</span>
          </button>
        </li>
      {/each}
    </ul>
  </Sheet>
  </div>
{/if}

<CommentsSheet /><!-- comments: the phone's comments view -->

{#if fb.toast}
  {#key fb.toast.n}
    <div class="fbtoast" role="status">
      <span class="tt">{fb.toast.text}</span>
      {#if fb.toast.action}
        {@const a = fb.toast.action}
        <button class="ta" onclick={() => { const run = a.run; fb.toast = null; run(); }}>{a.label}</button>
      {/if}
    </div>
  {/key}
{/if}

<style>
  .pick { position: absolute; inset: 0; z-index: 40; pointer-events: none; }
  .pick :global([data-sheet]) { pointer-events: auto; }
  .title { font-size: var(--fs-title); line-height: var(--lh-title); font-weight: var(--fw-bold); text-align: center; }
  .sub { margin-top: var(--sp-2); text-align: center; font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  .chats { margin-top: var(--sp-8); }
  .chat { width: 100%; display: flex; align-items: center; gap: var(--sp-12); padding: var(--sp-8) 0; text-align: left; border-radius: var(--r-button); }
  .chat:active { background: var(--c-hover); }
  .cn { flex: 1; min-width: 0; font-size: var(--fs-row-name); line-height: var(--lh-row-name); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cs { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  .fbtoast {
    position: fixed;
    z-index: 60;
    left: 50%;
    top: calc(var(--safe-top) + var(--sp-8));
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: var(--sp-12);
    max-width: calc(100% - var(--sp-32));
    min-height: var(--btn-h);
    padding: var(--sp-6) var(--sp-8) var(--sp-6) var(--sp-16);
    border-radius: var(--r-pill);
    background: var(--c-toast);
    color: var(--c-white);
    box-shadow: var(--sh-float);
    animation: drop var(--dur-short-in) var(--ease-enter) both;
  }
  .tt { font-size: var(--fs-meta); line-height: var(--lh-meta); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ta { font-size: var(--fs-meta); line-height: var(--lh-meta); font-weight: var(--fw-semibold); color: var(--c-white); padding: var(--sp-6) var(--sp-8); text-decoration: underline; }
  @keyframes drop { from { opacity: 0; transform: translate(-50%, calc(var(--sp-8) * -1)); } to { opacity: 1; transform: translate(-50%, 0); } }
</style>
