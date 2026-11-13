// verifyPartial: the streaming-safe subset of the gate, for source that is still being written.
// It never throws on a syntax error at the cut-off. A small lexer finds where each line ends
// (inside which brackets, strings and templates), the source is cut back to the latest line where
// adding the missing closers gives a program that parses, and the static rules and copy rules run
// on that. The unparsed tail is scanned token by token for banned names, imports and color
// literals. Once the defineApp object literal is closed, its required parts are checked. When the
// whole prefix parses as it is, it is type-checked too (optional, about 5-30 ms warm).

import { findAppParts, lineOf, parse } from "./ast.ts";
import { fixFor } from "./rules.ts";
import { copyLint } from "./stages/copy.ts";
import { staticRules } from "./stages/static.ts";
import { typecheck } from "./stages/typecheck.ts";

export type PartialFinding = { rule: string; message: string; line: number; fix?: string; from: "parsed" | "tail" | "shape" | "types" };
export type PartialReport = {
  findings: PartialFinding[];
  /** Lines of the prefix the AST rules saw (the rest was only scanned). */
  parsedLines: number;
  lines: number;
  /** The prefix parsed with no closers added. */
  complete: boolean;
  ms: number;
};

const REQUIRED = ["name", "summary", "init", "reduce", "invariants", "arbitrary", "view"];
const TAIL_BANNED: [RegExp, string, string][] = [
  [/\b(Date|performance)\b/, "no-time", "time comes from meta.time"],
  [/\bMath\s*\.\s*random\b|\bcrypto\b/, "no-random", "randomness comes from rng(meta.seed)"],
  [/\b(setTimeout|setInterval|requestAnimationFrame|queueMicrotask|requestIdleCallback)\b/, "no-timers", "apps have no timers"],
  [/\b(fetch|XMLHttpRequest|WebSocket|EventSource|navigator)\b/, "no-network", "apps have no network access"],
  [/\b(localStorage|sessionStorage|indexedDB)\b/, "no-storage", "shared facts live in state"],
  [/\b(window|document|globalThis)\b/, "no-host-globals", "use only what @muse/app hands in"],
  [/\beval\s*\(|\bnew\s+Function\b/, "no-eval", "no code generation at run time"],
  [/\bIntl\b/, "no-intl", "Intl output depends on the device locale"],
];

type LineEnd = { stack: string[]; inStr: string | null; inBlock: boolean };

/** Bracket, string and template state at the end of every line. */
function scan(src: string): { ends: LineEnd[]; code: string[] } {
  const ends: LineEnd[] = [];
  const code: string[] = [];
  const stack: string[] = [];
  let str: string | null = null;
  let block = false;
  let cur = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!, n = src[i + 1];
    if (c === "\n") {
      if (str === "'" || str === '"') str = null; // unterminated: a JSX apostrophe, most likely
      ends.push({ stack: [...stack], inStr: str, inBlock: block });
      code.push(cur);
      cur = "";
      continue;
    }
    if (block) {
      if (c === "*" && n === "/") (block = false), i++;
      continue;
    }
    if (str) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (str === "`" && c === "$" && n === "{") {
        stack.push("${");
        str = null;
        i++;
        cur += "${";
        continue;
      }
      if (c === str) str = null;
      else cur += " ";
      if (!str) cur += c;
      continue;
    }
    if (c === "/" && n === "/") {
      const nl = src.indexOf("\n", i);
      i = (nl < 0 ? src.length : nl) - 1;
      continue;
    }
    if (c === "/" && n === "*") {
      block = true;
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      // An apostrophe between letters is JSX text ("You're in"), not a string.
      if (c === "'" && /[A-Za-z]/.test(src[i - 1] ?? "") && /[A-Za-z]/.test(n ?? "")) {
        cur += c;
        continue;
      }
      str = c;
      cur += c;
      continue;
    }
    if (c === "`") {
      str = "`";
      cur += c;
      continue;
    }
    if (c === "{" || c === "(" || c === "[") stack.push(c);
    else if (c === "}" || c === ")" || c === "]") {
      const top = stack.pop();
      if (top === "${") str = "`";
    }
    cur += c;
  }
  ends.push({ stack: [...stack], inStr: str, inBlock: block });
  code.push(cur);
  return { ends, code };
}

const CLOSE: Record<string, string> = { "{": "}", "(": ")", "[": "]", "${": "}`" };
function closers(e: LineEnd): string {
  let s = e.inBlock ? "*/" : "";
  if (e.inStr) s += e.inStr;
  for (let i = e.stack.length - 1; i >= 0; i--) s += CLOSE[e.stack[i]!]!;
  return s;
}



export async function verifyPartial(sourceSoFar: string, opts: { typecheck?: boolean } = {}): Promise<PartialReport> {
  const t0 = performance.now();
  const findings: PartialFinding[] = [];
  const lines = sourceSoFar.split("\n");
  let parsedLines = 0;
  let complete = false;
  let parsedSource = "";
  try {
    const { ends, code } = scan(sourceSoFar);
    // Candidates: the whole prefix, then each earlier line end, latest first.
    const tries: number[] = [lines.length];
    for (let k = lines.length - 1; k >= 1 && tries.length < 40; k--) if (/[,;{}()\]]\s*$|^\s*$/.test(lines[k - 1]!)) tries.push(k);
    for (const k of tries) {
      const head = k === lines.length ? sourceSoFar : lines.slice(0, k).join("\n");
      const end = ends[k - 1]!;
      const text = head + "\n" + closers(end) + (/=>\s*$|[=:]\s*$/.test(lines[k - 1] ?? "") ? " null" : "");
      const candidates = k === lines.length ? [sourceSoFar, text] : [text];
      for (const cand of candidates) {
        const { errors } = parse(cand);
        if (errors.length) continue;
        parsedLines = k;
        parsedSource = cand;
        complete = cand === sourceSoFar;
        break;
      }
      if (parsedSource) break;
    }
    if (parsedSource) {
      const st = staticRules(parsedSource, { maxSourceBytes: 1 << 30 });
      for (const f of [...st.failures])
        if (f.rule !== "app-shape" && f.rule !== "syntax" && (f.line ?? 0) <= parsedLines) findings.push({ rule: f.rule, message: f.message, line: f.line ?? parsedLines, from: "parsed" });
      const cp = copyLint(parsedSource);
      for (const f of cp.failures) if ((f.line ?? 0) <= parsedLines) findings.push({ rule: f.rule, message: f.message, line: f.line ?? parsedLines, from: "parsed" });
      // The defineApp object, once closed in what was written: every required part.
      const { program } = parse(parsedSource);
      const { def, parts } = findAppParts(program);
      const cutLen = complete ? sourceSoFar.length : lines.slice(0, parsedLines).join("\n").length;
      if (def && def.end <= cutLen) {
        for (const p of REQUIRED)
          if (!parts.has(p))
            findings.push({ rule: "missing-part", message: `defineApp({ ... }) is closed but has no \`${p}\``, line: lineOf(parsedSource, def.end - 1), from: "shape" });
      }
    }
    // The tail the parser did not see: tokens only.
    for (let i = parsedLines; i < code.length; i++) {
      const line = code[i]!;
      const raw = lines[i] ?? "";
      for (const [re, rule, why] of TAIL_BANNED) {
        const m = line.match(re);
        if (m) findings.push({ rule, message: `\`${m[0]}\` is not allowed: ${why}`, line: i + 1, from: "tail" });
      }
      const imp = raw.match(/^\s*import\b.*from\s*["']([^"']+)["']/);
      if (imp && imp[1] !== "@muse/app" && !imp[1]!.startsWith("@muse/library/"))
        findings.push({ rule: "imports-allowed", message: `import "${imp[1]}" is not allowed; apps import only @muse/app and @muse/library/*`, line: i + 1, from: "tail" });
      const col = raw.match(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(/);
      if (col && /["'`]/.test(raw) && !/userContent\(/.test(raw))
        findings.push({ rule: "no-hex-color", message: `color literal "${col[0]}": take colors from theme.color or userColor(member, theme)`, line: i + 1, from: "tail" });
    }
    if (complete && opts.typecheck !== false) {
      const tc = await typecheck(sourceSoFar, new Set());
      for (const f of tc.failures) findings.push({ rule: f.rule, message: f.message, line: f.line ?? 1, from: "types" });
    }
  } catch {
    // Never throw on a prefix: report what was found so far.
  }
  const seen = new Set<string>();
  const out = findings.filter((f) => {
    const k = `${f.rule}|${f.line}|${f.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    f.fix = fixFor({ rule: f.rule, message: f.message, line: f.line });
    return true;
  });
  out.sort((a, b) => a.line - b.line);
  return { findings: out, parsedLines, lines: lines.length, complete, ms: Math.round((performance.now() - t0) * 100) / 100 };
}

