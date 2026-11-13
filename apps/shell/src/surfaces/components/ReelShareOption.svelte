<script lang="ts">
  import { store } from "../../store";
  import { ME, type Message } from "../../store/types";
  import { names } from "../../lib/format";
  import { reel } from "../data";
  import { addedId, addToTry, madeId, tryList } from "../flows.svelte";
  import MuseOption from "./MuseOption.svelte";
  import ReelCatalysts from "../../muse/components/ReelCatalysts.svelte"; // catalysts

  /**
   * Thread hook (components/Thread.svelte): under a shared reel, one option for everyone in the
   * chat, "Add to our to-try list". It makes the chat's list the first time and adds to it after.
   * Gone once someone added this reel.
   */
  let { chatId, msg }: { chatId: string; msg: Message } = $props();
  const r = $derived(msg.link?.shared?.kind === "reel" ? reel(msg.link.shared.id) : undefined);
  const chat = $derived(store.chat(chatId));
  const done = $derived(!!chat?.messages.some((m) => m.id === addedId(msg.id) || m.id === madeId(msg.id)));
  const has = $derived(!!tryList(chatId));
</script>

{#if r}<ReelCatalysts {r} part="thread" {chatId} {msg} />{/if}<!-- catalysts: the offer comes from what the reel shows (src/muse) -->

<style>
  .under { display: flex; padding: var(--sp-4) var(--msg-pad) var(--sp-4) calc(var(--msg-pad) + var(--avatar-col)); }
  .under.mine { justify-content: flex-end; padding-left: var(--msg-pad); }
  .under > :global(*) { max-width: min(var(--bubble-max), 100%); width: auto; }
</style>
