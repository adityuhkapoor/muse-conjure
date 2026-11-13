// Mounts built tools the way the shell does: the checked-in frame runtime (@muse/sandbox's
// frame-js.gen.ts, which the shell ships, not the gate's runtime built from source), the cast as
// members with the names the shell sends, and the viewer as each of a few people (the author of
// a post included), at a phone width and at the desktop post width. A tool that throws or never
// reports a size is what the shell shows as "This tool didn't open". Used by check-pack.ts.

import { createRequire } from "node:module";
import type { Browser, Page } from "playwright";
import { hostHtml } from "@muse/sandbox/harness-build";
import { compileApp } from "@muse/sandbox/compile";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type Member = { id: string; name: string; avatar?: string };

/** A photo as the shell sends a real person's face (a data URI, lib/tool-avatar.ts), when the repo has one. */
function photo(): string | undefined {
  const dir = resolve(import.meta.dir, "../../assets/img/photo");
  const f = existsSync(dir) ? readdirSync(dir).find((x) => x.endsWith("-480.webp")) : undefined;
  return f ? `data:image/webp;base64,${readFileSync(join(dir, f)).toString("base64")}` : undefined;
}
export type MountResult = { ok: boolean; detail: string };

// playwright comes with the gate (@muse/verify), which check-pack already loads.
const { chromium } = createRequire(createRequire(import.meta.url).resolve("@muse/verify"))("playwright") as typeof import("playwright");

let browser: Promise<Browser> | null = null;
let page: Promise<Page> | null = null;

async function host(): Promise<Page> {
  browser ??= chromium.launch({ headless: true });
  page ??= (async () => {
    const p = await (await browser!).newPage({ viewport: { width: 1400, height: 1400 } });
    await p.setContent(await hostHtml({ width: 680 }));
    await p.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true);
    await p.evaluate(() => (window as unknown as { H: { makePool(n: number, o: object): Promise<string> } }).H.makePool(2, { srcdoc: true }));
    return p;
  })();
  return page;
}

/** Mount `source` once per viewer and width; ok when every mount reports a size with no error. */
export async function mountCheck(source: string, o: { members: Member[]; viewers: string[]; widths?: number[] }): Promise<MountResult> {
  let code: string;
  try {
    code = compileApp(source).code;
  } catch (e) {
    return { ok: false, detail: `compile: ${(e as Error).message.slice(0, 160)}` };
  }
  const p = await host();
  const face = photo();
  const members = o.members.map((m) => (face && !m.avatar ? { ...m, avatar: face } : m));
  for (const me of o.viewers) {
    for (const width of o.widths ?? [393, 656]) {
      const r = await p.evaluate(
        async ([code, me, members, width]) => {
          const H = (window as unknown as { H: any }).H;
          // First the drawn faces, then the photos arrive and the members are sent again (live-store refreshToolFaces).
          const m = await H.mount(code, { me, members: members.map(({ avatar, ...x }: { avatar?: string }) => x), width, mode: "dark" });
          if (m.sized >= 0) H.setMembers(m.id, members);
          await new Promise((res) => setTimeout(res, 400));
          const errors: string[] = H.state?.(m.id)?.errors ?? [];
          return { sized: m.sized, errors };
        },
        [code, me, members, width] as const,
      );
      if (r.sized < 0 || r.errors.length) return { ok: false, detail: `as ${me} at ${width}: ${r.errors[0] ?? "never reported a size"}` };
    }
  }
  return { ok: true, detail: "" };
}

export async function closeMountCheck() {
  if (browser) await (await browser).close();
  browser = page = null;
}
