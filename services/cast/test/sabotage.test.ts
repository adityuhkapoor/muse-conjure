// Each check is seen failing: with the guard it protects switched off, it must report a problem.
import { describe, expect, test } from "bun:test";
import * as C from "./checks.ts";

const CASES: [string, keyof typeof C, string][] = [
  ["raw arbitrary instead of the chooser", "playsTheTool", "reckless"],
  ["no gap between actions", "rateLimitsHold", "gap"],
  ["unseeded randomness", "sameSeedSameRun", "random"],
  ["pause ignored", "pauseStops", "pause"],
  ["stop all ignored", "stopAllStops", "stop"],
  ["no stepping back", "stepsBack", "no-step-back"],
  ["acting in crowds", "staysOutOfCrowds", "crowd"],
  ["no rate limits", "rateLimitsHold", "rate"],
  ["errors not contained", "badToolsAreContained", "unguarded"],
];

describe("each check fails when its guard is off", () => {
  for (const [name, check, sab] of CASES)
    test(name, async () => {
      let out: string[];
      try {
        out = await (C[check] as (o: object) => Promise<string[]>)({ sabotage: [sab] });
      } catch (e) {
        out = [`threw: ${String(e)}`];
      }
      expect(out.length).toBeGreaterThan(0);
    }, 60_000);
});
