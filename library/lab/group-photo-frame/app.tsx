import {
  defineApp,
  Avatar,
  Button,
  CardHeader,
  Toast,
  fitText,
  haptic,
  mix,
  pal,
  running,
  userColor,
  type Child,
  type Ctx,
  type Member,
} from "@muse/app";

// "We have no group photo from this year": a frame on the wall with everyone's silhouette. Tap the
// days you're around and you step into the frame; the one day everyone is free lights the frame up,
// and anyone can set the reminder to take it that night.

type Params = {
  /** Card title */
  title: string;
  /** Who posted and what they said */
  post: { by: string; text: string };
  /** Everyone who should be in the photo, by first name */
  people: string[];
  /** 2 to 6 days to choose from, in order, with who is already free and in town */
  days: { dow: string; date: string; label: string; free: string[] }[];
  /** When the reminder goes off that day, e.g. "8pm" */
  remindAt: string;
};

// @params
const P: Params = {
  title: "One group photo, this year",
  post: { by: "Tsai Lin", text: "we have no group photo from this year" },
  people: ["Aditya", "Calvin", "Arun", "Tsai Lin", "Will", "Maya"],
  days: [
    { dow: "Tue", date: "Dec 2", label: "", free: ["Maya", "Arun", "Calvin"] },
    { dow: "Wed", date: "Dec 3", label: "", free: ["Tsai Lin", "Maya"] },
    { dow: "Thu", date: "Dec 4", label: "", free: ["Arun", "Will", "Tsai Lin", "Aditya"] },
    { dow: "Fri", date: "Dec 5", label: "", free: ["Will", "Calvin"] },
    { dow: "Sat", date: "Dec 6", label: "formal", free: ["Calvin", "Arun", "Tsai Lin", "Will", "Maya"] },
    { dow: "Sun", date: "Dec 7", label: "", free: ["Maya", "Arun"] },
  ],
  remindAt: "8pm",
};
// @end params

type Day = { id: string; dow: string; date: string; label: string; free: string[]; at: number };
type State = {
  title: string;
  poster: string;
  quote: string;
  people: string[];
  days: Day[];
  remindAt: string;
  remind: { day: string; at: number; by: string } | null;
};
type Action = { t: "free"; day: string } | { t: "remind"; day: string };
type Local = { day: string };

const MAX_PEOPLE = 10;
const PIC_H = 212;
const FLASH_MS = 1100;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const standIn = (u: string) => u.startsWith("~");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const r1 = (n: number) => Math.round(n * 10) / 10;
const everyone = (s: State, d: Day) => s.people.length > 0 && s.people.every((u) => d.free.includes(u));
const best = (s: State) => s.days.reduce((b, d) => (d.free.length > b.free.length ? d : b), s.days[0]!);

function initState(ctx: Ctx): State {
  const idFor = (name: string) => ctx.members.find((m) => m.id === name || m.name.toLowerCase() === name.toLowerCase())?.id ?? `~${name}`;
  const people: string[] = [];
  for (const n of Array.isArray(P.people) ? P.people : []) {
    const name = clean(n, 16);
    if (!name || people.length >= MAX_PEOPLE) continue;
    const u = idFor(name);
    if (!people.includes(u)) people.push(u);
  }
  for (const m of ctx.members) if (!people.includes(m.id) && people.length < MAX_PEOPLE) people.push(m.id);
  const days: Day[] = [];
  for (const d of Array.isArray(P.days) ? P.days : []) {
    if (days.length >= 6) break;
    const date = clean(d?.date, 10);
    if (!date) continue;
    const free: string[] = [];
    for (const n of Array.isArray(d?.free) ? d.free : []) {
      const u = idFor(clean(n, 16));
      if (people.includes(u) && !free.includes(u)) free.push(u);
    }
    days.push({ id: `d${days.length}`, dow: clean(d?.dow, 3), date, label: clean(d?.label, 14), free, at: 0 });
  }
  if (days.length === 0) days.push({ id: "d0", dow: "Sat", date: "This week", label: "", free: [], at: 0 });
  return {
    title: clean(P.title, 40) || "Group photo",
    poster: clean(P.post?.by, 16),
    quote: clean(P.post?.text, 60),
    people,
    days,
    remindAt: clean(P.remindAt, 10),
    remind: null,
  };
}

// ---- drawing ----

type Pal = ReturnType<typeof pal>;

/** A standing figure from the shoulders down, head centered at (x, y) with radius r. */
function figure(key: string, x: number, y: number, r: number, fill: string | null, line: string, p: Pal, bot: number): Child {
  const sw = r * 1.45;
  const top = y + r * 0.95;
  const body = `M${r1(x - sw)} ${r1(top + r * 1.9)} Q${r1(x - sw)} ${r1(top)} ${r1(x)} ${r1(top)} Q${r1(x + sw)} ${r1(top)} ${r1(x + sw)} ${r1(top + r * 1.9)} L${r1(x + sw)} ${r1(bot)} L${r1(x - sw)} ${r1(bot)} Z`;
  if (fill)
    return (
      <g key={key}>
        <path d={body} fill={fill} />
        <rect x={r1(x - r * 0.3)} y={r1(top - 2)} width={r1(r * 0.6)} height={r1(r * 0.5)} fill={mix(p.cream, p.brown, 0.3)} />
      </g>
    );
  return (
    <g key={key}>
      <path d={body} fill={mix(p.paper, line, 0.08)} stroke={line} stroke-width={1.5} stroke-dasharray="4 3" />
      <circle cx={r1(x)} cy={r1(y)} r={r1(r)} fill={mix(p.paper, line, 0.08)} stroke={line} stroke-width={1.5} stroke-dasharray="4 3" />
    </g>
  );
}

const CSS =
  "@keyframes gpFlash{0%{opacity:0}12%{opacity:.95}100%{opacity:0}}" +
  "@keyframes gpStep{from{transform:translateY(14px) scale(.7);opacity:0}to{transform:none;opacity:1}}" +
  "@keyframes gpTwinkle{0%,100%{opacity:1}50%{opacity:.55}}" +
  ".gp-flash{animation:gpFlash 1.1s ease-out both}" +
  ".gp-step{animation:gpStep .45s cubic-bezier(.34,1.56,.64,1) both}" +
  ".gp-tw{animation:gpTwinkle 1.6s ease-in-out infinite}" +
  "@media (prefers-reduced-motion:reduce){.gp-flash,.gp-step,.gp-tw{animation:none}}";

export default defineApp<State, Action, Local>({
  name: "Group photo frame",
  summary: (s) => {
    if (s.remind) {
      const d = s.days.find((x) => x.id === s.remind!.day);
      return `Group photo ${d ? `on ${d.dow} ${d.date}` : "is set"} · reminder at ${s.remindAt || "night"}`;
    }
    const b = best(s);
    return everyone(s, b) ? `Everyone is free ${b.dow} ${b.date} for the group photo` : `Group photo: best day so far ${b.dow} ${b.date}, ${b.free.length} of ${s.people.length} free`;
  },

  init: (ctx) => initState(ctx),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user) || typeof action.day !== "string") return state;
    const day = state.days.find((d) => d.id === action.day);
    if (!day) return state;
    if (action.t === "free") {
      if (!state.people.includes(meta.user)) return state;
      if (state.remind && state.remind.day === day.id && day.free.includes(meta.user)) return state;
      const free = day.free.includes(meta.user) ? day.free.filter((u) => u !== meta.user) : [...day.free, meta.user];
      return { ...state, days: state.days.map((d) => (d.id === day.id ? { ...d, free, at: meta.time } : d)) };
    }
    if (action.t === "remind") {
      if (state.remind || !everyone(state, day)) return state;
      return { ...state, remind: { day: day.id, at: meta.time, by: meta.user } };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    let people = state.people.filter((u) => standIn(u) || inChat(ctx, u));
    for (const m of ctx.members) {
      if (people.includes(m.id)) continue;
      const stand = people.indexOf(`~${m.name}`);
      if (stand >= 0) people = people.map((u, i) => (i === stand ? m.id : u));
      else if (people.length < MAX_PEOPLE) people = [...people, m.id];
    }
    const swap = (u: string) => (standIn(u) ? (ctx.members.find((m) => `~${m.name}` === u)?.id ?? u) : u);
    const days = state.days.map((d) => {
      const free: string[] = [];
      for (const u of d.free.map(swap)) if (people.includes(u) && !free.includes(u)) free.push(u);
      return free.length === d.free.length && free.every((u, i) => u === d.free[i]) ? d : { ...d, free };
    });
    if (same(people, state.people) && days.every((d, i) => d === state.days[i])) return state;
    return { ...state, people, days };
  },

  invariants: {
    "everyone in the frame once": (s) => new Set(s.people).size === s.people.length && s.people.length <= MAX_PEOPLE,
    "free lists hold people from the frame, once each": (s) => s.days.every((d) => new Set(d.free).size === d.free.length && d.free.every((u) => s.people.includes(u))),
    "people are in the chat or named in the post": (s, ctx) => s.people.every((u) => standIn(u) || inChat(ctx, u)),
    "a reminder is for a real day": (s) => s.remind === null || s.days.some((d) => d.id === s.remind!.day),
    "day ids are unique": (s) => new Set(s.days.map((d) => d.id)).size === s.days.length,
    "everyone in the chat is in the frame": (s, ctx) => s.people.length >= MAX_PEOPLE || ctx.members.every((m) => s.people.includes(m.id)),
    "a stand-in is nobody in the chat": (s, ctx) => s.people.every((u) => !standIn(u) || !ctx.members.some((m) => `~${m.name}` === u)),
  },

  transitions: {
    "free toggles only me on that day": (p, n, a, m) => {
      if (a.t !== "free" || p === n) return true;
      return p.days.every((d, i) => {
        const e = n.days[i]!;
        if (d.id !== a.day) return same(d, e);
        return d.free.includes(m.user) !== e.free.includes(m.user) && same(d.free.filter((u) => u !== m.user), e.free.filter((u) => u !== m.user)) && e.at === m.time;
      });
    },
    "a person in the frame can always mark a free day": (p, n, a, m, ctx) => {
      if (a.t !== "free" || !inChat(ctx, m.user) || !p.people.includes(m.user)) return true;
      const d = p.days.find((x) => x.id === a.day);
      if (!d || (p.remind?.day === d.id && d.free.includes(m.user))) return true;
      return p !== n;
    },
    "the reminder needs everyone free": (p, n, a) => {
      if (n.remind === p.remind) return true;
      const d = p.days.find((x) => x.id === n.remind?.day);
      return a.t === "remind" && p.remind === null && !!d && everyone(p, d);
    },
    "a full day takes the reminder": (p, n, a, m, ctx) => {
      if (a.t !== "remind" || p.remind || !inChat(ctx, m.user)) return true;
      const d = p.days.find((x) => x.id === a.day);
      return !d || !everyone(p, d) || (n.remind?.day === d.id && n.remind.at === m.time && n.remind.by === m.user);
    },
    "the reminder stays set": (p, n) => p.remind === null || same(p.remind, n.remind),
    "nobody leaves the reminder day": (p, n) => {
      if (!p.remind) return true;
      const a = p.days.find((d) => d.id === p.remind!.day);
      const b = n.days.find((d) => d.id === p.remind!.day);
      return !a || !b || a.free.every((u) => b.free.includes(u) || !n.people.includes(u));
    },
    "only a free tap changes who is free": (p, n, a) => a.t === "free" || p.days.every((d, i) => d.free.every((u) => !n.people.includes(u) || !!n.days[i]?.free.includes(u))),
    "the days never move": (p, n) => same(p.days.map((d) => [d.id, d.dow, d.date, d.label]), n.days.map((d) => [d.id, d.dow, d.date, d.label])),
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    const d = r.pick(s.days);
    if (r.next() < 0.03) return { t: "free", day: "nope" };
    return r.next() < 0.75 ? { t: "free", day: d.id } : { t: "remind", day: d.id };
  },

  local: { day: "" },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const dark = theme.mode === "dark";
    const person = (u: string): Member => (standIn(u) ? { id: u, name: u.slice(1) } : members.find((m) => m.id === u)) ?? { id: u, name: "Friend" };
    const reminded = state.remind ? state.days.find((d) => d.id === state.remind!.day) : undefined;
    const sel = state.days.find((d) => d.id === local.day) ?? reminded ?? best(state);
    const full = everyone(state, sel);
    const inFrame = state.people.includes(me);
    const imFree = sel.free.includes(me);
    const isReminded = !!reminded && reminded.id === sel.id;
    const flashing = full && sel.at > 0 && running(sel.at, FLASH_MS) !== null;

    // The frame.
    const fx = 22;
    const fw = W - 44;
    const fy = 26;
    const fh = PIC_H - 46;
    const bd = 11;
    const ix = fx + bd;
    const iw = fw - 2 * bd;
    const iy = fy + bd;
    const ih = fh - 2 * bd;
    const wood = full ? mix(p.yellow, p.orange, 0.35) : p.crust;
    const backdrop = full ? mix(p.cream, p.yellow, 0.25) : mix(p.paper, p.sky, dark ? 0.25 : 0.5);

    const n = state.people.length;
    const step = iw / Math.max(n, 3);
    const r = Math.max(10, Math.min(18, step * 0.36));
    const placed = state.people.map((u, i) => ({ u, x: ix + iw / 2 + (i - (n - 1) / 2) * step, y: iy + (i % 2 === 0 ? ih * 0.33 : ih * 0.58) }));
    const clipId = `gp${Math.round(W)}${dark ? "d" : "l"}`;

    // String lights above the frame.
    const bulbs: Child[] = [];
    let wire = `M4 10`;
    const nb = Math.max(6, Math.round(W / 34));
    for (let k = 0; k <= nb; k++) {
      const x = 4 + (k * (W - 8)) / nb;
      const y = 10 + (k % 2 ? 9 : 3);
      wire += ` Q${r1(x - (W - 8) / nb / 2)} ${r1(y + 6)} ${r1(x)} ${y}`;
      bulbs.push(<circle key={`b${k}`} cx={r1(x)} cy={y + 4} r={3.6} fill={full ? [p.yellow, p.red, p.green, p.blue][k % 4]! : mix(p.paper, p.soft, 0.35)} {...(full ? { class: "gp-tw", style: { animationDelay: `${(k % 4) * 0.3}s` } } : {})} />);
    }

    const art: Child[] = [
      <rect key="wall" x={0} y={0} width={W} height={PIC_H} fill={dark ? mix(c.series5, c.wash, 0.82) : p.wall} />,
      <path key="wire" d={wire} fill="none" stroke={p.soft} stroke-width={1.2} />,
      ...bulbs,
      <rect key="shadow" x={fx + 4} y={fy + 6} width={fw} height={fh} rx={4} fill={dark ? c.wash : mix(p.wall, c.text, 0.18)} />,
      <rect key="wood" x={fx} y={fy} width={fw} height={fh} rx={4} fill={wood} />,
      <rect key="inner" x={ix} y={iy} width={iw} height={ih} fill={backdrop} />,
      <rect key="floor" x={ix} y={iy + ih * 0.8} width={iw} height={ih * 0.2} fill={mix(backdrop, p.brown, 0.18)} />,
      ...Array.from({ length: Math.max(5, Math.round(iw / 26)) }, (_, k, arr = Math.max(5, Math.round(iw / 26))) => {
        const w = iw / arr;
        const x = ix + k * w;
        return <path key={`pn${k}`} d={`M${r1(x + 2)} ${iy + 8} L${r1(x + w - 2)} ${iy + 8} L${r1(x + w / 2)} ${iy + 24} Z`} fill={[p.red, p.yellow, p.blue, p.green, p.purple][k % 5]!} opacity={full ? 1 : 0.55} />;
      }),
      <path key="pnw" d={`M${ix} ${iy + 8} L${ix + iw} ${iy + 8}`} stroke={p.soft} stroke-width={1} />,
      <clipPath key="cp" id={clipId}><rect x={ix} y={iy} width={iw} height={ih} /></clipPath>,
      <g key="ppl" clip-path={`url(#${clipId})`}>{placed.map((pl) => {
        const on = sel.free.includes(pl.u);
        return figure(`p${pl.u}`, pl.x, pl.y, r, on ? userColor(person(pl.u), theme) : null, mix(p.soft, backdrop, 0.2), p, iy + ih + 4);
      })}</g>,
      <rect key="mat" x={ix} y={iy} width={iw} height={ih} fill="none" stroke={mix(wood, c.text, 0.25)} stroke-width={1} />,
    ];

    const plaqueText = isReminded
      ? `${sel.dow} ${sel.date}${sel.label ? ` · ${sel.label}` : ""} · reminder ${state.remindAt}`
      : sel.free.length === 0
        ? `${sel.dow} ${sel.date} · nobody yet, step in`
        : `${sel.dow} ${sel.date}${sel.label ? ` · ${sel.label}` : ""} · ${sel.free.length} of ${n} free`;
    const plaque = fitText(plaqueText, fw - 40, { size: 13, weight: 600, min: 10 });

    const quote = state.quote ? fitText(`${state.poster ? `${state.poster}: ` : ""}${state.quote}`, W - 16, { size: 13, min: 11 }) : null;

    const cellW = (W - 6 * (state.days.length - 1)) / state.days.length;
    const remindNow = state.remind && state.remind.at > 0 && running(state.remind.at, 2400) !== null;

    return (
      <div>
        <style>{CSS}</style>
        <CardHeader title={state.title} subtitle={quote ? quote.text : undefined} />
        <div role="img" aria-label={`Photo frame for ${sel.dow} ${sel.date}: ${sel.free.length} of ${n} free${full ? ", everyone" : ""}`} style={{ position: "relative", height: PIC_H, borderRadius: 12, overflow: "hidden" }}>
          <svg width={W} height={PIC_H} viewBox={`0 0 ${W} ${PIC_H}`} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0 }}>
            {art}
          </svg>
          {placed.map((pl) =>
            sel.free.includes(pl.u) ? (
              <div key={`h${sel.id}${pl.u}`} {...(sel.at > 0 && pl.u === me && running(sel.at, 600) !== null ? { class: "gp-step" } : {})} style={{ position: "absolute", left: r1(pl.x - r), top: r1(pl.y - r), width: 2 * r, height: 2 * r, borderRadius: r, boxShadow: `0 0 0 2px ${pl.u === me ? c.primary : backdrop}` }}>
                <Avatar user={person(pl.u)} size={Math.round(2 * r)} />
              </div>
            ) : null,
          )}
          {flashing ? <div key={`f${sel.at}`} class="gp-flash" style={{ position: "absolute", left: ix, top: iy, width: iw, height: ih, background: c.card, pointerEvents: "none" }} /> : null}
          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: fy + fh - 4, height: 24, maxWidth: fw - 20, padding: "0 10px", borderRadius: 6, background: isReminded ? c.primary : full ? mix(p.yellow, c.card, 0.2) : c.card, color: isReminded ? c.onPrimary : c.text, fontSize: plaque.size, fontWeight: 600, lineHeight: "24px", whiteSpace: "nowrap", boxShadow: `0 0 0 1px ${c.divider}` }}>
            {plaque.text}
          </div>
        </div>

        <div role="group" aria-label="Days" style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {state.days.map((d) => {
            const on = d.id === sel.id;
            const all = everyone(state, d);
            const mineFree = d.free.includes(me);
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={on}
                aria-label={`${d.dow} ${d.date}${d.label ? `, ${d.label}` : ""}: ${d.free.length} of ${n} free`}
                onClick={() => setLocal({ day: d.id })}
                style={{ position: "relative", width: cellW, height: 58, borderRadius: 10, background: all ? mix(c.card, p.yellow, 0.3) : on ? c.selected : c.wash, boxShadow: on ? `inset 0 0 0 2px ${c.primary}` : "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, overflow: "hidden" }}
              >
                <span style={{ fontSize: 12, lineHeight: "14px", color: c.text }}>{d.dow}</span>
                <span style={{ fontSize: 15, lineHeight: "18px", fontWeight: 700, color: c.text, whiteSpace: "nowrap" }}>{d.date.replace(/^[A-Za-z]+\s*/, "") || d.date}</span>
                <span aria-hidden="true" style={{ display: "flex", gap: 2, marginTop: 3, maxWidth: cellW - 8, flexWrap: "wrap", justifyContent: "center", height: 6, overflow: "hidden" }}>
                  {state.people.map((u) => (
                    <i key={u} style={{ width: 5, height: 5, borderRadius: 3, background: d.free.includes(u) ? (u === me && mineFree ? c.primary : c.text) : c.divider }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
          {inFrame ? (
            <div style={{ flex: 1 }}>
              <Button
                kind={full && !state.remind ? "secondary" : imFree ? "secondary" : "primary"}
                wide
                disabled={isReminded && imFree}
                onClick={() => {
                  dispatch({ t: "free", day: sel.id });
                  haptic(!imFree && sel.free.length + 1 === n ? "success" : "light");
                }}
              >
                {imFree ? `Busy ${sel.dow}` : `Free ${sel.dow}`}
              </Button>
            </div>
          ) : (
            <span style={{ flex: 1, fontSize: 13, color: c.secondaryText }}>{`${sel.free.length} of ${n} free ${sel.dow}`}</span>
          )}
          {full && !state.remind ? (
            <div style={{ flex: 1 }}>
              <Button
                kind="primary"
                wide
                onClick={() => {
                  dispatch({ t: "remind", day: sel.id });
                  haptic("success");
                }}
              >
                Set reminder
              </Button>
            </div>
          ) : null}
          {state.remind && reminded ? (
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{`Photo ${reminded.dow} ${reminded.date} · ${state.remindAt}`}</span>
          ) : null}
        </div>
        {remindNow ? <Toast key={state.remind!.at}>{`Reminder set for ${reminded?.dow ?? ""} at ${state.remindAt}`}</Toast> : null}
      </div>
    );
  },
});
