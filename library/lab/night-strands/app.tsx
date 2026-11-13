import {
  defineApp,
  Avatar,
  Burst,
  Button,
  Canvas,
  Facepile,
  Thumb,
  fitText,
  haptic,
  textWidth,
  mix,
  pal,
  thumbKind,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// Night strands: Saturday night, six friends posted stories from the same night. The night drawn
// left to right by time as one coloured strand per friend, each story a bead on its strand. Strands
// braid together where people were in the same place (Golden Lantern at 8, the Anchor at 10:30)
// and split where they weren't. Tap a bead to see that moment and give it a heart.

type Params = {
  /** "Saturday night" */
  title: string;
  /** First and last hour shown: "7pm", "1am" */
  start: string;
  end: string;
  /** Every story from the night: who, when ("8:15pm"), where, and what it said */
  stories: { who: string; at: string; place: string; caption?: string }[];
  /** Hearts already given: story index and who */
  hearts: { story: number; who: string[] }[];
};

// @params
const P: Params = {
  title: "Saturday night",
  start: "7pm",
  end: "1am",
  stories: [
    { who: "Maya", at: "7:05pm", place: "Second Chapter", caption: "thrift haul before dinner" },
    { who: "Calvin", at: "7:15pm", place: "412 Pine", caption: "nap number three" },
    { who: "Tsai Lin", at: "7:20pm", place: "Second Chapter", caption: "found a jacket for will" },
    { who: "Arun", at: "7:35pm", place: "412 Pine", caption: "rice cooker pregame" },
    { who: "Will", at: "7:45pm", place: "412 Pine", caption: "25 min shower. worth it" },
    { who: "Aditya", at: "7:50pm", place: "412 Pine" },
    { who: "Tsai Lin", at: "8:10pm", place: "Golden Lantern" },
    { who: "Maya", at: "8:20pm", place: "Golden Lantern", caption: "dumplings for six" },
    { who: "Will", at: "8:25pm", place: "Golden Lantern", caption: "ordered for the table, no regrets" },
    { who: "Aditya", at: "8:30pm", place: "Golden Lantern" },
    { who: "Calvin", at: "8:40pm", place: "Golden Lantern", caption: "soup dumpling down" },
    { who: "Arun", at: "8:45pm", place: "Golden Lantern", caption: "theirs is better than the rice cooker. barely" },
    { who: "Calvin", at: "9:55pm", place: "412 Pine", caption: "alarms set for 9, 9:05 and 9:10" },
    { who: "Arun", at: "10:15pm", place: "412 Pine", caption: "rice cooker nightcap" },
    { who: "Tsai Lin", at: "10:35pm", place: "The Anchor", caption: "aux secured" },
    { who: "Maya", at: "10:40pm", place: "The Anchor" },
    { who: "Will", at: "10:50pm", place: "The Anchor", caption: "tsai lin vetoed my song" },
    { who: "Aditya", at: "11:10pm", place: "The Anchor", caption: "lowkey best night of the semester" },
    { who: "Tsai Lin", at: "12:05am", place: "Home" },
    { who: "Will", at: "12:30am", place: "Rook's Pizza", caption: "late slice" },
    { who: "Maya", at: "12:35am", place: "Rook's Pizza" },
    { who: "Aditya", at: "12:40am", place: "Rook's Pizza" },
  ],
  hearts: [
    { story: 7, who: ["Arun", "Will", "Tsai Lin"] },
    { story: 14, who: ["Maya", "Aditya"] },
  ],
};
// @end params

type Story = { id: string; who: string; name: string; at: number; place: string; caption: string };
type State = { title: string; start: number; end: number; stories: Story[]; hearts: Record<string, string[]> };
type Action = { t: "heart"; id: string };
type Local = { sel: string; bursts: number };

const PANEL = 556;
const STR_TOP = 100;
const STR_H = 252;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const findMember = (ctx: Ctx, name: string): Member | undefined => {
  const k = name.trim().toLowerCase();
  return k ? ctx.members.find((m) => m.id === name || m.name.trim().toLowerCase() === k) : undefined;
};
/** "8:15pm" -> minutes after noon; small-hours times count past midnight. */
function minutesOf(v: unknown): number {
  const m = clean(v, 10).toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!m) return -1;
  let h = Number(m[1]) % 12;
  const min = Math.min(59, Number(m[2] ?? 0));
  if (m[3] === "pm") h += 12;
  else if (h < 9) h += 24;
  return (h - 12) * 60 + min;
}
const clock = (mins: number) => {
  const h24 = Math.floor(mins / 60) + 12;
  const h = h24 % 12 || 12;
  const m = mins % 60;
  return `${h}${m ? `:${String(m).padStart(2, "0")}` : ""}${h24 % 24 >= 12 ? "pm" : "am"}`;
};

function initState(ctx: Ctx): State {
  let start = minutesOf(P.start);
  let end = minutesOf(P.end);
  const stories: Story[] = [];
  (Array.isArray(P.stories) ? P.stories : []).forEach((s, i) => {
    if (stories.length >= 40) return;
    const name = clean(s?.who, 20);
    const at = minutesOf(s?.at);
    const place = clean(s?.place, 22);
    if (!name || at < 0 || !place) return;
    const m = findMember(ctx, name);
    stories.push({ id: `s${i}`, who: m ? m.id : `o:${name}`, name: m ? m.name : name, at, place, caption: clean(s.caption, 60) });
  });
  stories.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  if (start < 0) start = stories.length ? Math.floor(stories[0]!.at / 60) * 60 : 420;
  if (end <= start) end = Math.max(start + 120, stories.length ? Math.ceil((stories[stories.length - 1]!.at + 1) / 60) * 60 : start + 360);
  const hearts: Record<string, string[]> = {};
  for (const h of Array.isArray(P.hearts) ? P.hearts : []) {
    const id = `s${h?.story}`;
    if (!stories.some((s) => s.id === id)) continue;
    const who = (Array.isArray(h.who) ? h.who : []).map((n) => findMember(ctx, clean(n, 20))?.id).filter((x): x is string => !!x);
    const list = [...new Set(who)];
    if (list.length) hearts[id] = list;
  }
  return { title: clean(P.title, 28) || "Last night", start, end, stories, hearts };
}

// ---- Strands -----------------------------------------------------------------------------------

type Layout = {
  people: { id: string; name: string }[];
  lanes: Map<string, number>;
  x: (mins: number) => number;
  y: (person: number, mins: number) => number;
  together: { place: string; from: number; to: number; who: string[] }[];
};
function layoutOf(s: State, w: number, h: number): Layout {
  const people: { id: string; name: string }[] = [];
  for (const st of s.stories) if (!people.some((p) => p.id === st.who)) people.push({ id: st.who, name: st.name });
  const places: string[] = [];
  for (const st of s.stories) if (!places.includes(st.place)) places.push(st.place);
  const lanes = new Map<string, number>();
  const top = 24;
  const bottom = h - 30;
  places.forEach((pl, i) => lanes.set(pl, places.length === 1 ? (top + bottom) / 2 : top + ((bottom - top) * i) / (places.length - 1)));
  const x = (mins: number) => 14 + ((w - 28) * (mins - s.start)) / Math.max(1, s.end - s.start);
  const mine = people.map((p) => s.stories.filter((st) => st.who === p.id));
  const placeAt = (pi: number, mins: number) => {
    const list = mine[pi]!;
    let cur = list[0]?.place ?? "";
    for (const st of list) if (st.at <= mins) cur = st.place;
    return cur;
  };
  // Who is where, sampled every 5 minutes, for braids and the "together" labels.
  const together: Layout["together"] = [];
  for (let t = s.start; t <= s.end; t += 5) {
    const at = new Map<string, string[]>();
    people.forEach((p, i) => {
      const pl = placeAt(i, t);
      at.set(pl, [...(at.get(pl) ?? []), p.id]);
    });
    for (const [pl, who] of at) {
      if (who.length < 2) continue;
      const last = together.find((g) => g.place === pl && g.to === t - 5 && g.who.join() === who.join());
      if (last) last.to = t;
      else together.push({ place: pl, from: t, to: t, who });
    }
  }
  const y = (pi: number, mins: number) => {
    // Ease between places over the 20 minutes before a move.
    const list = mine[pi]!;
    let yy = lanes.get(placeAt(pi, mins)) ?? top;
    const next = list.find((st) => st.at > mins);
    if (next && next.at - mins < 30) {
      const k = 1 - (next.at - mins) / 30;
      const e = k * k * (3 - 2 * k);
      yy = yy + ((lanes.get(next.place) ?? yy) - yy) * e;
    }
    const pl = placeAt(pi, mins);
    const here = people.filter((_, j) => placeAt(j, mins) === pl);
    if (here.length > 1) {
      const k = here.findIndex((p) => p.id === people[pi]!.id);
      yy += 6 * Math.sin(mins / 9 + (k * Math.PI * 2) / here.length);
    }
    return yy;
  };
  return { people, lanes, x, y, together };
}

function drawStrands(g: CanvasRenderingContext2D, f: DrawFrame, s: State, L: Layout, sel: string, theme: Theme): boolean {
  const p = pal(theme);
  const w = f.width;
  const h = f.height;
  const sky = g.createLinearGradient(0, 0, w, 0);
  sky.addColorStop(0, mix(p.purple, p.dark, 0.45));
  sky.addColorStop(1, mix(p.dark, p.blue, 0.1));
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  // Hour ticks.
  g.strokeStyle = mix(p.on, p.dark, 0.7);
  g.lineWidth = 1;
  g.beginPath();
  for (let t = Math.ceil(s.start / 60) * 60; t <= s.end; t += 60) {
    g.moveTo(L.x(t), 10);
    g.lineTo(L.x(t), h - 22);
  }
  g.stroke();
  // Glow where people were together.
  g.fillStyle = p.yellow;
  g.globalAlpha = 0.1;
  g.beginPath();
  for (const t of L.together) {
    const y = L.lanes.get(t.place)!;
    g.roundRect(L.x(t.from) - 6, y - 16, L.x(t.to) - L.x(t.from) + 12, 32, 16);
  }
  g.fill();
  g.globalAlpha = 1;
  const selStory = s.stories.find((x) => x.id === sel);
  L.people.forEach((person, pi) => {
    const col = userColor(person.id, theme);
    const first = s.stories.find((x) => x.who === person.id)!;
    const hot = selStory?.who === person.id;
    g.strokeStyle = col;
    g.lineWidth = hot ? 4 : 2.5;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.globalAlpha = !selStory || hot ? 1 : 0.55;
    g.beginPath();
    for (let t = Math.max(s.start, first.at - 30), k = 0; t <= s.end; t += 3, k++) {
      const x = L.x(t);
      const y = L.y(pi, t);
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.globalAlpha = 1;
  });
  // Beads: one per story, a ring for the selected one.
  for (const st of s.stories) {
    const pi = L.people.findIndex((x) => x.id === st.who);
    const x = L.x(st.at);
    const y = L.y(pi, st.at);
    g.fillStyle = p.on;
    g.beginPath();
    g.arc(x, y, st.id === sel ? 9 : 6.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = userColor(st.who, theme);
    g.beginPath();
    g.arc(x, y, st.id === sel ? 6.5 : 4.5, 0, Math.PI * 2);
    g.fill();
    if ((s.hearts[st.id]?.length ?? 0) > 0) {
      g.fillStyle = p.red;
      g.beginPath();
      const hx = x + 6;
      const hy = y - 9;
      g.moveTo(hx, hy + 3);
      g.bezierCurveTo(hx - 5, hy - 1, hx - 3, hy - 5, hx, hy - 2.5);
      g.bezierCurveTo(hx + 3, hy - 5, hx + 5, hy - 1, hx, hy + 3);
      g.fill();
    }
  }
  return false;
}

export default defineApp<State, Action, Local>({
  name: "Night strands",
  summary: (s) => {
    const L = layoutOf(s, 360, STR_H);
    const hearts = Object.values(s.hearts).reduce((n, h) => n + h.length, 0);
    return `${s.title}: ${s.stories.length} stories from ${L.people.length} friends · together ${L.together.length} times · ${hearts} hearts`;
  },

  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (a.t !== "heart" || !inChat(ctx, meta.user) || typeof a.id !== "string" || !s.stories.some((x) => x.id === a.id)) return s;
    const was = s.hearts[a.id] ?? [];
    const now = was.includes(meta.user) ? was.filter((u) => u !== meta.user) : [...was, meta.user];
    const hearts = { ...s.hearts };
    if (now.length) hearts[a.id] = now;
    else delete hearts[a.id];
    return { ...s, hearts };
  },

  onMembers: (s, ctx) => {
    if (Object.values(s.hearts).every((h) => h.every((u) => inChat(ctx, u)))) return s;
    const hearts: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(s.hearts)) {
      const keep = v.filter((u) => inChat(ctx, u));
      if (keep.length) hearts[k] = keep;
    }
    return { ...s, hearts };
  },

  invariants: {
    "hearts are on real stories": (s) => Object.keys(s.hearts).every((id) => s.stories.some((x) => x.id === id)),
    "a heart once per person, no empty lists": (s) => Object.values(s.hearts).every((h) => h.length > 0 && new Set(h).size === h.length),
    "hearts come from the chat": (s, ctx) => Object.values(s.hearts).every((h) => h.every((u) => inChat(ctx, u))),
    "stories run in time order inside the night": (s) => s.stories.every((x, i) => x.at >= 0 && (i === 0 || s.stories[i - 1]!.at <= x.at)) && s.start < s.end,
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
    "a heart toggles only me on that story": (p, n, a, m) => {
      if (a.t !== "heart" || p === n) return true;
      const was = p.hearts[a.id] ?? [];
      const now = n.hearts[a.id] ?? [];
      if (was.includes(m.user) === now.includes(m.user)) return false;
      if (was.filter((u) => u !== m.user).join() !== now.filter((u) => u !== m.user).join()) return false;
      if (!was.includes(m.user) && now[now.length - 1] !== m.user) return false;
      const ids = new Set([...Object.keys(p.hearts), ...Object.keys(n.hearts)]);
      for (const id of ids) if (id !== a.id && p.hearts[id] !== n.hearts[id]) return false;
      return (now.length > 0) === a.id in n.hearts;
    },
    "the night never changes": (p, n) => p.stories === n.stories && p.start === n.start && p.end === n.end,
  },

  arbitrary: (s, _u, r) => ({ t: "heart", id: s.stories.length ? r.pick(s.stories).id : "s0" }),

  local: { sel: "", bursts: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const SW = W - 24;
    const L = layoutOf(state, SW, STR_H);
    const mem = (id: string, name = "?"): Member => members.find((m) => m.id === id) ?? { id, name };
    const loved = [...state.stories].filter((x) => x.caption).sort((a, b) => (state.hearts[b.id]?.length ?? 0) - (state.hearts[a.id]?.length ?? 0))[0];
    const fallback = loved ?? state.stories[state.stories.length - 1];
    const sel = state.stories.find((x) => x.id === local.sel) ?? fallback;
    const hearts = sel ? state.hearts[sel.id] ?? [] : [];
    const iHeart = hearts.includes(me);
    const withWho = sel
      ? L.people.filter((pp) => {
          if (pp.id === sel.who) return false;
          const mine = state.stories.filter((x) => x.who === pp.id);
          const cur = [...mine].reverse().find((x) => x.at <= sel.at + 30) ?? mine[0];
          return cur?.place === sel.place;
        })
      : [];
    const byPlace = new Map<string, { place: string; from: number; size: number }>();
    for (const t of L.together) {
      const o = byPlace.get(t.place);
      byPlace.set(t.place, { place: t.place, from: Math.min(o?.from ?? t.from, t.from), size: Math.max(o?.size ?? 0, t.who.length) });
    }
    const labels = [...byPlace.values()].sort((a, b) => b.size - a.size || a.from - b.from).slice(0, 4);
    const placesTogether = new Set(L.together.map((t) => t.place)).size;

    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (e.type !== "up") return;
      let best: Story | null = null;
      let bd = 22;
      for (const st of state.stories) {
        const pi = L.people.findIndex((x) => x.id === st.who);
        const d = Math.hypot(L.x(st.at) - e.x, L.y(pi, st.at) - e.y);
        if (d < bd) {
          bd = d;
          best = st;
        }
      }
      if (best) {
        haptic("light");
        setLocal({ sel: best.id });
      }
    };

    const hours: number[] = [];
    for (let t = Math.ceil(state.start / 60) * 60; t <= state.end; t += 60) hours.push(t);

    return (
      <div>
        <style>{"@keyframes nsIn{from{transform:translateY(6px)}to{transform:none}}"}</style>
        <div style={{ position: "relative", height: PANEL, borderRadius: 12, overflow: "hidden", background: mix(p.purple, p.dark, 0.7), color: p.on }}>
          <div aria-hidden="true" style={{ position: "absolute", left: 8, right: 8, top: 8, height: 3, borderRadius: 2, background: mix(p.on, p.dark, 0.55) }}>
            <div style={{ width: "70%", height: 3, borderRadius: 2, background: p.on }} />
          </div>
          <div style={{ position: "absolute", left: 11, right: 12, top: 18, height: 32, display: "flex", alignItems: "center", gap: 8, pointerEvents: "none" }}>
            <span style={{ width: 32, height: 32, flex: "none", borderRadius: 16, background: p.on, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" fill="none" stroke={c.primary} stroke-width="4">
                <circle cx="11" cy="11" r="8" />
              </svg>
            </span>
            <span style={{ fontSize: 15, fontWeight: 700, color: p.on, flex: "none" }}>Muse</span>
            <span style={{ fontSize: 15, color: p.on, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`from ${state.stories.length} stories`}</span>
          </div>
          <div style={{ position: "absolute", left: 16, right: 16, top: 54, pointerEvents: "none" }}>
            <div style={{ fontSize: 24, fontWeight: 800, lineHeight: "30px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{state.title}</div>
            <div style={{ fontSize: 13, lineHeight: "16px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{`${L.people.length} friends · together at ${placesTogether} ${placesTogether === 1 ? "place" : "places"}`}</div>
          </div>

          <div style={{ position: "absolute", left: 12, top: STR_TOP, width: SW, height: STR_H, borderRadius: 14, overflow: "hidden" }}>
            <Canvas height={STR_H} label={`${state.stories.length} stories on ${L.people.length} strands from ${clock(state.start)} to ${clock(state.end)}`} draw={(g, f) => drawStrands(g, f, state, L, sel?.id ?? "", theme)} onPointer={onPointer} />
            {labels.map((t) => {
              const y = L.lanes.get(t.place)!;
              const fit = fitText(`${t.place} · ${clock(t.from)}`, 150, { size: 11, weight: 700, min: 9 });
              const lw = Math.min(162, textWidth(fit.text, fit.size, 700) + 14);
              const x = Math.min(SW - lw - 4, Math.max(4, L.x(t.from) - 4));
              return (
                <span key={t.place} style={{ position: "absolute", left: x, top: y - 22, padding: "0 6px", borderRadius: 8, background: c.card, color: c.text, fontSize: fit.size, fontWeight: 700, lineHeight: "15px", whiteSpace: "nowrap", pointerEvents: "none" }}>
                  {fit.text}
                </span>
              );
            })}
            {hours.map((t) => (
              <span key={t} style={{ position: "absolute", left: Math.min(SW - 30, Math.max(0, L.x(t) - 15)), width: 30, top: STR_H - 18, textAlign: "center", fontSize: 11, lineHeight: "14px", color: p.on, pointerEvents: "none" }}>
                {clock(t).replace(":00", "")}
              </span>
            ))}
          </div>

          {sel ? (
            <div key={sel.id} style={{ position: "absolute", left: 12, right: 12, top: STR_TOP + STR_H + 12, height: 178, borderRadius: 16, background: c.card, color: c.text, padding: 12, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 10, animation: "nsIn 250ms ease-out both" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ position: "relative", flex: "none", width: 72, height: 72, borderRadius: 12, overflow: "hidden", background: c.wash, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Thumb kind={thumbKind(sel.place)} seed={sel.place} size={72} label="" />
                  <span style={{ position: "absolute", left: 4, bottom: 4, display: "flex", borderRadius: 12, boxShadow: `0 0 0 2px ${c.card}` }}>
                    <Avatar user={mem(sel.who, sel.name)} size={22} />
                  </span>
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{`${sel.name} · ${clock(sel.at)} · ${sel.place}`}</div>
                  <div style={{ fontSize: 17, lineHeight: "22px", fontWeight: 700, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{sel.caption ? `"${sel.caption}"` : `${sel.name} posted from ${sel.place}`}</div>
                  {withWho.length ? (
                    <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: c.secondaryText }}>
                      <Facepile users={withWho.map((x) => mem(x.id, x.name)).slice(0, 4)} max={4} size={18} />
                      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{`with ${withWho.length} ${withWho.length === 1 ? "friend" : "friends"}`}</span>
                    </div>
                  ) : (
                    <div style={{ marginTop: 6, fontSize: 13, color: c.secondaryText }}>on their own here</div>
                  )}
                </div>
              </div>
              <div style={{ marginTop: "auto", height: 44, display: "flex", alignItems: "center", gap: 8 }}>
                {hearts.length ? <Facepile users={hearts.map((u) => mem(u)).slice(0, 3)} max={3} size={22} /> : null}
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {hearts.length ? `${hearts.length} ${hearts.length === 1 ? "heart" : "hearts"}` : "Tap any bead to open its moment"}
                </span>
                <Button
                  kind={iHeart ? "secondary" : "primary"}
                  onClick={() => {
                    haptic(iHeart ? "light" : "success");
                    dispatch({ t: "heart", id: sel.id });
                    if (!iHeart) setLocal({ sel: sel.id, bursts: local.bursts + 1 });
                  }}
                >
                  {iHeart ? "Hearted" : "Heart it"}
                </Button>
              </div>
              {iHeart && local.bursts > 0 ? (
                <div style={{ position: "absolute", right: 60, bottom: 30, pointerEvents: "none" }}>
                  <Burst key={local.bursts} emoji="❤️" />
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ position: "absolute", left: 12, right: 12, top: STR_TOP + STR_H + 12, borderRadius: 16, background: c.card, color: c.text, padding: 16, fontSize: 15, lineHeight: "20px" }}>
              Nobody has posted from tonight yet. Each story you post becomes a bead on your strand.
            </div>
          )}
        </div>
      </div>
    );
  },
});
