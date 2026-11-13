// Stage 5: invariant strength by mutation. Mutants are made on the TypeScript source at the AST
// level, only inside `reduce`, `onMembers` and the top-level helpers they call (helpers the
// invariants, transitions, arbitrary or init also use are left alone, so a mutant never changes
// the check that is meant to catch it).

import { findAppParts, lineOf, type Node, parse, reachableHelpers, walk } from "../ast.ts";
import { compileModule } from "../compile.ts";

export type Mutant = { id: number; op: string; line: number; before: string; after: string; source: string };

const FLIP: Record<string, string> = { "<": ">=", "<=": ">", ">": "<=", ">=": "<", "===": "!==", "!==": "===", "==": "!=", "!=": "==" };

type Edit = { op: string; start: number; end: number; text: string };

export function makeMutants(source: string, max: number): Mutant[] {
  const { program, errors } = parse(source);
  if (errors.length) return [];
  const { parts, topFns } = findAppParts(program);
  const reduce = parts.get("reduce");
  if (!reduce) return [];
  const guarded = new Set<Node>();
  for (const k of ["invariants", "transitions", "arbitrary", "init"]) {
    const p = parts.get(k);
    if (p) for (const f of reachableHelpers([p], topFns).values()) guarded.add(f);
  }
  const own = [reduce, parts.get("onMembers")].filter((x): x is Node => !!x && x.type !== "Identifier");
  const roots = [...own.filter((f) => !guarded.has(f)), ...[...reachableHelpers(own, topFns).values()].filter((f) => !guarded.has(f) && !own.includes(f))];

  const byOp = new Map<string, Edit[]>();
  const add = (e: Edit) => {
    if (!byOp.has(e.op)) byOp.set(e.op, []);
    byOp.get(e.op)!.push(e);
  };
  const text = (n: Node) => source.slice(n.start, n.end);

  for (const root of roots)
    walk(root, (n, parent, key) => {
      switch (n.type) {
        case "IfStatement": {
          const c = n.consequent as Node;
          const returns = c.type === "ReturnStatement" || (c.type === "BlockStatement" && c.body.at(-1)?.type === "ReturnStatement");
          if (!n.alternate && returns) add({ op: "remove-guard", start: n.start, end: n.end, text: ";" });
          if (n.alternate)
            add({ op: "swap-branches", start: n.start, end: n.end, text: `if (${text(n.test)}) ${text(n.alternate)} else ${text(c)}` });
          add({ op: "negate-condition", start: n.test.start, end: n.test.end, text: `!(${text(n.test)})` });
          break;
        }
        case "ConditionalExpression":
          add({ op: "swap-branches", start: n.start, end: n.end, text: `(${text(n.test)}) ? (${text(n.alternate)}) : (${text(n.consequent)})` });
          break;
        case "BinaryExpression": {
          const to = FLIP[n.operator];
          if (to) {
            const between = source.slice(n.left.end, n.right.start);
            const i = between.indexOf(n.operator);
            if (i >= 0) add({ op: "flip-comparison", start: n.left.end + i, end: n.left.end + i + n.operator.length, text: to });
          }
          break;
        }
        case "LogicalExpression": {
          const to = n.operator === "&&" ? "||" : n.operator === "||" ? "&&" : null;
          if (to) {
            const between = source.slice(n.left.end, n.right.start);
            const i = between.indexOf(n.operator);
            if (i >= 0) add({ op: "flip-logic", start: n.left.end + i, end: n.left.end + i + 2, text: to });
          }
          break;
        }
        case "Literal":
          if (typeof n.value === "number" && parent?.type !== "Property" && key !== "key" && parent?.type !== "MemberExpression")
            add({ op: "off-by-one", start: n.start, end: n.end, text: String(n.value + 1) });
          break;
        case "ExpressionStatement": {
          const e = n.expression as Node;
          if (e.type === "AssignmentExpression" || e.type === "UpdateExpression" || (e.type === "CallExpression" && e.callee.type === "MemberExpression"))
            add({ op: "drop-assignment", start: n.start, end: n.end, text: ";" });
          break;
        }
        case "ObjectExpression": {
          // `{ ...s, votes: next }` -> drop one updated field.
          if (!n.properties.some((p: Node) => p.type === "SpreadElement")) break;
          for (const p of n.properties as Node[]) {
            if (p.type !== "Property") continue;
            const comma = source.slice(p.end).match(/^\s*,/);
            add({ op: "drop-assignment", start: p.start, end: p.end + (comma ? comma[0].length : 0), text: "" });
          }
          break;
        }
      }
    });

  // Share the cap across operators round-robin, then spread each operator's picks over the file.
  const all = [...byOp.values()];
  const quota = all.map(() => 0);
  for (let left = max, moved = true; left > 0 && moved; ) {
    moved = false;
    all.forEach((l, i) => {
      if (left > 0 && quota[i]! < l.length) (quota[i]!++, left--, (moved = true));
    });
  }
  const picked = all.flatMap((l, i) => spread(l, quota[i]!)).sort((a, b) => a.start - b.start);

  const out: Mutant[] = [];
  for (const e of picked) {
    const src = source.slice(0, e.start) + e.text + source.slice(e.end);
    if (!compileModule(src).ok) continue;
    out.push({
      id: out.length,
      op: e.op,
      line: lineOf(source, e.start),
      before: oneLine(source.slice(e.start, e.end)),
      after: oneLine(e.text) || "(removed)",
      source: src,
    });
  }
  return out;
}

function spread<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(list[Math.floor((i * list.length) / n)]!);
  return out;
}

function oneLine(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 80 ? t.slice(0, 80) + "…" : t;
}
