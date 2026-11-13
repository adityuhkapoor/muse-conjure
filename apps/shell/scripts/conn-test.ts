/** The Reconnecting line logic (src/phone/conn.ts) with the clock stubbed: quiet for a blip, shown after a couple of seconds, gone when back. */
import assert from "node:assert/strict";

let now = 0;
let tick: () => void = () => {};
const g = globalThis as any;
g.document = { addEventListener() {}, visibilityState: "visible" };
g.addEventListener = () => {};
g.setInterval = (fn: () => void) => ((tick = fn), 1);
Date.now = () => now;
const { watchConnection, onDown } = await import("../src/phone/conn.ts");

const sock = { open: true } as any;
const seen: boolean[] = [];
onDown((d) => seen.push(d));
watchConnection(sock);
tick();
sock.open = false;
now = 1000;
tick();
now = 2800; // 1.8 s down: still quiet
tick();
assert.equal(seen.at(-1), false, "line shown after only 1.8 s");
now = 4000; // 3 s down
tick();
assert.equal(seen.at(-1), true, "line not shown after 3 s");
sock.open = true;
tick();
assert.equal(seen.at(-1), false, "line stays after reconnecting");
console.log("ok conn: Reconnecting line appears after a couple of seconds and clears");
