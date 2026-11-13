// bun services/demo/check-seed.ts: every seeded tool, built as the seeder builds it, through the
// whole gate; then the friends' moves replayed through its reducer, so a move that changes
// nothing (a no-op the tool ignored) fails here instead of looking idle in the demo. Exit 1 on any.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { verify, shutdown } from "@muse/verify";
import { compileApp } from "@muse/sandbox/compile";
import { sourceOf } from "./premade.ts";
import { chatMembers, paramsOf, TOOLS } from "./seed.ts";

type App = { init: (c: unknown) => unknown; reduce: (s: unknown, a: unknown, m: unknown, c: unknown) => unknown; summary?: (s: unknown, c: unknown) => string };
const dir = mkdtempSync(join(import.meta.dir, ".check-"));
let bad = 0;
try {
  for (const [id, t] of Object.entries(TOOLS)) {
    const source = await sourceOf({ tool: t.tool, params: await paramsOf(t) });
    const r = await verify(source);
    const f = r.failures[0];
    let note = r.ok ? "" : `${r.stage} ${f?.rule ?? ""}: ${f?.message?.slice(0, 200) ?? ""}`;
    if (r.ok) {
      const file = join(dir, `${id}.js`);
      writeFileSync(file, compileApp(source).code);
      const app = ((await import(file)) as { default: App }).default;
      const ctx = { room: `tool:${id}`, members: chatMembers(id) };
      let s = app.init(ctx);
      for (const [i, a] of t.acts.entries()) {
        const n = app.reduce(s, a.action, { seq: i + 1, user: a.user, time: 1_700_000_000_000 + i * 60_000, seed: 7 + i }, ctx);
        if (JSON.stringify(n) === JSON.stringify(s)) note ||= `move ${i + 1} by ${a.user} changed nothing: ${JSON.stringify(a.action)}`;
        s = n;
      }
      note = note ? `NOOP ${note}` : `"${app.summary?.(s, ctx) ?? ""}"`;
    }
    if (!r.ok || note.startsWith("NOOP")) bad++;
    console.log(`${r.ok && !note.startsWith("NOOP") ? "ok  " : "FAIL"} ${id.padEnd(14)} ${t.tool.padEnd(22)} ${note}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
await shutdown?.();
process.exit(bad ? 1 : 0);
