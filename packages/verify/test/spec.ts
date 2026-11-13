// What a fixture expects, from its header comments:
//   // Expect: stage <stage>, rule <rule>.
//   // Also: <rule> (why), <rule>.        rules that may fail beside it (strict fixtures only)
//   // Profile: strict.                    run in the strict profile
export type FixtureSpec = { stage?: string; rule?: string; also: string[]; profile: "default" | "strict" };

export function fixtureSpec(src: string): FixtureSpec {
  const head = src.split("\n").slice(0, 8).join("\n");
  const m = head.match(/Expect: stage (\w+), rule ([\w-]+)/);
  const also = head.match(/\/\/ Also: (.*)\./)?.[1]?.replace(/\([^)]*\)/g, "").split(",").map((x) => x.trim()).filter(Boolean) ?? [];
  return { ...(m ? { stage: m[1]!, rule: m[2]! } : {}), also, profile: /\/\/ Profile: strict/.test(head) ? "strict" : "default" };
}
