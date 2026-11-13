/**
 * Numbers on Home next to a list are computed from the list (the rule: never show a count the person
 * cannot reach by opening the list). This reads the feed's post records and the written comment
 * threads and reports where they disagree. `bun scripts/feed-numbers.ts` runs it on the real data;
 * `--self-test` runs it on broken fixtures, each of which must fail its rule. check.ts runs both.
 */
import { PEOPLE } from "../src/store/fake-data";
import { EXTRA_PEOPLE } from "../src/store/extras";
import { POSTS, STRANGERS } from "../src/surfaces/data";
import { SEEDED, type Seeded } from "../src/surfaces/comments";

type PostLike = { id: string; ago: number; likes: number; page?: { sponsored?: unknown } };

/** A post this popular must show a thread, not an empty comment line. */
const POPULAR = 20;
const POPULAR_MIN = 3;

export function feedNumberProblems(posts: PostLike[], threads: Record<string, Seeded[]>, known: Set<string>): string[] {
  const out: string[] = [];
  for (const p of posts) {
    const rows = threads[p.id] ?? [];
    if ("comments" in p) out.push(`${p.id}: a typed comment count on the post record (the count is the thread's size)`);
    if (p.likes >= POPULAR && rows.length < POPULAR_MIN) out.push(`${p.id}: ${p.likes} likes and ${rows.length} comments`);
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const r of rows) {
      // an ad has no post time on screen (it says Sponsored), so only its replies are held to their parent
      if (!p.page?.sponsored && r.ago > p.ago) out.push(`${r.id}: ${Math.round(r.ago / 60_000)} min old, its post is ${Math.round(p.ago / 60_000)} min old`);
      if (r.parent) {
        const up = byId.get(r.parent);
        if (!up) out.push(`${r.id}: replies to ${r.parent}, which is not in the thread`);
        else if (up.parent) out.push(`${r.id}: replies to a reply (${r.parent}); threads are one level`);
        else if (r.ago > up.ago) out.push(`${r.id}: older than the comment it answers (${r.parent})`);
      }
      if (!known.has(r.by)) out.push(`${r.id}: written by ${r.by}, who is nobody`);
    }
  }
  return out;
}

const KNOWN = new Set(["me", ...PEOPLE.map((x) => x.id), ...EXTRA_PEOPLE.map((x) => x.id), ...STRANGERS.map((x) => x.id)]);

/** Problems in the real data. */
export const realProblems = () => feedNumberProblems(POSTS as PostLike[], SEEDED, KNOWN);

/** Each fixture breaks one rule; the checker must say something about every one. */
export function selfTest(): string[] {
  const post = (o: Partial<PostLike> & { id: string }): PostLike => ({ ago: 60 * 60_000, likes: 5, ...o });
  const c = (id: string, o: Partial<Seeded> = {}): Seeded => ({ id, by: "maya", text: "x", ago: 30 * 60_000, likes: 0, ...o });
  const known = new Set(["maya"]);
  const fixtures: [string, PostLike[], Record<string, Seeded[]>][] = [
    ["a comment older than its post", [post({ id: "a" })], { a: [c("a:1", { ago: 2 * 60 * 60_000 })] }],
    ["a reply older than its parent", [post({ id: "a" })], { a: [c("a:1"), c("a:2", { parent: "a:1", ago: 50 * 60_000 })] }],
    ["a popular post with no thread", [post({ id: "a", likes: 400 })], {}],
    ["a typed count left on a post", [{ ...post({ id: "a" }), comments: 9 } as PostLike], { a: [c("a:1")] }],
    ["a reply to a reply", [post({ id: "a" })], { a: [c("a:1"), c("a:2", { parent: "a:1" }), c("a:3", { parent: "a:2" })] }],
    ["an author nobody knows", [post({ id: "a" })], { a: [c("a:1", { by: "ghost" })] }],
  ];
  const missed: string[] = [];
  for (const [name, posts, threads] of fixtures) if (!feedNumberProblems(posts, threads, known).length) missed.push(name);
  return missed;
}

if (import.meta.main) {
  if (process.argv.includes("--self-test")) {
    const missed = selfTest();
    if (missed.length) {
      console.error(`feed numbers self-test: these broken fixtures were not caught: ${missed.join("; ")}`);
      process.exit(1);
    }
    console.log("ok: feed numbers self-test, every broken fixture fails");
  } else {
    const bad = realProblems();
    if (bad.length) {
      console.error(`feed numbers:\n  ${bad.join("\n  ")}`);
      process.exit(1);
    }
    console.log(`ok: feed numbers, ${POSTS.length} posts, every thread fits its post`);
  }
}
