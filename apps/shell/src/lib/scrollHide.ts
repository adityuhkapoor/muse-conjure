/**
 * iOS-style top bar: hides on scroll down, reveals the instant you scroll up, always shown within
 * a few px of the top. The header animates with transform (data-hide), so it must be taken out of
 * flow (position: absolute/fixed) with the scroll container's own top padding reserving its space.
 */
export function scrollHide(header: HTMLElement, scroller: HTMLElement) {
  let last = scroller.scrollTop;
  function onScroll() {
    const top = scroller.scrollTop;
    const dy = top - last;
    if (top <= 4) delete header.dataset.hide;
    else if (dy > 4) header.dataset.hide = "1";
    else if (dy < -4) delete header.dataset.hide;
    last = top;
  }
  scroller.addEventListener("scroll", onScroll, { passive: true });
  return { destroy: () => scroller.removeEventListener("scroll", onScroll) };
}
