import {
  defineApp,
  Avatar,
  Button,
  Burst,
  CardHeader,
  OptionRow,
  Scene,
  Thumb,
  Toast,
  circle,
  clock,
  ellipse,
  fitText,
  h,
  haptic,
  innerWidth,
  line,
  mix,
  pal,
  path,
  rect,
  running,
  spring,
  springs,
  thumbKind,
  type Child,
  type Ctx,
  type Meta,
  type Theme,
} from "@muse/app";

// Caption this: a drawn photo from the trip and the chat's captions as a poll. When everyone has
// voted (or someone reveals), the winning caption is written onto the photo; then the next photo.

type Scene = "beach" | "camp" | "other";
type Params = { photos: { place: string; scene: Scene; captions: { by: string; text: string; voters: string[] }[] }[] };

// @params
const P: Params = {
  photos: [
    {
      place: "Gulf Shores, day 2",
      scene: "beach",
      captions: [
        { by: "Priya", text: "Theo's final form: low maintenance", voters: [] },
        { by: "Noa", text: "He said he wanted to ‘ground himself’", voters: ["Priya", "Theo"] },
        { by: "Dev", text: "Sunscreen: 0. Theo: also 0.", voters: ["Jonah"] },
        { by: "Jonah", text: "Tide comes in at 4. We leave at 3:55", voters: ["Dev", "Noa"] },
      ],
    },
    {
      place: "Smoky Mtns, night 1",
      scene: "camp",
      captions: [
        { by: "Theo", text: "Jonah set up the tent. Jonah is now the tent.", voters: ["Noa"] },
        { by: "Dev", text: "5-star glamping, 0-star engineering", voters: ["Priya", "Theo"] },
        { by: "Noa", text: "We asked if he needed help. “I got it”", voters: ["Jonah"] },
        { by: "Priya", text: "The bears are not the threat here", voters: ["Dev"] },
      ],
    },
  ],
};
// @end params

type Caption = { id: string; by: string; text: string };
type Photo = { place: string; scene: Scene; captions: Caption[]; votes: { user: string; caption: string }[]; won: null | { caption: string; at: number } };
type State = { photos: Photo[]; i: number; at: number };
type Action = { t: "vote"; caption: string } | { t: "reveal" } | { t: "next" } | { t: "add"; text: string };
type Local = { draft: string; writing: boolean; bursts: number };

const MAX_PHOTOS = 3;
const MAX_CAPTIONS = 6;
const MAX_TEXT = 90;
const RISE = spring(springs.ios);
const BAND_H = 36;

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const clean = (s: unknown) => (typeof s === "string" ? s.trim() : "");

const countOf = (p: Photo, id: string) => p.votes.filter((v) => v.caption === id).length;
const voteOf = (p: Photo, u: string) => p.votes.find((v) => v.user === u);
/** Most votes; ties go to the caption that appears first. */
function winner(p: Photo): string | null {
  let best: Caption | null = null;
  let top = -1;
  for (const c of p.captions) {
    const n = countOf(p, c.id);
    if (n > top) {
      top = n;
      best = c;
    }
  }
  return best ? best.id : null;
}
const canVote = (p: Photo, u: string) => !voteOf(p, u) && p.captions.some((c) => c.by !== u);
/** Everyone who can vote has voted. */
const allIn = (p: Photo, ctx: Ctx) => p.captions.length > 0 && !ctx.members.some((m) => canVote(p, m.id));
const here = (s: State) => s.photos[s.i];

const setHere = (s: State, p: Photo): State => ({ ...s, photos: s.photos.map((x, k) => (k === s.i ? p : x)) });

function reduceCaption(s: State, a: Record<string, unknown>, meta: Meta, ctx: Ctx): State {
  const p = here(s);
  if (!p) return s;
  const user = meta.user;
  if (a.t === "vote") {
    const cap = typeof a.caption === "string" ? p.captions.find((c) => c.id === a.caption) : undefined;
    if (p.won !== null || !cap || cap.by === user || voteOf(p, user)) return s;
    const next: Photo = { ...p, votes: [...p.votes, { user, caption: cap.id }] };
    if (allIn(next, ctx)) next.won = { caption: winner(next)!, at: meta.time };
    return setHere(s, next);
  }
  if (a.t === "reveal") {
    if (p.won !== null || p.votes.length < 2) return s;
    return setHere(s, { ...p, won: { caption: winner(p)!, at: meta.time } });
  }
  if (a.t === "next") {
    if (p.won === null || s.i >= s.photos.length - 1) return s;
    return { ...s, i: s.i + 1, at: meta.time };
  }
  if (a.t === "add") {
    const text = clean(a.text);
    if (p.won !== null || text.length < 1 || text.length > MAX_TEXT) return s;
    if (p.captions.some((c) => c.by === user) || p.captions.length >= MAX_CAPTIONS) return s;
    return setHere(s, { ...p, captions: [...p.captions, { id: `c${meta.seq}`, by: user, text }] });
  }
  return s;
}

const firstName = (members: { id: string; name?: string }[], id: string) => (members.find((m) => m.id === id)?.name ?? "").trim().split(/\s+/)[0] || "Someone";

export default defineApp<State, Action, Local>({
  name: "Caption this",

  summary: (s, ctx) => {
    const p = here(s);
    if (!p || p.captions.length === 0) return "Caption this · add a caption";
    const author = (id: string) => firstName(ctx.members, p.captions.find((c) => c.id === id)?.by ?? "");
    if (p.won) {
      return s.i >= s.photos.length - 1 ? `Caption this · ${author(p.won.caption)} won the last photo` : `Caption this · ${author(p.won.caption)} won photo ${s.i + 1}`;
    }
    return `Caption this · photo ${s.i + 1} of ${s.photos.length} · ${p.votes.length} of ${ctx.members.length} voted`;
  },

  init: (ctx) => {
    const match = (name: string) => {
      const want = name.trim().toLowerCase();
      return want ? ctx.members.find((m) => m.id === name || (m.name ?? "").toLowerCase() === want)?.id : undefined;
    };
    const photos: Photo[] = P.photos.slice(0, MAX_PHOTOS).map((ph, pi) => {
      const used = new Set<string>();
      const captions: Caption[] = [];
      const votes: { user: string; caption: string }[] = [];
      const voted = new Set<string>();
      const wants: { id: string; voters: string[] }[] = [];
      for (const c of ph.captions) {
        const text = clean(c.text);
        const by = match(c.by);
        if (!by || used.has(by) || text.length < 1 || text.length > MAX_TEXT || captions.length >= MAX_CAPTIONS) continue;
        used.add(by);
        const id = `p${pi}c${captions.length}`;
        captions.push({ id, by, text });
        wants.push({ id, voters: c.voters });
      }
      for (const w of wants) {
        const by = captions.find((c) => c.id === w.id)!.by;
        for (const name of w.voters) {
          const u = match(name);
          if (!u || u === by || voted.has(u)) continue;
          voted.add(u);
          votes.push({ user: u, caption: w.id });
        }
      }
      const scene: Scene = ph.scene === "beach" || ph.scene === "camp" ? ph.scene : "other";
      return { place: clean(ph.place).slice(0, 32), scene, captions, votes, won: null };
    });
    return { photos, i: 0, at: 0 };
  },

  reduce: (state, action, meta, ctx) => (inChat(ctx, meta.user) ? reduceCaption(state, action as unknown as Record<string, unknown>, meta, ctx) : state),

  // Someone left: on photos still open their votes go, and so do their captions with the votes for them.
  onMembers: (state, ctx) => {
    let changed = false;
    const photos = state.photos.map((p) => {
      if (p.won) return p;
      const captions = p.captions.filter((c) => inChat(ctx, c.by));
      const ids = new Set(captions.map((c) => c.id));
      const votes = p.votes.filter((v) => inChat(ctx, v.user) && ids.has(v.caption));
      if (captions.length === p.captions.length && votes.length === p.votes.length) return p;
      changed = true;
      return { ...p, captions, votes };
    });
    return changed ? { ...state, photos } : state;
  },

  invariants: {
    "one vote per person per photo": (s) => s.photos.every((p) => new Set(p.votes.map((v) => v.user)).size === p.votes.length),
    "nobody votes for their own caption": (s) => s.photos.every((p) => p.votes.every((v) => p.captions.find((c) => c.id === v.caption)?.by !== v.user)),
    "votes point at real captions": (s) => s.photos.every((p) => p.votes.every((v) => p.captions.some((c) => c.id === v.caption))),
    "one caption per author per photo, at most 6, ids unique": (s) =>
      s.photos.every((p) => p.captions.length <= MAX_CAPTIONS && new Set(p.captions.map((c) => c.by)).size === p.captions.length && new Set(p.captions.map((c) => c.id)).size === p.captions.length),
    "the winner is a real caption": (s) => s.photos.every((p) => !p.won || p.captions.some((c) => c.id === p.won!.caption)),
    "the winner has the most votes": (s) =>
      s.photos.every((p) => {
        if (!p.won) return true;
        const top = Math.max(...p.captions.map((c) => countOf(p, c.id)));
        return countOf(p, p.won.caption) === top;
      }),
    "ties go to the first caption": (s) =>
      s.photos.every((p) => {
        if (!p.won) return true;
        const k = p.captions.findIndex((c) => c.id === p.won!.caption);
        return p.captions.slice(0, Math.max(0, k)).every((c) => countOf(p, c.id) < countOf(p, p.won!.caption));
      }),
    "photos before the current one are decided": (s) => s.photos.slice(0, s.i).every((p) => p.won) && s.photos.slice(s.i + 1).every((p) => !p.won),
    "index in range": (s) => (s.photos.length === 0 ? s.i === 0 : s.i >= 0 && s.i < s.photos.length && Number.isInteger(s.i)),
    "open photos hold only people in the chat": (s, ctx) => s.photos.every((p) => p.won || (p.captions.every((c) => inChat(ctx, c.by)) && p.votes.every((v) => inChat(ctx, v.user)))),
    "times are whole server times": (s) => Number.isInteger(s.at) && s.at >= 0 && s.photos.every((p) => !p.won || (Number.isInteger(p.won.at) && p.won.at > 0)),
  },

  transitions: {
    "a vote adds exactly the actor's vote on the current photo": (p, n, a, m) => {
      if (a.t !== "vote" || p === n) return true;
      const before = p.photos[p.i]!;
      const after = n.photos[n.i]!;
      return (
        n.i === p.i &&
        n.at === p.at &&
        before.won === null &&
        JSON.stringify(after.votes) === JSON.stringify([...before.votes, { user: m.user, caption: a.caption }]) &&
        JSON.stringify(after.captions) === JSON.stringify(before.captions) &&
        p.photos.every((x, k) => k === p.i || x === n.photos[k])
      );
    },
    "decided photos never change": (p, n) => p.photos.every((x, k) => !x.won || JSON.stringify(x) === JSON.stringify(n.photos[k])),
    "the vote that completes the room decides it at that moment": (p, n, a, m, ctx) => {
      if (a.t !== "vote" || p === n) return true;
      const nP = n.photos[n.i]!;
      return allIn(nP, ctx) ? nP.won?.at === m.time : nP.won === null;
    },
    "reveal needs two votes and only sets the winner": (p, n, a, m) => {
      if (a.t !== "reveal" || p === n) return true;
      const before = p.photos[p.i]!;
      const after = n.photos[n.i]!;
      return before.votes.length >= 2 && before.won === null && after.won?.at === m.time && n.i === p.i && JSON.stringify({ ...after, won: null }) === JSON.stringify(before);
    },
    "next only after a winner, by one": (p, n, a, m) => a.t !== "next" || p === n || (p.photos[p.i]!.won !== null && n.i === p.i + 1 && n.at === m.time && n.photos === p.photos),
    "an added caption is the actor's, at the end, with no votes": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const before = p.photos[p.i]!;
      const after = n.photos[n.i]!;
      const last = after.captions[after.captions.length - 1];
      return after.captions.length === before.captions.length + 1 && last?.by === m.user && last.id === `c${m.seq}` && last.text === String(a.text).trim() && after.votes === before.votes && after.won === null;
    },
    "only people in the chat play": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const p = here(s);
    if (!p) return { t: "next" };
    if (p.won) return { t: "next" };
    const k = r.next();
    if (!p.captions.length || (!p.captions.some((c) => c.by === user) && k < 0.35)) return { t: "add", text: r.pick(["Peak vacation", "Core memory unlocked", "Not pictured: the plan"]) };
    if (k < 0.8 && p.captions.length) return { t: "vote", caption: r.pick(p.captions).id };
    if (k < 0.82) return { t: "reveal" };
    if (k < 0.92) return { t: "add", text: r.pick(["Peak vacation", "Core memory unlocked", "Not pictured: the plan"]) };
    return { t: "next" };
  },

  local: { draft: "", writing: false, bursts: 0 },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const s = confirmed;
    const photo = here(s);
    const W = theme.width;
    const emptyTrip = !photo;
    const place = photo?.place || "The trip";
    const sceneKind: Scene = photo ? photo.scene : "beach";
    const captions = photo?.captions ?? [];
    const crowded = captions.length >= MAX_CAPTIONS;
    const PH = W < 360 || crowded ? 96 : 112;
    const myPhoto = state.photos[s.i];
    const myVote = myPhoto ? voteOf(myPhoto, me)?.caption : undefined;
    const name = (id: string) => firstName(members, id);

    // Motion: all from confirmed facts.
    const won = photo?.won ?? null;
    const winC = won ? photo!.captions.find((x) => x.id === won.caption) : undefined;
    const since = won ? running(won.at, 1500) : null;
    const rise = since === null ? 1 : RISE(since);
    const typed = won && since !== null ? Math.max(0, Math.min(1, (since - 300) / 800)) : 1;
    const slideE = s.at > 0 ? running(s.at, RISE.duration) : null;
    const slide = slideE === null ? 1 : RISE(slideE);
    const t = clock.value / 1000;

    const art = sceneKind === "beach" ? beach(W - 24, PH, t, theme) : sceneKind === "camp" ? camp(W - 24, PH, t, theme) : [];

    const band = (() => {
      if (!won || !winC) return null;
      const inner = innerWidth();
      const f = fitText(`“${winC.text}”`, inner - 54, { size: 15, min: 13, weight: 600 });
      const n = Math.ceil(f.text.length * typed);
      return (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: BAND_H, transform: `translateY(${(1 - rise) * BAND_H}px)`, display: "flex", alignItems: "center", gap: 8, padding: "0 10px" }}>
          <div style={{ position: "absolute", inset: 0, background: c.card, opacity: 0.92 }} />
          <span style={{ position: "relative", display: "flex" }}>
            <Avatar user={winC.by} size={20} />
          </span>
          <span style={{ position: "relative", fontSize: f.size, lineHeight: "20px", fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{f.text.slice(0, n)}</span>
        </div>
      );
    })();

    const picture = (
      <div style={{ transform: `translateY(${(slide - 1) * 24}px)`, opacity: 0.3 + 0.7 * slide }}>
        <Scene height={PH} bg={c.input} radius={12} label={`Drawn photo: ${place}`} art={art}>
          {sceneKind === "other" ? (
            <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", display: "flex" }}>
              <Thumb kind={thumbKind(place, "park")} size={72} label="Photo" />
            </span>
          ) : null}
          {band}
        </Scene>
      </div>
    );

    const post = () => {
      const text = local.draft.trim();
      if (!text) return;
      dispatch({ t: "add", text });
      setLocal({ draft: "", writing: false });
    };
    const writer = (placeholder: string) => (
      <form
        style={{ display: "flex", alignItems: "center", gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          post();
        }}
      >
        <input style={{ flex: 1, minWidth: 0 }} value={local.draft} maxLength={MAX_TEXT} placeholder={placeholder} aria-label={placeholder} onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
        <Button kind="primary" onClick={post}>
          Post
        </Button>
      </form>
    );

    // Footer
    const remaining = photo ? members.filter((m) => canVote(photo, m.id)) : [];
    const v = photo?.votes.length ?? 0;
    const n = members.length;
    const iVoted = !!photo && !!voteOf(photo, me);
    const last = remaining.length === 1 && remaining[0]!.id === me;
    const status = (() => {
      if (!photo) return "";
      if (won && winC) {
        const who = name(winC.by);
        const mine = voteOf(photo, me);
        if (winC.by === me) return "You win.";
        return !mine ? `${who} wins.` : mine.caption === winC.id ? `${who} wins. Your vote sealed it.` : `${who} wins. You were outvoted.`;
      }
      if (v === 0 && !captions.length) return "";
      if (!iVoted) return last ? `${v} of ${n} voted · you're the deciding vote` : `${v} of ${n} voted`;
      const names = remaining.map((m) => firstName(members, m.id));
      if (!names.length) return `${v} of ${n} voted`;
      const shown = names.slice(0, 2).join(", ") + (names.length > 2 ? ` +${names.length - 2}` : "");
      return `${v} of ${n} voted · waiting on ${shown}`;
    })();
    const waitingOnly = !!photo && !won && captions.length > 0 && v === 0 && n <= 1;
    const isLast = s.i >= s.photos.length - 1;
    const canAdd = !!photo && !won && captions.length < MAX_CAPTIONS && !captions.some((x) => x.by === me);

    const vote = (cid: string) => {
      if (!photo || won) return;
      const cap = photo.captions.find((x) => x.id === cid);
      if (!cap || cap.by === me || iVoted) return;
      if (last) {
        setLocal({ bursts: local.bursts + 1 });
        haptic("success");
      }
      dispatch({ t: "vote", caption: cid });
    };

    const rows = captions.map((cap) => (
      <OptionRow
        key={cap.id}
        label={<span style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden", whiteSpace: "normal", lineHeight: "18px" }}>{cap.text}</span>}
        count={photo ? countOf(photo, cap.id) : 0}
        total={Math.max(1, v)}
        voters={photo ? photo.votes.filter((x) => x.caption === cap.id).map((x) => x.user) : []}
        selected={myVote === cap.id}
        onClick={() => vote(cap.id)}
      />
    ));

    const footer = (() => {
      if (emptyTrip || !captions.length) return null;
      if (won) {
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 40 }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text }}>{isLast ? `That's a wrap. ${status.replace(/^(\S+) wins\..*$/, "$1 wins.")}` : status}</div>
            {!isLast ? (
              <Button kind="primary" onClick={() => dispatch({ t: "next" })}>
                Next photo
              </Button>
            ) : null}
          </div>
        );
      }
      if (local.writing) {
        return <div style={{ minHeight: 40, display: "flex", alignItems: "center" }}><div style={{ flex: 1 }}>{writer("Your caption")}</div></div>;
      }
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 40 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>{waitingOnly ? "Waiting for votes" : status}</div>
          {canAdd ? (
            <Button kind="deemphasized" onClick={() => setLocal({ writing: true })}>
              Add caption
            </Button>
          ) : null}
          {v >= 2 ? (
            <Button kind="secondary" onClick={() => {
              setLocal({ bursts: local.bursts + 1 });
              haptic("success");
              dispatch({ t: "reveal" });
            }}>
              Reveal
            </Button>
          ) : null}
        </div>
      );
    })();

    const subtitle = emptyTrip ? "Add a caption to start" : `Photo ${s.i + 1} of ${s.photos.length} · ${place}`;
    return (
      <div style={{ position: "relative" }}>
        <CardHeader title="Caption this" subtitle={subtitle} />
        {picture}
        <div style={{ marginTop: 8 }}>
          {captions.length ? rows : <div style={{ minHeight: 44, display: "flex", alignItems: "center" }}><div style={{ flex: 1 }}>{writer("Write the first caption")}</div></div>}
        </div>
        {footer}
        {local.bursts ? (
          <div style={{ position: "absolute", left: "50%", top: 160, width: 0 }}>
            <Burst key={local.bursts} emoji="❤️" />
          </div>
        ) : null}
        {won && since !== null && winC ? <Toast key={won.at}>{`${name(winC.by)}'s caption won`}</Toast> : null}
      </div>
    );
  },
});

// ---- Drawn scenes ----

const rd = (x: number) => Math.round(x * 10) / 10;
const poly = (pts: [number, number][], fill: string, a?: Record<string, unknown>) => path(`M${pts.map((q) => `${rd(q[0])},${rd(q[1])}`).join("L")}Z`, fill, a);
const grad = (id: string, a: string, b: string) =>
  h("linearGradient", { id, x1: 0, y1: 0, x2: 0, y2: 1 }, h("stop", { offset: 0, "stop-color": a }), h("stop", { offset: 1, "stop-color": b }));

function beach(w: number, hh: number, t: number, theme: Theme): Child[] {
  const p = pal(theme);
  const card = theme.color.card;
  const seaTop = hh * 0.46;
  const seaBot = hh * 0.62;
  const hx = 0.4 * w;
  const hy = hh - 52;
  const sand = mix(p.yellow, card, 0.45);
  const body = mix(p.yellow, p.crust, 0.5);
  const skin = mix(p.orange, card, 0.35);
  const out: Child[] = [];
  out.push(h("defs", null, grad("cc-sky", mix(p.red, card, 0.45), p.cream), grad("cc-sea", p.blue, mix(p.blue, card, 0.35))));
  out.push(rect(0, 0, w, seaTop + 1, 0, "url(#cc-sky)"));
  out.push(circle(0.25 * w, 0.45 * hh, 22, mix(p.yellow, card, 0.65)));
  out.push(rect(0, seaTop, w, seaBot - seaTop, 0, "url(#cc-sea)"));
  for (let k = 0; k < 3; k++) {
    const y0 = seaTop + 6 + 7 * k;
    let d = "";
    for (let j = 0; j <= 30; j++) d += `${j ? "L" : "M"}${rd((w * j) / 30)},${rd(y0 + Math.sin(0.9 * j + 2 * t + k) * 1.5)}`;
    out.push(path(d, "none", { stroke: card, "stroke-width": 1.2, opacity: 0.6 }));
  }
  out.push(rect(0, seaBot, w, hh - seaBot, 0, sand));
  out.push(rect(0, seaBot - 1.5, w, 3, 0, card));
  // sand body with a mermaid tail, rings
  out.push(ellipse(hx + 42, hy + 22, 52, 16, body));
  out.push(poly([[hx + 90, hy + 22], [hx + 118, hy + 6], [hx + 112, hy + 22]], body));
  out.push(poly([[hx + 90, hy + 22], [hx + 112, hy + 22], [hx + 118, hy + 38]], body));
  for (let k = 0; k < 5; k++) out.push(circle(hx + 14 + 14 * k, hy + 22, 5, "none", { stroke: p.crust, "stroke-width": 1 }));
  // buried friend
  out.push(circle(hx, hy, 15, skin));
  out.push(ellipse(hx, hy - 10, 15, 7, p.dark));
  out.push(rect(hx - 11, hy - 3, 10, 6, 3, p.dark));
  out.push(rect(hx + 1, hy - 3, 10, 6, 3, p.dark));
  out.push(circle(hx - 9, hy + 6, 3, p.red, { opacity: 0.7 }));
  out.push(circle(hx + 9, hy + 6, 3, p.red, { opacity: 0.7 }));
  out.push(line(hx - 3, hy + 10, hx + 3, hy + 10, p.brown, 1.5));
  // sandcastle
  const bx = w - 34;
  const by = hh - 18;
  out.push(rect(bx - 20, by - 26, 40, 26, 2, mix(p.yellow, p.crust, 0.5)));
  for (let k = 0; k < 4; k++) out.push(rect(bx - 20 + k * 11, by - 33, 7, 7, 1, mix(p.yellow, p.crust, 0.5)));
  out.push(line(bx + 4, by - 33, bx + 4, by - 49, p.brown, 1.5));
  const fl = Math.sin(t * 4) * 2;
  out.push(poly([[bx + 4, by - 49], [bx + 16, by - 45 + fl], [bx + 4, by - 41]], p.red));
  // seagull
  const gx = ((22 * t) % (w + 60)) - 30;
  const gy = 26 + 3 * Math.sin(2 * t);
  const wing = 5 * Math.sin(9 * t);
  out.push(path(`M${rd(gx - 10)},${rd(gy - wing)}L${rd(gx - 4)},${rd(gy - wing / 2 - 3)}L${rd(gx)},${rd(gy)}`, "none", { stroke: p.dark, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  out.push(path(`M${rd(gx)},${rd(gy)}L${rd(gx + 4)},${rd(gy - wing / 2 - 3)}L${rd(gx + 10)},${rd(gy - wing)}`, "none", { stroke: p.dark, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  out.push(rect(gx - 3.5, gy + 4, 7, 2.5, 1, p.yellow));
  return out;
}

function camp(w: number, hh: number, t: number, theme: Theme): Child[] {
  const p = pal(theme);
  const card = theme.color.card;
  const skyEnd = mix(p.purple, p.dark, 0.5);
  const out: Child[] = [];
  out.push(h("defs", null, grad("cc-night", p.dark, skyEnd)));
  out.push(rect(0, 0, w, hh, 0, "url(#cc-night)"));
  for (let k = 0; k < 14; k++) out.push(circle((((k * 53) % 260) / 260) * w, (k * 37) % 70, 1.2, card, { opacity: rd(0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + k))) }));
  out.push(circle(w - 36, 26, 14, p.cream));
  out.push(circle(w - 30, 22, 12, mix(p.dark, skyEnd, 0.22)));
  const pine = mix(p.green, p.dark, 0.7);
  for (let k = 0; k < 6; k++) {
    const x = 10 + 52 * k;
    const ht = [50, 64, 78][k % 3]!;
    out.push(poly([[x, hh - 36], [x + 36, hh - 36], [x + 18, hh - 36 - ht]], pine));
  }
  out.push(rect(0, hh - 38, w, 38, 0, mix(p.green, p.dark, 0.55)));
  // collapsed tent
  const cx = 0.36 * w;
  out.push(poly([[cx - 44, hh - 16], [cx - 20, hh - 44], [cx + 6, hh - 30], [cx + 34, hh - 40], [cx + 50, hh - 16]], p.orange));
  out.push(poly([[cx - 20, hh - 44], [cx + 6, hh - 30], [cx - 4, hh - 16], [cx - 44, hh - 16]], mix(p.orange, p.dark, 0.2)));
  out.push(line(cx - 20, hh - 44, cx - 26, hh - 62, p.soft, 2));
  for (const [dx, ph] of [[62, 0], [70, 1.5]] as const) {
    const rot = Math.sin(t * 3 + ph) * 0.25 * (180 / Math.PI);
    out.push(poly([[cx + dx - 3, hh - 24], [cx + dx + 3, hh - 24], [cx + dx + 4, hh - 14], [cx + dx - 4, hh - 14]], p.paper, { stroke: p.dark, "stroke-width": 1, transform: `rotate(${rd(rot)} ${rd(cx + dx)} ${rd(hh - 14)})` }));
  }
  const zy = (t * 8) % 24;
  const zs = 0.6 + (zy / 24) * 0.5;
  out.push(path(`M${rd(cx + 56)},${rd(hh - 40 - zy)}h${rd(6 * zs)}l${rd(-6 * zs)},${rd(7 * zs)}h${rd(6 * zs)}`, "none", { stroke: card, "stroke-width": 1.4, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: rd(1 - zy / 30) }));
  // campfire
  const fx = w - 58;
  const fy = hh - 30;
  out.push(circle(fx, fy, 26, p.orange, { opacity: 0.12 }));
  out.push(line(fx - 12, fy + 10, fx + 12, fy + 4, p.brown, 4));
  out.push(line(fx - 12, fy + 4, fx + 12, fy + 10, p.brown, 4));
  out.push(circle(fx, fy - 2, 12 + Math.sin(t * 9) * 1.2, p.orange));
  out.push(circle(fx, fy, 7 + Math.sin(t * 11 + 1) * 1, p.yellow));
  out.push(line(fx + 10, fy - 28, fx + 30, fy - 8, p.brown, 1.5));
  out.push(circle(fx + 10, fy - 28, 3, p.cream));
  return out;
}
