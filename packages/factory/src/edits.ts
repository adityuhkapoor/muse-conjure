// Small edits instead of whole files. A repair or a fix usually touches a few lines, but a model
// asked for "the whole module" rewrites 300 lines, which on a slow model is most of the wait.
// The model answers with SEARCH/REPLACE blocks; they are applied exactly, then line by line with
// whitespace ignored. If any block does not apply, the caller asks again for the whole file.

export const EDIT_INSTRUCTIONS = `Reply with edits only, as one or more blocks in exactly this form (copy the SEARCH lines from the app exactly; keep each block small; several blocks are fine):

<<<<<<< SEARCH
the exact lines to replace
=======
the new lines
>>>>>>> REPLACE

No other text.`;

const BLOCK = /<{7} SEARCH\n([\s\S]*?)\n?={7}\n([\s\S]*?)\n?>{7} REPLACE/g;

export function parseEdits(reply: string): { search: string; replace: string }[] {
  return [...reply.matchAll(BLOCK)].map((m) => ({ search: m[1]!, replace: m[2]! }));
}

/** The source with every edit applied, or null when a block's SEARCH text is not found once. */
export function applyEdits(source: string, reply: string): string | null {
  const edits = parseEdits(reply);
  if (!edits.length) return null;
  let out = source;
  for (const e of edits) {
    if (!e.search.trim()) return null;
    const i = out.indexOf(e.search);
    if (i >= 0 && out.indexOf(e.search, i + 1) < 0) {
      out = out.slice(0, i) + e.replace + out.slice(i + e.search.length);
      continue;
    }
    // Loose: match the same lines with leading and trailing spaces ignored.
    const lines = out.split("\n");
    const want = e.search.split("\n").map((l) => l.trim());
    let at = -1;
    for (let k = 0; k + want.length <= lines.length; k++) {
      if (want.every((w, j) => lines[k + j]!.trim() === w)) {
        if (at >= 0) return null;
        at = k;
      }
    }
    if (at < 0) return null;
    lines.splice(at, want.length, ...e.replace.split("\n"));
    out = lines.join("\n");
  }
  return out;
}
