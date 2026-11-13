// @muse/sandbox host API. compileApp lives in "@muse/sandbox/compile" (native, server side).
export { createPool, type Pool, type PoolOpts, type AppHandle, type MountOpts } from "./host.ts";
export { frameHtml, CSP, SANDBOX } from "./frame-html.ts";
export type { HostToFrame, FrameToHost, Mount } from "./protocol.ts";
