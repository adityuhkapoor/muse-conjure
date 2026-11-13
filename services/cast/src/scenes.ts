// Named scenes: one tap sets up a moment in a new group chat, played live by the friends with
// human timing, and stops just before the one thing the presenter should do.

import { EVENT, fmtEventDate } from "../../../apps/shell/src/store/fake-data.ts";

export type SceneLine = { role: number; text?: string; link?: { site: string; title: string; description: string; eventId?: string }; react?: { role: number; emoji: string } };

export type Scene = {
  id: string;
  key: string;
  label: string;
  /** the new chat's name */
  chat: string;
  /** who plays each role, in order of preference */
  roles: string[][];
  lines: SceneLine[];
  /** what the presenter does next, shown in the controls */
  next: string;
  /** the message to send, when the next step is a message */
  ask?: string;
};

export const SCENES: Scene[] = [
  {
    id: "stuck",
    key: "1",
    label: "Where are we eating",
    chat: "dinner tonight",
    roles: [["maya", "priya"], ["dev", "jonah"], ["priya", "theo"]],
    lines: [
      { role: 1, text: "thai basil or sushi ko or the taco truck" },
      { role: 2, text: "not pier pizza again, im so over it" },
      { role: 0, text: "drinks after? $3 wells or byob or $2 pbr" },
      { role: 1, text: "not $14 cocktails, im broke" },
      { role: 2, text: "leave at 9:45 or 10:15? not 1am, im driving" },
      { role: 1, text: "idk u pick" },
      { role: 2, text: "no u pick", react: { role: 0, emoji: "😆" } },
    ],
    next: "Send “muse pick for us”, or tap Pick for us",
    ask: "muse pick for us",
  },
  {
    id: "concert",
    key: "2",
    label: "Concert plan",
    chat: "juniper fri",
    roles: [["theo", "jonah"], ["maya", "priya"], ["priya", "dev"]],
    lines: [
      { role: 0, link: { site: fmtEventDate(EVENT.start), title: EVENT.title, description: `${EVENT.venue} · ${EVENT.going} going`, eventId: EVENT.id } },
      { role: 0, text: "juniper hale friday. who's coming" },
      { role: 1, text: "me", react: { role: 0, emoji: "❤️" } },
      { role: 2, text: "interested, depends on tix" },
      { role: 1, text: "group tix are cheaper if we get 4" },
      { role: 0, text: "ok who's actually in" },
    ],
    next: "Tap the event, then Interested, then Go together",
  },
  {
    id: "chores",
    key: "3",
    label: "Roommates and chores",
    chat: "the apartment",
    roles: [["maya", "priya"], ["priya", "maya"], ["dev", "jonah"]],
    lines: [
      { role: 0, text: "ok who's on dishes this week" },
      { role: 1, text: "not me i did it last week" },
      { role: 2, text: "i took out trash twice" },
      { role: 0, text: "the sink is a biohazard", react: { role: 1, emoji: "😮" } },
      { role: 1, text: "someone make a chore wheel or something" },
    ],
    next: "Send “muse make a chore wheel”",
    ask: "muse make a chore wheel",
  },
  {
    id: "trip",
    key: "4",
    label: "Trip money",
    chat: "beach house",
    roles: [["dev", "jonah"], ["jonah", "theo"], ["priya", "maya"], ["maya", "priya"]],
    lines: [
      { role: 0, text: "ok house was 1200 total" },
      { role: 1, text: "i got gas, 64" },
      { role: 2, text: "groceries were 88 on me" },
      { role: 3, text: "so who owes who" },
      { role: 0, text: "no idea someone do math", react: { role: 2, emoji: "😆" } },
    ],
    next: "Send “muse who owes who”",
    ask: "muse who owes who",
  },
];

export const scene = (id: string) => SCENES.find((s) => s.id === id);

/** People for each role: first preference that is available and not already cast. */
export function castRoles(s: Scene, available: string[]): string[] | null {
  const used = new Set<string>();
  const out: string[] = [];
  for (const prefs of s.roles) {
    const who = prefs.find((p) => available.includes(p) && !used.has(p)) ?? available.find((p) => !used.has(p));
    if (!who) return null;
    used.add(who);
    out.push(who);
  }
  return out;
}
