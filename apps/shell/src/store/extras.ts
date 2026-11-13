import type { Person } from "./types";

const p = (id: string, name: string, tone: number, first = name.split(" ")[0] ?? name): Person => ({
  id,
  name,
  first,
  initials: name.split(" ").map((w) => w[0]).join(""),
  tone,
  active: false,
});

/**
 * Made-up people who are in a chat but not in the cast: they have messages and a name, no feed
 * posts. FEED_SPEC "Extras" lists them for the surfaces too; the chats need them first.
 */
export const EXTRA_PEOPLE: Person[] = [
  p("jules", "Jules Moreau", 1),
  p("omar", "Omar Haddad", 2),
  p("hana", "Hana Ito", 3),
  p("bea", "Bea Santos", 4),
  p("wes", "Wes Duarte", 5),
  p("tess", "Tess Yamamoto", 6),
  p("leo", "Leo Brandt", 1),
  p("dani", "Dani Flores", 2),
  p("rae", "Rae Whitfield", 3),
  p("kev", "Kev Tran", 4),
  p("zoe", "Zoe Achebe", 5),
  p("nico", "Nico Bauer", 6),
  p("ava", "Ava Lindqvist", 1),
  // the seven who post in groups and on Marketplace (surfaces/data.ts STRANGERS), so tools name them
  p("lena", "Lena Ortiz", 3),
  p("ines", "Ines Park", 2),
  p("sam", "Sam Okafor", 6),
  p("marco", "Marco Silva", 4),
  p("kofi", "Kofi Mensah", 1),
  p("cami", "Cami Reyes", 5),
  p("ruth", "Ruth Adler", 2),
  p("lin-mom", "Mom", 2),
  p("lin-dad", "Dad", 3),
  p("lin-eric", "Eric Lin", 4),
];
