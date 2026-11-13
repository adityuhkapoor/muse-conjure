/**
 * bun scripts/make-icons.ts: draws the app icons and the iOS launch images into public/ from one simple
 * mark (a speech bubble with a spark: neutral, ours, not a logo from any app). Headless Chromium renders the
 * SVG to PNG. Output is committed, so this only needs to run when the mark or colors change.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { root } from "./lib.ts";

const out = join(root, "public");
mkdirSync(join(out, "splash"), { recursive: true });

const BLUE = "#0866ff";
const LIGHT = "#ffffff";
const DARK = "#000000";

/** The mark on a 100 x 100 grid, centred, about 60 wide. `ink` is the bubble, `cut` the spark inside it. */
const mark = (ink: string, cut: string) => `
  <path fill="${ink}" d="M50 20c-16.6 0-30 11.6-30 26 0 8 4.1 15.2 10.6 20-.3 4.4-2 8.4-4.600 11.600 6.800-.600 12.400-3.200 16.200-6.400 2.600.600 5.200.800 7.800.800 16.600 0 30-11.600 30-26S66.600 20 50 20z"/>
  <path fill="${cut}" d="M50 33c1 7 3.500 9.500 11 10.500-7.500 1-10 3.500-11 10.500-1-7-3.500-9.500-11-10.500 7.500-1 10-3.500 11-10.500z"/>`;

const svg = (w: number, h: number, bg: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${bg}"/>${body}</svg>`;

/** A square icon: the mark scaled by `k` (1 = fills the artwork box), on a solid color. */
const icon = (size: number, k: number) => svg(size, size, BLUE, `<g transform="translate(${size / 2} ${size / 2}) scale(${(size / 100) * k}) translate(-50 -50)">${mark("#ffffff", BLUE)}</g>`);
/** A launch image: plain page color with the mark small in the middle. */
const splash = (w: number, h: number, dark: boolean) =>
  svg(w, h, dark ? DARK : LIGHT, `<g transform="translate(${w / 2} ${h / 2}) scale(${(Math.min(w, h) / 100) * 0.22}) translate(-50 -50)">${mark(BLUE, dark ? DARK : LIGHT)}</g>`);

const files: { name: string; w: number; h: number; svg: string }[] = [
  { name: "icon-192.png", w: 192, h: 192, svg: icon(192, 1) },
  { name: "icon-512.png", w: 512, h: 512, svg: icon(512, 1) },
  // maskable: the mark stays inside the central 80% circle (safe zone), the rest is flat color
  { name: "icon-maskable-192.png", w: 192, h: 192, svg: icon(192, 0.8) },
  { name: "icon-maskable-512.png", w: 512, h: 512, svg: icon(512, 0.8) },
  { name: "apple-touch-icon.png", w: 180, h: 180, svg: icon(180, 1) },
  { name: "favicon-32.png", w: 32, h: 32, svg: icon(32, 1.1) },
];

/** [css width, css height, pixel ratio]: every iPhone size that is still in use. */
export const IPHONES: [number, number, number][] = [
  [440, 956, 3], [402, 874, 3], [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3], [375, 812, 3], [414, 896, 3], [414, 896, 2], [375, 667, 2],
];
for (const [w, h, r] of IPHONES) for (const dark of [false, true]) files.push({ name: `splash/${w}x${h}@${r}-${dark ? "dark" : "light"}.png`, w: w * r, h: h * r, svg: splash(w * r, h * r, dark) });

writeFileSync(join(out, "icon.svg"), icon(512, 1).replace('width="512" height="512" ', ""));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
for (const f of files) {
  await page.setViewportSize({ width: f.w, height: f.h });
  await page.setContent(`<style>html,body{margin:0}svg{display:block}</style>${f.svg}`);
  await page.screenshot({ path: join(out, f.name), omitBackground: false });
}
await browser.close();
console.log(`wrote ${files.length} images and icon.svg to ${out}`);
