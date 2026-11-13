// Report shape. docs/CONTRACTS.md section 5: `{ ok, stage, failures: [{ rule, message, trace? }], timings }`.
// Fields beyond that (warnings, mutation, weak, ran) are additive.

export const STAGES = ["typecheck", "static", "determinism", "invariants", "mutation", "render", "copy"] as const;
export type StageName = (typeof STAGES)[number];

/** One step of a failing run, in the order it happened. Replaying these steps reproduces the failure. */
export type TraceStep =
  | { step: "act"; user: string; action: unknown; seq?: number }
  | { step: "garbage"; user: string; action: unknown }
  /** The host recorded a new member list (`@members`): these ids are in the chat now. */
  | { step: "members"; members: string[] }
  /** The network carried this user's next message to the server; cseq 0 is the hello. */
  | { step: "deliver"; user: string; cseq: number }
  /** This user's replica took the next message from the server: an entry, or a welcome up to seq. */
  | { step: "receive"; user: string; seq: number }
  | { step: "disconnect"; user: string }
  | { step: "reconnect"; user: string }
  | { step: "settle" };

export type Failure = {
  rule: string;
  message: string;
  /** Shortest failing action sequence found (stages 3-5). */
  trace?: TraceStep[];
  /** 1-based line in the submitted source, when the rule points at code. */
  line?: number;
  /** Optional extra detail: the offending state, the invariant name, the mutant. */
  detail?: Record<string, unknown>;
  /** The smallest concrete change that should make this failure go away. */
  fix?: string;
  /** Render failures: a cropped PNG of the offending region, the box outlined. */
  image?: string;
  /** The same crop as a data URL, when `images` is set. */
  imageData?: string;
};

export type MutationSummary = {
  /** Mutants generated (capped). */
  total: number;
  /**
   * Mutants that, at some step, produced a state that is neither the original's result nor a
   * no-op (the denominator). Only these can be caught by state invariants.
   */
  observable: number;
  /** Mutants that changed behaviour only by ignoring actions; no state invariant can catch them. */
  inert: number;
  /** Observable mutants caught by at least one invariant. */
  killed: number;
  /** killed / observable, 1 when nothing was observable. */
  score: number;
  threshold: number;
  /** Invariant name to number of mutants it caught. */
  kills: Record<string, number>;
  survivors: { op: string; line: number; before: string; after: string }[];
};

export type Report = {
  ok: boolean;
  /** First stage that failed, or "done" when every stage passed. */
  stage: StageName | "done";
  failures: Failure[];
  warnings: Failure[];
  /** Milliseconds per stage, plus `total`. */
  timings: Record<string, number>;
  mutation?: MutationSummary;
  /** Invariants and transitions that caught no mutant. */
  weak?: string[];
  /** Stages that actually ran. */
  ran: StageName[];
};

export type VerifyOptions = {
  /** Stages to skip, e.g. to prove a later stage catches what an earlier one would. */
  skip?: StageName[];
  /** Sequences for stage 4. Contract: about 200. */
  runs?: number;
  /** Sequences per mutant in stage 5. */
  mutantRuns?: number;
  /** Max mutants. */
  maxMutants?: number;
  /** Mutation score below this fails the gate. */
  mutationThreshold?: number;
  /** fast-check seed, for reproducible reports. */
  seed?: number;
  /** Source size limit in bytes. */
  maxSourceBytes?: number;
  /** State size limit in bytes of canonical JSON. */
  maxStateBytes?: number;
  /** Per-stage wall clock limit for runtime stages (ms). */
  stageTimeoutMs?: number;
  /** Run every stage even after a failure (failures from all stages are listed). */
  all?: boolean;
  /**
   * "default": the rules the gate has always enforced block; newer rules that are cheap run as
   * warnings, the data-shape states do not run. "strict": every rule blocks and the render stage
   * also mounts the empty, minimal, overloaded and finished states.
   */
  profile?: "default" | "strict";
  /** Height budget in px at rest (default 420, the chat budget; 600 for a story or reel frame). Applies to the rest frames and every data-shape state. */
  heightBudget?: number;
  /** Per-rule override of the profile: "error" blocks, "warn" reports, "off" drops. */
  rules?: Record<string, "error" | "warn" | "off">;
  /** Add a data URL of each render crop to its failure. */
  images?: boolean;
  /** Folder for render crops, or false for none. Default: a temp folder. */
  artifacts?: string | false;
};

export const DEFAULTS = {
  runs: 200,
  mutantRuns: 50,
  maxMutants: 20,
  mutationThreshold: 0.5,
  seed: 0x5eed,
  maxSourceBytes: 48 * 1024,
  maxStateBytes: 64 * 1024,
  stageTimeoutMs: 4000,
} as const;
