import { defineApp, Avatar, Burst, Button, CardHeader, Facepile, More, Ring, haptic, mix, pal, running, tween, type Theme } from "@muse/app";

// Tier list post: a friend asks everyone to rank a few things from S to D. Drop a token on each row,
// post, and the feed's hidden votes rain in as heat bars with friends' faces; your token gets a
// check where you agree with the feed and a flame for a spicy take.

type Params = {
  /** Post title, e.g. "Rank the dining halls" */
  title: string;
  /** Who posted it, e.g. "Jordan" */
  author: string;
  /** 2 to 6 things to rank: name and the feed's votes per tier [S, A, B, C, D] from outside this chat */
  items: { name: string; votes: number[] }[];
  /** Chat members who already posted: name and a tier letter per item */
  people: { name: string; tiers: string[] }[];
};

// @params
const P: Params = {
  title: "Rank the dining halls",
  author: "Jordan",
  items: [
    { name: "Crossroads", votes: [9, 15, 9, 3, 1] },
    { name: "Café 3", votes: [2, 7, 14, 9, 4] },
    { name: "Foothill", votes: [17, 13, 5, 2, 0] },
    { name: "Clark Kerr", votes: [4, 10, 11, 8, 4] },
    { name: "GBC Late Night", votes: [12, 6, 6, 8, 5] },
    { name: "Pat Brown's", votes: [1, 4, 9, 13, 10] },
  ],
  people: [
    { name: "Noa", tiers: ["A", "B", "S", "B", "S", "C"] },
    { name: "Dev", tiers: ["A", "C", "A", "B", "C", "D"] },
    { name: "Priya", tiers: ["B", "B", "S", "C", "D", "C"] },
  ],
};
// @end params

type Item = { name: string; votes: number[] };
type State = {
  title: string;
  author: string;
  items: Item[];
  /** per user, per item: tier 0..4 (S..D), or -1 when not placed */
  picks: { [user: string]: number[] };
  /** user -> meta.time of posting (0 if seeded) */
  posted: { [user: string]: number };
};
type Action = { t: "place"; item: number; tier: number } | { t: "post" };
type Local = Record<string, never>;
type Ctx = { members: { id: string; name?: string }[] };

const TIERS = ["S", "A", "B", "C", "D"];
const MAX_ITEMS = 6;
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const clampVotes = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(10_000, Math.floor(n))) : 0);

const tally = (s: State, i: number): number[] =>
  [0, 1, 2, 3, 4].map((k) => (s.items[i]?.votes[k] ?? 0) + Object.keys(s.posted).filter((u) => s.picks[u]?.[i] === k).length);
/** The tier with the most votes; ties go to the better tier. */
const consensus = (s: State, i: number): number => {
  const t = tally(s, i);
  return t.indexOf(Math.max(...t));
};
const feedTotal = (s: State) => (s.items[0]?.votes ?? []).reduce((a, b) => a + b, 0);
const placedCount = (p: number[] | undefined) => (p ?? []).filter((k) => k >= 0).length;

const grow = tween({ duration: 600, easing: "decelerate" });
const drop = tween({ duration: 450, easing: [0.34, 1.56, 0.64, 1] });
const pop = tween({ duration: 400, easing: [0.34, 1.56, 0.64, 1] });
const fill = tween({ duration: 800, easing: "decelerate" });
/** 0..1 progress of an animation that starts `delay` ms after `start`; 1 once settled or when seeded. */
const prog = (start: number, delay: number, mo: (e: number) => number): number => {
  if (!start) return 1;
  const dur = (mo as unknown as { duration: number }).duration;
  const e = running(start + delay, dur);
  return e === null ? 1 : mo(e);
};

// ---- Color helpers (contrast choice for letters on tier pills) ----

function channels(col: string): number[] {
  const hex = col.trim().replace(/^#/, "");
  if (col.trim().startsWith("#") && (hex.length === 6 || hex.length === 3)) {
    const f = hex.length === 3 ? hex.split("").map((x) => x + x).join("") : hex;
    return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
  }
  return (col.match(/[\d.]+/g) ?? ["0", "0", "0"]).slice(0, 3).map(Number);
}
function luminance(col: string): number {
  const [r, g, b] = channels(col).map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** Letter color for a tier pill; when neither text nor card reaches 4.5:1 the pill itself shifts toward the other one. */
function pill(bg: string, theme: Theme): { bg: string; ink: string } {
  const c = theme.color;
  const ink = contrast(c.text, bg) >= contrast(c.card, bg) ? c.text : c.card;
  const away = ink === c.text ? c.card : c.text;
  let out = bg;
  for (let t = 0; t <= 1 && contrast(ink, out) < 4.6; t += 0.05) out = mix(bg, away, t);
  return { bg: out, ink };
}

const FLAME = "M8 1c.4 2.2 3.4 3.8 3.4 7.2A3.4 3.4 0 0 1 8 11.6a3.4 3.4 0 0 1-3.4-3.4c0-1.2.6-2 1.2-2.7.1.9.6 1.4 1.1 1.5C6.6 4.6 7 2.6 8 1z";

function Flame(p: { size: number; fill: string }) {
  return (
    <svg width={p.size} height={p.size} viewBox="0 0 16 16" aria-hidden="true" style={{ display: "block", flex: "none" }}>
      <path d={FLAME} fill={p.fill} />
    </svg>
  );
}

// ---- Reducer side ----

function reduceTier(s: State, a: Record<string, unknown>, user: string, meta: { time: number }): State {
  if (a.t === "place") {
    const item = a.item, tier = a.tier;
    if (user in s.posted) return s;
    if (typeof item !== "number" || !Number.isInteger(item) || item < 0 || item >= s.items.length) return s;
    if (typeof tier !== "number" || !Number.isInteger(tier) || tier < 0 || tier > 4) return s;
    const mine = s.picks[user] ?? s.items.map(() => -1);
    if (mine[item] === tier) return s;
    return { ...s, picks: { ...s.picks, [user]: mine.map((k, i) => (i === item ? tier : k)) } };
  }
  if (a.t === "post") {
    if (user in s.posted) return s;
    const mine = s.picks[user];
    if (!mine || mine.some((k) => k < 0)) return s;
    return { ...s, posted: { ...s.posted, [user]: meta.time } };
  }
  return s;
}

export default defineApp<State, Action, Local>({
  name: "Tier list post",
  summary: (s) => {
    let best = 0;
    s.items.forEach((_, i) => {
      if (tally(s, i)[0]! > tally(s, best)[0]!) best = i;
    });
    return `${s.title}: ${Object.keys(s.posted).length} friends posted · ${s.items[best]?.name ?? ""} leads S tier`;
  },

  init: (ctx) => {
    const named = P.items.filter((x) => typeof x.name === "string" && x.name.trim()).slice(0, MAX_ITEMS);
    const items: Item[] = named.map((x) => ({
      name: x.name.trim().slice(0, 32),
      votes: [0, 1, 2, 3, 4].map((k) => clampVotes(x.votes?.[k])),
    }));
    const list: Item[] = items.length >= 2 ? items : [{ name: "Option 1", votes: [0, 0, 0, 0, 0] }, { name: "Option 2", votes: [0, 0, 0, 0, 0] }];
    const picks: { [u: string]: number[] } = {};
    const posted: { [u: string]: number } = {};
    if (items.length >= 2) {
      for (const person of P.people) {
        const want = person.name.trim().toLowerCase();
        const m = ctx.members.find((x) => x.id === person.name || (x.name ?? "").toLowerCase() === want);
        if (!m || m.id in picks) continue;
        const ks = list.map((_, i) => TIERS.indexOf(String(person.tiers?.[i] ?? "").trim().toUpperCase()));
        if (ks.some((k) => k < 0)) continue;
        picks[m.id] = ks;
        posted[m.id] = 0;
      }
    }
    return { title: P.title.trim().slice(0, 48) || "Tier list", author: P.author.trim().slice(0, 16), items: list, picks, posted };
  },

  reduce: (state, action, meta, ctx) => (inChat(ctx, meta.user) ? reduceTier(state, action as unknown as Record<string, unknown>, meta.user, meta) : state),

  onMembers: (state, ctx) => {
    const here = (u: string) => inChat(ctx, u);
    if (Object.keys(state.picks).every(here) && Object.keys(state.posted).every(here)) return state;
    const keep = <T,>(o: { [u: string]: T }) => Object.fromEntries(Object.entries(o).filter(([u]) => here(u)));
    return { ...state, picks: keep(state.picks), posted: keep(state.posted) };
  },

  invariants: {
    "picks fit the list": (s, ctx) =>
      Object.entries(s.picks).every(([u, p]) => inChat(ctx, u) && p.length === s.items.length && p.every((k) => Number.isInteger(k) && k >= -1 && k <= 4)),
    "only complete rankings are posted": (s) => Object.keys(s.posted).every((u) => !!s.picks[u] && s.picks[u]!.every((k) => k >= 0)),
    "posters are chat members": (s, ctx) => Object.keys(s.posted).every((u) => inChat(ctx, u)),
  },

  transitions: {
    "placing moves only the actor's token on that row": (p, n, a, m) => {
      if (a.t !== "place" || p === n) return true;
      const before = p.picks[m.user] ?? p.items.map(() => -1);
      const after = n.picks[m.user];
      const others = (x: State) => JSON.stringify(Object.entries(x.picks).filter(([u]) => u !== m.user));
      return !(m.user in p.posted) && !!after && after[a.item] === a.tier && before.every((k, i) => i === a.item || k === after[i]) && others(p) === others(n);
    },
    "posting is final and needs every row": (p, n, a, m) =>
      a.t !== "post" || p === n || (!(m.user in p.posted) && n.posted[m.user] === m.time && !!n.picks[m.user] && n.picks[m.user]!.every((k) => k >= 0)),
    "a posted ranking never changes": (p, n) => Object.keys(p.posted).every((x) => !(x in n.picks) || JSON.stringify(p.picks[x]) === JSON.stringify(n.picks[x])),
    "the feed's votes never change": (p, n) => JSON.stringify([p.items, p.title, p.author]) === JSON.stringify([n.items, n.title, n.author]),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const mine = s.picks[user];
    const k = r.next();
    const unplaced = mine ? mine.findIndex((x) => x < 0) : 0;
    if (user in s.posted) return k < 0.5 ? { t: "place", item: r.int(s.items.length), tier: r.int(5) } : { t: "post" };
    if (!mine || unplaced >= 0) {
      if (k < 0.85) return { t: "place", item: unplaced >= 0 ? unplaced : r.int(s.items.length), tier: r.int(5) };
      return { t: "post" };
    }
    return k < 0.5 ? { t: "post" } : { t: "place", item: r.int(s.items.length), tier: r.int(5) };
  },

  view: ({ state, me, members, dispatch, theme }) => {
    const c = theme.color;
    const W = theme.width - 24;
    const NW = W < 360 ? 92 : 108;
    const cw = (W - NW) / 5;
    const n = state.items.length;
    const tierColor = [c.series1, c.series2, c.series3, c.series4, c.secondaryText];
    const pills = tierColor.map((x) => pill(x, theme));
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    const iPosted = me in state.posted;
    const mine = state.picks[me];
    const placed = placedCount(mine);
    const firstOpen = !iPosted ? (mine ? mine.findIndex((k) => k < 0) : 0) : -1;
    const at0 = state.posted[me] ?? 0;
    const others = Object.keys(state.posted).filter((u) => u !== me && members.some((m) => m.id === u));
    const posters = Object.keys(state.posted).length;
    const feed = feedTotal(state);
    const cons = state.items.map((_, i) => consensus(state, i));
    const agree = mine ? cons.filter((k, i) => mine[i] === k).length : 0;
    let spicyI = 0;
    let spicyD = -1;
    cons.forEach((k, i) => {
      const d = mine ? Math.abs((mine[i] ?? 0) - k) : 0;
      if (d > spicyD) {
        spicyD = d;
        spicyI = i;
      }
    });

    const label = { fontSize: 11, lineHeight: "14px", color: c.secondaryText } as const;
    const ellipsis = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

    const row = (it: Item, i: number) => {
      const pick = mine?.[i] ?? -1;
      const t = iPosted ? tally(state, i) : [];
      const max = Math.max(1, ...t);
      const sub = iPosted ? `Feed: ${TIERS[cons[i]!]}` : pick >= 0 ? `You: ${TIERS[pick]}` : "Tap a tier";
      const lead = firstOpen === i;
      const diff = pick >= 0 && iPosted ? Math.abs(pick - cons[i]!) : 0;
      return (
        <div key={i} style={{ height: 42, flex: "none" }}>
          <div style={{ position: "relative", height: 38, borderRadius: 12, background: c.wash }}>
            {lead ? (
              <div
                key="lead"
                aria-hidden="true"
                ref={(el: Element) => {
                  (el as HTMLElement).animate?.([{ opacity: 0.25 }, { opacity: 0.75 }], { duration: 1600, direction: "alternate", iterations: Infinity, easing: "ease-in-out" });
                }}
                style={{ position: "absolute", inset: 0, borderRadius: 12, boxShadow: `inset 0 0 0 1px ${c.primary}`, pointerEvents: "none" }}
              />
            ) : null}
            <div style={{ position: "absolute", left: 12, top: 9, width: NW - 4, ...ellipsis, fontSize: 14, lineHeight: "16px", fontWeight: 600, color: c.text }}>{it.name}</div>
            <div style={{ position: "absolute", left: 12, top: 26, width: NW - 14, ...ellipsis, ...label, lineHeight: "12px" }}>{sub}</div>
            {[1, 2, 3, 4].map((k) => (
              <span key={`d${k}`} aria-hidden="true" style={{ position: "absolute", left: NW + k * cw, top: 8, bottom: 8, width: 1, background: c.divider }} />
            ))}
            {TIERS.map((letter, k) => {
              const left = NW + k * cw;
              const hw = Math.max(cw, 44);
              if (!iPosted) {
                return (
                  <button
                    key={k}
                    type="button"
                    aria-label={`${it.name} in ${letter}`}
                    onClick={() => {
                      haptic("light");
                      dispatch({ t: "place", item: i, tier: k });
                    }}
                    style={{ position: "absolute", left: left + cw / 2 - hw / 2, top: -3, width: hw, height: 44, padding: 0, border: 0, background: "none", cursor: "pointer" }}
                  />
                );
              }
              const share = t[k]! / max;
              const e = prog(at0, 150 + 90 * i, grow);
              const h = t[k]! > 0 ? Math.max(2, 32 * share * e) : 0;
              const faces = others.filter((u) => state.picks[u]?.[i] === k);
              const shown = faces.length > 3 ? faces.slice(0, 2) : faces;
              const extra = faces.length - shown.length;
              const isCons = cons[i] === k;
              const mineHere = pick === k;
              return (
                <div key={k} style={{ position: "absolute", left, top: 0, width: cw, height: 38 }}>
                  <div style={{ position: "absolute", inset: 3, borderRadius: 6, boxShadow: isCons ? `inset 0 0 0 1px ${tierColor[k]}` : "none" }} />
                  <div style={{ position: "absolute", left: 3, right: 3, bottom: 3, height: h, borderRadius: 6, background: tierColor[k], opacity: 0.22 + 0.4 * share }} />
                  {mineHere ? null : (
                    <span key="plate" style={{ position: "absolute", top: 4, right: 4, minWidth: 12, height: 12, padding: "0 3px", boxSizing: "border-box", borderRadius: 6, background: c.card, color: c.text, fontSize: 9.5, lineHeight: "12px", fontWeight: 600, textAlign: "center" }}>
                      {t[k]}
                    </span>
                  )}
                  {shown.map((u, j) => {
                    const f = prog(at0, 400 + 90 * i + 50 * j, drop);
                    return (
                      <span key={u} style={{ position: "absolute", left: 5 + j * 8, bottom: 4, width: 14, height: 14, lineHeight: 0, borderRadius: 99, boxShadow: `0 0 0 1.5px ${c.card}`, display: "block", transform: `translateY(${-20 * (1 - f)}px)`, opacity: Math.min(1, f * 3) }}>
                        <Avatar user={u} size={14} />
                      </span>
                    );
                  })}
                  {extra > 0 ? (
                    <span key="more" style={{ position: "absolute", left: 5 + shown.length * 8, bottom: 4, display: "block" }}>
                      <More n={extra} size={14} />
                    </span>
                  ) : null}
                </div>
              );
            })}
            {pick >= 0 ? (
              <span
                key="token"
                style={{
                  position: "absolute",
                  left: NW + pick * cw + cw / 2 - 13,
                  top: iPosted ? 1 : 6,
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  boxShadow: `0 0 0 2px ${tierColor[pick]}`,
                  display: "block",
                  transition: "left 300ms cubic-bezier(.34,1.56,.64,1), top 300ms ease",
                  pointerEvents: "none",
                }}
              >
                <Avatar user={me} size={26} />
                {iPosted && diff === 0 ? (
                  <span key="ok" role="img" aria-label="Matches the feed" style={{ position: "absolute", left: 11, top: -10, width: 15, height: 15, borderRadius: 8, background: c.positive, display: "grid", placeItems: "center", transform: `scale(${prog(at0, 800 + 90 * i, pop)})` }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={c.card} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                ) : null}
                {iPosted && diff >= 2 ? (
                  <span key="hot" role="img" aria-label="Spicy take" style={{ position: "absolute", left: 11, top: -10, width: 16, height: 16, borderRadius: 8, background: c.text, display: "grid", placeItems: "center", transform: `scale(${prog(at0, 800 + 90 * i, pop)})` }}>
                    <Flame size={11} fill={pal(theme).orange} />
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
        </div>
      );
    };

    const matchCard = (() => {
      const mi = mine?.[spicyI] ?? 0;
      const second =
        spicyD >= 2 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
            <Flame size={10} fill={pal(theme).orange} />
            <span style={{ ...ellipsis, fontSize: 12, lineHeight: "16px", color: c.secondaryText }}>{`Spiciest: ${state.items[spicyI]?.name} in ${TIERS[mi]} (feed says ${TIERS[cons[spicyI]!]})`}</span>
          </div>
        ) : (
          <div style={{ ...ellipsis, fontSize: 12, lineHeight: "16px", color: c.secondaryText }}>{`No spicy takes. ${state.author || "The poster"} approves.`}</div>
        );
      const names = others.slice(0, 2).map(nameOf).join(", ");
      const more = others.length - 2;
      const third = others.length ? `${names}${more > 0 ? ` +${more}` : ""} also ranked` : "You're the first friend to post";
      return (
        <div style={{ position: "relative", height: 76, boxSizing: "border-box", borderRadius: 12, background: c.wash, border: `1px solid ${c.divider}` }}>
          {at0 ? <Burst key={at0} emoji="👍" count={8} /> : null}
          <div style={{ position: "absolute", left: 12, top: 13 }}>
            <Ring value={agree * prog(at0, 1200, fill)} max={n} size={48} label={`You match the feed on ${agree} of ${n}`}>{`${agree}/${n}`}</Ring>
          </div>
          <div style={{ position: "absolute", left: 76, right: 12, top: 10, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ ...ellipsis, fontSize: 14, lineHeight: "20px", fontWeight: 600, color: c.text }}>{`Posted. You match the feed on ${agree} of ${n}`}</div>
            {second}
            <div style={{ ...ellipsis, fontSize: 12, lineHeight: "16px", color: c.secondaryText }}>{third}</div>
          </div>
        </div>
      );
    })();

    const posterIds = Object.keys(state.posted).filter((u) => members.some((m) => m.id === u));
    const footer = iPosted ? (
      <div style={{ height: 80, boxSizing: "border-box", paddingTop: 4 }}>{matchCard}</div>
    ) : (
      <div style={{ height: 68, boxSizing: "border-box", paddingTop: 4 }}>
        <div style={{ height: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>{`${placed} of ${n} ranked`}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {posterIds.length ? <Facepile users={posterIds} max={4} size={20} /> : null}
            {feed > 0 ? <More n={feed} size={20} /> : null}
          </span>
        </div>
        <div style={{ marginTop: 4, height: 36 }}>
          {placed === n ? (
            <Button
              kind="primary"
              wide
              onClick={() => {
                haptic("success");
                dispatch({ t: "post" });
              }}
            >
              Post ranking
            </Button>
          ) : (
            <div style={{ height: 36, borderRadius: 8, background: c.secondaryButton, color: c.secondaryButtonText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, lineHeight: "18px", ...ellipsis, padding: "0 8px", boxSizing: "border-box" }}>{`Rank all ${n} to see the feed's list`}</div>
          )}
        </div>
      </div>
    );

    return (
      <div>
        <CardHeader title={state.title} subtitle={iPosted ? `${feed + posters} ranked · you're in` : `${feed + posters} ranked`} />
        <div style={{ height: 26, display: "flex", alignItems: "flex-start" }}>
          <div style={{ width: NW, ...label, paddingTop: 4, boxSizing: "border-box" }}>{iPosted ? "The feed says" : "Votes hidden"}</div>
          {TIERS.map((letter, k) => (
            <div key={letter} style={{ width: cw, display: "flex", justifyContent: "center" }}>
              <span style={{ width: 30, height: 22, borderRadius: 11, background: pills[k]!.bg, color: pills[k]!.ink, display: "grid", placeItems: "center", fontSize: 15, lineHeight: "18px", fontWeight: 700 }}>{letter}</span>
            </div>
          ))}
        </div>
        {state.items.map(row)}
        {footer}
      </div>
    );
  },
});
