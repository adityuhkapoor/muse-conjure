// Element factory. `h(type, props, ...children)` and the automatic JSX runtime both build VNodes.

export type Child = VEl | string | number | boolean | null | undefined | Child[];
export type Component<P = any> = (props: P) => Child;
export type VEl = {
  t: string | Component | typeof Fragment;
  p: Record<string, any>;
  k: unknown;
  c: Child[];
  /** Rendered DOM node (set by the renderer). */
  d?: Node | undefined;
  /** Expanded output of a component, or normalized children of an element. */
  r?: VNode[] | undefined;
};
/** Normalized node: element or text. */
export type VNode = VEl | { t: 0; v: string; k?: unknown; d?: Node | undefined; r?: undefined };

export const Fragment = (p: { children?: Child }): Child => p.children;

export function h(t: VEl["t"], props?: Record<string, any> | null, ...c: Child[]): VEl {
  const p = props ?? {};
  return { t, p, k: p.key, c: c.length ? c : p.children === undefined ? [] : [p.children] };
}

/** Flatten children, drop holes, wrap text. */
export function norm(c: Child, out: VNode[] = []): VNode[] {
  if (Array.isArray(c)) for (const x of c) norm(x, out);
  else if (c == null || typeof c === "boolean") {
    // hole
  } else if (typeof c === "object") out.push(c);
  else out.push({ t: 0, v: String(c) });
  return out;
}
