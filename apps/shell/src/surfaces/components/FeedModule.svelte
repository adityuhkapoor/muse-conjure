<script lang="ts">
  import Avatar from "../../components/Avatar.svelte";
  import Cover from "../../components/Cover.svelte";
  import Icon from "../../components/Icon.svelte";
  import { compact, names } from "../../lib/format";
  import { nav } from "../../lib/nav.svelte";
  import { GROUPS, type Module } from "../data";
  import { isMe, person } from "../say";
  import { mayKnowFor, mutualText, openProfile } from "../profile-data"; // profile
  import { viewerId } from "../../lib/media";

  /** Feed modules that are not posts: a birthday row, people you may know, a suggested group. */
  let { item }: { item: Module } = $props();

  let added = $state<string[]>([]);
  let joined = $state(false);
  const group = $derived(item.kind === "suggest" ? GROUPS.find((g) => g.id === item.group) : undefined);
</script>

{#if item.kind === "birthday"}
  {@const p = person(item.who)}
  <section class="fb-card mod bday" data-module={item.id} aria-label="Birthdays">
    <span class="cake"><Icon name="pf_cake" /></span>
    <p class="fb-body">{#if isMe(item.who)}Your birthday is {item.when}{:else}<button class="lk" onclick={() => openProfile(item.who)}><strong>{p?.first}</strong></button>'s birthday is {item.when}. Wish him a happy birthday{/if}</p>
  </section>
{:else if item.kind === "pymk"}
  <section class="fb-card mod" data-module={item.id} aria-label="People you may know">
    <p class="fb-name h">People you may know</p>
    <div class="strip">
      {#each mayKnowFor(viewerId()).slice(0, 4) as id (id)}
        {@const p = person(id)}
        <div class="pc">
          <button class="face" onclick={() => openProfile(id)} aria-label={`${p?.name}'s profile`}><Avatar person={p} size="var(--sp-80)" /></button>
          <p class="fb-name pn">{p?.name}</p>
          {#if mutualText(viewerId(), id)}<p class="fb-meta">{mutualText(viewerId(), id)}</p>{/if}
          {#if item.notes?.[id]}<p class="fb-meta">{item.notes[id]}</p>{/if}
          <button class="btn" class:primary={!added.includes(id)} onclick={() => (added = added.includes(id) ? added.filter((a) => a !== id) : [...added, id])}>{added.includes(id) ? "Cancel" : "Add friend"}</button>
        </div>
      {/each}
    </div>
  </section>
{:else if item.kind === "suggest" && group}
  {@const g = group}
  <section class="fb-card mod" data-module={item.id} aria-label="Suggested for you">
    <p class="fb-name h">Suggested for you</p>
    <button class="gcover" onclick={() => nav.go({ kind: "fb", page: { name: "group", id: g.id } })} aria-label={`Open ${g.name}`}><Cover id={g.cover ?? g.id} kind="event" alt="" /></button>
    <div class="grow">
      <div class="gt">
        <p class="fb-name">{g.name}</p>
        <p class="fb-meta">{g.privacy} · {compact(g.members)} members</p>
        <p class="fb-meta faces"><span class="pile">{#each g.faces.slice(0, 3) as f (f)}<Avatar person={person(f)} size="var(--avatar-facepile-sm)" ring />{/each}</span>{names(g.faces.slice(0, 2).map((f) => person(f)?.first ?? ""))} are members</p>
      </div>
      <button class="btn" class:primary={!joined} onclick={() => (joined = !joined)}>{joined ? "Requested" : "Join"}</button>
    </div>
  </section>
{/if}

<style>
  .mod { display: flex; flex-direction: column; gap: var(--sp-12); padding: var(--sp-12); }
  .bday { flex-direction: row; align-items: center; }
  .cake { display: inline-flex; align-items: center; justify-content: center; flex: none; width: var(--sp-40); height: var(--sp-40); border-radius: var(--r-round); background: var(--c-wash); color: var(--c-accent-icon); --icon-size: var(--sp-20); }
  .lk { color: inherit; }
  .lk strong, .bday strong { font-weight: var(--fw-semibold); }
  .h { font-size: var(--fs-fb-section); }
  .strip { display: flex; gap: var(--sp-8); overflow-x: auto; scrollbar-width: none; margin: 0 calc(var(--sp-12) * -1); padding: 0 var(--sp-12); }
  .pc { flex: none; width: 152px; display: flex; flex-direction: column; align-items: center; gap: var(--sp-4); padding: var(--sp-12) var(--sp-8); border-radius: var(--r-card); box-shadow: inset 0 0 0 1px var(--c-hairline); text-align: center; }
  .pc .btn { width: 100%; margin-top: var(--sp-4); }
  .pn { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .face { display: inline-flex; border-radius: var(--r-round); }
  .gcover { display: block; aspect-ratio: 2.4 / 1; border-radius: var(--r-card); overflow: hidden; background: linear-gradient(140deg, var(--c-ph-1), var(--c-ph-2)); }
  .grow { display: flex; align-items: center; gap: var(--sp-12); }
  .gt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--sp-2); }
  .faces { display: flex; align-items: center; gap: var(--sp-6); }
  .pile { display: inline-flex; }
  .pile > :global(.avatar + .avatar) { margin-left: calc(var(--sp-4) * -1); }
</style>
