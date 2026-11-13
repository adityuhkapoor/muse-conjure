import {
  defineApp,
  Avatar,
  Burst,
  Button,
  CardHeader,
  Locked,
  Thumb,
  Toast,
  clock,
  haptic,
  innerWidth,
  mix,
  pal,
  running,
  thumbKind,
  tween,
} from "@muse/app";

// Co-own it: friends buy one Marketplace item together. A rotation strip says who has it which week,
// each person pays for the weeks they hold (integer cents, largest remainder), and everyone signs
// the exact plan to lock the deal. Any hand-off clears the signatures.

type Params = {
  title: string;
  item: string;
  priceCents: number;
  seller: string;
  owners: string[];
  weeks: string[];
  holders: number[];
  pickup: string;
  note: string;
};
type State = {
  title: string;
  item: string;
  price: number;
  seller: string;
  pickup: string;
  note: string;
  weeks: string[];
  owners: string[];
  holders: (string | null)[];
  changed: number[];
  signed: string[];
  lockedAt: number;
};
type Action = { t: "pass"; week: number } | { t: "sign" } | { t: "join" } | { t: "leave" };
type Local = { hint: string; bursts: number };
type Ctx = { members: { id: string; name?: string }[] };
type Share = { user: string; weeks: number; cents: number };

// @params
const P: Params = {
  title: "Co-own the projector",
  item: "Epson + 100” screen",
  priceCents: 24000,
  seller: "from Ravi · 1.8 mi",
  owners: ["Maya", "Dev", "Priya", "Noa"],
  weeks: ["Jan 6", "13", "20", "27", "Feb 3", "10", "17", "24"],
  holders: [0, 0, 0, 1, 2, 1, 3, 2],
  pickup: "Sat 2pm · Dev drives",
  note: "Maya's first · hands off Sundays",
};
// @end params

const MAX_OWNERS = 6;
const MAX_PRICE = 10_000_000;
const FLIP_MS = 350;
const SIGN_MS = 300;
const flip = tween({ duration: FLIP_MS, easing: "easeInOut" });

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => (c % 100 === 0 ? `$${c / 100}` : `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`);
const heldBy = (s: State, u: string) => s.holders.filter((h) => h === u).length;
const nextOwner = (s: State, u: string | null) => {
  const i = u === null ? -1 : s.owners.indexOf(u);
  return i < 0 ? null : s.owners[(i + 1) % s.owners.length]!;
};
const diffs = (a: (string | null)[], b: (string | null)[]) => a.flatMap((h, i) => (h === b[i] ? [] : [i]));

/** Each owner pays for the weeks they hold. Largest remainder: the leftover cents go one each to the biggest remainders. */
function shares(s: State): Share[] {
  const total = s.weeks.length;
  if (!s.owners.length || !total) return [];
  const rows = s.owners.map((user) => {
    const weeks = heldBy(s, user);
    const exact = s.price * weeks;
    return { user, weeks, base: Math.floor(exact / total), rem: exact % total };
  });
  const left = s.price - rows.reduce((t, r) => t + r.base, 0);
  const order = rows.map((_, i) => i).sort((a, b) => rows[b]!.rem - rows[a]!.rem || a - b);
  const extra = new Set(order.slice(0, Math.max(0, left)));
  return rows.map((r, i) => ({ user: r.user, weeks: r.weeks, cents: r.base + (extra.has(i) ? 1 : 0) }));
}

/** One owner out: their weeks go to the owner after them, and every signature is void. */
function drop(s: State, user: string): State {
  const i = s.owners.indexOf(user);
  if (i < 0) return s;
  const next = s.owners.length > 1 ? s.owners[(i + 1) % s.owners.length]! : null;
  return { ...s, owners: s.owners.filter((u) => u !== user), holders: s.holders.map((h) => (h === user ? next : h)), signed: [] };
}

export default defineApp<State, Action, Local>({
  name: "Co-own it",
  summary: (s, ctx) => {
    const n = s.owners.length;
    if (!n) return `${s.item}: nobody's in yet`;
    if (s.lockedAt > 0) {
      const top = [...shares(s)].sort((a, b) => b.cents - a.cents)[0]!;
      return `${s.item}: co-owned by ${n} · ${ctx.members.find((m) => m.id === top.user)?.name ?? "Someone"} pays ${money(top.cents)}`;
    }
    return `${s.item}: ${n} owners · ${s.signed.length} of ${n} signed`;
  },

  init: (ctx) => {
    const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
    const weeks = P.weeks.slice(0, 8).map((w, i) => text(w, 6) || `Wk ${i + 1}`);
    while (weeks.length < 4) weeks.push(`Wk ${weeks.length + 1}`);
    const owners: string[] = [];
    const idxToOwner = new Map<number, string>();
    P.owners.forEach((name, i) => {
      const want = String(name).trim().toLowerCase();
      const m = want ? ctx.members.find((x) => x.id === name || (x.name ?? "").toLowerCase() === want) : undefined;
      if (!m || owners.includes(m.id) || owners.length >= MAX_OWNERS) return;
      owners.push(m.id);
      idxToOwner.set(i, m.id);
    });
    const holders = weeks.map((_, w) => (owners.length ? (idxToOwner.get(P.holders[w] ?? -1) ?? owners[w % owners.length]!) : null));
    return {
      title: text(P.title, 40) || "Co-own it",
      item: text(P.item, 40) || "Item",
      price: Number.isInteger(P.priceCents) && P.priceCents >= 0 && P.priceCents <= MAX_PRICE ? P.priceCents : 0,
      seller: text(P.seller, 40),
      pickup: text(P.pickup, 40),
      note: text(P.note, 48),
      weeks,
      owners,
      holders,
      changed: weeks.map(() => 0),
      signed: [],
      lockedAt: 0,
    };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const owner = s.owners.includes(m.user);
    if (a.t === "sign") {
      if (s.lockedAt > 0 || !owner || s.signed.includes(m.user) || s.owners.length < 2 || s.owners.some((o) => heldBy(s, o) < 1)) return s;
      const signed = [...s.signed, m.user];
      return { ...s, signed, lockedAt: signed.length === s.owners.length ? m.time : 0 };
    }
    if (s.lockedAt > 0) return s;
    if (a.t === "pass") {
      if (!owner || s.owners.length < 2 || !Number.isInteger(a.week) || a.week < 0 || a.week >= s.weeks.length) return s;
      const to = nextOwner(s, s.holders[a.week] ?? null);
      if (to === null) return s;
      return { ...s, holders: s.holders.map((h, i) => (i === a.week ? to : h)), changed: s.changed.map((c, i) => (i === a.week ? m.time : c)), signed: [] };
    }
    if (a.t === "join") {
      if (owner || s.owners.length >= MAX_OWNERS) return s;
      const first = s.owners.length === 0;
      return {
        ...s,
        owners: [...s.owners, m.user],
        holders: first ? s.holders.map(() => m.user) : s.holders,
        changed: first ? s.changed.map(() => m.time) : s.changed,
        signed: [],
      };
    }
    if (a.t === "leave") return owner ? drop(s, m.user) : s;
    return s;
  },

  // An owner left the chat: same as leaving, even when locked; a locked plan with fewer than two owners reopens.
  onMembers: (s, ctx) => {
    const gone = s.owners.filter((u) => !inChat(ctx, u));
    if (!gone.length) return s;
    const n = gone.reduce((t, u) => drop(t, u), s);
    if (s.lockedAt === 0) return n;
    return n.owners.length >= 2 ? { ...n, signed: s.signed.filter((u) => n.owners.includes(u)) } : { ...n, lockedAt: 0, signed: [] };
  },

  invariants: {
    "every week is held by an owner": (s) => (s.owners.length === 0 ? s.holders.every((h) => h === null) : s.holders.every((h) => h !== null && s.owners.includes(h))),
    "owners are in the chat, once each, at most 6": (s, ctx) => s.owners.length <= MAX_OWNERS && new Set(s.owners).size === s.owners.length && s.owners.every((u) => inChat(ctx, u)),
    "shares add up to the price": (s) => s.owners.length === 0 || shares(s).reduce((t, x) => t + x.cents, 0) === s.price,
    "shares follow the weeks": (s) => {
      const sh = shares(s);
      return sh.every((a) => (a.weeks === 0 ? a.cents === 0 : true) && sh.every((b) => a.weeks <= b.weeks || a.cents >= b.cents));
    },
    "signers are owners, once each": (s) => new Set(s.signed).size === s.signed.length && s.signed.every((u) => s.owners.includes(u)),
    "locked exactly when every owner signed": (s) => (s.lockedAt > 0) === (s.owners.length >= 2 && s.signed.length === s.owners.length),
    "a locked plan gives everyone a week": (s) => s.lockedAt === 0 || s.owners.every((o) => heldBy(s, o) >= 1),
    "weeks and holders line up": (s) => s.weeks.length >= 4 && s.weeks.length <= 8 && s.holders.length === s.weeks.length && s.changed.length === s.weeks.length,
  },

  transitions: {
    "pass hands one week to the next owner and clears signatures": (p, n, a, m) => {
      if (a.t !== "pass" || p === n) return true;
      const d = diffs(p.holders, n.holders);
      return d.length === 1 && d[0] === a.week && n.holders[a.week] === nextOwner(p, p.holders[a.week] ?? null) && n.signed.length === 0 && n.changed[a.week] === m.time;
    },
    "a locked plan does not change hands": (p, n, a) => p.lockedAt === 0 || a.t === "sign" || JSON.stringify(p.holders) === JSON.stringify(n.holders),
    "signing adds only the actor; the last signature locks at that moment": (p, n, a, m) =>
      a.t !== "sign" || p === n || (n.signed.length === p.signed.length + 1 && n.signed.at(-1) === m.user && (n.lockedAt === 0 || n.lockedAt === m.time)),
    "joining adds the actor as the last owner": (p, n, a, m) => {
      if (a.t !== "join" || p === n) return true;
      const first = p.owners.length === 0;
      return (
        n.owners.at(-1) === m.user &&
        JSON.stringify(n.owners.slice(0, -1)) === JSON.stringify(p.owners) &&
        n.signed.length === 0 &&
        (first ? n.holders.every((h) => h === m.user) && n.changed.every((c) => c === m.time) : JSON.stringify(n.holders) === JSON.stringify(p.holders))
      );
    },
    "leaving hands the actor's weeks to the next owner": (p, n, a, m) => {
      if (a.t !== "leave" || p === n) return true;
      const to = nextOwner(p, m.user);
      return (
        !n.owners.includes(m.user) &&
        JSON.stringify(n.owners) === JSON.stringify(p.owners.filter((u) => u !== m.user)) &&
        n.signed.length === 0 &&
        p.holders.every((h, i) => n.holders[i] === (h === m.user ? (p.owners.length > 1 ? to : null) : h))
      );
    },
    "only people in the chat change the plan": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (s.lockedAt > 0) return { t: "sign" };
    if (!s.owners.includes(user)) return r.next() < 0.7 ? { t: "join" } : { t: "pass", week: r.int(s.weeks.length) };
    const k = r.next();
    if (s.owners.every((o) => heldBy(s, o) >= 1) && !s.signed.includes(user) && k < 0.5) return { t: "sign" };
    const j = r.next();
    if (j < 0.7) return { t: "pass", week: r.int(s.weeks.length) };
    if (j < 0.82) return { t: "sign" };
    if (j < 0.92) return { t: "leave" };
    return { t: "join" };
  },

  local: { hint: "", bursts: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = innerWidth();
    const now = clock.value;
    const narrow = theme.width < 340;
    const dark = theme.mode === "dark";
    const palette = [c.primary, c.series3, c.series2, c.series4, c.series6, c.series5];
    const colorOf = (u: string | null) => (u === null ? c.divider : palette[Math.max(0, state.owners.indexOf(u)) % 6]!);
    const inkOf = (u: string | null) => (u !== null && state.owners.indexOf(u) <= 0 ? c.onPrimary : dark ? c.wash : c.text);
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    const first = (id: string) => nameOf(id).split(" ")[0]!;
    const T = state.weeks.length;
    const n = state.owners.length;
    const amOwner = state.owners.includes(me);
    const locked = state.lockedAt > 0;
    const sh = shares(state);
    const mine = sh.find((x) => x.user === me);
    const perWeek = T ? Math.round(state.price / T) : 0;
    const allHave = state.owners.every((o) => heldBy(state, o) >= 1);

    const sign = () => {
      if (n < 2) return setLocal({ hint: "Add a co-owner first" });
      if (!allHave) return setLocal({ hint: "Everyone needs a week" });
      if (state.signed.length + 1 === n) {
        setLocal({ bursts: local.bursts + 1, hint: "" });
        haptic("success");
      } else setLocal({ hint: "" });
      dispatch({ t: "sign" });
    };

    // ---- Item ----
    const projector = /projector|screen/i.test(state.item);
    const sun = Math.sin(0.8 * (now / 1000));
    const photo = projector ? (
      (() => {
        const w = 150, hgt = 104, wallH = hgt * 0.74;
        const sx = w * 0.42, sTop = 10, sBot = hgt * 0.66, sRight = w - 10;
        const ix = sx + 3, iy = sTop + 4 + 3, iw = sRight - sx - 6, ih = sBot - iy - 3;
        const bw = w * 0.3, bh = hgt * 0.2, bx = 10, by = hgt * 0.62;
        const lensX = bx + bw - 7, lensY = by + bh / 2, lr = 0.32 * bh;
        return (
          <svg width="100%" height="100%" viewBox={`0 0 ${w} ${hgt}`} role="img" aria-label="Photo of the projector and screen" style={{ display: "block" }}>
            <clipPath id="sp-photo">
              <rect x={0} y={0} width={w} height={hgt} rx={9} />
            </clipPath>
            <clipPath id="sp-sun">
              <rect x={ix} y={iy} width={iw} height={ih} />
            </clipPath>
            <g clip-path="url(#sp-photo)">
              <rect x={0} y={0} width={w} height={wallH} fill={p.dark} />
              <rect x={0} y={wallH} width={w} height={hgt - wallH} fill={p.crust} />
              <line x1={0} y1={wallH} x2={w} y2={wallH} stroke={p.brown} stroke-width={1.5} />
              <path d={`M${lensX} ${lensY} L${sx} ${sTop + 4} L${sx} ${sBot} Z`} fill={p.cream} opacity={0.18} />
              <rect x={sx} y={sTop} width={sRight - sx} height={4} fill={p.soft} />
              <rect x={sx} y={sTop + 4} width={sRight - sx} height={sBot - sTop - 4} fill={p.paper} />
              <rect x={ix} y={iy} width={iw} height={ih * 0.55} fill={p.blue} />
              <rect x={ix} y={iy + ih * 0.55} width={iw} height={ih * 0.45} fill={p.orange} />
              <circle cx={ix + iw / 2 + sun * iw * 0.2} cy={iy + ih * 0.55} r={ih * 0.18} fill={p.yellow} clip-path="url(#sp-sun)" />
              <rect x={bx} y={by} width={bw} height={bh} rx={4} fill={p.paper} stroke={p.rim} stroke-width={1} />
              <circle cx={lensX} cy={lensY} r={lr} fill={p.soft} />
              <circle cx={lensX} cy={lensY} r={lr * 0.55} fill={p.sky} />
              <rect x={bx + 6} y={by + 5} width={6} height={2} fill={p.green} />
            </g>
          </svg>
        );
      })()
    ) : (
      <div style={{ height: "100%", borderRadius: 9, background: c.wash, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Thumb kind={thumbKind(state.item, "gift")} seed={state.item} size={88} />
      </div>
    );
    const ownersRow = n ? (
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span style={{ display: "flex", flex: "none", paddingLeft: 2 }}>
          {state.owners.map((u, i) => (
            <span key={u} style={{ display: "flex", borderRadius: "50%", boxShadow: `0 0 0 2px ${colorOf(u)}`, marginLeft: i ? 0 : 0, marginRight: 2 }}>
              <Avatar user={u} size={18} />
            </span>
          ))}
        </span>
        {narrow ? null : <span style={{ fontSize: 12, color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>Going in</span>}
      </div>
    ) : (
      <span style={{ fontSize: 12, lineHeight: "18px", color: c.secondaryText }}>Nobody's in yet</span>
    );
    const item = (
      <div style={{ display: "flex", gap: 12, height: 112, borderRadius: 12, background: c.wash, padding: 4, minWidth: 0 }}>
        <div style={{ width: 150, height: 104, flex: "none", borderRadius: 9, overflow: "hidden" }}>{photo}</div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "4px 8px 6px 0" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 24, lineHeight: "28px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{money(state.price)}</div>
            <div style={{ fontSize: 14, lineHeight: "18px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{state.item}</div>
            <div style={{ fontSize: 12, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{state.seller || " "}</div>
          </div>
          {ownersRow}
        </div>
      </div>
    );

    // ---- Rotation ----
    const canPass = amOwner && !locked && n >= 2;
    const tw = (W - 4 * (T - 1)) / T;
    const bw = Math.max(tw, 44);
    const tile = (label: string, w: number) => {
      const u = state.holders[w] ?? null;
      const col = colorOf(u);
      const e = state.changed[w] ? running(state.changed[w]!, FLIP_MS) : null;
      const sx = e === null ? 1 : 1 - 0.6 * Math.sin(flip(e) * Math.PI);
      const to = u === null ? null : nextOwner(state, u);
      return (
        <button
          key={w}
          type="button"
          disabled={!canPass}
          aria-label={u ? `${label}, ${nameOf(u)}${canPass && to ? `. Pass to ${nameOf(to)}` : ""}` : `${label}, nobody yet`}
          onClick={() => {
            dispatch({ t: "pass", week: w });
            setLocal({ hint: "" });
          }}
          style={{ position: "absolute", top: 0, left: (tw - bw) / 2, width: bw, height: 56, padding: 0 }}
        >
         <span style={{ position: "absolute", top: 0, left: (bw - tw) / 2, width: tw, height: 56, borderRadius: 8, overflow: "hidden", background: u ? mix(col, c.card, 0.78) : c.wash, transform: sx === 1 ? undefined : `scaleX(${sx})` }}>
          <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 5, background: u ? col : c.divider }} />
          <span style={{ position: "absolute", left: "50%", top: 10, transform: "translateX(-50%)", display: "flex", borderRadius: "50%", boxShadow: u ? `0 0 0 2px ${col}` : undefined, width: narrow ? 18 : 20, height: narrow ? 18 : 20, border: u ? undefined : `1.5px dashed ${c.divider}` }}>
            {u ? <Avatar user={u} size={narrow ? 18 : 20} /> : null}
          </span>
          {u ? (
            <span style={{ position: "absolute", left: 0, right: 0, bottom: 7, fontSize: narrow ? 10 : 11, lineHeight: "14px", color: c.text, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
          ) : null}
         </span>
        </button>
      );
    };
    const rotation = (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, height: 22 }}>
          <span style={{ fontSize: 13, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>Who has it when</span>
          {canPass ? <span style={{ fontSize: 12, color: c.link, whiteSpace: "nowrap", flex: "none" }}>Tap a week to pass it</span> : null}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${T}, minmax(0, 1fr))`, gap: 4 }}>
          {state.weeks.map((label, w) => (
            <div key={w} style={{ position: "relative", height: 56, minWidth: 0 }}>
              {tile(label, w)}
            </div>
          ))}
        </div>
        <div style={{ height: 18, paddingLeft: Math.max(0, tw / 2 - 20) }}>
          <span style={{ display: "inline-block", fontSize: 11, lineHeight: "14px", color: c.text, whiteSpace: "nowrap", transform: `translateY(${Math.abs(Math.sin((now / 1000) * 3)) * 3}px)` }}>▲ Now</span>
        </div>
      </div>
    );

    // ---- Shares ----
    const segs = sh.filter((x) => x.weeks > 0);
    const note = local.hint
      ? local.hint
      : amOwner && mine && mine.weeks === 0
        ? "You'd pay $0 and never watch anything"
        : sh.find((x) => x.weeks === 0)
          ? `${first(sh.find((x) => x.weeks === 0)!.user)} has no weeks · pays $0?`
          : !amOwner
            ? "Go in to get weeks"
            : mine && mine.weeks === 1
              ? `You: 1 week, ${money(mine.cents)}. Cheap seats`
              : `You: ${mine?.weeks ?? 0} weeks · ${money(mine?.cents ?? 0)}`;
    const noteBad = !local.hint && sh.some((x) => x.weeks === 0);
    const shareLabel = sh.map((x) => `${nameOf(x.user)} ${money(x.cents)}`).join(", ");
    const shareBar = (
      <div>
        <div role="group" aria-label={n ? `Shares: ${shareLabel}` : "Shares: nobody yet"} style={{ display: "flex", height: 34, borderRadius: 8, background: c.wash, overflow: "hidden" }}>
          {n ? (
            segs.map((x) => {
              const ws = ((W - 2) * x.weeks) / T;
              const nm = first(x.user);
              return (
                <div
                  key={x.user}
                  style={{ flex: `${x.weeks} 1 0`, minWidth: 0, margin: 1, borderRadius: 8, background: colorOf(x.user), color: inkOf(x.user), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transition: "flex-grow 350ms", overflow: "hidden" }}
                >
                  {ws >= 22 ? (
                    <span style={{ maxWidth: "100%", padding: "0 2px", fontSize: ws > 54 ? 15 : 13, lineHeight: ws > 54 ? "16px" : "18px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{money(x.cents)}</span>
                  ) : null}
                  {ws > 54 ? <span style={{ maxWidth: "100%", padding: "0 2px", fontSize: 10.5, lineHeight: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nm}</span> : null}
                </div>
              );
            })
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: c.secondaryText }}>Nobody's in yet</div>
          )}
        </div>
        <div style={{ marginTop: 4, fontSize: 12.5, lineHeight: "16px", color: noteBad ? c.negative : c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{note}</div>
      </div>
    );

    // ---- Signatures ----
    const scribble = (i: number) =>
      Array.from({ length: 40 }, (_, k) => {
        const u = k / 39;
        return `${k ? "L" : "M"}${(u * 48).toFixed(1)} ${(9 + 2 + Math.sin(u * 19 + i * 2) * 5 * (1 - 0.4 * u)).toFixed(1)}`;
      }).join(" ");
    const sigRow =
      state.signed.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", columnGap: 0, rowGap: 4, minHeight: 40, paddingTop: 6 }}>
          {state.owners.map((u, i) => {
            const done = state.signed.includes(u);
            const delay = locked ? 150 + state.signed.indexOf(u) * SIGN_MS : 0;
            return (
              <div key={u} style={{ width: 78, height: 34, display: "flex", alignItems: "flex-end", gap: 4, flex: "none" }}>
                <span style={{ display: "flex", flex: "none", borderRadius: "50%", boxShadow: `0 0 0 2px ${done ? c.primary : c.divider}`, margin: 2 }}>
                  <Avatar user={u} size={22} />
                </span>
                <svg width={48} height={20} viewBox="0 0 48 20" aria-hidden="true" style={{ display: "block", flex: "none" }}>
                  {done ? (
                    <path
                      key={`${u}-${state.lockedAt}`}
                      d={scribble(i)}
                      fill="none"
                      stroke={c.text}
                      stroke-width={1.6}
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      pathLength={1}
                      stroke-dasharray={1}
                      ref={(el: Element) => void (el as SVGElement).animate?.([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: SIGN_MS, delay, fill: "both" })}
                    />
                  ) : null}
                  <line x1={0} y1={19.5} x2={48} y2={19.5} stroke={c.divider} stroke-width={1} />
                </svg>
              </div>
            );
          })}
          <span style={{ fontSize: 13, color: c.secondaryText, alignSelf: "center", marginLeft: 4, whiteSpace: "nowrap" }}>{`${state.signed.length} of ${n} signed`}</span>
        </div>
      ) : null;

    // ---- Footer ----
    const signed = state.signed.includes(me);
    const action = !amOwner ? (
      <Button kind={n === 0 ? "primary" : "secondary"} onClick={() => dispatch({ t: "join" })}>
        Go in
      </Button>
    ) : signed ? (
      <Button kind="secondary" disabled>
        Signed
      </Button>
    ) : (
      <Button kind="primary" onClick={sign}>
        Sign
      </Button>
    );
    const footer = locked ? (
      <Locked detail={state.pickup ? `Pickup ${state.pickup}` : undefined}>{`Co-owned by ${n}`}</Locked>
    ) : (
      <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 48 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {state.pickup ? <div style={{ fontSize: 13, lineHeight: "17px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{`Pickup: ${state.pickup}`}</div> : null}
          {state.note ? <div style={{ fontSize: 12, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{state.note}</div> : null}
        </div>
        <div style={{ flex: "none" }}>{action}</div>
      </div>
    );

    return (
      <div>
        <CardHeader title={state.title} subtitle={`${n} ${n === 1 ? "owner" : "owners"} · ${money(perWeek)}/week`} />
        {item}
        <div style={{ height: 6 }} />
        {rotation}
        <div style={{ height: 4 }} />
        {shareBar}
        {sigRow}
        {footer}
        {local.bursts > 0 && locked ? <Burst key={local.bursts} emoji="❤️" /> : null}
        {locked ? <Toast key={state.lockedAt}>{`Co-owned by ${n}`}</Toast> : null}
      </div>
    );
  },
});

