// Node side of the harness: bundles src/harness.ts and returns a host page that loads it.
// Server side only (uses Bun.build); the gate and the tests call it.
import { join } from "node:path";

let cached: Promise<string> | undefined;

/** The harness script (minified ESM). Built once per process. */
export function harnessJs(): Promise<string> {
  cached ??= (async () => {
    const r = await Bun.build({ entrypoints: [join(import.meta.dir, "harness.ts")], format: "esm", minify: true, target: "browser" });
    if (!r.success) throw new AggregateError(r.logs, "harness build failed");
    return await r.outputs[0]!.text();
  })();
  return cached;
}

/** A host page: #slot at `width`, the harness inline. `frameUrl` loads frames from another origin. */
export async function hostHtml(o: { frameUrl?: string; width?: number } = {}): Promise<string> {
  const js = (await harnessJs()).replace(/<\/(script)/gi, "<\\/$1");
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>Host</title><meta name="viewport" content="width=device-width"></head>` +
    `<body style="margin:0;background:#F2F4F7"><div id="slot" style="width:${o.width ?? 390}px"></div>` +
    `<script type="module">${js}\nwindow.H.frameUrl=${JSON.stringify(o.frameUrl ?? "")};window.ready=true;</script></body></html>`
  );
}
