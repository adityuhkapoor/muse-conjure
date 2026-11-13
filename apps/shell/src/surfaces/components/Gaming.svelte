<script lang="ts">
  import Cover from "../../components/Cover.svelte";
  import Avatar from "../../components/Avatar.svelte";
  import Icon from "../../components/Icon.svelte";
  import MuseMark from "../../components/MuseMark.svelte";
  import { ui } from "../../lib/ui.svelte";
  import { GAMES } from "../data";
  import { playWithGroup, who } from "../flows.svelte";
  import PageBar from "./PageBar.svelte";
  import GamingCatalysts from "../../muse/components/GamingCatalysts.svelte"; // catalysts

  /** Gaming (MP section 6 tiles, kept small): games your groups made with Muse, each group's standing, and "Play with a group". */
</script>

{#snippet list()}
  <div class="gm">
    <h2 class="fb-h2">Made by your groups</h2>
    <p class="fb-meta lead">Minis friends made in their chats</p>
    <ul class="tiles">
      {#each GAMES as g, i (g.id)}
        {#if i === 1}<li class="cat"><GamingCatalysts /></li>{/if}<!-- catalysts: after the first game, the trivia made for your group, the Muse field and offers (src/muse) -->
        <li class="tile fb-card">
          <div class="art c{g.color}">
            <span class="bg"><Cover id={g.art} kind="game" width={ui.desktop ? 346 : 369} alt="" /></span>
            <span class="gi" aria-hidden="true"><Icon name={g.piece === "wheel" ? "fbs_play" : "fbs_trophy"} /></span>
            <span class="gt">{g.title}</span>
            <span class="gs"><MuseMark size="var(--sp-14)" />Made with Muse</span>
          </div>
          <div class="body">
            <p class="lb"><strong>{g.group}</strong> · {g.line}</p>
            <p class="pl">
              <span class="pile" aria-hidden="true">{#each g.players as p (p)}<Avatar person={who(p)} size="var(--avatar-facepile-sm)" ring />{/each}</span>
              <span class="fb-meta">{g.players.length} played</span>
            </p>
            <button class="btn primary play" onclick={() => playWithGroup(g)}>Play with a group</button>
          </div>
        </li>
      {/each}
    </ul>
  </div>
{/snippet}

{#if ui.desktop}
  <section class="desk" aria-label="Gaming">{@render list()}</section>
{:else}
  <section class="fb-page" aria-label="Gaming">
    <PageBar title="Gaming" />
    <div class="fb-scroll">{@render list()}</div>
  </section>
{/if}

<style>
  .gm { padding: var(--sp-16) var(--sp-12) var(--sp-32); }
  .lead { margin-top: var(--sp-2); }
  .tiles { margin-top: var(--sp-12); display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--sp-12); }
  :global(:root[data-layout="desktop"]) .tiles { grid-template-columns: repeat(auto-fill, minmax(calc(var(--mp-card-w) + var(--sp-80)), 1fr)); }
  .tile { border-radius: var(--r-card); overflow: hidden; box-shadow: var(--sh-card); border-bottom: 0; }
  .art { position: relative; height: var(--game-tile-art-h); padding: var(--sp-12); display: flex; flex-direction: column; justify-content: flex-end; gap: var(--sp-2); color: var(--c-white); background: var(--c-game-1); }
  .art.c2 { background: var(--c-game-2); }
  .art.c3 { background: var(--c-game-3); }
  .bg { position: absolute; inset: 0; }
  .bg::after { content: ""; position: absolute; inset: 0; background: linear-gradient(transparent 25%, var(--c-media-scrim) 70%, var(--c-media-chip)); }
  .gt, .gs { position: relative; text-shadow: 0 1px var(--sp-4) var(--c-media-scrim); }
  .gi { position: absolute; top: var(--sp-12); left: var(--sp-12); width: var(--sp-40); height: var(--sp-40); border-radius: var(--r-button); background: var(--c-media-chip); display: inline-flex; align-items: center; justify-content: center; --icon-size: var(--sp-24); }
  .gt { font-size: var(--fs-price); line-height: var(--lh-price); font-weight: var(--fw-semibold); }
  .gs { display: inline-flex; align-items: center; gap: var(--sp-4); font-size: var(--fs-meta); line-height: var(--lh-meta); }
  .body { padding: var(--sp-12); display: flex; flex-direction: column; gap: var(--sp-8); }
  .lb { font-size: var(--fs-fb-body); line-height: var(--lh-fb-body); }
  .lb strong { font-weight: var(--fw-semibold); }
  .pl { display: flex; align-items: center; gap: var(--sp-8); }
  .pile { display: inline-flex; }
  .pile > :global(.avatar + .avatar) { margin-left: calc(var(--sp-4) * -1); }
  .play { width: 100%; }
  .cat { grid-column: 1 / -1; } /* catalysts */
  .desk { height: 100%; overflow-y: auto; }
  .desk .gm { width: min(var(--event-col-w), 100%); margin: 0 auto; }
</style>
