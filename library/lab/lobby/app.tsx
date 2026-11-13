import { defineApp, type Theme, Avatar, Button, Canvas, CardHeader, Facepile, Toast, fitText, innerWidth, mix} from "@muse/app";

// Who's on tonight: everyone's free time as a 6 pm to 1 am heat grid built from their replies. You
// paint your own row, the overlap bars rise, and one tap pings the group 5 minutes before the best band.

type Params = {
  /** Card title: "Who's on tonight" */
  title: string;
  /** Replies from the chat. Slot 0 = 6:00 PM, 30 min each, `to` exclusive, max 14 slots. name: as in the members list. */
  people: { name: string; reply: string; from: number; to: number; maybe: boolean }[];
};

// @params
const P: Params = {
  title: "Who's on tonight",
  people: [
    { name: "Bryan", reply: "on all night after 7", from: 2, to: 14, maybe: false },
    { name: "Kev", reply: "maybe after 10", from: 8, to: 14, maybe: true },
    { name: "Dev", reply: "9-11 then im out", from: 6, to: 10, maybe: false },
    { name: "Omar", reply: "after dinner ~8, done by 12", from: 4, to: 12, maybe: false },
  ],
};
// @end params

const COLS = 14;
const MAX_ROWS = 12;
const LABEL_W = 62;
const GY0 = 16;

/** id "" = a reply not matched to anyone in the chat (read-only). cells: 0 off, 1 maybe, 2 on. */
type Row = { id: string; name: string; reply: string; cells: number[] };
/** pingSlot -1 = not pinged. */
type State = { title: string; rows: Row[]; pingSlot: number; pingedAt: number };
type Action = { t: "paint"; from: number; to: number; value: number } | { t: "ping" };
type Local = { drag: { from: number; to: number; value: number; a: number } | null; toast: number };

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const sums = (s: State): number[] => Array.from({ length: COLS }, (_, c) => s.rows.reduce((t, r) => t + (r.cells[c] ?? 0), 0));
function best(s: State): { start: number; end: number } | null {
  const su = sums(s);
  const mx = Math.max(...su);
  if (mx === 0) return null;
  const start = su.indexOf(mx);
  let end = start;
  while (end < COLS && su[end] === mx) end++;
  return { start, end };
}
/** 12-hour clock, no am/pm. */
function clock12(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60) % 12 || 12;
  return `${h}:${String(m % 60).padStart(2, "0")}`;
}
const slotTime = (slot: number) => clock12(18 * 60 + 30 * slot);
const pingTime = (slot: number) => clock12(18 * 60 + 30 * slot - 5);
const countAt = (s: State, c: number) => ({
  on: s.rows.filter((r) => r.cells[c] === 2).length,
  maybe: s.rows.filter((r) => r.cells[c] === 1).length,
});
const bad = (v: unknown): boolean => typeof v !== "number" || !Number.isInteger(v);

export default defineApp<State, Action, Local>({
  name: "Who's on tonight",
  summary: (s) => {
    if (s.pingSlot >= 0) return `${s.title}: pinging at ${pingTime(s.pingSlot)} · ${countAt(s, s.pingSlot).on} on`;
    const b = best(s);
    return b ? `${s.title}: best ${slotTime(b.start)}–${b.end >= COLS ? "late" : slotTime(b.end)} · ${countAt(s, b.start).on} on` : `${s.title}: no overlap yet`;
  },

  init: (ctx) => {
    const used = new Set<string>();
    const rows: Row[] = P.people.slice(0, MAX_ROWS).map((p) => {
      const name = String(p.name).trim().slice(0, 24);
      const want = name.toLowerCase();
      const m = want ? ctx.members.find((x) => !used.has(x.id) && x.name.toLowerCase() === want) : undefined;
      if (m) used.add(m.id);
      const from = Number.isInteger(p.from) ? Math.max(0, Math.min(COLS, p.from)) : 0;
      const to = Number.isInteger(p.to) ? Math.max(0, Math.min(COLS, p.to)) : 0;
      const ok = from < to;
      return {
        id: m ? m.id : "",
        name,
        reply: String(p.reply).trim().slice(0, 40),
        cells: Array.from({ length: COLS }, (_, c) => (ok && c >= from && c < to ? (p.maybe ? 1 : 2) : 0)),
      };
    });
    for (const m of ctx.members) if (!used.has(m.id)) rows.push({ id: m.id, name: m.name, reply: "", cells: Array(COLS).fill(0) });
    return { title: P.title.trim().slice(0, 40) || "Who's on tonight", rows, pingSlot: -1, pingedAt: 0 };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user) || !s.rows.some((r) => r.id === m.user)) return s;
    if (a.t === "paint") {
      if (bad(a.from) || bad(a.to) || a.from < 0 || a.from >= a.to || a.to > COLS) return s;
      if (a.value !== 0 && a.value !== 2) return s;
      const mine = s.rows.find((r) => r.id === m.user)!;
      if (!mine.cells.slice(a.from, a.to).some((v) => v !== a.value)) return s;
      return { ...s, rows: s.rows.map((r) => (r.id !== m.user ? r : { ...r, cells: r.cells.map((v, c) => (c >= a.from && c < a.to ? a.value : v)) })) };
    }
    if (a.t === "ping") {
      const b = best(s);
      if (!b || Math.max(...sums(s)) < 2 || b.start === s.pingSlot) return s;
      return { ...s, pingSlot: b.start, pingedAt: m.time };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const ids = new Set(ctx.members.map((m) => m.id));
    let rows = s.rows.filter((r) => r.id === "" || ids.has(r.id));
    let changed = rows.length !== s.rows.length;
    for (const m of ctx.members) {
      if (rows.some((r) => r.id === m.id)) continue;
      changed = true;
      const i = rows.findIndex((r) => r.id === "" && r.name.toLowerCase() === m.name.toLowerCase());
      rows = i >= 0 ? rows.map((r, j) => (j === i ? { ...r, id: m.id } : r)) : [...rows, { id: m.id, name: m.name, reply: "", cells: Array(COLS).fill(0) }];
    }
    return changed ? { ...s, rows } : s;
  },

  invariants: {
    "every member has exactly one row": (s, ctx) =>
      ctx.members.every((m) => s.rows.filter((r) => r.id === m.id).length === 1) && s.rows.every((r) => r.id === "" || inChat(ctx, r.id)),
    "cells are 14 values of off, maybe or on": (s) => s.rows.every((r) => r.cells.length === COLS && r.cells.every((v) => v === 0 || v === 1 || v === 2)),
    "ping slot is a slot exactly when pinged": (s) => (s.pingSlot === -1) === (s.pingedAt === 0) && s.pingSlot >= -1 && s.pingSlot < COLS,
    "at most 12 rows from replies, names non-empty": (s) => s.rows.filter((r) => r.id === "").length <= MAX_ROWS && s.rows.every((r) => r.name.length > 0),
  },

  transitions: {
    "paint changes only the painter's row, only in range, to the value": (p, n, a, m) => {
      if (a.t !== "paint" || p === n) return true;
      const rest = (x: State) => JSON.stringify(x.rows.filter((r) => r.id !== m.user));
      const pa = p.rows.find((r) => r.id === m.user);
      const na = n.rows.find((r) => r.id === m.user);
      if (!pa || !na || rest(p) !== rest(n)) return false;
      return na.cells.every((v, c) => (c >= a.from && c < a.to ? v === a.value : v === pa.cells[c]));
    },
    "paint never writes maybe": (p, n, a) => {
      if (a.t !== "paint") return true;
      return n.rows.every((r, i) => r.cells.every((v, c) => v === p.rows[i]?.cells[c] || v === 0 || v === 2));
    },
    "a ping lands 5 min before the best band": (p, n, a, m) => {
      if (a.t !== "ping" || p === n) return true;
      const b = best(p);
      return !!b && n.pingSlot === b.start && n.pingedAt === m.time && Math.max(...sums(p)) >= 2;
    },
    "rows from replies the chat hasn't matched never change": (p, n) => {
      const keep = new Set(n.rows.filter((r) => r.id === "").map((r) => JSON.stringify(r)));
      return p.rows.filter((r) => r.id === "").every((r) => keep.has(JSON.stringify(r)));
    },
    "a paint is a whole range of 0 or 2 and changes something": (p, n, a, m) => {
      if (a.t !== "paint" || p === n) return true;
      const pa = p.rows.find((r) => r.id === m.user);
      const na = n.rows.find((r) => r.id === m.user);
      return !bad(a.from) && !bad(a.to) && a.from >= 0 && a.from < a.to && a.to <= COLS && (a.value === 0 || a.value === 2) && JSON.stringify(pa) !== JSON.stringify(na) && n.pingSlot === p.pingSlot && n.pingedAt === p.pingedAt && n.title === p.title;
    },
    "a good paint by someone in the chat always lands": (p, n, a, m, ctx) => {
      if (a.t !== "paint" || bad(a.from) || bad(a.to) || a.from < 0 || a.from >= a.to || a.to > COLS || (a.value !== 0 && a.value !== 2)) return true;
      const pa = p.rows.find((r) => r.id === m.user);
      return !pa || !inChat(ctx, m.user) || !pa.cells.slice(a.from, a.to).some((v) => v !== a.value) || p !== n;
    },
    "a ping with a window of two or more always lands": (p, n, a, m, ctx) => {
      if (a.t !== "ping" || !inChat(ctx, m.user) || !p.rows.some((r) => r.id === m.user)) return true;
      const b = best(p);
      return !b || Math.max(...sums(p)) < 2 || b.start === p.pingSlot || p !== n;
    },
    "ping does not change the grid": (p, n, a) => a.t !== "ping" || JSON.stringify(n.rows) === JSON.stringify(p.rows),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (_s, _u, r) => {
    if (r.next() < 0.75) {
      const f = r.int(13);
      return { t: "paint", from: f, to: Math.min(COLS, f + 1 + r.int(4)), value: r.pick([0, 2]) };
    }
    return { t: "ping" };
  },

  local: { drag: null, toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = innerWidth();
    const cw = (W - LABEL_W) / COLS;
    const mineRow = state.rows.find((r) => r.id === me);
    const others = state.rows.filter((r) => r.id !== me && r.cells.some((v) => v !== 0)).slice(0, mineRow ? 5 : 6);
    const shown = mineRow ? [...others, mineRow] : others;
    const hidden = state.rows.length - shown.length;
    const rh = shown.length > 5 ? 24 : 30;
    const gridH = GY0 + rh * shown.length + (hidden > 0 ? 12 : 0);
    const su = sums(state);
    const b = best(state);
    const mx = Math.max(...su);
    const cnt = b ? countAt(state, b.start) : { on: 0, maybe: 0 };
    const band = b ? `${slotTime(b.start)}–${b.end >= COLS ? "late" : slotTime(b.end)}` : "";
    const subtitle = b ? `Best ${band} · ${cnt.on} on${cnt.maybe ? `, ${cnt.maybe} maybe` : ""}` : "No overlap yet";
    const replies = state.rows.filter((r) => r.reply).slice(0, 4);
    const pinged = state.pingSlot >= 0 && b !== null && b.start === state.pingSlot;
    const atPing = pinged ? countAt(state, state.pingSlot) : { on: 0, maybe: 0 };
    const onIds = pinged ? state.rows.filter((r) => r.id && r.cells[state.pingSlot] === 2).map((r) => r.id) : [];
    const memberOf = (id: string) => members.find((m) => m.id === id);
    const drag = local.drag;
    const myIdx = mineRow ? shown.length - 1 : -1;
    const myEmpty = !!mineRow && mineRow.cells.every((v) => v === 0) && !drag;

    const draw = (g: CanvasRenderingContext2D, o: { width: number; height: number; theme: Theme }) => {
      const k = o.theme.color;
      const w = o.width;
      const cwid = (w - LABEL_W) / COLS;
      g.clearRect(0, 0, w, o.height);
      g.textBaseline = "middle";
      g.textAlign = "center";
      g.fillStyle = k.secondaryText;
      ["6p", "7p", "8p", "9p", "10p", "11p", "12a", "1am"].forEach((t, i) => {
        const f = fitText(t, 28, { g, size: 10, min: 10 });
        g.font = f.font;
        g.fillText(f.text, Math.min(LABEL_W + i * 2 * cwid, w - 10), 8);
      });
      shown.forEach((r, i) => {
        const y = GY0 + i * rh;
        const mine = r.id === me;
        const nf = fitText(mine ? "You" : r.name, 34, { g, size: 13, weight: 600 });
        g.font = nf.font;
        g.textAlign = "left";
        g.fillStyle = mine ? k.link : k.text;
        g.fillText(nf.text, 25, y + rh / 2 + 0.5);
        for (let col = 0; col < COLS; col++) {
          let v = r.cells[col] ?? 0;
          if (mine && drag && col >= drag.from && col < drag.to) v = drag.value;
          const x = LABEL_W + col * cwid + 1;
          g.beginPath();
          g.roundRect(x, y + 2, cwid - 2, rh - 4, 4);
          if (v === 0) {
            g.fillStyle = k.input;
            g.fill();
          } else if (v === 2) {
            g.fillStyle = mine ? k.primary : mix(k.primary, k.card, 0.45);
            g.fill();
          } else {
            g.fillStyle = mix(k.primary, k.card, 0.72);
            g.fill();
            g.save();
            g.clip();
            g.strokeStyle = mix(k.primary, k.card, 0.3);
            g.lineWidth = 2;
            for (let d = -rh; d < cwid + rh; d += 6) {
              g.beginPath();
              g.moveTo(x + d, y + rh - 2);
              g.lineTo(x + d + rh - 4, y + 2);
              g.stroke();
            }
            g.restore();
          }
        }
        if (mine && myEmpty) {
          g.strokeStyle = k.primary;
          g.lineWidth = 1.5;
          g.setLineDash([5, 4]);
          g.beginPath();
          g.roundRect(LABEL_W, y + 1, w - LABEL_W, rh - 2, 6);
          g.stroke();
          g.setLineDash([]);
          const hf = fitText("Drag across your row to paint when you're free", w - LABEL_W - 16, { g, size: 11.5, min: 10 });
          g.font = hf.font;
          g.fillStyle = k.link;
          g.textAlign = "center";
          g.fillText(hf.text, LABEL_W + (w - LABEL_W) / 2, y + rh / 2 + 0.5);
        }
      });
      if (hidden > 0) {
        g.font = `11px ${o.theme.type.family}`;
        g.fillStyle = k.secondaryText;
        g.textAlign = "left";
        g.fillText(`+${hidden} more`, 4, GY0 + rh * shown.length + 6);
      }
    };

    const onPointer = mineRow
      ? (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
          const col = Math.max(0, Math.min(COLS - 1, Math.floor((e.x - LABEL_W) / cw)));
          if (e.type === "down") {
            const y0 = GY0 + myIdx * rh;
            if (e.x < LABEL_W || e.y < y0 || e.y >= y0 + rh) return;
            setLocal({ drag: { from: col, to: col + 1, a: col, value: mineRow.cells[col] === 2 ? 0 : 2 } });
          } else if (e.type === "move") {
            if (!drag) return;
            const from = Math.min(drag.a, col);
            const to = Math.max(drag.a, col) + 1;
            if (from !== drag.from || to !== drag.to) setLocal({ drag: { ...drag, from, to } });
          } else if (drag) {
            dispatch({ t: "paint", from: drag.from, to: drag.to, value: drag.value });
            setLocal({ drag: null });
          }
        }
      : undefined;

    const label = b ? `Free times: best ${band}, ${cnt.on} on` : "Free times: nobody on yet";

    return (
      <div>
        <CardHeader title={state.title} subtitle={subtitle} />
        {replies.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 6, rowGap: 4, height: 50, alignContent: "center" }}>
            {replies.map((r) => (
              <div key={`${r.id}|${r.name}`} style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                <Avatar user={memberOf(r.id) ?? { id: r.name, name: r.name }} size={16} />
                <span style={{ height: 21, lineHeight: "21px", borderRadius: 10, background: c.input, padding: "0 9px", fontSize: 12, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{`“${r.reply}”`}</span>
              </div>
            ))}
          </div>
        ) : null}
        <div style={{ position: "relative", height: gridH }}>
          {b ? (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: LABEL_W + b.start * cw - 1,
                width: (b.end - b.start) * cw + 2,
                top: 14,
                height: GY0 + rh * shown.length + 2 - 14,
                borderRadius: 6,
                background: mix(c.primary, c.card, 0.92),
                transition: "left 250ms cubic-bezier(.05,.7,.1,1), width 250ms cubic-bezier(.05,.7,.1,1)",
              }}
            />
          ) : null}
          <div style={{ position: "absolute", left: 0, top: 0, width: "100%" }}>
            <Canvas height={gridH} label={label} draw={draw} {...(onPointer ? { onPointer } : {})} />
          </div>
          {shown.map((r, i) => (
            <div key={`${r.id}|${r.name}`} style={{ position: "absolute", left: 1, top: GY0 + i * rh + (rh - 20) / 2, pointerEvents: "none" }}>
              <Avatar user={memberOf(r.id) ?? { id: r.name, name: r.name }} size={20} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", height: 44 }}>
          <div style={{ width: LABEL_W, flex: "none", fontSize: 13, lineHeight: "16px", color: c.secondaryText, paddingTop: 8 }}>
            <div>Overlap</div>
            <div>{`of ${state.rows.length}`}</div>
          </div>
          <div style={{ position: "relative", flex: 1 }}>
            {su.map((v, col) => (
              <div
                key={col}
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: col * cw + 2,
                  width: cw - 4,
                  bottom: 4,
                  height: state.rows.length ? (v / (2 * state.rows.length)) * 38 : 0,
                  borderRadius: 3,
                  background: b && col >= b.start && col < b.end ? c.primary : mix(c.primary, c.card, 0.6),
                  transition: "height 250ms cubic-bezier(.05,.7,.1,1)",
                }}
              />
            ))}
          </div>
        </div>
        <div style={{ marginTop: 10, height: 46, display: "flex", alignItems: "center", gap: 10 }}>
          {pinged ? (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text }}>{`Pinging at ${pingTime(state.pingSlot)}`}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Facepile users={onIds} max={5} size={20} />
                <span style={{ fontSize: 13, lineHeight: "20px", color: c.secondaryText, whiteSpace: "nowrap" }}>{`${atPing.on} on${atPing.maybe ? ` · ${atPing.maybe} maybe` : ""}`}</span>
              </div>
            </div>
          ) : b ? (
            <>
              <div style={{ width: 120, flex: "none" }}>
                <Button
                  kind="primary"
                  wide
                  disabled={mx < 2 || !mineRow}
                  onClick={() => {
                    dispatch({ t: "ping" });
                    setLocal({ toast: local.toast + 1 });
                  }}
                >
                  {`Ping at ${pingTime(state.pingSlot)}`}
                </Button>
              </div>
              <span style={{ fontSize: 13, color: c.secondaryText, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${pingTime(b.start)} · buzzes everyone 5 min before`}</span>
            </>
          ) : (
            <span style={{ fontSize: 13, color: c.secondaryText }}>No overlap yet · paint your row</span>
          )}
        </div>
        {local.toast > 0 ? <Toast key={local.toast}>{`Muse will ping ${b ? cnt.on : 0} people at ${b ? pingTime(b.start) : ""}`}</Toast> : null}
      </div>
    );
  },
});
