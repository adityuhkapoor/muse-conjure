// What a Gaming tile says about its Mini, worked out from the Mini's own params (the lab tool's
// input) and nothing else: one function per kind of Mini. The tile's line, its summary and the faces
// under it all come from here, so a tile cannot claim a score, a time or a person the Mini does not
// have. Plain data and functions, no framework imports, so a check can read it.

import { PEOPLE } from "../store/fake-data";
import { EXTRA_PEOPLE } from "../store/extras";

export type Tile = { line: string; summary: string; players: string[] };

/** The wire id of a person named by first name in a Mini's params ("Tsai Lin" is `noa`). */
export function idOfName(name: string): string {
  const p = [...PEOPLE, ...EXTRA_PEOPLE].find((x) => x.first === name || x.name === name);
  if (!p) throw new Error(`game params name nobody: ${name}`);
  return p.id === "me" ? "noa" : p.id;
}
const ids = (names: string[]) => [...new Set(names)].map(idOfName);
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---- daily-puzzle (Chatdle): who finished, and in how many rows
export type PuzzleParams = { no: number; played: { who: string; marks: string[] }[] };
export function puzzleTile(p: PuzzleParams): Tile {
  return { line: p.played.map((x) => `${x.who} in ${x.marks.length}`).join(" · "), summary: `Chatdle #${p.no}`, players: ids(p.played.map((x) => x.who)) };
}

// ---- friend-trivia-pub: the leader's points, from each player's points per question
export type QuizParams = { questions: unknown[]; played: { who: string; points: number[] }[] };
export function quizTile(p: QuizParams): Tile {
  const total = (x: { points: number[] }) => x.points.reduce((a, b) => a + b, 0);
  const lead = [...p.played].sort((a, b) => total(b) - total(a))[0];
  return { line: lead ? `${lead.who} leads with ${total(lead)}` : "Nobody has played yet", summary: count(p.questions.length, "question"), players: ids(p.played.map((x) => x.who)) };
}

// ---- trivia-night: two teams, the stake
export type NightParams = { teams: { name: string; people: string[] }[]; stake: string };
export function nightTile(p: NightParams): Tile {
  const [a, b] = p.teams;
  return { line: `${a?.name} vs ${b?.name} · ${p.stake} on the line`, summary: `${p.teams.map((t) => t.people.length).join(" v ")}`, players: ids(p.teams.flatMap((t) => t.people)) };
}

// ---- two-truths: rounds, and who found each lie
export type TruthsParams = { rounds: { about: string; lie: number; guesses: { name: string; fact: number }[] }[] };
export function truthsTile(p: TruthsParams): Tile {
  const found = p.rounds.flatMap((r) => r.guesses.filter((g) => g.fact === r.lie).map((g) => `${g.name} spotted ${r.about}'s lie`));
  const names = p.rounds.flatMap((r) => [r.about, ...r.guesses.map((g) => g.name)]);
  return { line: [count(p.rounds.length, "round"), ...found].join(" · "), summary: count(p.rounds.length, "round"), players: ids(names) };
}

// ---- feed-tier-list: the best tier the rankers agree on, S first
export type TierParams = { items: { name: string }[]; people: { name: string; tiers: string[] }[] };
const ORDER = ["S", "A", "B", "C", "D"];
export function tierTile(p: TierParams): Tile {
  // each item's most common tier (the better tier on a tie); the line is about the item whose tier is best, then most agreed on
  const tops = p.items.map((it, i) => {
    const per = ORDER.map((tier) => ({ tier, n: p.people.filter((x) => x.tiers[i] === tier).length }));
    const top = per.reduce((a, c) => (c.n > a.n ? c : a));
    return { item: it.name, ...top };
  });
  const best = tops.filter((t) => t.n).sort((a, b) => ORDER.indexOf(a.tier) - ORDER.indexOf(b.tier) || b.n - a.n)[0];
  const m = p.people.length;
  return { line: best ? `${best.item} is ${best.tier} for ${best.n} of ${m}` : "Nobody has ranked yet", summary: `${count(m, "friend")} ranked`, players: ids(p.people.map((x) => x.name)) };
}

// ---- caption-contest: who voted on the first photo (the Mini counts against the chat it lands in, so the tile gives no total)
export type CaptionParams = { photos: { captions: { by: string; voters: string[] }[] }[] };
export function captionTile(p: CaptionParams): Tile {
  const photo = p.photos[0];
  const all = new Set<string>();
  const voted = new Set<string>();
  for (const c of photo?.captions ?? []) {
    all.add(c.by);
    for (const v of c.voters) (all.add(v), voted.add(v));
  }
  return { line: `${voted.size} voted on photo 1`, summary: "photo 1", players: ids([...all]) };
}

// ---- lobby: the best band, the way the Mini finds it (a free slot counts 2, a maybe 1; slot 0 is 6:00 PM, 30 minutes each)
export type LobbyParams = { people: { name: string; from: number; to: number; maybe: boolean }[] };
const COLS = 14;
const hour = (slot: number) => {
  const mins = 18 * 60 + 30 * slot;
  const h = Math.floor(mins / 60) % 12 || 12;
  return mins % 60 ? `${h}:${String(mins % 60).padStart(2, "0")}` : `${h}`;
};
export function lobbyTile(p: LobbyParams): Tile {
  const sums = Array.from({ length: COLS }, (_, c) => p.people.reduce((t, x) => t + (c >= x.from && c < x.to ? (x.maybe ? 1 : 2) : 0), 0));
  const mx = Math.max(...sums);
  const start = sums.indexOf(mx);
  let end = start;
  while (end < COLS && sums[end] === mx) end++;
  return { line: mx ? `Best overlap ${hour(start)} to ${hour(end)}` : "No overlap yet", summary: "tonight", players: ids(p.people.map((x) => x.name)) };
}

// ---- movie-bracket: the first matchup, from the votes in
export type MovieParams = { when: string; movies: { title: string }[]; picks: { name: string; side: number }[] };
const DAY: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
/** "Fri 9 PM" as "Friday". */
export const dayOf = (when: string) => DAY[when.split(" ")[0] ?? ""] ?? when;
export function movieTile(p: MovieParams): Tile {
  const a = p.picks.filter((x) => x.side === 0).length;
  const b = p.picks.length - a;
  const [x, y] = p.movies;
  const lead = a === b ? `${x?.title} and ${y?.title} are tied at ${a}` : `${(a > b ? x : y)?.title} leads ${Math.max(a, b)} to ${Math.min(a, b)}`;
  return { line: `${lead} · ${p.when}`, summary: "round 1 · vote", players: ids(p.picks.map((x) => x.name)) };
}
