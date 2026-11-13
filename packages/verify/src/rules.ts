// The rule index: every rule the gate can report, what it means, how it is usually fixed, a
// failing and a passing example (a fixture path or a snippet), and how each profile treats it.
// `bun run verify --rules` prints this as JSON so a prompt can carry the rules a writer trips most.
//
// Profiles: `default` is what the gate has always blocked on, plus cheap newer rules as warnings.
// `strict` blocks on everything and adds the data-shape states. Rules added after the gate was in
// use start as "warn" or "off" in default so a long run calling the gate is never broken mid-way.

import { RULES as COPY_RULES } from "./copy/rules.ts";
import type { Failure, StageName } from "./report.ts";

export type Severity = "error" | "warn" | "off";
export type RuleInfo = {
  id: string;
  stage: StageName;
  means: string;
  fix: string;
  fail: string;
  pass: string;
  default: Severity;
  strict: Severity;
  /** Bug classes (packages/verify/BUG_CLASSES.md) this rule covers. */
  classes?: string[];
};

const R = (id: string, stage: StageName, means: string, fix: string, fail: string, pass: string, def: Severity = "error", classes?: string[]): RuleInfo => ({
  id, stage, means, fix, fail, pass, default: def, strict: "error", ...(classes ? { classes } : {}),
});
const good = "fixtures/good/poll.tsx";

export const RULE_INDEX: RuleInfo[] = [
  R("type-error", "typecheck", "The app does not type-check against @muse/app.", "Fix the type at the line given; API.md has every signature.", "fixtures/bad/type-error.tsx", good),
  R("syntax", "static", "The source does not parse.", "Close the bracket or string the message points at.", "const a = (", "const a = 1;"),
  R("imports-allowed", "static", "Imports other than @muse/app and @muse/library/*.", "Import only from \"@muse/app\".", "fixtures/bad/forbidden-import.tsx", good),
  R("no-time", "static", "Date or performance in the app.", "Use meta.time in reduce and `now`/clock in the view.", "fixtures/bad/date-now.tsx", good),
  R("no-random", "static", "Math.random or crypto.", "Use rng(meta.seed) in reduce.", "fixtures/bad/math-random.tsx", good),
  R("no-timers", "static", "setTimeout, requestAnimationFrame and friends.", "Animate from state.at with running()/tween, or return true from Canvas.draw.", "setTimeout(() => {}, 1);", good),
  R("no-network", "static", "fetch, WebSocket and friends.", "Apps have no network; put the data in params or state.", "fetch('/x');", good),
  R("no-storage", "static", "localStorage, cookies.", "Shared facts go in state, per-viewer ones in local.", "localStorage.getItem('a');", good),
  R("no-intl", "static", "Intl formatting depends on the device.", "Format numbers by hand (cents to \"$12.50\").", "new Intl.NumberFormat();", good),
  R("no-eval", "static", "eval, Function, .constructor.", "Write the code out.", "eval('1');", good),
  R("no-dynamic-import", "static", "import() or import.meta.", "Use a static import from @muse/app.", "import('x');", good),
  R("no-host-globals", "static", "window, document, globalThis and other host names.", "Use only what the view props and @muse/app give.", "document.body;", good),
  R("no-hex-color", "static", "A color literal or color name outside userContent(...).", "Use theme.color.<name> or userColor(member, theme).", "fixtures/bad/hex-color.tsx", good),
  R("source-size", "static", "Source over the size limit.", "Move shared parts into @muse/library pieces.", "(48 KB of source)", good),
  R("app-shape", "static", "No defineApp({ ... reduce ... }).", "Export default defineApp({ name, summary, init, reduce, invariants, arbitrary, view }).", "export default {}", good),
  R("missing-part", "static", "verifyPartial: the defineApp object closed without a required part.", "Add the missing part: name, summary, init, reduce, invariants, arbitrary and view are all required.", "defineApp({ name: \"x\", init, reduce, view })", good, "off"),
  R("compile", "determinism", "The module did not compile.", "Fix the syntax at the line given.", "const a = (", good),
  R("module-load", "determinism", "The module threw while loading.", "Do not run code at module level beyond constants.", "throw new Error()", good),
  R("init-throws", "determinism", "init threw (often with no members yet).", "init must work with ctx.members = [].", "fixtures/bad/init-no-members.tsx", good),
  R("members-throws", "determinism", "init or onMembers threw on a member change.", "Handle people leaving and arriving without throwing.", "fixtures/bad/members-throws.tsx", good),
  R("nondeterministic", "determinism", "The same actions gave different states.", "Remove module-level variables, Date and Math.random from reduce.", "fixtures/bad/sneaky-random.tsx", good),
  R("reduce-throws", "determinism", "reduce threw on an action arbitrary proposed.", "Check every field; return the state unchanged for invalid input.", "fixtures/bad/throws-on-bad-action.tsx", good),
  R("reduce-mutates-input", "determinism", "reduce changed its input.", "Return new objects ({ ...s, x }) instead of assigning.", "fixtures/bad/mutates-state.tsx", good),
  R("state-json", "determinism", "State is not plain JSON.", "No undefined, Map, Set, Date, NaN or functions in state.", "fixtures/bad/non-json-state.tsx", good),
  R("state-size", "determinism", "State grows past the size limit.", "Cap lists (keep the last N).", "fixtures/bad/state-too-big.tsx", good),
  R("timeout", "determinism", "A stage did not finish in time.", "Look for loops that never end.", "fixtures/bad/infinite-loop.tsx", good),
  R("invariant", "invariants", "An invariant failed after a step.", "Fix reduce for the trace, or the invariant if it is wrong.", "fixtures/bad/shares-dont-sum.tsx", good),
  R("transition", "invariants", "A transition failed on a step.", "Make the action do exactly what the transition says.", "fixtures/bad/transition.tsx", good),
  R("garbage-breaks-invariant", "invariants", "A malformed action broke an invariant.", "Type-check every action field in reduce.", "fixtures/bad/garbage-breaks-invariant.tsx", "fixtures/good/garbage-throws.tsx"),
  R("convergence", "invariants", "Replicas ended in different states.", "Keep reduce pure; no module state.", "fixtures/bad/module-state.tsx (with skip: [\"determinism\"])", good),
  R("arbitrary-throws", "invariants", "arbitrary threw.", "Return null when there is nothing to propose.", "arbitrary: () => { throw new Error() }", good),
  R("arbitrary-weak", "mutation", "Fewer than 10 in 100 proposals change state.", "Propose actions that are valid in the given state.", "fixtures/bad/arbitrary-weak.tsx", good),
  R("mutation-score", "mutation", "Invariants and transitions miss broken reducers.", "Add one transition per action saying what it did and that nothing else changed.", "fixtures/bad/always-true-invariant.tsx", good),
  R("render-error", "render", "The view threw.", "Guard optional data in the view.", "fixtures/bad/render-throws.tsx", good),
  R("blank-render", "render", "Nothing visible after mount.", "Render at least a header and a line of text.", "fixtures/bad/render-blank.tsx", good),
  R("clipped-text", "render", "DOM text cut off by its box.", "Let it wrap, or overflow: hidden; text-overflow: ellipsis; white-space: nowrap.", "fixtures/bad/render-clipped.tsx", "fixtures/good/legit-layout.tsx", "error", ["C01"]),
  R("text-overlap", "render", "Two DOM texts overlap.", "Use flow layout (flex/grid with gap), not absolute positions.", "fixtures/bad/render-overlap.tsx", "fixtures/good/legit-layout.tsx", "error", ["C03"]),
  R("outside-app", "render", "Something reaches past the app's edge.", "Size from theme.width; let rows wrap.", "fixtures/bad/render-outside.tsx", "fixtures/good/legit-layout.tsx", "error", ["C02"]),
  R("contrast", "render", "DOM text under WCAG AA contrast.", "Use theme.color.text or secondaryText on card, onPrimary on primary.", "fixtures/bad/render-contrast.tsx", good, "error", ["C04"]),
  R("hit-area", "render", "Tap target under 44x44.", "Use Button, or give the control min 44 px with padding.", "fixtures/bad/render-hit.tsx", good, "error", ["C10"]),
  R("too-tall", "render", "Over the height budget at rest.", "Collapse detail behind a tap; cap lists.", "fixtures/bad/render-tall.tsx", good, "error", ["C07"]),
  R("axe", "render", "axe-core serious or critical violation.", "Follow the axe help text (labels, roles).", "fixtures/bad/render-axe.tsx", good),
  // Newer render rules.
  R("canvas-text-clipped", "render", "Canvas or SVG text cut by the canvas edge, its clip region, or the shape it is drawn in (rotated boxes are measured rotated).", "Fit the label to its room: const f = fitText(label, room, { g }); g.fillText(f.text, x, y) (from @muse/app: shrinks to 10 px, then ends in an ellipsis).", "fixtures/bad/canvas-label-clipped.tsx", "fixtures/good/canvas-wheel.tsx", "warn", ["C01", "C21", "C25"]),
  R("canvas-text-overlap", "render", "Two canvas or SVG labels overlap.", "Lay labels out with measured spacing, or skip labels that do not fit.", "fixtures/bad/canvas-text-overlap.tsx", "fixtures/good/canvas-wheel.tsx", "warn", ["C03", "C25"]),
  R("canvas-text-contrast", "render", "Canvas or SVG text under AA contrast against the pixels under it.", "Draw labels in theme.color.onPrimary on series colors, theme.color.text on card.", "fixtures/bad/canvas-text-contrast.tsx", "fixtures/good/canvas-wheel.tsx", "warn", ["C04", "C25"]),
  R("canvas-text-tiny", "render", "Canvas or SVG text under 8 px (9.5 px for words).", "Use 10 px or more; drop labels that do not fit at that size.", "fixtures/bad/canvas-text-tiny.tsx", "fixtures/good/canvas-wheel.tsx", "warn", ["C08", "C25"]),
  R("painted-over", "render", "A shape drawn after a canvas label covers part of it.", "Draw labels after shapes, or move the badge to the edge.", "fixtures/bad/painted-over.tsx", "fixtures/good/canvas-wheel.tsx", "warn", ["C18"]),
  R("runaway-spin", "render", "Something keeps turning over 2 turns a second without slowing.", "Spin with tween/spring from state.at so it settles; cap speed near 1 turn a second.", "fixtures/bad/runaway-spin.tsx", "fixtures/good/canvas-wheel.tsx", "warn", ["C19"]),
  R("jitter", "render", "A label shakes back and forth on most frames.", "Settle positions; draw from `now` with damping that reaches rest.", "fixtures/bad/jitter.tsx", "fixtures/good/canvas-marquee.tsx", "warn", ["C20"]),
  R("frame-coupled-timing", "render", "Canvas output for the same `now` depends on how many frames ran.", "Compute positions from f.now (and a start time in state), never from counters bumped per draw.", "fixtures/bad/frame-coupled.tsx", "fixtures/good/canvas-marquee.tsx", "warn", ["C11"]),
  R("acts-before-person", "render", "The app sent an action on its own right after opening.", "Dispatch only from a person's tap; show a countdown and let the person act.", "fixtures/bad/acts-on-own.tsx", "fixtures/good/empty-states.tsx", "warn", ["C12"]),
  R("overlay-covers-control", "render", "An enabled control stays covered by another element.", "Put stamps and overlays beside controls, or fade them out within 2 s.", "fixtures/bad/overlay.tsx", "fixtures/good/legit-layout.tsx", "warn", ["C16", "C23"]),
  R("hit-misaligned", "render", "A control's label is drawn outside the area that takes the tap.", "Do not transform a label away from its button; move the button instead.", "fixtures/bad/hit-misaligned.tsx", good, "warn", ["C10"]),
  R("tiny-text", "render", "DOM text under 8 px (9.5 px for words).", "Use theme.type.meta (13 px) for small print; drop text that does not fit.", "fixtures/bad/tiny-text.tsx", good, "warn", ["C08"]),
  R("bad-plural", "render", "\"1 votes\", \"3 people is\".", "Pick the noun by count: n === 1 ? \"vote\" : \"votes\".", "fixtures/bad/plural.tsx", good, "warn", ["C09"]),
  R("blank-label", "render", "A header, option or button shows no words (empty or emoji only).", "Fall back to words when the label is empty or only emoji (\"Untitled\", the person's name).", "fixtures/bad/blank-label.tsx", good, "warn", ["C15"]),
  // Data-shape coverage (strict only: needs the extra states).
  R("empty-state-blank", "render", "In some state the card is mostly blank background.", "Give the empty state a short line and the action that fills it; do not reserve space for a picture that has nothing to draw.", "fixtures/bad/empty-blank.tsx", "fixtures/good/empty-states.tsx", "off", ["C24"]),
  R("no-enabled-action", "render", "In an unfinished state every control shown is disabled (often only a disabled primary). A card with no controls at all is read as a result.", "Offer the action that unblocks the state (Add an option) next to the disabled one.", "fixtures/bad/no-action.tsx", "fixtures/good/empty-states.tsx", "off", ["C24"]),
  R("orphan-decoration", "render", "A pointer or decoration is drawn without its subject (a wheel pointer over no wheel).", "Draw the decoration only when its subject is there; show the empty-state card instead.", "fixtures/bad/orphan-pointer.tsx", "fixtures/good/empty-states.tsx", "off", ["C24"]),
  R("overload-overflow", "render", "With many items and long names, text clips or the card runs past its height budget.", "Cap visible rows with \"and N more\", let labels wrap or ellipsize, fit canvas labels.", "fixtures/bad/overload-long-label.tsx", "fixtures/good/empty-states.tsx", "off", ["C07", "C24"]),
  R("state-layout", "render", "A layout rule fails only in the empty, minimal or finished state.", "Lay out the sparse state on its own terms (shorter card, no reserved space).", "fixtures/bad/empty-tall.tsx", "fixtures/good/empty-states.tsx", "off", ["C24"]),
  R("state-render-error", "render", "The view throws in the empty, minimal, overloaded or finished state.", "Guard empty lists ([0] may be undefined) and missing people.", "fixtures/bad/empty-throws.tsx", "fixtures/good/empty-states.tsx", "off", ["C24"]),
  ...COPY_RULES.map((c) => R(c.id, "copy", c.description, c.examples.pass.text ? `Write it like "${c.examples.pass.text}".` : "", JSON.stringify(c.examples.fail.text), JSON.stringify(c.examples.pass.text), c.id === "no-percent" ? "warn" : "error", c.id === "no-percent" || c.id === "all-caps" || c.id === "sentence-case" ? ["C17"] : undefined)),
];

const BY_ID = new Map(RULE_INDEX.map((r) => [r.id, r]));
export const ruleInfo = (id: string) => BY_ID.get(id);

/** How a profile (plus per-rule overrides) treats a rule. Unknown rules block. */
export function severity(rule: string, profile: "default" | "strict", over?: Record<string, Severity>): Severity {
  if (over?.[rule]) return over[rule]!;
  const r = BY_ID.get(rule);
  if (!r) return "error";
  return profile === "strict" ? r.strict : r.default;
}

/** The smallest concrete change, from the rule and what the failure says. */
export function fixFor(f: Failure): string {
  const d = (f.detail ?? {}) as Record<string, any>;
  const at = Array.isArray(d.at) && d.at.length ? ` at ${d.at[0]}` : "";
  const state = d.state && d.state !== "typical" ? ` in the ${d.state} state` : "";
  const lint = d.lint as string | undefined;
  switch (f.rule === "overload-overflow" || f.rule === "state-layout" ? lint ?? f.rule : f.rule) {
    case "canvas-text-clipped":
      if (d.surface === "svg") return `fit the SVG label to its room: "${d.text}" is ${d.width ?? "?"} px in ${d.room ?? "less"} px${state}${at}; use const f = fitText(label, room) and render f.text at f.size px.`;
      return `fit the label to its room: "${d.text}" is ${d.width} px in a ${d.room} px ${d.by === "shape" ? "shape" : d.by === "clip" ? "clip region" : "canvas"}${state}${at}; draw it with const f = fitText(label, ${d.room}, { g }); g.fillText(f.text, x, y) (fitText is in @muse/app: it shrinks to 10 px, then ends in "…").`;
    case "canvas-text-overlap":
      return `space the labels "${d.a}" and "${d.b}" by their measured widths, or skip the one that does not fit${state}${at}.`;
    case "canvas-text-contrast":
      return `draw "${d.text}" in a color with ${d.need}:1 contrast on ${d.under ?? "what is under it"} (it is ${d.ratio}:1): theme.color.onPrimary on primary or series colors, theme.color.text on card${at}.`;
    case "canvas-text-tiny":
      return `draw "${d.text}" at 10 px or more (it is ${d.px} px)${at}, or leave the label off when it does not fit.`;
    case "tiny-text":
      return `set "${d.text}" at 10 px or more (it is ${d.px} px); theme.type.meta is 13 px.`;
    case "painted-over":
      return `draw "${d.text}" after the shape that covers it, or move that shape off the label${at}.`;
    case "runaway-spin":
      return `the spin runs at ${d.omega} turns a second without slowing: drive the angle with tween({ duration, easing: "decelerate" }) from state.at and stop when it settles.`;
    case "jitter":
      return `"${d.text}" reverses direction on ${d.reversals} of ${d.frames} frames: compute its position from f.now and let it reach rest.`;
    case "frame-coupled-timing":
      return "move every per-frame counter (x += 2 inside draw) to a function of f.now and a start time kept in state.";
    case "acts-before-person":
      return "remove the dispatch from the view body; dispatch only from onClick/onSubmit handlers.";
    case "overlay-covers-control":
      return `move the element that covers the control (${d.by ?? "an overlay"}) beside it, or remove it after 2 s with running(state.at, 2000).`;
    case "hit-misaligned":
      return "keep the label inside its button: drop the transform or offset on the label.";
    case "bad-plural":
      return `say "${String(d.phrase ?? "").replace(/^1 (\w+?)s\b/, "1 $1")}": pick the noun by count, n === 1 ? "vote" : "votes".`;
    case "blank-label":
      return `give the ${d.text ? "emoji-only" : "empty"} label words: fall back to a name or "Untitled" when it has no letters${state}.`;
    case "empty-state-blank":
      return `the card is ${d.fill !== undefined ? Math.round(d.fill * 100) : "?"} in 100 filled with a ${d.band} px blank band${state}${at}: when the main list is empty, show one line saying what to do and the control that does it, and leave out the space for what is not there.`;
    case "no-enabled-action":
      return `${state ? state.slice(1) : "here"} nothing can be tapped${d.disabled?.length ? ` except the disabled "${d.disabled[0]}"` : ""}: show the control that unblocks it (for example an input and Add) beside the disabled button.`;
    case "orphan-decoration":
      return `draw the pointer or decoration only when its subject is there${state}; with no items, show the empty-state card instead of the canvas.`;
    case "too-tall":
      return `${state ? `${state.slice(1)}: ` : ""}cap the list at about 5 rows with "and N more", or collapse details behind a tap, to stay under ${/budget is (\d+)/.exec(f.message)?.[1] ?? 420} px at rest${at}.`;
    case "clipped-text":
      return `let the text wrap, or give it overflow: hidden; text-overflow: ellipsis; white-space: nowrap${state}${at}.`;
    case "text-overlap":
      return `put the two texts in flow (flex or grid with gap) instead of positioning them over each other${state}${at}.`;
    case "outside-app":
      return `size the element from theme.width and let rows wrap${state}${at}.`;
    case "contrast":
      return `use theme.color.text or secondaryText on card, onPrimary on primary${at}.`;
    case "hit-area":
      return "use Button, or make the control at least 44x44 with padding.";
    case "state-render-error":
      return `the view throws${state}: guard empty lists and missing people (xs[0] may be undefined).`;
  }
  const info = BY_ID.get(f.rule);
  if (f.line && info) return `line ${f.line}: ${info.fix}`;
  return info?.fix ?? "";
}
