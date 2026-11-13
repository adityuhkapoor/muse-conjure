<script lang="ts">
  import Icon from "../../components/Icon.svelte";
  import MuseMark from "../../components/MuseMark.svelte";
  import { nav } from "../../lib/nav.svelte";
  import { catalyst } from "../catalyst.svelte";
  import { timedOffers, type Timed } from "../timed";

  /**
   * Timed, unprompted offers (muse/timed.ts), only when switched on. `place="home"`: one quiet card
   * under the composer. `place="notifications"`: rows at the top of Notifications.
   */
  let { place, onpick }: { place: "home" | "notifications"; onpick?: () => void } = $props();
  const items = $derived(catalyst.unprompted ? timedOffers(catalyst.quiet) : []);

  function open(t: Timed) {
    onpick?.();
    if (t.go === "event") {
      nav.go({ kind: "event", id: t.ctx.object.id });
      return;
    }
    catalyst.hush(t.id);
    catalyst.take(t.ctx, t);
  }
</script>

{#if items.length}
  {#if place === "home"}
    <section class="card fb-card" aria-label="Coming up" data-unprompted>
      <h2 class="fb-section head">Coming up</h2>
      <ul>
        {#each items.slice(0, 2) as t (t.id)}
          <li class="row">
            <button class="go" onclick={() => open(t)}>
              <span class="when">{t.when}</span>
              <span class="lab">{t.label}</span>
              <span class="det">{t.detail}</span>
            </button>
            <button class="x" aria-label="Not now" onclick={() => catalyst.hush(t.id)}><Icon name="close" /></button>
          </li>
        {/each}
      </ul>
    </section>
  {:else}
    <ul data-unprompted>
      {#each items as t (t.id)}
        <li class="nrow">
          <button class="nbtn" onclick={() => open(t)}>
            <span class="av"><MuseMark size="var(--sp-28)" /></span>
            <span class="txt">
              <span class="line"><strong>{t.label}</strong> · {t.detail}</span>
              <span class="time">{t.when}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
{/if}

<style>
  .card { padding: var(--sp-12); display: flex; flex-direction: column; gap: var(--sp-8); }
  .head { color: var(--c-text); }
  ul { display: flex; flex-direction: column; gap: var(--sp-6); }
  .row { display: flex; align-items: stretch; border-radius: var(--r-button); background: var(--c-field); }
  .go { flex: 1; min-width: 0; min-height: var(--hit); display: flex; flex-direction: column; align-items: flex-start; padding: var(--sp-8) var(--sp-4) var(--sp-8) var(--sp-12); text-align: left; }
  .go:active { background: var(--c-pressed); }
  .when { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-link); font-weight: var(--fw-semibold); }
  .lab { font-size: var(--fs-btn); line-height: var(--lh-btn); font-weight: var(--fw-semibold); color: var(--c-text); }
  .det { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
  .lab, .det { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .x { width: var(--hit); flex: none; display: inline-flex; align-items: center; justify-content: center; color: var(--c-text-2); --icon-size: var(--sp-16); }
  .nbtn { width: 100%; display: flex; align-items: center; gap: var(--sp-12); padding: var(--sp-8); border-radius: var(--r-button); text-align: left; }
  .nbtn:active { background: var(--c-hover); }
  :global(:root[data-layout="desktop"]) .nbtn:hover { background: var(--c-hover); }
  .av { flex: none; width: var(--notif-avatar); height: var(--notif-avatar); border-radius: var(--r-round); background: var(--c-field); display: inline-flex; align-items: center; justify-content: center; }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .line { font-size: var(--fs-fb-body); line-height: var(--lh-fb-body); color: var(--c-text); }
  .line strong { font-weight: var(--fw-semibold); }
  .time { font-size: var(--fs-meta); line-height: var(--lh-meta); color: var(--c-text-2); }
</style>
