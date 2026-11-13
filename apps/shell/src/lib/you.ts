// Verbs after "You". Text is written about a person in the third person ("Arun is in", "Maya
// hosts"); when the person is the viewer it reads "You're in", "You host".

const IRREGULAR: Record<string, string> = {
  is: "'re",
  are: "'re",
  was: " were",
  has: " have",
  does: " do",
  "isn't": " aren't",
  "wasn't": " weren't",
  "hasn't": " haven't",
  "doesn't": " don't",
};
const NOT_VERBS = new Set(["this", "yes", "plus", "its", "less", "across", "always", "perhaps", "pass"]);

/** What follows "You" for `rest`, which starts with a space and the verb: " is in" gives "'re in". */
export function youRest(rest: string): string {
  const m = /^ ([A-Za-z']+)([\s\S]*)$/.exec(rest);
  if (!m) return rest;
  const word = m[1]!;
  const low = word.toLowerCase();
  const irr = IRREGULAR[low];
  if (irr) return irr + m[2];
  if (word.length < 4 || NOT_VERBS.has(low) || !low.endsWith("s") || /(ss|us|is)$/.test(low)) return rest;
  const base = /ies$/.test(low) ? word.slice(0, -3) + "y" : /(ch|sh|x|z|o)es$/.test(low) ? word.slice(0, -2) : word.slice(0, -1);
  return " " + base + m[2];
}
