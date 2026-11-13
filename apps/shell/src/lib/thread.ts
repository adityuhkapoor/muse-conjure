import type { Message } from "../store/types";

export type Pos = "single" | "first" | "middle" | "last";

export type Row =
  | { type: "stamp"; key: string; at: number }
  | { type: "system"; key: string; msg: Message }
  | { type: "activity"; key: string; msg: Message }
  | { type: "msg"; key: string; msg: Message; pos: Pos; senderLabel: boolean; avatar: boolean; gapBefore: "same" | "group" };

const HOUR = 60 * 60_000;
const GROUP_GAP = 5 * 60_000;

const groupable = (m: Message) => m.kind !== "system" && m.kind !== "activity" && m.kind !== "muse";

/** Turns a message array into render rows: stamps, grouped bubbles, avatar and sender-label flags. */
export function buildRows(messages: readonly Message[], isGroup: boolean, me: string): Row[] {
  const rows: Row[] = [];
  let prevAt = -Infinity;
  const stampBefore: boolean[] = messages.map((m, i) => {
    const prev = messages[i - 1];
    return !prev || m.at - prev.at > HOUR || new Date(m.at).toDateString() !== new Date(prev.at).toDateString();
  });

  const joins = (a: Message | undefined, b: Message | undefined, bi: number) =>
    !!a && !!b && !stampBefore[bi] && groupable(a) && groupable(b) && a.from === b.from && b.at - a.at <= GROUP_GAP;

  messages.forEach((m, i) => {
    if (stampBefore[i]) rows.push({ type: "stamp", key: `s${m.id}`, at: m.at });
    prevAt = m.at;
    if (m.kind === "system" || m.kind === "activity") {
      rows.push({ type: m.kind, key: m.id, msg: m });
      return;
    }
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const joinPrev = joins(prev, m, i);
    const joinNext = joins(m, next, i + 1);
    const pos: Pos = joinPrev ? (joinNext ? "middle" : "last") : joinNext ? "first" : "single";
    const incoming = m.from !== me;
    rows.push({
      type: "msg",
      key: m.id,
      msg: m,
      pos,
      senderLabel: incoming && isGroup && !joinPrev,
      avatar: incoming && !joinNext,
      gapBefore: joinPrev ? "same" : "group",
    });
  });
  void prevAt;
  return rows;
}

const hm = (d: Date) => {
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  return { h12: h % 12 === 0 ? 12 : h % 12, m, ap: h < 12 ? "AM" : "PM" };
};

/** Centred timestamp line: "Today 9:12 AM", "Yesterday 11:20 PM", "Fri 4:05 PM". DF: centred grey separators. */
export function stampLabel(at: number, now: number): string {
  const d = new Date(at);
  const t = hm(d);
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  const when =
    days === 0 ? "Today" : days === 1 ? "Yesterday" : days < 7 ? d.toLocaleDateString("en-US", { weekday: "short" }) : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${when} ${t.h12}:${t.m} ${t.ap}`;
}

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Inbox row time: "9:41 am", "Yesterday"/"Fri" style per DF (lowercase am/pm, day names for older). */
export function rowTime(at: number, now: number): string {
  const t = hm(new Date(at));
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days === 0) return `${t.h12}:${t.m} ${t.ap.toLowerCase()}`;
  if (days === 1) return "Yesterday";
  if (days < 7) return new Date(at).toLocaleDateString("en-US", { weekday: "short" });
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const clockTime = (at: number) => {
  const t = hm(new Date(at));
  return `${t.h12}:${t.m} ${t.ap}`;
};
