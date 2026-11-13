// Live tools: mount a compiled app through the real sandbox (@muse/sandbox host handle), with an
// in-page Sequencer standing in for the sync server, the way packages/sandbox's harness does.
// Other people's scripted actions go straight to that server, so the tool shows up mid-flow.

import type { C2S, Member, S2C } from "@muse/protocol";
import type { Theme } from "@muse/app";
import { makeTheme } from "@muse/app/internal";
import { createPool, type AppHandle, type Pool } from "@muse/sandbox";
import { Sequencer, type SequencerConnection } from "@muse/sync/sequencer";
import type { Transport } from "@muse/sync/transport";
import { applyKnobs } from "@muse/taste/knobs";
import type { ToolKnobs } from "@muse/taste";

const server = new Sequencer({ seed: 20261112 });
let pool: Pool | null = null;
let rooms = 0;

function link(): Transport {
  let conn: SequencerConnection | null = null;
  return {
    start(h) {
      const c = server.connect((m: S2C) => queueMicrotask(() => c === conn && h.message(m)));
      conn = c;
      queueMicrotask(() => h.open());
    },
    send(m: C2S) {
      const c = conn;
      if (c) queueMicrotask(() => c.receive(m));
    },
    stop() {
      conn?.close();
      conn = null;
    },
  };
}

export function themeFor(knobs: ToolKnobs, width: number): Theme {
  return applyKnobs(makeTheme(knobs.mode, width, "chat"), knobs);
}

export type Mounted = { handle: AppHandle; destroy(): void };

export function warm(): void {
  pool ??= createPool({ size: 2 });
}

/**
 * Mount a tool into `el`. `onAct` fires when the viewer acts inside it (counts as interacting).
 * Script steps are played by other members after the frame has recorded the members.
 */
export function mountTool(
  el: HTMLElement,
  o: { code: string; me: string; members: Member[]; knobs: ToolKnobs; width: number; script: { user: string; action: unknown }[] },
  on: { act?: () => void; size?: (h: number) => void; error?: (m: string) => void },
): Mounted {
  warm();
  const room = `a:taste-${++rooms}`;
  const handle = pool!.mount(el, { code: o.code, room, me: o.me, members: o.members, theme: themeFor(o.knobs, o.width), transport: link() });
  handle.frame.title = "Live tool";
  handle.onSend((m) => {
    if (m.t === "act") on.act?.();
  });
  handle.onSize((h) => on.size?.(h));
  handle.onError((e) => on.error?.(e.message));
  let stopped = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const conns = new Map<string, { c: SequencerConnection; cseq: number }>();
  (async () => {
    for (let i = 0; i < 100 && !stopped; i++) {
      if (server.log(room).some((e) => (e.action as { t?: string })?.t === "@members")) break;
      await new Promise((r) => setTimeout(r, 40));
    }
    o.script.forEach((step, i) => {
      timers.push(
        setTimeout(() => {
          if (stopped) return;
          let x = conns.get(step.user);
          if (!x) {
            x = { c: server.connect(() => {}), cseq: 0 };
            x.c.receive({ t: "hello", room, client: `other-${step.user}-${room}`, user: step.user, have: 0 });
            conns.set(step.user, x);
          }
          x.c.receive({ t: "act", room, cseq: ++x.cseq, action: step.action });
        }, 120 + i * 260),
      );
    });
  })();
  return {
    handle,
    destroy() {
      stopped = true;
      timers.forEach(clearTimeout);
      for (const x of conns.values()) x.c.close();
      handle.destroy();
    },
  };
}
