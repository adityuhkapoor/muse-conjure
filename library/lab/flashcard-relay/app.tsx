import { defineApp, Avatar, Button, Canvas, CardHeader, Toast, fitText, haptic, mix, pal, rng, running, type Ctx, type DrawFrame } from "@muse/app";

// Flashcard relay: a 180-person class group, one final. Everyone writes a few cards and the
// group's deck grows as a drawn stack on the desk. Every day the same five cards come up for
// everyone, the toughest ones first; flip one, say if you got it, and your streak grows. The
// stack climbs toward the goal before the final.

type Params = {
  /** Card title */
  title: string;
  /** Under the title: the group and the date of the final */
  sub: string;
  /** Today, used to pick the day's five cards: "Dec 3" */
  day: string;
  /** Cards the group wrote before (only a few are listed below) */
  count: number;
  /** How many cards the group wants before the final */
  goal: number;
  /** How many cards each member is asked to write */
  each: number;
  /** Cards: front, back, who wrote it, and how often the group missed and got it so far */
  cards: { q: string; a: string; by?: string; miss?: number; hit?: number }[];
  /** Streaks so far: who and how many days in a row */
  streaks: { who: string; days: number; said?: string }[];
};

// @params
const P: Params = {
  title: "BIO 101 deck",
  sub: "BIO 101 · Fall · final Dec 12",
  day: "Dec 3",
  count: 304,
  goal: 400,
  each: 3,
  cards: [
    { q: "Where does the Calvin cycle happen?", a: "The stroma of the chloroplast", by: "Calvin", miss: 31, hit: 40 },
    { q: "Which enzyme unzips DNA?", a: "Helicase", by: "Maya", miss: 22, hit: 61 },
    { q: "Mitosis or meiosis: which makes gametes?", a: "Meiosis", by: "Arun", miss: 12, hit: 88 },
    { q: "Where does the Krebs cycle run?", a: "The mitochondrial matrix", by: "Tsai Lin", miss: 44, hit: 30 },
    { q: "Ribosomes read which molecule?", a: "mRNA", by: "Will", miss: 9, hit: 70 },
    { q: "What carries oxygen in red blood cells?", a: "Hemoglobin", by: "Maya", miss: 6, hit: 92 },
    { q: "What does ATP synthase make?", a: "ATP, from ADP and phosphate", by: "Arun", miss: 27, hit: 35 },
    { q: "What bonds hold the two DNA strands together?", a: "Hydrogen bonds between bases", by: "Calvin", miss: 19, hit: 50 },
  ],
  streaks: [
    { who: "Maya", days: 12, said: "tabbed the deck by unit, color-coded obviously" },
    { who: "Tsai Lin", days: 9 },
    { who: "Arun", days: 4, said: "doing my five while the rice cooks" },
    { who: "Calvin", days: 2, said: "wrote the calvin cycle card. personal" },
    { who: "Will", days: 1 },
  ],
};
// @end params

type Card = { id: string; q: string; a: string; by: string; name: string; miss: number; hit: number; at: number };
type Answer = { who: string; card: string; ok: boolean; at: number };
type Streak = { who: string; name: string; days: number; said: string };
type State = { title: string; sub: string; count: number; goal: number; each: number; cards: Card[]; today: string[]; answers: Answer[]; streaks: Streak[] };
type Action = { t: "answer"; card: string; ok: boolean } | { t: "add"; q: string; a: string };
type Local = { flip: string; q: string; a: string; writing: boolean; toast: number; msg: string };

const CH = 196;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const first = (n: string) => n.split(" ")[0] ?? n;
const hash = (t: string) => {
  let x = 2166136261;
  for (let i = 0; i < t.length; i++) x = Math.imul(x ^ t.charCodeAt(i), 16777619);
  return x >>> 0;
};
const tough = (c: Card) => (c.miss + 1) / (c.miss + c.hit + 2);
const deck = (s: State) => s.count + s.cards.filter((c) => c.at > 0).length;
const streakOf = (s: State, who: string) => {
  const base = s.streaks.find((x) => x.who === who)?.days ?? 0;
  const done = s.today.length > 0 && s.today.every((id) => s.answers.some((a) => a.who === who && a.card === id));
  return base + (done ? 1 : 0);
};

function initState(ctx: Ctx): State {
  const find = (n: string) => ctx.members.find((y) => y.id === n || y.name.toLowerCase() === n.toLowerCase());
  const cards: Card[] = [];
  for (const x of Array.isArray(P.cards) ? P.cards : []) {
    const q = clean(x?.q, 80);
    const a = clean(x?.a, 60);
    if (!q || !a || cards.length >= 40) continue;
    const nm = clean(x.by, 20);
    const m = nm ? find(nm) : undefined;
    cards.push({ id: `p${cards.length}`, q, a, by: m ? m.id : nm ? `~${nm}` : "", name: m ? clean(m.name, 20) || nm : nm, miss: isInt(x.miss, 0, 99999) ? x.miss : 0, hit: isInt(x.hit, 0, 99999) ? x.hit : 0, at: 0 });
  }
  // Today's five: the two toughest, then three more drawn for the day, the same for everyone.
  const byTough = [...cards].sort((a, b) => tough(b) - tough(a) || a.id.localeCompare(b.id));
  const rest = rng(hash(clean(P.day, 20) || "today")).shuffle(byTough.slice(2));
  const today = [...byTough.slice(0, 2), ...rest.slice(0, 3)].sort((a, b) => tough(b) - tough(a)).map((c) => c.id);
  const streaks: Streak[] = [];
  for (const x of Array.isArray(P.streaks) ? P.streaks : []) {
    const nm = clean(x?.who, 20);
    if (!nm || streaks.length >= 12) continue;
    const m = find(nm);
    const who = m ? m.id : `~${nm}`;
    if (streaks.some((y) => y.who === who)) continue;
    streaks.push({ who, name: m ? clean(m.name, 20) || nm : nm, days: isInt(x.days, 0, 999) ? x.days : 0, said: clean(x.said, 60) });
  }
  const count = isInt(P.count, 0, 99999) ? Math.max(P.count, cards.length) : cards.length;
  return { title: clean(P.title, 40) || "Flashcard relay", sub: clean(P.sub, 60), count, goal: isInt(P.goal, 1, 99999) ? P.goal : 100, each: isInt(P.each, 1, 10) ? P.each : 3, cards, today, answers: [], streaks };
}

function drawDesk(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string, cur: number) {
  const t = f.theme;
  const c = t.color;
  const pl = pal(t);
  const dk = t.mode === "dark";
  const W = f.width;
  const n = deck(s);
  let anim = false;
  g.beginPath();
  g.roundRect(0, 0, W, CH, 14);
  g.fillStyle = dk ? mix(pl.brown, c.wash, 0.55) : mix(pl.wall, pl.crust, 0.25);
  g.fill();
  // Wood grain.
  g.strokeStyle = dk ? mix(pl.brown, c.wash, 0.4) : mix(pl.wall, pl.brown, 0.25);
  g.lineWidth = 1;
  g.beginPath();
  for (let y = 14; y < CH; y += 22) {
    g.moveTo(0, y);
    g.bezierCurveTo(W * 0.3, y + 4, W * 0.6, y - 4, W, y + 2);
  }
  g.stroke();

  // The stack: one sliver per ~16 cards, the newest card dropping on top.
  const sx = 16;
  const sw = 96;
  const base = CH - 34;
  const layers = Math.max(1, Math.min(34, Math.round(n / 12)));
  const fresh = s.cards.filter((x) => x.at > 0).sort((a, b) => b.at - a.at)[0];
  const drop = fresh ? running(fresh.at, 800) : null;
  for (let k = 0; k < layers; k++) {
    const y = base - k * 3.2;
    const wob = Math.sin(k * 1.7) * 2;
    g.beginPath();
    g.roundRect(sx + wob, y - 60, sw, 60, 3);
    g.fillStyle = k % 6 === 5 ? mix(pl.yellow, c.card, 0.45) : k % 4 === 3 ? mix(pl.sky, c.card, 0.2) : c.card;
    if (dk) g.fillStyle = mix(c.text, c.wash, k % 4 === 3 ? 0.25 : 0.12);
    g.fill();
    g.strokeStyle = dk ? mix(c.wash, c.text, 0.35) : mix(c.secondaryText, c.card, 0.55);
    g.stroke();
  }
  const topY = base - (layers - 1) * 3.2 - 60;
  if (drop !== null) {
    anim = true;
    const u = drop / 800;
    const y = topY - 60 * (1 - u) * (1 - u) - 6;
    g.save();
    g.translate(sx + sw / 2, y + 30);
    g.rotate((1 - u) * 0.5);
    g.beginPath();
    g.roundRect(-sw / 2, -30, sw, 60, 3);
    g.fillStyle = mix(pl.yellow, c.card, 0.3);
    g.fill();
    g.restore();
  }
  // Rule lines on the top card.
  g.strokeStyle = mix(pl.red, c.card, 0.4);
  g.beginPath();
  g.moveTo(sx + 4, topY + 14);
  g.lineTo(sx + sw - 4, topY + 14);
  g.stroke();
  g.strokeStyle = mix(pl.blue, c.card, 0.6);
  g.beginPath();
  for (let y = topY + 26; y < topY + 58; y += 10) {
    g.moveTo(sx + 4, y);
    g.lineTo(sx + sw - 4, y);
  }
  g.stroke();
  // Count and how close to the goal.
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = c.text;
  g.font = `800 16px ${t.type.family}`;
  g.fillText(`${n}`, sx + sw / 2, topY + 36);
  const pct = Math.min(1, n / s.goal);
  g.fillStyle = dk ? mix(c.wash, c.text, 0.15) : mix(c.card, c.text, 0.08);
  g.beginPath();
  g.roundRect(sx, base + 8, sw, 6, 3);
  g.fill();
  g.fillStyle = pl.green;
  g.beginPath();
  g.roundRect(sx, base + 8, Math.max(6, sw * pct), 6, 3);
  g.fill();
  const lab = fitText(`${n} of ${s.goal} cards`, sw + 10, { g, size: 11, min: 10, weight: 600 });
  g.font = lab.font;
  g.fillStyle = dk ? c.text : c.text;
  g.fillText(lab.text, sx + sw / 2, base + 24);

  // Today's other cards fanned behind the one in hand.
  const fx = sx + sw + 30;
  const fw = W - fx - 14;
  s.today.forEach((id, k) => {
    if (k === cur) return;
    const done = s.answers.some((a) => a.who === me && a.card === id);
    const off = k - cur;
    g.save();
    g.translate(fx + fw / 2 + off * 6, CH / 2 + 6 - Math.abs(off) * 4);
    g.rotate(off * 0.045);
    g.beginPath();
    g.roundRect(-fw / 2, -66, fw, 128, 8);
    g.fillStyle = done ? (dk ? mix(pl.green, c.wash, 0.55) : mix(pl.green, c.card, 0.7)) : dk ? mix(c.text, c.wash, 0.2) : c.card;
    g.fill();
    g.strokeStyle = dk ? mix(c.wash, c.text, 0.35) : mix(c.secondaryText, c.card, 0.55);
    g.stroke();
    g.restore();
  });
  return anim;
}

export default defineApp<State, Action, Local>({
  name: "Flashcard relay",
  summary: (s) => {
    const tops = [...s.streaks].sort((a, b) => streakOf(s, b.who) - streakOf(s, a.who))[0];
    return `${s.title}: ${deck(s)} of ${s.goal} cards · today's five are out${tops ? ` · ${first(tops.name)} on a ${streakOf(s, tops.who)} day streak` : ""}`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    const u = m.user;
    if (!inChat(ctx, u)) return s;
    if (a.t === "answer") {
      if (typeof a.card !== "string" || typeof a.ok !== "boolean" || !s.today.includes(a.card)) return s;
      if (s.answers.some((x) => x.who === u && x.card === a.card)) return s;
      const cards = s.cards.map((c) => (c.id === a.card ? { ...c, miss: c.miss + (a.ok ? 0 : 1), hit: c.hit + (a.ok ? 1 : 0) } : c));
      let streaks = s.streaks;
      if (!streaks.some((x) => x.who === u)) streaks = [...streaks, { who: u, name: clean(ctx.members.find((x) => x.id === u)?.name, 20) || "Friend", days: 0, said: "" }];
      return { ...s, cards, streaks, answers: [...s.answers, { who: u, card: a.card, ok: a.ok, at: m.time }] };
    }
    if (a.t === "add") {
      const q = clean(a.q, 80);
      const ans = clean(a.a, 60);
      if (!q || !ans || s.cards.filter((c) => c.by === u && c.at > 0).length >= 10 || s.cards.length >= 60) return s;
      const name = clean(ctx.members.find((x) => x.id === u)?.name, 20) || "Friend";
      return { ...s, cards: [...s.cards, { id: `c${m.seq}`, q, a: ans, by: u, name, miss: 0, hit: 0, at: m.time }] };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const gone = (u: string) => !u.startsWith("~") && !inChat(ctx, u);
    if (!s.answers.some((x) => gone(x.who)) && !s.streaks.some((x) => gone(x.who))) return s;
    return { ...s, answers: s.answers.filter((x) => !gone(x.who)), streaks: s.streaks.filter((x) => !gone(x.who)) };
  },

  invariants: {
    "one answer per person per card": (s) => new Set(s.answers.map((x) => `${x.who}@${x.card}`)).size === s.answers.length,
    "answers are on today's cards": (s) => s.answers.every((x) => s.today.includes(x.card)) && s.today.every((id) => s.cards.some((c) => c.id === id)),
    "card ids are unique": (s) => new Set(s.cards.map((c) => c.id)).size === s.cards.length,
    "everyone who answered has a streak": (s) => s.answers.every((x) => s.streaks.some((y) => y.who === x.who)) && new Set(s.streaks.map((x) => x.who)).size === s.streaks.length,
    "tallies never go negative": (s) => s.cards.every((c) => c.miss >= 0 && c.hit >= 0) && deck(s) >= s.cards.length - s.cards.filter((c) => c.at > 0).length,
  },

  transitions: {
    "an answer counts once, on that card": (p, n, a, m) => {
      if (a.t !== "answer" || p === n) return true;
      const was = p.cards.find((c) => c.id === a.card)!;
      const now = n.cards.find((c) => c.id === a.card)!;
      return n.answers.length === p.answers.length + 1 && n.answers.at(-1)!.who === m.user && n.answers.at(-1)!.ok === a.ok && now.hit - was.hit === (a.ok ? 1 : 0) && now.miss - was.miss === (a.ok ? 0 : 1);
    },
    "answering never touches other cards": (p, n, a) => a.t !== "answer" || n.cards.every((c, k) => c.id === a.card || JSON.stringify(c) === JSON.stringify(p.cards[k])),
    "a new card lands on the stack": (p, n, a, m) => a.t !== "add" || p === n || (n.cards.length === p.cards.length + 1 && n.cards.at(-1)!.by === m.user && n.cards.at(-1)!.at === m.time && deck(n) === deck(p) + 1 && n.answers === p.answers),
    "today's five never change": (p, n) => n.today.join() === p.today.join(),
    "the deck only grows": (p, n) => deck(n) >= deck(p),
    "only the group plays": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, u, r) => {
    const open = s.today.filter((id) => !s.answers.some((x) => x.who === u && x.card === id));
    if (open.length && r.next() < 0.75) return { t: "answer", card: r.pick(open), ok: r.next() < 0.6 };
    return { t: "add", q: r.pick(["What is osmosis?", "Name a lipid", "What does DNA polymerase do?"]), a: r.pick(["Water moving across a membrane", "Cholesterol", "Builds new DNA"]) };
  },

  local: { flip: "", q: "", a: "", writing: false, toast: 0, msg: "" },

  view: ({ state: s, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const mineDone = s.today.filter((id) => s.answers.some((x) => x.who === me && x.card === id));
    const cur = s.today.findIndex((id) => !mineDone.includes(id));
    const card = cur >= 0 ? s.cards.find((x) => x.id === s.today[cur])! : null;
    const flipped = !!card && local.flip === card.id;
    const fx = 16 + 96 + 30;
    const fw = W - fx - 14;
    const written = s.cards.filter((x) => x.by === me && x.at > 0).length;
    const ranks = [...new Set([...s.streaks.map((x) => x.who)])]
      .map((who) => ({ who, name: s.streaks.find((x) => x.who === who)!.name, days: streakOf(s, who) }))
      .sort((a, b) => b.days - a.days)
      .slice(0, W < 345 ? 3 : 4);
    const quote = s.streaks.find((x) => x.said);
    const pct = card ? Math.round((card.miss * 100) / Math.max(1, card.miss + card.hit)) : 0;
    const label = `A stack of ${deck(s)} flashcards toward ${s.goal}; today's ${s.today.length} cards fanned out, ${mineDone.length} done`;
    const answer = (ok: boolean) => {
      if (!card) return;
      haptic(ok ? "success" : "light");
      if (mineDone.length === s.today.length - 1) setLocal({ toast: local.toast + 1, msg: `Today's five done · ${streakOf(s, me) + 1} day streak`, flip: "" });
      else setLocal({ flip: "" });
      dispatch({ t: "answer", card: card.id, ok });
    };
    const add = () => {
      const q = local.q.trim();
      const a = local.a.trim();
      if (!q || !a) return;
      haptic("success");
      setLocal({ q: "", a: "", writing: false, toast: local.toast + 1, msg: "Your card is on the stack" });
      dispatch({ t: "add", q, a });
    };

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.sub} />
        <div style={{ position: "relative", height: CH }}>
          <Canvas height={CH} label={label} draw={(g, f) => drawDesk(g, f, s, me, cur < 0 ? s.today.length : cur)} />
          {card ? (
            <button
              type="button"
              aria-label={flipped ? `Answer: ${card.a}. Tap to see the question` : `Card ${cur + 1} of ${s.today.length}: ${card.q}. Tap to flip`}
              onClick={() => { haptic("light"); setLocal({ flip: flipped ? "" : card.id }); }}
              style={{ position: "absolute", left: fx, top: CH / 2 - 58, width: fw, height: 128, perspective: 600 }}
            >
              <div style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", transition: "transform 450ms cubic-bezier(.3,1.4,.5,1)", transform: flipped ? "rotateY(180deg)" : "none" }}>
                {flipped ? null : <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", background: c.card, borderRadius: 8, boxShadow: `0 1px 0 ${c.divider}, 0 0 0 1px ${c.divider}`, padding: "10px 10px 8px", display: "flex", flexDirection: "column", textAlign: "left" }}>
                  <div style={{ fontSize: 11, lineHeight: "14px", fontWeight: 700, color: c.secondaryText, ...ell }}>{`${cur + 1} of ${s.today.length}${cur < 2 && card.miss + card.hit > 0 ? " · toughest" : ""}`}</div>
                  <div style={{ flex: 1, minHeight: 0, overflow: "hidden", fontSize: 15, lineHeight: "19px", fontWeight: 600, color: c.text, marginTop: 4, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" }}>{card.q}</div>
                  <div style={{ fontSize: 11, lineHeight: "14px", color: c.secondaryText, ...ell }}>{`${card.name ? `by ${first(card.name)} · ` : ""}${card.miss + card.hit > 0 ? `${pct} in 100 miss it` : "new card"}`}</div>
                </div>}
                {flipped ? <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateY(180deg)", background: c.selected, borderRadius: 8, boxShadow: `0 0 0 1px ${c.divider}`, padding: 10, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                  <div style={{ fontSize: 17, lineHeight: "22px", fontWeight: 700, color: c.text, overflow: "hidden", maxHeight: 88 }}>{card.a}</div>
                </div> : null}
              </div>
            </button>
          ) : (
            <div style={{ position: "absolute", left: fx, top: CH / 2 - 58, width: fw, height: 128, borderRadius: 8, background: c.card, boxShadow: `0 0 0 1px ${c.divider}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, padding: 10, textAlign: "center" }}>
              <div style={{ fontSize: 28, lineHeight: "32px", fontWeight: 800, color: c.text }}>{streakOf(s, me)}</div>
              <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>day streak · back tomorrow</div>
            </div>
          )}
        </div>
        {card ? (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {flipped ? (
              <>
                <Button kind="secondary" wide onClick={() => answer(false)}>
                  Missed it
                </Button>
                <Button kind="primary" wide onClick={() => answer(true)}>
                  Got it
                </Button>
              </>
            ) : (
              <Button kind="primary" wide onClick={() => { haptic("light"); setLocal({ flip: card.id }); }}>
                Flip card
              </Button>
            )}
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, marginTop: 6, minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
          {ranks.map((r) => (
            <span key={r.who} style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0, borderRadius: 99, boxShadow: r.who === me ? `0 0 0 2px ${c.primary}` : "none" }}>
              <Avatar user={{ id: r.who, name: r.name }} size={22} />
              <svg width={10} height={13} viewBox="0 0 10 13" aria-hidden="true"><path d="M5 0 C 7 4 10 5 10 8.5 C 10 11 7.8 13 5 13 C 2.2 13 0 11 0 8.5 C 0 6 2 5 3 3 C 3.6 5 4.4 5 5 0 Z" fill={pal(theme).orange} /></svg>
              <span style={{ fontSize: 13, lineHeight: "16px", fontWeight: 700, color: c.text, paddingRight: 4 }}>{r.days}</span>
            </span>
          ))}
          {ranks.length ? null : <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>No streaks yet</span>}
          </div>
          <span style={{ flexShrink: 0 }}><Button kind="deemphasized" onClick={() => setLocal({ writing: !local.writing })}>
            {local.writing ? "Close" : `Write a card`}
          </Button></span>
        </div>
        {local.writing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            <input aria-label="Front of the card" placeholder="Question" value={local.q} maxLength={80} onInput={(e: Event) => setLocal({ q: (e.currentTarget as HTMLInputElement).value })} />
            <div style={{ display: "flex", gap: 8 }}>
              <input aria-label="Back of the card" placeholder="Answer" value={local.a} maxLength={60} style={{ flex: 1, minWidth: 0 }} onInput={(e: Event) => setLocal({ a: (e.currentTarget as HTMLInputElement).value })} onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && add()} />
              <Button kind="secondary" disabled={!local.q.trim() || !local.a.trim()} onClick={add}>
                Add
              </Button>
            </div>
            <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>{`You've written ${written} of ${s.each}`}</div>
          </div>
        ) : quote && !local.toast ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <b style={{ fontSize: 13, lineHeight: "16px", color: c.text, flexShrink: 0 }}>{first(quote.name)}</b>
            <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, minWidth: 0, ...ell }}>{`“${quote.said}”`}</span>
          </div>
        ) : null}
        {local.toast > 0 ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
