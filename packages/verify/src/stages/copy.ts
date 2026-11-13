// Stage 7: copy lint. Extracts string literals that reach the view or `summary` (JSX text, text
// props, strings inside JSX expressions, summary return values, the app name) and runs the rules
// in ../copy/rules.ts on each.

import { findAppParts, lineOf, type Node, parse, reachableHelpers, walk } from "../ast.ts";
import { type CopyText, RULES } from "../copy/rules.ts";
import type { Failure } from "../report.ts";

const TEXT_PROPS = new Set([
  "label", "title", "subtitle", "placeholder", "aria-label", "alt", "text", "caption", "hint", "heading",
  "description", "empty", "actor", "confirm", "cta", "message", "summary",
]);
const BUTTONS = new Set(["Button", "button"]);
// Text drawn inside an SVG is a sticker or a label on a drawing, not interface chrome.
const DRAWN = new Set(["text", "tspan", "textPath"]);

export function extractCopy(source: string): CopyText[] {
  const { program, errors } = parse(source);
  if (errors.length) return [];
  const out: CopyText[] = [];
  const emit = (text: string, n: Node, button: boolean, free = false) => {
    const t = text.replace(/\s+/g, " ").trim();
    // A stylesheet in a <style> element is code, not copy ("@keyframes pulse { 50% { opacity: .9 } }").
    if (/@(keyframes|media|font-face)\b|[{;]\s*[a-z-]+\s*:[^:]/.test(t) && /[{}]/.test(t)) return;
    if (t && /[A-Za-z%!\p{Extended_Pictographic}]/u.test(t)) out.push({ text: t, button, line: lineOf(source, n.start), ...(free ? { free } : {}) });
  };

  /** Strings an expression can evaluate to, following only text-preserving operators. */
  const harvest = (n: Node | null | undefined, button: boolean, free = false): void => {
    if (!n) return;
    switch (n.type) {
      case "Literal":
        if (typeof n.value === "string") emit(n.value, n, button, free);
        return;
      case "TemplateLiteral":
        emit(n.quasis.map((q: Node) => q.value.cooked ?? q.value.raw).join("{}"), n, button, free);
        for (const e of n.expressions) harvest(e, button, free);
        return;
      case "ConditionalExpression":
        harvest(n.consequent, button, free);
        harvest(n.alternate, button, free);
        return;
      case "LogicalExpression":
        harvest(n.left, button, free);
        harvest(n.right, button, free);
        return;
      case "BinaryExpression":
        if (n.operator === "+") {
          harvest(n.left, button, free);
          harvest(n.right, button, free);
        }
        return;
      case "ParenthesizedExpression":
      case "TSAsExpression":
      case "TSSatisfiesExpression":
      case "TSNonNullExpression":
        harvest(n.expression, button, free);
        return;
      case "ArrayExpression":
        for (const e of n.elements) harvest(e, button, free);
        return;
      case "ArrowFunctionExpression":
        if (n.body.type !== "BlockStatement") harvest(n.body, button, free);
        else returnsOf(n.body).forEach((r) => harvest(r, button, free));
        return;
      case "CallExpression": {
        // userContent(...) marks what a person made: its strings are content.
        const callee = n.callee.type === "Identifier" ? n.callee.name : n.callee.property?.name;
        if (callee === "userContent") for (const a of n.arguments) harvest(a, button, true);
        // .map(x => ...) and .join(" · ") style calls: look into callbacks; JSX is handled by the walker.
        for (const a of n.arguments) if (a.type === "ArrowFunctionExpression" || a.type === "FunctionExpression") harvest(a, button, free);
        return;
      }
    }
  };

  const visitJsx = (root: Node) =>
    walk(root, (n) => {
      if (n.type !== "JSXElement") return;
      const nameNode = n.openingElement.name;
      const name = nameNode.type === "JSXIdentifier" ? nameNode.name : "";
      const isButton = BUTTONS.has(name);
      const drawn = DRAWN.has(name);
      for (const attr of n.openingElement.attributes as Node[]) {
        if (attr.type !== "JSXAttribute") continue;
        const an = attr.name.type === "JSXIdentifier" ? attr.name.name : "";
        if (!TEXT_PROPS.has(an) || !attr.value) continue;
        const btn = isButton && an === "label";
        if (attr.value.type === "Literal") emit(String(attr.value.value), attr.value, btn, drawn);
        else if (attr.value.type === "JSXExpressionContainer") harvest(attr.value.expression, btn, drawn);
      }
      for (const c of n.children as Node[]) {
        if (c.type === "JSXText") emit(c.value, c, isButton, drawn);
        else if (c.type === "JSXExpressionContainer") harvest(c.expression, isButton, drawn);
      }
    });

  const { def, parts, topFns } = findAppParts(program);
  const view = parts.get("view");
  const summary = parts.get("summary");
  const nameProp = def?.properties.find((p: Node) => p.type === "Property" && (p.key.name ?? p.key.value) === "name");
  if (nameProp?.value?.type === "Literal") emit(String(nameProp.value.value), nameProp.value, false);
  if (view) {
    visitJsx(view);
    for (const f of reachableHelpers([view], topFns).values()) visitJsx(f);
  }
  if (summary) {
    if (summary.body?.type === "BlockStatement") returnsOf(summary.body).forEach((r) => harvest(r, false));
    else if (summary.body) harvest(summary.body, false);
    else if (summary.type === "FunctionDeclaration") returnsOf(summary.body).forEach((r) => harvest(r, false));
  }
  // A JSX text node can be split by expressions; dedupe identical entries per line.
  const seen = new Set<string>();
  return out.filter((t) => {
    const k = `${t.line}:${t.button}:${t.text}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

function returnsOf(body: Node): Node[] {
  const out: Node[] = [];
  walk(body, (n) => {
    if (n.type === "ArrowFunctionExpression" || n.type === "FunctionExpression" || n.type === "FunctionDeclaration") return n === body ? undefined : false;
    if (n.type === "ReturnStatement" && n.argument) out.push(n.argument);
  });
  return out;
}

export function copyLint(source: string): { failures: Failure[]; warnings: Failure[] } {
  const failures: Failure[] = [];
  const warnings: Failure[] = [];
  for (const t of extractCopy(source))
    for (const r of RULES) {
      const m = r.check(t);
      if (m) (r.severity === "error" ? failures : warnings).push({ rule: r.id, message: m, line: t.line });
    }
  return { failures, warnings };
}
