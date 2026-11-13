// Compile an app module (TS + JSX) into a plain script that runs inside a vm context.
// oxc-transform strips types and JSX; the ES module wrapper is then rewritten by span so the
// script reads imports from `__require(spec)` and writes its default export to `__exports`.

import { parseSync } from "oxc-parser";
import { transformSync } from "oxc-transform";

export type Compiled = { ok: true; js: string; imports: string[] } | { ok: false; message: string; line?: number };

export function compileModule(source: string, filename = "app.tsx"): Compiled {
  const t = transformSync(filename, source, {
    lang: "tsx",
    jsx: { runtime: "automatic", importSource: "@muse/app" },
    typescript: { onlyRemoveTypeImports: false },
  } as Parameters<typeof transformSync>[2]);
  if (t.errors.length) {
    const e = t.errors[0]!;
    const line = lineOfLabel(source, e);
    return line === undefined ? { ok: false, message: e.message } : { ok: false, message: e.message, line };
  }
  return toScript(t.code);
}

function lineOfLabel(source: string, e: { labels?: { start: number }[] }): number | undefined {
  const at = e.labels?.[0]?.start;
  if (at === undefined) return undefined;
  return source.slice(0, at).split("\n").length;
}

type Node = { type: string; start: number; end: number; [k: string]: any };

function toScript(js: string): Compiled {
  const p = parseSync("out.js", js, { sourceType: "module" });
  if (p.errors.length) return { ok: false, message: p.errors[0]!.message };
  const edits: { start: number; end: number; text: string }[] = [];
  const imports: string[] = [];
  let n = 0;
  for (const st of p.program.body as Node[]) {
    if (st.type === "ImportDeclaration") {
      const spec = st.source.value as string;
      imports.push(spec);
      if (st.importKind === "type") {
        edits.push({ start: st.start, end: st.end, text: "" });
        continue;
      }
      const mod = `__m${n++}`;
      const parts: string[] = [`const ${mod} = __require(${JSON.stringify(spec)});`];
      for (const s of st.specifiers as Node[]) {
        if (s.type === "ImportDefaultSpecifier") parts.push(`const ${s.local.name} = ${mod}.default;`);
        else if (s.type === "ImportNamespaceSpecifier") parts.push(`const ${s.local.name} = ${mod};`);
        else {
          const imported = s.imported.type === "Identifier" ? s.imported.name : s.imported.value;
          parts.push(`const ${s.local.name} = ${mod}[${JSON.stringify(imported)}];`);
        }
      }
      edits.push({ start: st.start, end: st.end, text: parts.join(" ") });
    } else if (st.type === "ExportDefaultDeclaration") {
      const d = st.declaration as Node;
      if ((d.type === "FunctionDeclaration" || d.type === "ClassDeclaration") && d.id) {
        edits.push({ start: st.start, end: d.start, text: "" });
        edits.push({ start: st.end, end: st.end, text: `\n__exports.default = ${d.id.name};` });
      } else {
        edits.push({ start: st.start, end: d.start, text: "__exports.default = (" });
        edits.push({ start: d.end, end: st.end, text: ");" });
      }
    } else if (st.type === "ExportNamedDeclaration") {
      if (st.source) return { ok: false, message: "re-exports are not allowed in an app module" };
      if (st.declaration) {
        const d = st.declaration as Node;
        edits.push({ start: st.start, end: d.start, text: "" });
        const names: string[] =
          d.type === "VariableDeclaration"
            ? d.declarations.filter((x: Node) => x.id.type === "Identifier").map((x: Node) => x.id.name)
            : d.id
              ? [d.id.name]
              : [];
        edits.push({ start: st.end, end: st.end, text: names.map((nm) => `\n__exports.${nm} = ${nm};`).join("") });
      } else {
        const out = (st.specifiers as Node[])
          .map((s) => `__exports[${JSON.stringify(s.exported.name ?? s.exported.value)}] = ${s.local.name};`)
          .join(" ");
        edits.push({ start: st.start, end: st.end, text: out });
      }
    } else if (st.type === "ExportAllDeclaration") {
      return { ok: false, message: "re-exports are not allowed in an app module" };
    }
  }
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = js;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return { ok: true, js: '"use strict";\n' + out, imports };
}
