import { describe, expect, test } from "bun:test";
import { SCENES } from "../src/scenes.ts";
import { startControl } from "../src/control.ts";
import { castEntries, world } from "./world.ts";

describe("scenes and controls", () => {
  for (const s of SCENES)
    test(`scene: ${s.label}`, async () => {
      const w = await world();
      w.presenter.arrive();
      await w.clock.advance(1000);
      const out = w.director.runScene(s.id);
      await w.clock.advance(out.ms + 5000);
      const chat = w.presenter.room(out.chat);
      await w.clock.advance(100);
      expect(chat.state.created).toBe(true);
      expect(chat.state.members).toContain("noa");
      const said = chat.state.messages.filter((m) => m.kind === "text" || m.kind === "link").length;
      expect(said).toBe(s.lines.length);
      expect(castEntries(w.seq, `t:${out.chat}`).some((e) => (e.action as { t: string }).t === "react")).toBe(true);
      expect(w.director.lastScene?.next).toBe(s.next);
      w.director.close();
    });

  test("the control page and its actions, on loopback only", async () => {
    const w = await world();
    const c = startControl(() => w.director, { port: 0, hosts: ["127.0.0.1"] });
    try {
      const page = await (await fetch(`http://127.0.0.1:${c.port}/cast`)).text();
      expect(page).toContain("Cast controls");
      expect(page).not.toMatch(/<button[^>]*>[^<]*!/);
      const post = (body: object) => fetch(`http://127.0.0.1:${c.port}/cast/do`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
      expect((await post({ do: "pause" })).state.paused).toBe(true);
      expect((await post({ do: "resume" })).state.paused).toBe(false);
      expect((await post({ do: "speed", value: "lively" })).state.speed).toBe("lively");
      expect((await post({ do: "person", id: "dev", value: false })).state.people.find((p: { id: string }) => p.id === "dev").mode).toBe("off");
      expect((await post({ do: "stop" })).state.stopped).toBe(true);
      expect((await post({ do: "nope" })).ok).toBe(false);
    } finally {
      c.stop();
      w.director.close();
    }
  });
});
