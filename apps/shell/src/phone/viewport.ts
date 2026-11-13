/**
 * Keyboard and insets. While the on-screen keyboard is up the visual viewport is shorter than the layout
 * viewport (iOS and Android Chrome with interactive-widget=resizes-visual), and iOS also pans it. So the
 * app box (#app) is sized to the visual viewport and moved to its top: the composer then sits on the
 * keyboard with no gap, and the list stays at the bottom if it was there.
 */
const KEYBOARD_MIN = 120; // px of lost height before we call it a keyboard (browser bars are smaller)

function activeList(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-route="chat"]:not([inert]) .list, .panel:not(.info) .list');
}

export function initViewport(): void {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let raf = 0;

  const apply = () => {
    raf = 0;
    const lost = window.innerHeight - vv.height;
    const up = lost > KEYBOARD_MIN;
    const was = root.dataset.kb === "1";
    const list = activeList();
    const atBottom = !!list && list.scrollHeight - list.scrollTop - list.clientHeight < 48;
    if (up) {
      root.dataset.kb = "1";
      root.style.setProperty("--vvh", `${vv.height}px`);
      root.style.setProperty("--vvt", `${vv.offsetTop}px`);
      root.style.setProperty("--kb", `${lost - vv.offsetTop}px`);
    } else if (was) {
      delete root.dataset.kb;
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vvt");
      root.style.setProperty("--kb", "0px");
    }
    if ((up || was) && list && atBottom) list.scrollTop = list.scrollHeight;
    if (up) keepFocusVisible();
  };
  const schedule = () => {
    // Apply now (no gap on the first frame), then once more after layout settles.
    apply();
    if (!raf) raf = requestAnimationFrame(apply);
  };
  vv.addEventListener("resize", schedule);
  vv.addEventListener("scroll", schedule);
  addEventListener("orientationchange", schedule);
  addEventListener("focusin", () => setTimeout(keepFocusVisible, 350), { passive: true });
  addEventListener("blur", () => setTimeout(keepFocusVisible, 350), { passive: true }); // focus moved into a frame
}

/** An input inside a sheet, or a tool's frame in the list, must not end up behind the keyboard. */
function keepFocusVisible(): void {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return;
  if (el.tagName === "IFRAME" || (el.matches("input, textarea, select, [contenteditable]") && el.closest("[data-sheet]"))) {
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

