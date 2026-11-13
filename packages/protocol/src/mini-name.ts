// One name per Mini. The card header, the pinned bar, the chat-list preview ("Muse conjured ..."),
// system lines and search all read the same value, and this is where it comes from: the Mini's own
// title, in sentence case. Never the chat's name and never a line from the chat.
//
//   1. the heading the Mini draws, when it is a fixed string (`<CardHeader title="Rent split" ...>`);
//   2. else its `title` param (the `// @params` block), which is the heading the Mini fills in;
//   3. else the name it gave itself in defineApp;
//   4. else `fallback`.

const lit = (s: string): string => {
  try {
    return JSON.parse(`"${s}"`) as string;
  } catch {
    return s;
  }
};

/** First letter up, the rest as written ("who owes who" gives "Who owes who", "Will's party" stays). */
export function sentenceCase(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t ? t[0]!.toUpperCase() + t.slice(1) : t;
}

/** A top-level string param from the `// @params` block. */
const param = (params: string, key: string): string | undefined => {
  const v = new RegExp(`^ {2}"?${key}"?:\\s*"((?:[^"\\\\]|\\\\.){1,80})"`, "m").exec(params)?.[1];
  return v === undefined ? undefined : lit(v);
};

export function miniName(source: string, fallback = ""): string {
  const params = /\/\/ @params\n([\s\S]*?)\/\/ @end params/.exec(source)?.[1] ?? "";
  const heading = /<CardHeader\b[^>]*?\btitle=(?:"((?:[^"\\]|\\.){1,60})"|\{"((?:[^"\\]|\\.){1,60})"\})/.exec(source);
  const fixed = heading ? lit(heading[1] ?? heading[2] ?? "") : "";
  if (fixed.trim()) return sentenceCase(fixed).slice(0, 60);
  // a heading built from one param ("Gift for ${state.recipient}") reads that param's value
  const tpl = /<CardHeader\b[^>]*?\btitle=\{`([^`]{1,80})`\}/.exec(source)?.[1];
  if (tpl) {
    let ok = true;
    const text = tpl.replace(/\$\{(?:state|s)\.(\w+)\}/g, (_m, k: string) => {
      const v = param(params, k);
      if (!v) ok = false;
      return v ?? "";
    });
    if (ok && text.trim() && !text.includes("${")) return sentenceCase(text).slice(0, 60);
  }
  // a heading kept in a constant (`const heading = after ? "Untangled" : "Who owes who"`): the one it starts with
  const ident = /<CardHeader\b[^>]*?\btitle=\{(\w+)\}/.exec(source)?.[1];
  if (ident && ident !== "title") {
    const def = new RegExp(`\\b(?:const|let)\\s+${ident}\\s*=\\s*([^;\\n]{1,200})`).exec(source)?.[1];
    const lits = def ? [...def.matchAll(/"((?:[^"\\]|\\.){1,60})"/g)].map((m) => lit(m[1]!)) : [];
    const pick = lits.length ? (def!.includes("?") ? lits[lits.length - 1]! : lits[0]!) : "";
    if (pick.trim() && !/\$\{/.test(pick)) return sentenceCase(pick).slice(0, 60);
  }
  const title = param(params, "title");
  if (title && title.trim()) return sentenceCase(title).slice(0, 60);
  const own = /defineApp\b[^(]*\(\s*\{[\s\S]{0,200}?\bname:\s*"([^"]{1,40})"/.exec(source)?.[1];
  if (own) return sentenceCase(own);
  return fallback ? sentenceCase(fallback).slice(0, 60) : "";
}
