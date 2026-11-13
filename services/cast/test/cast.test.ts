// bun test (in services/cast)
import { describe, expect, test } from "bun:test";
import * as C from "./checks.ts";

describe("the cast", () => {
  test("plays the tool in the stuck chat: two friends act, it is picked, a reaction lands", async () => expect(await C.playsTheTool()).toEqual([]));
  test("never two actions in the same instant, never instantly", async () => expect(await C.humanTiming()).toEqual([]));
  test("the same seed gives the same run", async () => expect(await C.sameSeedSameRun()).toEqual([]));
  test("pause stops everything, resume picks up", async () => expect(await C.pauseStops()).toEqual([]));
  test("stop all stops everything", async () => expect(await C.stopAllStops()).toEqual([]));
  test("a real phone as a friend makes the cast step back, and it comes back later", async () => expect(await C.stepsBack()).toEqual([]));
  test("stays out of a chat with two real people", async () => expect(await C.staysOutOfCrowds()).toEqual([]));
  test("rate limits hold for an hour of a presenter typing nonstop", async () => expect(await C.rateLimitsHold()).toEqual([]), 60_000);
  test("tools that throw or loop do not take the service down", async () => expect(await C.badToolsAreContained()).toEqual([]), 30_000);
});
