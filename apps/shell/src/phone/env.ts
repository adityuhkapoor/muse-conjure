/** What kind of device this is. Read once at load. */
const ua = navigator.userAgent;
export const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
export const isAndroid = /Android/.test(ua);
export const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const forced = new URLSearchParams(location.search).get("phone") === "1";
export const isPhone = forced || isIos || isAndroid || (matchMedia("(pointer: coarse)").matches && matchMedia("(max-width: 1099px)").matches);
