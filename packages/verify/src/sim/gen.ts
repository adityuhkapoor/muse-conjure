// fast-check generators for command lists. Commands are plain data so fast-check can shrink them;
// the actions themselves come from the app's `arbitrary` when a command runs.

import fc from "fast-check";
import { type Case, type Cmd, GARBAGE_KINDS } from "./core.ts";

const u = fc.integer({ min: 0, max: 2 });
const s = fc.integer({ min: 0, max: 0xffffffff });

/** A member list: a non-empty subset of the four people who may be in the chat. */
const members = fc.record({ k: fc.constant("members" as const), mask: fc.integer({ min: 1, max: 15 }) });

/** Stage 3 and 5: actions, garbage and member changes, with lag for stale choices. */
export const straightCmd: fc.Arbitrary<Cmd> = fc.oneof(
  { weight: 12, arbitrary: fc.record({ k: fc.constant("act" as const), u, s, lag: fc.oneof({ weight: 3, arbitrary: fc.constant(0) }, { weight: 1, arbitrary: fc.integer({ min: 1, max: 3 }) }) }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant("garbage" as const), u, g: fc.integer({ min: 0, max: GARBAGE_KINDS - 1 }), s }) },
  { weight: 1, arbitrary: members },
);

/** Stage 4: actions, garbage and network steps. */
export const syncCmd: fc.Arbitrary<Cmd> = fc.oneof(
  { weight: 6, arbitrary: fc.record({ k: fc.constant("act" as const), u, s, lag: fc.constant(0) }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant("garbage" as const), u, g: fc.integer({ min: 0, max: GARBAGE_KINDS - 1 }), s }) },
  { weight: 5, arbitrary: fc.record({ k: fc.constant("deliver" as const), u }) },
  { weight: 5, arbitrary: fc.record({ k: fc.constant("recv" as const), u }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant("drop" as const), u }) },
  { weight: 1, arbitrary: members },
  { weight: 1, arbitrary: fc.record({ k: fc.constant("rejoin" as const), u }) },
);

export const caseOf = (cmd: fc.Arbitrary<Cmd>, maxLength: number): fc.Arbitrary<Case> =>
  fc.record({ seed: s, cmds: fc.array(cmd, { minLength: 1, maxLength, size: "max" }) });
