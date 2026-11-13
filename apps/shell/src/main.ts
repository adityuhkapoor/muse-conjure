import "./app.css";
import { initPhone } from "./phone"; // phone: installed-app behaviour (see src/phone/index.ts)
import { mount } from "svelte";
import { needsIdentity, store } from "./store";
import type { LiveStore } from "./store/live-store.svelte";
import Picker from "./components/Picker.svelte";

initPhone();
const target = document.getElementById("app")!;

// The phone looks use Muse Sans. Wait for it (briefly) before the first render, so text does not
// move when it arrives; desktop uses the system stack and does not wait.
if (!matchMedia("(min-width: 1100px)").matches && "fonts" in document) {
  const faces = [400, 500, 600, 700].map((w) => document.fonts.load(`${w} 17px "Muse Sans"`));
  await Promise.race([Promise.all(faces), new Promise((r) => setTimeout(r, 800))]).catch(() => {});
}

if (needsIdentity) {
  mount(Picker, { target, props: { mode: "pick" } });
} else {
  if (store.live) {
    const live = store as LiveStore;
    await live.start();
    if (!live.chats.length) {
      // No server yet (or nothing seeded): say so and keep trying.
      const waiting = mount(Picker, { target, props: { mode: "connecting" } });
      while (!live.chats.length) await new Promise((r) => setTimeout(r, 300));
      const { unmount } = await import("svelte");
      unmount(waiting);
    }
  }
  // Imported late: navigation reads the store's chats when it loads.
  const { default: App } = await import("./App.svelte");
  mount(App, { target });
}
