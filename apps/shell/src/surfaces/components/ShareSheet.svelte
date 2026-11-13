<script lang="ts">
  import type { Snippet } from "svelte";
  import Sheet from "../../components/Sheet.svelte";
  import Avatar from "../../components/Avatar.svelte";
  import GroupAvatar from "../../components/GroupAvatar.svelte";
  import { store } from "../../store";
  import { ME } from "../../store/types";

  /** Share: send to a chat (each row has Send), and below it at most the one Muse option for this moment. */
  type Props = { label: string; onsend: (chatId: string) => void; onclose: () => void; muse?: Snippet };
  let { label, onsend, onclose, muse }: Props = $props();
  const others = (members: string[]) => members.filter((m) => m !== ME).map((m) => store.person(m));
</script>

<Sheet {label} {onclose}>
  <h2 class="title">{label}</h2>
  <ul class="chats" aria-label="Send in Messenger">
    {#each store.chats as chat (chat.id)}
      <li class="chat">
        {#if chat.kind === "group"}<GroupAvatar people={others(chat.members)} size="var(--sp-40)" />{:else}<Avatar person={others(chat.members)[0]} size="var(--sp-40)" />{/if}
        <span class="cn">{chat.name}</span>
        <button class="btn soft send" aria-label={`Send to ${chat.name}`} onclick={() => onsend(chat.id)}>Send</button>
      </li>
    {/each}
  </ul>
  {#if muse}<div class="muse">{@render muse()}</div>{/if}
</Sheet>

<style>
  .title { font-size: var(--fs-title); line-height: var(--lh-title); font-weight: var(--fw-bold); text-align: center; }
  .chats { margin-top: var(--sp-8); }
  .chat { display: flex; align-items: center; gap: var(--sp-12); padding: var(--sp-6) 0; }
  .cn { flex: 1; min-width: 0; font-size: var(--fs-row-sub); line-height: var(--lh-row-sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .send { flex: none; }
  .muse { margin-top: var(--sp-12); padding-top: var(--sp-12); border-top: 1px solid var(--c-divider); display: flex; flex-direction: column; gap: var(--sp-8); }
</style>
