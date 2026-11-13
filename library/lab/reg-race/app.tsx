import { defineApp, Avatar, Button, Canvas, CardHeader, Toast, fitText, haptic, mix, pal, running, userColor, type Ctx, type DrawFrame } from "@muse/app";

// Reg race: registration opens at 7am in waves and everyone wants the same class. A running
// track with a lane per friend, each starting at their registration time (staggered like a real
// 400m start). The open seats stand along the finish as a column of chairs. Tap "Got it" and you
// sprint across the line and take a chair; miss it and you trip on the waitlist hurdle. Set a
// bell and Muse pings you five minutes before your wave.

type Params = {
  /** Card title */
  title: string;
  /** The class everyone wants: "PSYCH 110 · Prof. Lin" */
  course: string;
  /** Seats left right now */
  seats: number;
  /** Registration waves in order, as times: "7:00" */
  waves: string[];
  /** Friends: their wave (index), status 0 waiting, 1 got it, 2 waitlisted, and what they said */
  people: { who: string; wave: number; status?: number; said?: string }[];
};

// @params
const P: Params = {
  title: "Reg race",
  course: "PSYCH 110 · Prof. Lin",
  seats: 11,
  waves: ["7:00", "7:15", "7:30", "7:45"],
  people: [
    { who: "Maya", wave: 0, status: 1, said: "got it. had the CRN in my spreadsheet" },
    { who: "Tsai Lin", wave: 0, status: 1 },
    { who: "Will", wave: 1, status: 1, said: "registered from the sube in the lot" },
    { who: "Calvin", wave: 1, said: "all 7 alarms set for 7:14" },
    { who: "Arun", wave: 2, said: "rice cooker timer is my backup alarm" },
    { who: "Aditya", wave: 3 },
  ],
};
// @end params

type Runner = { who: string; name: string; wave: number; status: number; said: string; bell: boolean; at: number };
type State = { title: string; course: string; seats: number; taken: number; waves: string[]; people: Runner[] };
type Action = { t: "got" } | { t: "miss" } | { t: "bell" } | { t: "reset" };
type Local = { toast: number; msg: string };

const LANE = 27;
const TOP = 18;
const SPRINT = 1300;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const first = (n: string) => n.split(" ")[0] ?? n;
/** Five minutes before a wave, H:MM. */
const before = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return "";
  const v = (Number(m[1]) * 60 + Number(m[2]) - 5 + 1440) % 1440;
  const h = Math.floor(v / 60) % 12 || 12;
  return `${h}:${String(v % 60).padStart(2, "0")}`;
};
const canvasH = (n: number) => TOP + n * LANE + 8;

function initState(ctx: Ctx): State {
  const waves = (Array.isArray(P.waves) ? P.waves : []).map((w) => clean(w, 8)).filter(Boolean).slice(0, 6);
  if (!waves.length) waves.push("7:00");
  const seats = isInt(P.seats, 0, 999) ? P.seats : 10;
  const people: Runner[] = [];
  for (const x of Array.isArray(P.people) ? P.people : []) {
    const nm = clean(x?.who, 20);
    if (!nm || people.length >= 8) continue;
    const m = ctx.members.find((y) => y.id === nm || y.name.toLowerCase() === nm.toLowerCase());
    const who = m ? m.id : `~${nm}`;
    if (people.some((p) => p.who === who)) continue;
    people.push({ who, name: m ? clean(m.name, 20) || nm : nm, wave: isInt(x.wave, 0, waves.length - 1) ? x.wave : 0, status: isInt(x.status, 0, 2) ? x.status : 0, said: clean(x.said, 60), bell: false, at: 0 });
  }
  for (const m of ctx.members) {
    if (people.length >= 8 || people.some((p) => p.who === m.id)) continue;
    people.push({ who: m.id, name: clean(m.name, 20) || "Friend", wave: waves.length - 1, status: 0, said: "", bell: false, at: 0 });
  }
  people.sort((a, b) => a.wave - b.wave);
  return { title: clean(P.title, 40) || "Reg race", course: clean(P.course, 40), seats, taken: 0, waves, people };
}

function drawTrack(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string) {
  const t = f.theme;
  const c = t.color;
  const pl = pal(t);
  const dk = t.mode === "dark";
  const W = f.width;
  const H = canvasH(s.people.length);
  const n = s.people.length;
  const finish = W - 62;
  const x0 = 44;
  const span = finish - x0;
  const nw = Math.max(1, s.waves.length);
  const startX = (w: number) => x0 + (w / nw) * span * 0.62;
  let anim = false;

  // Infield and the track.
  g.beginPath();
  g.roundRect(0, 0, W, H, 14);
  g.fillStyle = dk ? mix(pl.grass, c.wash, 0.6) : pl.grass;
  g.fill();
  g.beginPath();
  g.roundRect(4, TOP - 4, finish + 22, n * LANE + 8, 8);
  g.fillStyle = dk ? mix(pl.red, c.wash, 0.45) : mix(mix(pl.red, pl.orange, 0.3), c.text, 0.25);
  g.fill();
  // Lane lines.
  g.strokeStyle = dk ? mix(c.text, c.wash, 0.35) : c.card;
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    g.moveTo(4, TOP + i * LANE);
    g.lineTo(finish + 26, TOP + i * LANE);
  }
  g.stroke();
  // Wave times along the top, with a tick down to each start line.
  g.font = `700 10px ${t.type.family}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let w = 0; w < nw; w++) {
    g.fillStyle = dk ? c.text : c.text;
    g.fillText(s.waves[w]!, startX(w), 8);
  }
  // Finish line: a checker strip.
  for (let y = TOP - 4, k = 0; y < TOP + n * LANE + 4; y += 5, k++) {
    g.fillStyle = k % 2 ? (dk ? c.wash : c.text) : c.card;
    g.fillRect(finish, y, 5, 5);
    g.fillStyle = k % 2 ? c.card : dk ? c.wash : c.text;
    g.fillRect(finish + 5, y, 5, 5);
  }

  // Each lane: a start block at the wave, a hurdle for the waitlist, the runner.
  s.people.forEach((p, i) => {
    const y = TOP + i * LANE + LANE / 2;
    const sx = startX(p.wave);
    g.fillStyle = dk ? mix(c.text, c.wash, 0.2) : c.card;
    g.fillRect(sx - 1, TOP + i * LANE + 3, 2, LANE - 6);
    // The lane's name, painted on the track like a lane number.
    const nm = fitText(p.who === me ? "You" : first(p.name), Math.max(30, sx - 30), { g, size: 11, min: 10, weight: 700 });
    g.font = nm.font;
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillStyle = dk ? c.text : c.card;
    g.fillText(nm.text, 12, y);
    if (p.status === 2) {
      const hx = x0 + span * 0.72;
      g.strokeStyle = dk ? c.text : c.card;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(hx - 6, y + 9);
      g.lineTo(hx - 6, y - 7);
      g.lineTo(hx + 6, y - 7);
      g.lineTo(hx + 6, y + 9);
      g.stroke();
    }
    if (p.bell && p.status === 0) {
      // A little bell by the lane's start.
      const bx = sx - 14;
      g.beginPath();
      g.moveTo(bx - 5, y + 4);
      g.quadraticCurveTo(bx - 5, y - 6, bx, y - 6);
      g.quadraticCurveTo(bx + 5, y - 6, bx + 5, y + 4);
      g.closePath();
      g.fillStyle = pl.yellow;
      g.fill();
      g.beginPath();
      g.arc(bx, y + 5.5, 1.8, 0, Math.PI * 2);
      g.fill();
    }
  });

  // Chairs along the side: every seat in the class, taken ones in their taker's color.
  const takers = s.people.filter((p) => p.status === 1);
  const total = s.seats + takers.length;
  const colX = finish + 30;
  const room = n * LANE + 4;
  const cols = total > 14 ? 2 : 1;
  const per = Math.ceil(total / cols);
  const ch = Math.min(12, room / Math.max(1, per));
  for (let k = 0; k < total; k++) {
    const col = Math.floor(k / per);
    const row = k % per;
    const cx = colX + col * 14;
    const cy = TOP + n * LANE - (row + 1) * ch + 1;
    const taker = k < takers.length ? takers[k] : undefined;
    const open = k >= takers.length;
    g.beginPath();
    g.roundRect(cx, cy, 10, ch - 2, 2);
    if (open) {
      g.fillStyle = dk ? mix(pl.blue, c.text, 0.25) : pl.blue;
      g.fill();
    } else {
      g.fillStyle = taker ? userColor(taker.who, t) : mix(c.secondaryText, c.card, 0.5);
      g.fill();
    }
  }
  g.font = `700 10px ${t.type.family}`;
  g.textAlign = "center";
  g.fillStyle = dk ? c.text : c.text;
  g.fillText(fitText(`${s.seats} left`, 56, { g, size: 10, min: 10, weight: 700 }).text, colX + (cols === 2 ? 12 : 5), 8);

  // Runners last, so they're on top of everything.
  s.people.forEach((p, i) => {
    const y = TOP + i * LANE + LANE / 2;
    const sx = startX(p.wave) + 12;
    const end = p.status === 1 ? finish + 18 : p.status === 2 ? x0 + span * 0.72 - 14 : sx;
    const run = p.at ? running(p.at, SPRINT) : null;
    let x = end;
    if (run !== null) {
      anim = true;
      const u = run / SPRINT;
      x = sx + (end - sx) * (1 - Math.pow(1 - u, 3));
    } else if (p.status === 0) {
      // Waiting runners bounce on their toes.
      x = sx + Math.sin(f.now / 220 + i) * 1.5;
      anim = true;
    }
    const col = userColor(p.who, t);
    g.beginPath();
    g.arc(x, y, 10, 0, Math.PI * 2);
    g.fillStyle = col;
    g.fill();
    g.lineWidth = p.who === me ? 2.5 : 1.5;
    g.strokeStyle = p.who === me ? c.primary : c.card;
    g.stroke();
    g.font = `700 10px ${t.type.family}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = c.onPrimary;
    g.fillText((p.name.trim()[0] ?? "?").toUpperCase(), x, y + 0.5);
    // Speed lines while sprinting.
    if (run !== null && p.status === 1) {
      g.strokeStyle = c.card;
      g.lineWidth = 1.5;
      g.beginPath();
      for (const dy of [-5, 0, 5]) {
        g.moveTo(x - 14, y + dy);
        g.lineTo(x - 24 - Math.abs(dy), y + dy);
      }
      g.stroke();
    }
  });
  return anim;
}

export default defineApp<State, Action, Local>({
  name: "Reg race",
  summary: (s) => {
    const got = s.people.filter((p) => p.status === 1).length;
    return `${s.course || s.title}: ${got} of ${s.people.length} got in · ${s.seats} ${s.seats === 1 ? "seat" : "seats"} left`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    const u = m.user;
    if (!inChat(ctx, u)) return s;
    const i = s.people.findIndex((p) => p.who === u);
    if (i < 0) return s;
    const p = s.people[i]!;
    const put = (x: Runner, extra: Partial<State> = {}) => ({ ...s, ...extra, people: s.people.map((y, k) => (k === i ? x : y)) });
    if (a.t === "got") {
      if (p.status === 1 || s.seats <= 0) return s;
      return put({ ...p, status: 1, bell: false, said: "", at: m.time }, { seats: s.seats - 1, taken: s.taken + 1 });
    }
    if (a.t === "miss") {
      if (p.status !== 0) return s;
      return put({ ...p, status: 2, bell: false, said: "", at: m.time });
    }
    if (a.t === "bell") {
      if (p.status !== 0) return s;
      return put({ ...p, bell: !p.bell });
    }
    if (a.t === "reset") {
      // Took the wrong section: give the seat back.
      if (p.status === 0) return s;
      const back = p.status === 1 && p.at > 0;
      return put({ ...p, status: 0, said: "", at: 0 }, back ? { seats: s.seats + 1, taken: s.taken - 1 } : {});
    }
    return s;
  },

  onMembers: (s, ctx) => {
    let people = s.people;
    for (const m of ctx.members) {
      if (people.length >= 8 || people.some((p) => p.who === m.id)) continue;
      people = [...people, { who: m.id, name: clean(m.name, 20) || "Friend", wave: s.waves.length - 1, status: 0, said: "", bell: false, at: 0 }];
    }
    return people === s.people ? s : { ...s, people };
  },

  invariants: {
    "one lane per person": (s) => new Set(s.people.map((p) => p.who)).size === s.people.length && s.people.length <= 8,
    "every seat is counted once": (s) => s.seats >= 0 && s.taken >= 0 && s.taken === s.people.filter((p) => p.status === 1 && p.at > 0).length,
    "lanes start at a real wave": (s) => s.people.every((p) => isInt(p.wave, 0, s.waves.length - 1) && isInt(p.status, 0, 2)),
    "only people still waiting get a bell": (s) => s.people.every((p) => !p.bell || p.status === 0),
  },

  transitions: {
    "getting in takes exactly one seat": (p, n, a, m) => a.t !== "got" || p === n || (n.seats === p.seats - 1 && n.people.find((x) => x.who === m.user)!.status === 1 && n.people.find((x) => x.who === m.user)!.at === m.time),
    "missing it puts you on the waitlist": (p, n, a, m) => a.t !== "miss" || p === n || (n.seats === p.seats && p.people.find((x) => x.who === m.user)!.status === 0 && n.people.find((x) => x.who === m.user)!.status === 2),
    "a bell flips only your bell": (p, n, a, m) => a.t !== "bell" || p === n || (n.seats === p.seats && n.people.every((x, k) => (x.who === m.user ? x.bell !== p.people[k]!.bell : JSON.stringify(x) === JSON.stringify(p.people[k])))),
    "giving a seat back frees it": (p, n, a, m) => {
      if (a.t !== "reset" || p === n) return true;
      const was = p.people.find((x) => x.who === m.user)!;
      return n.people.find((x) => x.who === m.user)!.status === 0 && n.seats === p.seats + (was.status === 1 && was.at > 0 ? 1 : 0);
    },
    "nobody else moves": (p, n, _a, m) => n.people.every((x) => x.who === m.user || JSON.stringify(x) === JSON.stringify(p.people.find((y) => y.who === x.who))),
    "only people in the chat race": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, u, r) => {
    const me = s.people.find((p) => p.who === u);
    const k = r.next();
    if (!me || me.status !== 0) return k < 0.6 ? { t: "reset" } : { t: "got" };
    if (k < 0.5) return { t: "got" };
    if (k < 0.75) return { t: "bell" };
    return { t: "miss" };
  },

  local: { toast: 0, msg: "" },

  view: ({ state: s, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const H = canvasH(s.people.length);
    const mine = s.people.find((p) => p.who === me);
    const got = s.people.filter((p) => p.status === 1);
    const latest = [...s.people].sort((a, b) => b.at - a.at)[0];
    const quote = s.people.filter((p) => p.said).at(-1);
    const label = `Race track: ${s.people.map((p) => `${p.name}, wave ${s.waves[p.wave]}, ${["waiting", "got in", "waitlisted"][p.status]}`).join("; ")}. ${s.seats} seats left`;
    const wave = mine ? s.waves[mine.wave]! : "";

    return (
      <div>
        <CardHeader title={s.title} subtitle={`${s.course}${s.course ? " · " : ""}${got.length} of ${s.people.length} in`} />
        <Canvas height={H} label={label} draw={(g, f) => drawTrack(g, f, s, me)} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36, marginTop: 4, minWidth: 0 }}>
          {latest && latest.at > 0 ? (
            <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>
              {`${latest.who === me ? "You" : first(latest.name)} ${latest.status === 1 ? "got in" : "got waitlisted"} · ${s.seats} ${s.seats === 1 ? "seat" : "seats"} left`}
            </span>
          ) : quote ? (
            <>
              <Avatar user={{ id: quote.who, name: quote.name }} size={20} />
              <b style={{ fontSize: 13, lineHeight: "16px", color: c.text, flexShrink: 0 }}>{first(quote.name)}</b>
              <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, minWidth: 0, ...ell }}>{`“${quote.said}”`}</span>
            </>
          ) : (
            <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>Tap Got it the moment you're in. Set a bell for your wave.</span>
          )}
        </div>
        {mine ? (
          mine.status === 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr 1fr", gap: 8, marginTop: 4 }}>
              <Button kind="secondary" wide onClick={() => { haptic("light"); setLocal({ toast: local.toast + 1, msg: mine.bell ? "Bell off" : `Muse will ping you at ${before(wave)}` }); dispatch({ t: "bell" }); }}>
                {mine.bell ? "Bell on" : "Remind me"}
              </Button>
              <Button kind="primary" wide disabled={s.seats <= 0} onClick={() => { haptic("success"); dispatch({ t: "got" }); }}>
                {s.seats > 0 ? "Got it" : "Class is full"}
              </Button>
              <Button kind="deemphasized" wide onClick={() => dispatch({ t: "miss" })}>
                Missed
              </Button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, minHeight: 44 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text, ...ell }}>{mine.status === 1 ? `You're in ${s.course.split(" · ")[0] || "the class"}` : "You're on the waitlist"}</span>
              <Button kind="deemphasized" onClick={() => dispatch({ t: "reset" })}>
                Undo
              </Button>
            </div>
          )
        ) : null}
        {local.toast > 0 ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
