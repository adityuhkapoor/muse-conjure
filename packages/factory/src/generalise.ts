// Build the specific thing well, then generalise it. A tool that was built new and scored well
// becomes a library candidate for review:
//
//   1. the model moves every fact from the chat into a `type Params` and a `// @params` block, and
//      writes the meta (use_when, dont_use_when, keywords, guarantees, a strict parameter schema)
//   2. the model writes a second parameter set for a different, made-up chat of the same kind
//   3. the full gate runs on both fillings; both must pass
//   4. library/candidates/<id>/ gets piece.tsx, meta.json (with both examples) and REVIEW.md
//
// Nothing here edits library/pieces: a person promotes a candidate.
//
// CLI: bun src/generalise.ts --run after [--config spark-c] [--min 4] [--limit 3] [--model muse:muse-spark-1.3]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shutdown, verify, warm, type Report } from "@muse/verify";
import { HELDOUT } from "../eval/heldout.ts";
import { extractCode } from "./generate.ts";
import { ROOT } from "./kb.ts";
import { loadScores } from "./judge.ts";
import { makeModel } from "./models/index.ts";
import { chatContext } from "./prompts.ts";
import type { GenerateRequest, ModelClient } from "./types.ts";

export { the design notes, START as PARAMS_START, END as PARAMS_END };
export const CANDIDATES_DIR = join(ROOT, "library", "candidates");

const the design notes = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    use_when: { type: "array", items: { type: "string" } },
    dont_use_when: { type: "array", items: { type: "string" } },
    keywords: { type: "array", items: { type: "string" } },
    guarantees: { type: "array", items: { type: "string" } },
    params_schema_json: { type: "string" },
    example_params_json: { type: "string" },
    example_chat: { type: "string" },
  },
  required: ["id", "name", "use_when", "dont_use_when", "keywords", "guarantees", "params_schema_json", "example_params_json", "example_chat"],
  additionalProperties: false,
};

const START = "// @params\n";
const END = "// @end params";

/** The source with its @params block replaced by these parameters. */
export function refillParams(source: string, params: unknown): string {
  const i = source.indexOf(START), j = source.indexOf(END);
  if (i < 0 || j < i) throw new Error("no // @params block");
  return `${source.slice(0, i + START.length)}const P: Params = ${JSON.stringify(params, null, 2)};\n${source.slice(j)}`;
}

export type CandidateResult = { ok: boolean; id?: string; dir?: string; why: string; reports?: Report[] };

/** A model per step: `code` moves the chat's facts into params, `meta` writes the meta and the second filling. */
export type StepModels = { code: ModelClient; meta: ModelClient };

/** Step 1: the code with its `type Params` and `// @params` block. `typeHint` is a Params type written elsewhere, to be used as it stands. */
export async function generaliseCode(req: GenerateRequest, source: string, model: ModelClient, typeHint?: string): Promise<string> {
  return extractCode(
    await model.complete({
      label: "generalise",
      system: "You turn a small live app written for one group chat into a reusable library piece. Reply with one ```tsx block and nothing else.",
      messages: [
        {
          role: "user",
          content: `This app was written for the chat below and passed the gate. Make it reusable without changing how it looks or behaves:

1. Add \`type Params = { ... }\` with a doc comment per field, then exactly:
// @params
const P: Params = { ...the values from this chat... };
// @end params
2. Every fact from the chat (title, options, items, amounts, names used to find roles, places, times) moves into P. The rest of the code reads P. Nothing else in the file mentions this chat's content.
3. Arrays in P must work from 0 to their sensible maximum; amounts stay integer cents.
4. Keep the state, actions, invariants, transitions, arbitrary and view as they are, apart from reading P.
${typeHint ? `\nUse exactly this type, unchanged, as \`type Params\` (it was written from the same app; every field in it is read by the code):\n\n\`\`\`ts\n${typeHint.trim()}\n\`\`\`\n` : ""}
${chatContext(req)}

\`\`\`tsx
${source.trim()}
\`\`\``,
        },
      ],
    }),
  );
}

export type Meta = Record<string, string | string[]>;

/** Step 2: the meta, and a second parameter set for a different made-up chat. */
export async function generaliseMeta(code: string, model: ModelClient): Promise<Meta> {
  const metaReply = await model.complete({
    label: "generalise-meta",
    system: "You describe a reusable library piece. JSON only, matching the schema.",
    messages: [
      {
        role: "user",
        content: `Describe this piece for the library. \`id\` is short kebab-case. \`use_when\` and \`dont_use_when\` are 3 or 4 plain sentences each, naming the closest other kinds of tool. \`params_schema_json\` is a strict JSON schema (every property required, additionalProperties false) for Params, as a string. \`example_params_json\` is a second parameter set for a different, made-up college group chat of the same kind (different names, options and amounts), as a string; \`example_chat\` is that chat in 3 to 6 lines.\n\n\`\`\`tsx\n${code.trim()}\n\`\`\``,
      },
    ],
    json: { name: "meta", schema: the design notes },
  });
  return JSON.parse(metaReply) as Meta;
}

export async function generalise(req: GenerateRequest, source: string, model: ModelClient | StepModels, note: { score?: number | null; from: string }, opts: { dir?: string } = {}): Promise<CandidateResult> {
  const steps: StepModels = "complete" in model ? { code: model, meta: model } : model;
  const code = await generaliseCode(req, source, steps.code);
  if (!code.includes(START) || !code.includes(END)) return { ok: false, why: "no @params block in the generalised code" };
  const meta = await generaliseMeta(code, steps.meta);
  let example: unknown, schema: unknown;
  try {
    example = JSON.parse(String(meta.example_params_json));
    schema = JSON.parse(String(meta.params_schema_json));
  } catch {
    return { ok: false, why: "meta JSON did not parse" };
  }
  const original = code;
  const second = refillParams(code, example);
  const reports = [await verify(original), await verify(second)];
  const id = String(meta.id).toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 40) || "candidate";
  if (!reports.every((r) => r.ok)) return { ok: false, id, why: `gate failed on ${reports[0]!.ok ? "the second example" : "the original filling"}: ${reports.find((r) => !r.ok)!.failures[0]?.rule ?? ""}`, reports };
  const dir = join(opts.dir ?? CANDIDATES_DIR, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "piece.tsx"), original);
  const pBlock = /\/\/ @params\n([\s\S]*?)\/\/ @end params/.exec(original)?.[1] ?? "";
  writeFileSync(
    join(dir, "meta.json"),
    JSON.stringify({ id, name: meta.name, use_when: meta.use_when, dont_use_when: meta.dont_use_when, keywords: meta.keywords, guarantees: meta.guarantees, params: schema, examples: [example] }, null, 2) + "\n",
  );
  writeFileSync(
    join(dir, "REVIEW.md"),
    [
      `# ${meta.name}`,
      "",
      `Candidate for \`library/pieces/${id}\`. Built new for the ask "${req.ask}" (${note.from}), judge score ${note.score ?? "-"}, then generalised.`,
      "",
      `Gate: original filling ${reports[0]!.ok ? "pass" : "fail"} (mutation ${reports[0]!.mutation?.score ?? "-"}), second example ${reports[1]!.ok ? "pass" : "fail"} (mutation ${reports[1]!.mutation?.score ?? "-"}).`,
      "",
      "Second example chat:",
      "",
      ...String(meta.example_chat).split("\n").map((l) => `> ${l}`),
      "",
      "To promote: move the folder to `library/pieces/`, add 3 retrieval asks to `library/test/retrieval-set.ts`, and run `bun test` in `library/`.",
      "",
      "Original parameters:",
      "",
      "```ts",
      pBlock.trim(),
      "```",
      "",
    ].join("\n"),
  );
  return { ok: true, id, dir, why: "both fillings pass the gate", reports };
}

if (import.meta.main) {
  const arg = (k: string, d: string) => {
    const i = process.argv.indexOf(`--${k}`);
    return i >= 0 ? (process.argv[i + 1] ?? d) : d;
  };
  const run = arg("run", "after");
  const min = Number(arg("min", "4"));
  const limit = Number(arg("limit", "3"));
  const configs = arg("config", "spark-c,spark").split(",");
  const model = makeModel(arg("model", "muse:muse-spark-1.3"), { patient: true });
  const picks = loadScores(run)
    .filter((r) => r.ok && r.path === "build" && configs.includes(r.config) && (r.critic ?? 0) >= min && (r.mutation ?? 0) >= 0.8)
    .sort((a, b) => (b.critic ?? 0) - (a.critic ?? 0))
    .slice(0, limit);
  await warm();
  for (const r of picks) {
    const req = HELDOUT.find((a) => a.id === r.ask)!;
    const file = join(import.meta.dir, "..", "eval", "out", run, r.config, `${r.ask}.tsx`);
    if (!existsSync(file)) continue;
    try {
      const res = await generalise(req, readFileSync(file, "utf8"), model, { score: r.critic, from: `${run}/${r.config}` });
      console.log(`${res.ok ? "candidate" : "skipped"} ${r.config}/${r.ask}: ${res.id ?? ""} · ${res.why}${res.dir ? ` · ${res.dir}` : ""}`);
    } catch (e) {
      console.log(`error ${r.config}/${r.ask}: ${(e as Error).message.slice(0, 200)}`);
    }
  }
  await shutdown();
}
