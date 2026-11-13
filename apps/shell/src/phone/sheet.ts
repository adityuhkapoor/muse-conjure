/**
 * Sheets on the phone look: a leaving sheet plays its exit before it is removed, and dragging a sheet down
 * dismisses it (rubber-bands upward, goes on a fast flick or past a third of its height, else springs back).
 */
import { tokenMs as ms } from "./motion";

/** How long the exit takes (0 on desktop). */
export const exitMs = (): number => ms("--m-sheet-out-dur");

type Opts = { leave: () => void; enabled: () => boolean };

export function sheetDrag(panel: HTMLElement, opts: Opts) {
  const phone = () => document.documentElement.dataset.layout !== "desktop" && opts.enabled();
  const scrimEl = () => panel.parentElement!;
  let y0 = 0;
  let y = 0;
  let t0 = 0;
  let vy = 0; // px per ms, positive is down
  let active = false;
  let pid = 0;
  let h = 1;

  // A sheet whose content fits does not scroll, so a drag anywhere on it is ours.
  const fit = () => panel.scrollHeight <= panel.clientHeight + 1;
  queueMicrotask(() => fit() && panel.setAttribute("data-fit", ""));

  const rubber = (d: number) => 120 * (1 - 1 / ((d * 0.55) / 120 + 1)); // upward pull resists

  function down(e: PointerEvent) {
    if (!phone() || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (!(e.target as Element).closest(".handle") && !(fit() || panel.scrollTop === 0)) return;
    if ((e.target as Element).closest("input, textarea, select")) return;
    y0 = y = e.clientY;
    t0 = e.timeStamp;
    vy = 0;
    h = panel.offsetHeight;
    active = false;
    pid = e.pointerId;
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", cancel);
  }
  function move(e: PointerEvent) {
    const dy = e.clientY - y0;
    if (!active) {
      if (Math.abs(dy) < 6) return;
      active = true;
      panel.setPointerCapture(pid); // only now: a plain tap must still reach its button
      panel.style.animation = "none";
      panel.style.willChange = "transform";
    }
    vy = 0.6 * vy + 0.4 * ((e.clientY - y) / Math.max(1, e.timeStamp - t0));
    y = e.clientY;
    t0 = e.timeStamp;
    const shown = dy >= 0 ? dy : -rubber(-dy);
    panel.style.transform = `translate3d(0, ${shown}px, 0)`;
    scrimEl().style.setProperty("--dim", String(Math.max(0, 1 - Math.max(0, dy) / h)));
  }
  function stop() {
    removeEventListener("pointermove", move);
    removeEventListener("pointerup", up);
    removeEventListener("pointercancel", cancel);
  }
  const anim = (to: number, from: number, dur: number, ease: string, done: () => void) => {
    const a = panel.animate([{ transform: `translate3d(0, ${from}px, 0)` }, { transform: `translate3d(0, ${to}px, 0)` }], { duration: dur, easing: ease, fill: "forwards" });
    a.onfinish = done;
  };
  function up(e: PointerEvent) {
    stop();
    if (!active) return;
    const dy = e.clientY - y0;
    const go = dy > h / 3 || vy > 0.6;
    const cs = getComputedStyle(document.documentElement);
    if (go) {
      const left = Math.max(0, h - dy);
      const dur = Math.max(120, Math.min(ms("--m-sheet-out-dur"), vy > 0.2 ? left / vy : 1e9));
      scrimEl().classList.add("leaving-by-drag");
      scrimEl().style.setProperty("--dim", "0");
      anim(h, Math.max(0, dy), dur, cs.getPropertyValue("--m-sheet-out-ease") || "ease-out", opts.leave);
    } else {
      anim(0, Math.max(0, dy) || -rubber(-dy), ms("--m-sheet-dur"), cs.getPropertyValue("--m-sheet-ease") || "ease-out", () => {
        panel.style.cssText = panel.style.cssText.replace(/transform:[^;]*;?|animation:[^;]*;?/g, "");
        panel.getAnimations().forEach((a) => a.cancel());
        scrimEl().style.setProperty("--dim", "1");
      });
    }
  }
  function cancel() {
    stop();
    if (active) {
      panel.style.transform = "";
      panel.style.animation = "";
      scrimEl().style.setProperty("--dim", "1");
    }
  }
  panel.addEventListener("pointerdown", down);
  return { destroy: () => (panel.removeEventListener("pointerdown", down), stop()) };
}
