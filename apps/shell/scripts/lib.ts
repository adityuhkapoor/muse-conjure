import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { build } from "vite";
import { chromium, type Browser } from "playwright";

export const root = resolve(import.meta.dirname, "..");
export const dist = join(root, "dist");
/** assets/img (object photos) and assets/people (the three team members), served at /media/ like the demo gateway does. */
export const media = resolve(root, "../../assets");

export async function buildApp(): Promise<void> {
  await build({ root, logLevel: "warn" });
}

/** Prints raw and gzip bytes of every built JS and CSS file. */
export function reportSizes(): { js: number; css: number; jsGz: number; cssGz: number } {
  const total = { js: 0, css: 0, jsGz: 0, cssGz: 0 };
  const dir = join(dist, "assets");
  for (const f of readdirSync(dir)) {
    const buf = readFileSync(join(dir, f));
    const gz = gzipSync(buf).length;
    if (f.endsWith(".js")) (total.js += buf.length), (total.jsGz += gz);
    if (f.endsWith(".css")) (total.css += buf.length), (total.cssGz += gz);
  }
  const kb = (n: number) => `${(n / 1024).toFixed(1)} kB`;
  console.log(`built size: js ${kb(total.js)} (gzip ${kb(total.jsGz)}), css ${kb(total.css)} (gzip ${kb(total.cssGz)})`);
  return total;
}

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
};

/** Static server for dist on a random localhost port. */
export async function serve(): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    if (path.startsWith("/media/")) {
      const img = join(media, path.slice(7));
      if (!(img.startsWith(join(media, "img") + "/") || img.startsWith(join(media, "people") + "/")) || !existsSync(img)) return void res.writeHead(404).end();
      res.writeHead(200, { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable" });
      return void createReadStream(img).pipe(res);
    }
    let file = join(dist, path === "/" ? "index.html" : path);
    if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, "index.html");
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}/`, close: () => new Promise((ok) => server.close(() => ok())) };
}

/** Always headless. Playwright picks chrome-headless-shell for headless launches. */
export function launch(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

export const PHONE = { width: 393, height: 852 };
export const DESKTOP = { width: 1512, height: 860 };
