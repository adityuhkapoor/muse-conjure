import { defineApp, Avatar, Button, Canvas, CardHeader, Facepile, Toast, fitText, haptic, mix, pal, running, type Ctx, type DrawFrame, type Theme } from "@muse/app";

// Survivor tee: the chat designs its end-of-finals shirt. Everyone's design hangs on a clothesline
// with a clothespin; the one in front is shown big. Make yours by tapping the shirt to change the
// picture, picking a color and writing the line, then hang it. Tap a shirt on the line to see it
// and give it your one vote; the shirt with the most votes is the one that gets printed.

type Art = "flask" | "coffee" | "mountain" | "ricecooker" | "alarm" | "owl";
type Params = {
  /** Card title */
  title: string;
  /** Under the title: what the shirt is for */
  sub: string;
  /** Designs already hanging: who made it, shirt color 0 to 5, the picture, the line, and who voted for it */
  designs: { who: string; color: number; art: Art; line: string; votes?: string[] }[];
};

// @params
const P: Params = {
  title: "Survivor tee",
  sub: "orgo survivors · printing Friday, $12 each",
  designs: [
    { who: "Maya", color: 2, art: "flask", line: "orgo survivors 2025", votes: ["Tsai Lin"] },
    { who: "Calvin", color: 5, art: "alarm", line: "7 alarms, 0 regrets", votes: ["Will", "Arun"] },
    { who: "Arun", color: 3, art: "ricecooker", line: "powered by the rice cooker" },
  ],
};
// @end params

type Design = { id: string; who: string; name: string; color: number; art: Art; line: string; votes: string[]; at: number };
type State = { title: string; sub: string; designs: Design[] };
type Action = { t: "hang"; color: number; art: Art; line: string } | { t: "vote"; id: string };
type Local = { edit: boolean; color: number; art: number; line: string; sel: string; toast: number; msg: string };

const ARTS: Art[] = ["flask", "coffee", "mountain", "ricecooker", "alarm", "owl"];
const LINE = 66;
const TEE = 168;
const CH = LINE + TEE;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const first = (n: string) => n.split(" ")[0] ?? n;
const shirt = (t: Theme, k: number) => {
  const p = pal(t);
  const dim = (x: string) => mix(x, t.mode === "dark" ? t.color.wash : t.color.text, 0.2);
  return [dim(p.blue), dim(p.red), dim(p.green), p.yellow, dim(p.purple), t.mode === "dark" ? mix(t.color.wash, p.blue, 0.25) : mix(t.color.text, p.blue, 0.15)][k] ?? p.blue;
};
const leader = (s: State) => [...s.designs].sort((a, b) => b.votes.length - a.votes.length || a.at - b.at)[0];

function initState(ctx: Ctx): State {
  const find = (n: string) => ctx.members.find((y) => y.id === n || y.name.toLowerCase() === n.toLowerCase());
  const designs: Design[] = [];
  for (const x of Array.isArray(P.designs) ? P.designs : []) {
    const nm = clean(x?.who, 20);
    if (!nm || designs.length >= 6) continue;
    const m = find(nm);
    const who = m ? m.id : `~${nm}`;
    if (designs.some((d) => d.who === who)) continue;
    designs.push({ id: `p${designs.length}`, who, name: m ? clean(m.name, 20) || nm : nm, color: isInt(x.color, 0, 5) ? x.color : 0, art: ARTS.includes(x.art) ? x.art : "flask", line: clean(x.line, 32) || "we made it", votes: [], at: 0 });
  }
  // Votes: one per person, the last design that names them wins.
  const seen = new Set<string>();
  for (let i = (P.designs ?? []).length - 1; i >= 0; i--) {
    const x = P.designs[i]!;
    const d = designs.find((y) => y.name.toLowerCase() === clean(x?.who, 20).toLowerCase());
    if (!d) continue;
    for (const v of Array.isArray(x.votes) ? x.votes : []) {
      const nm = clean(v, 20);
      const m = nm ? find(nm) : undefined;
      const id = m ? m.id : `~${nm}`;
      if (!nm || seen.has(id)) continue;
      seen.add(id);
      d.votes.push(id);
    }
  }
  return { title: clean(P.title, 40) || "Survivor tee", sub: clean(P.sub, 60), designs };
}

function drawArt(g: CanvasRenderingContext2D, a: Art, x: number, y: number, s: number, t: Theme, ink: string, bg: string) {
  const p = pal(t);
  g.save();
  g.translate(x, y);
  g.scale(s / 50, s / 50);
  g.lineWidth = 2.5;
  g.lineJoin = "round";
  g.lineCap = "round";
  g.strokeStyle = ink;
  const shape = (fill: string, f: () => void) => {
    g.beginPath();
    f();
    g.fillStyle = fill;
    g.fill();
    g.stroke();
  };
  if (a === "flask") {
    shape(bg, () => {
      g.moveTo(-6, -22);
      g.lineTo(-6, -6);
      g.lineTo(-20, 20);
      g.lineTo(20, 20);
      g.lineTo(6, -6);
      g.lineTo(6, -22);
      g.closePath();
    });
    shape(p.green, () => {
      g.moveTo(-14, 9);
      g.lineTo(14, 9);
      g.lineTo(20, 20);
      g.lineTo(-20, 20);
      g.closePath();
    });
    g.beginPath();
    g.arc(-3, 2, 2.5, 0, Math.PI * 2);
    g.arc(4, -4, 1.8, 0, Math.PI * 2);
    g.stroke();
  } else if (a === "coffee") {
    shape(bg, () => g.roundRect(-16, -12, 26, 32, 4));
    g.beginPath();
    g.arc(12, 3, 7, -1.3, 1.3);
    g.stroke();
    g.beginPath();
    for (const dx of [-8, 0]) {
      g.moveTo(dx - 3, -16);
      g.bezierCurveTo(dx + 3, -20, dx - 5, -24, dx + 1, -28);
    }
    g.stroke();
    shape(p.brown, () => g.rect(-16, -6, 26, 6));
  } else if (a === "mountain") {
    shape(bg, () => {
      g.moveTo(-24, 18);
      g.lineTo(-6, -16);
      g.lineTo(4, 2);
      g.lineTo(10, -6);
      g.lineTo(24, 18);
      g.closePath();
    });
    shape(p.red, () => {
      g.moveTo(-6, -16);
      g.lineTo(-6, -28);
      g.lineTo(6, -24);
      g.lineTo(-6, -20);
    });
  } else if (a === "ricecooker") {
    shape(bg, () => g.roundRect(-20, -8, 40, 28, 9));
    shape(bg, () => g.ellipse(0, -8, 20, 7, 0, 0, Math.PI * 2));
    shape(p.red, () => g.roundRect(-7, 4, 14, 7, 2));
    g.beginPath();
    for (const dx of [-6, 6]) {
      g.moveTo(dx, -18);
      g.bezierCurveTo(dx + 4, -22, dx - 4, -26, dx, -30);
    }
    g.stroke();
  } else if (a === "alarm") {
    shape(bg, () => g.arc(0, 2, 17, 0, Math.PI * 2));
    shape(p.yellow, () => g.arc(-14, -14, 6, 0, Math.PI * 2));
    shape(p.yellow, () => g.arc(14, -14, 6, 0, Math.PI * 2));
    g.beginPath();
    g.moveTo(0, 2);
    g.lineTo(0, -9);
    g.moveTo(0, 2);
    g.lineTo(8, 6);
    g.moveTo(-10, 19);
    g.lineTo(-13, 24);
    g.moveTo(10, 19);
    g.lineTo(13, 24);
    g.stroke();
  } else {
    shape(bg, () => g.ellipse(0, 2, 17, 21, 0, 0, Math.PI * 2));
    shape(p.yellow, () => g.arc(-7, -4, 6, 0, Math.PI * 2));
    shape(p.yellow, () => g.arc(7, -4, 6, 0, Math.PI * 2));
    g.fillStyle = ink;
    g.beginPath();
    g.arc(-7, -4, 2.2, 0, Math.PI * 2);
    g.arc(7, -4, 2.2, 0, Math.PI * 2);
    g.fill();
    shape(p.orange, () => {
      g.moveTo(-3, 3);
      g.lineTo(3, 3);
      g.lineTo(0, 8);
      g.closePath();
    });
  }
  g.restore();
}

function teePath(g: CanvasRenderingContext2D, cx: number, top: number, w: number) {
  const h = w * 1.05;
  const nw = w * 0.2;
  g.beginPath();
  g.moveTo(cx - nw, top);
  g.quadraticCurveTo(cx, top + w * 0.12, cx + nw, top);
  g.lineTo(cx + w * 0.36, top + w * 0.02);
  g.lineTo(cx + w * 0.55, top + w * 0.22);
  g.lineTo(cx + w * 0.42, top + w * 0.34);
  g.lineTo(cx + w * 0.33, top + w * 0.27);
  g.lineTo(cx + w * 0.33, top + h);
  g.lineTo(cx - w * 0.33, top + h);
  g.lineTo(cx - w * 0.33, top + w * 0.27);
  g.lineTo(cx - w * 0.42, top + w * 0.34);
  g.lineTo(cx - w * 0.55, top + w * 0.22);
  g.lineTo(cx - w * 0.36, top + w * 0.02);
  g.closePath();
}

function drawTee(g: CanvasRenderingContext2D, t: Theme, cx: number, top: number, w: number, color: number, art: Art, line: string, small: boolean) {
  const c = t.color;
  const body = shirt(t, color);
  const light = color === 3;
  const dk = t.mode === "dark";
  const ink = light ? (dk ? c.wash : c.text) : dk ? c.text : c.card;
  if (t.mode === "dark" && !light) {
    // keep the print readable on dark shirts in dark mode
  }
  teePath(g, cx, top, w);
  g.fillStyle = body;
  g.fill();
  g.lineWidth = small ? 1 : 1.5;
  g.strokeStyle = mix(body, c.text, 0.3);
  g.stroke();
  // Collar.
  g.beginPath();
  g.moveTo(cx - w * 0.2, top);
  g.quadraticCurveTo(cx, top + w * 0.12, cx + w * 0.2, top);
  g.lineWidth = small ? 2 : 4;
  g.strokeStyle = mix(body, c.text, 0.18);
  g.stroke();
  drawArt(g, art, cx, top + w * 0.5, w * 0.36, t, ink, mix(body, c.card, light ? 0.6 : 0.25));
  if (!small) {
    // One line if it fits, else two, split at the middle space.
    const max = w * 0.62;
    const one = fitText(line, max, { g, size: 12, min: 12, weight: 800 });
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = ink;
    if (one.text === line) {
      g.font = one.font;
      g.fillText(one.text, cx, top + w * 0.86);
    } else {
      const words = line.split(" ");
      let cut = 1;
      let best = Infinity;
      for (let k = 1; k < words.length; k++) {
        const d = Math.abs(words.slice(0, k).join(" ").length - words.slice(k).join(" ").length);
        if (d < best) {
          best = d;
          cut = k;
        }
      }
      const a = fitText(words.slice(0, cut).join(" "), max, { g, size: 12, min: 10, weight: 800 });
      const b = fitText(words.slice(cut).join(" "), max, { g, size: 12, min: 10, weight: 800 });
      g.font = a.size < b.size ? a.font : b.font;
      g.fillText(a.text, cx, top + w * 0.8);
      g.fillText(b.text, cx, top + w * 0.8 + 14);
    }
  }
}

function drawScene(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string, shown: { color: number; art: Art; line: string; at: number }, selId: string) {
  const t = f.theme;
  const c = t.color;
  const pl = pal(t);
  const dk = t.mode === "dark";
  const W = f.width;
  let anim = false;
  g.beginPath();
  g.roundRect(0, 0, W, CH, 14);
  g.fillStyle = dk ? mix(pl.sky, c.wash, 0.8) : mix(pl.sky, c.card, 0.45);
  g.fill();
  // The clothesline, sagging, with the designs pinned on it.
  const n = Math.max(1, s.designs.length);
  const slot = Math.min(58, (W - 24) / n);
  const x0 = (W - slot * n) / 2;
  const sag = (x: number) => 10 + 8 * Math.sin((x / W) * Math.PI);
  g.beginPath();
  g.moveTo(0, 10);
  for (let x = 0; x <= W; x += 8) g.lineTo(x, sag(x));
  g.strokeStyle = dk ? c.text : c.secondaryText;
  g.lineWidth = 1.2;
  g.stroke();
  s.designs.forEach((d, i) => {
    const cx = x0 + slot * i + slot / 2;
    const run = d.at ? running(d.at, 1000) : null;
    const sway = run === null ? Math.sin(f.now / 900 + i) * 0.03 : Math.sin((run / 1000) * Math.PI * 3) * 0.2 * (1 - run / 1000);
    anim = true;
    const top = sag(cx);
    g.save();
    g.translate(cx, top);
    g.rotate(sway);
    drawTee(g, t, 0, 0, slot * 0.62, d.color, d.art, d.line, true);
    // Clothespin.
    g.fillStyle = dk ? mix(pl.brown, c.text, 0.3) : pl.brown;
    g.fillRect(-1.5, -5, 3, 9);
    g.restore();
    if (d.id === selId) {
      g.beginPath();
      g.moveTo(cx - 6, LINE - 6);
      g.lineTo(cx + 6, LINE - 6);
      g.lineTo(cx, LINE);
      g.closePath();
      g.fillStyle = c.primary;
      g.fill();
    }
  });
  // The shirt up front, on a hanger.
  const w = 140;
  const cx = W / 2;
  const top = LINE + 12;
  g.strokeStyle = dk ? c.text : c.secondaryText;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx - w * 0.36, top + 4);
  g.lineTo(cx, top - 8);
  g.lineTo(cx + w * 0.36, top + 4);
  g.moveTo(cx, top - 8);
  g.lineTo(cx, top - 13);
  g.arc(cx + 3, top - 13, 3, Math.PI, 0);
  g.stroke();
  const pop = shown.at ? running(shown.at, 500) : null;
  if (pop !== null) anim = true;
  g.save();
  const k = pop === null ? 1 : 0.92 + 0.08 * Math.sin((pop / 500) * Math.PI * 0.5);
  g.translate(cx, top);
  g.scale(k, k);
  drawTee(g, t, 0, 0, w, shown.color, shown.art, shown.line, false);
  g.restore();
  return anim;
}

export default defineApp<State, Action, Local>({
  name: "Survivor tee",
  summary: (s) => {
    const l = leader(s);
    return l ? `${s.title}: ${s.designs.length} designs · leading "${l.line}" by ${first(l.name)}, ${l.votes.length} ${l.votes.length === 1 ? "vote" : "votes"}` : `${s.title}: no designs yet`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    const u = m.user;
    if (!inChat(ctx, u)) return s;
    if (a.t === "hang") {
      const line = clean(a.line, 32);
      if (!line || !isInt(a.color, 0, 5) || !ARTS.includes(a.art)) return s;
      const name = clean(ctx.members.find((x) => x.id === u)?.name, 20) || "Friend";
      const old = s.designs.find((d) => d.who === u);
      if (!old && s.designs.length >= 6) return s;
      const d: Design = { id: `d${m.seq}`, who: u, name, color: a.color, art: a.art, line, votes: old ? old.votes : [], at: m.time };
      return { ...s, designs: old ? s.designs.map((x) => (x.who === u ? d : x)) : [...s.designs, d] };
    }
    if (a.t === "vote") {
      const d = s.designs.find((x) => x.id === a.id);
      if (typeof a.id !== "string" || !d) return s;
      const had = d.votes.includes(u);
      return { ...s, designs: s.designs.map((x) => ({ ...x, votes: x.id === a.id && !had ? [...x.votes, u] : x.votes.filter((v) => v !== u) })) };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const gone = (u: string) => !u.startsWith("~") && !inChat(ctx, u);
    if (!s.designs.some((d) => d.votes.some(gone))) return s;
    return { ...s, designs: s.designs.map((d) => ({ ...d, votes: d.votes.filter((v) => !gone(v)) })) };
  },

  invariants: {
    "one vote per person across all shirts": (s) => {
      const all = s.designs.flatMap((d) => d.votes);
      return new Set(all).size === all.length;
    },
    "one design per person, six at most": (s) => new Set(s.designs.map((d) => d.who)).size === s.designs.length && s.designs.length <= 6 && new Set(s.designs.map((d) => d.id)).size === s.designs.length,
    "every shirt is printable": (s) => s.designs.every((d) => isInt(d.color, 0, 5) && ARTS.includes(d.art) && d.line.length > 0 && d.line.length <= 32),
    "votes come from the chat": (s, ctx) => s.designs.every((d) => d.votes.every((v) => v.startsWith("~") || inChat(ctx, v))),
  },

  transitions: {
    "hanging puts up your shirt as drawn": (p, n, a, m) => {
      if (a.t !== "hang" || p === n) return true;
      const d = n.designs.find((x) => x.who === m.user);
      const had = p.designs.find((x) => x.who === m.user);
      return !!d && d.color === a.color && d.art === a.art && d.line === clean(a.line, 32) && d.at === m.time && n.designs.length === p.designs.length + (had ? 0 : 1) && d.votes.join() === (had ? had.votes.join() : "");
    },
    "a vote moves only your vote": (p, n, a, m) => {
      if (a.t !== "vote" || p === n) return true;
      const others = (s: State) => s.designs.map((d) => d.votes.filter((v) => v !== m.user).join()).join("|");
      const was = p.designs.find((d) => d.id === a.id)!.votes.includes(m.user);
      return others(p) === others(n) && n.designs.find((d) => d.id === a.id)!.votes.includes(m.user) === !was;
    },
    "voting never changes the shirts": (p, n, a) => a.t !== "vote" || n.designs.every((d, k) => d.id === p.designs[k]!.id && d.line === p.designs[k]!.line && d.color === p.designs[k]!.color && d.art === p.designs[k]!.art),
    "only the chat designs and votes": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) =>
    !s.designs.length || r.next() < 0.35
      ? { t: "hang", color: r.int(6), art: r.pick(ARTS), line: r.pick(["we survived", "finals 2025", "kettle & crumb regulars", "lowkey made it"]) }
      : { t: "vote", id: r.pick(s.designs).id },

  local: { edit: false, color: 0, art: 0, line: "", sel: "", toast: 0, msg: "" },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const n = Math.max(1, s.designs.length);
    const slot = Math.min(58, (W - 24) / n);
    const x0 = (W - slot * n) / 2;
    const mine = s.designs.find((d) => d.who === me);
    const sel = (local.sel === "mine" ? mine : s.designs.find((d) => d.id === local.sel)) ?? leader(s);
    const myVote = s.designs.find((d) => d.votes.includes(me));
    const draft = { color: local.color, art: ARTS[local.art % ARTS.length]!, line: local.line.trim() || "your line here", at: 0 };
    const shown = local.edit ? draft : sel ? { color: sel.color, art: sel.art, line: sel.line, at: sel.at } : { color: 0, art: "flask" as Art, line: "your line here", at: 0 };
    const label = local.edit ? `Your shirt: ${draft.line}` : `${s.designs.length} shirts on the line${sel ? `; showing ${sel.name}'s, "${sel.line}", ${sel.votes.length} votes` : ""}`;
    const startEdit = () => setLocal({ edit: true, color: mine?.color ?? 1, art: mine ? ARTS.indexOf(mine.art) : 0, line: mine?.line ?? "" });
    const hang = () => {
      const line = local.line.trim();
      if (!line) return;
      haptic("success");
      setLocal({ edit: false, sel: "mine", toast: local.toast + 1, msg: "Your shirt is on the line" });
      dispatch({ t: "hang", color: local.color, art: ARTS[local.art % ARTS.length]!, line });
    };

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.sub} />
        <div style={{ position: "relative", height: CH }}>
          <Canvas height={CH} label={label} draw={(g, f) => drawScene(g, f, s, me, shown, local.edit ? "" : sel?.id ?? "")} />
          {local.edit ? (
            <button
              type="button"
              aria-label="Change the picture"
              onClick={() => { haptic("light"); setLocal({ art: (local.art + 1) % ARTS.length }); }}
              style={{ position: "absolute", left: W / 2 - 70, top: LINE + 10, width: 140, height: TEE - 16, borderRadius: 12 }}
            />
          ) : (
            s.designs.map((d, i) => (
              <button
                key={d.id}
                type="button"
                aria-label={`${d.name}'s shirt, "${d.line}", ${d.votes.length} votes`}
                aria-pressed={sel?.id === d.id}
                onClick={() => { haptic("light"); setLocal({ sel: d.id }); }}
                style={{ position: "absolute", left: x0 + slot * i + slot / 2 - 22, top: 6, width: 44, height: 52, display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}
              >
                <Avatar user={{ id: d.who, name: d.name }} size={16} />
              </button>
            ))
          )}
        </div>
        {local.edit ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
              {[0, 1, 2, 3, 4, 5].map((k) => (
                <button key={k} type="button" aria-label={`Shirt color ${k + 1}`} aria-pressed={local.color === k} onClick={() => setLocal({ color: k })} style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ width: 28, height: 28, borderRadius: 99, background: shirt(theme, k), boxShadow: local.color === k ? `0 0 0 2px ${c.card}, 0 0 0 4px ${c.primary}` : `0 0 0 1px ${c.divider}` }} />
                </button>
              ))}
            </div>
            <input aria-label="The line on your shirt" placeholder="The line on the shirt" value={local.line} maxLength={32} onInput={(e: Event) => setLocal({ line: (e.currentTarget as HTMLInputElement).value })} onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && hang()} />
            <div style={{ display: "flex", gap: 8 }}>
              <Button kind="secondary" onClick={() => setLocal({ edit: false })}>
                Cancel
              </Button>
              <Button kind="primary" wide disabled={!local.line.trim()} onClick={hang}>
                Hang it
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36, marginTop: 4, minWidth: 0 }}>
              {sel ? (
                <>
                  <span style={{ fontSize: 13, lineHeight: "16px", color: c.text, minWidth: 0, flex: 1, ...ell }}>
                    <b>{sel.who === me ? "Yours" : `${first(sel.name)}'s`}</b>
                    {` · ${sel.votes.length} ${sel.votes.length === 1 ? "vote" : "votes"}${leader(s)?.id === sel.id && sel.votes.length ? " · leading" : ""}`}
                  </span>
                  {sel.votes.length ? <Facepile users={sel.votes.map((v) => ({ id: v, name: v.startsWith("~") ? v.slice(1) : members.find((mm) => mm.id === v)?.name ?? "Friend" }))} max={4} size={20} /> : null}
                </>
              ) : (
                <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>No shirts on the line yet. Make the first one.</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <Button kind={sel ? "secondary" : "primary"} wide onClick={startEdit}>
                {mine ? "Edit yours" : "Make yours"}
              </Button>
              {sel ? (
                <Button kind="primary" wide onClick={() => { haptic(sel.votes.includes(me) ? "light" : "success"); dispatch({ t: "vote", id: sel.id }); }}>
                  {sel.votes.includes(me) ? "Voted" : myVote ? "Move my vote" : "Vote for this"}
                </Button>
              ) : null}
            </div>
          </>
        )}
        {local.toast > 0 ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
