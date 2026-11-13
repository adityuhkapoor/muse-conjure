// The presenter's control page. Plain HTML, works on a phone or a laptop, light and dark.

export const PAGE = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cast controls</title>
<style>
:root { --bg:#fff; --fg:#050505; --muted:#65676b; --card:#f0f2f5; --line:#ced0d4; --blue:#0866ff; --on:#e7f3ff; --red:#c4122f; }
@media (prefers-color-scheme: dark) { :root { --bg:#18191a; --fg:#e4e6eb; --muted:#b0b3b8; --card:#242526; --line:#3e4042; --blue:#2d88ff; --on:#263951; --red:#ff6b81; } }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:15px/20px system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width:560px; margin:0 auto; padding:16px; }
h1 { font-size:20px; line-height:24px; margin:0 0 4px; }
h2 { font-size:13px; text-transform:none; color:var(--muted); font-weight:600; margin:20px 0 8px; }
.status { color:var(--muted); margin-bottom:12px; }
.row { display:flex; gap:8px; flex-wrap:wrap; }
button { font:inherit; font-weight:600; min-height:44px; padding:0 14px; border-radius:6px; border:0; background:var(--card); color:var(--fg); cursor:pointer; }
button.primary { background:var(--blue); color:#fff; }
button.danger { color:var(--red); }
button[aria-pressed="true"] { background:var(--on); color:var(--blue); }
kbd { font:12px ui-monospace, monospace; color:inherit; opacity:.75; margin-left:6px; }
.people { display:grid; gap:6px; }
.person { display:flex; align-items:center; justify-content:space-between; background:var(--card); border-radius:8px; padding:4px 4px 4px 12px; }
.person span { color:var(--muted); font-size:13px; margin-left:8px; }
.next { background:var(--on); border-radius:8px; padding:12px; margin-top:8px; }
.next a { color:var(--blue); font-weight:600; }
ol { list-style:none; padding:0; margin:0; font-size:13px; color:var(--muted); }
ol li { padding:3px 0; border-bottom:1px solid var(--line); }
ol li b { color:var(--fg); font-weight:600; }
.keys { font-size:13px; color:var(--muted); }
</style></head>
<body><main>
<h1>Cast controls</h1>
<div class="status" id="status">Connecting</div>
<div class="row">
  <button class="primary" id="toggle">Pause<kbd>space</kbd></button>
  <button id="next">Next beat<kbd>N</kbd></button>
  <button class="danger" id="stop">Stop all<kbd>esc</kbd></button>
</div>
<h2>Speed</h2>
<div class="row" id="speed"></div>
<h2>Scenes</h2>
<div class="row" id="scenes"></div>
<div id="scene"></div>
<h2>Who is in the cast</h2>
<div class="people" id="people"></div>
<h2>What they did</h2>
<ol id="log"></ol>
<h2>More</h2>
<div class="row"><button id="reset">Reset<kbd>R</kbd></button></div>
<p class="keys">Keys: space pause or resume, N next beat, 1 to 4 scenes, [ and ] speed, shift and a first initial turns a person on or off, esc stops all, S starts again, R resets.</p>
</main>
<script>
let st = null;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
async function act(body) {
  const r = await fetch("/cast/do", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (j.state) { st = j.state; draw(); }
  if (!j.ok) alert(j.error);
  return j;
}
const MODES = { cast: "In the cast", real: "Real phone here", resting: "Back soon", off: "Off" };
const SPEEDS = [["calm", "Calm"], ["normal", "Normal"], ["lively", "Lively"]];
function draw() {
  if (!st) return;
  $("status").textContent = (st.stopped ? "Stopped" : st.paused ? "Paused" : "Playing") + " · " + st.planned + " planned · seed " + st.seed;
  $("toggle").innerHTML = (st.stopped ? "Start again" : st.paused ? "Resume" : "Pause") + "<kbd>" + (st.stopped ? "S" : "space") + "</kbd>";
  $("speed").innerHTML = SPEEDS.map(([k, l]) => '<button data-speed="' + k + '" aria-pressed="' + (st.speed === k) + '">' + l + "</button>").join("");
  $("scenes").innerHTML = st.scenes.map((s) => '<button data-scene="' + s.id + '">' + esc(s.label) + "<kbd>" + s.key + "</kbd></button>").join("");
  $("people").innerHTML = st.people.map((p) => '<div class="person"><div><b>' + esc(p.name) + "</b><span>" + MODES[p.mode] + '</span></div><button data-person="' + p.id + '" aria-pressed="' + p.on + '">' + (p.on ? "On" : "Off") + "</button></div>").join("");
  const s = st.scene;
  $("scene").innerHTML = s ? '<div class="next"><b>Next:</b> ' + esc(s.next) + (s.url ? ' · <a href="' + esc(s.url) + '" target="_blank" rel="noopener">Open chat</a>' : "") + "</div>" : "";
  $("log").innerHTML = st.log.slice().reverse().slice(0, 14).map((e) => "<li>" + (e.ago > 0 ? e.ago + " s ago · " : "now · ") + "<b>" + esc(e.who) + "</b> " + esc(e.text) + "</li>").join("");
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.id === "toggle") act({ do: st && st.stopped ? "start" : "toggle" });
  else if (b.id === "next") act({ do: "next" });
  else if (b.id === "stop") act({ do: "stop" });
  else if (b.id === "reset") { if (confirm("Start the chats over from the seeded state?")) act({ do: "reset" }); }
  else if (b.dataset.speed) act({ do: "speed", value: b.dataset.speed });
  else if (b.dataset.scene) act({ do: "scene", id: b.dataset.scene });
  else if (b.dataset.person) act({ do: "person", id: b.dataset.person, value: b.getAttribute("aria-pressed") !== "true" });
});
document.addEventListener("keydown", (e) => {
  if (!st || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === " ") { e.preventDefault(); act({ do: st.stopped ? "start" : "toggle" }); }
  else if (k === "n" || k === "N" && !e.shiftKey) act({ do: "next" });
  else if (k === "Escape") act({ do: "stop" });
  else if (k === "s" && !e.shiftKey) act({ do: "start" });
  else if (k === "r" && !e.shiftKey) { if (confirm("Start the chats over from the seeded state?")) act({ do: "reset" }); }
  else if (/^[1-9]$/.test(k)) { const s = st.scenes.find((x) => x.key === k); if (s) act({ do: "scene", id: s.id }); }
  else if (k === "[" || k === "]") { const i = SPEEDS.findIndex(([x]) => x === st.speed); const j = Math.max(0, Math.min(2, i + (k === "]" ? 1 : -1))); act({ do: "speed", value: SPEEDS[j][0] }); }
  else if (e.shiftKey && /^[A-Z]$/.test(k)) { const p = st.people.find((x) => x.name[0] === k); if (p) act({ do: "person", id: p.id, value: !p.on }); }
});
async function poll() {
  try { st = await (await fetch("/cast/state")).json(); draw(); } catch { $("status").textContent = "The cast is not running"; }
  setTimeout(poll, 1000);
}
poll();
</script>
</body></html>`;
