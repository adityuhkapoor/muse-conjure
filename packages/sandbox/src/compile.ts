// App source (TypeScript + JSX) to a browser module. Types are stripped and JSX goes through the
// @muse/app automatic runtime. Runs on the server/factory side; never in the shell.

import { transformSync } from "oxc-transform";

export class CompileError extends Error {}

export function compileApp(source: string, filename = "app.tsx"): { code: string; ms: number } {
  const t0 = performance.now();
  const r = transformSync(filename, source, {
    lang: "tsx",
    sourceType: "module",
    target: "es2022",
    jsx: { runtime: "automatic", importSource: "@muse/app" },
  });
  const errors = r.errors.filter((e) => e.severity === "Error");
  if (errors.length) throw new CompileError(errors.map((e) => e.codeframe ?? e.message).join("\n"));
  return { code: r.code, ms: performance.now() - t0 };
}
