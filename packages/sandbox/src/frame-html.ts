// The frame document: one self-contained HTML string with the runtime inlined.
import { FRAME_JS } from "./frame-js.gen.ts";

export const CSP =
  "default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'";
export const SANDBOX = "allow-scripts";

/** `build`: an id for this start of the server, told to the host in `ready` (see PoolOpts.build). */
export function frameHtml(js: string = FRAME_JS, build?: string): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}">` +
    (build ? `<meta name="muse-build" content="${build.replace(/[^\w.-]/g, "")}">` : "") +
    `<meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script>${js.replace(/<\/(script)/gi, "<\\/$1")}</script></body></html>`
  );
}
