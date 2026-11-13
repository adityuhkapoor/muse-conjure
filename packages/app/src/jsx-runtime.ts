// Automatic JSX runtime: tsconfig/oxc `jsxImportSource: "@muse/app"`.

import { h, Fragment, type Child, type VEl } from "./h.ts";

export { Fragment };

export function jsx(type: VEl["t"], props: Record<string, any>, key?: unknown): VEl {
  const v = h(type, props);
  if (key !== undefined) v.k = key;
  return v;
}
export { jsx as jsxs, jsx as jsxDEV };

type Handler<E, Ev> = (e: Ev & { currentTarget: E }) => void;
type Attrs<E> = {
  key?: string | number;
  ref?: (el: E) => void;
  children?: Child;
  class?: string;
  className?: string;
  style?: string | Record<string, string | number | undefined | null>;
  onClick?: Handler<E, MouseEvent>;
  onInput?: Handler<E, InputEvent>;
  onChange?: Handler<E, Event>;
  onKeyDown?: Handler<E, KeyboardEvent>;
  onSubmit?: Handler<E, SubmitEvent>;
  onPointerDown?: Handler<E, PointerEvent>;
  onPointerMove?: Handler<E, PointerEvent>;
  onPointerUp?: Handler<E, PointerEvent>;
  onFocus?: Handler<E, FocusEvent>;
  onBlur?: Handler<E, FocusEvent>;
  [attr: string]: unknown;
};

export namespace JSX {
  export type Element = VEl;
  export type ElementType = string | ((props: any) => Child);
  export interface IntrinsicAttributes {
    key?: string | number;
  }
  export interface ElementChildrenAttribute {
    children: {};
  }
  export type IntrinsicElements = { [K in keyof HTMLElementTagNameMap]: Attrs<HTMLElementTagNameMap[K]> } & {
    [K in Exclude<keyof SVGElementTagNameMap, keyof HTMLElementTagNameMap>]: Attrs<SVGElementTagNameMap[K]>;
  };
}
