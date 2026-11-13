// bun run sheet: a contact sheet of every tool a person can reach in the demo, each next to the lab
// original it should look like. Starts its own stack (random ports, fresh temp database, replay
// model), visits every place a tool appears in headless Chrome (phone size, dark then light),
// screenshots the tool card, and writes library/lab/_shots/_sheet/{index.html,sheet.json,sheet-NN.png}.
// A slot that fails to open is recorded with its error and the run goes on.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { chromium, type Page, type Browser, type BrowserContext } from "playwright";
import { startStack } from "../services/demo/stack.ts";
import { PHONE, toolFrame } from "./lib.ts";
import { seedChats } from "../apps/shell/src/store/fake-data.ts";
import { PACK } from "../apps/shell/src/muse/pack.ts";
import { GROUPS, LISTINGS, STORIES } from "../apps/shell/src/surfaces/data.ts";
import { choicesFor, pageFor } from "../services/demo/check-pack.ts";
import { available, build } from "../services/demo/premade.ts";
import { RoomClient } from "../services/demo/proto.ts";
import { TOOLS as SEED_TOOLS } from "../services/demo/seed.ts";
import { chatRoom, INDEX_ROOM, SEED_USER, toolRoom } from "../apps/shell/src/live/chat-reducer.ts";

const ROOT = resolve(import.meta.dir, "..");
const SHOTS = join(ROOT, "library/lab/_shots");
const OUT = join(SHOTS, "_sheet");
const IMG = join(OUT, "img");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(IMG, { recursive: true });

const THEMES = ["dark", "light"] as const;
type Theme = (typeof THEMES)[number];
const T = 60_000; // generous: the machine is loaded

type Row = {
  surface: string;
  where: string;
  /** `lab:<id>`, `piece:<id>`, or "screen" for a full Facebook screen */
  tool: string;
  plain: boolean;
  dark: string | null;
  light: string | null;
  original: string | null;
  error: string | null;
};
const rows: Row[] = [];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const say = (s: string) => console.log(s);

/** `piece:<id>` when it is a library piece, else `lab:<id>`. */
const kindOf = (id: string) => (existsSync(join(ROOT, "library/pieces", id, "piece.tsx")) ? `piece:${id}` : `lab:${id}`);
const originalOf = (tool: string) => {
  const id = tool.split(":")[1] ?? "";
  const p = join(SHOTS, id, "original-rest.png");
  return id && existsSync(p) ? relative(OUT, p) : null;
};

function newRow(surface: string, where: string, tool: string): Row {
  const row: Row = { surface, where, tool, plain: tool.startsWith("piece:"), dark: null, light: null, original: tool === "screen" ? null : originalOf(tool), error: null };
  rows.push(row);
  return row;
}

// ------------------------------------------------------------------ stack and browser

const dir = mkdtempSync(join(tmpdir(), "muse-sheet-"));
say("starting the stack (replay model, fresh temp database, random ports)");
const stack = await startStack({ db: join(dir, "demo.sqlite"), model: "replay", hosts: ["127.0.0.1"], build: process.env.SHEET_NO_BUILD !== "1" && process.env.E2E_NO_BUILD !== "1", log: (l) => say("  " + l) });
const url = `http://127.0.0.1:${stack.gateway.port}/`;
say(`stack up at ${url}`);
const browser: Browser = await chromium.launch({ headless: true });
const ctxs: Record<Theme, BrowserContext> = {} as never;
const pages: Record<Theme, Page> = {} as never;
for (const th of THEMES) {
  ctxs[th] = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: th });
  pages[th] = await ctxs[th].newPage();
  pages[th].setDefaultTimeout(T);
  pages[th].on("pageerror", (e) => say(`  [${th}] page error: ${e.message.slice(0, 160)}`));
}

const href = (th: Theme, q: string, as = "noa") => `${url}?as=${as}&safe=1&theme=${th}${q}`;

async function openChat(th: Theme, chat: string, as = "noa") {
  const p = pages[th];
  await p.goto(href(th, `&chat=${chat}`, as), { timeout: T });
  await p.waitForSelector(".page.push.shown .thread", { timeout: T });
}

const thread = (p: Page) => p.locator(".page.push.shown .thread").last();
const cardOf = (p: Page, toolId: string) => thread(p).locator(`[data-muse-card][data-tool-id="${toolId}"]`);

/** Wait for a tool's frame to be ready, let it settle, screenshot the card. */
async function shotCard(th: Theme, toolId: string, file: string) {
  const p = pages[th];
  const c = cardOf(p, toolId);
  await c.waitFor({ state: "attached", timeout: T });
  await c.scrollIntoViewIfNeeded();
  await p.waitForSelector(`[data-muse-card][data-tool-id="${toolId}"][data-live="ready"]`, { timeout: T });
  await toolFrame(p, toolId, T);
  await p.waitForTimeout(900);
  await c.scrollIntoViewIfNeeded();
  await c.screenshot({ path: join(IMG, file), timeout: T });
}

/** Run one theme of a slot; record the error on the row and go on. */
async function guard(row: Row, th: Theme, fn: () => Promise<void>) {
  try {
    await fn();
    row[th] = `img/${slug(row.surface + "-" + row.where + "-" + row.tool)}-${th}.png`;
  } catch (e) {
    row[th] = null;
    row.error ??= `${th}: ${(e as Error).message.split("\n")[0]!.slice(0, 240)}`;
  }
}
const fileFor = (row: Row, th: Theme) => `${slug(row.surface + "-" + row.where + "-" + row.tool)}-${th}.png`;

// ------------------------------------------------------------------ a. seeded Messenger chats

try {
  say("a. seeded chats");
  type Seeded = { chat: string; chatName: string; as: string; tools: { id: string; piece: string }[] };
  const SEEDED_PIECE: Record<string, string> = { "t-sx-try": "poll" };
  const seededTool = (id: string) => { const t = (SEED_TOOLS as Record<string, { tool?: string; piece?: string }>)[id]; return t?.tool ?? (t?.piece ? kindOf(t.piece) : SEEDED_PIECE[id] ? kindOf(SEEDED_PIECE[id]!) : "unknown"); };
  const seeded: Seeded[] = [];
  for (const c of seedChats()) {
    const ids = c.messages.filter((m) => m.kind === "muse" && m.muse?.toolId).map((m) => m.muse!.toolId!);
    if (ids.length) seeded.push({ chat: c.id, chatName: c.name, as: "noa", tools: ids.map((id) => ({ id, piece: seededTool(id) })) });
  }
  seeded.push({ chat: "latenight", chatName: "late night", as: "theo", tools: [{ id: "t-bracket", piece: seededTool("t-bracket") }] });
  seeded.push({ chat: "priya", chatName: "Will (to-try list)", as: "noa", tools: [{ id: "t-sx-try", piece: seededTool("t-sx-try") }] });
  for (const s of seeded) {
    const trs = s.tools.map((t) => ({ ...t, row: newRow("messenger", `${s.chatName} (${s.chat})`, t.piece) }));
    for (const th of THEMES) {
      let opened = true;
      try {
        await openChat(th, s.chat, s.as);
      } catch (e) {
        opened = false;
        for (const t of trs) t.row.error ??= `${th}: could not open chat ${s.chat}: ${(e as Error).message.split("\n")[0]!.slice(0, 200)}`;
      }
      if (!opened) continue;
      for (const t of trs) await guard(t.row, th, () => shotCard(th, t.id, fileFor(t.row, th)));
    }
    for (const t of trs) say(`  ${t.row.where}: ${t.row.tool} ${t.row.error ? "FAILED " + t.row.error : "ok"}`);
  }
} catch (e) {
  say(`a. failed: ${(e as Error).message}`);
}

// ------------------------------------------------------------------ b. chat asks

try {
  say("b. chat asks");
  const ASKS = ["muse pick for us", "muse who owes who", "muse split the groceries", "muse who's in for friday", "muse assign chores", "muse settle the veto on dinner", "muse make a bracket", "muse plan the trip"];
  // Which tool the factory chose, read from its event stream.
  const chosen: Record<Theme, string[]> = { dark: [], light: [] };
  for (const th of THEMES) {
    pages[th].on("response", (r) => {
      if (!/\/(generate|premade)/.test(new URL(r.url()).pathname)) return;
      r.text().then((t) => {
        const m = [...t.matchAll(/"piece":"([^"]+)"/g)].at(-1);
        if (m) chosen[th].push(m[1]!);
      }, () => {});
    });
  }
  for (const th of THEMES) await openChat(th, "senior");
  for (const ask of ASKS) {
    const row = newRow("chat ask", `senior week: "${ask}"`, "unknown");
    for (const th of THEMES) {
      const p = pages[th];
      try {
        const before = await thread(p).locator("[data-muse-card]").count();
        chosen[th].length = 0;
        const box = thread(p).locator("textarea");
        await box.fill(ask);
        await box.press("Enter");
        await p.waitForFunction(
          (n) => {
            const cards = [...document.querySelectorAll(".page.push.shown .thread [data-muse-card]")];
            return cards.length > n && (cards.at(-1) as HTMLElement).dataset.live === "ready";
          },
          before,
          { timeout: 50_000 },
        );
        const id = (await thread(p).locator("[data-muse-card]").last().getAttribute("data-tool-id"))!;
        const piece = chosen[th].at(-1);
        if (piece && row.tool === "unknown") {
          row.tool = piece.includes(":") ? piece : kindOf(piece);
          row.plain = row.tool.startsWith("piece:");
          row.original = originalOf(row.tool);
        }
        await shotCard(th, id, fileFor({ ...row, tool: "x" } as Row, th).replace("-x-", `-${slug(ask)}-`));
        row[th] = `img/${fileFor({ ...row, tool: "x" } as Row, th).replace("-x-", `-${slug(ask)}-`)}`;
      } catch (e) {
        const st = await p.evaluate(() => [...document.querySelectorAll(".page.push.shown .thread [data-muse-card]")].slice(-2).map((c) => `${(c as HTMLElement).dataset.live}/${c.getAttribute("aria-busy")}`).join(",") + " | last: " + [...document.querySelectorAll(".page.push.shown .thread .bubble")].slice(-2).map((b) => (b.textContent ?? "").trim().slice(0, 60)).join(" / ")).catch(() => "?");
        row.error ??= `${th}: ${(e as Error).message.split("\n")[0]!.slice(0, 160)} [cards: ${st}; ask tail: ${chosen[th].join("|")}]`;
      }
    }
    say(`  ${ask}: ${row.tool} ${row.error ? "FAILED " + row.error : "ok"}`);
  }
} catch (e) {
  say(`b. failed: ${(e as Error).message}`);
}

// ------------------------------------------------------------------ c. catalyst scenarios

try {
  say(`c. catalyst scenarios (${PACK.length})`);
  const ws = `ws://127.0.0.1:${stack.serverPort}/ws`;
  const EVERYONE = ["noa", "maya", "dev", "jonah", "priya", "theo"];
  const made: { row: Row; chat: string; toolId: string }[] = [];
  const built: { chat: string; toolId: string; name: string; code: string }[] = [];
  for (const s of PACK) {
    const row = newRow("catalyst", `${s.surface}: ${s.id}`, "unknown");
    try {
      const c = pageFor(s);
      const choice = choicesFor(s, c).filter((x) => available(x.tool))[0];
      if (!choice) throw new Error(`no available tool (${s.tools.map((t) => t.tool).join(", ")})`);
      row.tool = choice.tool;
      row.plain = choice.tool.startsWith("piece:");
      row.original = originalOf(choice.tool);
      const b = await build([choice]);
      const chat = `sh-${s.id}`;
      const toolId = `t-sh-${s.id}`;
      built.push({ chat, toolId, name: s.title(c).slice(0, 80), code: b.code });
      made.push({ row, chat, toolId });
    } catch (e) {
      row.error = `build: ${(e as Error).message.split("\n")[0]!.slice(0, 240)}`;
    }
  }
  // Put each filled tool in its own scratch chat through the normal protocol.
  const index = await new RoomClient(ws, INDEX_ROOM, "sheet-v1", SEED_USER).join();
  await index.sendAll(built.map((b) => ({ t: "chat", id: b.chat })));
  const open: RoomClient[] = [index];
  for (const b of built) {
    const room = await new RoomClient(ws, chatRoom(b.chat), "sheet-v1", SEED_USER).join();
    const sys = await new RoomClient(ws, toolRoom(b.toolId), "sheet-v1", SEED_USER).join();
    open.push(room, sys);
    await room.sendAll([
      { t: "create", name: "sheet " + b.chat.slice(3, 40), kind: "group", members: EVERYONE },
      { t: "tool", id: b.toolId, name: b.name, summary: "", code: b.code, by: "muse", at: Date.now() },
    ]);
    await sys.sendAll([{ t: "@members", members: EVERYONE.map((u) => ({ id: u, name: u[0]!.toUpperCase() + u.slice(1) })) }]);
  }
  for (const c of open) c.close();
  for (const m of made) {
    for (const th of THEMES) {
      await guard(m.row, th, async () => {
        await openChat(th, m.chat);
        await shotCard(th, m.toolId, fileFor(m.row, th));
      });
    }
    say(`  ${m.row.where}: ${m.row.tool} ${m.row.error ? "FAILED " + m.row.error : "ok"}`);
  }
} catch (e) {
  say(`c. failed: ${(e as Error).message}`);
}

// ------------------------------------------------------------------ d. Facebook top screens

try {
  say("d. Facebook screens");
  const screens: { where: string; q: string; wait?: string }[] = [
    { where: "Home", q: "&app=facebook" },
    { where: "Reels", q: "&app=facebook&fb=reels" },
    { where: "Groups", q: "&app=facebook&fb=groups" },
    ...GROUPS.map((g) => ({ where: `Group: ${g.name}`, q: `&app=facebook&fb=group:${g.id}` })),
    { where: "Marketplace", q: "&app=facebook&fb=marketplace" },
    { where: `Listing: ${LISTINGS[0]!.title}`, q: `&app=facebook&fb=listing:${LISTINGS[0]!.id}` },
    { where: "Gaming", q: "&app=facebook&fb=gaming" },
    { where: `Story viewer: ${STORIES.find((s) => s.id !== "s-me")!.id}`, q: `&app=facebook&fb=story:${STORIES.find((s) => s.id !== "s-me")!.id}` },
    { where: "Event page: juniper", q: "&event=juniper", wait: 'section[aria-label="Event"]' },
  ];
  for (const sc of screens) {
    const row = newRow("facebook", sc.where, "screen");
    for (const th of THEMES) {
      await guard(row, th, async () => {
        const p = pages[th];
        await p.goto(href(th, sc.q), { timeout: T });
        if (sc.wait) await p.waitForSelector(sc.wait, { timeout: T });
        await p.waitForTimeout(1800);
        // Tools on the screen: wait until their frames are ready, if there are any.
        await p.waitForFunction(() => [...document.querySelectorAll("[data-live]")].every((e) => (e as HTMLElement).dataset.live === "ready"), null, { timeout: 15_000 }).catch(() => {});
        await p.waitForTimeout(700);
        await p.screenshot({ path: join(IMG, fileFor(row, th)), timeout: T });
      });
    }
    say(`  ${sc.where}: ${row.error ? "FAILED " + row.error : "ok"}`);
  }
} catch (e) {
  say(`d. failed: ${(e as Error).message}`);
}

await browser.close();
await stack.stop();
rmSync(dir, { recursive: true, force: true });

// ------------------------------------------------------------------ output

const rank = (r: Row) => (r.tool === "screen" ? 4 : r.plain ? 0 : r.error ? 1 : !r.original ? 2 : 3);
rows.sort((a, b) => rank(a) - rank(b));
writeFileSync(join(OUT, "sheet.json"), JSON.stringify(rows, null, 2));

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const img = (src: string | null, alt: string, err?: string | null) => (src ? `<img src="${esc(src)}" alt="${esc(alt)}" loading="eager">` : `<div class="none">${err ? "failed to open" : "none"}</div>`);
const tag = (r: Row) => (r.plain ? ' <span class="plain">PLAIN</span>' : "");
const tr = rows
  .map(
    (r) => `<tr><td class="where"><b>${esc(r.surface)}</b><br>${esc(r.where)}${r.error ? `<br><span class="err">failed to open: ${esc(r.error)}</span>` : ""}</td>
<td class="tool"><code>${esc(r.tool)}</code>${tag(r)}${r.tool !== "screen" && !r.original ? '<br><span class="miss">no original</span>' : ""}</td>
<td>${img(r.dark, "dark", r.error)}</td><td>${img(r.light, "light", r.error)}</td><td>${img(r.original, "original", null)}</td></tr>`,
  )
  .join("\n");

const PER = 6;
const pagesN = Math.ceil(rows.length / PER);
const cells = (chunk: Row[]) =>
  chunk
    .map(
      (r) => `<div class="cell"><div class="lbl"><b>${esc(r.surface)}</b> ${esc(r.where)}<br><code>${esc(r.tool)}</code>${tag(r)}${r.error ? ' <span class="err">failed to open</span>' : ""}</div>
<div class="pair"><figure>${img(r.dark, "ours, dark", r.error)}<figcaption>ours (dark)</figcaption></figure><figure>${img(r.original, "original", null)}<figcaption>lab original</figcaption></figure></div></div>`,
    )
    .join("\n");
const sheets = Array.from({ length: pagesN }, (_, i) => `<section class="contact" id="sheet-${String(i + 1).padStart(2, "0")}">${cells(rows.slice(i * PER, (i + 1) * PER))}</section>`).join("\n");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tool contact sheet</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#111;--mut:#666;--line:#ddd;--red:#d8222a}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#eee;--mut:#9a9a9a;--line:#333}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif}
h1{font-size:18px;margin:0 0 4px}h2{font-size:16px;margin:32px 0 8px}
table{border-collapse:collapse;width:100%}th,td{border-top:1px solid var(--line);padding:8px;vertical-align:top;text-align:left}
td img{max-width:260px;max-height:640px;display:block;object-fit:contain}
.where{min-width:160px;max-width:240px}.tool{min-width:120px}
.plain{background:var(--red);color:#fff;font-weight:700;font-size:11px;padding:1px 6px;border-radius:3px;margin-left:4px}
.err,.miss,.none{color:var(--red);font-size:12px}.none{padding:8px}
section.contact{width:1600px;box-sizing:border-box;padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:16px;background:var(--bg);margin-bottom:16px}
.cell{border:1px solid var(--line);padding:8px;min-width:0}.lbl{margin-bottom:6px;font-size:13px}
.pair{display:flex;gap:8px}.pair figure{margin:0;flex:1;min-width:0}.pair img{width:100%;max-height:640px;object-fit:contain;object-position:top}
figcaption{color:var(--mut);font-size:11px}
</style></head><body>
<h1>Tool contact sheet</h1>
<p>${rows.length} slots. Plain pieces and missing originals first. Columns: where, tool id, ours dark, ours light, lab original.</p>
<table><thead><tr><th>where</th><th>tool id</th><th>ours, dark</th><th>ours, light</th><th>lab original</th></tr></thead><tbody>
${tr}
</tbody></table>
<h2>Contact sheets</h2>
${sheets}
</body></html>`;
writeFileSync(join(OUT, "index.html"), html);

// Composite PNGs: screenshot each contact section headlessly.
const b2 = await chromium.launch({ headless: true });
const ctx = await b2.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, colorScheme: "light" });
const pg = await ctx.newPage();
await pg.goto("file://" + join(OUT, "index.html"));
await pg.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 60_000 }).catch(() => {});
for (let i = 0; i < pagesN; i++) {
  const n = String(i + 1).padStart(2, "0");
  await pg.locator(`#sheet-${n}`).screenshot({ path: join(OUT, `sheet-${n}.png`), timeout: T });
}
await b2.close();

const tools = rows.filter((r) => r.tool !== "screen");
const lab = tools.filter((r) => r.tool.startsWith("lab:")).length;
const plain = tools.filter((r) => r.plain).length;
const failed = rows.filter((r) => r.error);
console.log(`slots ${rows.length} (${tools.length} tools, ${rows.length - tools.length} screens), lab ${lab}, plain ${plain}, failed to open ${failed.length}`);
for (const r of rows.filter((x) => x.plain || x.error)) console.log(`  ${r.plain ? "PLAIN " : ""}${r.error ? "FAILED " : ""}${r.surface} | ${r.where} | ${r.tool}${r.error ? " | " + r.error : ""}`);
console.log(`written to ${OUT}`);
process.exit(0);
