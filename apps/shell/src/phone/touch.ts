/**
 * Touch behaviour that CSS cannot do: no document drag or pinch, keep the keyboard up on send,
 * tap the list to dismiss it, haptics on Android.
 */
import { isAndroid as android } from "./env";

/** A short tick for long-press. Android only: iOS Safari has no vibrate. */
export function haptic(ms = 12): void {
  if (android) navigator.vibrate?.(ms);
}

/** True when `el` or an ancestor can scroll vertically right now. */
function scrollable(el: Element | null): boolean {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 1) return true;
  }
  return false;
}

export function initTouch(): void {
  // The page never moves: a touch that is not on something scrollable is swallowed (iOS ignores overscroll-behavior in older versions).
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length > 1 || !scrollable(e.target as Element)) e.preventDefault();
    },
    { passive: false },
  );
  // Safari pinch.
  for (const t of ["gesturestart", "gesturechange"]) document.addEventListener(t, (e) => e.preventDefault());

  // Tapping the send button must not take focus from the field, or the keyboard drops.
  document.addEventListener("mousedown", (e) => {
    if ((e.target as Element).closest?.(".composer button")) e.preventDefault();
  });
  // Tapping the message list puts the keyboard away.
  document.addEventListener("click", (e) => {
    const t = e.target as Element;
    const a = document.activeElement;
    if (a instanceof HTMLElement && a.matches("textarea, input") && t.closest(".list") && !t.closest("button, a, [data-muse-card]")) a.blur();
  });
  // No long-press menu on chrome (the reaction bar is ours). Fields keep theirs.
  document.addEventListener("contextmenu", (e) => {
    if (!(e.target as Element).closest?.("textarea, input")) e.preventDefault();
  });
}
