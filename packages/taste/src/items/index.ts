// The stack: every kind of thing to judge, in one list. Each item carries `x`, its features.
import { copyItems, type CopyItem } from "./copy.ts";
import { motionItems, type MotionItem } from "./motion.ts";
import { screenItems, type ScreenItem } from "./screens.ts";
import { toolItems, type ToolItem } from "./tools.ts";

export type Item = CopyItem | ToolItem | MotionItem | ScreenItem;
export type { CopyItem, ToolItem, MotionItem, ScreenItem };

/** Features the model sees for an item: its own plus an intercept for its kind. */
export function featuresOf(item: Item): Record<string, number> {
  return { [`type.${item.kind}`]: 1, ...item.x };
}

export function buildStack(o: { screens?: boolean; screensDir?: string | null } = {}): Item[] {
  const screens = o.screens === false ? [] : o.screensDir !== undefined ? screenItems(o.screensDir) : screenItems();
  return [...copyItems(), ...toolItems(), ...motionItems(), ...screens];
}

export { copyItems, motionItems, screenItems, toolItems };
