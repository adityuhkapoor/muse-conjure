// Stage 1: type-check against @muse/app with native TypeScript 7.
//
// Fast path: TypeScript 7.1's programmatic API (`typescript/async`), one long-lived tsc process.
// A base snapshot holds a program over a virtual app file; each check derives a new snapshot with
// a filesystem layer that replaces that one file, so lib and @muse/app stay parsed and bound.
// (`typescript/sync` does not run under Bun 1.3: it reads `stdout._handle.fd`, a Node internal.)
// Fallback: one-shot `tsc --noEmit` on a temp project, about 10x slower.

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Failure } from "../report.ts";

const ROOT = join(import.meta.dir, "../..");
// Never written to disk: it exists only in the snapshot's filesystem layer.
const VIRTUAL = join(ROOT, ".virtual/app.tsx");
const REAL_APP = join(ROOT, "../app/src/index.ts");

export const COMPILER_OPTIONS = {
  strict: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  target: "es2023",
  module: "esnext",
  moduleResolution: "bundler",
  lib: ["es2023", "dom", "dom.iterable"],
  jsx: "react-jsx",
  jsxImportSource: "@muse/app",
  allowImportingTsExtensions: true,
  verbatimModuleSyntax: true,
  isolatedModules: true,
  noEmit: true,
  skipLibCheck: true,
  types: [] as string[],
};

function rootFiles(): string[] {
  if (!existsSync(REAL_APP)) throw new Error(`@muse/app not found at ${REAL_APP}`);
  return [VIRTUAL];
}

type Diag = { code: number; text: string; line: number };

interface Checker {
  readonly kind: "api" | "cli";
  check(source: string): Promise<Diag[]>;
  close(): void;
}

class ApiChecker implements Checker {
  readonly kind = "api" as const;
  private chain: Promise<unknown> = Promise.resolve();
  private constructor(
    private api: any,
    private base: any,
    private programId: unknown,
    private options: unknown,
  ) {}

  static async create(): Promise<ApiChecker> {
    const { API } = await import("typescript/async");
    const api = new API({ cwd: ROOT });
    const parsed: any = await api.parseJsonConfigFileContent({ compilerOptions: COMPILER_OPTIONS }, { configDirectory: ROOT });
    const seed = 'import { defineApp } from "@muse/app";\nexport default defineApp;\n';
    const snap: any = await api.createSnapshot({
      fileSystem: { kind: "layer", files: { [VIRTUAL]: seed } },
      createPrograms: [{ rootFiles: rootFiles(), compilerOptions: parsed.options }],
    } as any);
    const prog = snap.operation.createdPrograms[0];
    await prog.getSemanticDiagnostics(VIRTUAL); // warm the checker on lib + @muse/app
    return new ApiChecker(api, snap, prog.id, parsed.options);
  }

  check(source: string): Promise<Diag[]> {
    const run = async () => {
      // Synthetic programs do not see a plain filesystem layer change; reconfiguring the program
      // with the same id does, and reuses the parsed lib and @muse/app files (sub-millisecond).
      const snap: any = await this.base.update({
        fileSystem: { kind: "layer", files: { [VIRTUAL]: source } },
        reconfigurePrograms: [{ id: this.programId, rootFiles: rootFiles(), compilerOptions: this.options }],
      } as any);
      try {
        const prog = snap.getProgram(this.programId);
        const [syn, sem] = await Promise.all([prog.getSyntacticDiagnostics(VIRTUAL), prog.getSemanticDiagnostics(VIRTUAL)]);
        return [...syn, ...sem].map(
          (d: any): Diag => ({ code: d.code, text: flatten(d), line: (d.startPosition?.line ?? 0) + 1 }),
        );
      } finally {
        await snap.dispose();
      }
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  }

  close() {
    try {
      this.api.close();
    } catch {}
  }
}

function flatten(d: any): string {
  let t = String(d.text ?? d.messageText ?? "");
  for (const c of d.messageChain ?? d.chain ?? []) t += " " + flatten(c);
  return t;
}

export class CliChecker implements Checker {
  readonly kind = "cli" as const;
  async check(source: string): Promise<Diag[]> {
    // Inside the package, so `@muse/app` resolves through its node_modules.
    const dir = mkdtempSync(join(ROOT, ".tc-"));
    try {
      writeFileSync(join(dir, "app.tsx"), source);
      const files = rootFiles().map((f) => (f === VIRTUAL ? join(dir, "app.tsx") : f));
      writeFileSync(
        join(dir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: COMPILER_OPTIONS, files }),
      );
      const tsc = join(ROOT, "node_modules/.bin/tsc");
      const p = Bun.spawnSync([tsc, "--noEmit", "-p", join(dir, "tsconfig.json"), "--pretty", "false"], { cwd: ROOT });
      const out = p.stdout.toString() + p.stderr.toString();
      const diags: Diag[] = [];
      for (const m of out.matchAll(/app\.tsx\((\d+),\d+\): error TS(\d+): (.*)/g))
        diags.push({ line: Number(m[1]), code: Number(m[2]), text: m[3]! });
      return diags;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  close() {}
}

let shared: Promise<Checker> | undefined;

export function getChecker(): Promise<Checker> {
  return (shared ??= ApiChecker.create().catch((e) => {
    console.error(`verify: TypeScript API unavailable (${(e as Error).message}); using tsc CLI`);
    return new CliChecker() as Checker;
  }));
}

export async function closeChecker() {
  const c = await shared;
  c?.close();
  shared = undefined;
}

/** Codes for names and modules the static stage explains better (it reports them with its own rule). */
const DEFER_TO_STATIC = new Set([2304, 2307, 2792, 2580, 2591, 2582, 2867, 2868]);

export async function typecheck(source: string, staticLines: Set<number>): Promise<{ failures: Failure[]; via: string }> {
  const c = await getChecker();
  const diags = await c.check(source);
  const failures: Failure[] = [];
  for (const d of diags) {
    if (DEFER_TO_STATIC.has(d.code) && staticLines.has(d.line)) continue;
    failures.push({ rule: "type-error", message: `TS${d.code}: ${d.text}`, line: d.line });
  }
  return { failures, via: c.kind };
}
