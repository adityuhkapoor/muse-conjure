// The cast: made-up friends who play along when the presenter is alone with one phone.
// `startCast` connects to the sync server and serves the presenter controls.

import { Director, type CastOptions } from "./src/director.ts";
import { startControl, type Control } from "./src/control.ts";
import { wsNet } from "./src/net.ts";
import { museModel } from "./src/model.ts";
import type { Speed } from "./src/personas.ts";

export { Director, CAST_MARK, HERE_MS, LIMITS, type CastOptions, type CastEvent, type Mode } from "./src/director.ts";
export { SCENES } from "./src/scenes.ts";
export { memoryNet, wsNet } from "./src/net.ts";
export { FakeClock, realClock } from "./src/clock.ts";

export type StartCastOptions = {
  /** ws://127.0.0.1:<port>/ws of the sync server */
  ws: string;
  /** controls port; 0 picks one */
  port?: number;
  /** loopback and private addresses only */
  hosts?: string[];
  seed?: number;
  speed?: Speed;
  crowd?: boolean;
  /** model for replies to free-form messages (a Muse model name); off by default */
  model?: string | null;
  logFile?: string;
  appUrl?: string;
  reset?: () => Promise<void>;
  log?: (line: string) => void;
  extra?: Partial<CastOptions>;
};

export type Cast = { director: Director; control: Control; url: string; stop(): void };

export function startCast(o: StartCastOptions): Cast {
  const director = new Director({
    net: wsNet(o.ws),
    seed: o.seed ?? 1,
    speed: o.speed ?? "normal",
    crowd: o.crowd ?? false,
    model: o.model ? museModel(o.model) : null,
    ...(o.logFile ? { logFile: o.logFile } : {}),
    ...(o.appUrl ? { appUrl: o.appUrl } : {}),
    ...(o.reset ? { reset: o.reset } : {}),
    ...(o.log ? { log: o.log } : {}),
    ...(o.extra ?? {}),
  });
  director.start();
  const hosts = (o.hosts ?? ["127.0.0.1"]).filter((h) => h === "127.0.0.1" || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(h));
  const control = startControl(() => director, { port: o.port ?? 0, hosts });
  return {
    director,
    control,
    url: `http://127.0.0.1:${control.port}/cast`,
    stop() {
      control.stop();
      director.close();
    },
  };
}
