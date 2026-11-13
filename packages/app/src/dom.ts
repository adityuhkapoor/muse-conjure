// DOM renderer. Components are plain functions and are expanded away before diffing, so the
// reconciler only sees host elements and text. Children are matched by key (or by position among
// unkeyed siblings); matched nodes are patched in place and moved only if out of order.

import { norm, type Child, type VEl, type VNode } from "./h.ts";

type El = Element & { _l?: Record<string, (e: Event) => void>; _v?: VNode[] } & Record<string, any>;

const SVG = "http://www.w3.org/2000/svg";
const UNITLESS = /^(opacity|z-?index|flex(-?grow|-?shrink)?|font-?weight|line-?height|order|zoom)$/i;

/** Expand components and fragments into a flat list of host nodes. */
function expand(c: Child, out: VNode[] = [], key?: string): VNode[] {
  for (let v of norm(c)) {
    if (typeof v.t === "function") {
      const k = v.k == null ? key : (key ?? "") + "\u0001" + String(v.k);
      const start = out.length;
      const p = v.c.length ? { ...v.p, children: v.c.length > 1 ? v.c : v.c[0] } : v.p;
      expand(v.t(p), out, k);
      // Only the keyed component names its output. An unkeyed component nested inside it must
      // not: each would hand the same key to its own node, and duplicate keys orphan DOM nodes.
      if (v.k != null)
        for (let i = start; i < out.length; i++) {
          const n = out[i]!;
          if (n.k == null) out[i] = { ...n, k: out.length - start > 1 ? k + "\u0002" + (i - start) : k };
        }
    } else {
      // A VNode object may be reused by the app (a constant icon), even twice in one render; the
      // renderer writes `d` and `r` on what it is given, so it always works on its own copy.
      out.push({ ...v, d: undefined, r: undefined } as VNode);
    }
  }
  return out;
}

function create(v: VNode, svg: boolean): Node {
  if (v.t === 0) return (v.d = document.createTextNode(v.v));
  const t = v.t as string;
  svg ||= t === "svg";
  const el = (svg ? document.createElementNS(SVG, t) : document.createElement(t)) as El;
  v.d = el;
  for (const k in v.p) prop(el, k, v.p[k], undefined, svg);
  v.r = expand(v.c);
  for (const c of v.r) el.appendChild(create(c, svg && t !== "foreignObject"));
  if (v.p.value != null && t === "select") el.value = v.p.value;
  v.p.ref?.(el);
  return el;
}

function prop(el: El, k: string, v: any, old: any, svg: boolean) {
  if (k === "key" || k === "children" || k === "ref") return;
  if (k === "style") {
    const s = (el as HTMLElement).style;
    if (typeof v === "string" || typeof old === "string" || v == null) {
      s.cssText = typeof v === "string" ? v : "";
      if (typeof v !== "object" || !v) return;
      old = undefined;
    }
    for (const n in old) if (!(v && n in v)) setStyle(s, n, "");
    for (const n in v) if (!old || v[n] !== old[n]) setStyle(s, n, v[n]);
  } else if (k[0] === "o" && k[1] === "n") {
    const n = k.slice(2).toLowerCase();
    const l = (el._l ??= {});
    if (v && !l[n]) el.addEventListener(n, listen);
    if (!v && l[n]) el.removeEventListener(n, listen);
    if (v) l[n] = v;
    else delete l[n];
  } else if (k[0] === "$") el[k.slice(1)] = v;
  else if (k === "class" || k === "className") v == null ? el.removeAttribute("class") : el.setAttribute("class", v);
  else if (k[4] === "-" && (k[0] === "a" || k[0] === "d")) v == null ? el.removeAttribute(k) : el.setAttribute(k, String(v)); // aria-*, data-*: "true"/"false"
  else if (!svg && k in el) el[k] = v ?? (typeof el[k] === "boolean" ? false : "");
  else if (v == null || v === false) el.removeAttribute(k);
  else el.setAttribute(k, v === true ? "" : String(v));
}

function setStyle(s: CSSStyleDeclaration, n: string, v: any) {
  const name = n.includes("-") ? n : n.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
  s.setProperty(name, v == null || v === "" ? "" : typeof v === "number" && !UNITLESS.test(n) ? v + "px" : String(v));
}

function listen(this: El, e: Event) {
  this._l?.[e.type]?.(e);
}

function patch(o: VNode, n: VNode, svg: boolean): Node {
  const d = (n.d = o.d!);
  if (n.t === 0) {
    if ((o as { v: string }).v !== n.v) (d as Text).data = n.v;
    return d;
  }
  const el = d as El;
  svg ||= n.t === "svg";
  const op = (o as VEl).p;
  for (const k in op) if (!(k in n.p)) prop(el, k, undefined, op[k], svg);
  for (const k in n.p) if (n.p[k] !== op[k]) prop(el, k, n.p[k], op[k], svg);
  // `value`/`checked` may have been changed by the user; re-assert the controlled value.
  if ("value" in n.p && el.value !== n.p.value && n.p.value != null) el.value = n.p.value;
  if ("checked" in n.p && el.checked !== !!n.p.checked) el.checked = !!n.p.checked;
  n.r = expand(n.c);
  kids(el, (o as VEl).r ?? [], n.r, svg && n.t !== "foreignObject");
  return el;
}

function kids(parent: Node, old: VNode[], nw: VNode[], svg: boolean) {
  // Old nodes by key, in order. A key the app repeats keeps every node, so none is orphaned.
  const map = new Map<unknown, VNode[]>();
  let u = 0;
  for (const o of old) {
    const key = o.k ?? "\u0000" + u++;
    const q = map.get(key);
    q ? q.push(o) : map.set(key, [o]);
  }
  u = 0;
  let ref: Node | null = parent.firstChild;
  for (const n of nw) {
    const q = map.get(n.k ?? "\u0000" + u++);
    let d: Node;
    if (q?.[0] && q[0].t === n.t) d = patch(q.shift()!, n, svg);
    else d = create(n, svg);
    if (d === ref) ref = ref.nextSibling;
    else parent.insertBefore(d, ref);
  }
  for (const q of map.values()) for (const o of q) (o.d as ChildNode | undefined)?.remove();
}

/** Render `v` into `container`, patching what an earlier render left there. */
export function render(v: Child, container: Element): void {
  const c = container as El;
  const nw = expand(v);
  kids(c, c._v ?? [], nw, c.namespaceURI === SVG);
  c._v = nw;
}
