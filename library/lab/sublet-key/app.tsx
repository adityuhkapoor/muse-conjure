import {
  defineApp,
  Avatar,
  Burst,
  Button,
  Canvas,
  CardHeader,
  Toast,
  clock,
  fitText,
  haptic,
  mix,
  pal,
  running,
  type Ctx,
  type DrawFrame,
} from "@muse/app";

// Sublet key: someone is subletting their room for the summer and answering the same questions in
// the comments over and over. The key tag hangs with the dates and price on the front and the
// answers written on the back (tap to flip). People who want it hang on hooks with their mutual
// friends showing; the host hands the key to one of them and it swings over to their hook.

type Params = {
  /** Who is subletting */
  host: string;
  /** The room: "Tsai Lin's room across from 412" */
  room: string;
  dates: string;
  priceCents: number;
  /** The questions people keep asking, the answer, and how many times it was asked */
  faq: { q: string; a: string; asked: number }[];
  /** People already interested from outside the chat, with mutual friends */
  hooks: { who: string; mutuals: number; said?: string }[];
};

// @params
const P: Params = {
  host: "Tsai Lin",
  room: "her room on Pine · across the hall from 412",
  dates: "May 20 to Aug 15",
  priceCents: 65000,
  faq: [
    { q: "Furnished?", a: "yes, bed + desk + a very good lamp", asked: 9 },
    { q: "Utilities?", a: "included, wifi too", asked: 6 },
    { q: "Parking?", a: "street only, Lot C in a pinch", asked: 3 },
    { q: "Aux?", a: "the aux stays with me", asked: 2 },
  ],
  hooks: [
    { who: "Jordan", mutuals: 4, said: "is it furnished? (sorry)" },
    { who: "Priya", mutuals: 2 },
  ],
};
// @end params

type Hook = { user: string; name: string; mutuals: number; said: string; at: number };
type State = { host: string; hostName: string; room: string; dates: string; price: number; faq: { q: string; a: string; asked: number }[]; hooks: Hook[]; handed: { user: string; at: number } | null };
type Action = { t: "hang" } | { t: "hand"; user: string } | { t: "unhand" };
type Local = { back: boolean; flipAt: number; pick: string; toast: number; msg: string };

const H = 200;
const MAX_HOOKS = 6;
const FLY = 900;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => `$${Math.round(c / 100)}`;

/** Server-aligned now; the clock only ticks while read, so narrow it down with running(). */
function freshNow(): number {
  let lo = clock.value - 1;
  let hi = lo + 3_600_000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (running(mid, 1) === null) lo = mid;
    else hi = mid;
  }
  return hi;
}

function initState(ctx: Ctx): State {
  const hostName = clean(P.host, 20) || "Host";
  const hm = ctx.members.find((x) => x.id === hostName || x.name.trim().toLowerCase() === hostName.toLowerCase());
  const faq: State["faq"] = [];
  for (const f of Array.isArray(P.faq) ? P.faq : []) {
    const q = clean(f?.q, 20), a = clean(f?.a, 40);
    if (q && a && faq.length < 4) faq.push({ q, a, asked: Number.isInteger(f.asked) && f.asked >= 0 && f.asked <= 99 ? f.asked : 0 });
  }
  const hooks: Hook[] = [];
  for (const h of Array.isArray(P.hooks) ? P.hooks : []) {
    const name = clean(h?.who, 18);
    if (!name || hooks.length >= MAX_HOOKS - 1 || name.toLowerCase() === hostName.toLowerCase()) continue;
    const m = ctx.members.find((x) => x.id === name || x.name.trim().toLowerCase() === name.toLowerCase());
    const user = m ? m.id : `o:${name}`;
    if (hooks.some((x) => x.user === user)) continue;
    hooks.push({ user, name, mutuals: Number.isInteger(h.mutuals) && h.mutuals >= 0 && h.mutuals <= 99 ? h.mutuals : 0, said: clean(h.said, 40), at: 0 });
  }
  return {
    host: hm ? hm.id : `o:${hostName}`,
    hostName,
    room: clean(P.room, 48),
    dates: clean(P.dates, 24) || "This summer",
    price: Number.isInteger(P.priceCents) && P.priceCents >= 0 ? P.priceCents : 0,
    faq,
    hooks,
    handed: null,
  };
}

export default defineApp<State, Action, Local>({
  name: "Sublet key",
  summary: (s, ctx) =>
    s.handed
      ? `${s.hostName}'s sublet · key goes to ${s.hooks.find((h) => h.user === s.handed!.user)?.name ?? ctx.members.find((m) => m.id === s.handed!.user)?.name ?? "someone"}`
      : `${s.hostName}'s sublet · ${s.dates} · ${money(s.price)} a month · ${s.hooks.length} on the hooks`,

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "hang") {
      if (m.user === s.host || s.handed) return s;
      if (s.hooks.some((h) => h.user === m.user)) return { ...s, hooks: s.hooks.filter((h) => h.user !== m.user) };
      if (s.hooks.length >= MAX_HOOKS) return s;
      const name = clean(ctx.members.find((x) => x.id === m.user)?.name, 18) || "Friend";
      const mutuals = ctx.members.filter((x) => x.id !== m.user && x.id !== s.host).length;
      return { ...s, hooks: [...s.hooks, { user: m.user, name, mutuals, said: "", at: m.time }] };
    }
    if (a.t === "hand") {
      if (m.user !== s.host || s.handed || typeof a.user !== "string" || !s.hooks.some((h) => h.user === a.user)) return s;
      return { ...s, handed: { user: a.user, at: m.time } };
    }
    if (a.t === "unhand") {
      if (m.user !== s.host || !s.handed) return s;
      return { ...s, handed: null };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const hooks = s.hooks.filter((h) => h.user.startsWith("o:") || inChat(ctx, h.user));
    if (hooks.length === s.hooks.length) return s;
    return { ...s, hooks, handed: s.handed && hooks.some((h) => h.user === s.handed!.user) ? s.handed : null };
  },

  invariants: {
    "one hook each, and not too many": (s) => new Set(s.hooks.map((h) => h.user)).size === s.hooks.length && s.hooks.length <= MAX_HOOKS,
    "the host never hangs on their own hook": (s) => !s.hooks.some((h) => h.user === s.host),
    "the key goes to someone on a hook": (s) => s.handed === null || s.hooks.some((h) => h.user === s.handed!.user),
    "people on hooks are in the chat or invited": (s, ctx) => s.hooks.every((h) => h.user.startsWith("o:") || inChat(ctx, h.user)),
  },

  transitions: {
    "hanging toggles only you": (p, n, a, m) => {
      if (a.t !== "hang" || p === n) return true;
      const was = p.hooks.some((h) => h.user === m.user), is = n.hooks.some((h) => h.user === m.user);
      return was !== is && Math.abs(n.hooks.length - p.hooks.length) === 1 && (!is || n.hooks.find((h) => h.user === m.user)!.at === m.time);
    },
    "only the host hands the key": (p, n, a, m) => (a.t !== "hand" && a.t !== "unhand") || p === n || m.user === p.host,
    "handing gives it to who was picked": (p, n, a, m) => a.t !== "hand" || p === n || (n.handed?.user === a.user && n.handed.at === m.time && p.handed === null),
    "a handed key stays put while people browse": (p, n, a) => a.t === "unhand" || p.handed === null || n.handed === p.handed || !n.hooks.some((h) => h.user === p.handed!.user),
    "nobody hangs once it's handed": (p, n, a) => a.t !== "hang" || p.handed === null || n === p,
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (user === s.host || r.next() < 0.3) {
      if (s.handed && r.next() < 0.3) return { t: "unhand" };
      if (s.hooks.length) return { t: "hand", user: r.pick(s.hooks).user };
    }
    return { t: "hang" };
  },

  local: { back: false, flipAt: 0, pick: "", toast: 0, msg: "" },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const isHost = me === s.host;
    const TAGW = Math.min(170, W * 0.48);
    const PEG = W - TAGW - 18;
    const cols = 2, rows = 3;
    const hookAt = (k: number) => ({ x: TAGW + 18 + (PEG / cols) * ((k % cols) + 0.5), y: 22 + ((H - 34) / rows) * Math.floor(k / cols) });
    const flipK = local.flipAt ? running(local.flipAt, 360) : null;
    const fk = flipK === null ? 1 : flipK / 360;
    const showBack = flipK === null ? local.back : fk < 0.5 ? !local.back : local.back;
    const sx = Math.abs(Math.cos(fk * Math.PI));
    const handIdx = s.handed ? s.hooks.findIndex((h) => h.user === s.handed!.user) : -1;
    const fly = s.handed ? running(s.handed.at, FLY) : null;
    const flyE = s.handed ? (fly === null ? 1 : 1 - (1 - fly / FLY) ** 3) : 0;
    const nameOf = (h: Hook) => (h.user === me ? "You" : members.find((x) => x.id === h.user)?.name ?? h.name);
    const pick = local.pick && s.hooks.some((h) => h.user === local.pick) ? local.pick : s.hooks[0]?.user ?? "";
    const mineHung = s.hooks.some((h) => h.user === me);
    const asked = s.faq.reduce((n, f) => n + f.asked, 0);

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      const fam = theme.type.family;
      // pegboard
      g.fillStyle = dark ? mix(p.crust, c.wash, 0.7) : mix(p.crust, c.card, 0.72);
      g.beginPath();
      g.roundRect(TAGW + 10, 0, f.width - TAGW - 10, H, 12);
      g.fill();
      g.fillStyle = dark ? mix(p.crust, c.wash, 0.5) : mix(p.crust, c.card, 0.45);
      g.beginPath();
      for (let x = TAGW + 22; x < f.width - 6; x += 14) for (let y = 10; y < H - 4; y += 14) {
        g.moveTo(x + 1.6, y);
        g.arc(x, y, 1.6, 0, Math.PI * 2);
      }
      g.fill();
      // hooks
      g.strokeStyle = dark ? mix(c.text, c.wash, 0.3) : mix(c.secondaryText, c.text, 0.3);
      g.lineWidth = 3;
      g.lineCap = "round";
      g.beginPath();
      for (let k = 0; k < MAX_HOOKS; k++) {
        const q = hookAt(k);
        g.moveTo(q.x, q.y - 4);
        g.lineTo(q.x, q.y + 4);
        g.arc(q.x - 4, q.y + 4, 4, 0, Math.PI * 0.9);
      }
      g.stroke();
      // little tags on taken hooks, dashed outlines on open ones
      for (let k = 0; k < MAX_HOOKS; k++) {
        const q = hookAt(k);
        const taken = k < s.hooks.length;
        if (taken) {
          g.fillStyle = s.hooks[k]!.user === pick && isHost && !s.handed ? mix(c.primary, c.card, 0.75) : p.cream;
          g.beginPath();
          g.roundRect(q.x - 26, q.y + 8, 52, 40, 6);
          g.fill();
        } else {
          g.strokeStyle = dark ? mix(c.text, c.wash, 0.55) : mix(c.secondaryText, c.card, 0.35);
          g.lineWidth = 1.5;
          g.setLineDash([4, 3]);
          g.beginPath();
          g.roundRect(q.x - 26, q.y + 8, 52, 40, 6);
          g.stroke();
          g.setLineDash([]);
        }
      }
      // the key tag, swinging, flipping
      const tx = TAGW / 2 + 2, ty = 14;
      const target = handIdx >= 0 ? hookAt(handIdx) : null;
      const kx = target ? tx + (target.x - tx) * flyE : tx;
      const ky = target ? ty + (target.y + 40 - ty) * flyE : ty;
      const sc = target ? 1 - 0.78 * flyE : 1;
      const swing = Math.sin(f.now / 900) * 0.03 + (fly !== null ? Math.sin(fly / 70) * 0.12 * (1 - fly / FLY) : 0);
      g.fillStyle = mix(c.secondaryText, c.card, 0.2);
      g.beginPath();
      g.arc(tx, ty - 4, 4, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.translate(kx, ky);
      g.rotate(swing);
      g.scale(sc, sc);
      // ring and key
      g.strokeStyle = mix(p.yellow, p.brown, 0.3);
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, 10, 9, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = mix(p.yellow, p.brown, 0.15);
      g.beginPath();
      g.arc(-16, 14, 8, 0, Math.PI * 2);
      g.fill();
      g.fillRect(-46, 12, 32, 5);
      g.fillRect(-42, 17, 4, 5);
      g.fillRect(-35, 17, 3, 4);
      g.fillStyle = dark ? mix(c.wash, c.card, 0.4) : c.card;
      g.beginPath();
      g.arc(-16, 14, 3, 0, Math.PI * 2);
      g.fill();
      // the tag
      g.save();
      g.translate(0, 20);
      g.scale(sx, 1);
      const w = TAGW - 10, h = H - 44;
      g.fillStyle = showBack ? mix(p.cream, c.card, 0.25) : p.cream;
      g.beginPath();
      g.moveTo(-w / 2 + 18, 0);
      g.lineTo(w / 2 - 18, 0);
      g.lineTo(w / 2, 18);
      g.lineTo(w / 2, h - 6);
      g.quadraticCurveTo(w / 2, h, w / 2 - 6, h);
      g.lineTo(-w / 2 + 6, h);
      g.quadraticCurveTo(-w / 2, h, -w / 2, h - 6);
      g.lineTo(-w / 2, 18);
      g.closePath();
      g.fill();
      g.fillStyle = dark ? mix(c.wash, c.card, 0.4) : c.card;
      g.beginPath();
      g.arc(0, 10, 4.5, 0, Math.PI * 2);
      g.fill();
      if (sx > 0.15 && sc > 0.6) {
        const ink = dark ? c.card : c.text;
        const soft = dark ? mix(c.card, p.cream, 0.12) : c.secondaryText;
        g.textAlign = "center";
        g.textBaseline = "middle";
        if (!showBack) {
          const a = fitText(s.dates, w - 16, { g, size: 15, weight: 700, min: 10, family: fam });
          g.font = a.font;
          g.fillStyle = ink;
          g.fillText(a.text, 0, 36);
          const b = fitText(`${money(s.price)}`, w - 16, { g, size: 30, weight: 800, min: 14, family: fam });
          g.font = b.font;
          g.fillText(b.text, 0, 70);
          const d = fitText("a month, all in", w - 16, { g, size: 12, weight: 400, min: 10, family: fam });
          g.font = d.font;
          g.fillStyle = soft;
          g.fillText(d.text, 0, 94);
          g.strokeStyle = mix(p.cream, p.dark, 0.2);
          g.lineWidth = 1;
          g.setLineDash([3, 3]);
          g.beginPath();
          g.moveTo(-w / 2 + 10, 110);
          g.lineTo(w / 2 - 10, 110);
          g.stroke();
          g.setLineDash([]);
          const e = fitText(`tap for answers · asked ${asked}×`, w - 14, { g, size: 11, weight: 600, min: 10, family: fam });
          g.font = e.font;
          g.fillStyle = soft;
          g.fillText(e.text, 0, 128);
        } else {
          g.textAlign = "left";
          s.faq.forEach((q, i) => {
            const y = 32 + i * 30;
            const a = fitText(`${q.q}${q.asked > 1 ? ` ×${q.asked}` : ""}`, w - 16, { g, size: 12, weight: 700, min: 10, family: fam });
            g.font = a.font;
            g.fillStyle = ink;
            g.fillText(a.text, -w / 2 + 8, y);
            const b = fitText(q.a, w - 16, { g, size: 12, weight: 400, min: 10, family: fam });
            g.font = b.font;
            g.fillStyle = soft;
            g.fillText(b.text, -w / 2 + 8, y + 14);
          });
        }
      }
      g.restore();
      g.restore();
      return true;
    };

    const hookFaces = s.hooks.map((h, k) => {
      const q = hookAt(k);
      const handed = s.handed?.user === h.user;
      return (
        <button
          key={h.user}
          aria-label={`${nameOf(h)}, ${h.mutuals} mutual friends${handed ? ", has the key" : ""}`}
          onClick={() => isHost && !s.handed && setLocal({ pick: h.user })}
          style={{ position: "absolute", left: q.x - 26, top: q.y + 6, width: 52, height: 44, padding: 0, border: 0, background: "transparent", cursor: isHost ? "pointer" : "default", display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}
        >
          <span style={{ display: "flex", marginTop: 4, borderRadius: "50%", boxShadow: `0 0 0 2px ${handed ? c.positive : c.card}` }}>
            <Avatar user={h.user.startsWith("o:") ? { id: h.user, name: h.name } : h.user} size={20} />
          </span>
          <span style={{ fontSize: 10, lineHeight: "13px", fontWeight: 600, padding: "0 3px", borderRadius: 4, background: p.cream, color: dark ? c.card : c.text, whiteSpace: "nowrap" }}>{`${h.mutuals} mutual`}</span>
        </button>
      );
    });

    const handedHook = s.handed ? s.hooks.find((h) => h.user === s.handed!.user) : null;
    const quote = [...s.hooks].reverse().find((h) => h.said);
    const picked = s.hooks.find((h) => h.user === pick);

    return (
      <div>
        <CardHeader title={`${s.hostName}'s sublet`} subtitle={s.room || `${s.dates} · ${money(s.price)} a month`} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={`Key tag: ${s.dates}, ${money(s.price)} a month; ${s.hooks.length} people on the hooks`} draw={draw} />
          <button
            aria-label={local.back ? "Show the dates and price" : "Show the answers"}
            onClick={() => setLocal({ back: !local.back, flipAt: freshNow() })}
            style={{ position: "absolute", left: 6, top: 30, width: TAGW - 12, height: H - 40, padding: 0, border: 0, background: "transparent", cursor: "pointer", opacity: s.handed ? 0 : 1, pointerEvents: s.handed ? "none" : "auto" }}
          />
          {hookFaces}
          {s.handed && fly === null ? null : null}
          {s.handed && fly !== null && fly > FLY * 0.8 && handIdx >= 0 ? (
            <div style={{ position: "absolute", left: hookAt(handIdx).x - 50, width: 100, top: hookAt(handIdx).y, pointerEvents: "none" }}>
              <Burst key={s.handed.at} emoji="🔑" />
            </div>
          ) : null}
          {s.handed ? (
            <div style={{ position: "absolute", left: 0, width: TAGW, top: H / 2 - 30, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, pointerEvents: "none" }}>
              <span style={{ display: "flex", borderRadius: "50%", boxShadow: `0 0 0 3px ${c.positive}` }}>
                <Avatar user={handedHook ? (handedHook.user.startsWith("o:") ? { id: handedHook.user, name: handedHook.name } : handedHook.user) : me} size={40} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: c.text, whiteSpace: "nowrap" }}>{handedHook ? `${nameOf(handedHook)} has the key` : "Key handed"}</span>
            </div>
          ) : null}
        </div>
        <div style={{ marginTop: 8, minHeight: 18, fontSize: 13, lineHeight: "18px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {quote ? `${nameOf(quote)}: “${quote.said}”` : s.faq[0] ? `Tap the tag · ${s.faq[0].q.toLowerCase()} ${s.faq[0].a}` : "Tap the tag for the answers"}
        </div>
        <div style={{ marginTop: 6, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: s.handed ? c.text : c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.handed
              ? `${s.dates} · ${money(s.price)} a month`
              : isHost
                ? picked
                  ? `${picked.name} · ${picked.mutuals} mutual friends`
                  : "Nobody on the hooks yet"
                : `${s.hooks.length} on the hooks${mineHung ? " · you're one" : ""}`}
          </span>
          {isHost ? (
            s.handed ? (
              <Button kind="deemphasized" onClick={() => dispatch({ t: "unhand" })}>
                Take it back
              </Button>
            ) : picked ? (
              <Button kind="primary" onClick={() => { dispatch({ t: "hand", user: picked.user }); haptic("success"); setLocal({ toast: local.toast + 1, msg: `Key to ${picked.name}` }); }}>
                Hand the key
              </Button>
            ) : null
          ) : !s.handed ? (
            mineHung ? (
              <Button kind="secondary" onClick={() => dispatch({ t: "hang" })}>
                Take it down
              </Button>
            ) : s.hooks.length < MAX_HOOKS ? (
              <Button kind="primary" onClick={() => { dispatch({ t: "hang" }); haptic("light"); setLocal({ toast: local.toast + 1, msg: `${s.hostName} sees you on a hook` }); }}>
                Hang my key
              </Button>
            ) : null
          ) : null}
        </div>
        {local.toast > 0 && local.msg ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
