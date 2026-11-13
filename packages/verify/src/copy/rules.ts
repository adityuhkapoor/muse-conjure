// Copy rules (stage 7), from Meta's product voice (the design notes section 7
// and docs/CONTRACTS.md "Rule zero"). Each rule carries a failing and a passing example; the test
// suite checks both, so a rule that cannot fail is caught.

export type CopyText = {
  text: string;
  /** Inside a Button (children or label). */
  button: boolean;
  line: number;
  /** User-made content or a drawn sticker (userContent(...), SVG text, a quoted line): content, not interface chrome. */
  free?: boolean;
};

export type CopyRule = {
  id: string;
  description: string;
  severity: "error" | "warning";
  check(t: CopyText): string | null;
  examples: { fail: Omit<CopyText, "line">; pass: Omit<CopyText, "line"> };
};

/** Words that are capitalized on their own (names, brands, the pronoun I). */
export const PROPER = new Set([
  "I", "Muse", "Meta", "Facebook", "Messenger", "Instagram", "WhatsApp", "Threads",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
  "Jan", "Feb", "Mar", "Apr", "Jun", "Jul", "Aug", "Sep", "Sept", "Oct", "Nov", "Dec",
]);

/** Short all-caps tokens that are normal in Meta copy. */
export const ACRONYMS = new Set(["OK", "RSVP", "AM", "PM", "TV", "ID", "US", "UK", "EU", "NYC", "SF", "LA", "DJ", "BBQ", "FAQ", "PDF", "GIF", "VR", "AR", "MVP", "ETA", "TBD", "PS"]);

// Corporate filler and AI-sounding copy. Playful verbs ("lock it in", "let's go") are a tool's voice and are allowed.
export const BANNED_PHRASES = [
  "seamless", "seamlessly", "elevate", "dive in", "oops", "awesome", "woohoo", "yay", "hooray", "whoops",
  "uh oh", "game changer", "game-changer", "supercharge", "unleash", "effortless", "ai assistant",
];

const DATE_LINE = /^(MON|TUE|WED|THU|FRI|SAT|SUN|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|TODAY|TOMORROW|TONIGHT)\b[A-Z0-9 ,:·.\-–]*$/;

function words(text: string): string[] {
  return text.split(/[\s·/–—-]+/).filter((w) => /[A-Za-z]/.test(w));
}

export const RULES: CopyRule[] = [
  {
    id: "sentence-case",
    description: "Sentence case everywhere: only the first word and names start with a capital.",
    severity: "error",
    check(t) {
      const ws = words(t.text);
      let caps = 0;
      for (let i = 1; i < ws.length; i++) {
        const prev = ws[i - 1]!;
        const w = ws[i]!.replace(/^[^A-Za-z]+|[^A-Za-z']+$/g, "");
        if (/[.?!:]$/.test(prev)) continue; // new sentence
        if (/^[A-Z][a-z']+$/.test(w) && !PROPER.has(w)) caps++;
      }
      if (caps >= 2 || (caps === 1 && t.button && ws.length <= 3))
        return `"${t.text}" is in Title Case; use sentence case ("${toSentence(t.text)}")`;
      return null;
    },
    examples: { fail: { text: "Split The Bill", button: false }, pass: { text: "Split the bill with Maya", button: false } },
  },
  {
    id: "all-caps",
    description: "No ALL CAPS, except short date lines on event cards and common acronyms.",
    severity: "error",
    check(t) {
      const text = t.text.trim();
      if (DATE_LINE.test(text) && text.length <= 40) return null;
      const shout = (text.match(/\b[A-Z][A-Z']{1,}\b/g) ?? []).filter((w) => !ACRONYMS.has(w));
      if (shout.some((w) => w.length >= 4) || shout.length >= 2) return `"${t.text}" is in capitals; use sentence case`;
      return null;
    },
    examples: { fail: { text: "TONIGHT'S PICK", button: false }, pass: { text: "FRI, NOV 28 AT 2:30 PM", button: false } },
  },
  {
    id: "no-exclamation",
    description: "No exclamation marks in interface labels, buttons, headings and hints (user-made content, drawn stickers and quoted lines may have them).",
    severity: "error",
    check(t) {
      if (t.free) return null;
      const bare = t.text.replace(/\u201c[^\u201d]*\u201d|"[^"]*"/g, "");
      return bare.includes("!") ? `"${t.text}" has an exclamation mark; keep it for user content or a drawn sticker (userContent(...), SVG text)` : null;
    },
    examples: { fail: { text: "You're in!", button: false }, pass: { text: "You're in.", button: false } },
  },
  {
    id: "button-words",
    description: "Button labels are 1-4 words.",
    severity: "error",
    check: (t) => (t.button && words(t.text).length > 4 ? `button "${t.text}" has ${words(t.text).length} words; use 1-4` : null),
    examples: { fail: { text: "Add your own option right now", button: true }, pass: { text: "Add", button: true } },
  },
  {
    id: "no-percent",
    description: "Percentages are a warning: fine when the number is the tool's subject (odds, a rating, a progress share); on votes prefer counts.",
    severity: "error",
    check(t) {
      if (!t.text.includes("%")) return null;
      if (/\b(tip|tax|off|discount|battery|interest)\b/i.test(t.text)) return null;
      return `"${t.text}" shows a percentage; keep it only if the number is the subject (odds, a rating, progress), otherwise show counts`;
    },
    examples: { fail: { text: "{}% voted yes", button: false }, pass: { text: "{} voted yes", button: false } },
  },
  {
    id: "banned-phrase",
    description: "No hype, taglines or cute filler.",
    severity: "error",
    check(t) {
      const low = t.text.toLowerCase().replace(/[’]/g, "'");
      const hit = BANNED_PHRASES.find((p) => new RegExp(`(^|[^a-z])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(low));
      return hit ? `"${t.text}" uses "${hit}"; say what happens in plain words` : null;
    },
    examples: { fail: { text: "Dive in", button: true }, pass: { text: "Save", button: true } },
  },
  {
    id: "no-emoji-button",
    description: "No emoji in buttons.",
    severity: "error",
    check: (t) => (t.button && /\p{Extended_Pictographic}/u.test(t.text) ? `button "${t.text}" has an emoji` : null),
    examples: { fail: { text: "Vote 🎉", button: true }, pass: { text: "Vote", button: true } },
  },
];

function toSentence(s: string): string {
  const ws = s.split(" ");
  return ws.map((w, i) => (i === 0 || PROPER.has(w) ? w : w.toLowerCase())).join(" ");
}
