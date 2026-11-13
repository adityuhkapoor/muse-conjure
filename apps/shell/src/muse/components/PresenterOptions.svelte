<script lang="ts">
  import Sheet from "../../components/Sheet.svelte";
  import { catalyst } from "../catalyst.svelte";

  /**
   * Presenter options, from the Prototype label: the switch for timed suggestions (off by
   * default, to test with people later), and the path each recent Muse request took.
   */
  const recent = $derived([...catalyst.paths].reverse().slice(0, 8));
  const path = (p: (typeof catalyst.paths)[number]) => (p.path === "premade" ? `Pre-made · ${p.tool ?? ""}` : p.path === "existing" ? "Already on the page" : "Factory · made for this page");
</script>

{#if catalyst.presenter}
  <Sheet label="Presenter options" onclose={() => (catalyst.presenter = false)}>
    <h2 class="title">Presenter options</h2>
    <label class="sw">
      <span class="txt">
        <span class="lab">Timed suggestions</span>
        <span class="det">Muse offers things from the calendar: an event this week, a trip a year ago, a poll that ended</span>
      </span>
      <input type="checkbox" role="switch" checked={catalyst.unprompted} onchange={(e) => catalyst.setUnprompted((e.currentTarget as HTMLInputElement).checked)} />
    </label>
    <h3 class="sec">Recent requests</h3>
    {#if recent.length}
      <ul class="paths" data-paths>
        {#each recent as p (p.at)}
          <li><span class="ask">{p.ask}</span><span class="det">{p.surface} · {path(p)}</span></li>
        {/each}
      </ul>
    {:else}
      <p class="det none">None yet</p>
    {/if}
  </Sheet>
{/if}

<style>
  .title { font-size: var(--fs-title); line-height: var(--lh-title); font-weight: var(--fw-bold); text-align: center; }
  .sw { margin-top: var(--sp-12); display: flex; align-items: center; gap: var(--sp-12); min-height: var(--hit); }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .lab { font-size: var(--fs-row-sub); line-height: var(--lh-row-sub); font-weight: var(--fw-semibold); }
  .det { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  input[role="switch"] { width: var(--sp-44); height: var(--sp-28); accent-color: var(--c-primary); flex: none; }
  .sec { margin-top: var(--sp-16); font-size: var(--fs-row-sub); line-height: var(--lh-row-sub); font-weight: var(--fw-semibold); }
  .paths { margin-top: var(--sp-6); display: flex; flex-direction: column; gap: var(--sp-8); }
  .paths li { display: flex; flex-direction: column; }
  .ask { font-size: var(--fs-row-sub); line-height: var(--lh-row-sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .none { margin-top: var(--sp-6); }
</style>
