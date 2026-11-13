// Meta-native components. Every value comes from theme tokens via CSS variables (see theme.ts,
// cssVars), so a theme switch restyles without re-rendering. Measurements: the design notes,
// the design notes section 5. Visible buttons are 36 px; every hit area is at least 44.

import type { Member } from "@muse/protocol";
import { h, type Child } from "./h.ts";
import { addCanvas, ctx, memberOf, type Draw } from "./ctx.ts";
import { userColor } from "./theme.ts";

const v = (n: string) => `var(--${n})`;
const cls = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

/** Shared stylesheet for the root and all components. */
export const css = `.m-root{font:${v("type-body")}/20px ${v("font")};color:${v("color-text")};background:${v("color-card")};padding:${v("space-card")};position:relative;overflow:hidden;-webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent}
:where(.m-root) *{box-sizing:border-box}
:where(.m-root) :is(h1,h2,h3,h4,p){margin:0}
:where(.m-root) :is(h1,h2,h3){font-size:${v("type-title")};line-height:20px;font-weight:600}
:where(.m-root) small{font-size:${v("type-meta")};line-height:16px;color:${v("color-secondaryText")}}
:where(.m-root) input,:where(.m-root) select,:where(.m-root) textarea{font:inherit;color:inherit;background:${v("color-input")};border:0;border-radius:${v("radius-input")};min-height:44px;padding:10px 12px;outline:0;width:100%;min-width:0}
:where(.m-root) input:focus-visible,:where(.m-root) button:focus-visible{box-shadow:0 0 0 2px ${v("color-primary")}}
:where(.m-root) input::placeholder{color:${v("color-secondaryText")}}
:where(.m-root) button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;touch-action:manipulation}
.m-btn{position:relative;display:inline-flex;min-width:44px;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 12px;border-radius:${v("radius-button")};font-weight:600;white-space:nowrap;background:${v("color-secondaryButton")};color:${v("color-secondaryButtonText")}}
.m-btn::after{content:"";position:absolute;inset:-4px 0}
.m-hit::after{content:"";position:absolute;inset:-4px}
.m-btn:hover{box-shadow:inset 0 0 0 99px ${v("color-hover")}}.m-btn:active{box-shadow:inset 0 0 0 99px ${v("color-pressed")}}
.m-btn.p{background:${v("color-primary")};color:${v("color-onPrimary")}}
.m-btn.d{background:${v("color-deemphasizedButton")};color:${v("color-deemphasizedButtonText")}}
.m-btn.w{display:flex;width:100%}
.m-btn:disabled{background:${v("color-secondaryButton")};color:${v("color-disabledText")};cursor:default;box-shadow:none}
.m-av{display:inline-flex;flex:none;align-items:center;justify-content:center;border-radius:50%;overflow:hidden;color:#fff;font-weight:600;line-height:1;box-shadow:inset 0 0 0 1px rgba(0,0,0,.1)}
.m-av img{width:100%;height:100%;object-fit:cover}
.m-fp{display:inline-flex;align-items:center;flex:none}
.m-fp>.m-av{box-shadow:0 0 0 2px ${v("color-card")}}
.m-fp>.m-av+.m-av{margin-left:calc(var(--s)*-.3)}
.m-more{margin-left:4px;padding:0 6px;height:calc(var(--s)*.8);display:inline-flex;align-items:center;border-radius:99px;background:${v("color-secondaryButton")};font-size:12px;font-weight:600}
.m-pg{height:6px;border-radius:3px;background:${v("color-track")};overflow:hidden}
.m-pg>i{display:block;height:100%;border-radius:3px;background:${v("color-primary")};transition:width ${v("motion-slow")} cubic-bezier(.17,.17,0,1)}
.m-meta{font-size:${v("type-meta")};line-height:16px;color:${v("color-secondaryText")}}
.m-opt{position:relative;display:flex;gap:10px;width:100%;min-width:0;text-align:left;padding:8px 4px;border-radius:8px;min-height:48px}
.m-opt:hover{background:${v("color-hover")}}
.m-sel{flex:none;width:20px;height:20px;margin-top:0;border-radius:50%;box-shadow:inset 0 0 0 2px ${v("color-divider")};display:flex;align-items:center;justify-content:center;color:${v("color-onPrimary")}}
.m-opt.on .m-sel{background:${v("color-primary")};box-shadow:none}
.m-opt>span:last-child{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.m-row{display:flex;align-items:center;gap:8px;min-height:20px}
.m-row>b{flex:1;min-width:0;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.m-sug{flex:none;font-size:${v("type-meta")};line-height:16px;font-weight:400;color:${v("color-secondaryText")}}
.m-row>em{font-style:normal;font-size:${v("type-meta")};font-weight:600;color:${v("color-secondaryText")};min-width:12px;text-align:right}
.m-ch{display:flex;align-items:center;gap:8px;margin-bottom:8px;min-height:36px;min-width:0}
.m-mark{flex:none;width:20px;height:20px;border-radius:50%;background:conic-gradient(#0365EC,#B377EE,#EB81ED,#0365EC,#20FBEB,#0365EC);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 4px),#000 calc(100% - 3.5px));mask:radial-gradient(farthest-side,transparent calc(100% - 4px),#000 calc(100% - 3.5px))}
.m-ch>div{flex:1;min-width:0}
.m-ch b{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;font-weight:600;overflow:hidden;overflow-wrap:anywhere}
.m-ch .m-hit{position:relative;width:36px;height:36px;border-radius:50%;color:${v("color-secondaryText")};font-weight:700;letter-spacing:1px}
.m-ch .m-hit:hover{background:${v("color-hover")}}
.m-rsvp{display:flex;justify-content:space-around}
.m-rsvp>button{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:72px;padding:4px 0;font-size:${v("type-meta")};line-height:16px;font-weight:600}
.m-rsvp i{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${v("color-secondaryButton")};color:${v("color-text")}}
.m-rsvp .on{color:${v("color-primary")}}.m-rsvp .on i{background:${v("color-primary")};color:${v("color-onPrimary")}}
.m-tw{display:grid;grid-template-rows:0fr;justify-items:center;animation:m-t 2.4s cubic-bezier(.14,1,.34,1) forwards;pointer-events:none}
.m-tw>div{overflow:hidden;min-height:0}
.m-toast{margin-top:8px;max-width:100%;padding:8px 14px;border-radius:99px;background:${v("color-toast")};color:${v("color-onToast")};font-size:${v("type-meta")};line-height:16px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@keyframes m-t{0%{grid-template-rows:0fr;opacity:0}8%,88%{grid-template-rows:1fr;opacity:1}100%{grid-template-rows:0fr;opacity:0}}
.m-sys{text-align:center;font-size:${v("type-meta")};line-height:16px;color:${v("color-secondaryText")};padding:4px 12px}
.m-sys b{font-weight:600}
.m-cv{display:block;width:100%}`;

const icon = (d: string, size = 12) =>
  h("svg", { width: size, height: size, viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" }, h("path", { d }));
const CHECK = "M2.5 6.2 5 8.6l4.5-5";

type Click = (e: MouseEvent) => void;

/** Meta button: 36 px high, radius 8, 15 semibold. One `primary` per card; `deemphasized` is blue text on light blue. */
export function Button(p: { kind?: "primary" | "secondary" | "deemphasized"; onClick?: Click; disabled?: boolean; wide?: boolean; label?: string; children?: Child }) {
  return h("button", { type: "button", class: cls("m-btn", p.kind === "primary" && "p", p.kind === "deemphasized" && "d", p.wide && "w"), onClick: p.onClick, disabled: !!p.disabled }, p.children ?? p.label);
}

/** A person's photo, or their initial on a stable color. `user` is a member id or Member. */
export function Avatar(p: { user: string | Member; size?: number }) {
  const m = memberOf(p.user), s = p.size ?? 24;
  return h(
    "span",
    { class: "m-av", title: m.name, style: { width: s, height: s, fontSize: Math.round(s * 0.45), background: ctx.theme ? userColor(m.id, ctx.theme) : v("color-primary") } },
    m.avatar ? h("img", { src: m.avatar, alt: "" }) : (m.name.trim()[0] ?? "?").toUpperCase(),
  );
}

/** Overlapping avatars (30%), card-colored ring, then a "+N" pill. */
export function Facepile(p: { users: readonly (string | Member)[]; max?: number; size?: number }) {
  const max = p.max ?? 3, s = p.size ?? 20, extra = p.users.length - max;
  return h(
    "span",
    { class: "m-fp", style: { "--s": s + "px" }, "aria-label": p.users.map((u) => memberOf(u).name).join(", ") },
    p.users.slice(0, max).map((u) => h(Avatar, { key: typeof u === "string" ? u : u.id, user: u, size: s })),
    extra > 0 && h("span", { class: "m-more" }, "+" + extra),
  );
}

/** 6 px rounded bar, primary on track. `label` goes underneath in 13 px secondary ("$250 of $300 · 6 chipped in"). */
export function Progress(p: { value: number; max: number; label?: Child }) {
  const f = p.max > 0 ? Math.min(1, Math.max(0, p.value / p.max)) : 0;
  const name = typeof p.label === "string" ? p.label : `${p.value} of ${p.max}`;
  const bar = h("div", { class: "m-pg", role: "progressbar", "aria-label": name, "aria-valuenow": p.value, "aria-valuemax": p.max }, h("i", { style: { width: f * 100 + "%" } }));
  return p.label == null ? bar : h("div", { style: { display: "grid", gap: 6 } }, bar, h("span", { class: "m-meta" }, p.label));
}

/** Poll or claim row: selection circle, label, voters' faces and a count, thin bar for count/total. `suggested` adds a quiet "Suggested" tag: Muse proposed it, nobody in the chat said it. */
export function OptionRow(p: { label: Child; count: number; total: number; voters?: readonly (string | Member)[]; selected?: boolean; suggested?: boolean | undefined; onClick?: Click }) {
  return h(
    "button",
    { type: "button", class: cls("m-opt", p.selected && "on"), onClick: p.onClick, "aria-pressed": !!p.selected },
    h("span", { class: "m-sel" }, p.selected && icon(CHECK)),
    h(
      "span",
      null,
      h("span", { class: "m-row" }, h("b", null, p.label), p.suggested ? h("small", { class: "m-sug" }, "Suggested") : null, p.voters?.length ? h(Facepile, { users: p.voters, max: 3, size: 20 }) : null, h("em", null, String(p.count))),
      h(Progress, { value: p.count, max: p.total }),
    ),
  );
}

/** Card header: Muse mark, title (15 semibold), optional subtitle (13 secondary), optional ··· button. */
export function CardHeader(p: { title: Child; subtitle?: Child; onMore?: Click }) {
  return h(
    "div",
    { class: "m-ch" },
    h("span", { class: "m-mark", "aria-hidden": "true" }),
    h("div", null, h("b", null, p.title), p.subtitle != null && h("span", { class: "m-meta" }, p.subtitle)),
    p.onMore && h("button", { type: "button", class: "m-hit", "aria-label": "More", onClick: p.onMore }, "···"),
  );
}

export type RsvpValue = "going" | "maybe" | "no";
const RSVP: [RsvpValue, string, string][] = [
  ["going", "Going", CHECK],
  ["maybe", "Maybe", "M4.3 4.4a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1v.3M6 9.4v.1"],
  ["no", "Can't go", "M3 3l6 6M9 3 3 9"],
];

/** Event RSVP: three circles Going / Maybe / Can't go; the chosen one turns primary. `counts` adds "· 4". */
export function Rsvp(p: { value?: RsvpValue | null; onChange: (v: RsvpValue) => void; counts?: Partial<Record<RsvpValue, number>> }) {
  return h(
    "div",
    { class: "m-rsvp", role: "group" },
    RSVP.map(([k, label, d]) =>
      h(
        "button",
        { key: k, type: "button", class: p.value === k ? "on" : undefined, "aria-pressed": p.value === k, onClick: () => p.onChange(k) },
        h("i", null, icon(d, 16)),
        p.counts?.[k] != null ? `${label} · ${p.counts[k]}` : label,
      ),
    ),
  );
}

/** Dark pill in the flow where you place it (usually last). Opens, then closes itself after 2.4 s; it never covers content. A new `key` shows it again. */
export function Toast(p: { children?: Child; text?: string }) {
  return h("div", { class: "m-tw", role: "status" }, h("div", null, h("div", { class: "m-toast" }, p.children ?? p.text)));
}

/** Centered 13 px grey line with a bold actor: <SystemLine actor="Maya">spun the wheel</SystemLine>. */
export function SystemLine(p: { actor?: Child; children?: Child }) {
  return h("p", { class: "m-sys" }, p.actor != null && h("b", null, p.actor), p.actor != null && " ", p.children);
}

export type PointerInfo = { type: "down" | "move" | "up"; x: number; y: number };

/**
 * Full-width 2D canvas. `draw(ctx, { now, width, height, theme })` runs whenever `draw` changes;
 * return true to be drawn again next tick (while animating). Coordinates are CSS px. Take colors
 * from `theme.color` or `userColor`. `label` describes the picture for screen readers. With
 * `onPointer`, vertical swipes still scroll the chat; set `drag` for a surface that takes drags
 * in every direction (a draw pad, drag to rank).
 */
export function Canvas(p: { height: number; draw: Draw; onPointer?: (e: PointerInfo) => void; label: string; drag?: boolean }) {
  const ptr = (type: PointerInfo["type"]) =>
    p.onPointer &&
    ((e: PointerEvent) => {
      const r = (e.currentTarget as Element).getBoundingClientRect();
      if (type === "down")
        try {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        } catch {}
      p.onPointer!({ type, x: e.clientX - r.left, y: e.clientY - r.top });
    });
  return h("canvas", {
    class: "m-cv",
    // A canvas that takes taps still lets a vertical swipe scroll the chat; only a drag surface (`drag`) keeps every touch.
    style: { height: p.height, touchAction: p.onPointer ? (p.drag ? "none" : "pan-y") : undefined },
    role: "img",
    "aria-label": p.label,
    $_d: p.draw,
    ref: addCanvas,
    onPointerDown: ptr("down"),
    onPointerMove: ptr("move"),
    onPointerUp: ptr("up"),
  });
}
