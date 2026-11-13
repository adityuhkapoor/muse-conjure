import { defineApp, Avatar, Burst, CardHeader, Toast, haptic, innerWidth, running } from "@muse/app";

// Road trip bingo: a card of the group's road-trip habits. Tap a square when it happens, your face
// goes on it, the car moves toward the destination, and the first full line wins the prize.

type Params = {
  title: string;
  prize: string;
  to: string;
  miles: number;
  squares: string[];
  spotted: { square: number; name: string }[];
};
type State = {
  title: string;
  prize: string;
  to: string;
  miles: number;
  size: 3 | 5;
  labels: string[];
  marks: (string | null)[];
  bingo: { line: number; by: string; at: number } | null;
};
type Action = { t: "mark"; cell: number };
type Local = { burst: number; shake: number };
type Ctx = { members: { id: string; name?: string }[] };

// @params
const P: Params = {
  title: "Road trip bingo",
  prize: "the aux",
  to: "Nashville",
  miles: 287,
  squares: [
    "Leo asks for a bathroom stop <1hr in", "Sam skips a song mid-chorus", "wrong exit (blame Maps)", "gas station sushi debate",
    "someone at 3% battery", "Priya: “are we there yet”", "Kev asleep, mouth open", "aux cord coup",
    "Ana: “wait this is my song”", "Waffle House sighting", "cow count dispute", "snack bag crinkle at 7am",
    "someone sings Wagon Wheel", "speed trap paranoia", "“we should've left earlier”", "Buc-ee's detour vote",
    "Sam drives w/ one knee", "Alaska license plate", "road snack spill", "Kev: “I'm not even tired”",
    "lawyer billboard", "missed the exit (again)", "state line selfie", "Priya naps on Ana",
  ],
  spotted: [
    { square: 0, name: "Sam" },
    { square: 6, name: "Priya" },
    { square: 10, name: "Ana" },
    { square: 11, name: "Leo" },
    { square: 12, name: "Kev" },
    { square: 16, name: "Priya" },
    { square: 22, name: "Ana" },
  ],
};
// @end params

const FILL = ["gas station stop", "someone falls asleep", "wrong turn", "snack run", "out-of-state plate", "song everyone knows", "“are we there yet”", "billboard for a lawyer"];
const SWEEP_MS = 700;
const STEP_MS = 120;

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const freeOf = (size: number) => (size * size - 1) / 2;
const LINE_CACHE: Record<number, number[][]> = {};
function linesOf(size: number): number[][] {
  const hit = LINE_CACHE[size];
  if (hit) return hit;
  const out: number[][] = [];
  for (let r = 0; r < size; r++) out.push(Array.from({ length: size }, (_, c) => r * size + c));
  for (let c = 0; c < size; c++) out.push(Array.from({ length: size }, (_, r) => r * size + c));
  out.push(Array.from({ length: size }, (_, i) => i * size + i));
  out.push(Array.from({ length: size }, (_, i) => i * size + (size - 1 - i)));
  LINE_CACHE[size] = out;
  return out;
}
const isOn = (s: State, i: number) => i === freeOf(s.size) || s.marks[i] !== null;
const complete = (s: State): number[] => {
  const out: number[] = [];
  linesOf(s.size).forEach((l, k) => {
    if (l.every((i) => isOn(s, i))) out.push(k);
  });
  return out;
};
const spottedCount = (s: State) => s.marks.filter((u) => u !== null).length;

export default defineApp<State, Action, Local>({
  name: "Road trip bingo",
  summary: (s, ctx) => {
    const n = `${spottedCount(s)} of ${s.size * s.size - 1} spotted`;
    if (!s.bingo) return `${s.title}: ${n}`;
    const who = ctx.members.find((m) => m.id === s.bingo!.by)?.name ?? "Someone";
    return `${s.title}: ${who} called bingo · ${n}`;
  },

  init: (ctx) => {
    const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
    const given = (Array.isArray(P.squares) ? P.squares : []).map((x) => text(x, 48)).filter(Boolean);
    const size: 3 | 5 = given.length >= 24 ? 5 : 3;
    let base = given.slice(0, size === 5 ? 24 : 8);
    if (size === 3) {
      let i = 0;
      while (base.length < 8) base.push(FILL[i++ % FILL.length]!);
    }
    const free = freeOf(size);
    const labels = [...base.slice(0, free), "Free", ...base.slice(free)];
    const marks: (string | null)[] = labels.map(() => null);
    const spotCells: number[] = [];
    (Array.isArray(P.spotted) ? P.spotted : []).forEach((sp) => {
      if (!sp || !Number.isInteger(sp.square) || sp.square < 0 || sp.square >= labels.length - 1) return;
      const cell = sp.square < free ? sp.square : sp.square + 1;
      const want = String(sp.name ?? "").trim().toLowerCase();
      const m = want ? ctx.members.find((x) => x.id === sp.name || (x.name ?? "").toLowerCase() === want) : undefined;
      if (!m) return;
      marks[cell] = m.id;
      spotCells.push(cell);
    });
    const s: State = {
      title: text(P.title, 40) || "Road trip bingo",
      prize: text(P.prize, 24) || "the aux",
      to: text(P.to, 24) || "Nashville",
      miles: Number.isInteger(P.miles) && P.miles >= 1 && P.miles <= 5000 ? P.miles : 100,
      size,
      labels,
      marks,
      bingo: null,
    };
    for (let guard = 0; guard < 20; guard++) {
      const done = complete(s);
      if (!done.length) break;
      const line = linesOf(size)[done[0]!]!;
      const last = [...spotCells].reverse().find((c) => line.includes(c) && s.marks[c] !== null);
      if (last === undefined) break;
      marks[last] = null;
    }
    return s;
  },

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user) || a.t !== "mark") return s;
    const cell = a.cell;
    if (typeof cell !== "number" || !Number.isInteger(cell) || cell < 0 || cell >= s.labels.length || cell === freeOf(s.size)) return s;
    const cur = s.marks[cell];
    if (cur === null) {
      const marks = s.marks.map((u, i) => (i === cell ? meta.user : u));
      const next = { ...s, marks };
      const done = complete(next);
      return s.bingo === null && done.length ? { ...next, bingo: { line: done[0]!, by: meta.user, at: meta.time } } : next;
    }
    if (cur !== meta.user) return s;
    if (s.bingo && linesOf(s.size)[s.bingo.line]!.includes(cell)) return s;
    return { ...s, marks: s.marks.map((u, i) => (i === cell ? null : u)) };
  },

  onMembers: (s, ctx) => {
    if (s.marks.every((u) => u === null || inChat(ctx, u))) return s;
    const next: State = { ...s, marks: s.marks.map((u) => (u !== null && inChat(ctx, u) ? u : null)) };
    if (next.bingo && !complete(next).includes(next.bingo.line)) {
      const done = complete(next);
      next.bingo = done[0] !== undefined ? { ...next.bingo, line: done[0] } : null;
    }
    return next;
  },

  invariants: {
    "the free square is never marked": (s) => s.marks[freeOf(s.size)] === null && s.marks.length === s.labels.length && s.labels.length === s.size * s.size,
    "marks belong to people in the chat": (s, ctx) => s.marks.every((u) => u === null || inChat(ctx, u)),
    "a full line means someone called bingo": (s) => complete(s).length === 0 || s.bingo !== null,
    "the bingo line is full": (s) => s.bingo === null || complete(s).includes(s.bingo.line),
    "labels and size are fixed": (s) => (s.size === 3 || s.size === 5) && s.labels.length > 0 && s.labels.every((l) => l.length > 0) && s.labels[freeOf(s.size)] === "Free",
  },

  transitions: {
    "a mark changes exactly one cell, to or from the marker": (p, n, a, m) => {
      if (a.t !== "mark" || p === n) return true;
      const diff = n.marks.map((u, i) => (u !== p.marks[i] ? i : -1)).filter((i) => i >= 0);
      if (diff.length !== 1 || diff[0] !== a.cell) return false;
      return p.marks[a.cell] === null ? n.marks[a.cell] === m.user : p.marks[a.cell] === m.user && n.marks[a.cell] === null;
    },
    "nobody erases someone else's mark": (p, n, a, m) => a.t !== "mark" || p.marks.every((u, i) => u === null || u === m.user || n.marks[i] === u),
    "the mark that fills the first line calls bingo then": (p, n, a, m) => {
      if (a.t !== "mark" || p.bingo !== null) return true;
      const done = complete(n);
      return done.length > 0 ? n.bingo?.by === m.user && n.bingo.at === m.time && n.bingo.line === done[0] : n.bingo === null;
    },
    "a called bingo stands": (p, n, a) => a.t !== "mark" || p.bingo === null || JSON.stringify(n.bingo) === JSON.stringify(p.bingo),
    "labels never change": (p, n) => JSON.stringify(p.labels) === JSON.stringify(n.labels) && p.size === n.size,
    "only people in the chat mark": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const free = freeOf(s.size);
    const win = s.bingo ? linesOf(s.size)[s.bingo.line]! : [];
    const empty = s.marks.map((u, i) => (u === null && i !== free ? i : -1)).filter((i) => i >= 0);
    const mine = s.marks.map((u, i) => (u === user && !win.includes(i) ? i : -1)).filter((i) => i >= 0);
    if (r.next() < 0.8 && empty.length) return { t: "mark", cell: r.pick(empty) };
    if (mine.length) return { t: "mark", cell: r.pick(mine) };
    return { t: "mark", cell: r.int(s.size * s.size) };
  },

  local: { burst: 0, shake: -1 },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const { size, labels, marks, bingo } = state;
    const free = freeOf(size);
    const cells = size * size;
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const spotted = spottedCount(state);
    const p = spotted / (cells - 1);
    const left = state.miles - Math.floor((state.miles * spotted) / (cells - 1));
    const narrow = theme.width < 360;
    const cellH = size === 5 ? 68 : 66;
    const line = bingo ? linesOf(size)[bingo.line]! : [];

    // The winning line fills blue one square after another.
    const e = confirmed.bingo && bingo && confirmed.bingo.at === bingo.at ? running(bingo.at, SWEEP_MS) : null;
    const lit = (k: number) => e === null || e >= k * STEP_MS;
    const cellLit = (i: number) => {
      const k = line.indexOf(i);
      return bingo !== null && k >= 0 && lit(k);
    };
    const letterLit = (col: number) => {
      if (!bingo) return false;
      const ks = line.map((i, k) => (i % size === col ? k : -1)).filter((k) => k >= 0);
      return ks.length ? lit(Math.min(...ks)) : e === null || e >= 0;
    };

    const counts = members.map((m) => ({ m, n: marks.filter((u) => u === m.id).length })).filter((x) => x.n > 0);
    const lead = counts.reduce<(typeof counts)[number] | null>((t, x) => (t === null || x.n > t.n ? x : t), null);
    const footer = bingo
      ? bingo.by === me
        ? `You called it · ${state.prize} is yours`
        : `${nameOf(bingo.by)} called it first`
      : `${spotted} of ${cells - 1} spotted${lead ? ` · ${lead.m.id === me ? "You lead" : `${lead.m.name ?? "Someone"} leads`} with ${lead.n}` : ""} · tap to mark`;

    const press = (i: number) => {
      const who = marks[i];
      if (who === null) {
        const next = marks.map((u, j) => (j === i ? me : u));
        if (!bingo && complete({ ...state, marks: next }).length) haptic("success");
      } else if (who !== me) {
        setLocal({ shake: i, burst: local.burst + 1 });
        return;
      }
      dispatch({ t: "mark", cell: i });
    };

    const colW = ((innerWidth() - 4 * (size - 1)) / size - 6);
    const wrapLines = (t: string, px: number) => {
      let n = 1;
      let w = 0;
      for (const word of t.split(" ")) {
        const ww = word.length * px * 0.56;
        const sp = px * 0.3;
        if (w > 0 && w + sp + ww > colW) {
          n++;
          w = ww;
        } else w = w > 0 ? w + sp + ww : ww;
        if (ww > colW) {
          n += Math.ceil(ww / colW) - 1;
          w = ww % colW;
        }
      }
      return n;
    };
    const lhOf = (px: number) => (px >= 11 ? px + 2 : px + 1);
    const fit = (t: string, on: boolean): { px: number; mt: number; text: string } => {
      const top = narrow ? 11 : 12;
      const mt = on ? 3 : 0;
      const room = cellH - 2 - mt;
      for (let px = top; px >= 10; px--) if (wrapLines(t, px) * lhOf(px) <= room && (!on || px <= 11)) return { px, mt, text: t };
      // Too long even at 10 px: cut it at a word and end with an ellipsis.
      const words = t.split(" ");
      while (words.length > 1 && wrapLines(words.join(" ") + "…", 10) * lhOf(10) > room) words.pop();
      return { px: 10, mt, text: words.join(" ") + "…" };
    };
    const cell = (i: number) => {
      if (i === free) {
        const inLine = cellLit(i);
        return (
          <div
            key={i}
            style={{ height: cellH, borderRadius: 10, background: inLine ? c.primary : c.input, color: inLine ? c.onPrimary : c.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, transition: "background 200ms" }}
          >
            <svg width={22} height={22} viewBox="0 0 22 22" aria-hidden="true">
              <circle cx={11} cy={11} r={8} fill="none" stroke={inLine ? c.onPrimary : c.primary} stroke-width={3} />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 600, lineHeight: "15px" }}>Free</span>
          </div>
        );
      }
      const who = marks[i];
      const on = who !== null;
      const inLine = cellLit(i);
      const shaking = local.shake === i && local.burst > 0;
      const { px: fs, mt, text } = fit(labels[i]!, on);
      return (
        <button
          key={`${i}:${shaking ? local.burst : 0}`}
          type="button"
          aria-label={`${labels[i]}, ${on ? `spotted by ${nameOf(who!)}` : "not spotted"}`}
          aria-pressed={on}
          onClick={() => press(i)}
          style={{
            position: "relative",
            height: cellH,
            minHeight: 0,
            borderRadius: 10,
            border: "none",
            padding: "1px 3px",
            background: inLine ? c.primary : on ? c.selected : c.input,
            color: inLine ? c.onPrimary : c.text,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            cursor: "pointer",
            animation: shaking ? "rbShake 300ms" : undefined,
            transition: "background 200ms",
          }}
        >
          <span
            style={{
              display: "-webkit-box",
              WebkitLineClamp: "5",
              textOverflow: "ellipsis",
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              overflowWrap: "anywhere",
              fontSize: fs,
              lineHeight: `${lhOf(fs)}px`,
              maxWidth: "100%",
              minWidth: 0,
              marginTop: mt,
              transition: "margin 200ms",
            }}
          >
            {text}
          </span>
          {on ? (
            <span className="rb-pop" key={who!} style={{ position: "absolute", top: -5, right: -3, borderRadius: 8, boxShadow: `0 0 0 1.5px ${c.card}`, display: "flex" }}>
              <Avatar user={who!} size={14} />
            </span>
          ) : null}
        </button>
      );
    };

    return (
      <div style={{ position: "relative" }}>
        <style>{"@keyframes rbShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-3px)}40%{transform:translateX(3px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}@keyframes rbPop{from{transform:scale(.4)}to{transform:scale(1)}}.rb-pop{animation:rbPop 250ms cubic-bezier(.34,1.56,.64,1)}@media (prefers-reduced-motion:reduce){.rb-pop{animation:none}}"}</style>
        <div style={{ height: 44, overflow: "hidden" }}>
          <CardHeader title={state.title} subtitle={`First bingo gets ${state.prize}`} />
        </div>

        <div style={{ height: 26, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0, position: "relative", height: 6, marginLeft: 2 }} role="img" aria-label={`${left} miles to ${state.to}`}>
            <div style={{ position: "absolute", inset: 0, borderRadius: 3, background: c.track }} />
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${p * 100}%`, borderRadius: 3, background: c.primary, transition: "width 600ms cubic-bezier(.2,0,0,1)" }} />
            <svg
              width={24}
              height={14}
              viewBox="0 0 24 14"
              aria-hidden="true"
              style={{ position: "absolute", top: -4, left: `calc(10px + (100% - 20px) * ${p})`, marginLeft: -12, transition: "left 600ms cubic-bezier(.2,0,0,1)" }}
            >
              <rect x={1} y={3} width={22} height={9} rx={3} fill={c.primary} />
              <rect x={5} y={0} width={12} height={7} rx={3} fill={c.primary} />
              <circle cx={6} cy={12} r={2.8} fill={c.text} />
              <circle cx={18} cy={12} r={2.8} fill={c.text} />
            </svg>
          </div>
          <span style={{ flex: "none", fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap" }}>{`${left} mi to ${state.to}`}</span>
        </div>

        {size === 5 ? (
          <div style={{ height: 18, display: "grid", gridTemplateColumns: `repeat(${size}, 1fr)`, gap: 4, alignItems: "center", textAlign: "center", fontSize: 15, fontWeight: 600 }} aria-hidden="true">
            {["B", "I", "N", "G", "O"].map((ch, k) => (
              <span key={ch} style={{ color: letterLit(k) ? c.primary : c.secondaryText, transition: "color 200ms" }}>
                {ch}
              </span>
            ))}
          </div>
        ) : null}

        <div style={{ position: "relative", display: "grid", gridTemplateColumns: `repeat(${size}, 1fr)`, gap: 4 }}>
          {labels.map((_, i) => cell(i))}
          {bingo && confirmed.bingo?.at === bingo.at && bingo.by === me ? (
            <div style={{ position: "absolute", left: "50%", top: "50%" }}>
              <Burst key={bingo.at} emoji="🎉" />
            </div>
          ) : null}
        </div>

        <div style={{ minHeight: 20, lineHeight: "17px", padding: "2px 0", textAlign: "center", fontSize: 13, color: bingo?.by === me ? c.text : c.secondaryText }}>
          {footer}
        </div>
        {bingo && bingo.by === me && confirmed.bingo?.at === bingo.at ? <Toast key={bingo.at}>{`Bingo. ${state.prize[0]!.toUpperCase()}${state.prize.slice(1)} is yours.`}</Toast> : null}
      </div>
    );
  },
});
