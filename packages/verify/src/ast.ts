// AST helpers over oxc-parser's ESTree output: a walker that skips type positions, and a finder
// for the parts of `defineApp({...})` (reduce, view, summary, ...) plus top-level helpers they use.

import { parseSync } from "oxc-parser";

export type Node = { type: string; start: number; end: number; [k: string]: any };

export function parse(source: string, filename = "app.tsx") {
  const r = parseSync(filename, source, { sourceType: "module", lang: "tsx" } as Parameters<typeof parseSync>[2]);
  return { program: r.program as unknown as Node, errors: r.errors };
}

const TYPE_KEYS = new Set(["typeAnnotation", "typeParameters", "typeArguments", "returnType", "superTypeArguments", "decorators"]);

/** Visit every value-level node. `visit` returning false skips the node's children. */
export function walk(node: Node, visit: (n: Node, parent: Node | null, key: string) => boolean | void, parent: Node | null = null, key = "") {
  if (visit(node, parent, key) === false) return;
  if (node.type.startsWith("TS")) {
    // Only descend into the value inside type-level wrappers (x as T, x!, x satisfies T).
    if (node.expression && typeof node.expression === "object") walk(node.expression, visit, node, "expression");
    return;
  }
  for (const k of Object.keys(node)) {
    if (TYPE_KEYS.has(k) || k === "parent") continue;
    const v = node[k];
    if (Array.isArray(v)) {
      for (const c of v) if (c && typeof c.type === "string") walk(c, visit, node, k);
    } else if (v && typeof v === "object" && typeof v.type === "string") walk(v, visit, node, k);
  }
}

export function lineOf(source: string, offset: number): number {
  let n = 1;
  for (let i = 0; i < offset && i < source.length; i++) if (source.charCodeAt(i) === 10) n++;
  return n;
}

/** True when the identifier at this position is a reference (not a key, label or member name). */
export function isReference(n: Node, parent: Node | null, key: string): boolean {
  if (!parent) return true;
  switch (parent.type) {
    case "MemberExpression":
      return key !== "property" || parent.computed;
    case "Property":
      return key === "value" || (key === "key" && parent.computed);
    case "MethodDefinition":
    case "PropertyDefinition":
      return key !== "key" || parent.computed;
    case "LabeledStatement":
    case "BreakStatement":
    case "ContinueStatement":
      return false;
    case "ImportSpecifier":
    case "ImportDefaultSpecifier":
    case "ImportNamespaceSpecifier":
    case "ExportSpecifier":
      return false;
  }
  return true;
}

/** Strip parentheses and type-only wrappers: (x), x as T, x satisfies T, x!. */
export function unwrap(n: Node): Node {
  while (["ParenthesizedExpression", "TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression"].includes(n.type)) n = n.expression;
  return n;
}

export type AppParts = {
  /** The object literal passed to defineApp. */
  def: Node | null;
  /** Property name to its value node (function), resolved through top-level identifiers. */
  parts: Map<string, Node>;
  /** Top-level function-like declarations by name. */
  topFns: Map<string, Node>;
};

export function findAppParts(program: Node): AppParts {
  const topFns = new Map<string, Node>();
  const topConsts = new Map<string, Node>();
  for (const st0 of program.body as Node[]) {
    const st = st0.type === "ExportNamedDeclaration" && st0.declaration ? st0.declaration : st0;
    if (st.type === "FunctionDeclaration" && st.id) topFns.set(st.id.name, st);
    if (st.type === "VariableDeclaration")
      for (const d of st.declarations as Node[]) {
        if (d.id.type !== "Identifier" || !d.init) continue;
        topConsts.set(d.id.name, d.init);
        if (d.init.type === "ArrowFunctionExpression" || d.init.type === "FunctionExpression") topFns.set(d.id.name, d.init);
      }
  }
  let def: Node | null = null;
  walk(program, (n) => {
    if (def) return false;
    if (n.type === "CallExpression" && n.callee.type === "Identifier" && n.callee.name === "defineApp" && n.arguments[0]) {
      let a = unwrap(n.arguments[0] as Node);
      if (a.type === "Identifier" && topConsts.has(a.name)) a = unwrap(topConsts.get(a.name)!);
      if (a.type === "ObjectExpression") def = a;
      return false;
    }
  });
  const parts = new Map<string, Node>();
  if (def) {
    for (const p of (def as Node).properties as Node[]) {
      if (p.type !== "Property" || p.computed) continue;
      const name = p.key.type === "Identifier" ? p.key.name : p.key.value;
      let v = unwrap(p.value as Node);
      if (v.type === "Identifier") v = topFns.get(v.name) ?? topConsts.get(v.name) ?? v;
      parts.set(String(name), v);
    }
  }
  return { def, parts, topFns };
}

/** Top-level functions reachable from `roots` by name reference (transitively). */
export function reachableHelpers(roots: Node[], topFns: Map<string, Node>): Map<string, Node> {
  const out = new Map<string, Node>();
  const queue = [...roots];
  while (queue.length) {
    const n = queue.pop()!;
    walk(n, (c, parent, key) => {
      if (c.type === "Identifier" && isReference(c, parent, key) && topFns.has(c.name) && !out.has(c.name)) {
        const f = topFns.get(c.name)!;
        if (!roots.includes(f)) {
          out.set(c.name, f);
          queue.push(f);
        }
      }
    });
  }
  return out;
}

/** Every name bound anywhere in the program (variables, params, functions, classes, imports). */
export function declaredNames(program: Node): Set<string> {
  const out = new Set<string>();
  const pat = (p: Node | null | undefined) => {
    if (!p) return;
    switch (p.type) {
      case "Identifier": out.add(p.name); break;
      case "ObjectPattern": for (const q of p.properties) pat(q.type === "RestElement" ? q.argument : q.value); break;
      case "ArrayPattern": for (const q of p.elements) pat(q); break;
      case "AssignmentPattern": pat(p.left); break;
      case "RestElement": pat(p.argument); break;
      case "TSParameterProperty": pat(p.parameter); break;
    }
  };
  walk(program, (n) => {
    if (n.type === "VariableDeclarator") pat(n.id);
    else if (n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression") {
      if (n.id) out.add(n.id.name);
      for (const q of n.params) pat(q);
    } else if (n.type === "ClassDeclaration" && n.id) out.add(n.id.name);
    else if (n.type === "CatchClause") pat(n.param);
    else if (n.type === "ImportSpecifier" || n.type === "ImportDefaultSpecifier" || n.type === "ImportNamespaceSpecifier") out.add(n.local.name);
  });
  return out;
}
