import {
  defineApp,
  Avatar,
  Burst,
  Button,
  CardHeader,
  Facepile,
  Toast,
  clock,
  fitText,
  haptic,
  innerWidth,
  mix,
  pal,
  running,
  seedOf,
  type Child,
  type Member,
  type Theme,
} from "@muse/app";

// "The weekend dump": 87 photos curated to the album. A 5 x 3 grid of drawn photo tiles (picked ones
// checked, rejects greyed with why), a check that everyone shows up at least twice, then the album plays
// as a story with the chat's captions. Picks are shared; the story is per viewer.

type Scene = "honky-tonk" | "hot-chicken" | "rooftop" | "waffles" | "car" | "pool" | "dance" | "brunch";
type Verdict = "pick" | "open" | "reject";
type Photo = { scene: Scene; people: string[]; when: string; order: number; caption: string; verdict: Verdict; why: string };
type Params = {
  /** Card title: "The weekend dump" */
  title: string;
  /** Photos in the dump. */
  total: number;
  /** Album size. */
  target: number;
  /** Album name on the story cover. */
  album: string;
  /** Names to cover (everyone shows up at least twice). */
  friends: string[];
  /** Appearances per friend among photos already kept. */
  kept: number[];
  /** Photos already kept. */
  keptN: number;
  /** Up to 15 drawn photos. */
  photos: Photo[];
  /** Names who saved it. */
  savedBy: string[];
};

// @params
const P: Params = {
  title: "The weekend dump",
  total: 87,
  target: 20,
  album: "Senior yr or never",
  friends: ["Priya", "Sam", "Ana", "Nico", "Jess", "Leo"],
  kept: [2, 2, 1, 2, 1, 1],
  keptN: 9,
  photos: [
    { scene: "honky-tonk", people: ["Priya", "Sam", "Ana"], when: "Fri · 10 PM", order: 2, caption: "first round. Sam already lost his hat", verdict: "pick", why: "" },
    { scene: "honky-tonk", people: ["Sam"], when: "Fri · 10 PM", order: 3, caption: "", verdict: "reject", why: "blurry" },
    { scene: "car", people: ["Nico", "Leo", "Priya"], when: "Fri · 6 PM", order: 1, caption: "the playlist war began at exit 12", verdict: "pick", why: "" },
    { scene: "hot-chicken", people: ["Ana", "Leo"], when: "Sat · 1 PM", order: 6, caption: "Leo: \"medium is fine\". it was not fine", verdict: "pick", why: "" },
    { scene: "hot-chicken", people: ["Ana", "Leo"], when: "Sat · 1 PM", order: 7, caption: "", verdict: "reject", why: "dup" },
    { scene: "rooftop", people: ["Priya", "Nico", "Sam", "Ana"], when: "Sat · 7 PM", order: 8, caption: "THE golden hour one (Ana's words)", verdict: "pick", why: "" },
    { scene: "dance", people: ["Sam", "Leo", "Jess"], when: "Sat · 11 PM", order: 10, caption: "Jess requested the same song 4 times", verdict: "open", why: "" },
    { scene: "pool", people: ["Nico", "Ana"], when: "Sun · 11 AM", order: 13, caption: "recovery float, zero thoughts", verdict: "pick", why: "" },
    { scene: "waffles", people: ["Sam", "Priya"], when: "Sat · 2 AM", order: 5, caption: "Sam's 2am waffle speech (12 min)", verdict: "pick", why: "" },
    { scene: "dance", people: ["Priya", "Ana"], when: "Sat · 11 PM", order: 11, caption: "", verdict: "reject", why: "eyes shut" },
    { scene: "brunch", people: ["Leo", "Nico", "Ana", "Priya"], when: "Sun · 12 PM", order: 14, caption: "bottomless was a dare", verdict: "pick", why: "" },
    { scene: "rooftop", people: ["Sam", "Leo"], when: "Sat · 7 PM", order: 9, caption: "Leo pretending to be a tour guide", verdict: "pick", why: "" },
    { scene: "car", people: ["Ana"], when: "Sun · 4 PM", order: 15, caption: "", verdict: "reject", why: "thumb" },
    { scene: "pool", people: ["Priya", "Sam", "Leo", "Nico"], when: "Sun · 11 AM", order: 12, caption: "cannonball contest: Nico, by a lot", verdict: "pick", why: "" },
    { scene: "honky-tonk", people: ["Nico", "Ana"], when: "Fri · 11 PM", order: 4, caption: "line dancing (attempted)", verdict: "pick", why: "" },
  ],
  savedBy: ["Priya", "Sam", "Ana"],
};
// @end params

type State = {
  title: string;
  total: number;
  target: number;
  album: string;
  friends: string[];
  kept: number[];
  keptN: number;
  photos: Photo[];
  picks: number[];
  savers: string[];
  savedBy: string[];
  last: { i: number; at: number; by: string } | null;
  doneAt: number;
};
type Action = { t: "pick"; i: number } | { t: "save" };
type Local = { story: boolean; idx: number; at: number };

const SCENES: Scene[] = ["honky-tonk", "hot-chicken", "rooftop", "waffles", "car", "pool", "dance", "brunch"];
const VERDICTS: Verdict[] = ["pick", "open", "reject"];
const SEG_MS = 3200;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const int = (v: unknown, lo: number, hi: number, dflt: number) => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : dflt);
const count = (s: State, f: number) => (s.kept[f] ?? 0) + s.picks.filter((i) => s.photos[i]?.people.includes(s.friends[f]!)).length;
const total = (s: State) => s.keptN + s.picks.length;
const covered = (s: State) => s.friends.every((_, f) => count(s, f) >= 2);
const ready = (s: State) => covered(s) && total(s) === s.target;
const storyList = (s: State) => [...s.picks].sort((a, b) => s.photos[a]!.order - s.photos[b]!.order);
// Independent recount for the checks.
const recount = (s: State, who: string) => {
  let n = 0;
  const f = s.friends.indexOf(who);
  if (f >= 0) n += s.kept[f] ?? 0;
  for (const i of s.picks) if (s.photos[i]!.people.indexOf(who) !== -1) n++;
  return n;
};
const readyCopy = (s: State) => s.friends.every((f) => recount(s, f) >= 2) && s.keptN + s.picks.length === s.target;

function initState(): State {
  const photos: Photo[] = [];
  for (const raw of (P.photos ?? []).slice(0, 15)) {
    const people = (raw.people ?? []).map((n) => clean(n, 12)).filter(Boolean).slice(0, 4);
    if (!people.length) continue;
    const verdict = VERDICTS.includes(raw.verdict) ? raw.verdict : "open";
    const why = clean(raw.why, 10) || (verdict === "reject" ? "meh" : "");
    photos.push({
      scene: SCENES.includes(raw.scene) ? raw.scene : "brunch",
      people,
      when: clean(raw.when, 14),
      order: Number.isInteger(raw.order) ? raw.order : 0,
      caption: clean(raw.caption, 60),
      verdict,
      why,
    });
  }
  const friends = (P.friends ?? []).map((n) => clean(n, 12)).filter(Boolean).slice(0, 8);
  const keptN = int(P.keptN, 0, 100, 0);
  const s: State = {
    title: clean(P.title, 40) || "Album",
    total: 0,
    target: int(P.target, 1, 40, 20),
    album: clean(P.album, 24),
    friends,
    kept: friends.map((_, i) => int(P.kept?.[i], 0, 20, 0)),
    keptN,
    photos,
    picks: photos.map((p, i) => (p.verdict === "pick" ? i : -1)).filter((i) => i >= 0),
    savers: [],
    savedBy: (P.savedBy ?? []).map((n) => clean(n, 12)).filter(Boolean).slice(0, 6),
    last: null,
    doneAt: 0,
  };
  s.total = Math.max(keptN + photos.length, int(P.total, 0, 9999, 0));
  s.doneAt = ready(s) ? 1 : 0;
  return s;
}

// ---------- drawing ----------

type El = Child;
const f1 = (n: number) => Math.round(n * 10) / 10;
type Look = { skin: number; hair: "dark" | "brown" | "series2"; style: "short" | "long" | "bun" | "curly" | "cap"; shirt: "s1" | "s2" | "s3" | "s5" | "s6" | "jess" | "leo" | number; cap?: "s3" };
const LOOKS: Record<string, Look> = {
  Priya: { skin: 2, hair: "dark", style: "long", shirt: "s2" },
  Sam: { skin: 0, hair: "brown", style: "cap", shirt: "s1", cap: "s3" },
  Ana: { skin: 1, hair: "brown", style: "bun", shirt: "s6" },
  Nico: { skin: 1, hair: "dark", style: "curly", shirt: "s5" },
  Jess: { skin: 0, hair: "series2", style: "long", shirt: "jess" },
  Leo: { skin: 3, hair: "dark", style: "short", shirt: "leo" },
};

function person(th: Theme, name: string, x: number, y: number, hr: number, closed: boolean, key: string): El {
  const c = th.color;
  const pl = pal(th);
  const look: Look = LOOKS[name] ?? { skin: 1, hair: "dark", style: "short", shirt: 1 + (seedOf(name) % 6) };
  const skins = [mix(c.series5, c.card, 0.62), mix(c.series5, c.card, 0.42), mix(c.series5, pl.dark, 0.2), mix(c.series5, pl.dark, 0.45)];
  const skin = skins[look.skin]!;
  const hair = look.hair === "dark" ? pl.dark : look.hair === "brown" ? pl.brown : c.series2;
  const ser = [c.series1, c.series2, c.series3, c.series4, c.series5, c.series6];
  const shirt =
    look.shirt === "s1" ? c.series1 : look.shirt === "s2" ? c.series2 : look.shirt === "s3" ? c.series3 : look.shirt === "s5" ? c.series5 : look.shirt === "s6" ? c.series6 : look.shirt === "jess" ? mix(c.series1, c.series3, 0.5) : look.shirt === "leo" ? mix(c.series6, c.series1, 0.4) : ser[(look.shirt as number) - 1]!;
  const cap = look.cap ? c.series3 : hair;
  const els: El[] = [];
  if (look.style === "long") els.push(<rect key="bk" x={f1(x - 1.08 * hr)} y={f1(y - 0.4 * hr)} width={f1(2.16 * hr)} height={f1(1.55 * hr)} rx={f1(0.5 * hr)} fill={hair} />);
  els.push(<rect key="sh" x={f1(x - 1.35 * hr)} y={f1(y + 1.75 * hr - 0.8 * hr)} width={f1(2.7 * hr)} height={f1(1.6 * hr)} rx={f1(0.8 * hr)} fill={shirt} />);
  els.push(<circle key="hd" cx={f1(x)} cy={f1(y)} r={f1(hr)} fill={skin} />);
  const capPath = (col: string, k: string) => (
    <path key={k} d={`M${f1(x - 1.01 * hr)} ${f1(y - 0.32 * hr)}A${f1(1.06 * hr)} ${f1(1.06 * hr)} 0 1 1 ${f1(x + 1.01 * hr)} ${f1(y - 0.32 * hr)}Z`} fill={col} />
  );
  if (look.style === "short" || look.style === "long") els.push(capPath(hair, "hc"));
  if (look.style === "bun") {
    els.push(capPath(hair, "hc"));
    els.push(<circle key="bun" cx={f1(x)} cy={f1(y - 1.05 * hr)} r={f1(0.42 * hr)} fill={hair} />);
  }
  if (look.style === "curly")
    for (let k = 0; k < 9; k++) {
      const a = Math.PI + (Math.PI * k) / 8;
      els.push(<circle key={`cu${k}`} cx={f1(x + Math.cos(a) * 0.92 * hr)} cy={f1(y + Math.sin(a) * 0.92 * hr)} r={f1(0.32 * hr)} fill={hair} />);
    }
  if (look.style === "cap") {
    els.push(capPath(cap, "hc"));
    els.push(<rect key="brim" x={f1(x - 0.2 * hr)} y={f1(y - 0.42 * hr)} width={f1(1.5 * hr)} height={f1(0.26 * hr)} rx={f1(0.1 * hr)} fill={c.series3} />);
  }
  const er = Math.max(1.2, 0.11 * hr);
  for (const sx of [-0.36, 0.36]) {
    if (closed) els.push(<path key={`e${sx}`} d={`M${f1(x + sx * hr - er * 1.4)} ${f1(y + 0.08 * hr)}q${f1(er * 1.4)} ${f1(er * 1.6)} ${f1(er * 2.8)} 0`} fill="none" stroke={pl.dark} stroke-width={f1(Math.max(1, 0.07 * hr))} stroke-linecap="round" />);
    else els.push(<circle key={`e${sx}`} cx={f1(x + sx * hr)} cy={f1(y + 0.08 * hr)} r={f1(er)} fill={pl.dark} />);
  }
  els.push(<path key="sm" d={`M${f1(x - 0.26 * hr)} ${f1(y + 0.27 * hr)}Q${f1(x)} ${f1(y + 0.55 * hr)} ${f1(x + 0.26 * hr)} ${f1(y + 0.27 * hr)}`} fill="none" stroke={pl.dark} stroke-width={f1(Math.max(1, 0.08 * hr))} stroke-linecap="round" />);
  return <g key={key}>{els}</g>;
}

/** One drawn photo in a w x h box (viewBox 0 0 w h). `id` keeps the gradient ids unique. */
function photoArt(th: Theme, ph: Photo, w: number, h: number, id: string, idx: number, scale = h / 71): El {
  const c = th.color;
  const pl = pal(th);
  const u = scale;
  const ground = 0.72 * h;
  const grads: Record<Scene, [string, string]> = {
    "honky-tonk": [mix(c.series5, pl.dark, 0.75), mix(c.series5, pl.dark, 0.55)],
    "hot-chicken": [c.series5, c.series4],
    rooftop: [mix(c.series5, c.card, 0.35), mix(c.series2, c.card, 0.3)],
    waffles: [mix(c.series2, c.card, 0.35), c.series2],
    car: [pl.sky, mix(pl.sky, c.card, 0.5)],
    pool: [mix(c.series1, c.card, 0.3), c.series1],
    dance: [mix(c.series6, pl.dark, 0.6), c.series6],
    brunch: [mix(c.series2, c.card, 0.88), mix(c.series3, c.card, 0.78)],
  };
  const [g0, g1] = grads[ph.scene];
  const els: El[] = [];
  els.push(<rect key="bg" x={0} y={0} width={f1(w)} height={f1(h)} fill={`url(#${id})`} />);
  if (ph.scene === "honky-tonk") {
    const gx = w / 2 + 10 * u, gy = 18 * u;
    els.push(<circle key="gl" cx={f1(gx)} cy={f1(gy)} r={f1(26 * u)} fill={c.series4} opacity={0.3} />);
    els.push(<ellipse key="n1" cx={f1(gx - 4 * u)} cy={f1(gy + 3 * u)} rx={f1(7 * u)} ry={f1(6 * u)} fill={mix(c.series4, c.card, 0.3)} />);
    els.push(<ellipse key="n2" cx={f1(gx + 4 * u)} cy={f1(gy - 1 * u)} rx={f1(5 * u)} ry={f1(4.5 * u)} fill={mix(c.series4, c.card, 0.3)} />);
    els.push(<line key="n3" x1={f1(gx + 6 * u)} y1={f1(gy - 2 * u)} x2={f1(gx + 18 * u)} y2={f1(gy - 10 * u)} stroke={mix(c.series1, c.card, 0.4)} stroke-width={f1(2 * u)} stroke-linecap="round" />);
    for (let k = 0; k < 8; k++) els.push(<circle key={`l${k}`} cx={f1(((k + 0.5) * w) / 8)} cy={f1(4 * u + (k % 2) * 2 * u)} r={f1(1.6 * u)} fill={c.series2} />);
  } else if (ph.scene === "hot-chicken") {
    els.push(<ellipse key="pl" cx={f1(w / 2)} cy={f1(ground - 4 * u)} rx={f1(26 * u)} ry={f1(8 * u)} fill={c.card} />);
    for (let k = 0; k < 3; k++) els.push(<circle key={`b${k}`} cx={f1(w / 2 - 10 * u + 10 * u * k)} cy={f1(ground - 9 * u)} r={f1(6 * u)} fill={mix(c.series4, pl.dark, 0.35)} />);
  } else if (ph.scene === "rooftop") {
    els.push(<circle key="sun" cx={f1(w / 2 + 14 * u)} cy={f1(ground - 6 * u)} r={f1(12 * u)} fill={pl.cream} />);
    let x = 0;
    for (let k = 0; x < w; k++) {
      const bw = (8 + ((13 * k) % 9)) * u;
      const bh = (10 + ((37 * k) % 23)) * u;
      els.push(<rect key={`sk${k}`} x={f1(x)} y={f1(ground - bh)} width={f1(bw)} height={f1(bh)} fill={mix(c.series6, pl.dark, 0.45)} />);
      x += bw + u;
    }
  } else if (ph.scene === "waffles") {
    els.push(<rect key="wf" x={f1(w / 2 - 13 * u)} y={f1(ground - 16 * u)} width={f1(26 * u)} height={f1(16 * u)} rx={3} fill={pl.crust} />);
    for (const k of [-1, 0, 1]) els.push(<line key={`v${k}`} x1={f1(w / 2 + k * 6.5 * u)} y1={f1(ground - 16 * u)} x2={f1(w / 2 + k * 6.5 * u)} y2={f1(ground)} stroke={pl.brown} stroke-width={f1(u)} />);
    els.push(<line key="hz" x1={f1(w / 2 - 13 * u)} y1={f1(ground - 8 * u)} x2={f1(w / 2 + 13 * u)} y2={f1(ground - 8 * u)} stroke={pl.brown} stroke-width={f1(u)} />);
    if (u > 0.8)
      els.push(
        <text key="2am" x={f1(4 * u)} y={f1(13 * u)} font-size={f1(11 * u)} font-weight={700} fill={mix(c.series4, c.text, 0.25)} font-family={th.type.family}>
          2am
        </text>,
      );
  } else if (ph.scene === "car") {
    els.push(<rect key="top" x={0} y={0} width={f1(w)} height={f1(8 * u)} fill={pl.dark} />);
    els.push(<line key="hz" x1={0} y1={f1(ground - 30 * u)} x2={f1(w)} y2={f1(ground - 34 * u)} stroke={c.series3} stroke-width={f1(u)} />);
    els.push(<rect key="mr" x={f1(w / 2 + 18 * u - 7 * u)} y={f1(12 * u - 3 * u)} width={f1(14 * u)} height={f1(6 * u)} rx={2} fill={pl.dark} />);
  } else if (ph.scene === "pool") {
    for (let k = 0; k < 4; k++) {
      const y0 = (12 + 16 * k) * u;
      const pts = Array.from({ length: 12 }, (_, j) => `${f1((j * w) / 11)},${f1(y0 + Math.sin(j * 1.3) * 2 * u)}`).join(" ");
      els.push(<polyline key={`w${k}`} points={pts} fill="none" stroke={c.card} stroke-width={f1(1.2 * u)} opacity={0.5} />);
    }
    els.push(<circle key="fl" cx={f1(w - 14 * u)} cy={f1(16 * u)} r={f1(7 * u)} fill="none" stroke={mix(c.series4, c.card, 0.3)} stroke-width={f1(4 * u)} />);
  } else if (ph.scene === "dance") {
    const bx = w / 2, by = 12 * u;
    const cols = [c.series1, c.series2, c.series3, c.series4, c.series5];
    for (let k = 0; k < 5; k++) {
      const a = Math.PI / 4 + 0.12 * Math.PI * k;
      els.push(<line key={`bm${k}`} x1={f1(bx)} y1={f1(by)} x2={f1(bx + Math.cos(a) * 80 * u)} y2={f1(by + Math.sin(a) * 80 * u)} stroke={cols[k]} stroke-width={f1(5 * u)} opacity={0.25} />);
    }
    els.push(<circle key="ball" cx={f1(bx)} cy={f1(by)} r={f1(8 * u)} fill={mix(c.text, c.card, 0.7)} />);
    for (const k of [-1, 0, 1]) els.push(<line key={`bl${k}`} x1={f1(bx - 8 * u)} y1={f1(by + k * 3 * u)} x2={f1(bx + 8 * u)} y2={f1(by + k * 3 * u)} stroke={mix(c.text, c.card, 0.5)} stroke-width={f1(0.8 * u)} />);
  } else {
    for (let k = 0; k < 3; k++) els.push(<rect key={`gl${k}`} x={f1((14 + 22 * k) * u)} y={f1(ground - 2 * u)} width={f1(6 * u)} height={f1(12 * u)} rx={1} fill={mix(c.series2, c.series5, 0.5)} />);
  }
  const n = ph.people.length;
  const hr = Math.max(8, 13 - 1.2 * n) * u;
  ph.people.forEach((name, i) => {
    const x = ((i + 0.5) * w) / n + Math.sin((i + idx) * 2.3) * 3 * u;
    els.push(person(th, name, x, h - 1.2 * hr, hr, ph.scene === "waffles", `p${i}`));
  });
  if (ph.why === "blurry" && ph.verdict === "reject") {
    els.push(<rect key="blur" x={0} y={0} width={f1(w)} height={f1(h)} fill={c.card} opacity={0.25} />);
    for (let k = 0; k < 3; k++) els.push(<circle key={`bb${k}`} cx={f1(w / 2 + (6 * k - 6) * u)} cy={f1(h / 2 + 6 * u)} r={f1(14 * u)} fill={c.card} opacity={0.15} />);
  }
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${f1(w)} ${f1(h)}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ display: "block" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color={g0} />
          <stop offset="1" stop-color={g1} />
        </linearGradient>
      </defs>
      {els}
    </svg>
  );
}

const CheckPath = ({ color, size }: { color: string; size: number }) => (
  <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke={color} stroke-width={1.8} stroke-linecap="round" stroke-linejoin="round">
    <path d="M2 5.2 4.2 7.4 8 2.8" />
  </svg>
);

export default defineApp<State, Action, Local>({
  name: "Weekend album",

  summary: (s) => {
    const short = s.friends.filter((_, f) => count(s, f) < 2);
    const saved = s.savedBy.length + s.savers.length;
    const tail = saved ? ` · ${saved} saved` : "";
    if (ready(s)) return `${s.title}: album's ready · ${s.target} photos${tail}`;
    return `${s.title}: ${total(s)} of ${s.target} picked${short.length ? ` · ${short.join(", ")} short` : ""}${tail}`;
  },

  init: () => initState(),

  reduce: (s, a, m, ctx) => {
    if (!ctx.members.some((x) => x.id === m.user)) return s;
    if (a.t === "pick") {
      if (!Number.isInteger(a.i) || a.i < 0 || a.i >= s.photos.length) return s;
      const picks = s.picks.includes(a.i) ? s.picks.filter((i) => i !== a.i) : [...s.picks, a.i].sort((x, y) => x - y);
      const next: State = { ...s, picks, last: { i: a.i, at: m.time, by: m.user } };
      return { ...next, doneAt: ready(next) ? (ready(s) ? s.doneAt : m.time) : 0 };
    }
    if (a.t === "save") {
      return { ...s, savers: s.savers.includes(m.user) ? s.savers.filter((u) => u !== m.user) : [...s.savers, m.user] };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const savers = s.savers.filter((u) => ctx.members.some((m) => m.id === u));
    return savers.length === s.savers.length ? s : { ...s, savers };
  },

  invariants: {
    "picks are real photos, once, in order": (s) => s.picks.every((i, k) => Number.isInteger(i) && i >= 0 && i < s.photos.length && (k === 0 || i > s.picks[k - 1]!)),
    "the album never holds more than the dump": (s) => total(s) <= s.keptN + s.photos.length && total(s) <= s.total,
    "ready is stamped exactly when ready": (s) => s.doneAt > 0 === readyCopy(s),
    "savers are in the chat, once": (s, ctx) => new Set(s.savers).size === s.savers.length && s.savers.every((u) => ctx.members.some((m) => m.id === u)),
    "coverage counts are whole and at least what was kept": (s) => s.friends.every((f, k) => Number.isInteger(recount(s, f)) && recount(s, f) >= (s.kept[k] ?? 0)),
    "last points at a photo": (s) => s.last === null || (Number.isInteger(s.last.i) && s.last.i >= 0 && s.last.i < s.photos.length && s.last.at >= 0),
  },

  transitions: {
    "a pick toggles exactly that photo": (p, n, a, m) => {
      if (a.t !== "pick" || p === n) return true;
      const diff = [...p.picks.filter((i) => !n.picks.includes(i)), ...n.picks.filter((i) => !p.picks.includes(i))];
      return diff.length === 1 && diff[0] === a.i && n.last?.i === a.i && n.last.at === m.time && n.last.by === m.user;
    },
    "ready is stamped on the pick that completes it": (p, n, a, m) => a.t !== "pick" || p === n || !readyCopy(n) || readyCopy(p) || n.doneAt === m.time,
    "save toggles only the saver": (p, n, a, m) => {
      if (a.t !== "save" || p === n) return true;
      const diff = [...p.savers.filter((u) => !n.savers.includes(u)), ...n.savers.filter((u) => !p.savers.includes(u))];
      return diff.length === 1 && diff[0] === m.user && JSON.stringify(p.picks) === JSON.stringify(n.picks);
    },
    "the photos never change": (p, n) =>
      JSON.stringify(p.photos) === JSON.stringify(n.photos) &&
      JSON.stringify(p.friends) === JSON.stringify(n.friends) &&
      JSON.stringify(p.kept) === JSON.stringify(n.kept) &&
      p.keptN === n.keptN &&
      p.target === n.target,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, _u, r) => {
    if (!s.photos.length) return { t: "save" };
    return r.next() < 0.85 ? { t: "pick", i: r.int(s.photos.length) } : { t: "save" };
  },

  local: { story: false, idx: 0, at: 0 },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = innerWidth();
    const narrow = W < 360;
    const n = total(state);
    const person_ = (id: string): Member => members.find((m) => m.id === id) ?? { id, name: id };
    const byName = (name: string): Member => members.find((m) => m.id === name || m.name.toLowerCase() === name.toLowerCase()) ?? { id: name.toLowerCase(), name };
    const isReady = ready(state);
    const hasPhotos = state.photos.length > 0;
    const story = local.story && hasPhotos;
    const doneMs = confirmed.doneAt > 1 ? running(confirmed.doneAt, 2400) : null;
    const list = storyList(state);
    const sub = narrow ? `${n} of ${state.target} picked` : `${state.total} photos · ${n} of ${state.target} in the album`;
    const saversAll: Member[] = [...state.savedBy.map(byName), ...state.savers.map(person_)];
    const k = saversAll.length;
    const iSaved = state.savers.includes(me);

    const chip = (label: string, on: boolean, go: () => void, dot: boolean) => (
      <button
        key={label}
        type="button"
        aria-pressed={on}
        onClick={go}
        style={{ position: "relative", height: 44, padding: 0, border: "none", background: "transparent", cursor: "pointer", font: "inherit" }}
      >
        <span style={{ display: "flex", alignItems: "center", height: 28, padding: "0 12px", borderRadius: 14, background: on ? c.selected : c.secondaryButton, color: on ? c.link : c.text, fontSize: 13, fontWeight: 600 }}>{label}</span>
        {dot ? <span style={{ position: "absolute", right: -1, top: 6, width: 8, height: 8, borderRadius: "50%", background: c.negative }} /> : null}
      </button>
    );
    const header = (
      <div style={{ position: "relative" }}>
        <div style={{ paddingRight: 128 }}>
          <CardHeader title={state.title} subtitle={sub} />
        </div>
        <div style={{ position: "absolute", right: 0, top: -6, display: "flex", gap: 0 }}>
          {chip("Pick", !story, () => setLocal({ story: false, idx: 0, at: clock.peek() }), false)}
          {chip("Story", story, () => hasPhotos && setLocal({ story: true, idx: 0, at: clock.peek() }), isReady && !story)}
        </div>
      </div>
    );

    // ---------------- story mode
    if (story) {
      const nn = list.length;
      const el = Math.max(0, clock.value - local.at);
      const idx = (local.idx + Math.floor(el / SEG_MS)) % nn;
      const inSeg = el % SEG_MS;
      const enterT = Math.min(1, inSeg / 400);
      const back = enterT - 1;
      const enter = 1 + 2.70158 * back * back * back + 1.70158 * back * back;
      const ph = state.photos[list[idx]!]!;
      const nextPh = state.photos[list[(idx + 1) % nn]!]!;
      const cardW = narrow ? 112 : 136;
      const cardH = narrow ? 150 : 170;
      const x0 = narrow ? 148 : 182;
      const stripW = Math.min(34, (W - 4 * (nn - 1)) / nn);
      const segw = (W - 20 - 3 * (nn - 1)) / nn;
      const go = (to: number) => setLocal({ idx: (to + nn) % nn, at: clock.peek() });
      const bg = pal(theme).dark;
      const fg = pal(theme).paper;
      const dim = mix(fg, bg, 0.2);
      const photoBox = (p: Photo, id: string, i: number): El => (
        <div style={{ position: "absolute", left: (cardW - cardH) / 2, top: 0, width: cardH, height: cardH }}>{photoArt(theme, p, cardH, cardH, id, i)}</div>
      );
      return (
        <div>
          {header}
          <div style={{ height: 4 }} />
          <div
            role="group"
            aria-label="Album story"
            onClick={(e: MouseEvent) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              go(e.clientX - r.left < r.width / 2 ? idx - 1 : idx + 1);
            }}
            style={{ position: "relative", height: 216, borderRadius: 14, background: bg, color: fg, overflow: "hidden", cursor: "pointer" }}
          >
            {Array.from({ length: nn }, (_, j) => (
              <span key={j} style={{ position: "absolute", left: 10 + j * (segw + 3), top: 8, width: segw, height: 3, borderRadius: 2, background: mix(fg, bg, 0.65), overflow: "hidden" }}>
                <span style={{ display: "block", height: 3, width: j < idx ? "100%" : j === idx ? `${Math.round((inSeg / SEG_MS) * 100)}%` : 0, background: fg }} />
              </span>
            ))}
            <div style={{ position: "absolute", left: 30, top: 30, width: cardW, height: cardH, borderRadius: 12, overflow: "hidden" }}>
              {photoBox(nextPh, `nb${idx}`, list[(idx + 1) % nn]!)}
              <div style={{ position: "absolute", inset: 0, background: bg, opacity: 0.3 }} />
            </div>
            <div style={{ position: "absolute", left: 16 - 30 * (1 - enter), top: 36, width: cardW, height: cardH, borderRadius: 12, overflow: "hidden" }}>
              {photoBox(ph, `nf${idx}`, list[idx]!)}
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 60, background: `linear-gradient(to bottom, transparent, ${bg})`, opacity: 0.66 }} />
              <div style={{ position: "absolute", left: 10, right: 8, bottom: 10, fontSize: 17, lineHeight: "20px", fontWeight: 700, color: fg, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{state.album}</div>
            </div>
            <div style={{ position: "absolute", left: x0, top: 16, width: W - 14 - x0, bottom: 8 }}>
              <div style={{ fontSize: 13, lineHeight: "20px", fontWeight: 600, color: dim }}>{ph.when}</div>
              <div style={{ fontSize: 19, lineHeight: "24px", fontWeight: 700, marginTop: 2, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{ph.caption || "Muse kept this one anyway"}</div>
              <div style={{ marginTop: 6, height: 63, overflow: "hidden" }}>
                {ph.people.slice(0, narrow ? 2 : 3).map((nm) => (
                  <div key={nm} style={{ display: "flex", alignItems: "center", gap: 8, height: 21, fontSize: 13, color: dim }}>
                    <Avatar user={byName(nm)} size={18} />
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nm}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ position: "absolute", right: 14, bottom: 8, fontSize: 13, lineHeight: "16px", color: dim, whiteSpace: "nowrap" }}>{`${idx + 1} of ${nn} · tap to skip`}</div>
          </div>
          <div style={{ height: 6 }} />
          <div
            role="group"
            aria-label="Photos in the album"
            onClick={(e: MouseEvent) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const span = stripW * nn + 4 * (nn - 1);
              const j = Math.floor((e.clientX - r.left - (r.width - span) / 2) / (stripW + 4));
              if (j >= 0 && j < nn) go(j);
            }}
            style={{ height: 40, display: "flex", justifyContent: "center", alignItems: "center", gap: 4, cursor: "pointer" }}
          >
            {list.map((pi, j) => (
              <span key={pi} style={{ position: "relative", flex: "none", width: stripW, height: 34, borderRadius: 6, overflow: "hidden", outline: j === idx ? `2px solid ${c.primary}` : "none", outlineOffset: 1.5 }}>
                {photoArt(theme, state.photos[pi]!, stripW, 34, `f${pi}`, pi, 0.48)}
                {j === idx ? null : <span style={{ position: "absolute", inset: 0, background: c.card, opacity: 0.35 }} />}
              </span>
            ))}
          </div>
          <div style={{ height: 44, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {k ? <Facepile users={saversAll} max={3} size={20} /> : null}
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {k === 0 ? "Be the first to save it" : iSaved ? `You and ${k - 1} friends saved this album` : `${k} friends saved this album`}
            </span>
            <Button kind={iSaved ? "secondary" : "primary"} onClick={() => dispatch({ t: "save" })}>
              {iSaved ? "Saved" : "Save"}
            </Button>
          </div>
        </div>
      );
    }

    // ---------------- pick mode
    const gap = 6;
    const tw = (W - 4 * gap) / 5;
    const th = Math.min(71, Math.round(tw * 1.03));
    const rows = Math.max(1, Math.ceil(state.photos.length / 5));
    const short = state.friends.map((f, j) => ({ f, n: count(state, j) })).filter((x) => x.n < 2);
    const one = short.filter((x) => x.n === 1).map((x) => x.f);
    const zero = short.filter((x) => x.n === 0).map((x) => x.f);
    const msg = isReady
      ? "Everyone's in it twice. Album's ready."
      : short.length
        ? `${[one.length ? `${one.join(", ")} only ${one.length > 1 ? "show" : "shows"} up once` : "", zero.length ? `${zero.join(", ")} ${zero.length > 1 ? "don't" : "doesn't"} show up yet` : ""].filter(Boolean).join(". ")}. Tap a photo to fix`
        : `${n} of ${state.target}: ${n > state.target ? "one too many" : "pick a couple more"}`;
    const step = (W - 24) / Math.max(1, state.friends.length);
    const popMs = state.last ? running(state.last.at, 300) : null;

    return (
      <div>
        {header}
        <div style={{ height: 4 }} />
        {hasPhotos ? (
          <div style={{ position: "relative", height: rows * th + (rows - 1) * gap }}>
            {state.photos.map((ph, i) => {
              const picked = state.picks.includes(i);
              const rejected = ph.verdict === "reject" && !picked;
              const col = i % 5;
              const row = Math.floor(i / 5);
              const needy = !picked && ph.verdict === "open" ? ph.people.find((nm) => { const f = state.friends.indexOf(nm); return f >= 0 && count(state, f) < 2; }) : undefined;
              const why = fitText(ph.why, tw - 18, { size: 12, min: 10 });
              const pop = state.last && state.last.i === i && popMs !== null ? 1.8 - 0.8 * (1 - Math.pow(1 - popMs / 300, 3)) * 1 : 1;
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`${ph.when}, ${ph.people.join(", ")}, ${picked ? "picked" : rejected ? `rejected, ${ph.why}` : "not picked"}`}
                  aria-pressed={picked}
                  onClick={() => { haptic("light"); dispatch({ t: "pick", i }); }}
                  style={{ position: "absolute", left: col * (tw + gap), top: row * (th + gap), width: tw, height: th, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
                >
                  <span style={{ position: "absolute", inset: picked ? 0 : 2, borderRadius: 8, overflow: "hidden" }}>
                    {photoArt(theme, ph, tw, th, `t${i}`, i)}
                    {rejected ? <span style={{ position: "absolute", inset: 0, background: c.card, opacity: 0.6 }} /> : null}
                  </span>
                  {rejected ? (
                    <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", display: "flex", alignItems: "center", height: 20, padding: "0 7px", borderRadius: 10, background: c.card, color: mix(c.secondaryText, c.text, 0.25), fontSize: why.size, whiteSpace: "nowrap" }}>{why.text}</span>
                  ) : null}
                  {needy ? (
                    <span style={{ position: "absolute", left: 4, top: 4, maxWidth: tw - 24, height: 18, padding: "0 5px", borderRadius: 9, background: c.primary, color: c.onPrimary, fontSize: 11, fontWeight: 600, lineHeight: "18px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{`+ ${needy}`}</span>
                  ) : null}
                  {picked ? (
                    <span style={{ position: "absolute", right: 2.5, top: 2.5, width: 17, height: 17, borderRadius: "50%", background: c.primary, boxShadow: `0 0 0 1px ${c.card}`, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${pop})` }}>
                      <CheckPath color={c.onPrimary} size={10} />
                    </span>
                  ) : !rejected ? (
                    <span style={{ position: "absolute", right: 2.5, top: 2.5, width: 17, height: 17, boxSizing: "border-box", borderRadius: "50%", border: `1.5px solid ${c.card}`, background: mix(c.text, c.card, 0.76) }} />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ height: 120, boxSizing: "border-box", borderRadius: 12, border: `1.5px dashed ${c.divider}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, textAlign: "center", padding: "0 12px" }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: c.text }}>No photos yet</span>
            <span style={{ fontSize: 13, color: c.secondaryText }}>Share the dump here and pick the keepers</span>
          </div>
        )}
        <div style={{ height: 6 }} />
        <div style={{ position: "relative", height: 70, borderRadius: 14, background: c.wash }}>
          <div style={{ position: "absolute", left: 12, top: 6, right: 12, fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Does everyone show up at least twice?</div>
          <div style={{ position: "absolute", left: 12, top: 24, right: 12, fontSize: 15, lineHeight: "20px", color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{msg}</div>
          <svg width={W} height={24} viewBox={`0 0 ${f1(W)} 24`} role="img" aria-label={state.friends.map((f, j) => `${f} ${count(state, j)}`).join(", ")} style={{ position: "absolute", left: 0, top: 44 }}>
            {state.friends.map((f, j) => {
              const cnt = count(state, j);
              const fit = fitText(f, step - 24, { size: 11, min: 10 });
              const cx = 12 + step * (j + 0.5);
              return (
                <g key={f}>
                  <text x={f1(cx - 10)} y={16} text-anchor="end" font-size={fit.size} fill={mix(c.secondaryText, c.text, 0.25)} font-family={theme.type.family}>
                    {fit.text}
                  </text>
                  <circle cx={f1(cx + 4)} cy={12} r={7.5} fill={cnt >= 2 ? (theme.mode === "dark" ? c.positive : mix(c.positive, c.text, 0.3)) : theme.mode === "dark" ? c.negative : mix(c.negative, c.text, 0.25)} />
                  <text x={f1(cx + 4)} y={15.5} text-anchor="middle" font-size={10} font-weight={600} fill={theme.mode === "dark" ? c.card : c.onPrimary} font-family={theme.type.family}>
                    {cnt}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        {doneMs !== null ? (
          <>
            <Toast key={`t${confirmed.doneAt}`}>{`Album's ready · ${state.target} photos`}</Toast>
            <Burst key={`b${confirmed.doneAt}`} emoji="❤️" />
          </>
        ) : null}
      </div>
    );
  },
});
