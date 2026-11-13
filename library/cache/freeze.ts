// bun library/cache/freeze.ts
// Freezes the lookup test set: a copy of index.json and the asks (held-out and generated, ask text, chat and
// kind only) with the stats measured now. Tests run `find` against this copy, offline, so they do not move
// when the cache grows. Run it again on purpose when the cache or the scoring changes.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkLookup } from "./checks.ts";
import { generated, heldout } from "./eval-lookup.ts";
import { THRESHOLD } from "./lookup.ts";
import { readIndex } from "./store.ts";

const index = readIndex();
const asks = [...heldout(), ...generated()].map((a) => ({ id: a.id, kind: a.kind, ask: a.ask, chat: a.chat, members: a.members, heldout: !!a.heldout }));
const stats = checkLookup(index, asks, THRESHOLD);
writeFileSync(join(import.meta.dir, "test", "fixtures", "lookup-frozen.json"), JSON.stringify({ threshold: THRESHOLD, stats, index, asks }));
console.log(`frozen ${index.count} entries, ${asks.length} asks at threshold ${THRESHOLD}`, stats);
