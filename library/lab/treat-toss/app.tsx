import { defineApp, Avatar, CardHeader, Canvas, Toast, haptic, mix, pal, running, type Ctx, type DrawFrame, type Member, type Theme } from "@muse/app";

// Treat toss: someone posts their pet doing something. The pet sits on the right, mouth open; pull
// the treat back like a slingshot and let go. Where it lands comes from how hard and how high you
// threw, the same for everyone watching. Catches go on the board with your face.

type Kind = "dog" | "cat";
type Coat = "brown" | "cream" | "dark" | "orange" | "grey";
type Params = {
  /** Whose pet: "Maya" */
  author: string;
  /** The pet's name: "Biscuit" */
  pet: string;
  /** dog or cat */
  kind: Kind;
  /** Coat colour: brown, cream, dark, orange or grey */
  coat: Coat;
  /** The post line */
  line: string;
  /** Friends who already threw: tries, catches and a line */
  board: { who: string; tries: number; caught: number; said?: string }[];
};

// @params
const P: Params = {
  author: "Maya",
  pet: "Biscuit",
  kind: "dog",
  coat: "cream",
  line: "Biscuit learned to catch!! (sometimes)",
  board: [
    { who: "Will", tries: 6, caught: 4, said: "the Sube has treats in every door" },
    { who: "Calvin", tries: 7, caught: 1, said: "missed 6. alarm-level aim" },
    { who: "Arun", tries: 3, caught: 2, said: "treat made in the rice cooker" },
  ],
};
// @end params

type Tally = { who: string; name: string; tries: number; caught: number; said: string };
type Throw = { who: string; power: number; angle: number; caught: boolean; at: number };
type State = { author: string; authorName: string; pet: string; kind: Kind; coat: Coat; line: string; board: Tally[]; last: Throw | null };
type Action = { t: "toss"; power: number; angle: number };
type Local = { aim: boolean; dx: number; dy: number; toast: number };

const WORLD_W = 1000, WORLD_H = 520;
const LAUNCH = { x: 230, y: 330 };
const MOUTH = { x: 790, y: 250, r: 42 };
const GRAV = 0.9;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const okPower = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 10 && v <= 100;
const okAngle = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 5 && v <= 85;
const KINDS: Kind[] = ["dog", "cat"];
const COATS: Coat[] = ["brown", "cream", "dark", "orange", "grey"];

/** The treat's path in world units, one point per tick, until it lands, leaves or is caught. */
function flight(power: number, angle: number): { pts: { x: number; y: number }[]; caught: boolean } {
  const v = 8 + power * 0.34, a = (angle * Math.PI) / 180;
  let x = LAUNCH.x, y = LAUNCH.y, vx = v * Math.cos(a), vy = -v * Math.sin(a);
  const pts = [{ x, y }];
  for (let i = 0; i < 200; i++) {
    x += vx;
    vy += GRAV;
    y += vy;
    pts.push({ x, y });
    if ((x - MOUTH.x) ** 2 + (y - MOUTH.y) ** 2 <= MOUTH.r ** 2) return { pts, caught: true };
    if (y >= WORLD_H - 40) {
      // one small bounce on the floor, then rest
      const bx = x;
      for (let k = 1; k <= 8; k++) pts.push({ x: bx + vx * 0.3 * k, y: WORLD_H - 40 - Math.sin((k / 8) * Math.PI) * 30 });
      return { pts, caught: false };
    }
    if (x > WORLD_W + 40) return { pts, caught: false };
  }
  return { pts, caught: false };
}

function memberFor(ctx: Ctx, name: string): Member | undefined {
  const k = name.trim().toLowerCase();
  return ctx.members.find((m) => m.id === name || m.name.trim().toLowerCase() === k);
}

function initState(ctx: Ctx): State {
  const authorName = clean(P.author, 20) || "Someone";
  const author = memberFor(ctx, authorName)?.id ?? `name:${authorName}`;
  const board: Tally[] = [];
  for (const b of Array.isArray(P.board) ? P.board.slice(0, 10) : []) {
    const name = clean(b?.who, 20);
    if (!name) continue;
    const m = memberFor(ctx, name);
    const who = m?.id ?? `name:${name}`;
    if (board.some((x) => x.who === who)) continue;
    const tries = typeof b.tries === "number" ? Math.max(1, Math.min(99, Math.round(b.tries))) : 1;
    const caught = typeof b.caught === "number" ? Math.max(0, Math.min(tries, Math.round(b.caught))) : 0;
    board.push({ who, name: m?.name ?? name, tries, caught, said: clean(b.said, 40) });
  }
  return {
    author,
    authorName,
    pet: clean(P.pet, 16) || "the pet",
    kind: (KINDS as string[]).includes(P.kind) ? P.kind : "dog",
    coat: (COATS as string[]).includes(P.coat) ? P.coat : "brown",
    line: clean(P.line, 60),
    board,
    last: null,
  };
}

const ranked = (s: State) => [...s.board].sort((a, b) => b.caught - a.caught || a.tries - b.tries);

function coatColor(coat: Coat, t: Theme) {
  const p = pal(t), c = t.color;
  if (coat === "cream") return mix(p.cream, p.crust, 0.35);
  if (coat === "dark") return mix(p.dark, c.text, 0.15);
  if (coat === "orange") return p.orange;
  if (coat === "grey") return mix(c.secondaryText, c.card, 0.25);
  return p.brown;
}

function drawScene(g: CanvasRenderingContext2D, f: DrawFrame, s: State, aim: { power: number; angle: number } | null) {
  const t = f.theme, c = t.color, p = pal(t), dark = t.mode === "dark";
  const W = f.width, k = W / WORLD_W, H = WORLD_H * k;
  const X = (x: number) => x * k, Y = (y: number) => y * k;
  const tt = f.now / 1000;
  // room: wall, floor, a rug
  g.fillStyle = dark ? mix(c.wash, p.wall, 0.15) : p.wall;
  g.beginPath();
  g.roundRect(0, 0, W, H, 12);
  g.fill();
  g.fillStyle = dark ? mix(p.brown, c.wash, 0.45) : mix(p.crust, c.card, 0.3);
  g.fillRect(0, Y(WORLD_H - 60), W, Y(60));
  g.fillStyle = dark ? mix(p.purple, c.wash, 0.5) : mix(p.purple, c.card, 0.6);
  g.beginPath();
  g.ellipse(X(780), Y(WORLD_H - 40), X(170), Y(26), 0, 0, Math.PI * 2);
  g.fill();
  // a window
  g.fillStyle = dark ? mix(p.blue, c.wash, 0.5) : p.sky;
  g.fillRect(X(330), Y(60), X(180), Y(150));
  g.strokeStyle = dark ? mix(c.text, c.wash, 0.6) : c.card;
  g.lineWidth = 4;
  g.strokeRect(X(330), Y(60), X(180), Y(150));
  g.beginPath();
  g.moveTo(X(420), Y(60));
  g.lineTo(X(420), Y(210));
  g.stroke();

  // the throw in the air
  const last = s.last;
  const fl = last ? flight(last.power, last.angle) : null;
  const e = last ? running(last.at, Math.max(400, (fl!.pts.length + 20) * 18)) : null;
  const idx = fl && e !== null ? Math.min(fl.pts.length - 1, Math.floor(e / 18)) : -1;
  const inAir = idx >= 0 && idx < fl!.pts.length - 1;
  const chomp = !!last && last.caught && (e === null || idx >= fl!.pts.length - 1);
  const near = inAir ? Math.hypot(fl!.pts[idx]!.x - MOUTH.x, fl!.pts[idx]!.y - MOUTH.y) < 260 : false;

  // the pet, sitting on the rug
  const body = coatColor(s.coat, t), shade = mix(body, dark ? c.card : c.text, 0.25), feat = dark ? c.card : mix(c.text, p.dark, 0.3);
  const hx = X(790), hy = Y(250);
  const look = inAir ? Math.max(-0.4, Math.min(0.4, (fl!.pts[idx]!.y - MOUTH.y) / 400)) : 0;
  g.fillStyle = body;
  g.beginPath();
  g.ellipse(X(800), Y(400), X(95), Y(90), 0, 0, Math.PI * 2);
  g.fill();
  // tail wag
  const wag = Math.sin(tt * (chomp ? 16 : 5)) * (chomp ? 0.6 : 0.3);
  g.strokeStyle = shade;
  g.lineWidth = X(22);
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(X(880), Y(440));
  g.quadraticCurveTo(X(960), Y(420), X(950) + Math.sin(wag) * X(40), Y(350));
  g.stroke();
  // paws
  g.fillStyle = shade;
  g.beginPath();
  g.ellipse(X(745), Y(478), X(32), Y(16), 0, 0, Math.PI * 2);
  g.ellipse(X(845), Y(478), X(32), Y(16), 0, 0, Math.PI * 2);
  g.fill();
  // head
  g.save();
  g.translate(hx, hy);
  g.rotate(look * 0.4);
  g.fillStyle = body;
  g.beginPath();
  g.ellipse(0, 0, X(88), Y(80), 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = shade;
  g.beginPath();
  if (s.kind === "cat") {
    g.moveTo(-X(70), -Y(40));
    g.lineTo(-X(55), -Y(110));
    g.lineTo(-X(15), -Y(70));
    g.moveTo(X(70), -Y(40));
    g.lineTo(X(55), -Y(110));
    g.lineTo(X(15), -Y(70));
  } else {
    g.ellipse(-X(78), -Y(10), X(26), Y(58), 0.35, 0, Math.PI * 2);
    g.ellipse(X(78), -Y(10), X(26), Y(58), -0.35, 0, Math.PI * 2);
  }
  g.fill();
  // eyes, nose
  g.fillStyle = feat;
  g.beginPath();
  const eyeY = -Y(18) + look * Y(10);
  g.arc(-X(30), eyeY, X(9), 0, Math.PI * 2);
  g.arc(X(30), eyeY, X(9), 0, Math.PI * 2);
  g.fill();
  g.fillStyle = dark ? c.text : c.card;
  g.beginPath();
  g.arc(-X(27), eyeY - X(3), X(3), 0, Math.PI * 2);
  g.arc(X(33), eyeY - X(3), X(3), 0, Math.PI * 2);
  g.fill();
  g.fillStyle = feat;
  g.beginPath();
  g.ellipse(0, Y(16), X(13), Y(9), 0, 0, Math.PI * 2);
  g.fill();
  // mouth: opens wide as the treat comes, chomps on a catch
  const open = chomp ? 0.15 + 0.15 * Math.abs(Math.sin(tt * 14)) : near ? 1 : 0.55;
  g.fillStyle = p.red;
  g.beginPath();
  g.ellipse(0, Y(44), X(26), Y(26) * open, 0, 0, Math.PI * 2);
  g.fill();
  if (s.kind === "cat") {
    g.strokeStyle = mix(c.text, body, 0.5);
    g.lineWidth = 1.2;
    g.beginPath();
    for (const sgn of [-1, 1]) {
      g.moveTo(sgn * X(20), Y(22));
      g.lineTo(sgn * X(80), Y(10));
      g.moveTo(sgn * X(20), Y(28));
      g.lineTo(sgn * X(80), Y(32));
    }
    g.stroke();
  }
  g.restore();

  // aim preview: the first stretch of the arc
  if (aim) {
    const pf = flight(aim.power, aim.angle).pts;
    g.fillStyle = c.primary;
    g.beginPath();
    for (let i = 2; i < Math.min(pf.length, 16); i += 2) {
      g.moveTo(X(pf[i]!.x) + 3, Y(pf[i]!.y));
      g.arc(X(pf[i]!.x), Y(pf[i]!.y), 3, 0, Math.PI * 2);
    }
    g.fill();
  }
  // the treat: a little bone
  const tp = inAir ? fl!.pts[idx]! : last && !last.caught && fl && e !== null ? fl.pts[fl.pts.length - 1]! : null;
  const bone = (x: number, y: number, rot: number) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = p.cream;
    g.strokeStyle = mix(p.crust, c.text, 0.35);
    g.lineWidth = 1.2;
    g.beginPath();
    g.roundRect(-X(26), -Y(7), X(52), Y(14), 4);
    g.arc(-X(26), -Y(7), X(10), 0, Math.PI * 2);
    g.moveTo(-X(26) + X(10), Y(7));
    g.arc(-X(26), Y(7), X(10), 0, Math.PI * 2);
    g.moveTo(X(26) + X(10), -Y(7));
    g.arc(X(26), -Y(7), X(10), 0, Math.PI * 2);
    g.moveTo(X(26) + X(10), Y(7));
    g.arc(X(26), Y(7), X(10), 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.restore();
  };
  if (tp) bone(X(tp.x), Y(tp.y), tt * 8);
  // the next treat in the sling
  const sx = X(LAUNCH.x) + (aim ? -Math.cos((aim.angle * Math.PI) / 180) * aim.power * k * 1.4 : 0);
  const sy = Y(LAUNCH.y) + (aim ? Math.sin((aim.angle * Math.PI) / 180) * aim.power * k * 1.4 : 0);
  g.strokeStyle = mix(c.text, c.card, 0.4);
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(X(LAUNCH.x) - X(40), Y(LAUNCH.y) - Y(30));
  g.lineTo(sx, sy);
  g.lineTo(X(LAUNCH.x) + X(40), Y(LAUNCH.y) - Y(30));
  g.stroke();
  g.fillStyle = mix(p.brown, c.text, 0.2);
  g.fillRect(X(LAUNCH.x) - X(6), Y(LAUNCH.y), X(12), Y(WORLD_H - 60 - LAUNCH.y));
  bone(sx, sy, 0);
  return true;
}

export default defineApp<State, Action, Local>({
  name: "Treat toss",
  summary: (s) => {
    const top = ranked(s)[0];
    return `Toss ${s.pet} a treat · ${s.board.reduce((n, b) => n + b.caught, 0)} caught${top ? ` · ${top.name} leads with ${top.caught}` : ""}`;
  },

  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (a.t !== "toss" || !inChat(ctx, meta.user) || !okPower(a.power) || !okAngle(a.angle)) return s;
    const caught = flight(a.power, a.angle).caught;
    const name = clean(ctx.members.find((m) => m.id === meta.user)?.name, 20) || "Friend";
    const old = s.board.find((b) => b.who === meta.user);
    const row: Tally = old ? { ...old, tries: Math.min(99, old.tries + 1), caught: Math.min(Math.min(99, old.tries + 1), old.caught + (caught ? 1 : 0)) } : { who: meta.user, name, tries: 1, caught: caught ? 1 : 0, said: "" };
    return { ...s, board: old ? s.board.map((b) => (b === old ? row : b)) : [...s.board, row], last: { who: meta.user, power: a.power, angle: a.angle, caught, at: meta.time } };
  },

  invariants: {
    "one row per thrower": (s) => new Set(s.board.map((b) => b.who)).size === s.board.length,
    "catches never beat tries": (s) => s.board.every((b) => Number.isInteger(b.tries) && Number.isInteger(b.caught) && b.caught >= 0 && b.caught <= b.tries && b.tries >= 1),
    "the last throw is physics": (s) => !s.last || (okPower(s.last.power) && okAngle(s.last.angle) && s.last.caught === flight(s.last.power, s.last.angle).caught),
    "the last thrower is on the board": (s) => !s.last || s.board.some((b) => b.who === s.last!.who),
  },

  transitions: {
    "a toss counts one try for me": (p, n, a, m) => {
      if (a.t !== "toss" || p === n) return true;
      const was = p.board.find((b) => b.who === m.user), now = n.board.find((b) => b.who === m.user);
      return !!now && now.tries === Math.min(99, (was?.tries ?? 0) + 1);
    },
    "a catch adds one, a miss adds none": (p, n, a, m) => {
      if (a.t !== "toss" || p === n) return true;
      const was = p.board.find((b) => b.who === m.user)?.caught ?? 0, now = n.board.find((b) => b.who === m.user)?.caught ?? 0;
      return now === Math.min(n.board.find((b) => b.who === m.user)!.tries, was + (flight(a.power, a.angle).caught ? 1 : 0));
    },
    "the throw is remembered as thrown": (p, n, a, m) => a.t !== "toss" || p === n || (!!n.last && n.last.who === m.user && n.last.power === a.power && n.last.angle === a.angle && n.last.at === m.time),
    "a fair toss always lands": (p, n, a, m, ctx) => a.t !== "toss" || !inChat(ctx, m.user) || !okPower(a.power) || !okAngle(a.angle) || p !== n,
    "nobody else's score moves": (p, n, _a, m) => p.board.filter((b) => b.who !== m.user).every((b) => n.board.includes(b)) && n.board.length >= p.board.length,
    "the pet never changes": (p, n) => p.pet === n.pet && p.kind === n.kind && p.coat === n.coat && p.author === n.author,
    "only people in the chat throw": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (_s, _u, r) => ({ t: "toss", power: r.next() < 0.95 ? 10 + r.int(91) : 300, angle: 5 + r.int(81) }),

  local: { aim: false, dx: 0, dy: 0, toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const k = W / WORLD_W, H = Math.round(WORLD_H * k);
    const mine = state.board.find((b) => b.who === me);
    const person = (b: Tally): Member => members.find((m) => m.id === b.who) ?? { id: b.who, name: b.name };
    const aimOf = (dx: number, dy: number) => {
      const len = Math.hypot(dx, dy);
      const power = Math.max(10, Math.min(100, Math.round((len / (W * 0.32)) * 100)));
      const angle = Math.max(5, Math.min(85, Math.round((Math.atan2(dy, -dx) * 180) / Math.PI)));
      return { power, angle };
    };
    const aim = local.aim ? aimOf(local.dx, local.dy) : null;
    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      const lx = LAUNCH.x * k, ly = LAUNCH.y * k;
      if (e.type === "down") {
        if (Math.hypot(e.x - lx, e.y - ly) < 70) setLocal({ aim: true, dx: 0, dy: 0 });
      } else if (e.type === "move") {
        if (local.aim) setLocal({ dx: Math.min(0, e.x - lx), dy: Math.max(0, e.y - ly) });
      } else if (local.aim) {
        const a = aimOf(local.dx, local.dy);
        setLocal({ aim: false, dx: 0, dy: 0, toast: local.toast + 1 });
        if (Math.hypot(local.dx, local.dy) > 12) {
          dispatch({ t: "toss", power: a.power, angle: a.angle });
          haptic(flight(a.power, a.angle).caught ? "success" : "light");
        }
      }
    };
    const last = state.last;
    const lastName = last ? (last.who === me ? "You" : (state.board.find((b) => b.who === last.who)?.name ?? "Someone").split(" ")[0]) : "";
    const landed = last ? running(last.at, 900) === null : true;
    const quote = state.board.find((b) => b.said);

    return (
      <div>
        <CardHeader title={`Toss ${state.pet} a treat`} subtitle={state.line ? `${state.authorName}: “${state.line}”` : `${state.authorName}'s ${state.kind}`} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} drag label={`${state.pet} waiting for a treat; ${state.board.reduce((n, b) => n + b.caught, 0)} caught so far`} draw={(g, f) => drawScene(g, f, state, aim)} onPointer={onPointer} />
          {!local.aim && !mine ? (
            <div style={{ position: "absolute", left: 8, top: 8, padding: "2px 10px", borderRadius: 999, background: c.card, color: c.text, fontSize: 12, lineHeight: "18px", fontWeight: 600, pointerEvents: "none" }}>Pull the bone back, let go</div>
          ) : null}
          {last && landed ? (
            <div style={{ position: "absolute", right: 8, top: 8, padding: "2px 10px", borderRadius: 999, background: last.caught ? c.positive : c.card, color: last.caught ? c.onPrimary : c.text, fontSize: 12, lineHeight: "18px", fontWeight: 700, pointerEvents: "none" }}>
              {last.caught ? `${lastName}: caught` : `${lastName}: missed`}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, height: 30, overflow: "hidden" }}>
          {ranked(state)
            .slice(0, Math.max(2, Math.floor(W / 84)))
            .map((b, i) => (
              <div key={b.who} style={{ flex: "none", display: "flex", alignItems: "center", gap: 4, padding: "0 8px 0 3px", height: 30, borderRadius: 15, background: b.who === me ? c.selected : c.wash }}>
                <Avatar user={b.who === me ? me : person(b)} size={24} />
                <span style={{ fontSize: 13, fontWeight: 700, color: c.text, whiteSpace: "nowrap" }}>{`${b.caught}/${b.tries}`}</span>
                {i === 0 && b.caught > 0 ? <span style={{ fontSize: 12, color: c.text }}>best</span> : null}
              </div>
            ))}
          {state.board.length === 0 ? <span style={{ fontSize: 13, color: c.secondaryText, lineHeight: "30px" }}>Nobody's thrown yet</span> : null}
        </div>
        <div style={{ marginTop: 6, fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {mine ? `You: ${mine.caught} of ${mine.tries} caught · higher and softer works` : quote ? `${quote.name.split(" ")[0]}: “${quote.said}”` : `Higher and softer works`}
        </div>
        {local.toast > 0 && last && last.who === me && landed ? <Toast key={local.toast}>{last.caught ? `${state.pet} caught it` : "Bounced off the rug"}</Toast> : null}
      </div>
    );
  },
});
