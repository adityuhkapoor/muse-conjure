// Two origins on localhost: the host page (shell stand-in, src/harness.ts) and the frame
// document. Used by the bridge test and the measure script. Headless browsers only.

import { join } from "node:path";
import { readdirSync } from "node:fs";
import { chromium, webkit, type Browser, type Page } from "playwright";
import { compileApp } from "../src/compile.ts";
import { frameHtml } from "../src/frame-html.ts";
import { hostHtml } from "../src/harness-build.ts";
import { build } from "./build.ts";

const root = join(import.meta.dir, "..");
export const examplesDir = join(root, "../app/examples");
export const exampleNames = readdirSync(examplesDir)
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => f.replace(/\.tsx$/, ""))
  .sort();

export type Servers = { host: string; frame: string; stop(): void; apps: Record<string, { source: string; code: string }> };

export async function startServers(): Promise<Servers> {
  const sizes = await build();
  const apps: Servers["apps"] = {};
  for (const n of exampleNames) {
    const source = await Bun.file(join(examplesDir, n + ".tsx")).text();
    apps[n] = { source, code: compileApp(source, n + ".tsx").code };
  }
  const html = frameHtml();
  const frame = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }),
  });
  const frameUrl = `http://127.0.0.1:${frame.port}/frame.html`;
  const page = await hostHtml({ frameUrl });
  const host = Bun.serve({
    port: 0,
    hostname: "localhost",
    fetch(req) {
      const u = new URL(req.url);
      if (u.pathname === "/apps.json") return Response.json(Object.fromEntries(Object.entries(apps).map(([k, v]) => [k, v.code])));
      if (u.pathname === "/sizes.json") return Response.json(sizes);
      return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
    },
  });
  return {
    host: `http://localhost:${host.port}/`,
    frame: frameUrl,
    apps,
    stop() {
      host.stop(true);
      frame.stop(true);
    },
  };
}

/** Headless only: chromium runs chrome-headless-shell; nothing opens on screen. */
export async function launch(engine: "chromium" | "webkit" = "chromium"): Promise<Browser> {
  return (engine === "webkit" ? webkit : chromium).launch({ headless: true });
}

export async function openHost(browser: Browser, s: Servers, width = 390): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => console.error("host page error:", e.message));
  await page.goto(s.host);
  await page.waitForFunction(() => (window as any).ready === true);
  return page;
}
