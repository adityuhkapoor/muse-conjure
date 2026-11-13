// Stage 2: static rules on the AST. Contract section 3, reducer and view rules.

import { declaredNames, findAppParts, isReference, lineOf, type Node, parse, reachableHelpers, walk } from "../ast.ts";
import type { Failure } from "../report.ts";

const BANNED_NAMES: Record<string, { rule: string; why: string }> = {};
const ban = (rule: string, why: string, names: string[]) => names.forEach((n) => (BANNED_NAMES[n] = { rule, why }));
ban("no-time", "time comes from meta.time", ["Date", "performance"]);
ban("no-random", "randomness comes from rng(meta.seed)", ["crypto"]);
ban("no-intl", "Intl output depends on the device locale", ["Intl"]);
ban("no-timers", "apps have no timers; motion uses spring/tween from @muse/app", [
  "setTimeout", "setInterval", "setImmediate", "clearTimeout", "clearInterval", "requestAnimationFrame",
  "cancelAnimationFrame", "requestIdleCallback", "queueMicrotask",
]);
ban("no-network", "apps have no network access", ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "navigator", "Request", "Response", "Headers"]);
ban("no-storage", "shared facts live in state, per-viewer facts in local", ["localStorage", "sessionStorage", "indexedDB", "caches"]);
ban("no-host-globals", "use only what @muse/app hands in", [
  "globalThis", "window", "document", "self", "parent", "top", "frames", "location", "history", "process", "Bun", "Deno",
  "require", "module", "exports", "global", "WeakRef", "FinalizationRegistry", "SharedArrayBuffer", "Atomics", "postMessage",
]);
ban("no-eval", "no code generation at run time", ["eval", "Function"]);

/** Banned even when the app declares a local of the same name. */
const NEVER_SHADOW = new Set(["Date", "Math", "eval", "Function", "globalThis", "window", "document", "fetch", "crypto", "performance"]);

// Only user-made content (a flyer's chosen color) may carry a literal color, wrapped so it is visible.
const ALLOWED_COLOR_WRAPPERS = new Set(["userContent"]);
const COLOR_PROPS = new Set([
  "color", "background", "backgroundColor", "borderColor", "borderTopColor", "borderBottomColor", "borderLeftColor",
  "borderRightColor", "outlineColor", "fill", "stroke", "fillStyle", "strokeStyle", "shadowColor", "caretColor", "textDecorationColor",
]);
const NAMED_COLORS = new Set(
  ("black white red green blue yellow orange purple pink gray grey silver maroon olive lime aqua teal navy fuchsia " +
    "brown gold beige coral crimson cyan magenta indigo violet khaki salmon tomato orchid plum tan turquoise lavender " +
    "darkgray darkgrey lightgray lightgrey dimgray dimgrey whitesmoke ghostwhite snow ivory darkblue darkred darkgreen " +
    "lightblue lightgreen skyblue steelblue royalblue dodgerblue slategray slategrey").split(" "),
);
const ROUNDERS = new Set(["round", "floor", "ceil", "trunc"]);

export type StaticOptions = { maxSourceBytes: number };

export function staticRules(source: string, o: StaticOptions): { failures: Failure[]; warnings: Failure[] } {
  const failures: Failure[] = [];
  const warnings: Failure[] = [];
  const at = (n: Node) => lineOf(source, n.start);
  const bytes = new TextEncoder().encode(source).length;
  if (bytes > o.maxSourceBytes)
    failures.push({ rule: "source-size", message: `source is ${bytes} bytes; the limit is ${o.maxSourceBytes}. Move shared pieces to @muse/library.` });

  const { program, errors } = parse(source);
  if (errors.length) {
    failures.push({ rule: "syntax", message: errors[0]!.message });
    return { failures, warnings };
  }

  const locals = declaredNames(program);
  const parents = new Map<Node, { parent: Node | null; key: string }>();
  walk(program, (n, parent, key) => void parents.set(n, { parent, key }));
  walk(program, (n, parent, key) => {
    switch (n.type) {
      case "ImportDeclaration":
      case "ExportNamedDeclaration":
      case "ExportAllDeclaration": {
        const spec = n.source?.value as string | undefined;
        if (spec === undefined) break;
        const typeOnly = n.importKind === "type" || n.exportKind === "type";
        const ok = spec === "@muse/app" || spec.startsWith("@muse/library/") || (typeOnly && (spec === "@muse/app/types" || spec === "@muse/protocol"));
        if (!ok)
          failures.push({ rule: "imports-allowed", message: `import "${spec}" is not allowed; apps import only @muse/app and @muse/library/*`, line: at(n) });
        break;
      }
      case "ImportExpression":
        failures.push({ rule: "no-dynamic-import", message: "dynamic import() is not allowed", line: at(n) });
        break;
      case "MetaProperty":
        failures.push({ rule: "no-dynamic-import", message: `${n.meta.name}.${n.property.name} is not allowed`, line: at(n) });
        break;
      case "Identifier": {
        if (!isReference(n, parent, key)) break;
        const b = locals.has(n.name) && !NEVER_SHADOW.has(n.name) ? undefined : BANNED_NAMES[n.name];
        if (b) failures.push({ rule: b.rule, message: `\`${n.name}\` is not allowed: ${b.why}`, line: at(n) });
        else if (n.name.startsWith("__")) failures.push({ rule: "no-host-globals", message: `\`${n.name}\`: names starting with __ are reserved`, line: at(n) });
        break;
      }
      case "MemberExpression": {
        const prop = memberName(n);
        if (prop === "random" && n.object.type === "Identifier" && n.object.name === "Math")
          failures.push({ rule: "no-random", message: "`Math.random` is not allowed: randomness comes from rng(meta.seed)", line: at(n) });
        if (prop === "constructor" || prop === "__proto__")
          failures.push({ rule: "no-eval", message: `\`.${prop}\` access is not allowed`, line: at(n) });
        if (prop === "cookie") failures.push({ rule: "no-storage", message: "`cookie` is not allowed", line: at(n) });
        break;
      }
      case "Literal":
        if (typeof n.value === "string") {
          colorCheck(n.value, n);
          if (NAMED_COLORS.has(n.value.trim().toLowerCase()) && colorSlot(parent, key)) namedColor(n.value, n);
        }
        break;
      case "TemplateElement":
        colorCheck(n.value?.cooked ?? n.value?.raw ?? "", n);
        break;
      case "JSXText":
        break;
    }
  });

  /** A literal in a color position: `{ color: "x" }`, `g.fillStyle = "x"`, `<rect fill="x">`. */
  function colorSlot(parent: Node | null, key: string | undefined): boolean {
    // Look through `a ? "x" : "y"` and `a || "x"` to the slot the value lands in.
    while (parent && (parent.type === "ConditionalExpression" || parent.type === "LogicalExpression" || parent.type === "ParenthesizedExpression")) {
      const up = parents.get(parent);
      if (!up) return false;
      key = up.key;
      parent = up.parent;
    }
    if (!parent) return false;
    if (parent.type === "Property" && key === "value") return COLOR_PROPS.has(parent.key?.name ?? parent.key?.value);
    if (parent.type === "AssignmentExpression" && key === "right" && parent.left.type === "MemberExpression") return COLOR_PROPS.has(memberName(parent.left) ?? "");
    if (parent.type === "JSXAttribute") return COLOR_PROPS.has(parent.name?.name);
    return false;
  }

  function namedColor(text: string, n: Node) {
    failures.push({ rule: "no-hex-color", message: `color name "${text}": take colors from theme.color (e.g. theme.color.text) or userColor(member, theme)`, line: at(n) });
  }

  function colorCheck(text: string, n: Node) {
    if (!/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch|lab)\(/.test(text)) return;
    if (insideCall(program, n, (c) => c.callee.type === "Identifier" && ALLOWED_COLOR_WRAPPERS.has(c.callee.name))) return;
    failures.push({
      rule: "no-hex-color",
      message: `color literal "${text.slice(0, 40)}": take colors from theme.color (e.g. theme.color.primary) or userColor(member, theme); wrap a color the user picked in userContent(...)`,
      line: at(n),
    });
  }

  // Warnings on reducer code: float money and unsorted key iteration.
  const { parts, topFns } = findAppParts(program);
  const reduce = parts.get("reduce");
  if (!reduce) failures.push({ rule: "app-shape", message: "no defineApp({ ... reduce ... }) found" });
  else {
    const roots = [reduce, ...reachableHelpers([reduce], topFns).values()];
    for (const r of roots)
      walk(r, (n, parent) => {
        if (n.type === "BinaryExpression" && n.operator === "/" && !insideCall(r, n, isRounder))
          warnings.push({ rule: "float-money", message: "division in reduce without Math.round/floor: keep money and scores in integers", line: at(n) });
        if (n.type === "Literal" && typeof n.value === "number" && !Number.isInteger(n.value) && parent?.type === "BinaryExpression" && !insideCall(r, n, isRounder))
          warnings.push({ rule: "float-money", message: `fractional constant ${n.raw} in reduce: keep money and scores in integers`, line: at(n) });
        if (n.type === "ForInStatement")
          warnings.push({ rule: "unsorted-iteration", message: "for...in in reduce: iterate arrays or sorted keys", line: at(n) });
      });
  }
  return { failures: dedupe(failures), warnings: dedupe(warnings) };
}

function dedupe(list: Failure[]): Failure[] {
  const seen = new Set<string>();
  return list.filter((f) => {
    const k = `${f.rule}|${f.line}|${f.message}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

function memberName(n: Node): string | undefined {
  if (!n.computed && n.property.type === "Identifier") return n.property.name;
  if (n.computed && n.property.type === "Literal" && typeof n.property.value === "string") return n.property.value;
  return undefined;
}

function isRounder(c: Node): boolean {
  const cal = c.callee;
  return cal.type === "MemberExpression" && cal.object.type === "Identifier" && cal.object.name === "Math" && ROUNDERS.has(memberName(cal) ?? "");
}

/** True when `target` sits inside the arguments of a call matching `pred`, searching under `root`. */
function insideCall(root: Node, target: Node, pred: (c: Node) => boolean): boolean {
  let found = false;
  walk(root, (n) => {
    if (found || target.start < n.start || target.end > n.end) return false;
    if (n.type === "CallExpression" && n !== target && pred(n) && n.arguments.some((a: Node) => a.start <= target.start && target.end <= a.end)) {
      found = true;
      return false;
    }
  });
  return found;
}
