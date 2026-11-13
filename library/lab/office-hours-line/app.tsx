import { defineApp, Avatar, Button, CardHeader, Facepile, More, Toast, haptic, innerWidth, mix, pal, running, tween, userColor, type Ctx, type Member } from "@muse/app";

// Office hours line: the hallway outside the professor's door with the line drawn as little
// students with backpacks, each with what they came to ask. Join and you walk in at the back
// with your wait; when someone comes out, the door swings, everyone shuffles a spot forward, and
// when it's your turn the door opens on you.

type Params = {
  /** Card title */
  title: string;
  /** Course or group, e.g. 'CS 201 · Fall' */
  course: string;
  /** Who holds office hours: 'Prof. Okafor' */
  prof: string;
  /** Room and hours, as said: 'Larkin 214 · 3 to 5' */
  where: string;
  /** Minutes per person, for the wait estimate */
  minutes: number;
  /** What people come to ask, as chips to pick from */
  topics: string[];
  /** The line now, front first (the first is inside the office). said: what they're asking, in their words */
  line: { name: string; said?: string }[];
};

// @params
const P: Params = {
  title: "Office hours line",
  course: "CS 201 · Fall",
  prof: "Prof. Okafor",
  where: "Larkin 214 · 3 to 5",
  minutes: 7,
  topics: ["Part 2 segfault", "Big-O question", "Project spec", "Regrade"],
  line: [
    { name: "Priya", said: "regrade on hw3" },
    { name: "Diego" },
    { name: "Arun", said: "is a rice cooker an embedded system" },
    { name: "Sam" },
    { name: "Calvin", said: "woke up at alarm 7. part 2 segfaults" },
    { name: "Lena" },
  ],
};
// @end params

type Spot = { who: string; name: string; said: string; at: number };
type State = { title: string; course: string; prof: string; where: string; minutes: number; topics: string[]; line: Spot[]; nextAt: number; served: number };
type Action = { t: "join"; topic: number } | { t: "leave" } | { t: "next" };
type Local = { topic: number };

const MAX = 30;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const posIn = (s: State, u: string) => s.line.findIndex((x) => x.who === u);
const swing = tween({ duration: 900, easing: "decelerate" });

function initState(ctx: Ctx): State {
  const line: Spot[] = [];
  for (const x of Array.isArray(P.line) ? P.line : []) {
    const name = clean(x?.name, 20);
    if (!name || line.length >= MAX) continue;
    const m = ctx.members.find((y) => y.id === name || y.name.toLowerCase() === name.toLowerCase());
    const who = m ? m.id : `o:${name}`;
    if (line.some((y) => y.who === who)) continue;
    line.push({ who, name: m ? m.name : name, said: clean(x.said, 50), at: 0 });
  }
  const topics = (Array.isArray(P.topics) ? P.topics : []).map((t) => clean(t, 24)).filter(Boolean).slice(0, 4);
  return {
    title: clean(P.title, 40) || "Office hours", course: clean(P.course, 30), prof: clean(P.prof, 24) || "Office hours", where: clean(P.where, 30),
    minutes: isInt(P.minutes, 1, 60) ? P.minutes : 8, topics: topics.length ? topics : ["A question"], line, nextAt: 0, served: 0,
  };
}

export default defineApp<State, Action, Local>({
  name: "Office hours line",
  summary: (s) => (s.line.length ? `${s.prof}: ${s.line.length} in line · about ${Math.max(0, s.line.length - 1) * s.minutes} min wait` : `${s.prof}: no line right now`),

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const u = m.user;
    if (a.t === "join") {
      if (posIn(s, u) >= 0 || s.line.length >= MAX || !isInt(a.topic, 0, s.topics.length - 1)) return s;
      const name = ctx.members.find((x) => x.id === u)?.name ?? "Someone";
      return { ...s, line: [...s.line, { who: u, name, said: s.topics[a.topic]!, at: m.time }] };
    }
    if (a.t === "leave") {
      const k = posIn(s, u);
      if (k < 0) return s;
      return { ...s, line: s.line.filter((x) => x.who !== u) };
    }
    if (a.t === "next") {
      if (!s.line.length) return s;
      return { ...s, line: s.line.slice(1), nextAt: m.time, served: s.served + 1 };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const gone = (x: Spot) => !x.who.startsWith("o:") && !inChat(ctx, x.who);
    return s.line.some(gone) ? { ...s, line: s.line.filter((x) => !gone(x)) } : s;
  },

  invariants: {
    "one spot per person": (s) => new Set(s.line.map((x) => x.who)).size === s.line.length,
    "line stays short enough to draw": (s) => s.line.length <= MAX,
    "people in line are in the chat or outside it": (s, ctx) => s.line.every((x) => x.who.startsWith("o:") || inChat(ctx, x.who)),
    "served never goes negative": (s) => Number.isInteger(s.served) && s.served >= 0,
  },

  transitions: {
    "only chat members change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "joining puts the actor at the back with their topic": (p, n, a, m) => {
      if (a.t !== "join" || p === n) return true;
      const last = n.line[n.line.length - 1];
      return n.line.length === p.line.length + 1 && !!last && last.who === m.user && last.at === m.time && last.said === p.topics[a.topic] && p.line.every((x, i) => x === n.line[i]);
    },
    "a free person can always join": (p, n, a, m, ctx) => a.t !== "join" || p !== n || !(inChat(ctx, m.user) && posIn(p, m.user) < 0 && p.line.length < MAX && isInt(a.topic, 0, p.topics.length - 1)),
    "leaving removes only the actor and keeps the order": (p, n, a, m) => {
      if (a.t !== "leave" || p === n) return true;
      return posIn(p, m.user) >= 0 && posIn(n, m.user) < 0 && n.line.length === p.line.length - 1 && JSON.stringify(p.line.filter((x) => x.who !== m.user)) === JSON.stringify(n.line);
    },
    "next moves everyone up one": (p, n, a, m, ctx) => {
      if (a.t !== "next") return n.served === p.served;
      const ok = inChat(ctx, m.user) && p.line.length > 0;
      if (p === n) return !ok;
      return ok && n.line.length === p.line.length - 1 && n.line.every((x, i) => x === p.line[i + 1]) && n.served === p.served + 1 && n.nextAt === m.time;
    },
  },

  arbitrary: (s, u, r) => {
    const k = r.next();
    if (posIn(s, u) < 0) return k < 0.7 ? { t: "join", topic: r.int(s.topics.length) } : { t: "next" };
    return k < 0.35 ? { t: "leave" } : k < 0.8 ? { t: "next" } : { t: "join", topic: 0 };
  },

  local: { topic: 0 },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = Math.min(innerWidth(), theme.width - 24);
    const H = 200;
    const floor = H - 30;
    const doorW = 58;
    const doorX = W - doorW - 14;
    const line = state.line;
    const mine = posIn(state, me);
    const myTurn = mine === 0;
    const gap = W < 340 ? 34 : 40;
    const fit = Math.max(1, Math.floor((doorX - 18) / gap));
    const shownN = Math.min(line.length - 1, fit);
    const extra = Math.max(0, line.length - 1 - shownN);
    const face = (x: Spot): string | Member => (x.who.startsWith("o:") ? { id: x.who, name: x.name } : x.who);
    const first = (x: Spot) => (x.who === me ? "You" : x.name.split(" ")[0]!);
    const nE = confirmed.nextAt > 0 ? running(confirmed.nextAt, 900) : null;
    const open = myTurn ? 1 : nE === null ? 0 : Math.sin(swing(nE) * Math.PI);
    const wall = mix(p.wall, c.card, 0.2);

    // Hallway: wall, floor tiles, a notice board, the door (swinging), the room light.
    const doorSkew = open * (doorW - 10);
    const scene = (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${line.length} in line at ${state.prof}'s door`} style={{ display: "block" }}>
        <rect x={0} y={0} width={W} height={H} rx={12} fill={wall} />
        <rect x={0} y={floor} width={W} height={H - floor} fill={mix(p.shade, wall, 0.3)} />
        {Array.from({ length: Math.ceil(W / 34) }, (_v, j) => (
          <line key={`f${j}`} x1={j * 34} y1={floor} x2={j * 34 - 14} y2={H} stroke={mix(p.shade, c.text, 0.12)} stroke-width={1} />
        ))}
        <rect x={0} y={floor - 4} width={W} height={4} fill={mix(p.brown, wall, 0.3)} />
        <rect x={16} y={18} width={74} height={46} rx={3} fill={mix(p.crust, wall, 0.2)} />
        <rect x={22} y={24} width={22} height={16} fill={p.cream} transform="rotate(-4 33 32)" />
        <rect x={50} y={26} width={30} height={20} fill={p.sky} transform="rotate(3 65 36)" />
        <rect x={28} y={44} width={24} height={14} fill={mix(p.yellow, p.cream, 0.5)} transform="rotate(2 40 51)" />
        {/* room light behind the door */}
        <rect x={doorX} y={floor - 116} width={doorW} height={116} fill={mix(p.yellow, p.cream, 0.4)} />
        {open > 0 ? <path d={`M${doorX} ${floor} L${doorX - 30 * open} ${H} L${doorX + doorW + 20 * open} ${H} L${doorX + doorW} ${floor} Z`} fill={p.yellow} opacity={0.35 * open} /> : null}
        <rect x={doorX - 5} y={floor - 122} width={doorW + 10} height={122} fill="none" stroke={p.brown} stroke-width={5} />
        <path d={`M${doorX + doorW} ${floor - 116} L${doorX + doorW - (doorW - doorSkew)} ${floor - 116 - open * 8} L${doorX + doorW - (doorW - doorSkew)} ${floor + open * 8} L${doorX + doorW} ${floor} Z`}
          fill={mix(p.brown, p.crust, 0.4)} stroke={p.brown} stroke-width={1.5} />
        {open < 0.8 ? <rect x={doorX + doorSkew + 12} y={floor - 100} width={Math.max(0, doorW - doorSkew - 24)} height={30} rx={2} fill={mix(p.yellow, p.cream, 0.55)} /> : null}
        {open < 0.8 ? <circle cx={doorX + doorSkew + 8 + (doorW - doorSkew) * 0.1} cy={floor - 56} r={3} fill={p.yellow} /> : null}
        <rect x={doorX - 4} y={floor - 146} width={doorW + 8} height={18} rx={3} fill={p.dark} />
      </svg>
    );

    // People: the one inside shows as a silhouette in the door window; the rest stand in the hall.
    const inside = line[0];
    const people = line.slice(1, 1 + shownN).map((x, k) => {
      const cx = doorX - 26 - k * gap;
      const col = userColor(x.who.startsWith("o:") ? x.who : x.who, theme);
      const j = x.at > 0 ? running(x.at, 700) : null;
      const walkIn = j === null ? 0 : 1 - swing(j);
      return (
        <div key={x.who} class="oh-bob" style={{ position: "absolute", left: cx - 16 - walkIn * 80, top: floor - 74, width: 32, height: 74, transition: "left 600ms ease", animationDelay: `${(k % 4) * 180}ms`, pointerEvents: "none" }}>
          <svg width={32} height={74} viewBox="0 0 32 74" aria-hidden="true" style={{ position: "absolute", left: 0, top: 0 }}>
            <path d="M12 52 L11 72 M20 52 L21 72" stroke={p.dark} stroke-width={4} stroke-linecap="round" />
            <rect x={6} y={24} width={20} height={30} rx={8} fill={col} />
            <rect x={-1} y={28} width={10} height={18} rx={4} fill={mix(col, p.dark, 0.45)} />
            <path d="M24 30 L28 46" stroke={col} stroke-width={4} stroke-linecap="round" />
          </svg>
          <span style={{ position: "absolute", left: 3, top: 0, display: "flex", borderRadius: 99, boxShadow: x.who === me ? `0 0 0 2px ${c.primary}` : "none" }}>
            <Avatar user={face(x)} size={26} />
          </span>
        </div>
      );
    });

    // Bubbles for chat people with something to ask (at most two, alternating heights).
    const bubbles = line
      .slice(1, 1 + shownN)
      .map((x, k) => ({ x, k }))
      .filter(({ x }) => x.said && (!x.who.startsWith("o:") || x.who === me))
      .slice(-2)
      .map(({ x, k }, n) => {
        const cx = doorX - 26 - k * gap;
        const bw = Math.min(190, W * 0.52);
        const left = Math.max(4, Math.min(doorX - bw - 4, cx - bw / 2));
        return (
          <div key={`b${x.who}`} style={{ position: "absolute", left, top: 4 + n * 42, width: bw, pointerEvents: "none" }}>
            <div style={{ padding: "3px 8px", borderRadius: 10, background: c.card, color: c.text, fontSize: 12, lineHeight: "15px", boxShadow: `0 1px 0 ${mix(c.divider, c.text, 0.1)}`, overflowWrap: "break-word" }}>
              {`${first(x)}: ${x.said}`}
            </div>
            <span style={{ position: "absolute", left: Math.max(8, Math.min(bw - 14, cx - left - 5)), bottom: -4, width: 10, height: 10, background: c.card, transform: "rotate(45deg)" }} />
          </div>
        );
      });

    const plate = (
      <div style={{ position: "absolute", left: doorX - 4, top: floor - 146, width: doorW + 8, height: 18, borderRadius: 3, background: p.dark, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: p.cream, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: doorW + 4 }}>{state.prof.replace(/^Prof\.?\s*/i, "")}</span>
      </div>
    );
    const insideFace = inside ? (
      <span style={{ position: "absolute", left: doorX + doorW / 2 - (myTurn ? 15 : 11) + (myTurn ? 0 : doorW * 0.12), top: myTurn ? floor - 70 : floor - 98, display: "flex", borderRadius: 99, opacity: myTurn ? 1 : 0.9, boxShadow: myTurn ? `0 0 0 3px ${c.primary}` : "none", pointerEvents: "none" }}>
        <Avatar user={face(inside)} size={myTurn ? 30 : 22} />
      </span>
    ) : null;
    const more = extra > 0 ? (
      <span style={{ position: "absolute", left: 6, top: floor - 40, display: "flex", pointerEvents: "none" }}><More n={extra} size={22} /></span>
    ) : null;

    const waitFor = (k: number) => Math.max(0, k) * state.minutes;
    let line1: string;
    let line2: string;
    let act;
    if (myTurn) {
      line1 = "Your turn · go on in";
      line2 = `${state.prof} is ready for you`;
      act = <Button kind="primary" onClick={() => { dispatch({ t: "next" }); haptic("success"); }}>I'm done</Button>;
    } else if (mine > 0) {
      line1 = `${mine === 1 ? "You're next" : `You're #${mine + 1}`} · ${waitFor(mine)} min`;
      line2 = inside ? `${first(inside)} is in with ${state.prof.replace(/^Prof\.?\s*/i, "Prof. ")}` : "";
      act = (
        <div style={{ display: "flex", gap: 6 }}>
          <Button kind="deemphasized" onClick={() => dispatch({ t: "leave" })}>Leave</Button>
          <Button kind="secondary" onClick={() => dispatch({ t: "next" })}>Door opened</Button>
        </div>
      );
    } else {
      line1 = line.length ? `${line.length} in line · about ${waitFor(line.length)} min` : "No line · walk right in";
      line2 = "";
      act = (
        <Button kind="primary" onClick={() => { dispatch({ t: "join", topic: Math.min(local.topic, state.topics.length - 1) }); haptic("light"); }}>Get in line</Button>
      );
    }
    const chips = mine < 0 ? (
      <div class="oh-chips" style={{ display: "flex", gap: 4, overflowX: "auto", overflowY: "hidden", marginTop: 2, scrollbarWidth: "none" }}>
        {state.topics.map((t, j) => {
          const on = Math.min(local.topic, state.topics.length - 1) === j;
          return (
            <button key={t} type="button" aria-pressed={on ? "true" : "false"} onClick={() => setLocal({ topic: j })}
              style={{ height: 44, margin: "-8px 0", padding: "8px 0", border: 0, background: "transparent", cursor: "pointer", flexShrink: 0 }}>
              <span style={{ display: "block", height: 28, lineHeight: "28px", padding: "0 10px", borderRadius: 99, fontSize: 13, fontWeight: on ? 700 : 500, background: on ? c.selected : c.secondaryButton, color: on ? c.text : c.secondaryButtonText, boxShadow: on ? `inset 0 0 0 1.5px ${c.primary}` : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t}</span>
            </button>
          );
        })}
      </div>
    ) : null;

    const chat = line.filter((x) => !x.who.startsWith("o:")).map((x) => x.who);
    const myAt = confirmed.line.find((x) => x.who === me)?.at ?? 0;
    const toast = myTurn && confirmed.nextAt > 0 && running(confirmed.nextAt, 2400) !== null ? confirmed.nextAt : myAt > 0 && running(myAt, 2400) !== null ? myAt : null;

    return (
      <div>
        <style>{".oh-bob{animation:ohBob 2.4s ease-in-out infinite}@keyframes ohBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}@media (prefers-reduced-motion:reduce){.oh-bob{animation:none}}"}</style>
        <CardHeader title={state.title} subtitle={[state.course, state.prof, state.where].filter(Boolean).join(" · ")} />
        <div style={{ height: 4 }} />
        <div style={{ position: "relative", height: H, overflow: "hidden", borderRadius: 12 }}>
          {scene}
          {plate}
          {insideFace}
          {people}
          {more}
          {bubbles}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, minHeight: 50, minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: "20px", color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line1}</div>
            {chips ?? (line2 ? <div style={{ fontSize: 13, lineHeight: "17px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line2}</div> : null)}
          </div>
          <div style={{ flexShrink: 0 }}>{act}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26, marginTop: 4, minWidth: 0 }}>
          {chat.length ? <Facepile users={chat} max={4} size={18} /> : null}
          <span style={{ fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {chat.length ? `${chat.length} from here in line${state.served ? ` · ${state.served} seen so far` : ""}` : state.served ? `${state.served} seen so far` : "Nobody from here in line yet"}
          </span>
        </div>
        {toast ? <Toast key={toast}>{myTurn ? `Your turn with ${state.prof}` : `You're in line · about ${waitFor(mine)} min`}</Toast> : null}
      </div>
    );
  },
});
