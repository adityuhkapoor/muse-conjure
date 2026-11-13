<script lang="ts">
  import { isIos, isAndroid, standalone } from "./env";

  /** One quiet hint, only in a phone browser tab, only once: dismissing (or installing) means it never returns. */
  const KEY = "phone.a2hs";
  const stored = () => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  };
  let show = $state(false);
  let prompt = $state.raw<(Event & { prompt(): Promise<unknown> }) | null>(null);

  function dismiss() {
    show = false;
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
  }

  $effect(() => {
    if (standalone || stored() || !(isIos || isAndroid)) return;
    addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      prompt = e as typeof prompt;
    });
    addEventListener("appinstalled", dismiss);
    const t = setTimeout(() => (show = true), 6000);
    return () => clearTimeout(t);
  });

  async function install() {
    if (prompt) {
      await prompt.prompt();
      dismiss();
    } else dismiss();
  }
</script>

{#if show}
  <aside class="toast" aria-label="Add to Home Screen">
    <p>
      {#if isIos}Tap Share, then Add to Home Screen, to open this like an app.
      {:else if prompt}Add this to your home screen to open it like an app.
      {:else}Open the browser menu, then Add to Home Screen, to open this like an app.{/if}
    </p>
    {#if prompt}<button onclick={install}>Add</button>{/if}
    <button onclick={dismiss} aria-label="Close">Close</button>
  </aside>
{/if}
