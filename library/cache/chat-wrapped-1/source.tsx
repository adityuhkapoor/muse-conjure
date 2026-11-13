import { defineApp, Avatar, Button, CardHeader, userColor } from "@muse/app";

// Chat wrapped. The tool cannot read the chat, so each person adds their own message count,
// favorite word and busiest hour. The card shows totals, the top word and the busiest time.

const CHAT = {
  suggestWord: "lowkey",
  startHour: 2,
};

type State = {
  counts: Record<string, number>;
  words: Record<string, string>;
  hours: Record<string, number>;
  suggestWord: string;
};
type Action = { t: "count"; n: number } | { t: "word"; word: string } | { t: "hour"; h: number } | { t: "clear" };
type Local = { tab: "count" | "word" | "hour"; count: string; word: string; hour: number };

const MAX_COUNT = 99999;
const MAX_WORD = 20;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);

function dropKey<T>(r: Record<string, T>, key: string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const k of Object.keys(r)) if (k !== key) out[k] = r[k] as T;
  return out;
}
function keepOnly<T>(r: Record<string, T>, ok: (id: string) => boolean): Record<string, T> {
  const out: Record<string, T> = {};
  for (const k of Object.keys(r)) if (ok(k)) out[k] = r[k] as T;
  return out;
}
/** A comparable string of every entry except the one for `user`. */
const rest = <T,>(r: Record<string, T>, user: string): string =>
  JSON.stringify(
    Object.keys(r)
      .filter((k) => k !== user)
      .sort()
      .map((k) => [k, r[k]]),
  );
const all = <T,>(r: Record<string, T>): string => rest(r, "\u0000");
const hasEntries = (s: State, id: string) => id in s.counts || id in s.words || id in s.hours;

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;
const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);

function topWord(s: State): { word: string; n: number } | null {
  const tally: Record<string, number> = {};
  for (const w of Object.values(s.words)) tally[w] = (tally[w] ?? 0) + 1;
  let best: { word: string; n: number } | null = null;
  for (const w of Object.keys(tally).sort()) {
    const n = tally[w] ?? 0;
    if (!best || n > best.n) best = { word: w, n };
  }
  return best;
}
function topHour(s: State): { hour: number; n: number } | null {
  const tally: Record<number, number> = {};
  for (const h of Object.values(s.hours)) tally[h] = (tally[h] ?? 0) + 1;
  let best: { hour: number; n: number } | null = null;
  for (let h = 0; h < 24; h++) {
    const n = tally[h] ?? 0;
    if (n > 0 && (!best || n > best.n)) best = { hour: h, n };
  }
  return best;
}

export default defineApp<State, Action, Local>({
  name: "Chat wrapped",
  summary: (s, ctx) => {
    const added = ctx.members.filter((m) => hasEntries(s, m.id)).length;
    const w = topWord(s);
    return `Chat wrapped · ${added} of ${ctx.members.length} added${w ? ` · top word ${w.word}` : ""}`;
  },

  init: () => ({ counts: {}, words: {}, hours: {}, suggestWord: CHAT.suggestWord }),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const u = m.user;
    if (a.t === "count") {
      const n = a.n;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX_COUNT || s.counts[u] === n) return s;
      return { ...s, counts: { ...s.counts, [u]: n } };
    }
    if (a.t === "word") {
      if (typeof a.word !== "string") return s;
      const w = a.word.trim().toLowerCase();
      if (!w || w.length > MAX_WORD || /\s/.test(w) || s.words[u] === w) return s;
      return { ...s, words: { ...s.words, [u]: w } };
    }
    if (a.t === "hour") {
      const h = a.h;
      if (typeof h !== "number" || !Number.isInteger(h) || h < 0 || h > 23 || s.hours[u] === h) return s;
      return { ...s, hours: { ...s.hours, [u]: h } };
    }
    if (a.t === "clear") {
      if (!hasEntries(s, u)) return s;
      return { ...s, counts: dropKey(s.counts, u), words: dropKey(s.words, u), hours: dropKey(s.hours, u) };
    }
    return s;
  },

  // Someone left: their count, word and hour go with them.
  onMembers: (s, ctx) => {
    const ok = (id: string) => inChat(ctx, id);
    const keys = [...Object.keys(s.counts), ...Object.keys(s.words), ...Object.keys(s.hours)];
    if (keys.every(ok)) return s;
    return { ...s, counts: keepOnly(s.counts, ok), words: keepOnly(s.words, ok), hours: keepOnly(s.hours, ok) };
  },

  invariants: {
    "every entry belongs to someone in the chat": (s, ctx) =>
      [...Object.keys(s.counts), ...Object.keys(s.words), ...Object.keys(s.hours)].every((id) => inChat(ctx, id)),
    "every count is a whole number from 0 to 99999": (s) =>
      Object.values(s.counts).every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_COUNT),
    "every hour is a whole number from 0 to 23": (s) => Object.values(s.hours).every((h) => Number.isInteger(h) && h >= 0 && h <= 23),
    "every word is lowercase, 1 to 20 characters, with no spaces": (s) =>
      Object.values(s.words).every((w) => w.length >= 1 && w.length <= MAX_WORD && w === w.toLowerCase() && !/\s/.test(w)),
    "the suggested word never changes": (s) => s.suggestWord === CHAT.suggestWord,
  },

  transitions: {
    "a count sets only the actor's own count": (p, n, a, m) =>
      a.t !== "count" ||
      p === n ||
      (rest(p.counts, m.user) === rest(n.counts, m.user) && n.counts[m.user] === a.n && all(p.words) === all(n.words) && all(p.hours) === all(n.hours)),
    "a word sets only the actor's own word, trimmed and lowercase": (p, n, a, m) =>
      a.t !== "word" ||
      p === n ||
      (typeof a.word === "string" &&
        rest(p.words, m.user) === rest(n.words, m.user) &&
        n.words[m.user] === a.word.trim().toLowerCase() &&
        all(p.counts) === all(n.counts) &&
        all(p.hours) === all(n.hours)),
    "an hour sets only the actor's own busiest hour": (p, n, a, m) =>
      a.t !== "hour" ||
      p === n ||
      (rest(p.hours, m.user) === rest(n.hours, m.user) && n.hours[m.user] === a.h && all(p.counts) === all(n.counts) && all(p.words) === all(n.words)),
    "a clear removes the actor's entries and no one else's": (p, n, a, m) =>
      a.t !== "clear" ||
      p === n ||
      (!hasEntries(n, m.user) &&
        rest(p.counts, m.user) === rest(n.counts, m.user) &&
        rest(p.words, m.user) === rest(n.words, m.user) &&
        rest(p.hours, m.user) === rest(n.hours, m.user)),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const x = r.next();
    if (x < 0.35) return { t: "count", n: r.pick([0, 5, 12, 50, 120, 800, -1, 100000]) };
    if (x < 0.65) return { t: "word", word: r.pick([CHAT.suggestWord, "facts", "bro", "  Ngl ", "", "two words", "averyveryverylongwordthatistoolong"]) };
    if (x < 0.92) return { t: "hour", h: r.pick([2, 15, 0, 23, 1, 24, -1]) };
    return hasEntries(s, user) ? { t: "clear" } : { t: "hour", h: r.int(24) };
  },

  local: { tab: "count", count: "", word: "", hour: CHAT.startHour },

  view: ({ state, me, members, dispatch, local, setLocal, theme }) => {
    const added = members.filter((m) => hasEntries(state, m.id)).length;
    const sorted = [...members].sort((a, b) => (state.counts[b.id] ?? -1) - (state.counts[a.id] ?? -1));
    const shown = sorted.slice(0, 6);
    const top = Math.max(1, ...Object.values(state.counts));
    const w = topWord(state);
    const h = topHour(state);

    const countText = local.count.trim();
    const countOk = /^\d{1,5}$/.test(countText);
    const wordText = local.word.trim().toLowerCase();
    const wordOk = wordText.length > 0 && wordText.length <= MAX_WORD && !/\s/.test(wordText);

    const card = { flex: 1, minWidth: 0, padding: 8, borderRadius: theme.radius.card, background: theme.color.input } as const;

    return (
      <div>
        <CardHeader title="Chat wrapped" subtitle={`${added} of ${members.length} added`} />
        <small>Messages</small>
        <div style={{ display: "grid", gap: 2, marginTop: 2 }}>
          {shown.map((m) => {
            const c = state.counts[m.id];
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 24 }}>
                <Avatar user={m} size={20} />
                <span style={{ width: 64, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                {c === undefined ? (
                  <small style={{ flex: 1, minWidth: 0, color: theme.color.secondaryText }}>No count yet</small>
                ) : (
                  <>
                    <div style={{ flex: 1, minWidth: 0, height: 8, borderRadius: theme.radius.pill, background: theme.color.track }}>
                      <div style={{ width: `${Math.max(2, Math.round((c / top) * 100))}%`, height: 8, borderRadius: theme.radius.pill, background: userColor(m, theme) }} />
                    </div>
                    <span style={{ minWidth: 44, textAlign: "right" }}>{c}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {sorted.length > shown.length ? <small>{`+${sorted.length - shown.length} more`}</small> : null}

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <div style={card}>
            <small>Top word</small>
            <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{w ? `${w.word} · ${people(w.n)}` : "No words yet"}</div>
          </div>
          <div style={card}>
            <small>Busiest time</small>
            <div style={{ fontWeight: 600 }}>{h ? `${hourLabel(h.hour)} · ${people(h.n)}` : "No hours yet"}</div>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
          <Button kind={local.tab === "count" ? "secondary" : "deemphasized"} onClick={() => setLocal({ tab: "count" })}>
            Count
          </Button>
          <Button kind={local.tab === "word" ? "secondary" : "deemphasized"} onClick={() => setLocal({ tab: "word" })}>
            Word
          </Button>
          <Button kind={local.tab === "hour" ? "secondary" : "deemphasized"} onClick={() => setLocal({ tab: "hour" })}>
            Hour
          </Button>
          {hasEntries(state, me) ? (
            <Button kind="deemphasized" onClick={() => dispatch({ t: "clear" })}>
              Clear
            </Button>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          {local.tab === "count" ? (
            <>
              <input
                style={{ flex: "1 1 80px", minWidth: 0 }}
                value={local.count}
                maxLength={5}
                placeholder="Your messages"
                aria-label="Your message count"
                onInput={(e) => setLocal({ count: e.currentTarget.value })}
              />
              <Button
                kind="primary"
                disabled={!countOk}
                onClick={() => {
                  if (!countOk) return;
                  dispatch({ t: "count", n: Number(countText) });
                  setLocal({ count: "" });
                }}
              >
                Add count
              </Button>
            </>
          ) : null}
          {local.tab === "word" ? (
            <>
              <input
                style={{ flex: "1 1 60px", minWidth: 0 }}
                value={local.word}
                maxLength={MAX_WORD}
                placeholder="Your word"
                aria-label="Your most used word"
                onInput={(e) => setLocal({ word: e.currentTarget.value })}
              />
              <Button kind="deemphasized" onClick={() => setLocal({ word: state.suggestWord })}>
                {state.suggestWord}
              </Button>
              <Button
                kind="primary"
                disabled={!wordOk}
                onClick={() => {
                  if (!wordOk) return;
                  dispatch({ t: "word", word: wordText });
                  setLocal({ word: "" });
                }}
              >
                Add
              </Button>
            </>
          ) : null}
          {local.tab === "hour" ? (
            <>
              <Button kind="deemphasized" onClick={() => setLocal({ hour: (local.hour + 23) % 24 })}>
                -
              </Button>
              <span style={{ minWidth: 44, textAlign: "center", fontWeight: 600 }}>{hourLabel(local.hour)}</span>
              <Button kind="deemphasized" onClick={() => setLocal({ hour: (local.hour + 1) % 24 })}>
                +
              </Button>
              <span style={{ flex: 1 }} />
              <Button kind="primary" onClick={() => dispatch({ t: "hour", h: local.hour })}>
                Add hour
              </Button>
            </>
          ) : null}
        </div>
      </div>
    );
  },
});
