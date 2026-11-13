// CheckReport: JSON-serialisable. Traces use the gate's TraceStep (packages/verify/src/report.ts);
// `act` steps also carry the abstract `time` and `seed` they ran with (additive fields).

import type { Failure as GateFailure, TraceStep as GateStep } from "../../verify/src/report.ts";

export type TraceStep = GateStep | { step: "act"; user: string; action: unknown; seq?: number; time?: number; seed?: number };
export type Failure = Omit<GateFailure, "trace"> & { trace?: TraceStep[] };

export type PropertyId =
  | `invariant:${string}`
  | `transition:${string}`
  | "init"
  | "purity"
  | "json"
  | "reduce-throws"
  | "arbitrary"
  | "garbage-breaks-invariant"
  | "deadlock"
  | "goal"
  | "finished-frozen"
  | "duplicate"
  | "membership-leave"
  | "membership-join"
  | "convergence"
  | "race"
  | "optimistic-glitch"
  | "silent-conflict"
  | "pending-seed";

export type PropertyResult = {
  id: PropertyId;
  /** fail and warn carry `failure`, whose trace is the shortest path to it in the explored space. */
  status: "pass" | "fail" | "warn" | "n/a";
  /** How many states, edges or orders it was evaluated on. */
  checked: number;
  failure?: Failure;
  note?: string;
};

export type Profile = {
  name: "default" | "deep" | "custom";
  users: number;
  seeds: number;
  /** Abstract clock ticks, ms after T0. Only used when the tool reads meta.time. */
  ticks: number[];
  maxDepth: number;
  maxStates: number;
  /** Arbitrary-derived actions: stop after this many seeds in a row add nothing new. */
  saturateK: number;
  /** ... or after this many seeds in all. */
  saturateCap: number;
  /** Concurrency: states up to this depth get every pair (and triple) of concurrent actions. */
  concurrencyDepth: number;
  /** Concurrency: conflicting combinations run through the replica, in all, shallowest states first. */
  maxCombos: number;
  triples: boolean;
  /** Wall-clock budget for the state search; running out makes the result bounded. */
  budgetMs: number;
  maxStateBytes: number;
};

export const PROFILES: Record<"default" | "deep", Profile> = {
  default: { name: "default", users: 3, seeds: 2, ticks: [0, 4_000, 7_200_000], maxDepth: 6, maxStates: 1500, saturateK: 12, saturateCap: 64, concurrencyDepth: 1, maxCombos: 80, triples: true, budgetMs: 450, maxStateBytes: 64 * 1024 },
  deep: { name: "deep", users: 4, seeds: 4, ticks: [0, 1_000, 4_000, 7_200_000, 93_600_000], maxDepth: 14, maxStates: 200_000, saturateK: 48, saturateCap: 512, concurrencyDepth: 3, maxCombos: 200_000, triples: true, budgetMs: 600_000, maxStateBytes: 64 * 1024 },
};

export type CheckReport = {
  name: string;
  /** complete: the whole space under a declared action set was explored and nothing failed. */
  verdict: "complete" | "bounded" | "failed";
  ok: boolean;
  /** Why the verdict is bounded rather than complete. */
  bounded: string[];
  profile: Profile;
  stats: { states: number; transitions: number; depth: number; exhausted: boolean; frontier: number; ms: number };
  model: {
    timeSensitive: boolean;
    seedSensitive: boolean;
    symmetry: { used: boolean; note: string };
    actions: {
      source: "declared" | "derived";
      derivations: number;
      meanSeeds: number;
      /** Derivations that hit the seed cap before saturating. */
      capped: number;
      /** Good-Turing estimate of the chance the next seed would have found a new action class. */
      missingMass: { mean: number; max: number };
      meanActions: number;
    };
  };
  properties: PropertyResult[];
  failures: Failure[];
  warnings: Failure[];
  finished: { source: "declared" | "heuristic" | "none"; count: number; example?: TraceStep[] };
  concurrency: { states: number; combos: number; independent: number; orders: number; capped: boolean; nonCommuting: number; silent: number };
  guarantee: string;
};
