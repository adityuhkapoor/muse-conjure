// Chats that back a surface: a friend's tool post, a bracket post, a group's pinned tools. Their
// key starts with "surface:", so Messenger never lists them. Shared by the fake store, the live
// store and the demo seed (services/demo/seed-surfaces.ts), which fills them with real library
// pieces and a few first moves from friends. People use fake ids ("me" is Tsai Lin).

import { MOMENTS } from "./moments";
import { PEOPLE } from "../store/fake-data";

/** A cast member's first name as the shell shows it, so renames follow. */
const first = (id: string) => PEOPLE.find((p) => p.id === id)?.first ?? id;

export type BackingTool = {
  id: string;
  piece: string;
  params: Record<string, unknown>;
  name: string;
  /** the fake store's look (a ToolTemplate id) and summary */
  templateId: string;
  summary: string;
  /** first moves from friends, in order */
  acts: { user: string; action: unknown }[];
};

export type Backing = { key: string; id: string; name: string; members: string[]; tools: BackingTool[] };

const EVERYONE = ["me", "maya", "dev", "jonah", "priya", "theo"];

export const CHORE_TASKS = ["Dishes", "Trash", "Bathroom", "Floors"];
/** The den's chore wheel (lab chore-wheel), shared as a post: slices sized by fights, two of the three already spun. */
export const CHORE_WHEEL = {
  title: "Chore wheel",
  sub: "The den",
  rule: "Swaps allowed till Sun 8 PM",
  chores: [
    { label: "Dishes", fights: 7, note: "Pans clause: nothing soaks overnight" },
    { label: "Trash", fights: 4, note: "Tue is curb night" },
    { label: "Bathroom", fights: 3, note: "" },
    { label: "Floors", fights: 1, note: "" },
  ],
  spun: [
    { name: first("dev"), chore: "Dishes" },
    { name: first("theo"), chore: "Trash" },
  ],
};
export const DINING = ["Crossroads", "Foothill", "Clark Kerr", "Cafe 3"];
/** Arun's dining hall tier list (lab feed-tier-list): the feed's votes so far, and friends who already ranked. */
export const DINING_TIERS = {
  title: "Rank the dining halls",
  author: "Arun",
  items: [
    { name: "Crossroads", votes: [14, 21, 9, 3, 1] },
    { name: "Foothill", votes: [22, 12, 4, 1, 0] },
    { name: "Clark Kerr", votes: [5, 11, 16, 7, 2] },
    { name: "Cafe 3", votes: [2, 6, 13, 12, 9] },
    { name: "GBC late night", votes: [17, 9, 8, 5, 4] },
  ],
  people: [
    { name: "Arun", tiers: ["A", "S", "B", "D", "S"] },
    { name: "Maya", tiers: ["B", "S", "A", "C", "A"] },
    { name: "Calvin", tiers: ["A", "A", "C", "D", "S"] },
  ],
};

export const BACKING: Backing[] = [
  {
    // Calvin's apartment's chore wheel, shown as a post on Home. Tsai Lin is not in this chat: the post is a preview.
    key: "surface:post:den-chores",
    id: "s-den",
    name: "the den",
    members: ["jonah", "theo", "dev"],
    tools: [
      {
        id: "t-s-den-draft",
        ...MOMENTS.homeToolPost,
        name: "Chore wheel",
        summary: `${first("jonah")} spins next`,
        params: CHORE_WHEEL,
        acts: [],
      },
    ],
  },
  {
    // Arun's bracket post: everyone on Home can vote in it.
    key: "surface:post:dining",
    id: "s-dining",
    name: "best dining hall",
    members: EVERYONE,
    tools: [
      {
        id: "t-s-dining-tiers",
        ...MOMENTS.homeBracketPost,
        name: "Rank the dining halls",
        summary: "3 friends ranked",
        params: DINING_TIERS,
        acts: [],
      },
    ],
  },
  {
    // The sublet group. Its finder is built the first time someone asks for the matching posts.
    key: "surface:group:sublets",
    id: "s-sublets",
    name: "Eastfield sublets and housing",
    members: EVERYONE,
    tools: [],
  },
  {
    // The climbing club: a sign-up pinned by admins, and a meeting-time post that became a tool.
    key: "surface:group:climb",
    id: "s-climb",
    name: "Eastfield climbing club",
    members: EVERYONE,
    tools: [
      {
        // Maya's post "make a flyer for friday social" (surfaces/data.ts c0), pinned: she picked the paper and pinned it, three friends tore tabs.
        id: "t-s-flyer",
        ...MOMENTS.groupFlyer,
        name: "Friday social flyer",
        summary: "FRIDAY SOCIAL pinned · 3 of 6 tabs torn",
        params: {
          group: "Eastfield climbing club",
          size: "312",
          heads: [
            { head: "FRIDAY SOCIAL", sub: "pizza and bouldering. the wall, fri 7pm, bring a friend" },
            { head: "NEW CLIMBERS NIGHT", sub: "tue 6:40 at the rec center wall. shoes on us" },
            { head: "GEAR SWAP", sub: "thursday in the rec center lobby. cash only" },
            { head: "CRAG TRIP", sub: "castle rock sat. 3 cars, 12 seats, leave 8am" },
          ],
          board: [
            { head: "LOST CHALK BAG", paper: 5, by: first("theo") },
            { head: "SHOES SIZE 8", paper: 6, by: "Cami" },
            { head: "BELAY PARTNER", paper: 7, by: "Kofi" },
          ],
          week: { flyers: 9, tabs: 41 },
        },
        acts: [
          { user: "maya", action: { t: "paper", i: 2 } },
          { user: "maya", action: { t: "pin" } },
          { user: "theo", action: { t: "tear", i: 0 } },
          { user: "priya", action: { t: "tear", i: 1 } },
          { user: "dev", action: { t: "tear", i: 3 } },
        ],
      },
      {
        id: "t-s-gear-signup",
        ...MOMENTS.groupPinned,
        name: "Gear room shifts",
        summary: "4 of 9 taken",
        params: {
          title: "Gear room shifts",
          group: "Eastfield climbing club",
          date: "This week",
          meet: "The gear room",
          shifts: ["Mon 6-8", "Wed 6-8", "Sat 10-12"],
          roles: [
            { label: "Open up", icon: "clipboard", cap: 1, others: [["Ines"], [], ["Kofi"]] },
            { label: "Rentals", icon: "cart", cap: 2, others: [[], ["Cami"], []] },
          ],
          people: [
            { name: first("maya"), role: "Rentals", shift: "Mon 6-8" },
            { name: first("theo"), role: "Open up", shift: "Wed 6-8" },
          ],
        },
        acts: [],
      },
      {
        id: "t-s-meet",
        ...MOMENTS.groupMeeting,
        name: "Weekly meeting",
        summary: "Tue 7 pm works for 3",
        // The params and first moves follow the piece in MOMENTS.groupMeeting: meeting-time (lab) or overlap.
        ...(MOMENTS.groupMeeting.piece === "meeting-time"
          ? {
              params: {
                group: "Eastfield climbing club",
                members: 312,
                place: "The wall, back room",
                starts: "Sep 9",
                days: ["Mon", "Tue", "Wed", "Thu"],
                times: ["7pm", "9pm"],
                counts: [
                  [9, 14, 8, 11],
                  [5, 7, 6, 9],
                ],
                people: [],
              },
              acts: [
                { user: "maya", action: { t: "toggle", r: 0, c: 1 } },
                { user: "dev", action: { t: "toggle", r: 0, c: 1 } },
                { user: "theo", action: { t: "toggle", r: 0, c: 1 } },
                { user: "theo", action: { t: "toggle", r: 1, c: 2 } },
                { user: "jonah", action: { t: "toggle", r: 0, c: 3 } },
              ],
            }
          : {
              params: { title: "Weekly meeting", days: ["Mon", "Tue", "Wed", "Thu"], times: ["7 pm", "9 pm"] },
              acts: [
                { user: "maya", action: { t: "toggle", cell: 1 } },
                { user: "dev", action: { t: "toggle", cell: 1 } },
                { user: "theo", action: { t: "toggle", cell: 1 } },
                { user: "theo", action: { t: "toggle", cell: 6 } },
                { user: "jonah", action: { t: "toggle", cell: 3 } },
              ],
            }),
      },
    ],
  },
];

export const backing = (key: string) => BACKING.find((b) => b.key === key);
export const isSurfaceKey = (key: string | undefined) => !!key && key.startsWith("surface:");
