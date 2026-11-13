import { defineApp, Avatar, Button, Canvas, Facepile, Placed, Toast, clock, fitText, haptic, mix, pal, rng, running, tween, type Member } from "@muse/app";

// Squad beat: friends' catchphrases become an 8-step loop for a story. Tap cells, the playhead
// sweeps on the shared clock, each friend's face jumps on their hits, then post the loop.

type Params = {
  /** 1 to 4 rows: who (a name from the chat) and shout (their catchphrase, exactly as said in the chat). */
  rows: { who: string; shout: string }[];
  /** Optional starting pattern per row, 8 characters of x and . */
  grid: string[];
};

// @params
const P: Params = {
  rows: [{ who: "Priya", shout: "Yeehaw" }, { who: "Sam", shout: "Bruh" }, { who: "Ana", shout: "Clap" }, { who: "Leo", shout: "Boom" }],
  grid: ["........", "...x...x", "..x...x.", "x...x.x."],
};
// @end params

/** who: member id if matched, else "guest:" + name. */
type Row = { who: string; name: string; shout: string };
type State = {
  rows: Row[];
  cells: boolean[][];
  shuffles: number;
  /** Member ids who changed the loop, first-time order. */
  makers: string[];
  posted: { by: string; at: number } | null;
};
type Action = { t: "toggle"; row: number; step: number } | { t: "shuffle" } | { t: "post" };
type Local = { shuffling: boolean };

const STEPS = 8;
const MAX_ROWS = 4;
const BPM = 112;
const STEP_MS = 60000 / BPM / 2;
const HIT_MS = 220;
const LABEL = 80;
const rise = tween({ duration: 200, easing: "decelerate" });

const cleanShout = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, 14) : "");
const hits = (cells: boolean[][]) => cells.reduce((n, r) => n + r.filter(Boolean).length, 0);
const withMaker = (makers: string[], u: string) => (makers.includes(u) ? makers : [...makers, u]);

/** The shuffled grid for n rows: each cell on with chance 0.3, and the last row always opens on the downbeat. */
function shuffled(n: number, seed: number): boolean[][] {
  const r = rng(seed);
  const cells = Array.from({ length: n }, () => Array.from({ length: STEPS }, () => r.next() < 0.3));
  cells[n - 1]![0] = true;
  return cells;
}

export default defineApp<State, Action, Local>({
  name: "Squad beat",
  summary: (s, ctx) => {
    if (!s.posted) return `Squad beat · ${hits(s.cells)} shouts in an 8-step loop`;
    const by = s.posted.by;
    return `Squad beat is on ${ctx.members.find((m) => m.id === by)?.name ?? "the group"}'s story`;
  },

  init: (ctx) => {
    const rows: Row[] = [];
    const cells: boolean[][] = [];
    P.rows.slice(0, MAX_ROWS).forEach((raw, i) => {
      const shout = cleanShout(raw.shout);
      const want = typeof raw.who === "string" ? raw.who.trim() : "";
      if (!shout || !want) return;
      const m = ctx.members.find((x) => x.id === raw.who || x.name.toLowerCase() === want.toLowerCase());
      rows.push({ who: m ? m.id : `guest:${want}`, name: m ? m.name : want, shout });
      const line = P.grid[i] ?? "";
      cells.push(Array.from({ length: STEPS }, (_, k) => line[k] === "x"));
    });
    if (rows.length === 0) {
      const m = ctx.members[0];
      rows.push(m ? { who: m.id, name: m.name, shout: "Clap" } : { who: "guest:Clap", name: "Clap", shout: "Clap" });
      cells.push(Array.from({ length: STEPS }, () => false));
    }
    return { rows, cells, shuffles: 0, makers: [], posted: null };
  },

  reduce: (s, a, meta, ctx) => {
    if (s.posted !== null || !ctx.members.some((m) => m.id === meta.user)) return s;
    if (a.t === "toggle") {
      const { row, step } = a;
      if (!Number.isInteger(row) || !Number.isInteger(step) || row < 0 || row >= s.rows.length || step < 0 || step >= STEPS) return s;
      const cells = s.cells.map((r, i) => (i !== row ? r : r.map((c, k) => (k === step ? !c : c))));
      return { ...s, cells, makers: withMaker(s.makers, meta.user) };
    }
    if (a.t === "shuffle") {
      return { ...s, cells: shuffled(s.rows.length, meta.seed), shuffles: s.shuffles + 1, makers: withMaker(s.makers, meta.user) };
    }
    if (a.t === "post") {
      if (hits(s.cells) === 0) return s;
      return { ...s, posted: { by: meta.user, at: meta.time }, makers: withMaker(s.makers, meta.user) };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const makers = s.makers.filter((u) => ctx.members.some((m) => m.id === u));
    return makers.length === s.makers.length ? s : { ...s, makers };
  },

  invariants: {
    "rows 1 to 4": (s) => s.rows.length >= 1 && s.rows.length <= MAX_ROWS,
    "grid shape": (s) => s.cells.length === s.rows.length && s.cells.every((r) => r.length === STEPS && r.every((c) => typeof c === "boolean")),
    "shuffles count up": (s) => Number.isInteger(s.shuffles) && s.shuffles >= 0,
    "makers unique and here": (s, ctx) => new Set(s.makers).size === s.makers.length && s.makers.every((u) => ctx.members.some((m) => m.id === u)),
    "posted loop has a hit": (s) => s.posted === null || s.cells.some((r) => r.some(Boolean)),
  },

  transitions: {
    "toggle flips one cell": (p, n, a) => {
      if (a.t !== "toggle" || n === p) return true;
      const x = p.cells.flat();
      const y = n.cells.flat();
      const diff = x.map((c, i) => (c !== y[i] ? i : -1)).filter((i) => i >= 0);
      return diff.length === 1 && diff[0] === a.row * STEPS + a.step;
    },
    "toggle needs an open loop": (p, n, a) => a.t !== "toggle" || p.posted === null || n === p,
    "shuffle is seeded": (p, n, a, m) => a.t !== "shuffle" || n === p || JSON.stringify(n.cells) === JSON.stringify(shuffled(p.rows.length, m.seed)),
    "shuffle counts": (p, n, a) => a.t !== "shuffle" || n === p || n.shuffles === p.shuffles + 1,
    "only shuffle counts": (p, n, a) => a.t === "shuffle" || n.shuffles === p.shuffles,
    "post once by the poster": (p, n, a, m) => a.t !== "post" || n === p || (p.posted === null && n.posted?.by === m.user),
    "posted stays": (p, n) => p.posted === null || (n.posted === p.posted && JSON.stringify(n.cells) === JSON.stringify(p.cells)),
    "actor becomes a maker": (p, n, a, m) => typeof a.t !== "string" || n === p || n.makers.includes(m.user),
    "rows never change": (p, n) => JSON.stringify(n.rows) === JSON.stringify(p.rows),
  },

  arbitrary: (s, _user, r) => {
    if (s.posted !== null) return null;
    const x = r.next();
    if (x < 0.8) return { t: "toggle", row: r.int(s.rows.length), step: r.int(STEPS) };
    if (x < 0.96) return { t: "shuffle" };
    return { t: "post" };
  },

  local: { shuffling: false },

  view: ({ state, confirmed, pending, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const RC = [p.blue, p.yellow, p.green, p.red];
    const now = clock.value;
    const step = Math.floor(now / STEP_MS) % STEPS;
    const since = now % STEP_MS;
    const hitK = Math.max(0, 1 - since / HIT_MS);
    const n = state.rows.length;
    const dimmed = local.shuffling && pending;
    const cells = dimmed ? confirmed.cells : state.cells;
    const posted = state.posted;
    const locked = posted !== null;
    const inner = theme.width - 2 * theme.space.card;
    const wide = theme.width >= 380;
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));

    const userOf = (r: Row): Member => members.find((m) => m.id === r.who) ?? { id: r.who, name: r.name };
    const isGuest = (r: Row) => !members.some((m) => m.id === r.who);
    const jumpOf = (i: number) => {
      const on = cells[i]?.[step] === true;
      return on ? 22 * (1 - Math.pow(1 - hitK, 3)) : Math.abs(Math.sin((now / 1000) * (BPM / 60) * Math.PI)) * 3;
    };

    const total = hits(cells);
    const unused = state.rows.findIndex((_, i) => !cells[i]!.some(Boolean));
    const hint = locked
      ? `${total} ${total === 1 ? "shout" : "shouts"} in the loop`
      : dimmed
        ? "Shuffling"
        : unused >= 0
          ? `${state.rows[unused]!.name}'s ${state.rows[unused]!.shout.toLowerCase()} is unused`
          : state.shuffles > 0
            ? "Keep shuffling or post it"
            : "Tap any cell to add or remove a shout";

    const names = state.rows.map((r) => r.name);
    const label = `Dance floor with ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : (names[0] ?? "friends")}`;

    const pitch = wide ? (inner - LABEL) / STEPS : inner / STEPS;
    const gridH = wide ? n * 44 + (n - 1) * 6 : n * 60 + (n - 1) * 2;

    const cell = (i: number, s: number) => {
      const on = cells[i]![s]!;
      const playing = on && s === step;
      const fill = on ? RC[i]! : s % 4 === 0 ? c.secondaryButton : c.input;
      const inside = (
        <span style={{ position: "absolute", top: 0, bottom: 0, left: 2.5, right: 2.5, borderRadius: 8, background: fill, transform: playing ? `scale(${1 + 0.06 * hitK})` : undefined, overflow: "hidden" }}>
          {playing ? <span style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: c.card, opacity: 0.45 * hitK }} /> : null}
        </span>
      );
      const box = { position: "relative" as const, width: pitch, height: 44, flex: "none" as const, display: "block" };
      if (locked) return <div key={s} style={box}>{inside}</div>;
      return (
        <button
          key={s}
          type="button"
          class="m-hit"
          aria-pressed={on}
          aria-label={`${state.rows[i]!.shout} on beat ${s + 1}`}
          onClick={() => {
            setLocal({ shuffling: false });
            dispatch({ t: "toggle", row: i, step: s });
          }}
          style={{ ...box, background: "none", padding: 0 }}
        >
          {inside}
        </button>
      );
    };

    const who = (r: Row, i: number, size: number) => {
      const hitting = cells[i]?.[step] === true && hitK > 0;
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, height: wide ? 44 : 14 }}>
          <div style={{ flex: "none", display: "flex", margin: wide ? 0 : "-2px 0" }}>
            <Avatar user={userOf(r)} size={hitting ? size + 3 : size} />
          </div>
          <span style={{ minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.shout}</span>
        </div>
      );
    };

    return (
      <div role="region" aria-label="Squad beat" style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ position: "relative", height: 210, borderRadius: 12, overflow: "hidden", background: p.dark }}>
          <Canvas
            height={210}
            label={label}
            draw={(g, f) => {
              const W = f.width;
              const H = f.height;
              const q = pal(f.theme);
              const col = [q.blue, q.yellow, q.green, q.red];
              const st = Math.floor(f.now / STEP_MS) % STEPS;
              const sn = f.now % STEP_MS;
              const hk = Math.max(0, 1 - sn / HIT_MS);
              const last = n - 1;
              const boom = cells[last]?.[st] === true;
              const top = boom ? mix(mix(q.red, q.dark, 0.35), col[last % 4]!, 0.35 * hk) : mix(q.red, q.dark, 0.35);
              const grad = g.createLinearGradient(0, 0, 0, H);
              grad.addColorStop(0, top);
              grad.addColorStop(1, q.dark);
              g.fillStyle = grad;
              g.fillRect(0, 0, W, H);

              for (let k = 0; k < 4; k++) {
                const a = Math.sin((f.now / 1000) * 0.8 + k * 1.6) * 0.5;
                const x0 = 40 + (k * W) / 4;
                const dx = Math.sin(a) * 260;
                const dy = Math.cos(a) * 260;
                const px = Math.cos(a) * 30;
                const py = -Math.sin(a) * 30;
                g.globalAlpha = 0.12 + 0.12 * hk * (boom ? 1 : 0);
                g.fillStyle = col[k]!;
                g.beginPath();
                g.moveTo(x0, 0);
                g.lineTo(x0 + dx + px, dy + py);
                g.lineTo(x0 + dx - px, dy - py);
                g.closePath();
                g.fill();
              }

              const cols = Math.ceil(W / 32);
              for (let r = 0; r < 3; r++) {
                for (let k = 0; k < cols; k++) {
                  const lit = (k + r + st) % 3 === 0;
                  g.globalAlpha = lit ? 0.55 : 0.5;
                  g.fillStyle = lit ? col[(k + r) % 4]! : q.dark;
                  g.fillRect(k * 32, H - 46 + r * 16, 32, 16);
                }
              }
              g.globalAlpha = 1;

              for (let i = 0; i < n; i++) {
                const x = (W * (i + 0.5)) / n;
                const on = cells[i]?.[st] === true;
                const jump = on ? 22 * (1 - Math.pow(1 - hk, 3)) : Math.abs(Math.sin((f.now / 1000) * (BPM / 60) * Math.PI)) * 3;
                g.fillStyle = col[i % 4]!;
                g.beginPath();
                g.ellipse(x, H - 30 - jump, 32, 20, 0, 0, Math.PI * 2);
                g.fill();
                if (on && hk > 0.05) {
                  const fit = fitText(state.rows[i]!.shout, 110, { g, size: 16 * (0.8 + 0.4 * hk), weight: 600 });
                  g.font = fit.font;
                  const tw = g.measureText(fit.text).width;
                  const bw = tw + 22;
                  const bh = 28;
                  const by = H - 30 - jump - 70 - (1 - hk) * 10;
                  const bx = x - bw / 2;
                  g.beginPath();
                  g.moveTo(bx + 14, by - 14);
                  g.arcTo(bx + bw, by - 14, bx + bw, by, 14);
                  g.arcTo(bx + bw, by + 14, bx + bw - 14, by + 14, 14);
                  g.arcTo(bx, by + 14, bx, by, 14);
                  g.arcTo(bx, by - 14, bx + 14, by - 14, 14);
                  g.closePath();
                  g.fillStyle = f.theme.color.card;
                  g.fill();
                  g.lineWidth = 2;
                  g.strokeStyle = col[i % 4]!;
                  g.stroke();
                  g.fillStyle = f.theme.color.text;
                  g.textAlign = "center";
                  g.textBaseline = "middle";
                  g.fillText(fit.text, x, by + 1);
                  g.textAlign = "start";
                }
              }
              return true;
            }}
          />
          <div style={{ position: "absolute", left: 12, top: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 26, height: 26, borderRadius: 13, background: c.card, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke={c.primary} stroke-width="3">
                <circle cx="9" cy="9" r="6" />
              </svg>
            </span>
            <span style={{ fontSize: 20, fontWeight: 700, color: p.on }}>Squad beat</span>
          </div>
          <div style={{ position: "absolute", left: 16, top: 44, fontSize: 13, color: p.on, whiteSpace: "nowrap" }}>112 bpm · 8-step loop for your story</div>
          {state.rows.map((r, i) => (
            <Placed key={i} user={userOf(r)} x={(i + 0.5) / n} y={(210 - 62 - jumpOf(i)) / 210} size={48} move={false} dim={isGuest(r)} />
          ))}
        </div>

        <div style={{ position: "relative", marginTop: 12, height: gridH, opacity: dimmed ? 0.5 : 1 }}>
          <div
            style={{
              position: "absolute",
              left: wide ? LABEL + step * pitch : step * pitch,
              top: wide ? -4 : 12,
              width: pitch,
              height: wide ? gridH + 6 : gridH - 10,
              borderRadius: 8,
              background: c.hover,
            }}
          />
          <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true" style={{ position: "absolute", left: (wide ? LABEL : 0) + step * pitch + pitch / 2 - 6, top: wide ? -11 : 4 }} fill={c.text}>
            <path d="M0 0h12L6 8z" />
          </svg>
          <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: wide ? 6 : 2 }}>
            {state.rows.map((r, i) =>
              wide ? (
                <div key={i} style={{ display: "flex", alignItems: "center", height: 44 }}>
                  <div style={{ width: LABEL, flex: "none", minWidth: 0 }}>{who(r, i, 26)}</div>
                  <div style={{ display: "flex" }}>{Array.from({ length: STEPS }, (_, s) => cell(i, s))}</div>
                </div>
              ) : (
                <div key={i} style={{ height: 60 }}>
                  {who(r, i, 18)}
                  <div style={{ display: "flex", marginTop: 2 }}>{Array.from({ length: STEPS }, (_, s) => cell(i, s))}</div>
                </div>
              ),
            )}
          </div>
        </div>

        <div style={{ marginTop: 8, height: 20, lineHeight: "20px", fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hint}</div>

        <div style={{ marginTop: 8, height: 44, display: "flex", gap: 8, alignItems: "center" }}>
          {posted ? (
            (() => {
              const e = running(posted.at, 200);
              const k = e === null ? 1 : rise(e);
              return (
                <div style={{ flex: 1, height: 44, borderRadius: 8, background: c.secondaryButton, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: k, transform: `translateY(${8 * (1 - k)}px)` }}>
                  <Facepile users={state.makers} max={4} size={22} />
                  <span style={{ fontSize: 15, fontWeight: 600, color: c.text }}>{posted.by === me ? "On your story" : `On ${nameOf(posted.by)}'s story`}</span>
                </div>
              );
            })()
          ) : (
            <>
              <div style={{ width: 110, flex: "none" }}>
                <Button
                  kind="secondary"
                  wide
                  onClick={() => {
                    setLocal({ shuffling: true });
                    dispatch({ t: "shuffle" });
                  }}
                >
                  Shuffle
                </Button>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Button
                  kind="primary"
                  wide
                  onClick={() => {
                    dispatch({ t: "post" });
                    if (hits(state.cells) > 0) haptic("success");
                  }}
                >
                  Post
                </Button>
              </div>
            </>
          )}
        </div>
        {posted && posted.by === me && running(posted.at, 2600) !== null ? <Toast key={posted.at}>Posted to your story</Toast> : null}
      </div>
    );
  },
});
