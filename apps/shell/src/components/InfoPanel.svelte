<script lang="ts">
  import { store } from "../store";
  import { ME } from "../store/types";
  import { ui } from "../lib/ui.svelte";
  import Avatar from "./Avatar.svelte";
  import GroupAvatar from "./GroupAvatar.svelte";
  import Icon from "./Icon.svelte";

  let { chatId }: { chatId: string } = $props();
  const chat = $derived(store.chat(chatId)!);
  const others = $derived(chat.members.filter((id) => id !== ME).map((id) => store.person(id)));
  const sections = ["Chat info", "Customize chat", "Media, files and links", "Privacy and support"];
</script>

<aside class="info" aria-label="Chat details">
  <div class="hero">
    {#if chat.kind === "group"}
      <GroupAvatar people={others} size="var(--avatar-info)" />
    {:else}
      <Avatar person={others[0]} size="var(--avatar-info)" active={chat.activeNow} />
    {/if}
    <h2 class="name">{chat.name}</h2>
    <p class="status">{chat.kind === "group" ? `${chat.members.length} members` : chat.activeNow ? "Active now" : "Active 2h ago"}</p>
    <div class="quick">
      <button aria-disabled="true" title="Not in this prototype"><span class="c"><Icon name="person" /></span>Profile</button>
      <button aria-disabled="true" title="Not in this prototype"><span class="c"><Icon name="mute" /></span>Mute</button>
      <button aria-disabled="true" title="Not in this prototype"><span class="c"><Icon name="searchOutline" /></span>Search</button>
    </div>
  </div>

  <ul class="sections">
    {#each sections as s (s)}
      <li><button aria-disabled="true" title="Not in this prototype" class="sec"><span>{s}</span><Icon name="chevron_down_small" /></button></li>
    {/each}
  </ul>

  {#if chat.kind === "group"}
    <h3 class="sub">Chat members</h3>
    <ul class="members">
      {#each [...new Set(chat.members)] as id (id)}
        {@const p = store.person(id)}
        <li class="member">
          <Avatar person={p} size="var(--sp-36)" active={p?.active} />
          <span class="mn">{p?.name}{id === ME ? " (you)" : ""}</span>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="theme">
    <button class="sec" onclick={() => ui.toggleTheme()} aria-pressed={ui.dark}>
      <span>Dark mode</span><span class="state">{ui.dark ? "On" : "Off"}</span>
    </button>
  </div>
</aside>

<style>
  .info { height: 100%; overflow-y: auto; padding: var(--sp-24) var(--sp-8) var(--sp-16); scrollbar-width: none; }
  .info::-webkit-scrollbar { display: none; }
  .hero { display: flex; flex-direction: column; align-items: center; padding: 0 var(--sp-8); }
  .name { margin-top: var(--sp-12); font-size: var(--fs-title); line-height: var(--lh-title); font-weight: var(--fw-semibold); text-align: center; }
  .status { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  .quick { display: flex; gap: var(--sp-24); margin: var(--sp-16) 0 var(--sp-16); }
  .quick button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-6);
    width: var(--sp-60);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    color: var(--c-text);
  }
  .c {
    width: var(--sp-36);
    height: var(--sp-36);
    border-radius: var(--r-round);
    background: var(--c-btn-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    --icon-size: var(--sp-20);
  }
  .quick button:hover .c { filter: brightness(0.95); }
  .sec {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--sp-8) var(--sp-8);
    min-height: var(--sp-44);
    border-radius: var(--r-button);
    font-size: var(--fs-row-name);
    line-height: var(--lh-row-name);
    font-weight: var(--fw-semibold);
    text-align: left;
    --icon-size: var(--sp-16);
  }
  .sec:hover { background: var(--c-hover); }
  .state { font-weight: var(--fw-regular); color: var(--c-text-2); }
  .sub { padding: var(--sp-8) var(--sp-8) var(--sp-4); font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); font-weight: var(--fw-semibold); }
  .member { display: flex; align-items: center; gap: var(--sp-12); padding: var(--sp-6) var(--sp-8); }
  .mn { font-size: var(--fs-row-name); line-height: var(--lh-row-name); }
  .theme { margin-top: var(--sp-8); }
</style>
