// ADAPTER: the factory service. POST /generate streams server-sent events: `progress` events,
// then `done` with the compiled app, `reply` (no tool: a line from Muse instead), or `error`. A dropped stream counts as a failure.

export type GenerateBody = {
  ask: string;
  chat: { title?: string; messages: { from: string; text: string }[] };
  members: { id: string; name: string }[];
  surface: "chat" | "event" | "group" | "feed" | "marketplace" | "gaming" | "story"; // catalysts: every factory surface
  chatId: string;
  /** the tool's message id: the gateway keeps the source that lands under it, for later changes */
  toolId?: string;
  /** who asked (the gateway: a redirect to a change of the chat's Mini is made as them) */
  as?: string;
  /** a library piece to fill directly, with its parameters (no model call) */
  piece?: string;
  params?: Record<string, unknown>;
  model?: string;
};

/** A build that ended without a Mini, with Muse's line for it and why (docs/CONTRACTS.md section 6). */
export class BuildError extends Error {
  constructor(readonly line: string, readonly code: string) {
    super(line);
  }
}

/** Muse's line for each way a build can end without a Mini that the factory did not word itself. */
export const LINES = {
  busy: "Two asks at once. Try that again in a moment",
  failed: "Muse can't reach its model right now. Try again in a moment",
  dropped: "The connection dropped while Muse was making that. Try again",
  too_slow: "That took too long. Try again",
  orphan: "That ask stopped when the page reloaded. Try again",
  change_failed: "Muse couldn't change it. Try again",
} as const;

export type Built = { /** no tool: Muse says this one line in the chat instead (docs/CONTRACTS.md section 6) */ reply?: string; /** why there is no Mini: the reason code (answer, cant_act, wont, greet, change, busy, failed, ...) */ why?: string; /** a Mini offered with the reply */ chip?: { id: string; name: string }; name: string; summary: string; code: string; path: string; ms: number; /** the pre-made tool used ("lab:move-in-day"), for a retry from the next choice */ piece?: string };

export async function generate(url: string, body: GenerateBody, onProgress: (p: { t: string; [k: string]: unknown }) => void, signal?: AbortSignal): Promise<Built> {
  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), ...(signal ? { signal } : {}) });
  } catch {
    throw new BuildError(LINES.failed, "failed");
  }
  if (res.status === 409) throw new BuildError(LINES.busy, "busy");
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new BuildError(j.code && j.error ? j.error : LINES.failed, j.code ?? "failed");
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    let value: string | undefined;
    let done = false;
    try {
      ({ value, done } = await reader.read());
    } catch {
      throw new BuildError(LINES.dropped, "failed");
    }
    if (done) break;
    buf += value;
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const event = /^event: (.*)$/m.exec(chunk)?.[1];
      const data = /^data: (.*)$/m.exec(chunk)?.[1];
      if (!event || data === undefined) continue;
      const d = JSON.parse(data);
      if (event === "progress") onProgress(d);
      else if (event === "done") {
        if (typeof d.code !== "string" || !d.code) throw new Error("factory sent no code");
        return { name: d.name, summary: d.summary ?? "", code: d.code, path: d.path ?? "", ms: performance.now() - t0, ...(typeof d.piece === "string" ? { piece: d.piece } : {}) };
      } else if (event === "reply") {
        return { reply: String(d.text ?? ""), ...(typeof d.code === "string" ? { why: d.code } : {}), ...(d.chip && typeof d.chip.id === "string" ? { chip: { id: d.chip.id, name: String(d.chip.name ?? d.chip.id) } } : {}), name: "", summary: "", code: "", path: "reply", ms: performance.now() - t0 };
      } else if (event === "error") throw new BuildError(typeof d.message === "string" && d.message ? d.message : LINES.failed, typeof d.code === "string" ? d.code : "failed");
    }
  }
  throw new BuildError(LINES.dropped, "failed");
}
