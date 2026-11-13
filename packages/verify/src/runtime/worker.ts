// Worker thread entry: runs one runtime task per message.
import { determinism, fuzz, mutants } from "./tasks.ts";
import { coverageStates } from "../coverage/states.ts";

declare const self: Worker;

self.onmessage = (ev: MessageEvent) => {
  const { id, task, args } = ev.data as { id: number; task: string; args: any[] };
  try {
    const out =
      task === "determinism" ? determinism(args[0], args[1])
      : task === "fuzz" ? fuzz(args[0], args[1])
      : task === "mutants" ? mutants(args[0], args[1], args[2])
      : task === "coverage" ? coverageStates(args[0], args[1])
      : (() => { throw new Error(`unknown task ${task}`); })();
    self.postMessage({ id, ok: true, out });
  } catch (e) {
    self.postMessage({ id, ok: false, error: e instanceof Error ? e.stack ?? e.message : String(e) });
  }
};
