/**
 * Token lint. Component CSS (every .css and every .svelte, outside src/tokens/) may not contain
 * raw colors (hex, rgb, rgba, hsl) or px / ms / s literals, except 0, +-1px hairlines and
 * percentages. `@media` and `@container` conditions are exempt because custom properties cannot
 * be used there. Usage: bun scripts/lint-tokens.ts [--self-test] [files...]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
export type Finding = { file: string; line: number; text: string; why: string };

function strip(src: string, isSvelte: boolean): string {
  let s = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  s = s.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
  if (isSvelte) s = s.replace(/<script[\s\S]*?<\/script>/g, (m) => m.replace(/[^\n]/g, " "));
  return s;
}

const RULES: { re: RegExp; why: (m: RegExpExecArray) => string | null }[] = [
  { re: /#[0-9a-fA-F]{3,8}\b/g, why: (m) => `raw hex color ${m[0]}` },
  { re: /\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch)\(/g, why: (m) => `raw color function ${m[0]}` },
  {
    re: /(?<![\w.#-])(-?\d*\.?\d+)px\b/g,
    why: (m) => {
      const n = Math.abs(Number(m[1]));
      return n === 0 || n === 1 ? null : `raw px literal ${m[0]}`;
    },
  },
  {
    re: /(?<![\w.#-])(-?\d*\.?\d+)(ms|s)\b/g,
    why: (m) => (Number(m[1]) === 0 ? null : `raw duration ${m[0]}`),
  },
];

export function lintText(file: string, src: string): Finding[] {
  const out: Finding[] = [];
  const text = strip(src, file.endsWith(".svelte"));
  text.split("\n").forEach((line, i) => {
    if (/^\s*@(media|container|supports)\b/.test(line)) return;
    const stripped = line;
    for (const { re, why } of RULES) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(stripped))) {
        const w = why(m);
        if (w) out.push({ file, line: i + 1, text: line.trim(), why: w });
      }
    }
  });
  return out;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(css|svelte)$/.test(name)) acc.push(p);
  }
  return acc;
}

function main() {
  const args = process.argv.slice(2);
  const selfTest = args.includes("--self-test");
  const files = args.filter((a) => !a.startsWith("--"));

  if (selfTest) {
    // The fixture must FAIL the lint. A lint that passes it proves nothing.
    const fixture = join(root, "scripts/fixtures/bad-component.svelte");
    const found = lintText(fixture, readFileSync(fixture, "utf8"));
    const needed = ["raw hex color", "raw color function", "raw px literal", "raw duration"];
    const missing = needed.filter((n) => !found.some((f) => f.why.startsWith(n)));
    if (missing.length) {
      console.error(`lint self-test FAILED: fixture was not flagged for: ${missing.join(", ")}`);
      process.exit(1);
    }
    const ok = join(root, "scripts/fixtures/ok-component.svelte");
    const clean = lintText(ok, readFileSync(ok, "utf8"));
    if (clean.length) {
      console.error("lint self-test FAILED: clean fixture was flagged:", clean);
      process.exit(1);
    }
    console.log(`lint self-test ok: bad fixture raised ${found.length} findings, clean fixture raised 0`);
    return;
  }

  const targets = files.length
    ? files.map((f) => resolve(f))
    : walk(join(root, "src")).filter((f) => !f.includes("/src/tokens/"));
  const findings = targets.flatMap((f) => lintText(relative(root, f), readFileSync(f, "utf8")));
  for (const f of findings) console.error(`${f.file}:${f.line}  ${f.why}\n    ${f.text}`);
  if (findings.length) {
    console.error(`\ntoken lint failed: ${findings.length} finding(s). Add or use a token in src/tokens/tokens.css.`);
    process.exit(1);
  }
  console.log(`token lint ok: ${targets.length} files, no raw colors, px or ms literals`);
}

if (import.meta.main) main();
