<script lang="ts">
  import { store } from "../../store";
  import type { Message } from "../../store/types";
  import { REELS, type Reel } from "../../surfaces/data";
  import { addToTry, madeId, addedId, picker, sendReel, tryList } from "../../surfaces/flows.svelte";
  import { catalyst } from "../catalyst.svelte";
  import { reelContext } from "../context";
  import { scenario } from "../pack";
  import { nameOf } from "../page";
  import type { PageContext, Situation } from "../types";
  import MuseAsk from "./MuseAsk.svelte";
  import MuseSuggest from "./MuseSuggest.svelte";
  import PageTools from "./PageTools.svelte";

  /**
   * Reels hooks. `part="share"` (the reel's Send to sheet): one offer read from what the reel shows,
   * and the Muse field; either asks which chat, sends the reel there and makes the tool in it.
   * `part="thread"` (components/Thread.svelte, under a shared reel): the offer for that chat,
   * from the reel's content and the chat's people, for everyone in the chat. `part="page"` (the Reels
   * list): the tools friends made on this reel, live, on a card over the reel.
   */
  type Props = { r: Reel; part: "share" | "thread" | "page"; chatId?: string; msg?: Message; onclose?: () => void };
  let { r, part, chatId, msg, onclose }: Props = $props();

  const chat = $derived(chatId ? store.chat(chatId) : undefined);
  /** reels shared in this chat, oldest first */
  const inChat = $derived(
    (chat?.messages ?? [])
      .filter((m) => m.link?.shared?.kind === "reel")
      .map((m) => REELS.find((x) => x.id === m.link!.shared!.id))
      .filter((x): x is Reel => !!x)
      .filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i),
  );
  const ctx = $derived.by((): PageContext => {
    const c = reelContext(r, { nameOf, ...(chat ? { chatId: chat.id, chatName: chat.name, members: chat.members, reelsInChat: inChat.map((x) => ({ id: x.id, caption: x.caption })) } : {}) });
    // One offer per shared message, so a second share of the same reel can offer again.
    return msg ? { ...c, object: { kind: "reel", id: `${r.id}@${msg.id}` } } : c;
  });
  /** what this chat already has: an offer whose tool is in the chat is not made twice */
  const has = (s: Situation) => {
    const sc = scenario(s.scenario);
    return !!sc && !!chat && (store.toolsFor(chat.id).some((t) => t.name === sc.title(ctx)) || chat.messages.some((m) => m.muse?.title === sc.title(ctx)));
  };
  const done = $derived(!!msg && !!chat?.messages.some((m) => m.id === addedId(msg.id) || m.id === madeId(msg.id)));
  const offers = $derived(done ? [] : catalyst.suggest(ctx, part === "share" ? 1 : 2).filter((s) => s.scenario === "reel-to-try" || !has(s)));

  function take(s: Situation) {
    if (part === "thread" && chatId && msg) {
      // The to-try list grows: later reels add their places to the chat's list.
      if (s.scenario === "reel-to-try" && (r.places.length || tryList(chatId))) {
        catalyst.dismiss([s.id]);
        return addToTry(chatId, msg, { ...r, places: (ctx.facts.places as string[] | undefined) ?? r.places });
      }
      catalyst.dismiss([s.id]);
      return catalyst.take(ctx, s);
    }
    onclose?.();
    picker.ask({ title: "Choose a chat", sub: `Muse will send the reel and make it for the people in it.`, onpick: (id) => {
      sendReel(id, r);
      const c = store.chat(id);
      catalyst.take(reelContext(r, { nameOf, chatId: id, ...(c ? { chatName: c.name, members: c.members } : {}) }), s);
    } });
  }
  function ask(text: string) {
    onclose?.();
    picker.ask({ title: "Choose a chat", sub: "Muse will send the reel and make it for the people in it.", onpick: (id) => {
      sendReel(id, r);
      const c = store.chat(id);
      catalyst.ask(reelContext(r, { nameOf, chatId: id, ...(c ? { chatName: c.name, members: c.members } : {}) }), text);
    } });
  }
</script>

{#if part === "page"}
  <div class="card"><PageTools {ctx} credit="on this reel" /></div>
{:else if part === "share"}
  <MuseSuggest items={offers} ontake={take} ondismiss={(ids) => catalyst.dismiss(ids)} />
  <MuseAsk placeholder="Ask Muse to make something with it" onask={ask} />
{:else if offers.length}
  <div class="under" class:mine={msg?.from === "me"}>
    <MuseSuggest items={offers} ontake={take} ondismiss={(ids) => catalyst.dismiss(ids)} />
  </div>
{/if}

<style>
  /* Over the reel: the tool and its credit sit on the page surface, full width. */
  .card { padding: var(--sp-12); border-radius: var(--r-rich-card); background: var(--c-bg); color: var(--c-text); box-shadow: var(--sh-float); }
  .card:not(:has([data-surface-tool])) { display: none; }
  .under { display: flex; padding: var(--sp-4) var(--msg-pad) var(--sp-4) calc(var(--msg-pad) + var(--avatar-col)); }
  .under.mine { justify-content: flex-end; padding-left: var(--msg-pad); }
  .under > :global(*) { width: min(var(--bubble-max), 100%); }
</style>
