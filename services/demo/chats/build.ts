// Turns a chat history, written one line per message, into the messages the seeder loads.
// The lines are transcribed from docs/FEED_SPEC.md section F; change the spec first.
//
// A line is [id, day offset from today, "HH:MM", sender, text, extras?].
//   sender: a wire id ("noa" is Tsai Lin; seed files never say "me"), "system", or "TOOL" (text = the seeded tool id).
//   text:   plain text; "[photo: brief]" is a photo (any text after the bracket is a second message);
//           "[link: site | title]" is a link card.
//   extras: { re: "😆 maya,noa" } reactions (groups split by ";"), { reply: "006" } reply to a line.
// An id that starts with "!" is used as is (no chat prefix), for messages another seeder also writes.

import type { Message } from "../../../apps/shell/src/store/types.ts";

export type Line = [id: string, day: number, time: string, from: string, text: string, extras?: { re?: string; reply?: string }];

const midnight = new Date();
midnight.setHours(0, 0, 0, 0);
const at = (day: number, time: string) => {
  const [h, m] = time.split(":").map(Number) as [number, number];
  const d = new Date(midnight);
  d.setDate(d.getDate() + day);
  return d.getTime() + (h * 60 + m) * 60_000;
};

const tone = (s: string): 1 | 2 | 3 => (((s.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 3) + 1) as 1 | 2 | 3);

function reactions(re?: string): Message["reactions"] {
  if (!re) return [];
  return re.split(";").map((g) => {
    const [emoji, who] = g.trim().split(" ") as [string, string];
    return { emoji, by: who.split(",") };
  });
}

export function chat(lines: Line[]): Message[] {
  const out: Message[] = [];
  for (const [id, day, time, from, text, extras] of lines) {
    const t = at(day, time);
    const base = { id, at: t, reactions: reactions(extras?.re), ...(extras?.reply ? { replyTo: extras.reply } : {}) };
    if (from === "TOOL") {
      // the seeder puts the "Muse built ..." line before the card
      out.push({ ...base, from: "muse", kind: "muse", muse: { appId: "", title: "", subtitle: "Made with Muse", toolId: text } });
      continue;
    }
    if (from === "system") {
      out.push({ ...base, from: "system", kind: "system", text });
      continue;
    }
    const photo = /^\[photo: (.+?)\](?:\s+(.*))?$/.exec(text);
    if (photo) {
      out.push({ ...base, from, kind: "photo", photo: { tone: tone(photo[1]!), label: photo[1]! } });
      if (photo[2]) out.push({ id: id + "b", from, kind: "text", text: photo[2], at: t, reactions: [] });
      continue;
    }
    const link = /^\[link: (.+?) \| (.+)\]$/.exec(text);
    if (link) {
      const [, site, title] = link as unknown as [string, string, string];
      // the event share carries its venue and count after the title, and opens the event page
      const ev = /^(Juniper Hale live) · (.+)$/.exec(title);
      out.push({ ...base, from, kind: "link", link: ev ? { site, title: ev[1]!, description: ev[2]!, eventId: "juniper" } : { site, title, description: "" } });
      continue;
    }
    out.push({ ...base, from, kind: "text", text });
  }
  return out;
}
