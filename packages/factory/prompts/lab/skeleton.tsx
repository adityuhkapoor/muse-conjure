// A skeleton that compiles. Replace every part for the brief: the types, the seeded content, the
// actions and above all the drawing. Keep the shape: CHAT const, State, Action, defineApp.
import { defineApp, CardHeader, Button, Scene, Placed, Chip, circle, rect, ellipse, line, path, pal, innerWidth, running, tween, type Member, type Theme } from "@muse/app";

// Everything from the brief: names, quotes, numbers, the joke.
const CHAT = {
  title: "Title from the brief",
  seeded: [{ name: "Maya", what: "first thing", why: "her reason, in her words" }],
};

type Thing = { id: string; label: string; by: string | null; why: string };
type State = { things: Thing[]; at: number };
type Action = { t: "tap"; id: string };
type Local = Record<string, never>;

const pop = tween({ duration: 420, easing: "decelerate" });

/** The picture. Draw the moment here: shapes, characters, the object people imagine. */
function picture(s: State, me: string, members: Member[], w: number, ht: number, theme: Theme) {
  const p = pal();
  return [
    rect(0, 0, w, ht, 16, theme.color.wash),
    ellipse(w / 2, ht * 0.6, w * 0.3, ht * 0.2, p.blue),
    circle(w / 2, ht * 0.35, 18, p.yellow),
    line(16, ht - 16, w - 16, ht - 16, theme.color.divider, 2),
    path(`M ${w * 0.2} ${ht * 0.8} Q ${w / 2} ${ht * 0.5} ${w * 0.8} ${ht * 0.8}`, "none", { stroke: p.red, "stroke-width": 3 }),
  ];
}

export default defineApp<State, Action, Local>({
  name: "Skeleton",
  summary: (s) => `${s.things.filter((x) => x.by).length} done`,
  init: (ctx) => {
    const idOf = (name: string) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id ?? null;
    return { things: CHAT.seeded.map((x, i) => ({ id: `s${i}`, label: x.what, by: idOf(x.name), why: x.why })), at: 0 };
  },
  reduce: (s, a, m, ctx) => {
    if (a.t !== "tap" || typeof a.id !== "string" || !ctx.members.some((x) => x.id === m.user)) return s;
    if (!s.things.some((x) => x.id === a.id)) return s;
    return { ...s, at: m.time, things: s.things.map((x) => (x.id === a.id ? { ...x, by: x.by === m.user ? null : m.user } : x)) };
  },
  invariants: { "every holder is in the chat": (s, ctx) => s.things.every((x) => x.by === null || ctx.members.some((m) => m.id === x.by)) },
  onMembers: (s, ctx) => ({ ...s, things: s.things.map((x) => (x.by && !ctx.members.some((m) => m.id === x.by) ? { ...x, by: null } : x)) }),
  arbitrary: (s, _u, r) => (s.things.length ? { t: "tap", id: r.pick(s.things).id } : null),
  local: {},
  view: ({ state, me, members, dispatch, theme }) => {
    const w = innerWidth(), ht = 200;
    const e = running(state.at, 420);
    const t = e === null ? 1 : pop(e);
    return (
      <div>
        <CardHeader title={CHAT.title} subtitle={`${state.things.filter((x) => x.by).length} of ${state.things.length}`} />
        <Scene height={ht} label={CHAT.title} art={picture(state, me, members, w, ht, theme)}>
          {state.things.map((x, i) => (x.by ? <Placed key={x.id} user={x.by} x={0.2 + 0.6 * ((i + 0.5) / state.things.length)} y={0.5 * t + 0.2} me={me} /> : null))}
          <Chip tone="card" style={{ position: "absolute", left: 8, bottom: 8 }}>{CHAT.seeded[0]?.why ?? ""}</Chip>
        </Scene>
        {state.things.map((x) => (
          <Button key={x.id} kind={x.by === me ? "primary" : "secondary"} onClick={() => dispatch({ t: "tap", id: x.id })}>
            {x.label}
          </Button>
        ))}
      </div>
    );
  },
});
