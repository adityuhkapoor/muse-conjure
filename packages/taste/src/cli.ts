// bun run taste:score "<text>" [role]   |   bun run taste:summary
import { ROLES, type Role } from "./features.ts";
import { taste } from "./taste.ts";

const [cmd, text, role] = process.argv.slice(2);
if (cmd === "score") {
  if (!text) {
    console.error('usage: bun run taste:score "<text>" [role]');
    process.exit(2);
  }
  const r = role && (ROLES as string[]).includes(role) ? (role as Role) : undefined;
  const s = taste.scoreCopy(text, r);
  console.log(`${text}\nscore ${s.score} (chance he likes it) · uncertainty ±${s.uncertainty}`);
  for (const x of s.reasons) console.log(`- ${x}`);
  if (!s.reasons.length) console.log("- no features the model has an opinion on");
} else if (cmd === "summary") {
  console.log(taste.summary().text);
} else {
  console.error("usage: bun src/cli.ts score <text> [role] | summary");
  process.exit(2);
}
