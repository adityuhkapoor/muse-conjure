// Can a plain "muse ..." be a change to the Mini already in the chat? Most asks are plainly a new
// thing, and the model call that decides ("is this a change?", about 2 s) can be skipped for them.
// An ask may be a change when any of these holds, so the check only ever skips what it is sure of:
//   - it points at the Mini: it, this, that, these, the same, them
//   - it says a change: add, remove, rename, instead, also, more, make it ...
//   - it names the Mini's kind or something inside it (a word of its name or one of its params)
//   - it is too short to tell (two words or fewer after "muse")
// MUSE_CHANGE_SKIP=0 turns the check off (every plain ask is decided by the model).

const POINTS = /\b(it|its|this|that|these|those|them|they|same|one|ones|other|another|else|rest)\b/;
const VERBS = /\b(add|adds|adding|remove|removes|drop|delete|rename|renam\w*|change|changes|changed|swap|switch|replace|replac\w*|instead|update|edit|move|bump|push|extend|shorten|cancel|undo|redo|reset|fix|include|exclude|also|too|plus|more|less|fewer|extra|bigger|smaller|longer|shorter|earlier|later|not|but|rather|without|except|actually|nvm|never ?mind|wait|oops|correct|wrong|sorry|make (?:it|that|this|them)|turn|convert|keep|take (?:out|off|away)|put|throw|pull|get rid|veto|claim|tweak)\b/;
const STOP = new Set("muse the and for you can please pls make made create build set start run give need want let lets let's get got how what when where who why which with from into about this that just like some any all our your their have has had was were are been being will would could should can't cant dont don't not out off over under then than them they there here very much many more most also only even still yet can".split(" "));

const words = (s: string) => (s.toLowerCase().match(/[a-z0-9']{3,}/g) ?? []).map((w) => w.replace(/'s$/, ""));

/** Every word the Mini shows: its name, its lab id and the strings in its params (people's names left out). */
export function vocabulary(tool: { name: string; piece: string | null }, params: Record<string, unknown> | null, members: string[]): Set<string> {
  const people = new Set(members.flatMap((m) => words(m)));
  const out = new Set<string>([...words(tool.name), ...words((tool.piece ?? "").replace(/-/g, " "))]);
  const walk = (v: unknown) => {
    if (typeof v === "string") for (const w of words(v)) out.add(w);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {
      for (const w of words(k.replace(/([a-z])([A-Z])/g, "$1 $2"))) out.add(w);
      walk(x);
    }
  };
  walk(params);
  for (const p of people) out.delete(p);
  return out;
}

/** False only when the ask plainly does not touch the Mini. */
export function mayBeChange(ask: string, tool: { name: string; piece: string | null }, params: Record<string, unknown> | null, members: string[]): boolean {
  if (process.env.MUSE_CHANGE_SKIP === "0") return true;
  const text = ask.toLowerCase().replace(/^\s*@?muse\b[\s,:]*/, "").trim();
  const ws = words(text);
  if (ws.length <= 2) return true;
  if (POINTS.test(text) || VERBS.test(text)) return true;
  const vocab = vocabulary(tool, params, members);
  // the Mini's kind: a plural or a stem of a name word ("wheel" in "chore wheel", "split" in "splits")
  const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "");
  const known = new Set([...vocab].map(stem));
  return ws.some((w) => !STOP.has(w) && w.length >= 4 && known.has(stem(w)));
}
