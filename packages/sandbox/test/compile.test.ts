import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { compileApp, CompileError } from "../src/compile.ts";

const dir = join(import.meta.dir, "../../app/examples");

test("compiles every sample to plain JS with the @muse/app JSX runtime", () => {
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".tsx"))) {
    const { code, ms } = compileApp(require("node:fs").readFileSync(join(dir, f), "utf8"), f);
    expect(code).toContain('from "@muse/app/jsx-runtime"');
    expect(code).not.toMatch(/\btype State\b|: State\b|<div/);
    expect(ms).toBeLessThan(50);
  }
});

test("syntax errors throw with a code frame", () => {
  expect(() => compileApp("export default defineApp({ view: () => <div> })")).toThrow(CompileError);
});
