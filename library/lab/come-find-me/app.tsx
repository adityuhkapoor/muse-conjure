import { defineApp, Avatar, Button, Canvas, CardHeader, Toast, clock, haptic, mix, pal, type Ctx, type DrawFrame, type Member } from "@muse/app";

// Come find me: someone posts where they are right now. A radar with them in the middle and rings
// for 5, 15 and 30 minutes away; friends tap the ring they're on and hit "On my way" and their face
// starts walking in along a dotted line. The sweep keeps turning till they leave.

type Params = {
  /** Who posted: "Arun" */
  author: string;
  /** Where they are: "Kettle & Crumb" */
  place: string;
  /** Until when: "4pm" */
  until: string;
  /** The post line */
  line: string;
  /** Friends who answered. ring: 0 = 5 min, 1 = 15 min, 2 = 30 min, 3 = can't today. coming: on their way. walked: 0 to 9, how far in. said: their words */
  friends: { who: string; ring: number; coming?: boolean; walked?: number; said?: string }[];
};

// @params
const P: Params = {
  author: "Arun",
  place: "Kettle & Crumb",
  until: "4pm",
  line: "at Kettle & Crumb till 4, come say hi",
  friends: [
    { who: "Maya", ring: 0, coming: true, walked: 5, said: "omw, bringing the spreadsheet" },
    { who: "Will", ring: 2, coming: true, walked: 1, said: "in the shower. 25 min. ok 30" },
    { who: "Tsai Lin", ring: 1, said: "after my 2pm, save me a seat" },
    { who: "Calvin", ring: 3, said: "asleep (alarm 4 of 7)" },
  ],
};
// @end params

type Friend = { who: string; name: string; ring: number; coming: boolean; walked: number; said: string; at: number };
type State = { author: string; authorName: string; place: string; until: string; line: string; friends: Friend[] };
type Action = { t: "set"; ring: number; coming: boolean };
type Local = { ring: number; toast: number };

const MINS = [5, 15, 30];
const RING_K = [0.36, 0.66, 0.94];
const CAN_H = 236;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const okRing = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 3;
const hash = (s: string) => {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return x >>> 0;
};
const angleOf = (who: string) => ((hash(who) % 360) * Math.PI) / 180;

function memberFor(ctx: Ctx, name: string): Member | undefined {
  const k = name.trim().toLowerCase();
  return ctx.members.find((m) => m.id === name || m.name.trim().toLowerCase() === k);
}

function initState(ctx: Ctx): State {
  const authorName = clean(P.author, 20) || "Someone";
  const author = memberFor(ctx, authorName)?.id ?? `name:${authorName}`;
  const friends: Friend[] = [];
  for (const f of Array.isArray(P.friends) ? P.friends.slice(0, 12) : []) {
    const name = clean(f?.who, 20);
    if (!name) continue;
    const m = memberFor(ctx, name);
    const who = m?.id ?? `name:${name}`;
    if (who === author || friends.some((x) => x.who === who)) continue;
    const ring = okRing(f.ring) ? f.ring : 1;
    const walked = typeof f.walked === "number" ? Math.max(0, Math.min(9, Math.round(f.walked))) : 0;
    friends.push({ who, name: m?.name ?? name, ring, coming: ring < 3 && f.coming === true, walked: ring < 3 && f.coming === true ? walked : 0, said: clean(f.said, 40), at: 0 });
  }
  return { author, authorName, place: clean(P.place, 24) || "here", until: clean(P.until, 10), line: clean(P.line, 60), friends };
}

/** How far in (0 to 0.9) a friend on their way is at time `now`. */
function progress(f: Friend, now: number): number {
  if (!f.coming || f.ring > 2) return 0;
  const base = f.walked / 10;
  if (!f.at) return base;
  const e = Math.max(0, now - f.at);
  const hop = 0.14 * (1 - Math.pow(1 - Math.min(1, e / 1400), 3));
  return Math.min(0.9, base + hop + e / (MINS[f.ring]! * 60000));
}

function drawRadar(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string, ghost: number) {
  const t = f.theme, c = t.color, pl = pal(t), dark = t.mode === "dark";
  const W = f.width, cx = W / 2, cy = CAN_H / 2, R = CAN_H / 2 - 6;
  const tt = f.now / 1000;
  // disc
  g.fillStyle = dark ? mix(c.wash, pl.green, 0.12) : mix(c.card, pl.green, 0.1);
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();
  // sweep: a fading wedge
  const a0 = (tt * 1.1) % (Math.PI * 2);
  for (let k = 0; k < 6; k++) {
    g.fillStyle = dark ? mix(c.wash, pl.green, 0.16 + 0.05 * (6 - k)) : mix(c.card, pl.green, 0.12 + 0.05 * (6 - k));
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, R, a0 - (k + 1) * 0.1, a0 - k * 0.1);
    g.closePath();
    g.fill();
  }
  // rings and cross hairs
  g.strokeStyle = dark ? mix(c.wash, pl.green, 0.5) : mix(c.card, pl.green, 0.45);
  g.lineWidth = 1;
  g.setLineDash([3, 4]);
  g.beginPath();
  for (const k of RING_K) {
    g.moveTo(cx + R * k, cy);
    g.arc(cx, cy, R * k, 0, Math.PI * 2);
  }
  g.moveTo(cx - R, cy);
  g.lineTo(cx + R, cy);
  g.moveTo(cx, cy - R);
  g.lineTo(cx, cy + R);
  g.stroke();
  g.setLineDash([]);
  // ghost ring for me
  if (ghost >= 0) {
    g.strokeStyle = c.primary;
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(cx, cy, R * RING_K[ghost]!, 0, Math.PI * 2);
    g.stroke();
  }
  // dotted walking lines
  g.strokeStyle = c.primary;
  g.lineWidth = 2;
  g.setLineDash([2, 5]);
  g.beginPath();
  for (const fr of s.friends) {
    if (!fr.coming || fr.ring > 2) continue;
    const a = angleOf(fr.who), r = Math.max(32, R * RING_K[fr.ring]! * (1 - progress(fr, f.now)));
    g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.lineTo(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18);
  }
  g.stroke();
  g.setLineDash([]);
  // a ping where the sweep passes someone
  for (const fr of s.friends) {
    if (fr.ring > 2) continue;
    const a = angleOf(fr.who);
    const d = (((a0 - a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (d < 0.5) {
      const r = R * RING_K[fr.ring]! * (1 - progress(fr, f.now));
      g.strokeStyle = fr.who === me ? c.primary : pl.green;
      g.globalAlpha = 1 - d / 0.5;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 13 + d * 14, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
  }
  // ring labels
  g.font = `600 11px ${t.type.family}`;
  g.textAlign = "left";
  g.textBaseline = "middle";
  for (const [i, k] of RING_K.entries()) {
    const label = `${MINS[i]} min`;
    const x = cx + R * k * Math.cos(-0.45) + 4, y = cy + R * k * Math.sin(-0.45);
    const w = g.measureText(label).width + 8;
    g.fillStyle = c.card;
    g.beginPath();
    g.roundRect(x - 4, y - 8, w, 16, 8);
    g.fill();
    g.fillStyle = c.text;
    g.fillText(label, x, y);
  }
  return true;
}

export default defineApp<State, Action, Local>({
  name: "Come find me",
  summary: (s) => {
    const on = s.friends.filter((f) => f.coming).length;
    return `${s.authorName} at ${s.place}${s.until ? ` till ${s.until}` : ""} · ${on} on the way`;
  },

  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (a.t !== "set" || !inChat(ctx, meta.user) || meta.user === s.author || !okRing(a.ring) || typeof a.coming !== "boolean") return s;
    if (a.ring === 3 && a.coming) return s;
    const old = s.friends.find((f) => f.who === meta.user);
    if (old && old.ring === a.ring && old.coming === a.coming) return s;
    const name = clean(ctx.members.find((m) => m.id === meta.user)?.name, 20) || "Friend";
    const keep = !!old && old.coming && a.coming && old.ring === a.ring;
    const f: Friend = { who: meta.user, name, ring: a.ring, coming: a.coming, walked: keep ? old!.walked : 0, said: old?.said ?? "", at: a.coming ? meta.time : 0 };
    return { ...s, friends: old ? s.friends.map((x) => (x === old ? f : x)) : [...s.friends, f] };
  },

  invariants: {
    "one dot per friend, never the poster": (s) => new Set(s.friends.map((f) => f.who)).size === s.friends.length && s.friends.every((f) => f.who !== s.author),
    "everyone sits on a ring": (s) => s.friends.every((f) => okRing(f.ring)),
    "nobody who can't make it is on the way": (s) => s.friends.every((f) => f.ring < 3 || (!f.coming && f.walked === 0)),
    "only people on the way have walked": (s) => s.friends.every((f) => f.coming || (f.walked === 0 && f.at === 0)),
    "walked stays in 0 to 9": (s) => s.friends.every((f) => Number.isInteger(f.walked) && f.walked >= 0 && f.walked <= 9),
  },

  transitions: {
    "a set puts me where I said": (p, n, a, m) => {
      if (a.t !== "set" || p === n) return true;
      const f = n.friends.find((x) => x.who === m.user);
      return !!f && f.ring === a.ring && f.coming === a.coming && f.at === (a.coming ? m.time : 0);
    },
    "a set touches nobody else": (p, n, _a, m) => p.friends.filter((x) => x.who !== m.user).every((x) => n.friends.includes(x)) && n.friends.filter((x) => x.who !== m.user).length === p.friends.filter((x) => x.who !== m.user).length,
    "a new friend joins at the end": (p, n, a, m) => a.t !== "set" || p === n || p.friends.some((x) => x.who === m.user) || n.friends[n.friends.length - 1]?.who === m.user,
    "a real change lands": (p, n, a, m, ctx) => {
      if (a.t !== "set" || !inChat(ctx, m.user) || m.user === p.author || !okRing(a.ring) || typeof a.coming !== "boolean" || (a.ring === 3 && a.coming)) return true;
      const o = p.friends.find((x) => x.who === m.user);
      return (!!o && o.ring === a.ring && o.coming === a.coming) || p !== n;
    },
    "changing rings starts the walk over": (p, n, _a, m) => {
      const o = p.friends.find((x) => x.who === m.user), f = n.friends.find((x) => x.who === m.user);
      return !o || !f || o.ring === f.ring || f.walked === 0;
    },
    "the post never changes": (p, n) => p.author === n.author && p.place === n.place && p.until === n.until && p.line === n.line,
    "only people in the chat move": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (_s, _u, r) => {
    const ring = r.int(4);
    return { t: "set", ring: r.next() < 0.97 ? ring : 7, coming: ring < 3 ? r.next() < 0.7 : false };
  },

  local: { ring: 1, toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const now = clock.value;
    const isAuthor = me === state.author;
    const mine = state.friends.find((f) => f.who === me);
    const cx = W / 2, cy = CAN_H / 2, R = CAN_H / 2 - 6;
    const person = (f: Friend): Member => members.find((m) => m.id === f.who) ?? { id: f.who, name: f.name };
    const on = state.friends.filter((f) => f.coming);
    const near = state.friends.filter((f) => f.ring < 3);
    const cant = state.friends.filter((f) => f.ring === 3);
    const ghost = !isAuthor && (!mine || mine.ring === 3 || !mine.coming) ? local.ring : -1;
    const pos = (f: Friend) => {
      const a = angleOf(f.who), r = Math.max(32, R * RING_K[f.ring]! * (1 - progress(f, now)));
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, a };
    };
    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (e.type !== "up" || isAuthor) return;
      const d = Math.hypot(e.x - cx, e.y - cy) / R;
      if (d > 1.05) return;
      const ring = d < 0.51 ? 0 : d < 0.8 ? 1 : 2;
      setLocal({ ring });
      haptic("light");
    };
    const quote = on.find((f) => f.said) ?? state.friends.find((f) => f.said);
    const etaMin = (f: Friend) => Math.max(1, Math.round(MINS[f.ring]! * (1 - progress(f, now))));
    const going = !!mine && mine.coming;

    return (
      <div>
        <CardHeader title={`${state.authorName} is at ${state.place}`} subtitle={`${state.until ? `Till ${state.until} · ` : ""}${on.length} on the way · ${near.length} nearby`} />
        <div style={{ position: "relative", height: CAN_H }}>
          <Canvas
            height={CAN_H}
            label={`Radar around ${state.authorName}: ${on.length} on the way, ${near.length} within 30 minutes`}
            draw={(g, f) => drawRadar(g, f, state, me, ghost)}
            onPointer={onPointer}
          />
          <div style={{ position: "absolute", left: cx - 17, top: cy - 17, pointerEvents: "none", borderRadius: 999, boxShadow: `0 0 0 3px ${c.card}` }}>
            <Avatar user={state.author.startsWith("name:") ? { id: state.author, name: state.authorName } : (members.find((m) => m.id === state.author) ?? state.author)} size={34} />
          </div>
          {near.map((f) => {
            const q = pos(f);
            const walking = f.coming;
            return (
              <div key={f.who} style={{ position: "absolute", left: q.x - 12, top: q.y - 12, pointerEvents: "none", transition: f.at ? undefined : "left .4s, top .4s" }}>
                <Avatar user={f.who === me ? me : person(f)} size={24} />
                {walking ? (
                  <span style={{ position: "absolute", left: Math.cos(q.a) < 0 ? -28 : 18, top: Math.sin(q.a) < 0 ? -10 : 14, padding: "0 5px", borderRadius: 8, background: c.primary, color: c.onPrimary, fontSize: 10, lineHeight: "14px", fontWeight: 700, whiteSpace: "nowrap" }}>{`${etaMin(f)} min`}</span>
                ) : null}
              </div>
            );
          })}
          {ghost >= 0 ? (
            <div
              style={{ position: "absolute", left: cx + Math.cos(angleOf(me)) * R * RING_K[ghost]! - 14, top: cy + Math.sin(angleOf(me)) * R * RING_K[ghost]! - 14, width: 28, height: 28, borderRadius: 999, border: `2px dashed ${c.primary}`, background: c.card, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: c.text, pointerEvents: "none", transition: "left .35s cubic-bezier(.3,1.4,.5,1), top .35s cubic-bezier(.3,1.4,.5,1)" }}
            >
              You
            </div>
          ) : null}
          {cant.length ? (
            <div style={{ position: "absolute", right: 0, bottom: 0, display: "flex", alignItems: "center", gap: 4, padding: "2px 8px 2px 2px", borderRadius: 999, background: c.wash, pointerEvents: "none" }}>
              {cant.slice(0, 3).map((f) => (
                <Avatar key={f.who} user={f.who === me ? me : person(f)} size={18} />
              ))}
              <span style={{ fontSize: 12, color: c.text }}>{`can't today`}</span>
            </div>
          ) : null}
        </div>
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {going ? `You're on your way · about ${etaMin(mine!)} min out` : !isAuthor && !mine ? `Tap your ring · ${quote ? `${quote.name.split(" ")[0]}: “${quote.said}”` : "how far are you?"}` : quote ? `${quote.name.split(" ")[0]}: “${quote.said}”` : `Nobody's answered yet`}
        </div>
        {!isAuthor ? (
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            {going ? (
              <Button kind="secondary" wide onClick={() => dispatch({ t: "set", ring: mine!.ring, coming: false })}>
                Not coming after all
              </Button>
            ) : (
              <>
                <Button kind="secondary" onClick={() => dispatch({ t: "set", ring: 3, coming: false })}>
                  Can't today
                </Button>
                <div style={{ flex: 1 }}>
                  <Button
                    kind="primary"
                    wide
                    onClick={() => {
                      dispatch({ t: "set", ring: local.ring, coming: true });
                      setLocal({ toast: local.toast + 1 });
                      haptic("success");
                    }}
                  >
                    On my way
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : null}
        {local.toast > 0 && going ? <Toast key={local.toast}>{`${state.authorName} can see you coming`}</Toast> : null}
      </div>
    );
  },
});
