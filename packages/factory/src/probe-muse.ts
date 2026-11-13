// One-off probe of the Muse API: JSON schema output, streaming, tool definitions, error shapes,
// and latency for a ~200-line app. Prints a short summary; never prints the key.
// Usage: bun run probe [model]

import { MUSE_BASE, MuseClient, museKey, outputText, scrub } from "./models/muse.ts";

const model = process.argv[2] ?? "muse-spark-1.3";
const c = new MuseClient({ model });
const shape = (j: unknown) => JSON.stringify(j, (_k, v) => (typeof v === "string" && v.length > 120 ? v.slice(0, 120) + "…" : v)).slice(0, 600);

async function step(name: string, body: Record<string, unknown>, timeoutMs?: number) {
  const r = await c.raw(body, timeoutMs).catch((e: Error) => ({ status: -1, json: null, text: e.message, ms: 0 }));
  const usage = (r.json as { usage?: unknown })?.usage;
  console.log(`\n## ${name}: HTTP ${r.status} in ${r.ms} ms`);
  if (r.status === 200) console.log(`text: ${outputText(r.json).slice(0, 300).replace(/\n/g, "\\n")}`, usage ? `\nusage: ${JSON.stringify(usage)}` : "");
  else console.log(`body: ${r.json ? shape(r.json) : r.text.slice(0, 400)}`);
  return r;
}

const schema = { type: "object", properties: { fruit: { type: "string" }, n: { type: "integer" } }, required: ["fruit", "n"], additionalProperties: false };

await step("json schema, effort low", {
  model,
  instructions: "Answer in JSON.",
  input: "Name one fruit and a number from 1 to 9.",
  reasoning: { effort: "low" },
  text: { format: { type: "json_schema", name: "fruit", schema, strict: true } },
});

// Streaming: read the first bytes and the content type.
{
  const t0 = performance.now();
  const res = await fetch(`${MUSE_BASE}/responses`, {
    method: "POST",
    headers: { authorization: `Bearer ${museKey()}`, "content-type": "application/json" },
    body: JSON.stringify({ model, input: "Count from 1 to 20, one per line.", stream: true, reasoning: { effort: "low" } }),
  });
  const reader = res.body!.getReader();
  let first = -1, chunks = 0, text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (first < 0) first = Math.round(performance.now() - t0);
    chunks++;
    text += new TextDecoder().decode(value);
  }
  const events = [...new Set([...text.matchAll(/^event: (.+)$/gm)].map((m) => m[1]))];
  console.log(`\n## stream: HTTP ${res.status}, ${res.headers.get("content-type")}, first bytes ${first} ms, ${chunks} chunks, total ${Math.round(performance.now() - t0)} ms`);
  console.log(`events: ${events.join(", ").slice(0, 400) || scrub(text.slice(0, 300))}`);
}

await step("function tool definition", {
  model,
  input: "What is the weather in Paris? Use the tool.",
  reasoning: { effort: "low" },
  tools: [{ type: "function", name: "get_weather", description: "Weather for a city", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"], additionalProperties: false }, strict: true }],
}).then((r) => console.log(`output item types: ${JSON.stringify(((r.json as { output?: { type: string }[] })?.output ?? []).map((o) => o.type))}`));

await step("error: unknown model", { model: "muse-nope", input: "hi" });
await step("error: bad schema", { model, input: "hi", text: { format: { type: "json_schema", name: "x", schema: { type: "object", properties: { a: { type: "string" } } }, strict: true } } });
{
  const t0 = performance.now();
  const res = await fetch(`${MUSE_BASE}/responses`, { method: "POST", headers: { authorization: "Bearer not-a-key", "content-type": "application/json" }, body: JSON.stringify({ model, input: "hi" }) });
  console.log(`\n## error: bad key: HTTP ${res.status} in ${Math.round(performance.now() - t0)} ms\nbody: ${(await res.text()).slice(0, 300)}`);
}

for (const effort of ["low", "medium"] as const) {
  await step(`200-line app, effort ${effort}`, {
    model,
    instructions: "You write TypeScript. Reply with one ```tsx code block only.",
    input:
      "Write a ~200 line TypeScript+JSX module for a shared group poll: types, a pure reducer for vote/add/remove/close actions with guards, five invariant functions, a fuzz action generator, and a view with a header, option rows, an add form and a close button. Use plain JSX with inline styles.",
    reasoning: { effort },
  }, 240_000).then((r) => {
    const t = outputText(r.json);
    console.log(`lines: ${t.split("\n").length}`);
  });
}
