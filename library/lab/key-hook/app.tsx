import { defineApp, Avatar, Button, Canvas, CardHeader, clock, fitText, haptic, mix, pal, running, spring, springs, type Ctx, type DrawFrame } from "@muse/app";

// Key hook: the pegboard by the apartment door with the shared stuff hanging on it (the Sube keys,
// the good umbrella, the HDMI cable). Whatever is out shows an empty hook with the borrower's face
// hanging there instead and how long it's been gone. Tap a thing to take it and it swings off the
// hook; hang it back and it swings on. Want something that's out? Ask, and your face queues on it.

type Kind = "carkey" | "key" | "umbrella" | "cable" | "lock" | "card" | "charger" | "speaker";
type Params = {
  /** Card title */
  title: string;
  /** Where the board hangs: "412 Pine" */
  place: string;
  /** 3 to 8 shared things: name, a picture, who has it now (empty if on the hook), since when, and what they said */
  items: { name: string; kind: Kind; holder?: string; since?: string; said?: string; wants?: string[] }[];
};

// @params
const P: Params = {
  title: "Key hook",
  place: "412 Pine",
  items: [
    { name: "Sube keys", kind: "carkey", holder: "Will", since: "since Sunday", said: "it's in the sube. the keys are also in the sube", wants: ["Maya"] },
    { name: "Mailbox key", kind: "key" },
    { name: "Good umbrella", kind: "umbrella", holder: "Calvin", since: "since Tuesday", said: "returning it when it stops raining" },
    { name: "HDMI cable", kind: "cable" },
    { name: "Bike lock", kind: "lock", holder: "Tsai Lin", since: "since this morning" },
    { name: "Laundry card", kind: "card" },
    { name: "Long charger", kind: "charger" },
    { name: "Speaker", kind: "speaker", holder: "Arun", since: "since last night", said: "the rice cooker needed ambience" },
  ],
};
// @end params

type Item = { name: string; kind: Kind; holder: string; since: number; sinceText: string; said: string; wants: string[]; at: number };
type State = { title: string; place: string; items: Item[] };
type Action = { t: "take"; i: number } | { t: "hang"; i: number } | { t: "ask"; i: number };
type Local = { sel: number };

const KINDS: Kind[] = ["carkey", "key", "umbrella", "cable", "lock", "card", "charger", "speaker"];
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const okI = (s: State, i: unknown): i is number => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < s.items.length;
const swing = spring({ ...springs.iosBouncy });
const HOUR = 3600000;

function initState(ctx: Ctx): State {
  const find = (who: unknown) => {
    const n = clean(who, 40).toLowerCase();
    return n ? ctx.members.find((m) => m.id === n || m.name.toLowerCase() === n) : undefined;
  };
  const items: Item[] = [];
  for (const x of Array.isArray(P.items) ? P.items : []) {
    const name = clean(x?.name, 20);
    if (!name || items.length >= 8) continue;
    const h = find(x.holder);
    const wants = (Array.isArray(x.wants) ? x.wants : []).map((w) => find(w)?.id ?? "").filter((u, k, a) => u && u !== h?.id && a.indexOf(u) === k);
    items.push({ name, kind: KINDS.includes(x.kind) ? x.kind : "key", holder: h?.id ?? "", since: 0, sinceText: h ? clean(x.since, 24) : "", said: h ? clean(x.said, 60) : "", wants: h ? wants : [], at: 0 });
  }
  if (!items.length) items.push({ name: "House key", kind: "key", holder: "", since: 0, sinceText: "", said: "", wants: [], at: 0 });
  return { title: clean(P.title, 40) || "Key hook", place: clean(P.place, 30), items };
}

function drawThing(g: CanvasRenderingContext2D, k: Kind, s: number, pl: ReturnType<typeof pal>, ink: string, card: string) {
  // drawn hanging from (0, 0) downward
  g.save();
  g.scale(s, s);
  g.lineWidth = 2;
  g.strokeStyle = ink;
  g.lineJoin = "round";
  g.lineCap = "round";
  const fill = (c: string, f: () => void) => {
    g.fillStyle = c;
    g.beginPath();
    f();
    g.fill();
    g.stroke();
  };
  if (k === "carkey" || k === "key") {
    fill(mix(pl.yellow, ink, 0.15), () => g.arc(0, 8, 6, 0, Math.PI * 2));
    g.beginPath();
    g.moveTo(0, 14);
    g.lineTo(0, 34);
    g.moveTo(0, 26);
    g.lineTo(5, 26);
    g.moveTo(0, 31);
    g.lineTo(4, 31);
    g.stroke();
    if (k === "carkey") fill(pl.dark, () => g.roundRect(5, 10, 13, 20, 5));
    if (k === "carkey") {
      g.fillStyle = pl.red;
      g.beginPath();
      g.arc(11.5, 16, 2.2, 0, Math.PI * 2);
      g.fill();
    }
  } else if (k === "umbrella") {
    g.beginPath();
    g.moveTo(0, 2);
    g.lineTo(0, 36);
    g.arc(-4, 36, 4, 0, Math.PI);
    g.stroke();
    fill(pl.purple, () => {
      g.moveTo(-5, 8);
      g.quadraticCurveTo(-8, 20, -3, 30);
      g.lineTo(3, 30);
      g.quadraticCurveTo(8, 20, 5, 8);
      g.closePath();
    });
  } else if (k === "cable") {
    g.strokeStyle = mix(ink, card, 0.2);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 2);
    g.bezierCurveTo(-16, 14, 16, 22, -8, 34);
    g.stroke();
    g.lineWidth = 2;
    g.strokeStyle = ink;
    fill(mix(ink, card, 0.4), () => g.roundRect(-14, 32, 12, 8, 2));
  } else if (k === "lock") {
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 14, 8, Math.PI, 0);
    g.stroke();
    g.lineWidth = 2;
    fill(pl.orange, () => g.roundRect(-11, 14, 22, 18, 4));
  } else if (k === "card") {
    fill(pl.blue, () => g.roundRect(-11, 4, 22, 30, 3));
    g.fillStyle = card;
    g.fillRect(-7, 10, 14, 3);
  } else if (k === "charger") {
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(0, 2);
    g.bezierCurveTo(14, 10, -14, 18, 10, 26);
    g.bezierCurveTo(16, 30, -10, 32, 0, 36);
    g.stroke();
    fill(card, () => g.roundRect(-5, 34, 10, 10, 2));
  } else {
    fill(pl.dark, () => g.roundRect(-11, 4, 22, 34, 6));
    g.fillStyle = mix(pl.dark, card, 0.5);
    g.beginPath();
    g.arc(0, 26, 6, 0, Math.PI * 2);
    g.arc(0, 12, 3, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

export default defineApp<State, Action, Local>({
  name: "Key hook",
  summary: (s, ctx) => {
    const out = s.items.filter((x) => x.holder);
    const name = (u: string) => ctx.members.find((m) => m.id === u)?.name ?? "Someone";
    return out.length ? `${s.title}: ${out.length} out · ${out.slice(0, 2).map((x) => `${name(x.holder)} has the ${x.name.toLowerCase()}`).join(", ")}` : `${s.title}: everything's on the hook`;
  },
  init: initState,

  reduce: (s, a, meta, ctx) => {
    const u = meta.user;
    if (!inChat(ctx, u) || !okI(s, a.i)) return s;
    const it = s.items[a.i]!;
    const put = (x: Item) => ({ ...s, items: s.items.map((y, k) => (k === a.i ? x : y)) });
    if (a.t === "take") {
      if (it.holder) return s;
      return put({ ...it, holder: u, since: meta.time, sinceText: "", said: "", wants: it.wants.filter((w) => w !== u), at: meta.time });
    }
    if (a.t === "hang") {
      if (it.holder !== u) return s;
      return put({ ...it, holder: "", since: meta.time, sinceText: "", said: "", wants: [], at: meta.time });
    }
    if (a.t === "ask") {
      if (!it.holder || it.holder === u) return s;
      return put({ ...it, wants: it.wants.includes(u) ? it.wants.filter((w) => w !== u) : [...it.wants, u] });
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const gone = (u: string) => u !== "" && !inChat(ctx, u);
    if (!s.items.some((x) => gone(x.holder) || x.wants.some(gone))) return s;
    return { ...s, items: s.items.map((x) => ({ ...x, wants: x.wants.filter((w) => !gone(w)), ...(gone(x.holder) ? { holder: "", wants: [], sinceText: "", said: "" } : {}) })) };
  },

  invariants: {
    "nobody waits for something on the hook": (s) => s.items.every((x) => x.holder !== "" || x.wants.length === 0),
    "the holder never waits for their own thing": (s) => s.items.every((x) => !x.wants.includes(x.holder) && new Set(x.wants).size === x.wants.length),
    "holders and askers are in the chat": (s, ctx) => s.items.every((x) => (x.holder === "" || inChat(ctx, x.holder)) && x.wants.every((w) => inChat(ctx, w))),
    "one to eight things on the board": (s) => s.items.length >= 1 && s.items.length <= 8,
  },

  transitions: {
    "taking needs a free hook": (p, n, a, m) => a.t !== "take" || p === n || (p.items[a.i]!.holder === "" && n.items[a.i]!.holder === m.user && n.items[a.i]!.since === m.time),
    "only the holder hangs it back": (p, n, a, m) => a.t !== "hang" || p === n || (p.items[a.i]!.holder === m.user && n.items[a.i]!.holder === ""),
    "asking queues only you": (p, n, a, m) => a.t !== "ask" || p === n || (n.items[a.i]!.holder === p.items[a.i]!.holder && n.items[a.i]!.wants.includes(m.user) !== p.items[a.i]!.wants.includes(m.user)),
    "one thing moves at a time": (p, n, a) => p === n || n.items.every((x, k) => k === a.i || JSON.stringify(x) === JSON.stringify(p.items[k])),
    "only people in the chat touch the board": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, u, r) => {
    const i = r.int(s.items.length);
    const it = s.items[i]!;
    if (!it.holder) return { t: "take", i };
    if (it.holder === u) return r.next() < 0.8 ? { t: "hang", i } : { t: "ask", i };
    return r.next() < 0.7 ? { t: "ask", i } : { t: "take", i };
  },

  local: { sel: -1 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const n = state.items.length;
    const cols = Math.min(4, n);
    const rows = Math.ceil(n / cols);
    const cellW = (W - 16) / cols;
    const cellH = 92;
    const H = rows * cellH + 12;
    const now = clock.value;
    const nameOf = (u: string) => (u === me ? "You" : members.find((m) => m.id === u)?.name ?? "Someone");
    const pos = (i: number) => ({ x: 8 + (i % cols) * cellW + cellW / 2, y: 10 + Math.floor(i / cols) * cellH });
    const firstMine = state.items.findIndex((x) => x.holder === me);
    const firstTale = state.items.findIndex((x) => x.holder && x.said);
    const sel = local.sel >= 0 && local.sel < n ? local.sel : firstMine >= 0 ? firstMine : firstTale >= 0 ? firstTale : 0;
    const it = sel >= 0 ? state.items[sel]! : null;
    const ago = (x: Item) => {
      if (x.sinceText) return x.sinceText;
      if (!x.since) return "";
      const h = Math.floor((now - x.since) / HOUR);
      return h < 1 ? "just now" : h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`;
    };
    const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      const w = f.width;
      // pegboard
      g.fillStyle = mix(pl.crust, c.card, theme.mode === "dark" ? 0.55 : 0.45);
      g.beginPath();
      g.roundRect(0, 0, w, H, 12);
      g.fill();
      g.fillStyle = mix(pl.brown, c.card, 0.45);
      g.beginPath();
      for (let y = 8; y < H - 4; y += 14)
        for (let x = 8 + ((y / 14) % 2) * 7; x < w - 4; x += 14) {
          g.moveTo(x + 1.3, y);
          g.arc(x, y, 1.3, 0, Math.PI * 2);
        }
      g.fill();
      const ink = mix(c.text, c.card, 0.2);
      let moving = false;
      state.items.forEach((x, i) => {
        const p = pos(i);
        // the hook
        g.strokeStyle = mix(c.text, c.card, 0.35);
        g.lineWidth = 3;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(p.x, p.y + 2);
        g.lineTo(p.x, p.y + 10);
        g.arc(p.x + 4, p.y + 10, 4, Math.PI, Math.PI * 0.2, true);
        g.stroke();
        const e = x.at ? running(x.at, 900) : null;
        if (e !== null) moving = true;
        if (!x.holder || e !== null) {
          const k = e === null ? 1 : swing(e);
          // swing on (hang) or off (take)
          const ang = x.holder ? (e! / 900) * 1.4 : (1 - k) * 0.9 + Math.sin(f.now / 900 + i) * 0.03;
          const drop = x.holder ? (e! / 900) * 30 : 0;
          g.save();
          g.translate(p.x + 4, p.y + 12 + drop);
          g.rotate(ang);
          g.globalAlpha = x.holder ? Math.max(0, 1 - e! / 900) : 1;
          drawThing(g, x.kind, 1.25, pl, ink, pl.paper);
          g.restore();
          g.globalAlpha = 1;
        } else {
          g.strokeStyle = mix(c.text, c.card, 0.5);
          g.lineWidth = 1.5;
          g.setLineDash([3, 3]);
          g.beginPath();
          g.roundRect(p.x - 13, p.y + 14, 34, 34, 8);
          g.stroke();
          g.setLineDash([]);
        }
        if (i === sel) {
          g.strokeStyle = c.primary;
          g.lineWidth = 2;
          g.beginPath();
          g.roundRect(p.x - cellW / 2 + 4, p.y - 4, cellW - 8, cellH - 6, 10);
          g.stroke();
        }
        const lf = fitText(x.name, cellW - 10, { g, size: 12, weight: 600 });
        g.font = lf.font;
        g.textAlign = "center";
        g.textBaseline = "alphabetic";
        g.fillStyle = c.text;
        g.fillText(lf.text, p.x, p.y + cellH - 14);
      });
      return moving;
    };

    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (e.type !== "down") return;
      const col = Math.floor((e.x - 8) / cellW);
      const row = Math.floor((e.y - 6) / cellH);
      const i = row * cols + col;
      if (col < 0 || col >= cols || i < 0 || i >= n) return;
      haptic("light");
      setLocal({ sel: i });
    };

    const out = state.items.filter((x) => x.holder).length;
    let action = null;
    if (it) {
      const i = sel;
      if (!it.holder)
        action = (
          <Button kind="primary" onClick={() => { haptic("success"); dispatch({ t: "take", i }); }}>
            Take it
          </Button>
        );
      else if (it.holder === me)
        action = (
          <Button kind="primary" onClick={() => { haptic("success"); dispatch({ t: "hang", i }); }}>
            Hang it back
          </Button>
        );
      else
        action = (
          <Button kind={it.wants.includes(me) ? "secondary" : "primary"} onClick={() => dispatch({ t: "ask", i })}>
            {it.wants.includes(me) ? "Asked" : "Ask for it"}
          </Button>
        );
    }

    return (
      <div>
        <CardHeader title={state.title} subtitle={`${state.place ? `${state.place} · ` : ""}${out ? `${out} of ${n} out` : "everything's here"}`} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={`Pegboard with ${n} things, ${out} out`} draw={draw} onPointer={onPointer} />
          {state.items.map((x, i) => {
            if (!x.holder || (x.at && running(x.at, 900) !== null)) return null;
            const p = pos(i);
            return (
              <div key={i} style={{ position: "absolute", left: p.x - 12, top: p.y + 19, display: "flex", pointerEvents: "none" }}>
                <Avatar user={x.holder} size={26} />
                {x.wants.length ? (
                  <span style={{ position: "absolute", right: -12, top: -6, minWidth: 18, height: 18, borderRadius: 9, padding: "0 4px", boxSizing: "border-box", background: c.text, color: c.card, fontSize: 11, lineHeight: "18px", fontWeight: 700, textAlign: "center" }}>{x.wants.length}</span>
                ) : null}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 8, minHeight: 40 }}>
          {it ? (
            <>
              <div style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text, ...ell }}>
                {it.holder ? `${nameOf(it.holder)} ${it.holder === me ? "have" : "has"} the ${it.name.toLowerCase()}${ago(it) ? ` · ${ago(it)}` : ""}` : `${it.name} · on the hook`}
              </div>
              <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText, ...ell }}>
                {it.said ? `"${it.said}"` : it.wants.length ? `${it.wants.map(nameOf).join(", ")} ${it.wants.length === 1 && it.wants[0] !== me ? "wants" : "want"} it next` : it.holder === me ? "Hang it back when you're done" : it.holder ? "Ask and you're next in line" : "Tap take and it's yours till you hang it back"}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text }}>Tap something on the board</div>
              <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText }}>See who has it, take it, or ask for it next</div>
            </>
          )}
        </div>
        <div style={{ marginTop: 6, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, ...ell }}>
            {it && it.holder && it.wants.length && it.said ? `${it.wants.map(nameOf).join(", ")} ${it.wants.length === 1 && it.wants[0] !== me ? "wants" : "want"} it next` : (() => { const k = state.items.filter((x) => x.holder === me).length; return k ? `${k} with you` : "Nothing with you"; })()}
          </span>
          {action}
        </div>
      </div>
    );
  },
});
