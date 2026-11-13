// Good fixture: look-alikes the strict rules must not flag. Avatar initials at 14 px (tiny-text),
// "Round 1 winners" (a name, not a count: bad-plural), vetoed options struck through on a canvas
// (painted-over), a strip whose off-screen cards are clipped away entirely (canvas-text-clipped),
// and a locked plan with no buttons although people could still leave (no-enabled-action).
// Profile: strict.
import { defineApp, Avatar, Button, Canvas, CardHeader, Locked, fitText } from "@muse/app";

type Option = { id: string; label: string };
type State = { options: Option[]; vetoed: string[]; going: string[]; locked: boolean };
type Action = { t: "veto"; option: string } | { t: "join" } | { t: "leave" } | { t: "lock" };

const OPTIONS: Option[] = [
  { id: "a", label: "Escape room" },
  { id: "b", label: "Thrift crawl" },
  { id: "c", label: "Bowling" },
  { id: "d", label: "Karaoke" },
  { id: "e", label: "Mini golf" },
];
const isMember = (ctx: { members: { id: string }[] }, u: string) => ctx.members.some((m) => m.id === u);
const left = (s: State) => s.options.filter((o) => !s.vetoed.includes(o.id));

export default defineApp<State, Action>({
  name: "Saturday plan",
  summary: (s) => (s.locked ? `Locked: ${left(s)[0]?.label ?? "a plan"}, ${s.going.length} going.` : `${left(s).length} ideas left, ${s.going.length} going.`),
  init: () => ({ options: OPTIONS, vetoed: [], going: [], locked: false }),
  reduce: (s, a, m, ctx) => {
    if (!isMember(ctx, m.user)) return s;
    if (a.t === "veto") {
      if (s.locked || typeof a.option !== "string" || !s.options.some((o) => o.id === a.option) || s.vetoed.includes(a.option) || left(s).length <= 1) return s;
      return { ...s, vetoed: [...s.vetoed, a.option] };
    }
    if (a.t === "join") return s.locked || s.going.includes(m.user) ? s : { ...s, going: [...s.going, m.user] };
    if (a.t === "leave") return s.going.includes(m.user) ? { ...s, going: s.going.filter((u) => u !== m.user) } : s;
    if (a.t === "lock") return s.locked || s.going.length < 2 ? s : { ...s, locked: true };
    return s;
  },
  onMembers: (s, ctx) => ({ ...s, going: s.going.filter((u) => isMember(ctx, u)) }),
  invariants: {
    "vetoes are known options, once each, and one is always left": (s) =>
      new Set(s.vetoed).size === s.vetoed.length && s.vetoed.every((v) => s.options.some((o) => o.id === v)) && left(s).length >= 1,
    "the options never change": (s) => s.options.map((o) => o.id).join() === OPTIONS.map((o) => o.id).join(),
    "going is people in the chat, once each": (s, ctx) => new Set(s.going).size === s.going.length && s.going.every((u) => isMember(ctx, u)),
  },
  transitions: {
    "a veto adds exactly that option": (p, n, a) => a.t !== "veto" || p === n || (n.vetoed.length === p.vetoed.length + 1 && n.vetoed.at(-1) === a.option && n.going === p.going),
    "a join adds the sender": (p, n, a, m) => a.t !== "join" || p === n || (n.going.length === p.going.length + 1 && n.going.at(-1) === m.user && !p.locked),
    "a leave drops the sender": (p, n, a, m) => a.t !== "leave" || p === n || (n.going.length === p.going.length - 1 && !n.going.includes(m.user)),
    "a lock needs two going and never undoes": (p, n, a) => (p.locked ? n.locked && n.vetoed === p.vetoed : a.t !== "lock" || p === n || (n.locked && p.going.length >= 2)),
  },
  arbitrary: (s, _u, r) => {
    const k = r.int(10);
    if (k < 4 && left(s).length > 1) return { t: "veto", option: r.pick(left(s)).id };
    if (k < 7) return { t: "join" };
    if (k < 8) return { t: "leave" };
    return { t: "lock" };
  },
  view: ({ state, me, dispatch }) => {
    const rest = left(state).length;
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <CardHeader title="Saturday plan" subtitle={`Round 1 winners · ${rest} ${rest === 1 ? "idea" : "ideas"} left`} />
        <Canvas
          height={40}
          label={`Ideas: ${state.options.map((o) => o.label + (state.vetoed.includes(o.id) ? " (vetoed)" : "")).join(", ")}`}
          draw={(g, { width, theme }) => {
            g.save();
            g.beginPath();
            g.rect(0, 0, width, 40);
            g.clip();
            // The cards that fit are shown; the rest wait past the right edge, wholly clipped away.
            const fits = Math.max(1, Math.floor((width - 4) / 124));
            state.options.forEach((o, i) => {
              const x = i < fits ? 4 + i * 124 : width + 8 + (i - fits) * 124, w = 116;
              g.fillStyle = theme.color.input;
              g.beginPath();
              g.roundRect(x, 4, w, 32, 8);
              g.fill();
              const f = fitText(o.label, w - 16, { g, size: 13, weight: 600 });
              g.fillStyle = state.vetoed.includes(o.id) ? theme.color.secondaryText : theme.color.text;
              g.textBaseline = "middle";
              g.fillText(f.text, x + 8, 20);
              // Vetoed: a strike through the label, drawn after it on purpose.
              if (state.vetoed.includes(o.id)) g.fillRect(x + 8, 19.5, f.width, 1.5);
            });
            g.restore();
          }}
        />
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap", minHeight: 14 }}>
          {state.going.map((u) => (
            <Avatar key={u} user={u} size={14} />
          ))}
        </div>
        {state.locked ? (
          <Locked detail={`${state.going.length} going`}>Locked · {left(state)[0]?.label ?? "the plan"}</Locked>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {rest > 1 ? (
              <Button kind="secondary" onClick={() => dispatch({ t: "veto", option: left(state)[0]!.id })}>
                Veto first
              </Button>
            ) : null}
            <Button kind="secondary" onClick={() => dispatch({ t: state.going.includes(me) ? "leave" : "join" })}>
              {state.going.includes(me) ? "Leave" : "Join"}
            </Button>
            <Button kind="primary" disabled={state.going.length < 2} onClick={() => dispatch({ t: "lock" })}>
              Lock it
            </Button>
          </div>
        )}
      </div>
    );
  },
});
