// The host page the render stage mounts apps in: the sandbox harness, with the frame runtime
// bundled from the current @muse/app and @muse/sandbox sources rather than the checked-in
// frame-js.gen.ts. The type-check stage reads @muse/app from source, so the render stage must too:
// otherwise an export added to @muse/app type-checks but fails to load in the frame.

import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const sandboxDir = dirname(createRequire(import.meta.url).resolve("@muse/sandbox/harness-build"));
let cached: Promise<string> | undefined;

async function bundle(entry: string, format: "iife" | "esm", plugins: Bun.BunPlugin[] = []): Promise<string> {
  const r = await Bun.build({ entrypoints: [entry], format, minify: true, target: "browser", plugins });
  if (!r.success) throw new AggregateError(r.logs, `bundling ${entry} failed`);
  return await r.outputs[0]!.text();
}

/** The harness script with a frame runtime built from source. Built once per process. */
export function harnessJs(): Promise<string> {
  cached ??= (async () => {
    const frame = await bundle(join(sandboxDir, "frame.ts"), "iife");
    const fresh: Bun.BunPlugin = {
      name: "fresh-frame",
      setup(b) {
        b.onLoad({ filter: /frame-js\.gen\.ts$/ }, () => ({ contents: `export const FRAME_JS = ${JSON.stringify(frame)};`, loader: "ts" }));
      },
    };
    return bundle(join(sandboxDir, "harness.ts"), "esm", [fresh]);
  })();
  return cached;
}

/** A host page: #slot at `width`, the harness inline. Same page as @muse/sandbox/harness-build. */
export async function hostHtml(o: { width?: number } = {}): Promise<string> {
  const js = (await harnessJs()).replace(/<\/(script)/gi, "<\\/$1");
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>Host</title><meta name="viewport" content="width=device-width"></head>` +
    `<body style="margin:0;background:#F2F4F7"><div id="slot" style="width:${o.width ?? 390}px"></div>` +
    `<script type="module">${js}\nwindow.H.frameUrl="";window.ready=true;</script></body></html>`
  );
}
