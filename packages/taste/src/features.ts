// Features: what the model sees. Copy features are computed from raw text only, so they work on
// strings the model has never seen (the "does this sound like AI-written copy" check). Tool,
// motion and screen features come from the item's knobs.
//
// Every feature is a named number (mostly 0 or 1). The registry below says how to describe a
// feature in plain words and which weak prior, if any, comes from what the owner has said.

import { broken } from "./break.ts";

export type Feats = Record<string, number>;
export type Role = "button" | "title" | "summary" | "system" | "empty" | "building" | "error" | "toast";
export const ROLES: Role[] = ["button", "title", "summary", "system", "empty", "building", "error", "toast"];

const EMOJI = /\p{Extended_Pictographic}/u;
const SMALL = new Set(["a", "an", "the", "of", "to", "for", "in", "on", "and", "or", "with", "at", "by"]);
// Proper nouns that are capitalized in any case: days, months, Muse, and the made-up people and places.
const PROPER = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|april|june|july|august|september|october|november|december|muse|maya|theo|dani|priya|sam|leo|nopa|sza|kia|forum|thai|basil|ramen|messenger|facebook)$/i;
const HEDGE = /\b(maybe|might|perhaps|probably|seems?|looks like|kind of|sort of|roughly|a bit|i think|possibly|still maybe)\b/i;
const FIRST = /\b(i|i'm|i'll|i've|me|my|we|we're|we'll|our|us)\b/i;
const PUNCHY =
  /\b(boom|let's go|let's|nailed|crush(ing|ed)?|lock it in|woo+hoo|yay|oops|uh oh|whoops|awesome|epic|squad|crew|vibes?|dibs|bring it on|pay up|roll call|chore wars|food fight|crickets|you're up|cooking|throw (one )?in|threw in|give it a spin|gave it a spin|up for grabs|it's happening|almost there|nice pick|assemble)\b/i;
const AI =
  /\b(seamless(ly)?|effortless(ly)?|unlock|elevate|journey|magic(al)?|dive in|ready to go|supercharge|game[- ]changer|hassle[- ]free|streamline|crafting|perfect spot|ultimate|make your voice heard|let fate decide|make it yours|make it official|close the loop|clear favorite|emerging|brave soul|a hero|successfully|outstanding balance|we hit a snag|on our end|to the mix|onward|officially|a couple more friends|has been chosen|let the wheel decide|works for everyone)\b|✨|🚀/i;

function words(text: string): string[] {
  return text.match(/[\p{L}\p{N}$'’%]+/gu) ?? [];
}

/** True when most words that would be lower case in a sentence are capitalized. */
export function isTitleCase(text: string): boolean {
  const ws = words(text).filter((w) => /\p{L}/u.test(w));
  const eligible = ws.slice(1).filter((w) => !SMALL.has(w.toLowerCase()) && (broken() || !PROPER.test(w)));
  const caps = eligible.filter((w) => /^\p{Lu}/u.test(w));
  return caps.length >= 2 && caps.length / Math.max(1, eligible.length) >= 0.75;
}

/** Copy features from raw text. `role` adds role-specific features when it is known. */
export function copyFeatures(text: string, role?: Role): Feats {
  const t = text.trim();
  const ws = words(t);
  const n = ws.length;
  const f: Feats = {};
  const set = (k: string, on: boolean) => {
    if (on) f[k] = 1;
  };
  set("copy.exclaim", !broken() && /!/.test(t));
  set("copy.emoji", EMOJI.test(t));
  set("copy.title_case", isTitleCase(t));
  set("copy.all_caps_word", ws.some((w) => w.length >= 3 && /^\p{Lu}+$/u.test(w) && !/^(SZA|USA|NYC|BBQ)$/.test(w)));
  set("copy.short", n <= 3);
  set("copy.long", n >= 9);
  set("copy.first_person", FIRST.test(t));
  set("copy.percent", /\d\s?%|\bpercent\b/i.test(t));
  set("copy.count", /\d/.test(t) && !/\d\s?%/.test(t));
  set("copy.hedge", HEDGE.test(t));
  set("copy.punchy", PUNCHY.test(t));
  set("copy.ai_phrase", AI.test(t));
  set("copy.em_dash", /—/.test(t));
  set("copy.question", /\?/.test(t));
  set("copy.ellipsis", /…|\.\.\./.test(t));
  set("copy.sep_dot", /·/.test(t));
  if (role) {
    f[`copy.role=${role}`] = 1;
    if (role === "button") {
      set("copy.button.one_word", n === 1);
      set("copy.button.three_plus", n >= 3);
    }
  }
  return f;
}

export function toolKnobFeatures(k: ToolKnobs, piece: string, uses: { progress: boolean; avatars: boolean }): Feats {
  const f: Feats = { [`tool.piece=${piece}`]: 1 };
  if (k.density !== "standard") f[`tool.density=${k.density}`] = 1;
  if (k.accent !== "standard") f[`tool.accent=${k.accent}`] = 1;
  if (k.radius !== 8) f[`tool.radius=${k.radius}`] = 1;
  if (uses.avatars && k.avatar !== 24) f[`tool.avatar=${k.avatar}`] = 1;
  if (uses.progress && !k.progress) f["tool.progress=off"] = 1;
  if (k.celebrate !== "none") f[`tool.celebrate=${k.celebrate}`] = 1;
  if (k.motion !== "standard") f[`tool.motion=${k.motion}`] = 1;
  if (k.mode === "dark") f["tool.mode=dark"] = 1;
  return f;
}

export type ToolKnobs = {
  density: "compact" | "standard" | "spacious";
  accent: "minimal" | "standard" | "full";
  radius: 4 | 8 | 16;
  avatar: 20 | 24 | 32;
  progress: boolean;
  celebrate: "none" | "color" | "burst";
  motion: "none" | "standard" | "springy";
  mode: "light" | "dark";
};

export const BASE_KNOBS: ToolKnobs = { density: "standard", accent: "standard", radius: 8, avatar: 24, progress: true, celebrate: "none", motion: "standard", mode: "light" };

// ---------------------------------------------------------------------------------------------
// Registry: plain words and priors.

export type FeatureInfo = {
  /** What it is about, for "no clear preference on X yet". Features with the same family share one such line. */
  family: string;
  like: string;
  dislike: string;
  /** Weak prior mean in log-odds, from what the owner said. 0 or missing: no prior. */
  prior?: number;
  /** Why the prior exists, in his words. */
  because?: string;
  /** Not a preference to report (intercepts). */
  hidden?: boolean;
};

const VOICE = "Meta's plain product voice";
const R: Record<string, FeatureInfo> = {
  "copy.exclaim": { family: "exclamation marks", like: "likes exclamation marks", dislike: "avoids exclamation marks", prior: -0.8, because: VOICE },
  "copy.emoji": { family: "emoji in copy", like: "likes emoji in copy", dislike: "avoids emoji in copy", prior: -0.5, because: VOICE },
  "copy.title_case": { family: "Title Case", like: "likes Title Case", dislike: "prefers sentence case over Title Case", prior: -0.6, because: VOICE },
  "copy.all_caps_word": { family: "all-caps words", like: "likes all-caps words", dislike: "avoids all-caps words", prior: -0.4, because: VOICE },
  "copy.short": { family: "short copy", like: "prefers short copy (3 words or fewer)", dislike: "prefers copy longer than 3 words", prior: 0.3, because: "short verbs" },
  "copy.long": { family: "long copy", like: "likes long copy (9 words or more)", dislike: "avoids long copy (9 words or more)", prior: -0.4, because: VOICE },
  "copy.first_person": { family: "first person", like: "likes Muse speaking as \"I\" or \"we\"", dislike: "avoids Muse speaking as \"I\" or \"we\"", prior: -0.3, because: "nothing that sounds like AI-written copy" },
  "copy.percent": { family: "percentages", like: "prefers percentages", dislike: "prefers counts over percentages", prior: -0.4, because: VOICE },
  "copy.count": { family: "numbers in copy", like: "likes concrete numbers", dislike: "avoids numbers in copy" },
  "copy.hedge": { family: "hedged copy", like: "likes hedged copy (maybe, seems)", dislike: "prefers direct copy over hedged", prior: -0.3, because: VOICE },
  "copy.punchy": { family: "punchy copy", like: "likes punchy, playful copy", dislike: "avoids punchy, playful copy", prior: -0.7, because: "no clever taglines" },
  "copy.ai_phrase": { family: "AI-sounding phrases", like: "likes marketing phrases (seamless, magic)", dislike: "dislikes copy that sounds AI-written", prior: -0.9, because: "nothing that sounds like AI-written copy" },
  "copy.em_dash": { family: "em dashes", like: "likes em dashes", dislike: "avoids em dashes", prior: -0.3, because: "nothing that sounds like AI-written copy" },
  "copy.question": { family: "questions", like: "likes questions in copy", dislike: "avoids questions in copy" },
  "copy.ellipsis": { family: "ellipses", like: "likes ellipses", dislike: "avoids ellipses" },
  "copy.sep_dot": { family: "the · separator", like: "likes the · separator", dislike: "avoids the · separator" },
  "copy.button.one_word": { family: "1-word buttons", like: "prefers 1-word buttons", dislike: "prefers buttons with more than 1 word", prior: 0.3, because: "short verbs" },
  "copy.button.three_plus": { family: "long buttons", like: "likes buttons of 3 words or more", dislike: "avoids buttons of 3 words or more", prior: -0.4, because: "short verbs" },

  "tool.density=compact": { family: "density", like: "likes compact tools", dislike: "dislikes compact tools", prior: -0.3, because: "dislikes clutter" },
  "tool.density=spacious": { family: "density", like: "likes roomy tools", dislike: "dislikes roomy tools" },
  "tool.accent=minimal": { family: "accent color", like: "likes tools with little blue", dislike: "wants Meta blue on the main action" },
  "tool.accent=full": { family: "accent color", like: "likes lots of blue", dislike: "dislikes blue on things you cannot tap", prior: -0.4, because: "dislikes anything that looks tappable but is not" },
  "tool.radius=4": { family: "corner radius", like: "likes sharp corners (4 px)", dislike: "dislikes sharp corners (4 px)", prior: -0.3, because: "must feel native to Meta's apps" },
  "tool.radius=16": { family: "corner radius", like: "likes round corners (16 px)", dislike: "dislikes round corners (16 px)", prior: -0.2, because: "must feel native to Meta's apps" },
  "tool.avatar=20": { family: "avatar size", like: "likes small avatars", dislike: "dislikes small avatars" },
  "tool.avatar=32": { family: "avatar size", like: "likes large avatars", dislike: "dislikes large avatars" },
  "tool.progress=off": { family: "progress bars", like: "prefers tools without a progress bar", dislike: "wants the progress bar" },
  "tool.celebrate=color": { family: "celebrations", like: "likes a color change when something lands", dislike: "dislikes a color change when something lands" },
  "tool.celebrate=burst": { family: "celebrations", like: "likes a burst when something lands", dislike: "dislikes bursts", prior: -0.2, because: "tools over toys" },
  "tool.motion=none": { family: "tool motion", like: "likes tools with no motion", dislike: "wants tools to move", prior: -0.3, because: "varied and alive rather than templated" },
  "tool.motion=springy": { family: "tool motion", like: "likes springy tools", dislike: "dislikes springy tools" },
  "tool.mode=dark": { family: "dark mode", like: "likes tools in dark mode", dislike: "prefers tools in light mode" },

  "motion.family=spring": { family: "springs vs curves", like: "prefers springs to fixed curves", dislike: "prefers fixed curves to springs" },
  "motion.dur=fast": { family: "motion speed", like: "likes fast motion (under 200 ms)", dislike: "finds motion under 200 ms too fast" },
  "motion.dur=slow": { family: "motion speed", like: "likes slow motion (400-700 ms)", dislike: "finds 400-700 ms motion too slow" },
  "motion.dur=very_slow": { family: "motion speed", like: "likes very slow motion (over 700 ms)", dislike: "finds motion over 700 ms too slow", prior: -0.4, because: "notices sloppy motion" },
  "motion.overshoot=small": { family: "overshoot", like: "likes a little overshoot", dislike: "dislikes even a little overshoot" },
  "motion.overshoot=large": { family: "overshoot", like: "likes bouncy overshoot", dislike: "dislikes bouncy overshoot", prior: -0.3, because: "tools over toys" },
  "motion.curve=linear": { family: "linear motion", like: "likes linear motion", dislike: "dislikes linear motion", prior: -0.4, because: "notices sloppy motion" },
  "motion.curve=ease_in": { family: "ease-in motion", like: "likes motion that starts slow", dislike: "dislikes motion that starts slow", prior: -0.3, because: "notices sloppy motion" },
  "motion.platform=meta": { family: "motion source", like: "likes Meta's own motion (FDS, Rebound, Pop)", dislike: "dislikes Meta's own motion curves", prior: 0.2, because: "must feel native to Meta's apps" },
  "motion.platform=ios": { family: "motion source", like: "likes iOS motion", dislike: "dislikes iOS motion" },
  "motion.platform=material": { family: "motion source", like: "likes Material motion", dislike: "dislikes Material motion" },

  "screen.platform=desktop": { family: "phone vs desktop screens", like: "likes the desktop screens more", dislike: "likes the phone screens more" },
  "screen.mode=dark": { family: "dark screens", like: "likes dark mode screens", dislike: "prefers light mode screens" },
};

/** Description of a feature, including generated ones (pieces, screen views, transitions, roles). */
export function info(name: string): FeatureInfo {
  const r = R[name];
  if (r) return r;
  const [k, v = ""] = name.split("=");
  const nice = v.replace(/[-_]/g, " ");
  if (name.startsWith("type.") || k === "copy.role") return { family: name, like: "", dislike: "", hidden: true };
  if (k === "tool.piece") return { family: `the ${nice} tool`, like: `likes the ${nice} tool`, dislike: `dislikes the ${nice} tool` };
  if (k === "screen.view") return { family: `the ${nice} screen`, like: `likes the ${nice} screen`, dislike: `dislikes the ${nice} screen` };
  if (k === "motion.transition") return { family: `the ${nice} motion`, like: `likes the ${nice} motion`, dislike: `dislikes the ${nice} motion` };
  return { family: name, like: `likes ${name}`, dislike: `dislikes ${name}` };
}

/** Prior mean and standard deviation for a feature. Intercepts are wide; stated tastes are weak. */
export function priorOf(name: string): { mean: number; sd: number } {
  if (name.startsWith("type.") || name.startsWith("copy.role=")) return { mean: 0, sd: 2 };
  return { mean: R[name]?.prior ?? 0, sd: 1 };
}

export const KNOWN_FEATURES = Object.keys(R);
