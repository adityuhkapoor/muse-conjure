# Feed spec

What the mock Facebook and Messenger show when someone opens the demo, and what Muse does on
every surface. Content and behaviour only; no code. Sections A to E. Every string in quotes is the
exact string to ship. Where this spec changes an existing fact, it says "replaces".

## 0. Ground rules for implementers

### The week

- Canonical week: Mon Nov 9 to Sun Nov 15, 2026. "Now" is Thursday 9:41 AM (`CLOCK_BASE`).
- Write weekdays ("Fri 8 PM", "tonight", "Sat") computed from `CLOCK_BASE`, as `fake-data.ts`
  already does for the concert. Absolute dates are used only for things far away (May 17-21,
  Feb 7-9, Dec 4-6) and are written as given.
- `ago` values are from now. "3h" means `3 * H`.

### The viewer

The signed-in senior is Tsai Lin (`me`, wire id `noa`). Everything below is written for Tsai Lin.
Opening as `?as=maya` shows the same world; posts and tools are the same rooms, so Maya sees
her own moves as hers.

### The cast (ids fixed)

| id | Name | Lives | One line |
|---|---|---|---|
| `me` / `noa` | Tsai Lin (real) | Apt 4B | Climbing club admin, hosts Friendsgiving, plans everything, says "ok fine" before agreeing |
| `maya` | Maya Chen (made up) | Apt 4B | Thesis due, lives in the library, drives the Civic everyone fits in |
| `dev` | Aditya Kapoor (real) | Apt 4B | Booked the senior week house, drives the Jeep, cooks with too many pans |
| `jonah` | Calvin Karthik (real) | The den | Hosts Will's 21st, has the pickup truck, says "legend" |
| `priya` | Will Li (real, he/him) | Apt 4B | Turns 21 at midnight tonight, posted 11 of the 27 Big Sur stories |
| `theo` | Arun Vaithianathan (real) | The den | Gym at 9 AM ("dont ask"), on the door tonight, made the late night bracket |

Five of the six are real teammates, used with permission: Tsai Lin, Aditya, Calvin, Arun and Will
(he/him). Maya is made up. All five are likeable in every tool: they help, carry, drive, win or
make the plan. Jokes are affectionate, about things they say about themselves in the chat
("allegedly", "gym. dont ask", "ok fine"), and no one of them is the joke twice on the same
surface. No caption, trivia answer, bingo square or two-truths fact makes one of them look bad.
Where a lab example roasted someone, this spec gives the joke to Maya or an extra, or rewrites it.

Tsai Lin is written in full wherever a first name would go (posts, params, activity lines,
"Tsai Lin is up"). `PEOPLE` in `fake-data.ts`: `p(ME, "Tsai Lin", 5, true)` with `first:
"Tsai Lin"` set explicitly (the split gives "Tsai"), initials "TL"; `p("priya", "Will Li", 1, true)`.
`FIRST` maps in `services/demo/*.ts`: `noa: "Tsai Lin"`, `priya: "Will"`. Text that said
"Noa" or "Priya" before this spec (seed lines, summaries, e2e strings) follows the same rename.

Fixes to existing facts:
- `muse/seed.ts` POTLUCK `host: "Noa Levi"` replaces with `"Tsai Lin"`.
- `surfaces/backing.ts` the den `members: ["jonah", "theo", "dev"]` replaces with
  `["jonah", "theo", "jules", "omar"]`. Aditya lives in Apt 4B.
- `muse/seed.ts` GROUP_FACTS climb `dues.label: "Spring dues"` replaces with `"Fall dues"`.
- `muse/seed.ts` GROUP_FACTS sublets `roommates[0].by: "ines"` replaces with `"tess"` (Ines is
  moving to Seattle in December).
- Pictures: a photo agent is replacing drawn covers with real photos (Unsplash, Pexels; candid,
  phone-like). Every picture slot in this spec has a one-line photo brief (inline in A, in the
  B9 table for the rest, inline in F for chat photos). No photo shows an identifiable face that
  could be taken for a cast member; people appear from behind, as hands, or far away. Until a
  photo lands, the slot shows a drawn tile (`media: { tone, label }`). The three teammate photos
  in `assets/manifest.json` (`p-aditya`, `p-calvin`, `p-arun`) are avatars only.

### Extras (add to `STRANGERS` in `apps/shell/src/surfaces/data.ts`)

Existing seven keep their ids and names. Thirteen are new. Tones cycle 1 to 6.

| id | Name | One line |
|---|---|---|
| `lena` | Lena Ortiz | Sublets group admin, subletting her Dwight room, answers every DM in 4 minutes |
| `ines` | Ines Park | Climbing club president, runs ines.cooks, graduating in December and selling everything |
| `sam` | Sam Okafor | Reviews every taco truck on samtries, selling a projector |
| `marco` | Marco Silva | Selling the grey sectional, moving to Portland on Sunday |
| `kofi` | Kofi Mensah | Grad student, posts kofi.outside hikes, new to the club, has a car with 3 seats |
| `cami` | Cami Reyes | cami.eats dumpling reels, first outdoor climb this Sunday |
| `ruth` | Ruth Adler | Selling a green velvet loveseat, has opinions about upholstery |
| `jules` | Jules Moreau (new) | The den's fourth roommate, owns Gerald the plant |
| `omar` | Omar Haddad (new) | The den, runs at 6 AM, Arun's lab partner, just got a job offer |
| `hana` | Hana Ito (new) | Photo club, shoots film at everything, booked the Joshua Tree airbnb |
| `bea` | Bea Santos (new) | Climbing club treasurer, spreadsheets for fun |
| `wes` | Wes Duarte (new) | Foothill RA, moving into apt 2C on Sunday |
| `tess` | Tess Yamamoto (new) | Dining hall critic, writes 300 words about soup |
| `leo` | Leo Brandt (new) | 14 hot sauces, Dani's cook night regular |
| `dani` | Dani Flores (new) | Cooks for the whole floor, says "we're making this" weekly |
| `rae` | Rae Whitfield (new) | Will's best friend from home, flying in tonight for the 21st |
| `kev` | Kev Tran (new) | "i'm not even tired", asleep first every time |
| `zoe` | Zoe Achebe (new) | Class of '27 president, posts every event first |
| `nico` | Nico Bauer (new) | Juniper Hale superfan, Friday is his 7th show |
| `ava` | Ava Lindqvist (new) | 40-day Chatdle streak, never misses |

### Places (one town: Eastfield)

- Apt 4B, 1820 Dwight Way: Tsai Lin, Maya, Will, Aditya. Long wall 104 in, window wall 80 in, by the
  door 62 in (ROOM_4B).
- The den, 2214 Ellis St: Calvin, Arun, Jules, Omar. Has a roof.
- Meridian Hall, 40 Campus Row. Near it: Lupe's Tacos (4 min walk), The Copper Room (6 min),
  Campus Row Cafe (2 min).
- Food: Lupe's Tacos, El Primo truck, Gino's Pizza on Channing, Pier Pizza, Thai Basil, Sushi Ko,
  Night Owl Diner, Smoke & Barrel, Golden Fold, Mr. Bao, Dumpling Alley, Tea Hut, Boba Bliss,
  Milk & Moon, Bubble Lab, Kiki's Tea Truck, Dough Bros Donuts, Smash Shack, Fry Guy, the halal
  cart on Bancroft.
- Campus: Main stacks, the Union, the rec center wall, the quad, dining halls Crossroads,
  Foothill, Clark Kerr, Cafe 3.

### Recurring threads (each shows up on at least three surfaces)

| Thread | Facts | Where it shows |
|---|---|---|
| Will's 21st | Tonight 9 PM at the den, he turns 21 at midnight, countdown on the roof, Rae flies in at 6, gift is a record player | Feed F04, event E3, the boys (gift pool), late night (King's cup), Will DM (pizza), notification N3 |
| Juniper Hale | Fri 8 PM, Meridian Hall, doors 7, Balcony $38, Floor GA $52, Front rows $74 | Event E1, feed F08 F09 F26, the boys (seats, after food), reel R5, story S8, ask paths |
| Apt 4B chores, bills, rent | Chore draft, October utilities $286, groceries, rent $4,200 | Apt 4B chat, feed F17, gaming G1, ask path C13 |
| The den | Rent $3,600, chore draft, Gerald the plant | Feed F01 F10 F33, story S5 |
| Couch hunt | Old brown couch lost a spring. Grey sectional $180, green velvet loveseat $120, futon $60 | Marketplace M1 M2 M3, feed F19 F25, class group flyer, ask path C5, script |
| Climbing club | 312 members, 52 active, fall dues $20, Castle Rock crag day Sun 8 AM | Group G-A, event E4, feed F21 F28 F32 F35, ask path C15 |
| Senior week | Cayucos beach house May 17-21, sleeps 8, Aditya booked it | Senior week chat, gaming G2 G4, ask paths C1 C16 |
| Big Sur, 1 year ago | Nov 10-12 last year, Aditya, Maya, Will, Tsai Lin, 312 miles, Nepenthe, McWay Falls twice | Story S4, feed F18 F20, ask path C7 |
| Joshua Tree | Oct 30 to Nov 1, Hana, Bea, Kofi, Maya, Tsai Lin, Arun | Feed F21, caption contest, notification N5 |
| Friendsgiving | Sat 6 PM at Apt 4B, Tsai Lin hosts, 11 coming | Event E2, Maya DM (movie after), ask path C9 |

### Tool post headlines

Two lines above every tool in a post, both from `Post` in `surfaces/data.ts`:
- `headline`: "<Who> made <a thing>" in plain words ("Calvin's apartment made a chore draft").
- the byline under the tool: "Made with Muse · for <whom>" when Muse built it in a chat, or
  "<First name> made this · <N> used it" when a person made it on a page. N is `usedBy`.

### Where each kind of item goes

| Item | File |
|---|---|
| Feed posts, stories, reels, groups, listings, games, notifications | `apps/shell/src/surfaces/data.ts` |
| Facts a scenario reads (event tiers, listing sizes, post items) | `apps/shell/src/muse/seed.ts` |
| Chats behind a surface (post, group pinned tools) | `apps/shell/src/surfaces/backing.ts` |
| Tools already made on a page or post (seeded, with friends' moves) | `services/demo/seed-catalysts.ts` |
| Messenger chats and their tools | `apps/shell/src/store/fake-data.ts` (messages), `services/demo/seed.ts` (TOOLS) |
| Ask paths and offers | `apps/shell/src/muse/pack.ts` |
| What the made-up friends do after a tool appears | `services/cast` (`src/scenes.ts`, `src/lines.ts`, `src/choose.ts` weights) |

### Tool params

Each tool block gives the params that replace the lab example (`library/lab/<id>/example.ts`).
Shape and array lengths stay those of the example unless the block says otherwise. Money is in
cents. Names inside params are first names. A name that is a cast member and appears in "Already
done" is replayed as a real move by that user (`acts`), so its activity line has someone behind
it; a name that is an extra is baked into the params. "Viewer can" is what Tsai Lin can do without
leaving the post.

---

## A. Home feed

41 posts: 25 carry a live tool made in the background by friends' groups, 16 are ordinary. A tool post is first. No more than two ordinary
posts sit between tool posts. Order below is the order on screen.

Every lab tool tagged feed, story, reel or gaming appears here: bracket-post F03, feed-tier-list
F06, semester-wrapped F14, daily-puzzle F17, trip-story F20, friend-trivia-pub F24, story-beat
F30, face-drop F33, reel-cook-night F13, reel-to-try F34. Messenger, event, group and marketplace
tools come in as shares: chore-draft F01, host-board F04, event-carpool F09, rent-split F10,
move-out-sale F16, settle-up F21, group-buy F25, setlist-bingo F26, open-spots F29, move-in-day
F31, tab-claim F35, potluck F37, plan-spinner F38, dinner-veto F40, date-swipe F41.

Files for every post: `apps/shell/src/surfaces/data.ts` POSTS (replaces the current seven, ids
kept where listed). A tool post's tool: `services/demo/seed-catalysts.ts` (new ids `t-f-<post>`),
except F01 and F03 which keep their backing in `surfaces/backing.ts`. Facts a scenario reads:
`muse/seed.ts` FEED_POSTS.

### F01 · `p-den` · tool · chore-draft (keeps id)

- Author: Calvin Karthik (`jonah`) · 3h
- Text: "no more fighting about the bathroom. we draft chores now"
- Headline: "Calvin's apartment made a chore draft". Byline: "Made with Muse · for the den"
- Reactions: 21 (👍 11, 😆 7, ❤️ 3) · 4 comments · 0 shares
- Comments:
  - Maya: "arun took bathrooms first. a hero"
  - Arun: "someone had to. 5 points is 5 points"
  - Jules: "gerald thanks you all"
- Tool `t-s-den`, `lab:chore-draft` (replaces the 4-chore CHORE_DRAFT in `backing.ts`):
  ```
  title: "Chore draft", sub: "The den · November",
  chores: [
    { name: "Bathrooms", pts: 5, note: "Both. Yes both" }, { name: "Dishes", pts: 4, note: "Pans included" },
    { name: "Fridge", pts: 4, note: "Purge it 1st Sun" }, { name: "Trash", pts: 3, note: "+ curb on Tue" },
    { name: "Vacuum", pts: 3, note: "Whole apt" }, { name: "Recycling", pts: 2, note: "Flatten boxes" },
    { name: "Mail runs", pts: 2, note: "Lobby + packages" }, { name: "Plants", pts: 1, note: "Keep Gerald alive" } ],
  order: ["Arun", "Jules", "Calvin", "Omar"], picks: []
  ```
- Already done: Arun picked Bathrooms, Jules picked Dishes. Calvin is on the clock. Summary
  "Calvin is on the clock".
- Viewer can: watch the draft, tap "Use for my group" (remix into Apt 4B, which already has one,
  so it opens Apt 4B's).

### F02 · `p-maya` · photo (keeps id)

- Author: Maya Chen · 1h
- Text: "thesis draft is in. going to sleep for 3 days"
- Photo: drawn, tone 3, "Laptop on a library table at night"
- Photo brief: open laptop and a highlighted printout on a wooden library table, desk lamp glow, portrait, late and relieved, no people
- Reactions: 48 (❤️ 30, 👍 14, 😮 4) · 9 comments · 0 shares
- Comments: Tsai Lin "proud of u. also you have 4 dishes in the sink", Will "sleep is for after friendsgiving", Calvin "legend"

### F03 · `p-dining` · tool · bracket-post (keeps id, new subject)

- Author: Arun Vaithianathan (`theo`) · 7h
- Text: "settling this once and for all. vote"
- Headline: "Arun made a bracket". Byline: "Arun made this · 41 used it"
- Reactions: 33 (😆 15, 👍 12, ❤️ 6) · 17 comments · 2 shares
- Comments:
  - Calvin: "lupe's at 1am is a religious experience"
  - Will: "halal cart. this isn't a discussion"
  - Tess: "the final is TIED. someone break it"
- Tool `t-s-dining`, `lab:bracket-post` (replaces piece:bracket "Best dining hall"; the dining
  halls move to gaming G6). Same tool in the late night chat as `t-bracket` (one room: point
  both at `surface:post:dining`):
  ```
  title: "Best late night food in Eastfield", left: "3h left",
  teams: [ { name: "Lupe's Tacos", food: "burrito" }, { name: "El Primo truck", food: "taco" },
    { name: "Dough Bros Donuts", food: "donut" }, { name: "Night Owl Diner", food: "shake" },
    { name: "Gino's Pizza", food: "pizza" }, { name: "Smash Shack", food: "burger" },
    { name: "Halal cart on Bancroft", food: "curry" }, { name: "Fry Guy", food: "fries" } ],
  quarters: [0, 0, 0, 0], semis: [[31, 26], [29, 28]], final: [31, 31],
  people: [ { name: "Calvin", picks: ["Lupe's Tacos"] }, { name: "Aditya", picks: ["Dough Bros Donuts", "Halal cart on Bancroft"] },
    { name: "Will", picks: ["Halal cart on Bancroft"] }, { name: "Arun", picks: ["Lupe's Tacos", "Halal cart on Bancroft"] } ]
  ```
- Already done: Calvin, Aditya, Will and Arun voted. Final is Lupe's Tacos 31, Halal cart 31.
- Viewer can: vote the final. Tsai Lin's vote breaks the tie and crowns the champ.

### F04 · `p-21st` · tool · host-board

- Author: Calvin Karthik · 2h
- Text: "will's 21st is at the den tonight. arun is on the door. countdown on the roof at 11:59"
- Headline: "Calvin is hosting Will's 21st". Byline: "Calvin made this · 24 used it"
- Reactions: 64 (❤️ 38, 👍 20, 😮 6) · 22 comments · 1 share
- Comments:
  - Will: "i'm going to cry and it's only 7am"
  - Rae: "landing at 6. save me a spot on the roof"
  - Arun: "door list is tight. if you're not on it, ask calvin nicely"
- Tool `t-f-21st`, `lab:host-board` (same room as event E3):
  ```
  title: "Will's 21st", when: "Tonight 9pm", host: "Calvin", cap: 40, door: "Arun",
  going: ["Calvin", "Will", "Arun", "Maya"], maybe: ["Aditya"],
  othersGoing: 21, othersMaybe: 17, guests: ["Rae", "Jules", "Hana", "Omar", "Bea"], plus: 1, rate: 1
  ```
- Already done: Calvin, Will, Arun and Maya are going. Aditya is a maybe ("finishing a problem
  set first" as his note if the tool shows notes). Arun added Rae and Hana to the door list.
- Viewer can: tap Going or Maybe, add a plus-one. The door list locks once it fits 40.

### F05 · `p-lena` · group post (keeps id)

- Author: Lena Ortiz in Eastfield sublets and housing · 5h
- Text: "subletting my room jun-aug, 2br on dwight, $950 furnished. dm me"
- Photo: asset `place-dorm`, "Room with a lofted bed and a desk"
- Photo brief: (asset already set) small bedroom with a lofted bed over a desk, daylight, landscape, tidy, no people
- Reactions: 6 (👍 6) · 11 comments · 2 shares
- Comments: Sam "is the loft bed staying", Lena "loft stays, i'm taking the plant", Kofi "dm'd"

### F06 · `p-boba` · tool · feed-tier-list

- Author: Maya Chen · 2h
- Text: "ranked every boba place on telegraph. 1 tea hut 2 boba bliss 3 milk & moon 4 bubble lab. fight me"
  (replaces the FEED_POSTS text; Sharetea and Plentea are real chains, so they become Milk & Moon
  and Bubble Lab)
- Headline: "Maya made a tier list". Byline: "Maya made this · 112 used it"
- Reactions: 41 (😆 18, 👍 16, ❤️ 7) · 23 comments · 3 shares
- Comments:
  - Will: "boba bliss at 2 is slander"
  - Arun: "kiki's truck at 2am is an S and you know it"
  - Maya: "the truck is only open when i'm asleep"
- Tool `t-cat-feed-ranking` (keeps id), `lab:feed-tier-list`:
  ```
  title: "Rank the boba on Telegraph", author: "Maya",
  items: [ { name: "Tea Hut", votes: [17, 13, 5, 2, 0] }, { name: "Boba Bliss", votes: [9, 15, 9, 3, 1] },
    { name: "Milk & Moon", votes: [12, 6, 6, 8, 5] }, { name: "Bubble Lab", votes: [4, 10, 11, 8, 4] },
    { name: "Union cafe boba", votes: [1, 4, 9, 13, 10] }, { name: "Kiki's Tea Truck", votes: [2, 7, 14, 9, 4] } ],
  people: [ { name: "Maya", tiers: ["S", "A", "B", "C", "D", "B"] },
    { name: "Will", tiers: ["A", "S", "B", "C", "D", "A"] },
    { name: "Aditya", tiers: ["S", "B", "A", "B", "C", "C"] } ]
  ```
- Already done: Maya, Will and Aditya posted their tiers; 109 people outside the chat voted.
- Viewer can: drop each place into S to D, post, see the consensus and where Tsai Lin disagrees.
- FEED_POSTS `p-boba.items` replaces with the six names above.

### F07 · `p-hana` · photo

- Author: Hana Ito · 4h
- Text: "shot a whole roll on the walk to class. the fog was showing off"
- Photo: drawn, tone 2, "Fog over the quad at sunrise"
- Photo brief: fog over a grassy campus quad with a clock tower faint behind it, sunrise, landscape, film grain, no people
- Reactions: 37 (❤️ 29, 👍 8) · 5 comments · 0 shares
- Comments: Tsai Lin "framing this", Bea "is that the bell tower or a ghost", Hana "both"

### F08 · `p-zoe` · event share

- Author: Zoe Achebe · 6h
- Text: "student tickets for juniper hale at the box office today, bring your id. see you friday"
- Shared event card: Juniper Hale live · Fri at 8:00 PM · Meridian Hall · 84 going
- Reactions: 52 (👍 31, ❤️ 21) · 14 comments · 9 shares
- Comments: Nico "7th show. i will be at the rail", Maya "going with my whole apartment", Zoe "front rows are almost gone btw"

### F09 · `p-rides` · tool · event-carpool share

- Author: Maya Chen · 5h
- Text: "driving to juniper hale tmrw. 2 seats left in mine, calvin has the truck"
- Headline: "Maya shared rides to Juniper Hale live". Byline: "Maya made this · 6 used it"
- Reactions: 18 (👍 12, ❤️ 6) · 6 comments · 0 shares
- Comments: Will "shotgun is mine, it's my birthday weekend", Calvin "truck has 3 seats and a heater that works sometimes", Aditya "jeep leaves last, street parking, cheap"
- Tool `t-cat-event-carpool` (keeps id, same room as event E1), `lab:event-carpool`:
  ```
  title: "Rides to Juniper Hale", place: "Meridian Hall · Fri",
  cars: [
    { driver: "Maya", model: "Maya's Civic", seats: 4, leaves: "7:00", from: "Apt 4B", costCents: 1200, costLabel: "Meridian lot", riders: ["Will"] },
    { driver: "Calvin", model: "Calvin's truck", seats: 3, leaves: "7:10", from: "The den", costCents: 1200, costLabel: "Meridian lot", riders: ["Arun"] },
    { driver: "Aditya", model: "Aditya's Jeep", seats: 4, leaves: "7:20", from: "Dwight & College", costCents: 600, costLabel: "Street meter", riders: [] } ]
  ```
- Already done: Will took a seat in Maya's Civic, Arun took one in Calvin's truck. Summary
  replaces "Maya is driving · 3 seats open" with "Maya is driving · 2 seats open".
- Viewer can: tap an open seat, see the parking split for that car, lock the cars once full.

### F10 · `p-rent` · tool · rent-split share

- Author: Jules Moreau · 8h
- Text: "rent for the den, sorted in 4 minutes. omar gets the parking spot and pays for it"
- Headline: "The den made a rent split". Byline: "Made with Muse · for the den"
- Reactions: 15 (👍 9, 😆 6) · 3 comments · 0 shares
- Comments: Omar "worth it for the spot", Calvin "the big room tax is real", Jules "2 of 4 agreed, waiting on you two"
- Tool `t-f-rent`, `lab:rent-split`:
  ```
  title: "2214 Ellis St", rentCents: 360000, weight: 60, bathCents: 12000, parkingCents: 7500,
  rooms: [ { name: "Calvin", sqft: 180, bath: true, parking: false }, { name: "Arun", sqft: 140, bath: false, parking: false },
    { name: "Omar", sqft: 120, bath: false, parking: true }, { name: "Jules", sqft: 105, bath: false, parking: false } ],
  agreed: ["Calvin", "Arun"]
  ```
- Already done: Calvin and Arun agreed. Omar and Jules have not.
- Viewer can: see each room's share, tap "Use for my group" to make one for Apt 4B (ask path C13
  does the same from the chat).

### F11 · `p-tess` · text

- Author: Tess Yamamoto · 9h
- Text: "crossroads pesto pasta tuesday is the only constant in my life"
- Reactions: 29 (😆 14, ❤️ 11, 👍 4) · 7 comments · 0 shares
- Comments: Maya "and it's never there when i go", Tess "you have to be there at 11:40. it's a lifestyle", Arun "foothill stir fry would never do this to you"

### F12 · `p-kev` · text

- Author: Kev Tran · 10h
- Text: "i'm not even tired" (posted 1:12 AM)
- Reactions: 44 (😆 40, 👍 4) · 6 comments · 0 shares
- Comments: Ava "you were asleep at 1:14", Wes "he's asleep on the floor of the lounge rn", Kev "resting my eyes"

### F13 · `p-cook` · tool · reel-cook-night

- Author: Dani Flores · 10h
- Text: "we're making this. friday after everyone's back from juniper? or thursday"
- Shared reel: ines.cooks · "15 minute chili crisp noodles. 6 things, one pan"
- Headline: "Dani is hosting a cook night". Byline: "Dani made this · 5 used it"
- Reactions: 26 (❤️ 15, 👍 11) · 8 comments · 1 share
- Comments: Leo "i'm bringing 3 hot sauces and you can't stop me", Ines "use the good chili crisp, not the jar from the union", Hana "scallions and garlic are mine"
- Tool `t-f-cook`, `lab:reel-cook-night` (514 px tall at rest: show it on the feed and the reel
  page, where the budget is 600, not in a chat):
  ```
  reel: { from: "Dani", note: "We're making this", account: "ines.cooks", title: "15 minute chili crisp noodles", plays: "12.8K likes" },
  host: "Dani", time: "7pm", serves: 6, costCents: 4200,
  items: [ { label: "Wide noodles", by: "Dani" }, { label: "Chili crisp", by: "Dani" }, { label: "Soy sauce", by: "Leo" },
    { label: "Black vinegar", by: "" }, { label: "Garlic", by: "Hana" }, { label: "Peanuts", by: "" },
    { label: "Scallions", by: "Hana" }, { label: "Cucumbers", by: "Bea" }, { label: "Mochi", by: "" } ],
  nights: [ { day: "Thu", date: "Nov 19", votes: ["Leo"] }, { day: "Fri", date: "Nov 20", votes: ["Dani", "Hana", "Bea"] },
    { day: "Sun", date: "Nov 22", votes: [] } ]
  ```
- Already done: Dani, Leo, Hana and Bea claimed things and voted nights. Black vinegar, Peanuts
  and Mochi are open. Fri leads 3 to 1.
- Viewer can: claim an open ingredient, vote a night. A fourth Friday vote locks it.

### F14 · `p-wrapped` · tool · semester-wrapped

- Author: Will Li · 11h
- Text: "fall '26 so far. calvin sent 1,395 voice memos and i'm framing it"
- Headline: "Will shared his story". Byline: "Made with Muse · for apt 4b and the den"
- Reactions: 58 (😆 26, ❤️ 24, 👍 8) · 12 comments · 4 shares
- Comments: Calvin "they're called podcasts", Maya "212 hours in the library and i'm not proud", Tsai Lin "the 4:12 am card is a cry for help"
- Tool `t-f-wrapped`, `lab:semester-wrapped` (same room as story S6):
  ```
  term: "Fall '26 so far",
  cards: [
    { kind: "study", title: "Library hours", big: "212", unit: "hrs at Main stacks", who: "Maya", detail: "Mostly the 3rd floor" },
    { kind: "food", title: "Dining loyalty", big: "87", unit: "group visits", who: "Crossroads", detail: "Pesto pasta on Tuesdays" },
    { kind: "chat", title: "Chat MVP", big: "3,402", unit: "messages", who: "Calvin", detail: "1,395 of them voice memos" },
    { kind: "music", title: "Pregame song", big: "61", unit: "plays", who: "Northbound", detail: "Always on Arun's aux" },
    { kind: "night", title: "Latest night", big: "4:12", unit: "am, midterms week", who: "Tsai Lin", detail: "Oct 22, Main stacks" },
    { kind: "squad", title: "Holo rare", big: "8", unit: "of us, 1 semester", who: "Apt 4B and the den", detail: "Dwight and Ellis" } ],
  opened: ["Maya", "Aditya", "Calvin", "Arun"]
  ```
- Already done: Maya, Aditya, Calvin and Arun ripped their packs.
- Viewer can: rip the pack, flip the six cards, share one card to a story.

### F15 · `p-dev` · text (keeps id)

- Author: Aditya Kapoor · 9h
- Text: "anyone selling a mini fridge. asking for a friend (me)"
- Reactions: 7 (😆 5, 👍 2) · 6 comments · 0 shares
- Comments: Ines "i am. friends first sale is up", Aditya "claimed. you're a legend", Will "it's for his pans isn't it"

### F16 · `p-ines-sale` · tool · move-out-sale

- Author: Ines Park · 12h
- Text: "moving to seattle in december. friends get first pick until tomorrow 9am, then it all goes on marketplace"
- Headline: "Ines is selling to friends first". Byline: "Ines made this · 19 used it"
- Reactions: 33 (😮 12, ❤️ 12, 👍 9) · 15 comments · 2 shares
- Comments: Tsai Lin "the climbing club is not ready", Kofi "crash pad is mine. i'll pick up saturday", Ines "bring a dolly, i'm on the 2nd floor"
- Tool `t-f-sale`, `lab:move-out-sale` (same room as listing M5 and the sublets group post):
  ```
  seller: "Ines",
  items: [ { name: "Standing desk", priceCents: 9000, kind: "desk", claimedBy: "" },
    { name: "Arc lamp", priceCents: 2500, kind: "lamp", claimedBy: "Will" },
    { name: "Road bike", priceCents: 12000, kind: "bike", claimedBy: "" },
    { name: "Mini fridge", priceCents: 4000, kind: "fridge", claimedBy: "Aditya" },
    { name: "Monstera", priceCents: 1500, kind: "plant", claimedBy: "" },
    { name: "Crash pad", priceCents: 6000, kind: "other", claimedBy: "Kofi" } ],
  publicWhen: "tomorrow 9am", pickup: "Sat 10–12 · 2400 Durant, 2nd floor", note: "bring a dolly lol"
  ```
- Already done: Will claimed the arc lamp, Aditya the mini fridge, Kofi the crash pad.
- Viewer can: claim the standing desk, road bike or monstera; see her haul and pickup time.

### F17 · `p-chatdle` · tool · daily-puzzle

- Author: Aditya Kapoor · 1h
- Text: "chatdle #213 in 3. the first guess was a cry for help"
- Headline: "Aditya shared Chatdle". Byline: "Made with Muse · for apt 4b"
- Reactions: 12 (😆 8, 👍 4) · 5 comments · 0 shares
- Comments: Will "5 for me. i blame the word", Maya "haven't played yet don't spoil it", Tsai Lin "9 day streak on the line"
- Tool `t-g-chatdle` (same room as gaming G1), `lab:daily-puzzle`:
  ```
  word: "DRAFT", said: 41, chat: "apt 4b", no: 213, day: "Thu",
  source: { who: "Tsai Lin", text: "ok fine draft it", when: "today" },
  streaks: [ { who: "Maya", days: 6 }, { who: "Aditya", days: 12 }, { who: "Will", days: 4 }, { who: "Tsai Lin", days: 9 } ],
  played: [ { who: "Aditya", marks: ["00100", "12000", "22222"] },
    { who: "Will", marks: ["00100", "00010", "12000", "22002", "22222"] } ]
  ```
- Already done: Aditya solved in 3, Will in 5. Maya and Tsai Lin have not played.
- Viewer can: guess, keep the 9-day streak, see the grids after finishing.

### F18 · `p-memory` · memory

- Card: "1 year ago" · Tsai Lin with Aditya Kapoor, Maya Chen and Will Li
- Text (from last year): "big sur. aditya drove all of it and we did the short mcway falls hike twice"
- Photo: tone 1, "Bixby Bridge over the ocean at golden hour"
- Photo brief: arched concrete bridge on a coastal cliff road over the ocean, golden hour, landscape, nostalgic, no people
- Reactions: 61 (❤️ 49, 👍 12) · 8 comments · 0 shares
- Comments: Aditya "same time next year?", Maya "nepenthe again or i riot", Will "i posted 11 stories that weekend and i regret nothing"
- Offer under it: "Make it a plan" (opens ask path C7 on Aditya's story).

### F19 · `p-ruth` · marketplace share

- Author: Ruth Adler · 5h
- Text: "selling my green velvet loveseat. fits 2, cat free home, i will miss her"
- Shared listing: Green velvet loveseat · $120 · Eastfield (`l-loveseat`)
- Reactions: 9 (❤️ 6, 👍 3) · 4 comments · 1 share
- Comments: Aditya "measuring our wall right now", Ruth "58 inches, i measured twice", Maya "aditya sit down"

### F20 · `p-trip-story` · tool · trip-story

- Author: Aditya Kapoor · 13h
- Text: "1 year ago today. made us a recap"
- Headline: "Aditya shared a trip story". Byline: "Made with Muse · for big sur"
- Reactions: 47 (❤️ 35, 👍 12) · 9 comments · 1 share
- Comments: Will "the costs slide is violent", Maya "mvp is correct", Tsai Lin "do it again in december"
- Tool `t-cat-story-trip` (same room as story S4), `lab:trip-story`:
  ```
  city: "Big Sur", days: 3, dates: "Nov 10-12",
  stops: [ { label: "Apt 4B", x: 0.88, y: 0.12 }, { label: "Bixby Bridge", x: 0.62, y: 0.38 },
    { label: "Pfeiffer Beach", x: 0.45, y: 0.55 }, { label: "Nepenthe", x: 0.34, y: 0.66 }, { label: "McWay Falls", x: 0.2, y: 0.86 } ],
  miles: "312 mi", milesNote: "Highway 1, both ways",
  moment: "4:50pm · McWay Falls, the short hike, the second time",
  mvp: { who: "Aditya", facts: ["Drove all 312 miles", "Found the campsite with showers", "0 wrong turns"] },
  costs: [ { label: "Campsite, 2 nights", cents: 14400 }, { label: "Nepenthe dinner", cents: 18800 },
    { label: "Gas", cents: 9600 }, { label: "Groceries", cents: 6200 }, { label: "Bixby parking", cents: 1000 } ],
  next: "Big Sur '26"
  ```
- Already done: Maya and Will tapped through and tapped "I'm in" on the last card.
- Viewer can: tap through the six cards, tap "I'm in" for next year.

### F21 · `p-jt` · tool · settle-up

- Author: Hana Ito · 1d
- Text: "joshua tree tab. 9 iou's became 4 payments. arun is somehow square"
- Headline: "Hana settled the Joshua Tree tab". Byline: "Made with Muse · for joshua tree"
- Reactions: 22 (😆 12, 👍 10) · 6 comments · 0 shares
- Comments: Arun "i don't make the rules", Bea "paid. hana you're a saint for booking", Tsai Lin "sending tonight i promise"
- Tool `t-f-jt`, `lab:settle-up`:
  ```
  title: "Joshua Tree tab",
  ious: [ { from: "Bea", to: "Hana", cents: 15000, why: "airbnb" }, { from: "Tsai Lin", to: "Hana", cents: 14500, why: "airbnb" },
    { from: "Kofi", to: "Hana", cents: 15000, why: "airbnb" }, { from: "Arun", to: "Hana", cents: 15000, why: "airbnb" },
    { from: "Hana", to: "Bea", cents: 4800, why: "gas" }, { from: "Tsai Lin", to: "Kofi", cents: 8400, why: "groceries+gas" },
    { from: "Hana", to: "Maya", cents: 8100, why: "firewood+tacos" }, { from: "Bea", to: "Arun", cents: 11000, why: "crash pad rental" },
    { from: "Maya", to: "Arun", cents: 4000, why: "crash pad rental" } ]
  ```
- Nets: Hana +$466, Maya +$41, Arun $0, Kofi -$66, Bea -$212, Tsai Lin -$229. Fewest payments: Tsai Lin to
  Hana $229, Bea to Hana $212, Kofi to Hana $25, Kofi to Maya $41.
- Already done: Bea marked her $212 paid.
- Viewer can: see "You pay Hana $229", mark it paid.

### F22 · `p-priya` · photo (keeps id)

- Author: Will Li · 1d
- Text: "sunday brunch before everyone leaves for break"
- Photo: drawn, tone 2, "Brunch table with six plates"
- Photo brief: overhead brunch table, six plates of french toast and eggs, coffee mugs, hands reaching in but no faces, square, warm
- Reactions: 112 (❤️ 80, 👍 32) · 14 comments · 1 share
- Comments: Maya "the french toast changed me", Rae "jealous. 6 hours till i'm there", Calvin "i'll go again tomorrow"

### F23 · `p-omar` · life event

- Author: Omar Haddad · 1d
- Life event: "Accepted a job offer · Lakeside Labs · starts July"
- Text: "6am runs paid off somehow"
- Reactions: 188 (❤️ 120, 👍 61, 😮 7) · 41 comments · 0 shares
- Comments: Arun "lab partner of the year. proud of you", Jules "we're getting you a cake tonight. well, will's cake. we'll share", Kev "congrats man"

### F24 · `p-trivia` · tool · friend-trivia-pub

- Author: Maya Chen · 14h
- Text: "made a quiz about senior week. aditya got 850. nobody is beating that"
- Headline: "Maya made a quiz". Byline: "Maya made this · 38 used it"
- Reactions: 24 (😆 14, 👍 10) · 11 comments · 0 shares
- Comments: Aditya "i booked the house, of course i know it sleeps 8", Calvin "390 and i stand by my answers", Will "the fire drill question is a core memory"
- Tool `t-cat-game-trivia` (replaces the seeded "2 questions · play" tool; same room as gaming G2), `lab:friend-trivia-pub`:
  ```
  title: "How well do you know senior week?", by: "Maya", plays: 38,
  questions: [
    { about: "Maya", q: "Maya's boba order, every time?", options: ["Taro milk tea", "Brown sugar", "Thai tea", "Matcha latte"], answer: 1 },
    { about: "Aditya", q: "How many does Aditya's beach house sleep?", options: ["6", "8", "10", "12"], answer: 1 },
    { about: "Will", q: "How many of the 27 Big Sur stories did Will post?", options: ["4", "9", "11", "14"], answer: 2 },
    { about: "Calvin", q: "Calvin's karaoke song?", options: ["Mr. Brightside", "Dancing Queen", "Since U Been Gone", "Valerie"], answer: 1 },
    { about: "the group", q: "Where did senior week first hang out?", options: ["Laundry room", "Lupe's line", "The 3am fire drill", "Intro CS lab"], answer: 2 } ],
  played: [ { who: "Aditya", picks: [1, 1, 2, 1, 2], points: [190, 170, 150, 180, 160] },
    { who: "Arun", picks: [1, 1, 2, 0, 2], points: [160, 180, 200, 0, 150] },
    { who: "Will", picks: [0, 1, 3, 1, 2], points: [0, 150, 0, 190, 170] },
    { who: "Calvin", picks: [1, 3, 2, 1, 1], points: [140, 0, 120, 130, 0] } ]
  ```
- Totals: Aditya 850, Arun 690, Will 510, Calvin 390.
- Already done: those four played.
- Viewer can: play the five questions, see who picked what, land on the board.

### F25 · `p-couch` · tool · group-buy

- Author: Aditya Kapoor · 6h
- Text: "the old couch lost a spring and a little of its dignity. apt 4b is voting"
- Headline: "Apt 4B is picking a couch". Byline: "Made with Muse · for apt 4b"
- Reactions: 31 (😆 20, 👍 11) · 9 comments · 0 shares
- Comments: Calvin "truck is free saturday at 11", Maya "sectional. we fit all 4 for movie night", Ruth "the loveseat is still available :)"
- Tool `t-f-couch` (same room as listing M1), `lab:group-buy`:
  ```
  title: "Couch hunt · apt 4b",
  listings: [
    { name: "Grey sectional", priceCents: 18000, where: "0.8 mi · Eastfield", style: "sectional", color: "grey", quote: "Maya: “fits all 4 of us for movie night”" },
    { name: "Green velvet loveseat", priceCents: 12000, where: "1.1 mi · Eastfield", style: "velvet", color: "green", quote: "Aditya: “velvet is rich roommate energy”" },
    { name: "Futon", priceCents: 6000, where: "2.3 mi · North Eastfield", style: "other", color: "blue", quote: "" } ],
  votes: [ { name: "Maya", listing: 0 }, { name: "Will", listing: 0 }, { name: "Aditya", listing: 1 } ],
  wins: 3, pickup: "Sat 11am · Calvin's truck"
  ```
- Already done: Maya and Will voted the sectional, Aditya the loveseat.
- Viewer can: vote. A sectional vote reaches 3, it is bought and split $45 each.

### F26 · `p-setlist` · tool · setlist-bingo

- Author: Nico Bauer · 15h
- Text: "setlist bingo from wednesday's show in riverside. 6 called. friday is mine"
- Headline: "Nico made setlist bingo". Byline: "Nico made this · 212 used it"
- Reactions: 70 (❤️ 41, 👍 22, 😮 7) · 19 comments · 11 shares
- Comments: Zoe "she did the hat toss. i screamed", Maya "using this friday", Nico "she always opens with northbound. always"
- Tool `t-f-setlist`, `lab:setlist-bingo`:
  ```
  title: "Setlist bingo", sub: "Juniper Hale · Alder Theater · Wed",
  cells: [ "Paper Lanterns", "Northbound", "Glasshouse", "Slow Tide", "Crowd sings along",
    "Ferris Wheel", "Rooftops", "Juniper's hat toss", "Lighthouse", "Seventeen",
    "Acoustic one", "Phone lights up", "Says the city's name", "Blue Hour",
    "Cover song", "A 10-min jam", "Polaroid", "Tells the van story", "New song",
    "Brings a fan on stage", "Encore", "Drops a pick", "Northbound (reprise)", "Thank you, Riverside" ],
  played: [2, 7, 10, 11, 12, 13],
  marks: [ { name: "Nico", cells: [2, 7, 10, 11, 12] }, { name: "Zoe", cells: [7, 10, 11, 12] },
    { name: "Ava", cells: [2, 11, 12] }, { name: "Kev", cells: [2, 7] }, { name: "Hana", cells: [10] } ]
  ```
- Already done: Nico, Zoe, Ava, Kev and Hana marked cells during Wednesday's show.
- Viewer can: see the card and friends' marks, tap "Use for Friday" (makes one on event E1 with
  "Thank you, Meridian" in the last cell and nothing played).

### F27 · `p-jonah` · photo (keeps id)

- Author: Calvin Karthik · 2d
- Text: "we lost but the tailgate won"
- Photo: drawn, tone 1, "Grill and folding chairs in a parking lot"
- Photo brief: charcoal grill smoking next to folding chairs and a cooler in a stadium lot, afternoon, landscape, game-day, no faces
- Reactions: 64 (😆 30, 👍 26, ❤️ 8) · 8 comments · 0 shares
- Comments: Arun "calvin's grill carried", Omar "best burgers of the season", Aditya "next home game same spot"

### F28 · `p-bea-link` · shared link

- Author: Bea Santos · 1d
- Text: "wall hours are longer for finals. tuesday and thursday till 10"
- Link card: rec.eastfield.example · "Rec center wall: finals hours" · "Tue and Thu 7 to 10 PM from Nov 30. Gear room open Mon and Wed."
- Reactions: 19 (👍 15, ❤️ 4) · 3 comments · 2 shares
- Comments: Maya "thesis break spot secured", Tsai Lin "i'll pin it in the group", Kofi "finally"

### F29 · `p-tahoe` · tool · open-spots (keeps FEED_POSTS `p-plan` facts)

- Author: Calvin Karthik · 10h
- Text: "tahoe the weekend of feb 7. cabin sleeps 8, 2 spots left"
- Headline: "Calvin has 2 open spots". Byline: "Calvin made this · 5 used it"
- Reactions: 16 (👍 10, ❤️ 6) · 9 comments · 1 share
- Comments: Wes "asked. i can cook", Maya "i'm already in, it's me and aditya and the den", Calvin "requests close sunday"
- Tool `t-f-tahoe`, `lab:open-spots` (pack `feed-plan` moves `lab:open-spots` to the top):
  ```
  title: "Tahoe cabin", when: "Feb 7–9 · leaves Fri 4pm from the den",
  going: ["Calvin", "Arun", "Jules", "Omar", "Maya", "Aditya"], spots: 2,
  requests: [
    { name: "Wes Duarte", meta: "Foothill RA · moving to 2C", mutuals: ["Calvin", "Maya"], note: "I'll cook one night" },
    { name: "Kev Tran", meta: "Eastfield '27 · snowboards", mutuals: ["Arun"], note: "Can bring the speaker" },
    { name: "Rae Whitfield", meta: "Will's friend · visiting this week", mutuals: ["Will"], note: "If I'm back in town, yes" },
    { name: "Kofi Mensah", meta: "Grad student · has chains for the car", mutuals: ["Maya", "Arun", "Aditya"], note: "Can drive 3 and I have chains" },
    { name: "Hana Ito", meta: "Eastfield '28 · photo club", mutuals: ["Tsai Lin"], note: "I'll bring my film camera" } ]
  ```
- Already done: Calvin, Arun, Maya and Aditya are going (replayed), Jules and Omar baked in.
  Calvin accepted Maya's request yesterday. Five requests waiting.
- Viewer can: "Ask to join" with a note. Calvin decides.

### F30 · `p-beat` · tool · story-beat

- Author: Arun Vaithianathan · 16h
- Text: "the den made a beat out of our catchphrases. it's on my story"
- Headline: "Arun shared his story". Byline: "Made with Muse · for the den"
- Reactions: 27 (😆 21, ❤️ 6) · 5 comments · 0 shares
- Comments: Calvin "legend legend legend", Jules "gerald is on the off beat", Tsai Lin "this is going in the pregame"
- Tool `t-f-beat` (same room as story S5), `lab:story-beat`:
  ```
  rows: [ { who: "Calvin", shout: "Legend" }, { who: "Arun", shout: "Gym" }, { who: "Jules", shout: "Gerald" }, { who: "Omar", shout: "Boom" } ],
  grid: ["........", "...x...x", "..x...x.", "x...x.x."]
  ```
- Already done: Calvin, Arun, Jules and Omar each placed their row.
- Viewer can: play the loop, tap cells to add a hit, post it to Tsai Lin's story.

### F31 · `p-move` · tool · move-in-day (keeps id, new author)

- Author: Wes Duarte · 6h (replaces Aditya, who is not moving)
- Text: "moving into apt 2c sunday morning. pizza for anyone who carries a box"
- Headline: "Wes is moving Sunday". Byline: "Wes made this · 7 used it"
- Reactions: 12 (👍 9, ❤️ 3) · 5 comments · 0 shares
- Comments: Omar "on the couch. bring gloves", Hana "i'll take the mattress side", Wes "the tv needs someone careful. that's not kev"
- Tool `t-f-move`, `lab:move-in-day` (pack `feed-move` moves `lab:move-in-day` to the top):
  ```
  title: "Move-in day", sub: "Sun · Foothill to 2C, 1915 Hearst",
  stops: [ { time: "9:00", label: "Truck" }, { time: "9:30", label: "Load" }, { time: "10:40", label: "Drive" },
    { time: "11:15", label: "Unload" }, { time: "1:00", label: "Pizza" } ],
  stage: 1,
  items: [ { name: "Couch", need: 3, note: "Tilt it through the door", cuft: 110, kind: "couch", hands: ["Omar", "Kev"] },
    { name: "Mattress", need: 2, note: "Queen · very floppy", cuft: 60, kind: "mattress", hands: ["Hana"] },
    { name: "TV", need: 1, note: "The careful one", cuft: 30, kind: "tv", hands: [] } ],
  boxes: { label: "23 boxes", cuft: 160 }, truckCuft: 400, after: "Pizza at 1, on Wes"
  ```
- Already done: Omar and Kev on the couch, Hana on the mattress.
- Viewer can: take a spot on the couch, mattress or TV.

### F32 · `p-challenge` · text (keeps FEED_POSTS facts; slot with no lab tool, see E)

- Author: Maya Chen · 8h
- Text: "30 days of climbing in december. who's in"
- Reactions: 27 (👍 18, ❤️ 9) · 11 comments · 0 shares
- Comments: Tsai Lin "in. the wall is open till 10 for finals", Arun "in. gym then wall then sleep", Bea "logging it in a spreadsheet obviously"
- Offer under it: "Join the challenge" (pack `feed-challenge`, piece:streak today; public-challenge
  when its port passes).

### F33 · `p-faces` · tool · face-drop

- Author: Jules Moreau · 18h
- Text: "the den at 1am"
- Headline: "Jules shared a toy". Byline: "Made with Muse · for the den"
- Reactions: 35 (😆 31, ❤️ 4) · 7 comments · 0 shares
- Comments: Omar "why is my face on the bottom", Calvin "shake it", Will "i'm on there 4 times and i'm honored"
- Tool `t-f-faces`, `lab:face-drop`:
  ```
  names: ["Calvin", "Arun", "Jules", "Omar", "Maya", "Will", "Aditya", "Tsai Lin"]
  ```
- Already done: Calvin, Arun, Jules and Omar dropped 14 faces; Will's face is on the pile 4
  times (seed the drops as acts by the den members).
- Viewer can: drop faces, boop them, shake the pile.

### F34 · `p-ramen` · tool · reel-to-try

- Author: Maya Chen · 4h
- Text: "friday?? (after juniper, they're open till 1)"
- Shared reel: eastfield.bites · "the $13 tonkotsu on shattuck that ended me"
- Headline: "Maya added this to apt 4b's to try list". Byline: "Made with Muse · for apt 4b"
- Reactions: 20 (😮 8, ❤️ 7, 👍 5) · 6 comments · 0 shares
- Comments: Will "obsessed. adding", Aditya "5 stars for mr. bao still stands", Tsai Lin "after juniper is a yes"
- Tool `t-f-ramen`, `lab:reel-to-try` (486 px tall at rest: feed and reel page only):
  ```
  reel: { from: "Maya", note: "Friday??", account: "eastfield.bites", caption: "The $13 tonkotsu on Shattuck that ended me", likes: "48K", place: "Menya Kuro", area: "Shattuck" },
  spots: [
    { name: "Mr. Bao", area: "Shattuck", tried: "Oct 3", ratings: [{ by: "Will", stars: 5 }, { by: "Aditya", stars: 5 }], want: [] },
    { name: "Lupe's Tacos", area: "Telegraph", tried: "Sep 20", ratings: [{ by: "Maya", stars: 4 }, { by: "Will", stars: 5 }, { by: "Aditya", stars: 4 }], want: [] },
    { name: "Dumpling Alley", area: "Downtown", tried: "", ratings: [], want: ["Will", "Maya", "Aditya"] },
    { name: "Tea Hut", area: "Telegraph", tried: "Aug 30", ratings: [{ by: "Maya", stars: 3 }, { by: "Aditya", stars: 4 }, { by: "Will", stars: 3 }], want: [] } ]
  ```
- Already done: Maya added Menya Kuro, Will and Aditya rated and wanted.
- Viewer can: tap "Want" on Menya Kuro, star a place Tsai Lin has been.

### F35 · `p-tab` · tool · tab-claim

- Author: Bea Santos · 2d
- Text: "wall night dinner. i paid, claim your stuff before i forget who had the ribs"
- Headline: "Bea is collecting for Smoke & Barrel". Byline: "Made with Muse · for wall night"
- Reactions: 14 (😆 8, 👍 6) · 4 comments · 0 shares
- Comments: Arun "ribs and the pudding were me. no regrets", Hana "claimed", Bea "5 things left and 7 people"
- Tool `t-f-tab`, `lab:tab-claim`:
  ```
  place: "Smoke & Barrel", payer: "Bea", tipBps: 2200,
  items: [ { label: "Brisket plate", priceCents: 2400, claimedBy: "Kofi" }, { label: "Pulled pork sando", priceCents: 1600, claimedBy: "" },
    { label: "Half rack ribs", priceCents: 2800, claimedBy: "Arun" }, { label: "Wings (12)", priceCents: 1800, claimedBy: "Hana" },
    { label: "Mac & cheese", priceCents: 700, claimedBy: "" }, { label: "Burnt ends", priceCents: 1900, claimedBy: "Maya" },
    { label: "Chips & queso", priceCents: 900, claimedBy: "" }, { label: "Lemonade pitcher", priceCents: 1400, claimedBy: "" },
    { label: "Cornbread", priceCents: 500, claimedBy: "" }, { label: "Banana pudding", priceCents: 800, claimedBy: "Arun" },
    { label: "Sweet tea", priceCents: 300, claimedBy: "Hana" }, { label: "Coleslaw", priceCents: 400, claimedBy: "" } ]
  ```
- Already done: Kofi, Arun, Hana and Maya claimed. The pulled pork sando was Tsai Lin's.
- Viewer can: claim the sando and anything shared; totals update.

### F36 · `p-zoe-portraits` · group post

- Author: Zoe Achebe in Eastfield class of '27 · 1d
- Text: "senior portraits this week at the union, 10 to 4. bring a jacket, the light is cold"
- Reactions: 40 (👍 32, ❤️ 8) · 12 comments · 6 shares
- Comments: Will "booked for friday morning, pray for me", Calvin "is the gown provided", Zoe "gowns at the table, just show up"

### F37 · `p-potluck` · tool · potluck

- Author: Tess Yamamoto · 2d
- Text: "my family's thanksgiving has a muse table now. uncle t is still bringing a 'surprise'"
- Headline: "Tess's family made a potluck table". Byline: "Made with Muse · for the yamamotos"
- Reactions: 46 (😆 34, ❤️ 12) · 10 comments · 3 shares
- Comments: Maya "what was last year's surprise", Tess "lime jello. it had grapes in it", Tsai Lin "3 pies for 14 people is correct actually"
- Tool `t-f-potluck`, `lab:potluck` (example kept; Cousin Rae becomes Cousin Mei so Rae stays Will's friend):
  ```
  title: "Thanksgiving potluck", coming: 14, host: "Dad's turkey",
  plates: [ { need: "potatoes", who: "Grandma Jo", dish: "mashed potatoes" }, { need: "stuffing", who: "Mom", dish: "stuffing" },
    { need: "dessert", who: "Aunt Linda", dish: "pumpkin pie" }, { need: "veggies", who: "", dish: "" },
    { need: "dessert", who: "Cousin Mei", dish: "apple pie" }, { need: "mac", who: "Nate", dish: "mac & cheese" },
    { need: "dessert", who: "Aunt Bev", dish: "pecan pie" }, { need: "drinks", who: "", dish: "" },
    { need: "rolls", who: "", dish: "" }, { need: "", who: "Uncle T", dish: "a \"surprise\"" } ],
  defaults: { veggies: "green beans", drinks: "cider + sparkling water", rolls: "rolls", potatoes: "mashed potatoes", stuffing: "stuffing", mac: "mac & cheese" },
  tips: [ { who: "Uncle T", to: "rolls", why: "his \"surprise\" last year was lime jello" },
    { who: "Aunt Bev", to: "veggies", why: "3 pies for 14 people is a lot of pie" },
    { who: "Cousin Mei", to: "drinks", why: "she has the Costco card" } ]
  ```
- Already done: seven plates claimed by the family. Veggies, drinks and rolls open.
- Viewer can: read it and tap "Use for my group" (opens Friendsgiving's bring list, E2).

### F38 · `p-spinner` · tool · plan-spinner

- Author: Kev Tran · 1d
- Text: "we said idk 4 times so muse spun it. bowling, hot pot, karaoke. saturday is locked"
- Headline: "Kev's floor spun a Saturday plan". Byline: "Made with Muse · for the 4th floor"
- Reactions: 23 (😆 13, 👍 10) · 6 comments · 0 shares
- Comments: Ava "karaoke at rose's means kev is singing mr. brightside", Wes "home by 11, i have an rd meeting", Kev "i'm not even tired"
- Tool `t-f-spinner`, `lab:plan-spinner`:
  ```
  title: "Saturday plan", why: "\"idk anything\" ×4 · so Muse spins it", date: "Sat",
  tapes: [
    { name: "Activity", options: [ { label: "Mini golf", when: "4:00 PM", costCents: 1400, vetoedBy: "" },
      { label: "Sibley ridge hike", when: "3:00 PM", costCents: 0, vetoedBy: "Tess" }, { label: "Bowling", when: "4:00 PM", costCents: 1200, vetoedBy: "" },
      { label: "Escape room", when: "3:30 PM", costCents: 3800, vetoedBy: "Kev" }, { label: "Thrift crawl", when: "2:30 PM", costCents: 1000, vetoedBy: "" },
      { label: "Arcade bar", when: "4:30 PM", costCents: 1500, vetoedBy: "" } ] },
    { name: "Food", options: [ { label: "Lupe's Tacos", when: "6:30 PM", costCents: 900, vetoedBy: "" },
      { label: "Omakase", when: "6:00 PM", costCents: 8500, vetoedBy: "Kev" }, { label: "Hot pot", when: "6:30 PM", costCents: 2200, vetoedBy: "" },
      { label: "Gino's Pizza", when: "6:00 PM", costCents: 800, vetoedBy: "" }, { label: "Ramen Ya", when: "7:00 PM", costCents: 1600, vetoedBy: "" },
      { label: "Food trucks", when: "6:30 PM", costCents: 1200, vetoedBy: "" } ] },
    { name: "After", options: [ { label: "Karaoke at Rose's", when: "8:30 PM", costCents: 500, vetoedBy: "" },
      { label: "Club Volt", when: "11:30 PM", costCents: 2000, vetoedBy: "Wes" }, { label: "Movie at Ava's", when: "8:30 PM", costCents: 0, vetoedBy: "" },
      { label: "Dessert run", when: "8:00 PM", costCents: 600, vetoedBy: "" }, { label: "Beach bonfire", when: "8:00 PM", costCents: 300, vetoedBy: "" },
      { label: "Rooftop bar", when: "10:30 PM", costCents: 1800, vetoedBy: "Wes" } ] } ],
  rules: [ { text: "No hikes", who: "Tess's ankle" }, { text: "Under $25", who: "Kev" }, { text: "Home by 11", who: "Wes" } ],
  lockAt: 4
  ```
- Already done: spun to Bowling, Hot pot, Karaoke at Rose's; Kev, Ava, Wes and Tess said in, so
  it locked.
- Viewer can: see the locked plan, tap "Use for my group" (opens ask path C1's slot machine in
  senior week).

### F39 · `p-kofi` · photo

- Author: Kofi Mensah · 1d
- Text: "first frost on the ridge trail. 34 degrees and worth it"
- Photo brief: frost on dry grass beside a dirt trail at sunrise, low sun, landscape, crisp and quiet, no people
- Reactions: 33 (❤️ 25, 👍 8) · 4 comments · 0 shares
- Comments: Maya "the ridge hike is back on", Tsai Lin "saturday 9am, my story poll said so", Kofi "bring gloves"

### F40 · `p-veto` · tool · dinner-veto

- Author: Leo Brandt · 1d
- Text: "lab group dinner. 6 of us, 6 places, everyone kills one"
- Headline: "Leo's lab group made a dinner veto". Byline: "Made with Muse · for bio lab section 4"
- Reactions: 11 (😆 7, 👍 4) · 5 comments · 0 shares
- Comments: Dani "ramen ya on a tuesday AND a thursday is too much ramen", Sam "smoke & barrel is a hike in the rain", Leo "nico you're up, don't overthink it"
- Tool `t-f-veto`, `lab:dinner-veto`:
  ```
  title: "Dinner for 6", time: "7:30", leaveBy: "7:15",
  spots: [ { name: "Ramen Ya", kind: "ramen", price: "$$", miles: 0.3, stars: 4.6 },
    { name: "Lucia's Trattoria", kind: "pasta", price: "$$$", miles: 0.8, stars: 4.7 },
    { name: "El Primo truck", kind: "tacos", price: "$", miles: 0.5, stars: 4.5 },
    { name: "Golden Fold", kind: "dim sum", price: "$$", miles: 0.6, stars: 4.4 },
    { name: "Smoke & Barrel", kind: "bbq", price: "$$", miles: 1.2, stars: 4.5 },
    { name: "Thai Basil", kind: "thai", price: "$", miles: 0.4, stars: 4.3 } ],
  vetoes: [ { name: "Dani", spot: 0, why: "had it tues" }, { name: "Ava", spot: 1, why: "$$$ this week?" },
    { name: "Sam", spot: 4, why: "1.2 mi in the rain??" } ],
  passed: ["Kev"]
  ```
- Already done: Dani, Ava and Sam vetoed, Kev passed. Leo and Nico are left; three places stand.
- Viewer can: watch, tap "Use for my group" (makes one in the boys chat; it already has one, so
  it opens `t-veto`).

### F41 · `p-formal` · tool · date-swipe

- Author: Zoe Achebe · 2d
- Text: "class council can't pick a weekend for winter formal so muse is picking. say free or not"
- Headline: "The class council is picking a weekend". Byline: "Made with Muse · for class council"
- Reactions: 57 (👍 40, ❤️ 17) · 21 comments · 4 shares
- Comments: Tess "january is $200 cheaper for the venue, just saying", Nico "december 11 is finals week, who did this", Zoe "one more free on jan 22 and it locks"
- Tool `t-f-formal`, `lab:date-swipe`:
  ```
  place: "Winter formal", lockAt: 5,
  weekends: [ { label: "Dec 4–6", month: "Dec", day: 4, span: "Fri–Sun", why: "last weekend before finals", free: ["Zoe", "Tess"] },
    { label: "Dec 11–13", month: "Dec", day: 11, span: "Fri–Sun", why: "finals week tho", free: ["Ava"] },
    { label: "Jan 22–24", month: "Jan", day: 22, span: "Fri–Sun", why: "first weekend back · venue is $200 less", free: ["Zoe", "Tess", "Nico", "Kev"] },
    { label: "Feb 5–7", month: "Feb", day: 5, span: "Fri–Sun", why: "tahoe weekend for half of us", free: ["Nico"] } ]
  ```
- Already done: Zoe, Tess, Nico, Kev and Ava swiped. Jan 22-24 is one free away from locking.
- Viewer can: watch it lock when the cast's Ava swipes Jan 22-24 free (about 40 s after the post
  is on screen), or tap "Use for my group".

### Feed facts file

`muse/seed.ts` FEED_POSTS keeps its five ids and gains the facts each scenario reads:
`p-boba` items (the six places in F06), `p-bday` is retired (its job moves to F04 and the boys'
gift pool), `p-move` `by: "wes"` with items "Truck at 9", "Couch needs 3", "Mattress needs 2",
"TV needs someone careful", `p-challenge` unchanged, `p-plan` unchanged (now shown as F29).

---

## B. The other surfaces

### B1. Stories tray (8 stories, 3 with tools)

File: `apps/shell/src/surfaces/data.ts` STORIES (order as listed). Story tools live in
`services/demo/seed-catalysts.ts`, one room per story (`surface:page:story:<id>`).

| # | id | By | Caption | Picture | Tool | Seen by / reply |
|---|---|---|---|---|---|---|
| S1 | `s-me` | Tsai Lin | (none) | drawn tone 2, "Trail sign at Sibley ridge" | Story poll MY_POLL "beach or hike sat?", ended, hike 9 to 5 (piece; no lab tool yet, see E) | Seen by 23 · Maya replied "hike but i'm bringing snacks" |
| S2 | `s-maya` | Maya | "library szn" | drawn tone 3, "Desk lamp over a stack of books" | none | Seen by 31 · Will replied "3rd floor or nothing" |
| S3 | `s-dev` | Aditya | "up at 6 for no reason" | drawn tone 1, "Sunrise over Dwight Way" | none | Seen by 18 · Calvin replied "gym?" |
| S4 | `s-trip` | Aditya | "1 year ago today: big sur" | drawn tone 2, "Bixby Bridge from the road" | **trip-story** `t-cat-story-trip`, params as F20 | Seen by 27 · Maya and Will tapped "I'm in" on the last card |
| S5 | `s-theo` | Arun | "the den has a theme song now" (replaces "halal cart at 1am hits different") | drawn tone 2, "Four faces on a beat grid" | **story-beat** `t-f-beat`, params as F30 | Seen by 40 · Calvin replied "legend" |
| S6 | `s-priya` | Will | "fall '26 so far" (replaces "roof again") | drawn tone 3, "Six cards fanned out" | **semester-wrapped** `t-f-wrapped`, params as F14 | Seen by 52 · Maya, Aditya, Calvin and Arun ripped their packs |
| S7 | `s-jonah` | Calvin | "roof is ready for tonight" (replaces "walking home the long way") | drawn tone 2, "String lights on a rooftop" | none | Seen by 35 · Will replied "CALVIN" |
| S8 | `s-nico` | Nico | "7th juniper hale show tomorrow. rail or nothing" | drawn tone 3, "Ticket stub for Juniper Hale" | none; the reply bar's "Ask Muse" offers "Go together" for E1 | Seen by 64 |

### B2. Reels (8 reels, 4 with tools or offers)

File: `apps/shell/src/surfaces/data.ts` REELS; facts in `muse/seed.ts` REEL_FACTS. Every frame is
drawn (no reel photos are in the manifest).

| # | id | By (handle) | Caption | Likes · comments · shares | Tool or offer |
|---|---|---|---|---|---|
| R1 | `r-dumplings` | Cami (cami.eats) | "3 dumpling spots worth the line. the last one is cash only" | 18,400 · 412 · 2,100 | **reel-to-try**: "Will and Tsai Lin's to try list" (Will DM `t-sx-try`, B8). Under the reel: "Will added this to your to try list" |
| R2 | `r-hike` | Kofi (kofi.outside) | "sunset hike under an hour from campus" | 6,200 · 88 · 540 | Offer "Make it a plan" (pack `reel-hike`, piece:overlap; no lab tool yet, see E) |
| R3 | `r-tacos` | Sam (samtries) | "every taco truck on telegraph, pt 2" | 9,100 · 230 · 870 | none |
| R4 | `r-noodles` | Ines (ines.cooks) | "15 minute chili crisp noodles. 6 things, one pan" | 12,800 · 301 · 1,500 | **reel-cook-night**: Dani's cook night (F13 room) shows under it as "Dani is making this · 4 claimed". Ask path C10 makes one for Apt 4B |
| R5 | `r-juniper` (new) | Nico (nico.hears) | "juniper hale played northbound in the alley after the riverside show" | 31,200 · 980 · 4,100 | Offer "Go together" for Juniper Hale live (opens C2's squad lock on E1). REEL_FACTS gains `{ kind: "event", eventId: "juniper" }` |
| R6 | `r-crag` (new) | Bea (bea.climbs) | "first outdoor v4 at castle rock. 2 years of trying" | 4,800 · 96 · 120 | none |
| R7 | `r-couch` (new) | Ruth (ruth.makes) | "reupholstered a $40 couch in green velvet. 3 weekends" | 22,100 · 640 · 2,900 | none |
| R8 | `r-ramen` (new) | eastfield.bites (owner Sam) | "the $13 tonkotsu on shattuck that ended me" | 48,000 · 1,200 · 6,300 | **reel-to-try**: Apt 4B's list, F34 room. Under it: "Maya added this to apt 4b's to try list" |

### B3. Groups (3, each with a pinned tool and two tool posts)

File: `apps/shell/src/surfaces/data.ts` GROUPS; facts `muse/seed.ts` GROUP_FACTS; backing chats
`surfaces/backing.ts`; tools `services/demo/seed-catalysts.ts`.

#### G-A · Eastfield climbing club (`climb`) · Private group · 312 members

Admins Ines and Tsai Lin. Faces: Ines, Maya, Will, Arun.

Pinned: **signup-board** `t-s-shifts` (keeps id), pinned by Ines:
```
title: "Gear room + crag day", group: "Eastfield climbing club", date: "This week", meet: "Rec center wall",
shifts: ["Mon 6–8pm", "Wed 6–8pm", "Sat 10–12"],
roles: [ { label: "Pad haul", icon: "cart", cap: 4, others: [["Kofi"], ["Bea", "Cami"], ["Hana"]] },
  { label: "Check-in", icon: "clipboard", cap: 2, others: [["Ines"], ["Bea"], ["Kofi"]] },
  { label: "Water", icon: "water", cap: 2, others: [["Cami"], ["Zoe"], ["Omar"]] },
  { label: "Wall to van", icon: "elevator", cap: 3, others: [["Leo", "Dani"], ["Kev"], ["Sam", "Wes", "Tess"]] } ],
people: [ { name: "Maya", role: "Pad haul", shift: "Mon 6–8pm" }, { name: "Arun", role: "Pad haul", shift: "Mon 6–8pm" },
  { name: "Will", role: "Check-in", shift: "Mon 6–8pm" } ]
```
Already done: Maya, Arun and Will signed up. Tsai Lin can claim any open slot.

Tool post 1: **meeting-time** `t-s-meet` (keeps id), Ines · 6h · "when works for weekly meetings next semester? tap what works" · 12 reactions · 14 comments (madeFrom "14 replies"):
```
group: "Eastfield climbing club", members: 52, place: "The wall, back room", starts: "Jan 19",
days: ["Mon", "Tue", "Wed", "Thu"], times: ["7pm", "9pm"], counts: [[9, 14, 8, 11], [5, 7, 6, 9]],
people: [ { name: "Maya", free: ["Tue 7pm", "Thu 7pm"] }, { name: "Arun", free: ["Tue 7pm", "Wed 7pm"] }, { name: "Will", free: ["Thu 7pm"] } ]
```
Comments: Bea "tue 7 or i riot", Kofi "thursdays i have lab till 8", Ines "lock it sunday night". Already done: Maya, Arun, Will tapped. Tue 7pm leads with 14.

Tool post 2: **club-dues** `t-g-dues`, Bea · 1d · "fall dues are $20. 31 of 52 paid. the van to castle rock depends on you" · 18 reactions · 6 comments:
```
club: "Eastfield climbing club", term: "fall '26", duesCents: 2000, due: "Nov 20", members: 52, paidOutside: 28,
names: ["Ines", "Bea", "Kofi", "Cami", "Hana", "Leo", "Dani", "Kev", "Sam", "Zoe", "Omar", "Wes", "Tess", "Nico", "Ava", "Jules", "Lena", "Ruth"],
goals: [ { label: "Chalk + tape for the gear room", amountCents: 30000 }, { label: "Castle Rock van", amountCents: 45000 },
  { label: "New crash pad", amountCents: 29000 } ],
paid: ["Maya", "Arun", "Will"]
```
Comments: Kofi "paid, does that get me a harness sunday", Bea "it gets you a harness AND my respect", Tsai Lin "paying tonight". Already done: Maya, Arun, Will paid (31 total). Tsai Lin can pay. GROUP_FACTS `dues` becomes `{ label: "Fall dues", cents: 2000, paid: 31, of: 52 }`.

Plain posts: `c2` Arun "lost a chalk bag at the wall on tuesday. blue, has a carabiner on it" (keeps id), `c3` Maya "ridge hike after the wall was so fun. same time next week?" (keeps id; photo becomes drawn tone 3 "Trail at sunset"), `c4` Zoe shares event E4.

#### G-B · Eastfield sublets and housing (`sublets`) · Private group · 4,212 members

Admin Lena. Faces: Lena, Sam, Maya, Kofi.

Pinned: **sublet-finder** `t-cat-group-sublet-finder` pinned by Lena, "7 places · save or skip":
```
group: "Eastfield sublets and housing", posts: 1083, swiped: 38, budgets: [80000, 100000, 130000],
listings: [
  { hood: "Dwight Way", city: "2br", priceCents: 95000, dates: "Jun 1 – Aug 31", perk: "furnished · loft bed stays", via: "Maya's climbing friend", viaWho: "Maya", mutuals: 3, view: 2, x: 0.62, y: 0.4 },
  { hood: "Channing Way", city: "1br", priceCents: 110000, dates: "May 20 – Aug 15", perk: "string lights included", via: "", viaWho: "", mutuals: 0, view: 3, x: 0.55, y: 0.48 },
  { hood: "Near campus", city: "4br house", priceCents: 78000, dates: "Jun 1 – Jul 31", perk: "June and July only · big yard", via: "selling Apt 4B a couch", viaWho: "Aditya", mutuals: 1, view: 1, x: 0.48, y: 0.3 },
  { hood: "Telegraph", city: "studio", priceCents: 125000, dates: "Jun 1 – Aug 31", perk: "utilities included", via: "", viaWho: "", mutuals: 0, view: 2, x: 0.7, y: 0.55 },
  { hood: "Hearst Ave", city: "3br", priceCents: 89000, dates: "Jun 1 – Aug 31", perk: "lease takeover · 5 min to the wall", via: "Will's TA", viaWho: "Will", mutuals: 2, view: 3, x: 0.4, y: 0.18 },
  { hood: "College Ave", city: "shared room", priceCents: 60000, dates: "Jun 1 – Aug 31", perk: "cheapest in town · girls only", via: "Tsai Lin's club", viaWho: "Tsai Lin", mutuals: 4, view: 4, x: 0.75, y: 0.7 },
  { hood: "Derby St", city: "1br", priceCents: 105000, dates: "Jun 1 – Aug 31", perk: "parking spot", via: "Arun's lab", viaWho: "Arun", mutuals: 2, view: 0, x: 0.58, y: 0.82 } ],
people: [ { name: "Maya", saved: ["Dwight Way", "Hearst Ave"], passed: [] },
  { name: "Will", saved: ["Dwight Way", "College Ave"], passed: ["Telegraph"] },
  { name: "Aditya", saved: [], passed: ["Channing Way"] } ]
```
(`city` carries the size because Eastfield is one town.) Already done: Maya, Will and Aditya
swiped. Tsai Lin can swipe, filter by budget, share the shortlist to a chat.

Tool post 1: **roommate-match** `t-g-roommates`, Tess · 1d · "8 roommate posts this week so muse made a quiz. 6 questions, ranks who you'd actually live with" · 21 reactions · 9 comments:
```
group: "Eastfield sublets and housing", took: 86,
listings: [ { name: "Sam", hood: "Hearst", note: "need 1 more for a 3br, $890", answers: [1, 1, 1, 2, 2, 2] },
  { name: "Kofi", hood: "Near campus", note: "grad student, quiet, from aug", answers: [0, 0, 0, 2, 1, 1] },
  { name: "Dani", hood: "Southside", note: "cooks for the whole floor", answers: [2, 2, 2, 1, 1, 0] },
  { name: "Cami", hood: "Northside", note: "has a cat named Tofu", answers: [1, 0, 1, 1, 0, 1] },
  { name: "Tess", hood: "College Ave", note: "early sleeper, very quiet", answers: [2, 1, 0, 0, 1, 2] },
  { name: "Leo", hood: "Derby", note: "up at 6, hot sauce shelf", answers: [0, 1, 1, 0, 0, 0] },
  { name: "Wes", hood: "Hearst", note: "RA, very tidy", answers: [1, 0, 1, 1, 1, 1] } ],
people: [ { name: "Maya", picks: [1, 0, 1, 1, 1, 1], hi: ["Wes"] }, { name: "Aditya", picks: [2, 1, 2] } ]
```
Comments: Wes "maya we're a 94", Maya "for after graduation. my lease is up in june", Sam "still need 1 for hearst". Already done: Maya finished (top match Wes), Aditya is 3 of 6 in. Tsai Lin can take it.
GROUP_FACTS sublets `roommates` replaces with `[{ by: "tess", ... }, { by: "sam", ... }, { by: "kofi", ... }]`, text unchanged.

Tool post 2: **move-out-sale** share, Ines · 12h · "friends first until tomorrow 9am. housing people count as friends" · same room as F16.

Plain posts: SUBLETS `g1` to `g7` unchanged (`g6` by `ines` stays; she posted it before deciding to move).

#### G-C · Eastfield class of '27 (`class27`, new) · Private group · 5,800 members

Admin Zoe. Faces: Zoe, Will, Calvin, Tess. Cover drawn tone 1 "Bell tower and the quad".

Pinned: **member-galaxy** `t-g-galaxy` pinned by Zoe:
```
title: "Class galaxy", group: "Eastfield class of '27", members: 5800,
lenses: [
  { label: "By first-year dorm", noun: "dorm", groups: [
    { label: "Unit 1", count: 1200, suggest: [{ name: "Zoe", mutual: 4 }, { name: "Ava", mutual: 3 }, { name: "Kev", mutual: 2 }] },
    { label: "Unit 2", count: 1850, suggest: [{ name: "Tess", mutual: 6 }, { name: "Nico", mutual: 3 }, { name: "Omar", mutual: 2 }] },
    { label: "Clark Kerr", count: 920, suggest: [{ name: "Hana", mutual: 5 }, { name: "Bea", mutual: 2 }, { name: "Leo", mutual: 2 }] },
    { label: "Foothill", count: 880, suggest: [{ name: "Wes", mutual: 4 }, { name: "Dani", mutual: 3 }, { name: "Jules", mutual: 1 }] },
    { label: "Transfer", count: 950, suggest: [{ name: "Cami", mutual: 3 }, { name: "Sam", mutual: 3 }, { name: "Ruth", mutual: 2 }] } ] },
  { label: "By major", noun: "major", groups: [
    { label: "CS", count: 1740, suggest: [{ name: "Ava", mutual: 5 }, { name: "Omar", mutual: 3 }, { name: "Kev", mutual: 2 }] },
    { label: "Bio", count: 1040, suggest: [{ name: "Bea", mutual: 4 }, { name: "Hana", mutual: 2 }, { name: "Leo", mutual: 1 }] },
    { label: "Econ", count: 930, suggest: [{ name: "Tess", mutual: 3 }, { name: "Zoe", mutual: 3 }, { name: "Sam", mutual: 2 }] },
    { label: "Engineering", count: 1160, suggest: [{ name: "Jules", mutual: 6 }, { name: "Wes", mutual: 2 }, { name: "Nico", mutual: 2 }] },
    { label: "Undeclared", count: 930, suggest: [{ name: "Dani", mutual: 2 }, { name: "Cami", mutual: 2 }, { name: "Ruth", mutual: 1 }] } ] } ],
people: [ { name: "Maya", at: ["Unit 2", "CS"] }, { name: "Arun", at: ["Unit 2", "Engineering"] }, { name: "Tsai Lin", at: ["Clark Kerr", "Econ"] },
  { name: "Will", at: ["Unit 1", "CS"] }, { name: "Calvin", at: ["Foothill", "Engineering"] }, { name: "Aditya", at: ["Foothill", "CS"] } ]
```
Already done: the six friends are placed. Tsai Lin can switch lenses and tap a suggested face to add.

Tool post 1: **best-of** `t-g-bestof`, Tess · 2h · "someone asked for a dentist again so here's the answer. pinned" · 88 reactions · 30 comments:
```
group: "Eastfield class of '27", members: 5800, question: "Best dentist near campus", posts: 40, replies: 212, helped: 86,
asks: [ { who: "Kev", text: "best dentist near campus?", ago: "2h" }, { who: "Ava", text: "dentist recs?? tooth emergency", ago: "3d" },
  { who: "Wes", text: "anyone know a dentist that takes the student plan", ago: "1w" } ],
picks: [
  { name: "Dwight Smiles", detail: "Dwight Way · takes the student plan", mentions: 56, rating: 4.8, quotes: [{ who: "Will", text: "Dr. Lin numbed me like a pro, zero pain" }, { who: "Kev", text: "walked in w/ a cracked tooth, out in 40 min" }] },
  { name: "Student Health Dental", detail: "on campus · free cleanings", mentions: 50, rating: 4.3, quotes: [{ who: "Ava", text: "free cleaning w/ the student plan, book 2 wks out" }, { who: "Arun", text: "slow but it's literally free" }] },
  { name: "Campus Row Family Dental", detail: "Downtown · Sat hours", mentions: 33, rating: 4.6, quotes: [{ who: "Maya", text: "only place open saturdays" }, { who: "Aditya", text: "they gave me a toothbrush and a sticker" }] },
  { name: "College Ave Dental", detail: "College Ave · pricey", mentions: 19, rating: 4.9, quotes: [{ who: "Tess", text: "fancy, $$$, but the TVs on the ceiling" }, { who: "Nico", text: "my parents' insurance only lol" }] } ],
plus: [{ name: "Will", pick: "Dwight Smiles" }, { name: "Maya", pick: "Dwight Smiles" }, { name: "Arun", pick: "Student Health Dental" }]
```
Already done: Will, Maya and Arun gave +1s. Tsai Lin can +1 a pick.

Tool post 2: **flyer-wall** `t-g-flyers`, Aditya · 5h · "made a flyer for the old couch. it has one bad spring and a lot of love left" · 19 reactions · 7 comments:
```
group: "Eastfield class of '27", size: "5.8K",
heads: [ { head: "FREE COUCH", sub: "comfy, one bad spring. Dwight & College, curb by 6pm Sat" },
  { head: "LOST AIRPODS", sub: "blue case, frog sticker. Main stacks 3rd floor, Tues" },
  { head: "STUDY GROUP", sub: "Econ 140 final grind. Thurs 7pm, Union 2nd floor" },
  { head: "PICKUP SOCCER", sub: "Sundays 10am on the quad. all levels, bring water" } ],
board: [ { head: "BIKE 4 SALE", paper: 5, by: "Marco" }, { head: "LOST CHALK BAG", paper: 6, by: "Arun" }, { head: "ROOM ON HEARST", paper: 7, by: "Sam" } ],
week: { flyers: 38, tabs: 212 }
```
Already done: Aditya pinned FREE COUCH; Kev and Wes tore tabs on it; Arun's chalk bag flyer has 4 tabs torn. Tsai Lin can make a flyer or tear a tab.

Plain posts: F36 (portraits), Zoe "grad fair is dec 3 in the union. caps and gowns, $40 for the set", Calvin "anyone have a ride to the airport sunday at 5am. will pay in breakfast burritos".

### B4. Marketplace (12 listings, 4 with a tool on the listing page)

File: `apps/shell/src/surfaces/data.ts` LISTINGS; sizes and comps `muse/seed.ts` LISTING_FACTS;
page tools `services/demo/seed-catalysts.ts` (room `surface:page:listing:<id>`).

| # | id | Title | Price | Seller | Where · ago | Condition | Description | Photo |
|---|---|---|---|---|---|---|---|---|
| M1 | `l-sectional` | Grey sectional couch | $180 | Marco | Eastfield · 2 days ago | Used - good | "moving to portland, has to go by sunday. no stains, one cushion is a little flat. you pick up" | `listing-couch` |
| M2 | `l-loveseat` | Green velvet loveseat | $120 | Ruth | Eastfield · 5 hours ago | Used - like new | "fits 2, super comfy. got it last year, cat free home. 58 in wide" | drawn tone 3 |
| M3 | `l-futon` | Futon, folds flat | $60 | Kofi | North Eastfield · 1 week ago | Used - fair | "works fine, frame is solid. mattress is thin" | drawn tone 2 |
| M4 | `l-fridge` | Mini fridge | $45 | Sam | Eastfield · 3 days ago | Used - good | "3.1 cu ft, freezer box works. dorm size" | `listing-mini-fridge` |
| M5 | `l-desk` | Standing desk | $150 | Ines | Eastfield · 1 day ago | Used - like new | "electric, goes up and down, 48 in wide. $90 for friends in my move-out sale till tomorrow 9am" | `listing-desk` |
| M6 | `l-bike` | Road bike, 54cm | $220 | Marco | South Eastfield · 4 days ago | Used - good | "new tires in march. lock included" | `listing-bike` |
| M7 | `l-lamp` | Floor lamp | $15 | Cami | Eastfield · 6 hours ago | Used - good | "warm light, tall. bulb included" | `listing-lamp` |
| M8 | `l-books` | Intro econ textbooks | $30 | Lena | Eastfield · 2 weeks ago | Used - good | "4 books, some highlighting. the course still uses them" | drawn tone 1 |
| M9 | `l-projector` (new) | Projector and 100 in screen | $240 | Sam | Eastfield · 1 day ago | Used - like new | "1080p, screen pulls down from a stand. selling because my wall is too small" | drawn tone 1 |
| M10 | `l-harness` (new) | Climbing harness, size M | $35 | Bea | Eastfield · 3 days ago | Used - good | "2 seasons, no falls on it worth mentioning. club inspected" | drawn tone 2 |
| M11 | `l-bookshelf` (new) | Bookshelf | $25 | Tsai Lin | Eastfield · 1 day ago | Used - good | "5 shelves, white, a little wobbly if you lean on it" | drawn tone 1 · "Your listing" |
| M12 | `l-mirror` (new) | Full length mirror | $15 | Tsai Lin | Eastfield · 1 day ago | Used - good | "no cracks. comes with a hook" | drawn tone 3 · "Your listing" |

LISTING_FACTS adds `l-projector: { w: 40, d: 12, comps: [150, 180, 210, 260], pickup: "pickup this weekend" }`,
`l-harness: { w: 12, d: 10, comps: [25, 30, 40, 55], pickup: "at the wall tue or thu" }`.

Page tools:

**M1 · `l-sectional` · price-check** `t-cat-mp-price-check` (keeps id), made by Will, "Will asked · rate it":
```
item: "Grey sectional couch", listed: "listed 2 days ago", seller: "Marco", askCents: 18000,
comps: [ { label: "Sectional, worn", cents: 9500 }, { label: "Sectional '21", cents: 15000 }, { label: "Grey sectional", cents: 16000 }, { label: "Sectional + ottoman", cents: 21000 } ],
fairLowCents: 15000, fairHighCents: 19000,
pins: [ { name: "Will", cents: 15000 }, { name: "Aditya", cents: 16000 }, { name: "Maya", cents: 16500 } ],
quote: "Aditya: “offer 150, one cushion is flat”", pickup: "by Sunday"
```
Already done: Will, Aditya and Maya pinned guesses. Tsai Lin can pin and settle the offer.
The page also shows the couch hunt **group-buy** (F25 room) under it: "Apt 4B is voting · 3 voted".

**M2 · `l-loveseat` · room-fit** `t-cat-mp-room-fit-l-loveseat`, made by Aditya, "Aditya is placing it". One grid
cell is 9 in; the room is Apt 4B's living room (long wall 104 in ≈ 12 cells):
```
room: "Apt 4B living room", cols: 12, rows: 7,
fixed: [ { label: "Kitchen counter", kind: "counter", x: 0, y: 0, w: 4, h: 1 }, { label: "Closet", kind: "closet", x: 10, y: 0, w: 2, h: 1 } ],
finds: [ { name: "Grey sectional", priceCents: 18000, w: 10, h: 4, by: "Maya", at: null },
  { name: "Green loveseat", priceCents: 12000, w: 6, h: 4, by: "Aditya", at: [0, 3] },
  { name: "Futon", priceCents: 6000, w: 9, h: 4, by: "Will", at: null },
  { name: "Floor lamp", priceCents: 1500, w: 1, h: 1, by: "Maya", at: [11, 6] },
  { name: "Rug", priceCents: 3000, w: 4, h: 3, by: "Maya", at: [7, 3] } ]
```
Already done: Aditya placed the loveseat on the long wall, Maya placed the lamp and the rug.
Tsai Lin can drag the sectional in; it only fits on the long wall once the loveseat comes out.

**M5 · `l-desk` · move-out-sale**: F16's room. Replaces the seeded "Maya asked · rate it" price
check on the desk (drop that entry from `seed-catalysts.ts`).

**M9 · `l-projector` · split-purchase** `t-cat-mp-split-l-projector`, made by Maya, "3 of 4 signed":
```
title: "Co-own the projector", item: "Projector + 100 in screen", priceCents: 24000, seller: "from Sam · 1.4 mi",
owners: ["Maya", "Calvin", "Tsai Lin", "Arun"],
weeks: ["Nov 16", "23", "30", "Dec 7", "14", "21", "28", "Jan 4"], holders: [0, 0, 1, 1, 2, 3, 1, 0],
pickup: "Sat 2pm · Calvin drives", note: "Maya's first · hands off Sundays"
```
Already done: Maya, Calvin and Arun signed. $60 each. Tsai Lin can sign, swap a week.

### B5. Events (4, each with a tool on the page)

File: `apps/shell/src/store/fake-data.ts` (`seedEvents`), facts `muse/seed.ts` EVENT_FACTS, page
tools `services/demo/seed-catalysts.ts` (room `surface:page:event:<id>`).

**E1 · `juniper` · Juniper Hale live** (unchanged facts): Fri 8:00 PM, Meridian Hall, 40 Campus Row,
1,403 interested, 84 going, friends Maya, Arun, Will. Page tools:
- **event-carpool** `t-cat-event-carpool`, Maya, params as F09.
- **pregame-vote** `t-cat-event-pregame`, Will, "Will asked · vote":
  ```
  title: "Dinner before Juniper", sub: "Doors 7:00 · 6 going", venue: "Meridian Hall", doorsMin: 1140,
  spots: [ { name: "Lupe's Tacos", walk: 4, x: 0.205, y: 0.63, voters: ["Maya", "Arun"] },
    { name: "The Copper Room", walk: 6, x: 0.437, y: 0.37, voters: ["Calvin", "Aditya"] },
    { name: "Campus Row Cafe", walk: 2, x: 0.658, y: 0.75, voters: ["Will"] } ],
  times: [ { label: "6:00 PM", voters: ["Calvin"] }, { label: "6:30 PM", voters: ["Maya", "Will"] }, { label: "7:00 PM", voters: ["Arun", "Aditya"] } ],
  streets: [ { name: "Campus Row", x: 0.32, y: 0.8 }, { name: "Dwight", x: 0.76, y: 0.95 } ]
  ```
  Already done: five friends voted. Lupe's and The Copper Room tie at 2. Tsai Lin's vote breaks it.
- Live (not seeded): squad-lock (C2), ticket-split (C3, C4), "Use for Friday" setlist bingo (F26).

**E2 · `potluck` · Friendsgiving potluck**: Sat 6:00 PM, Apt 4B, 1820 Dwight Way, host Tsai Lin,
14 interested, 11 going (replaces 9 and 6), friends Maya, Aditya, Calvin, Will, Arun. Page tool:
- **bring-list** `t-cat-event-bring`, Tsai Lin (the host), "5 of 8 covered":
  ```
  title: "Friendsgiving potluck", sub: "Sat 6 PM · Apt 4B · 11 coming",
  items: [ { label: "Turkey", kind: "turkey", by: ["Maya"] }, { label: "Mac & cheese", kind: "mac", by: ["Tsai Lin"] },
    { label: "Chips", kind: "chips", by: ["Calvin", "Arun"] }, { label: "Drinks", kind: "drinks", by: ["Hana"] },
    { label: "Pumpkin pie", kind: "pie", by: ["Will"] }, { label: "Green beans", kind: "salad", by: [] },
    { label: "Rolls", kind: "other", by: [] }, { label: "Cups & plates", kind: "cups", by: [] } ]
  ```
  Already done: Maya, Tsai Lin, Calvin, Arun and Will claimed (Calvin and Arun both took chips, so it
  is flagged). Aditya has not. Green beans, rolls and cups glow.
- Live: open-spots offer (C9).

**E3 · `will21` (new) · Will's 21st**: Tonight 9:00 PM, The den, 2214 Ellis St, host Calvin
Karthik, 17 interested, 24 going, friends Maya, Aditya, Arun, Will. Description: "Will turns 21
at midnight. Countdown on the roof. Bring a sweater, it's cold up there." Page tool:
**host-board** `t-f-21st`, params as F04.

**E4 · `crag` (new) · Castle Rock crag day**: Sun 8:00 AM, Castle Rock, "Meet at the Union steps,
Eastfield", host Eastfield climbing club, 31 interested, 14 going, friends Maya, Arun, Will.
Description: "Top rope day for all levels. The club has 12 harnesses and the van seats 12. Back by 5."
Page tool: **open-spots** `t-cat-event-crag`, Ines:
```
title: "Castle Rock crag day", when: "Sun 8:00 · Union steps",
going: ["Ines", "Maya", "Arun", "Will", "Bea"], spots: 3,
requests: [
  { name: "Lena Ortiz", meta: "Eastfield '27 · climbs at the rec wall", mutuals: ["Maya", "Tsai Lin"], note: "Can bring headlamps for the walk out" },
  { name: "Omar Haddad", meta: "Arun's roommate · runs at 6am", mutuals: ["Arun"], note: "Been wanting to try outdoor forever" },
  { name: "Cami Reyes", meta: "New to the club · transfer", mutuals: [], note: "Are rental shoes ok for first timers?" },
  { name: "Kofi Mensah", meta: "Grad student · has a car with 3 seats", mutuals: ["Maya", "Arun", "Aditya"], note: "Can drive 3 from campus" },
  { name: "Hana Ito", meta: "Eastfield '28 · photo club", mutuals: ["Tsai Lin"], note: "I'll bring my film camera" } ]
```
Already done: Ines accepted Bea yesterday. Five requests waiting. Tsai Lin is an admin and can
accept or decline; three spots fill.

### B6. Gaming (8 tiles, each made by a friends' group)

File: `apps/shell/src/surfaces/data.ts` GAMES (replaces gm-food, gm-dining, gm-movie). Tile art is
drawn. Each tile opens its tool's room.

| # | id | Title | Tool | Group (line under the title) | Line | Players shown | Room |
|---|---|---|---|---|---|---|---|
| G1 | `gm-chatdle` | Chatdle #213 | daily-puzzle | apt 4b | "Aditya in 3 · Will in 5" | dev, priya | F17 |
| G2 | `gm-trivia` | How well do you know senior week? | friend-trivia-pub | senior week | "Aditya leads with 850" | dev, theo, priya, jonah | F24 |
| G3 | `gm-trivianight` | Trivia night | trivia-night | senior week | "Aux Cords 1, Late Again 1 · question 3" | maya, me, dev, jonah, priya, theo | new |
| G4 | `gm-twotruths` | Two truths and a lie | two-truths | senior week | "2 rounds · Calvin spotted Maya's lie" | jonah, theo, priya, dev | new |
| G5 | `gm-captions` | Caption this | caption-contest | senior week | "5 of 6 voted on photo 1" | maya, priya, dev | senior week `t-captions` |
| G6 | `gm-dining` | Dining hall tier list | tier-list | Arun's friends | "Crossroads is S for 3 of 4" | theo, dev, jonah, priya | new |
| G7 | `gm-lobby` | Who's on tonight | lobby | late night | "Best overlap 7 to 8:30" | jonah, theo, dev | late night `t-lobby` |
| G8 | `gm-movie` | Saturday movie bracket | movie-bracket | Maya and you | "Maya picked Paddington 2" | maya | Maya DM `t-movie` |

New tile params (`services/demo/seed-catalysts.ts`, room `surface:page:gaming:<id>`, members all six):

**G3 trivia-night**:
```
teams: [ { name: "Aux Cords", people: ["Maya", "Tsai Lin", "Aditya"] }, { name: "Late Again", people: ["Calvin", "Will", "Arun"] } ],
questions: [
  { about: "Aditya", q: "How many times has Aditya said “last one, I swear” at the wall this month?", opts: ["3", "7", "12", "19"], answer: 2, note: "12 times. There were 14 last ones." },
  { about: "Calvin", q: "Who has a 4.98 Uber rating?", opts: ["Maya", "Calvin", "Arun", "Tsai Lin"], answer: 1, note: "He says thank you twice and tips in cash." },
  { about: "Arun", q: "What did Arun name his car?", opts: ["Big Sauce", "The Tank", "Shirley", "Lightning"], answer: 2, note: "Shirley: 212k miles and a cassette deck." },
  { about: "the chat", q: "Most-sent reaction in senior week?", opts: ["Skull", "Crying laughing", "The goat", "Thumbs up"], answer: 0, note: "4,812 skulls since 2023." },
  { about: "Maya", q: "Who left the chat in 2024 and rejoined 9 minutes later?", opts: ["Aditya", "Will", "Maya", "Tsai Lin"], answer: 2, note: "She said it was an accident. It was not." } ],
stake: "the wings", where: "Sunday at Lupe's"
```
Already done: Q1 buzzed by Maya (right, Aux Cords 1), Q2 buzzed by Will (right, Late Again 1).
Q3 is up. Tsai Lin can buzz.

**G4 two-truths** (two rounds; ask path C14 adds the third):
```
chat: "senior week",
rounds: [
  { about: "Maya", lie: 1, facts: [
      { claim: "Fell asleep at a Juniper Hale show. Front row.", receipt: "Will, Jun 14: “she was asleep during Northbound”" },
      { claim: "Ran a half marathon last spring", receipt: "Maya, Apr 9: “my knees hurt from walking to the bus”" },
      { claim: "Hasn't paid for a streaming account since 2023", receipt: "Aditya, Jan 2: “maya log out of my account”" } ],
    guesses: [ { name: "Calvin", fact: 1 }, { name: "Will", fact: 0 }, { name: "Arun", fact: 1 } ] },
  { about: "Will", lie: 2, facts: [
      { claim: "Locked himself out of his car 3 times in one week", receipt: "Will, Sep 12: “ok who has a coat hanger. again.”" },
      { claim: "Cried during the Ratatouille rewatch", receipt: "Tsai Lin: “will u good?” Will: “onions”" },
      { claim: "Is lactose intolerant", receipt: "Will, every Friday: “large pie, extra cheese”" } ],
    guesses: [ { name: "Arun", fact: 1 }, { name: "Aditya", fact: 2 }, { name: "Calvin", fact: 2 } ] } ]
```
Already done: Calvin, Will and Arun guessed round 1; Arun, Aditya and Calvin guessed round 2.
Tsai Lin can guess both.

**G6 tier-list**:
```
title: "Dining hall tier list", noun: "hall",
items: ["Crossroads", "Foothill", "Clark Kerr", "Cafe 3", "Late Night at the Union", "Halal cart"],
ranked: [ { name: "Arun", tiers: "SACBAS" }, { name: "Aditya", tiers: "ASDACS" }, { name: "Calvin", tiers: "SACBDS" }, { name: "Will", tiers: "SSCBSA" } ]
```
Already done: four ranked. Tsai Lin can rank and see where they disagree.

### B7. Notifications (10, 5 about tools)

File: `apps/shell/src/surfaces/data.ts` NOTIFS (replaces the four). Newest first.

| # | id | Text (html) | Ago | Unread | Badge | Goes to |
|---|---|---|---|---|---|---|
| N1 | `nt-veto` | "**Arun Vaithianathan** vetoed **Pier Pizza** in **After Juniper food**" | 7m | yes | share | the boys chat, `t-veto` |
| N2 | `nt-draft` | "**Will Li** took **Fridge** in **Chore draft**. You're up" | 10m | yes | share | apt 4b chat, `t-wheel` |
| N3 | `nt-door` | "**Calvin Karthik** added you to the door list for **Will's 21st**" | 2h | yes | event | event `will21` |
| N4 | `nt-seat` | "**Maya Chen** has 2 seats left in her car for **Juniper Hale live**" | 5h | no | event | event `juniper` |
| N5 | `nt-tab` | "**Hana Ito** settled **Joshua Tree tab**. You pay Hana $229" | 1d | no | share | post `p-jt` |
| N6 | `nt-story` | "Your story poll ended. **hike** won 9 to 5" | 2h | yes | story | story `s-me` |
| N7 | `nt-memory` | "You have a memory with **Aditya Kapoor**, **Maya Chen** and **Will Li** from 1 year ago" | 3h | no | story | post `p-memory` |
| N8 | `nt-lena` | "**Lena Ortiz** posted in **Eastfield sublets and housing**: subletting my room jun-aug" | 5h | no | group | group `sublets` |
| N9 | `nt-crag` | "**Zoe Achebe** invited you to **Castle Rock crag day**" | 1d | no | event | event `crag` |
| N10 | `nt-event` | "**Juniper Hale live** is tomorrow. **Maya** and 2 friends are going" | 1d | no | event | event `juniper` |

N1 to N5 are about tools.

### B8. Messenger: the six chats

Files: messages in `apps/shell/src/store/fake-data.ts` (`seedChats`, and `lateNight` in
`services/demo/seed.ts`); tools in `services/demo/seed.ts` TOOLS; bump `SEED_VERSION` to "5".
`at(day, h, m)` as in `fake-data.ts`. A system line is
"**Muse** built **<name>** for this chat"; the card follows it.

#### Chat 1 · apt 4b (Tsai Lin, Maya, Will, Aditya)

Messages: unchanged through `v` ("**Will** took Fridge"). Add at the end (ask path C13 reads them):
- `at(0, 9, 36)` priya: "also the lease renews in jan and rent goes to 4200"
- `at(0, 9, 37)` maya: "if i keep the big room with the bathroom i should pay more tbh"
- `at(0, 9, 37)` dev: "and i'll pay for the parking spot"

Tools (unchanged, documented here):
- `t-utilities` utilities-split "October utilities": example with Theo→Will, Dev→Aditya; Will
  "ran the AC 24/7" carries the $52 overage; Tsai Lin paid $71.50; Aditya agreed. "1 of 3 paid".
- `t-groceries` grocery "Groceries": Theo→Aditya, Dani→Maya, Marcus→Tsai Lin, Jess→Will; Aditya took
  the run, 0 of 7 in the cart. Change Maya's "Oat milk" line: the item stays Will's ("oatly or
  nothing" becomes "the oat kind, not the almond kind").
- `t-wheel` chore-draft "Chore draft": order Maya, Will, Tsai Lin, Aditya; Maya took Dishes, Will
  took Fridge. Tsai Lin is up.

#### Chat 2 · the boys (Tsai Lin, Aditya, Calvin, Arun)

Messages: unchanged through the event link. Then:
- `at(0, 9, 25)` system, card **Juniper Hale seats** `t-juniper` (replaces piece:lock "Juniper Fri")
- `at(0, 9, 27)` activity "**Arun** took a seat in 103"
- `at(0, 9, 29)` jonah: "ok will's gift. he said he'd die for a record player in september"
- `at(0, 9, 29)` jonah: "$20 each, 9 of us with maya, rae, jules, hana and omar"
- `at(0, 9, 29)` system, card **Gift pool** `t-gift`
- `at(0, 9, 30)` theo: "sent"
- `at(0, 9, 31)` dev: "sent. he's going to cry"
- `at(0, 9, 33)` dev: "food after the show tmrw? night owl or lupe's, both open late"
- `at(0, 9, 34)` theo: "anything but pier pizza. im so over it"
- `at(0, 9, 34)` jonah: "halal cart is right there tho"
- `at(0, 9, 34)` system, card **After Juniper food** `t-veto`
- `at(0, 9, 35)` activity "**Arun** vetoed Pier Pizza"

Tools:
- `t-juniper` **concert**, summary "Section 103 · 2 in, 1 maybe":
  ```
  title: "Juniper Hale live", when: "Fri", venue: "Meridian Hall",
  floor: { priceCents: 5200, together: 12 },
  lower: [ { label: "101", priceCents: 6600, together: 6 }, { label: "102", priceCents: 7000, together: 4 }, { label: "103", priceCents: 7400, together: 8 },
    { label: "104", priceCents: 7000, together: 6 }, { label: "105", priceCents: 6600, together: 5 } ],
  upper: [ { label: "201", priceCents: 3800, together: 10 }, { label: "202", priceCents: 4200, together: 8 }, { label: "203", priceCents: 4600, together: 6 },
    { label: "204", priceCents: 4200, together: 8 }, { label: "205", priceCents: 3800, together: 10 } ],
  claimed: "103",
  people: [ { name: "Arun", status: "in" }, { name: "Calvin", status: "in" }, { name: "Aditya", status: "maybe" } ],
  note: { who: "Aditya", text: "if it's under $60" }
  ```
  Acts: theo in, jonah in, dev maybe. Tsai Lin can say in, move the group to another section.
- `t-gift` **gift-pool**, summary "$120 of $180 · 6 of 9 in":
  ```
  recipient: "Will", occasion: "he turns 21 at midnight", gift: "Record player", giftNote: "the teal one",
  quote: "i would die for a record player tbh", quoteDate: "Sep 14", goalCents: 18000, shareCents: 2000,
  crew: ["Tsai Lin", "Aditya", "Calvin", "Arun", "Maya", "Rae", "Jules", "Hana", "Omar"],
  paid: ["Maya", "Rae", "Jules"]
  ```
  Acts: jonah pay, theo pay, dev pay (6 paid in all). Tsai Lin can chip in $20, nudge Hana and Omar.
- `t-veto` **dinner-veto**, summary "3 left · Calvin and you to veto":
  ```
  title: "After Juniper food", time: "10:45", leaveBy: "10:30",
  spots: [ { name: "Pier Pizza", kind: "pizza", price: "$", miles: 0.4, stars: 4.1 },
    { name: "Night Owl Diner", kind: "diner", price: "$", miles: 0.6, stars: 4.5 },
    { name: "Lupe's Tacos", kind: "tacos", price: "$", miles: 0.3, stars: 4.7 },
    { name: "Halal cart on Bancroft", kind: "halal", price: "$", miles: 0.2, stars: 4.6 },
    { name: "Smash Shack", kind: "burgers", price: "$$", miles: 0.9, stars: 4.4 } ],
  vetoes: [ { name: "Arun", spot: 0, why: "so over it" }, { name: "Aditya", spot: 4, why: "0.9 mi after standing 3 hrs??" } ],
  passed: []
  ```
  Acts: theo veto 0, dev veto 4. Calvin and Tsai Lin are left; the cast's Calvin vetoes Night Owl
  ("had it last night") 15 to 40 s after Tsai Lin opens the chat. Tsai Lin's veto picks the winner.

#### Chat 3 · senior week (Tsai Lin, Maya, Aditya, Calvin, Will, Arun)

Messages: unchanged, except `at(-2, 20, 10)` priya "found the pics from gulf shores and the
smokies" replaces with "found the pics from big sur and joshua tree", and `at(-2, 20, 15)` theo
"the tent one is a hate crime" replaces with "the tent one is a crime". Insert before
`at(0, 9, 31)`:
- `at(-1, 19, 2)` dev: "deposit for the cayucos house is due friday. $140 each"
- `at(-1, 19, 3)` dev: "i'm not putting it down unless all 6 of us are in"
- `at(-1, 19, 3)` system, card **Senior week or never** `t-trip`
- `at(-1, 19, 10)` priya: "took 1b. obviously"
- `at(-1, 19, 14)` activity "**Calvin** took seat 1D"
- `at(-1, 19, 20)` theo: "checking if my last lab is the 14th or the 16th, one sec"

Tools:
- `t-bingo` road-bingo (renames Leo→Calvin, Sam→Aditya, Kev→Arun, Ana→Maya; to "the beach
  house", 212 mi). Replace three squares so no teammate is the joke: "Aditya drives w/ one knee"
  becomes "Aditya does the dad wave at every truck"; "Arun asleep, mouth open" becomes "Arun DJs
  the whole first hour"; "Arun: “I'm not even tired”" becomes "Arun: “one more song”". 8 of 24
  spotted; Arun last spotted "wrong exit (blame Maps)".
- `t-captions` caption-contest (replaces the Gulf Shores and Smoky Mtns photos):
  ```
  photos: [
    { place: "Big Sur, last November", scene: "beach", captions: [
      { by: "Will", text: "Maya's final form: low maintenance", voters: [] },
      { by: "Tsai Lin", text: "She said she wanted to ‘ground herself’", voters: ["Will", "Arun"] },
      { by: "Aditya", text: "Sunscreen: 0. Maya: also 0.", voters: ["Calvin"] },
      { by: "Calvin", text: "Tide comes in at 4. We leave at 3:55", voters: ["Aditya"] } ] },
    { place: "Joshua Tree, night 1", scene: "camp", captions: [
      { by: "Arun", text: "Hana set up the tent. Hana is now the tent.", voters: ["Maya"] },
      { by: "Aditya", text: "5-star glamping, 0-star engineering", voters: ["Will", "Arun"] },
      { by: "Maya", text: "We asked if she needed help. “I got it”", voters: ["Calvin"] },
      { by: "Will", text: "The coyotes are not the threat here", voters: ["Aditya"] } ] } ]
  ```
  Acts: maya votes Calvin's caption (p0c3). Tsai Lin is the last to vote on photo 1. "5 of 6 voted".
- `t-trip` **trip-lock** (new), summary "4 of 6 seats · deposit Fri 5 PM":
  ```
  title: "Senior week or never", sub: "Muse Air · trip for 6", date: "Mon, May 17 at 9:00 AM",
  from: "Apt 4B", to: "Cayucos", details: "May 17–21 · ~$140 each · gate: the chat",
  deadline: "Deposit due Fri at 5:00 PM",
  seats: [ { code: "1A", who: "Aditya" }, { code: "1B", who: "Will" }, { code: "1C", who: "Maya" },
    { code: "1D", who: "Calvin" }, { code: "1E", who: "" }, { code: "1F", who: "" } ],
  lockAt: 6
  ```
  Acts: dev, priya, maya, jonah take seats. Arun and Tsai Lin are open. The cast's Arun takes 1E about
  30 s after Tsai Lin opens the card ("16th. i'm in"); Tsai Lin's seat locks it.
- Live: slot machine (C1), playlist draft (C16).

#### Chat 4 · Maya Chen (Tsai Lin, Maya)

Messages: unchanged, then:
- `at(0, 8, 56)` maya: "ok but where. 3rd floor main stacks is S tier and i will die on it"
- `at(0, 8, 57)` me: "physics library is S and it's not close"
- `at(0, 8, 57)` system, card **Study spot tier list** `t-study`
- `at(0, 8, 58)` maya: "ranked. fight me"
- `at(0, 9, 5)` maya: "also movie on the wall after friendsgiving. i pulled everyone's picks from 4b"
- `at(0, 9, 5)` system, card **Movie night bracket** `t-movie`
- `at(0, 9, 6)` activity "**Maya** picked Paddington 2"

Tools:
- `t-study` **tier-list**, summary "Maya ranked · your turn":
  ```
  title: "Study spot tier list", noun: "spot",
  items: ["Main stacks 3rd floor", "Physics library", "Union cafe", "Campus Row Cafe", "Our kitchen table", "Night reading room"],
  ranked: [ { name: "Maya", tiers: "SACBDA" } ]
  ```
- `t-movie` **movie-bracket**, summary "Round 1 · Dune or Paddington":
  ```
  when: "Sat 9 PM", where: "Apt 4B, on the wall",
  movies: [ { title: "Dune: Part Two", by: "Aditya", quote: "needs the big screen" }, { title: "Paddington 2", by: "Maya", quote: "a perfect film, fight me" },
    { title: "Past Lives", by: "Will", quote: "bring tissues" }, { title: "Shrek 2", by: "Tsai Lin", quote: "holding out for a hero" },
    { title: "Interstellar", by: "Aditya", quote: "the docking scene" }, { title: "Mean Girls", by: "Maya", quote: "on wednesdays we watch this" },
    { title: "Spider-Verse", by: "Tsai Lin", quote: "the animation tho" }, { title: "The Notebook", by: "Will", quote: "ironically. mostly." } ],
  picks: [ { name: "Maya", side: 1 } ]
  ```

#### Chat 5 · Will Li (Tsai Lin, Will)

Messages: unchanged, then the reel share from `seed-surfaces.ts` (`sx-reel`, `sx-wait` "we need to
go to all 3") and:
- `at(0, 9, 10)` priya: "rae lands at 6. pizza at ours before the den?"
- `at(0, 9, 10)` priya: "getting gino's. tell me what u want or u get mushrooms"
- `at(0, 9, 11)` system, card **Pizza run** `t-pizza`
- `at(0, 9, 11)` activity "**Will** added mushroom and olive"

Tools:
- `t-sx-try` **reel-to-try** (replaces piece:poll; 486 px tall, so the chat shows the card closed
  with "Open" and the sheet shows it full), summary "Golden Fold added · 4 on the list":
  ```
  reel: { from: "Will", note: "we need to go to all 3", account: "cami.eats", caption: "3 dumpling spots worth the line. the last one is cash only", likes: "18.4K", place: "Golden Fold", area: "Telegraph" },
  spots: [
    { name: "Mr. Bao", area: "Shattuck", tried: "Oct 3", ratings: [{ by: "Will", stars: 5 }, { by: "Maya", stars: 4 }], want: [] },
    { name: "Dumpling Alley", area: "Downtown", tried: "", ratings: [], want: ["Will", "Rae"] },
    { name: "Lupe's Tacos", area: "Telegraph", tried: "Sep 20", ratings: [{ by: "Will", stars: 5 }, { by: "Calvin", stars: 4 }, { by: "Arun", stars: 5 }], want: [] },
    { name: "Kiki's Tea Truck", area: "Telegraph", tried: "Aug 30", ratings: [{ by: "Will", stars: 3 }, { by: "Rae", stars: 4 }], want: [] } ]
  ```
  Acts: priya adds Golden Fold. Tsai Lin can tap Want, star Mr. Bao.
- `t-pizza` **pizza**, summary "3 of 4 picked · $8.05 each so far":
  ```
  place: "Gino's on Channing", messages: 9, baseCents: 2200, toppingCents: 125, tipPercent: 20,
  wings: { label: "10 wings", cents: 1300, note: "Rae asked twice" },
  crew: [ { name: "Will", quote: "mush + olive. no pepp", toppings: ["mushroom", "olive"], whatever: false },
    { name: "Rae", quote: "pineapple. don't @ me", toppings: ["pineapple"], whatever: false },
    { name: "Maya", quote: "whatever", toppings: [], whatever: true },
    { name: "Tsai Lin", quote: "", toppings: [], whatever: false } ]
  ```
  Acts: priya picks toppings. Tsai Lin picks toppings too, then "Order".

#### Chat 6 · late night (Arun, Calvin, Aditya; Tsai Lin joins from Arun's note)

Messages `ln1` to `ln4` unchanged, then (times are today, after midnight):
- `ln5` `at(1, 20)` theo: "smash before the party tonight? who's on"
- `ln6` `at(1, 21)` dev: "7 to 8:30 then i'm showering"
- `ln7` `at(1, 21)` jonah: "on all night till the party"
- `ln8` `at(1, 22)` system, card **Who's on tonight** `t-lobby`
- `ln9` `at(1, 30)` jonah: "den rules v2 for tonight. the no phones rule is banned"
- `ln10` `at(1, 31)` system, card **King's cup** `t-kings`

Tools:
- `t-bracket` **bracket-post**, the same room and params as F03 (replaces piece:bracket).
- `t-lobby` **lobby**, summary "Best overlap 7 to 8:30":
  ```
  title: "Who's on tonight",
  people: [ { name: "Calvin", reply: "on all night till the party", from: 0, to: 6, maybe: false },
    { name: "Arun", reply: "after gym ~7, done by 9", from: 2, to: 6, maybe: false },
    { name: "Aditya", reply: "7 to 8:30 then i'm showering", from: 2, to: 5, maybe: false } ]
  ```
- `t-kings` **kings-cup**, summary "Den rules v2 · 3 drawn":
  ```
  title: "King's cup", sub: "The den rules v2",
  rules: [ { title: "Waterfall", rule: "Arun starts. Nobody stops before Arun." }, { title: "You", rule: "Pick someone to sip." },
    { title: "Me", rule: "You sip. Sorry." }, { title: "Floor", rule: "Last to touch the (sticky) floor sips." },
    { title: "Guys", rule: "Guys sip." }, { title: "Girls", rule: "Girls sip." },
    { title: "Pans", rule: "Whoever left pans out sips. (Jules.)" }, { title: "Mate", rule: "Pick a mate. Tsai Lin picks Calvin, every time." },
    { title: "Rhyme", rule: "Rhyme with “roof”. Go." }, { title: "Categories", rule: "Things on the den's roof right now." },
    { title: "New rule", rule: "Make a rule. Not “no phones” again." }, { title: "Questions", rule: "Only answer with a question." },
    { title: "King's cup", rule: "Pour a splash in. 4th king drinks it. Lemonade counts, no pressure." } ],
  drawn: [ { card: "3s", name: "Arun" }, { card: "Kh", name: "Calvin" }, { card: "9d", name: "Aditya" } ]
  ```

### B9. Photo briefs for every other picture slot

For the photo agent. One line each: what is in frame, orientation, mood. None shows an
identifiable face. Feed post photos have their brief inline in A; chat photos have theirs inline
in F. Shares reuse the source's photo (F08 uses E1, F13 uses R4, F19 uses M2, F34 uses R8).

| Slot | Brief |
|---|---|
| S1 `s-me` | wooden trail sign at a ridge trailhead, morning light, portrait, eager, no people |
| S2 `s-maya` | desk lamp over a stack of library books and a coffee cup, night, portrait, cozy |
| S3 `s-dev` | empty residential street at sunrise from a second-floor window, portrait, sleepy calm |
| S4 `s-trip` | coastal highway curving along cliffs over the ocean, golden hour, portrait, nostalgic |
| S5 `s-theo` | drum pad and a phone on a coffee table with fairy lights, night, portrait, playful |
| S6 `s-priya` | playing cards fanned out on a bedspread, soft daylight, portrait, cheerful |
| S7 `s-jonah` | string lights strung over an empty rooftop with folding chairs, dusk, portrait, expectant |
| S8 `s-nico` | concert ticket stub held between two fingers in front of a venue marquee, night, portrait, buzzing |
| R1 `r-dumplings` | steaming bamboo basket of dumplings on a busy counter, close up, portrait, hungry |
| R2 `r-hike` | ridge trail at sunset with hills in silhouette, portrait, golden |
| R3 `r-tacos` | taco truck window at night with a line of people seen from behind, portrait, lively |
| R4 `r-noodles` | wide noodles tossed in red chili oil in a pan, overhead, portrait, sizzling |
| R5 `r-juniper` | acoustic guitar and a small crowd in an alley lit by one lamp, seen from behind, portrait, intimate |
| R6 `r-crag` | climber's hands chalking up on a sandstone boulder, portrait, determined, no face |
| R7 `r-couch` | green velvet couch half reupholstered with a staple gun on the cushion, portrait, crafty |
| R8 `r-ramen` | bowl of tonkotsu ramen with a soft egg on a wooden counter, overhead, portrait, steamy |
| G-A cover | indoor climbing wall with colored holds and ropes, wide, landscape, energetic, no faces |
| G-A `c3` | dirt trail on a grassy ridge at sunset, landscape, easy and happy, no people |
| G-B cover | row of townhouse front doors with "for rent" sign in a window, landscape, everyday |
| G-C cover | clock tower over a campus quad in afternoon light, landscape, proud |
| M1 `l-sectional` | (asset `listing-couch`) grey sectional in a living room, landscape |
| M2 `l-loveseat` | green velvet loveseat against a white wall, daylight, landscape, plain listing photo |
| M3 `l-futon` | black futon folded flat in a bare room, landscape, plain listing photo |
| M4 `l-fridge` | (asset `listing-mini-fridge`) |
| M5 `l-desk` | (asset `listing-desk`) |
| M6 `l-bike` | (asset `listing-bike`) |
| M7 `l-lamp` | (asset `listing-lamp`) |
| M8 `l-books` | stack of four used textbooks with sticky notes, overhead, landscape, plain listing photo |
| M9 `l-projector` | small projector on a stool facing a pull-down screen, dim room, landscape |
| M10 `l-harness` | climbing harness laid flat on a wooden floor, overhead, landscape |
| M11 `l-bookshelf` | white five-shelf bookshelf, mostly empty, against a wall, portrait |
| M12 `l-mirror` | full length mirror leaning on a wall reflecting a window, portrait, no person in it |
| E1 `juniper` | stage lights through haze over a crowd seen from behind, landscape, electric |
| E2 `potluck` | long table set with mismatched plates and candles, overhead, landscape, warm |
| E3 `will21` | rooftop at night with string lights and a small cake with candles on a crate, landscape, festive |
| E4 `crag` | sandstone rock face with a top rope hanging, forest around it, morning, landscape |
| G1 `gm-chatdle` | letter tiles on a table spelling a five-letter word, overhead, square |
| G2 `gm-trivia` | pub quiz answer sheet and pencils on a table, overhead, square |
| G3 `gm-trivianight` | two buzzers on a kitchen table, square, competitive |
| G4 `gm-twotruths` | three paper cards face down on a couch cushion, square, sly |
| G5 `gm-captions` | instant photos scattered on a rug, overhead, square, nostalgic |
| G6 `gm-dining` | cafeteria trays on a long table, square, everyday |
| G7 `gm-lobby` | two game controllers on a couch next to a pizza box, square, evening |
| G8 `gm-movie` | projector beam on a bare living room wall, dark room, square |
| F28 link thumbnail | climbing wall at night through a gym window, landscape |
| apt 4b sink | (asset `place-apt-sink`) |

---

## C. Ask Muse paths the presenter can perform

16 paths. Each lists: where you are, what you type or tap (exact), what Muse reads (quoted), the
lab tool, how it is filled, and what the cast does in the next 20 seconds. Times in the cast
column are seconds after the tool appears; the cast's lines go in `services/cast/src/lines.ts`
and their timing in `src/scenes.ts`. Scenario ids are in `apps/shell/src/muse/pack.ts`; facts
in `muse/seed.ts`. A path marked "change" edits an existing tool: Muse rebuilds it with the new
params and replays the tool's log on top, so every move made so far stays (add an `edit`
scenario kind to the pack that takes the current params and returns new ones).

Three are unprompted (C2, C6, C9), three change a tool (C4, C12, C14), two fall through to a live
build (C15, C16).

### C1 · Senior week · "muse pick for us" → slot-machine

- Where: Messenger, senior week (F3 ends on the stuck exchange).
- Type: `muse pick for us`
- Muse reads (F3 155 to 169): Maya "where are we eating tonight"; Aditya "thai basil or sushi
  ko"; Will "or the taco truck on college ave, open til 11"; Arun "not pier pizza again, im so
  over it"; Maya "drinks after?"; Calvin "$3 wells at the dive or byob on the deck"; Will "or $2
  pbr at lucky's"; Calvin "not $14 cocktails, im broke"; Aditya "leave at 9:45 or 10:15"; Arun "or
  1am lol"; Aditya "not 1am, im driving"; "idk anything works", "idk u pick", "no u pick". Also
  Calvin at 09:20 "party starts at 9 but nobody shows before 10".
- Tool: `lab:slot-machine` (existing scenario, chat land), card "Tonight's plan":
  ```
  title: "Tonight's plan", why: "“idk u pick” ×3 · rigged by the chat",
  reels: [
    { name: "Where", options: [ { label: "Thai Basil", vetoed: false }, { label: "Sushi Ko", vetoed: false },
      { label: "Taco truck", vetoed: false }, { label: "Pier Pizza", vetoed: true } ] },
    { name: "Drinks", options: [ { label: "$3 wells", vetoed: false }, { label: "BYOB on the deck", vetoed: false },
      { label: "$2 PBR", vetoed: false }, { label: "$14 cocktails", vetoed: true } ] },
    { name: "Leave at", options: [ { label: "9:45", vetoed: false }, { label: "10:15", vetoed: false }, { label: "1am", vetoed: true } ] } ],
  rules: [ { text: "pier pizza", who: "Arun's so over it" }, { text: "$14+", who: "Calvin's broke" }, { text: "1am", who: "Aditya's driving" } ],
  rest: [0, 0, 0]
  ```
- Arrives in progress: the three vetoes are already struck, each with who said it.
- Cast, next 20 s: +5 Maya pulls the lever (the server seed picks; vetoed options never land);
  +11 Will "ok the machine has spoken"; +15 Arun 👍 on the card; +19 Calvin "legend. leaving at
  " + the landed time.

### C2 · Juniper Hale event · tap Interested → offer → squad-lock (unprompted)

- Where: event E1. Tsai Lin is not yet Interested.
- Tap: **Interested**. Trigger: the viewer just tapped Interested and 3 friends on the page are
  Interested (`did` ends with "interested", `friends.length >= 3`). Muse offers, under the RSVP
  row: "Maya, Arun and Will are interested. Go together?" with button **Go together**.
- Tap: **Go together**.
- Muse reads: "1,403 interested · 84 going"; "Fri at 8:00 PM"; "Meridian Hall"; "Student
  tickets at the box office with a valid ID"; tiers Balcony $38, Floor GA $52; friends Maya,
  Arun, Will.
- Tool: `lab:squad-lock` (`event-go-together`, page land):
  ```
  title: "Go with friends", sub: "Juniper Hale live · Meridian Hall · 1,403 interested",
  date: "FRI AT 8 PM", tickets: "Student tickets at the box office · Balcony $38 · Floor GA $52",
  host: "Tsai Lin", threshold: 4,
  going: [ { name: "Tsai Lin", note: "" }, { name: "Maya", note: "already asked for friday off" } ],
  maybe: ["Arun", "Will"]
  ```
- Arrives in progress: Maya is already Going (her comment on F08: "going with my whole apartment").
- Cast: +7 Arun Going, note "i'll drive 3 if we need"; +14 Will Going, note "21 by then. i'm
  going"; the squad locks at 4 with the stamp; +19 Maya taps "Remind everyone".

### C3 · Juniper Hale event · "split tickets, we want to sit together" → ticket-split

- Where: event E1, the page's "Ask Muse" field.
- Type: `split tickets, we want to sit together`
- Muse reads: EVENT_FACTS tiers; "Row C · seats side by side"; friends with a seat in the
  page's rides tool (Maya, Will in Maya's Civic; Calvin driving); Arun is only Interested ("on
  the door tonight, deciding tomorrow").
- Tool: `lab:ticket-split` (`event-tickets`):
  ```
  venue: "Meridian Hall", date: "Fri",
  tiers: [ { name: "Balcony", kind: "lawn", priceCents: 3800, feeCents: 600, left: 120, together: "Balcony · sit anywhere" },
    { name: "Floor GA", kind: "pit", priceCents: 5200, feeCents: 800, left: 40, together: "Standing · near the stage" },
    { name: "Front rows", kind: "rows", priceCents: 7400, feeCents: 1100, left: 12, together: "Row C · seats side by side", row: "C" } ],
  tier: 2, people: ["Tsai Lin", "Maya", "Will", "Calvin"], payer: "Tsai Lin"
  ```
- Arrives in progress: Front rows picked because the ask said "sit together"; Tsai Lin fronts.
- Cast: +7 Maya marks her $85 sent; +13 Will marks sent; +18 Calvin "front row C. legend" and
  marks sent.

### C4 · On the ticket split · "add arun" (change)

- Where: the C3 tool, its Muse bar.
- Type: `add arun`
- Muse reads: the tool's params and log; Arun is on the page as Interested.
- Change: `people` gains "Arun" (5 seats in Row C, $85 each, Tsai Lin fronts $425). Sent marks
  from C3 stay.
- Cast: +6 Arun "in. sending now"; +12 Arun marks sent; +17 Will ❤️ on the card's message.

### C5 · Grey sectional listing · "will this fit in 4b" → room-fit

- Where: Marketplace, M1 `l-sectional`, the "Ask Muse" field.
- Type: `will this fit in 4b`
- Muse reads: "Grey sectional couch $180"; LISTING_FACTS w 92 in, d 36 in; ROOM_4B "Long wall
  104 in", "Window wall 80 in", "By the door 62 in"; Aditya's floor plan on M2 (the loveseat on
  the long wall).
- Tool: `lab:room-fit` (`mp-room-fit`), params as M2 with the sectional `by: "Tsai Lin"`.
- Arrives in progress: the loveseat, lamp and rug are where Aditya and Maya put them; the
  sectional waits in the tray.
- Cast: +6 Aditya drags the loveseat off the long wall, "ok the sectional wins the long wall";
  +13 Maya drops the sectional on the long wall; it fits with 12 in to spare; +18 Will "movie
  night has a home".

### C6 · The boys · Calvin's receipt → bill-roulette (unprompted)

- Where: Messenger, the boys. Trigger beat: the cast's Calvin sends (controls: "next beat",
  scene 5 "Night Owl receipt" in `services/cast/src/scenes.ts`):
  - jonah: "night owl was $86 last night. who's got it"
  - jonah: "[photo: diner receipt on a formica table next to a coffee mug, portrait, late night, no people]"
- Trigger: a bill amount and "who's got it" in one burst. Muse offers a chip under the photo:
  "Spin for it?"
- Tap: **Spin for it?**
- Muse reads: "$86"; who paid lately from this chat (F2: Calvin paid Night Owl twice and the gas,
  Arun the halal run, Aditya the Lupe's tab, Tsai Lin nothing since d-6).
- Tool: `lab:bill-roulette`:
  ```
  title: "Who's got Night Owl?", place: "Night Owl Diner", billCents: 8600,
  people: [ { name: "Calvin", paidCents: 21200 }, { name: "Arun", paidCents: 14000 },
    { name: "Aditya", paidCents: 9600 }, { name: "Tsai Lin", paidCents: 5800 } ]
  ```
- Arrives in progress: slices are already sized by who paid lately; Tsai Lin's is the biggest.
- Cast: +5 Arun "spin it"; +12 Aditya spins (the seed picks); +17 Calvin "legend" to whoever it
  lands on. In the presenter script C12 comes before the spin.

### C7 · Aditya's story · "do it again" → date-swipe

- Where: story S4 `s-trip`, the reply bar's "Ask Muse".
- Type: `do it again`
- Muse reads: TRIP "4 of us in Aditya's car, Nov 10 to 12", "312", "Nepenthe"; people Aditya,
  Maya, Will, Tsai Lin; the story's replies: Maya "december after finals??", Will "jan works
  too" (add both to S4's replies).
- Tool: `lab:date-swipe` (`story-again`), lands in a new chat "big sur again" (me, dev, maya,
  priya):
  ```
  place: "Big Sur", lockAt: 4,
  weekends: [ { label: "Dec 4–6", month: "Dec", day: 4, span: "Fri–Sun", why: "last weekend before finals", free: [] },
    { label: "Dec 18–20", month: "Dec", day: 18, span: "Fri–Sun", why: "finals done · campsite has showers", free: ["Maya"] },
    { label: "Jan 8–10", month: "Jan", day: 8, span: "Fri–Sun", why: "before spring starts", free: ["Will"] } ]
  ```
- Cast: +5 Aditya swipes Dec 18-20 free ("i'll drive again obviously"); +12 Will swipes Dec
  18-20 free; three free, Tsai Lin's swipe locks it.

### C8 · Sublets group · "find me a june sublet under 1000" → sublet-finder

- Where: G-B, the group composer's "Ask Muse".
- Type: `find me a june sublet under 1000`
- Muse reads: SUBLET_FACTS months and prices; matches are the Dwight 2br $950, the near campus
  room $780, Hearst 3br $890, College Ave shared $600.
- Tool: `lab:sublet-finder` (`group-sublet-finder`), title "June sublets under $1,000", the four
  matching listings from the pinned tool's params, `budgets: [60000, 80000, 100000]`, and the
  saves friends already made on those four (Maya saved Dwight Way and Hearst Ave; Will saved
  Dwight Way and College Ave).
- Cast: +9 Maya saves Near campus, "the yard tho"; +16 Will shares the shortlist to the Will DM.

### C9 · Friendsgiving event, host view → open-spots (unprompted)

- Where: event E2, opened by its host (Tsai Lin).
- Trigger: the host opens a page with `spots: 3` left and comments asking to come (add to E2's
  comments: Wes "any room for one more? i make good rolls", Bea "can i come if i bring green
  beans", Cami "first friendsgiving in the us, can i bring dumplings"). Offer: "3 people asked
  to come. Open 3 spots?" with button **Open spots**.
- Muse reads: those three comments, "11 going", "Bring a dish. The turkey is covered."
- Tool: `lab:open-spots` (`event-open-spots`):
  ```
  title: "Friendsgiving potluck", when: "Sat 6:00 · Apt 4B",
  going: ["Tsai Lin", "Maya", "Aditya", "Will", "Calvin", "Arun", "Rae", "Hana", "Jules", "Omar", "Kofi"], spots: 3,
  requests: [ { name: "Wes Duarte", meta: "Foothill RA · moving to 2C", mutuals: ["Calvin", "Maya"], note: "I'll bring rolls, I make good rolls" },
    { name: "Bea Santos", meta: "Climbing club treasurer", mutuals: ["Tsai Lin", "Arun"], note: "Green beans so the list stops glowing" },
    { name: "Cami Reyes", meta: "New to the climbing club", mutuals: ["Tsai Lin"], note: "First Friendsgiving in the US, can I bring dumplings?" } ]
  ```
- Cast: +8 Maya (co-host) "accept all 3 we have chairs"; +14 Aditya "i'll carry the extra table".
  Tsai Lin accepts. The bring list's rolls and green beans fill when Wes and Bea are in.

### C10 · Chili crisp noodles reel · "let's make this sunday for 4b" → reel-cook-night

- Where: Reels, R4 `r-noodles`, "Ask Muse".
- Type: `let's make this sunday for 4b`
- Muse reads: REEL_FACTS ingredients "Wide noodles, Chili crisp, Garlic, Scallions, Soy sauce,
  Peanuts"; "15 minute chili crisp noodles. 6 things, one pan"; apt 4b members.
- Tool: `lab:reel-cook-night` (`reel-cook-night`; lab first on the reel page, which has room),
  lands in apt 4b:
  ```
  reel: { from: "Tsai Lin", note: "Sunday?", account: "ines.cooks", title: "15 minute chili crisp noodles", plays: "12.8K likes" },
  host: "Tsai Lin", time: "7pm", serves: 4, costCents: 2400,
  items: [ { label: "Wide noodles", by: "Tsai Lin" }, { label: "Chili crisp", by: "" }, { label: "Garlic", by: "" },
    { label: "Scallions", by: "" }, { label: "Soy sauce", by: "" }, { label: "Peanuts", by: "" } ],
  nights: [ { day: "Sun", date: "Nov 15", votes: ["Tsai Lin"] }, { day: "Mon", date: "Nov 16", votes: [] }, { day: "Wed", date: "Nov 18", votes: [] } ]
  ```
- Cast: +6 Will claims Chili crisp, "i have a whole jar"; +10 Maya votes Sun; +16 Aditya claims
  Garlic and Scallions, "i'll use one pan. one"; +19 Maya claims Peanuts. Sunday locks at 3.

### C11 · Gaming · "make a trivia about apt 4b" → friend-trivia-pub

- Where: Gaming, "Make a game" field.
- Type: `make a trivia about apt 4b`
- Muse reads (apt 4b, F1): Will "who ate my oat milk", Aditya "ok it was me", Will "its 90
  degrees in my room ok", Maya "the sink is a biohazard", Maya "electric bill came. $142??",
  CHAT_FACTS "$18" grocery share.
- Tool: `lab:friend-trivia-pub` (`game-trivia`):
  ```
  title: "How well do you know apt 4b?", by: "Tsai Lin", plays: 0,
  questions: [
    { about: "Aditya", q: "Who ate Will's oat milk?", options: ["Maya", "Aditya", "Tsai Lin", "Will"], answer: 1 },
    { about: "the group", q: "Everyone's share of the groceries?", options: ["$12", "$18", "$24", "$30"], answer: 1 },
    { about: "Will", q: "How hot is Will's room, per Will?", options: ["75", "82", "90", "100"], answer: 2 },
    { about: "Maya", q: "What did Maya call the sink?", options: ["A crime scene", "A biohazard", "A swamp", "Fine"], answer: 1 },
    { about: "the group", q: "October's electric bill?", options: ["$98", "$121", "$142", "$186"], answer: 2 } ],
  played: []
  ```
- Arrives in progress: every question is built from a message in the chat, so it lands already
  full of the group.
- Cast: +4 Maya starts; +18 Maya finishes 4 of 5 (690); +19 Aditya "i got the oat milk one
  right for obvious reasons".

### C12 · The boys roulette · "nah split by what we ordered instead" (change)

- Where: the C6 tool, before anyone spins. Tsai Lin types in the chat.
- Type: `muse nah split by what we ordered instead`
- Muse reads: Calvin's receipt photo (its items are in the scenario's facts, as if read from
  the photo), "$86", Calvin paid.
- Change: the roulette card is replaced in place by `lab:tab-claim`:
  ```
  place: "Night Owl Diner", payer: "Calvin", tipBps: 2000,
  items: [ { label: "Patty melt", priceCents: 1450, claimedBy: "Calvin" }, { label: "Chili cheese fries", priceCents: 950, claimedBy: "" },
    { label: "Short stack", priceCents: 1100, claimedBy: "" }, { label: "Black and white shake", priceCents: 750, claimedBy: "" },
    { label: "Strawberry shake", priceCents: 750, claimedBy: "" }, { label: "Grilled cheese + tomato soup", priceCents: 1250, claimedBy: "" },
    { label: "Onion rings", priceCents: 920, claimedBy: "" } ]
  ```
  Items $71.70 plus 20% tip is $86.04.
- Cast: +6 Arun claims Short stack and Strawberry shake; +11 Aditya claims Grilled cheese +
  tomato soup; +15 Calvin "onion rings were for the table" (left unclaimed, so they split 4
  ways); Tsai Lin claims the fries and the black and white shake.

### C13 · Apt 4B · "muse how do we split rent if maya gets the big room" → rent-split

- Where: Messenger, apt 4b, after F1's last three lines.
- Type: `muse how do we split rent if maya gets the big room`
- Muse reads: Will "also the lease renews in jan and rent goes to 4200"; Maya "if i keep the big
  room with the bathroom i should pay more tbh"; Aditya "and i'll pay for the parking spot".
  ROOM_4B for the rooms.
- Tool: `lab:rent-split` (new scenario `chat-rent-split`, chat land):
  ```
  title: "1820 Dwight Way", rentCents: 420000, weight: 60, bathCents: 12000, parkingCents: 7500,
  rooms: [ { name: "Maya", sqft: 180, bath: true, parking: false }, { name: "Will", sqft: 140, bath: false, parking: false },
    { name: "Aditya", sqft: 120, bath: false, parking: true }, { name: "Tsai Lin", sqft: 105, bath: false, parking: false } ],
  agreed: ["Maya"]
  ```
- Cast: +8 Aditya agrees; +14 Will "140 sq ft and a window. agreed"; Tsai Lin's agree locks it.

### C14 · Two truths tile · "make it three rounds" (change)

- Where: Gaming G4, the tool's Muse bar.
- Type: `make it three rounds`
- Muse reads: senior week messages about Calvin (older than the seeded three weeks; kept in the
  scenario's facts): Calvin, Oct 2: "aditya 5, me 0. screenshot this"; Calvin, Aug 30: "cashier
  said ‘nice try little man’"; Will, Jul 4: "he did the harmonies. all of them."
- Change: `rounds` gains:
  ```
  { about: "Calvin", lie: 0, facts: [
      { claim: "Has never lost to Aditya in FIFA", receipt: "Calvin, Oct 2: “aditya 5, me 0. screenshot this”" },
      { claim: "Got carded buying a Lunchable", receipt: "Calvin, Aug 30: “cashier said ‘nice try little man’”" },
      { claim: "Knows every word of Mamma Mia", receipt: "Will, Jul 4: “he did the harmonies. all of them.”" } ],
    guesses: [] }
  ```
- Cast: +7 Arun guesses the Lunchable; +13 Will guesses FIFA; +17 Calvin in senior week "the
  lunchable one is true and i'm at peace".

### C15 · Climbing club · "make a belay partner board for wall nights" (falls through)

- Where: G-A, the group composer's "Ask Muse".
- Type: `make a belay partner board for wall nights`
- No scenario matches (`group-signup` is shifts, not pairs). The factory builds it live with the
  page context: "Wall nights · Tue and Thu · 7 to 9 PM at the rec center wall", the gear room
  shifts, members who signed up on the pinned board (Maya, Arun, Will), dues payers.
- A good result: two columns, Tue and Thu. Each member a card with a level chip (Learning, Top
  rope, Lead) and a "Need a partner" toggle. Tap two cards to pair them; a pair shows both faces
  and locks when both tap "Checked" (a belay check). Arrives with Maya and Arun paired on Tue,
  Bea on Thu marked "Learning · need a partner", and Will on Thu "Top rope". Summary "3 pairs
  · 2 need a partner". Built in 1 to 3 s.
- Cast: +10 Arun turns on "Need a partner" for Thu; +16 Will taps Arun's card, pairing them.

### C16 · Senior week · "muse make a playlist draft for the drive, 3 songs each" (falls through)

- Where: Messenger, senior week.
- Type: `muse make a playlist draft for the drive, 3 songs each`
- No scenario matches (trip-draft, being ported, drafts plans, not songs). The factory builds
  it live from: the road trip bingo squares ("aux cord coup", "someone sings Wagon Wheel"), "the
  beach house, 212 mi", the six members, Juniper Hale songs from E1 ("Northbound", "Slow Tide",
  "Rooftops").
- A good result: a snake draft with six lanes and three rounds, a 20 s shot clock per pick,
  picks fly into the picker's lane, a "first hour" and "last hour" order at the bottom, and the
  aux order locked when 18 picks are in. Arrives with Arun's lane holding "Northbound" (he plays
  it on every pregame, per F14) and the order Arun, Will, Maya, Calvin, Aditya, Tsai Lin.
- Cast: +8 Will picks "Slow Tide"; +15 Maya picks "Wagon Wheel", "for the bingo square".

---

## D. Three-minute presenter script

One phone (or the desktop at phone width) signed in as Tsai Lin (`?as=noa`). The cast plays
everyone else; open the cast controls page on a second screen. Before starting: `bun run demo`,
cast speed "normal", Home at the top.

### 0:00 to 0:35 · Home: friends already made things

- Tap: nothing yet. Scroll slowly past F01 and F02.
- Say: "This is a normal Facebook feed for a college senior. Every card in it was made by
  friends in a group chat with Muse. This is Calvin's apartment drafting chores; Arun took
  bathrooms first."
- Scroll to F03. Say: "And Arun's bracket for late night food. The final is tied, 31 to 31."
- Tap: **Halal cart on Bancroft** in the final. The champ stamp lands; Arun's and Will's faces
  are on the winning side.
- Say: "That was a vote in a real app, not a poll. Nobody wrote code for it."

### 0:35 to 1:15 · Senior week: "pick for us"

- Tap: **Messenger**, then **senior week**. The last lines read "idk u pick", "no u pick".
- Say: "Six friends, three places, three drink ideas, two leave times and three vetoes. Nobody
  will decide."
- Type: `muse pick for us`, send.
- The card "Tonight's plan" lands with Pier Pizza, $14 cocktails and 1am struck through, each
  with who vetoed it.
- Say: "Muse read the chat. Arun is so over pier pizza, Calvin is broke, Aditya is driving."
- The cast's Maya pulls the lever about 5 s in; the reels land. Will: "ok the machine has
  spoken".
- Say: "Everyone in the chat is in the same machine, live."

### 1:15 to 1:50 · Juniper Hale: interested to going

- Tap: back, **Events**, **Juniper Hale live**.
- Tap: **Interested**. The offer appears: "Maya, Arun and Will are interested. Go together?"
- Say: "Interested is not going. Muse noticed three friends are on the fence."
- Tap: **Go together**. The card arrives with Tsai Lin and Maya going, Arun and Will maybe.
- Wait. Arun goes Going ("i'll drive 3 if we need"), then Will ("21 by then. i'm going"). At 4
  the squad locks with a stamp.
- Say: "1,403 interested became 4 going."

### 1:50 to 2:25 · The boys: who pays, then who ate what

- Tap: **Messenger**, **the boys**. On the controls page press **N** (next beat, scene 5): Calvin
  sends "night owl was $86 last night. who's got it" and the receipt photo.
- The chip "Spin for it?" appears under the photo. Tap it. The wheel arrives with slices sized
  by who paid lately; Tsai Lin's is the biggest.
- Say: "Muse offered that on its own. But I only had fries."
- Type: `muse nah split by what we ordered instead`, send.
- The same card turns into the receipt, Calvin's patty melt already claimed. Arun claims the
  short stack and strawberry shake, Aditya the grilled cheese.
- Tap: **Chili cheese fries** and **Black and white shake**. The totals update for everyone.
- Say: "You can talk to a tool to change it. Everything people did in it stays."

### 2:25 to 3:00 · The couch

- Tap: **Marketplace**, **Grey sectional couch**.
- Type in "Ask Muse": `will this fit in 4b`, send.
- The floor plan arrives with Aditya's loveseat on the long wall and the sectional in the tray.
  Aditya drags the loveseat off ("ok the sectional wins the long wall"), Maya drops the
  sectional in. It fits with 12 inches to spare.
- Tap: **Home**, scroll to F25 "Apt 4B is picking a couch". Tap **Grey sectional**. It reaches
  3 votes: bought, $45 each, pickup Sat 11am in Calvin's truck.
- Say: "Muse is never the answer, it's the thing your friends use together. Every surface,
  every group, already full of them."

If something lags: every moment above also works on a second phone signed in as Maya
(`?as=maya`) doing the cast's taps by hand.

---

## E. Coverage

### E1. Every lab tool → where it appears

56 ported tools, all used. "Seeded" means it is on screen with friends' moves when the demo
opens; "live" means it appears during an ask path or the script.

| Lab tool | Surface tag | Seeded | Live |
|---|---|---|---|
| best-of | group | Class of '27 post `t-g-bestof` | |
| bill-roulette | messenger | | C6 (the boys) |
| bracket-post | feed | F03 `t-s-dining`, late night `t-bracket` | D 0:00 |
| bring-list | event | E2 `t-cat-event-bring` | C9 fills it |
| caption-contest | messenger | senior week `t-captions`, gaming G5 | |
| chore-draft | messenger | F01 `t-s-den`, apt 4b `t-wheel`, N2 | |
| club-dues | group | Climbing club post `t-g-dues` | |
| concert | messenger | the boys `t-juniper` | |
| daily-puzzle | gaming | F17, gaming G1 `t-g-chatdle` | |
| date-swipe | messenger | F41 `t-f-formal` | C7 |
| dinner-veto | messenger | the boys `t-veto`, F40 `t-f-veto`, N1 | |
| event-carpool | event | E1 and F09 `t-cat-event-carpool`, N4 | |
| face-drop | story | F33 `t-f-faces` | |
| feed-tier-list | feed | F06 `t-cat-feed-ranking` | |
| flyer-wall | group | Class of '27 post `t-g-flyers` | |
| friend-trivia-pub | gaming | F24, gaming G2 `t-cat-game-trivia` | C11 |
| gift-pool | messenger | the boys `t-gift` | |
| grocery | messenger | apt 4b `t-groceries` | |
| group-buy | marketplace | F25 and M1 `t-f-couch` | D 2:25 |
| host-board | event | F04 and E3 `t-f-21st`, N3 | |
| kings-cup | messenger | late night `t-kings` | |
| lobby | messenger | late night `t-lobby`, gaming G7 | |
| meeting-time | group | Climbing club post `t-s-meet` | |
| member-galaxy | group | Class of '27 pinned `t-g-galaxy` | |
| move-in-day | messenger | F31 `t-f-move` | |
| move-out-sale | marketplace | F16, M5, sublets post `t-f-sale` | |
| movie-bracket | messenger | Maya DM `t-movie`, gaming G8 | |
| open-spots | event | F29 `t-f-tahoe`, E4 `t-cat-event-crag` | C9 |
| pizza | messenger | Will DM `t-pizza` | |
| plan-spinner | messenger | F38 `t-f-spinner` | |
| potluck | messenger | F37 `t-f-potluck` | |
| pregame-vote | event | E1 `t-cat-event-pregame` | |
| price-check | marketplace | M1 `t-cat-mp-price-check` | |
| reel-cook-night | reel | F13 and R4 `t-f-cook` | C10 |
| reel-to-try | reel | F34 and R8 `t-f-ramen`, R1 and Will DM `t-sx-try` | |
| rent-split | messenger | F10 `t-f-rent` | C13 |
| road-bingo | messenger | senior week `t-bingo` | |
| room-fit | marketplace | M2 `t-cat-mp-room-fit-l-loveseat` | C5, D 2:25 |
| roommate-match | group | Sublets post `t-g-roommates` | |
| semester-wrapped | story | F14 and S6 `t-f-wrapped` | |
| setlist-bingo | event | F26 `t-f-setlist` | "Use for Friday" on E1 |
| settle-up | messenger | F21 `t-f-jt`, N5 | |
| signup-board | group | Climbing club pinned `t-s-shifts` | |
| slot-machine | messenger | | C1, D 0:35 |
| split-purchase | marketplace | M9 `t-cat-mp-split-l-projector` | |
| squad-lock | event | | C2, D 1:15 |
| story-beat | story | F30 and S5 `t-f-beat` | |
| sublet-finder | group | Sublets pinned `t-cat-group-sublet-finder` | C8 |
| tab-claim | messenger | F35 `t-f-tab` | C12, D 1:50 |
| ticket-split | event | | C3, C4 |
| tier-list | messenger | Maya DM `t-study`, gaming G6 | |
| trip-lock | messenger | senior week `t-trip` | |
| trip-story | story | F20 and S4 `t-cat-story-trip` | |
| trivia-night | messenger | gaming G3 `t-g-trivianight` | |
| two-truths | messenger | gaming G4 `t-g-twotruths` | C14 |
| utilities-split | messenger | apt 4b `t-utilities` | |

Unused: none. Four tools have no seeded instance on purpose (bill-roulette, slot-machine,
squad-lock, ticket-split): they are the presenter's live moments, and a seeded copy would spoil
the reveal.

### E2. Every slot → tool

| Slot | Tool |
|---|---|
| Home feed tool posts (25) | F01 chore-draft, F03 bracket-post, F04 host-board, F06 feed-tier-list, F09 event-carpool, F10 rent-split, F13 reel-cook-night, F14 semester-wrapped, F16 move-out-sale, F17 daily-puzzle, F20 trip-story, F21 settle-up, F24 friend-trivia-pub, F25 group-buy, F26 setlist-bingo, F29 open-spots, F30 story-beat, F31 move-in-day, F33 face-drop, F34 reel-to-try, F35 tab-claim, F37 potluck, F38 plan-spinner, F40 dinner-veto, F41 date-swipe |
| Stories with a tool (3) | S4 trip-story, S5 story-beat, S6 semester-wrapped |
| Reels with a tool or offer (4) | R1 reel-to-try, R4 reel-cook-night, R5 squad-lock offer, R8 reel-to-try |
| Group pinned (3) | signup-board, sublet-finder, member-galaxy |
| Group tool posts (6) | meeting-time, club-dues, roommate-match, move-out-sale, best-of, flyer-wall |
| Listing pages (4) | M1 price-check and group-buy, M2 room-fit, M5 move-out-sale, M9 split-purchase |
| Event pages (4) | E1 event-carpool and pregame-vote, E2 bring-list, E3 host-board, E4 open-spots |
| Gaming tiles (8) | daily-puzzle, friend-trivia-pub, trivia-night, two-truths, caption-contest, tier-list, lobby, movie-bracket |
| Notifications about tools (5) | N1 dinner-veto, N2 chore-draft, N3 host-board, N4 event-carpool, N5 settle-up |
| Messenger (6 chats, 16 tools) | apt 4b: utilities-split, grocery, chore-draft. the boys: concert, gift-pool, dinner-veto. senior week: road-bingo, caption-contest, trip-lock. Maya: tier-list, movie-bracket. Will: reel-to-try, pizza. late night: bracket-post, lobby, kings-cup |
| Ask paths (16) | C1 slot-machine, C2 squad-lock, C3 ticket-split, C4 ticket-split, C5 room-fit, C6 bill-roulette, C7 date-swipe, C8 sublet-finder, C9 open-spots, C10 reel-cook-night, C11 friend-trivia-pub, C12 tab-claim, C13 rent-split, C14 two-truths, C15 live build, C16 live build |

### E3. Slots still plain, and gaps

Slots that show a library piece today because no ported lab tool fits:

| Slot | Shows today | Lab tool that fills it |
|---|---|---|
| S1 story poll "beach or hike sat?" | piece:poll (MY_POLL) | story-poll-plan, being ported (`scripts/labport/specs/story-poll-plan.md`) |
| F32 "30 days of climbing" offer (`feed-challenge`) | piece:streak | public-challenge (port landed in `5fe193b`; move it to the top of `feed-challenge`), or gym |
| R2 hike reel offer (`reel-hike`) | piece:overlap | reel-hike-plan, being ported |
| `reel-rank` scenario | piece:bracket | reel-rank, being ported |
| `story-recap` scenario | piece:recap | wrapped (port landed in `d747e66`) or semester-wrapped |
| `group-welcome` scenario | piece:recap | none; welcome-card was not picked for porting |

Pack order changes so a lab tool is first wherever one fits (`apps/shell/src/muse/pack.ts`):
`group-roommates` → lab:roommate-match; `mp-move-out` → lab:move-out-sale; `mp-pickup` →
lab:move-in-day; `feed-move` → lab:move-in-day; `feed-plan` → lab:open-spots; `event-open-spots`
→ lab:open-spots; `event-setlist` → lab:setlist-bingo; `feed-birthday` → lab:gift-pool;
`reel-cook-night` → lab:reel-cook-night on the reel page (keep piece:claims for chat land, 514 px
is over the chat budget); `reel-to-try` → lab:reel-to-try on the reel page and feed (486 px). New
scenarios: `chat-rent-split` (C13), the C4, C12 and C14 edits, the C2, C6 and C9 offers.

Gaps where no lab tool fits at all: a belay partner board (C15) and a song draft for a drive
(C16); both are the live-build paths. A welcome card for groups. An "after the show" vote
(after-vote, being ported) would replace the boys' dinner veto's second job.

Note for implementers: `apps/shell/src/muse/rich.ts` (merged from the catalysts branch while
this spec was written) already fills several scenarios with friends' moves. Where it disagrees
with this spec (Tahoe as a squad lock; group buy votes), this spec is the content to ship;
rich.ts is the place to put it.

---

## F. Conversation history

Every Messenger chat as the inbox should load it: three weeks of history, written as the group
actually talks. Files: `services/demo/seed.ts` (load each list through the protocol the way
`seed()` does today; bump `SEED_VERSION`), with the six main chats also replacing their short
lists in `apps/shell/src/store/fake-data.ts` so the fake store matches. Where B8 lists messages
for a chat, this section supersedes it; the tools and their params stay as B8 gives them.

Line format, one message per line, in order:

`NNN · dD HH:MM · sender · text` then ` · <emoji> id,id` for reactions and ` · ↩ NNN` for a
reply to that message.

- `dD` is the day offset from today (d0 is Thursday, the clock's day; d-20 is three weeks back).
  `HH:MM` is 24h local time. Seed time = `at(D, HH, MM)`.
- `sender` is a wire id (`me` is the viewer, Tsai Lin) or `system`.
- `[photo: ...]` in the text is a photo attachment; the bracket is its photo brief for the photo
  agent (send it as `kind: "photo"` with that label). `[link: site | title]` is a link card.
- A line `NNN · dD HH:MM · TOOL · t-id · Card title` inserts the system line "**Muse** built
  **Card title** for this chat" and the tool card (TOOLS in `seed.ts`). The lines just before it
  are what Muse read to build it.
- Activity lines ("**Will** took Fridge") are not listed; they come from the tool's own log.
- Six main chats: at least 150 messages each, each with its two or three tools. Four more
  one-to-one chats of 60 and two group chats of 80, no tools.

The owner asked for one-to-one chats with Calvin, Arun, Tsai Lin and Will. Tsai Lin is the
viewer, and the Will chat is already one of the six, so F9 and F10 are Aditya and Hana instead.

#### F1 · `apt4b` · apt 4b

Members: me (Tsai Lin), maya, priya (Will), dev (Aditya)
Messages: 176 (plus 3 tool lines)
Tools: `t-utilities` October utilities (d-1 21:06), `t-groceries` Groceries (d-1 23:40), `t-wheel` Chore draft (d0 09:28)

```
001 · d-20 18:42 · maya · who has the big pot
002 · d-20 18:42 · maya · the good one with the lid
003 · d-20 18:50 · dev · in my room. long story
004 · d-20 18:50 · dev · it's clean i promise
005 · d-20 18:51 · priya · why is a pot in your room aditya · 😆 maya,me
006 · d-20 18:53 · dev · ramen at 2am. didnt want to wake anyone up
007 · d-20 18:53 · me · thats actually considerate · ↩ 006
008 · d-20 18:54 · maya · ok considerate king give me the pot
009 · d-20 18:58 · dev · on your door handle · ❤️ maya
010 · d-20 22:10 · priya · is anyone else's room an oven rn
011 · d-20 22:10 · priya · the radiator in mine has one setting and it's sun
012 · d-20 22:14 · me · open the window?
013 · d-20 22:15 · priya · it's open. fan is on. still dying
014 · d-20 22:15 · priya · turning the ac on dont judge me · 😆 dev
015 · d-19 10:31 · maya · big grocery run today? we're out of everything
016 · d-19 10:44 · me · i can go at 2
017 · d-19 10:45 · dev · i'll drive
018 · d-19 10:45 · priya · get the big oat milk pls
019 · d-19 10:46 · priya · the oat kind not the almond kind
020 · d-19 10:46 · maya · writing it down
021 · d-19 16:58 · me · [photo: shopping cart piled with paper towels, produce and egg cartons in a store aisle, vertical, bright and chaotic]
022 · d-19 16:58 · me · we may have overdone it
023 · d-19 17:01 · priya · is that 48 eggs · ↩ 021
024 · d-19 17:01 · dev · protein
025 · d-19 17:30 · me · $71.40 total, $17.85 each
026 · d-19 17:31 · maya · sent
027 · d-19 17:40 · priya · sent ty
028 · d-19 18:02 · dev · sent. also cooking tonight if anyone wants stir fry · ❤️ maya,priya
029 · d-19 21:15 · maya · aditya that was so good
030 · d-19 21:15 · priya · 10/10 no notes
031 · d-19 21:16 · me · one note. there are 5 pans in the sink · 😆 priya
032 · d-19 21:18 · dev · each pan had a purpose
033 · d-19 21:18 · dev · i'll do them tomorrow
034 · d-18 11:02 · maya · ok the pans
035 · d-18 11:02 · maya · it's tomorrow
036 · d-18 11:40 · dev · on it
037 · d-18 11:52 · dev · done. sparkling
038 · d-18 11:52 · dev · [photo: clean pans stacked on a drying rack by a sunny kitchen window, vertical, proud]
039 · d-18 11:53 · priya · framing this · ❤️ dev,me
040 · d-17 19:05 · priya · is the wifi down for anyone else
041 · d-17 19:05 · maya · yes and i have a draft due at midnight
042 · d-17 19:06 · me · restarting the router
043 · d-17 19:09 · me · try now
044 · d-17 19:09 · maya · ur a hero · ❤️ me
045 · d-17 19:10 · dev · it was the router being dramatic
046 · d-16 13:20 · me · halloween: maya and i are at joshua tree for the weekend
047 · d-16 13:20 · me · will aditya are you doing anything here
048 · d-16 13:22 · priya · the den is doing a thing sat
049 · d-16 13:22 · priya · calvin said costumes are mandatory
050 · d-16 13:25 · dev · i'm going as a pan · 😆 me,priya,maya
051 · d-16 13:30 · me · ok poll. who takes the trash out before we leave
052 · d-16 13:30 · me · 1 will 2 aditya 3 me 4 maya
053 · d-16 13:31 · priya · 3
054 · d-16 13:31 · dev · 3
055 · d-16 13:35 · me · wow ok
056 · d-16 15:10 · me · maya??
057 · d-16 18:44 · maya · sorry what poll
058 · d-16 18:44 · priya · classic maya · ↩ 057 · 😆 dev,me
059 · d-16 18:45 · maya · i vote 3 too
060 · d-15 22:30 · maya · packing list for jt: headlamp, chalk, 3 layers, snacks
061 · d-15 22:31 · me · and the club crash pad
062 · d-15 22:31 · maya · arun said he's bringing pads
063 · d-15 22:32 · me · perfect then just layers
064 · d-14 07:15 · me · leaving in 10. trash is out btw
065 · d-14 07:16 · priya · ty · ❤️ me
066 · d-14 07:16 · dev · drive safe, text when you're there
067 · d-14 12:48 · maya · here
068 · d-14 12:48 · maya · [photo: joshua trees and big round boulders under a hard blue sky, horizontal, wide and empty]
069 · d-14 12:49 · dev · unreal
070 · d-14 12:50 · priya · jealous. it's raining here
071 · d-13 21:40 · me · [photo: camp stove with a pot and two headlamps glowing on a picnic table at night, vertical, cozy]
072 · d-13 21:40 · me · hana made tacos on a camp stove
073 · d-13 21:41 · priya · ok that's actually amazing
074 · d-13 23:58 · dev · how's halloween in the desert
075 · d-13 23:59 · maya · we saw a coyote. scariest costume of the night · 😆 dev,priya
076 · d-12 00:20 · priya · the den party was great btw
077 · d-12 00:20 · priya · aditya won best costume as a pan
078 · d-12 00:21 · priya · [photo: frying pan costume made of a cardboard circle and foil lying on a couch, vertical, silly]
079 · d-12 00:21 · me · LEGEND · ❤️ dev
080 · d-12 00:22 · dev · the handle was a paper towel roll. engineering
081 · d-11 18:30 · maya · home. i smell like a campfire
082 · d-11 18:31 · maya · doing laundry, tell me if you need a load in
083 · d-11 18:32 · priya · my towels pls 🙏
084 · d-11 18:40 · me · mine too
085 · d-10 14:05 · maya · my bio prof extended the problem set
086 · d-10 14:05 · maya · best person alive
087 · d-9 23:12 · priya · ok who sat on the couch hard
088 · d-9 23:12 · priya · there's a noise now
089 · d-9 23:14 · dev · it's been making that noise for a week
090 · d-9 23:14 · me · it squeaks on the left side
091 · d-9 23:15 · priya · it groans. it's different
092 · d-8 20:47 · maya · the couch has claimed its first victim
093 · d-8 20:47 · maya · [photo: worn brown couch cushion with a metal spring poking through the fabric, horizontal, dim lamp light]
094 · d-8 20:48 · dev · rip · 😢 priya
095 · d-8 20:48 · priya · it was older than all of us combined
096 · d-8 20:50 · me · we need a new one before friendsgiving
097 · d-8 20:50 · me · 11 people are not sitting on that
098 · d-8 20:52 · maya · marketplace hunt?
099 · d-8 20:52 · dev · i'll measure the walls
100 · d-8 21:10 · dev · long wall 104 in. window wall 80. by the door 62
101 · d-8 21:11 · priya · why do you have a tape measure · ↩ 100
102 · d-8 21:11 · dev · i always have a tape measure
103 · d-7 12:30 · me · friendsgiving: sat the 14th, 6pm, here. making the event now
104 · d-7 12:30 · me · maya your mom's turkey yes?
105 · d-7 12:45 · maya · yes she's already sending me voice memos about it · 😆 me
106 · d-7 12:46 · priya · i'll do pumpkin pie
107 · d-7 12:47 · dev · i'll do... chips? i shouldn't cook for 11
108 · d-7 12:47 · me · you can cook. you just get 2 pans max · 😆 priya,maya
109 · d-7 12:48 · dev · 3
110 · d-7 12:48 · me · 2
111 · d-6 01:04 · priya · anyone awake
112 · d-6 01:04 · priya · i can hear the fridge thinking
113 · d-6 01:06 · dev · awake. essay
114 · d-6 01:06 · me · awake. econ
115 · d-6 01:07 · priya · we should all work in the kitchen
116 · d-6 01:07 · dev · coming
117 · d-6 01:08 · me · bring the good snacks
118 · d-6 01:30 · maya · why are all of you in the kitchen at 1:30
119 · d-6 01:30 · maya · i can hear you laughing
120 · d-6 01:31 · priya · come join study hall · ↩ 119
121 · d-6 01:31 · maya · omw
122 · d-5 17:20 · dev · also need a mini fridge for my room
123 · d-5 17:20 · dev · gonna ask on fb
124 · d-5 17:24 · priya · for your pans · 😆 me
125 · d-4 10:00 · priya · rae is flying in thursday for my birthday!!
126 · d-4 10:00 · priya · she's staying in my room
127 · d-4 10:02 · maya · RAE. finally · ❤️ priya
128 · d-4 10:03 · me · we'll clean the bathroom for her
129 · d-4 10:03 · dev · we'll clean the bathroom (we will try) · 😆 priya
130 · d-3 19:44 · me · couch listings. grey sectional $180, green velvet loveseat $120, futon $60
131 · d-3 19:44 · me · [link: marketplace.example | Grey sectional couch · $180]
132 · d-3 19:45 · maya · sectional. we fit all 4 for movie night
133 · d-3 19:46 · dev · velvet is rich roommate energy
134 · d-3 19:46 · priya · futon is $60 and that's all i'll say
135 · d-3 19:48 · me · calvin said his truck is free sat at 11 if we pick one
136 · d-3 19:49 · maya · ok we vote this week
137 · d-2 08:10 · dev · 1 year ago today we left for big sur
138 · d-2 08:10 · dev · [photo: winding coastal highway along cliffs over the ocean in morning light, horizontal, nostalgic]
139 · d-2 08:15 · maya · NEPENTHE · ❤️ dev,priya
140 · d-2 08:16 · priya · i posted 11 stories that weekend and i regret nothing
141 · d-2 08:17 · me · we have to go back
142 · d-2 18:20 · priya · ok who's coming to the den thursday for my 21st (all of you, rhetorical)
143 · d-2 18:21 · maya · obviously
144 · d-2 18:21 · dev · there after my problem set
145 · d-2 18:22 · me · pizza here first with rae right
146 · d-2 18:22 · priya · yes. i'll order
147 · d-1 21:02 · maya · electric bill came. $142??
148 · d-1 21:03 · dev · who is running the ac 24/7
149 · d-1 21:04 · priya · its 90 degrees in my room ok · 😆 dev
150 · d-1 21:05 · me · then you get the overage lol
151 · d-1 21:06 · TOOL · t-utilities · October utilities
152 · d-1 21:20 · priya · fair. i'll take the overage, the sauna is mine · ❤️ maya
153 · d-1 23:20 · priya · who ate my oat milk
154 · d-1 23:20 · priya · i swear to god
155 · d-1 23:21 · maya · not me i literally cant have it
156 · d-1 23:23 · dev · ok it was me
157 · d-1 23:23 · dev · i'll replace it
158 · d-1 23:24 · me · he says that every time · 😆 priya,maya
159 · d-1 23:26 · priya · you said that about the tupperware · ↩ 157 · 😆 dev,me
160 · d-1 23:38 · priya · also we have 1 egg and no tp. we need a real run
161 · d-1 23:40 · TOOL · t-groceries · Groceries
162 · d-1 23:52 · dev · i'll go after my 10am. oat milk first, i owe you
163 · d-1 23:53 · priya · the oat kind · ↩ 162
164 · d-1 23:53 · dev · the oat kind
165 · d0 08:40 · priya · 21 in 15 hours
166 · d0 08:41 · maya · birthday eve!! · ❤️ priya
167 · d0 09:12 · maya · ok who's on dishes this week
168 · d0 09:12 · maya · the sink is a biohazard
169 · d0 09:13 · maya · [photo: kitchen sink piled with dirty dishes and a frying pan, vertical, morning light] · 😮 me,dev
170 · d0 09:15 · me · thats not even mine
171 · d0 09:15 · me · thats adityas pan from sunday
172 · d0 09:16 · dev · allegedly · 😆 maya
173 · d0 09:20 · priya · lease says shared stuff is on all of us btw
174 · d0 09:20 · priya · [link: housing.example | Shared spaces: what you owe your roommates]
175 · d0 09:28 · TOOL · t-wheel · Chore draft
176 · d0 09:30 · me · ok fine draft it · ❤️ maya
177 · d0 09:36 · priya · also the lease renews in jan and rent goes to 4200
178 · d0 09:37 · maya · if i keep the big room with the bathroom i should pay more tbh
179 · d0 09:37 · dev · and i'll pay for the parking spot
```

Notes: 147 to 150, 153 to 160, 167 to 174, 176 are the existing seeded lines (renamed). Messages
Muse read for each tool: `t-utilities` 147 to 150, `t-groceries` 153 to 160 (and 018 to 019 for
"the oat kind"), `t-wheel` 167 to 174. "**Will** took Fridge" at d0 09:31 is derived from the tool log.

#### F4 · `maya` · Maya Chen

Members: me (Tsai Lin), maya
Messages: 158 (plus 2 tool lines)
Tools: `t-study` Study spot tier list (d0 08:57), `t-movie` Movie night bracket (d0 09:05)

```
001 · d-20 09:02 · maya · are you at the library
002 · d-20 09:02 · maya · i took the 3rd floor window table
003 · d-20 09:10 · me · omw. save me the outlet
004 · d-20 09:10 · maya · the outlet is mine. you get the vibes
005 · d-20 09:11 · me · bringing the extension cord then
006 · d-20 09:11 · maya · genius · ❤️ me
007 · d-20 13:40 · maya · lunch? i've read the same paragraph 4 times
008 · d-20 13:41 · me · crossroads?
009 · d-20 13:41 · maya · pesto is tuesdays only. it's friday
010 · d-20 13:42 · me · union then
011 · d-20 13:42 · maya · ok meet at the stairs
012 · d-19 20:15 · maya · did you see the club email about jt
013 · d-19 20:16 · me · yes!! hana booked the airbnb
014 · d-19 20:16 · maya · are we driving with kofi or arun
015 · d-19 20:20 · me · arun, he has the pads
016 · d-19 20:20 · maya · ok putting us in his car
017 · d-18 16:03 · maya · thesis question
018 · d-18 16:03 · maya · is it bad if my intro is longer than my conclusion
019 · d-18 16:05 · me · how much longer
020 · d-18 16:05 · maya · 4 pages
021 · d-18 16:06 · me · maya
022 · d-18 16:06 · maya · i know
023 · d-18 16:07 · maya · i'll cut it · 😆 me
024 · d-18 23:40 · maya · cut 2 pages. feel lighter
025 · d-18 23:41 · me · proud of you · ❤️ maya
026 · d-17 10:20 · maya · bio set 6 is out
027 · d-17 10:20 · maya · question 3 is a war crime
028 · d-17 10:30 · me · haven't looked yet. scared now
029 · d-17 10:31 · maya · be scared
030 · d-17 17:45 · me · ok question 3 is fine actually
031 · d-17 17:45 · me · it's just question 2 backwards
032 · d-17 17:46 · maya · WHAT
033 · d-17 17:46 · maya · explain at the library tmrw · ↩ 031
034 · d-16 14:00 · maya · library?
035 · d-16 14:00 · maya · i'm here
036 · d-16 14:25 · me · 5 min, bus is late
037 · d-16 14:26 · maya · the bus is always late
038 · d-16 14:31 · me · here. where
039 · d-16 14:31 · maya · window table. i'm wearing the green sweater
040 · d-16 18:02 · maya · thank u for question 3. you're a better teacher than my ta · ❤️ me
041 · d-16 18:03 · me · lol ok one rule: you explain question 5 to me
042 · d-16 18:03 · maya · deal
043 · d-15 21:12 · maya · what are you packing for jt
044 · d-15 21:13 · me · the puffy, 2 fleeces, the beanie
045 · d-15 21:13 · maya · it's going to be 40 at night
046 · d-15 21:14 · me · 3 fleeces then
047 · d-15 21:14 · maya · i'm bringing my sleeping bag liner. you can borrow mine
048 · d-15 21:15 · me · you're the best
049 · d-14 06:58 · maya · up?
050 · d-14 06:59 · me · up. coffee in 5
051 · d-14 07:00 · maya · i'll be in the car
052 · d-13 22:30 · maya · [photo: starry desert sky above a dark ridge, horizontal, still and cold]
053 · d-13 22:30 · maya · sent you the good one
054 · d-13 22:31 · me · this is my lock screen now · ❤️ maya
055 · d-12 09:10 · maya · my hands are destroyed
056 · d-12 09:10 · maya · i love it here
057 · d-12 09:15 · me · same. arun sent the first one clean btw
058 · d-12 09:16 · maya · he's so calm on the rock it's unfair
059 · d-11 19:05 · maya · home. showering for an hour
060 · d-11 19:06 · me · same. then sleep for 12
061 · d-10 11:00 · maya · mom called about friendsgiving
062 · d-10 11:00 · maya · she wants to know how many people. like exactly
063 · d-10 11:02 · me · rn 9? could be 11 if rae and hana come
064 · d-10 11:02 · maya · she'll say 14 lbs turkey for 11
065 · d-10 11:03 · me · that sounds right honestly
066 · d-10 11:03 · maya · she also wants me to brine it
067 · d-10 11:04 · maya · in what. our bathtub?
068 · d-10 11:04 · me · we have a cooler
069 · d-10 11:05 · maya · the cooler. ok. you're a genius again · 😆 me
070 · d-9 15:30 · maya · library at 3?
071 · d-9 16:45 · maya · ok you're not coming
072 · d-9 16:50 · me · sorry!! econ office hours ran long
073 · d-9 16:50 · me · tomorrow for real
074 · d-9 16:51 · maya · tomorrow for real · ↩ 073
075 · d-8 14:02 · me · here. physics library today, it's quiet
076 · d-8 14:03 · maya · the physics library is a cave
077 · d-8 14:03 · me · a quiet cave
078 · d-8 14:04 · maya · fine. coming
079 · d-8 17:30 · maya · ok it's a nice cave
080 · d-8 17:30 · me · told you
081 · d-8 21:02 · maya · did you see the couch
082 · d-8 21:02 · maya · i didn't mean to break it i sat down normal
083 · d-8 21:03 · me · it was time. it was 40 years old
084 · d-8 21:04 · maya · rest in peace brown couch
085 · d-7 12:20 · me · can you co-host friendsgiving with me
086 · d-7 12:20 · me · you're the turkey person i'm the everything else person
087 · d-7 12:21 · maya · yes obviously
088 · d-7 12:22 · maya · i'll do the turkey and the playlist
089 · d-7 12:22 · me · i'll make the event and a bring list
090 · d-7 12:23 · maya · make sure aditya doesn't sign up for 4 things again
091 · d-7 12:23 · me · he's on chips this year
092 · d-7 12:24 · maya · lol ok
093 · d-6 01:40 · maya · that kitchen study hall was so fun
094 · d-6 01:40 · maya · we should do it every week
095 · d-6 01:42 · me · wednesday kitchen hours
096 · d-6 01:42 · maya · official · ❤️ me
097 · d-5 10:15 · maya · ok question. what are you wearing to juniper
098 · d-5 10:16 · me · the jacket probably
099 · d-5 10:16 · maya · the jacket is perfect
100 · d-5 10:17 · maya · i have my outfit planned already. don't tell anyone
101 · d-5 10:17 · me · everyone knows maya
102 · d-5 10:18 · maya · ok fair · 😆 me
103 · d-4 13:12 · maya · i'm driving to juniper btw. the civic fits 4
104 · d-4 13:13 · me · will has shotgun, it's his birthday weekend
105 · d-4 13:13 · maya · obviously. you get the good back seat
106 · d-4 18:40 · maya · what are we getting will
107 · d-4 18:41 · me · calvin's doing a gift pool. record player
108 · d-4 18:41 · maya · YES he's said that like 5 times
109 · d-4 18:42 · maya · i'll chip in. venmo calvin?
110 · d-4 18:42 · me · it's in the boys chat, i'll put you on it
111 · d-3 20:01 · maya · ok the sectional
112 · d-3 20:01 · maya · i know it's $180
113 · d-3 20:02 · maya · but it fits all 4 of us AND guests
114 · d-3 20:03 · me · i'm leaning sectional too
115 · d-3 20:03 · me · aditya has to measure it against the long wall
116 · d-3 20:04 · maya · he already did. he has a tape measure on him at all times
117 · d-3 20:04 · me · lol that's true
118 · d-2 08:30 · maya · big sur was a year ago today
119 · d-2 08:30 · maya · [photo: waterfall falling onto a small sandy cove from a cliff, vertical, golden afternoon]
120 · d-2 08:31 · me · mcway falls. twice
121 · d-2 08:31 · maya · the short hike, twice. we are athletes
122 · d-2 08:32 · me · let's go back over winter break
123 · d-2 08:32 · maya · YES. tell aditya
124 · d-2 14:10 · maya · library? i'm writing the results section
125 · d-2 14:11 · me · 3rd floor?
126 · d-2 14:11 · maya · 3rd floor always
127 · d-2 19:20 · maya · results done. i might cry
128 · d-2 19:20 · me · you're so close · ❤️ maya
129 · d-1 20:40 · maya · did u finish the bio problem set
130 · d-1 20:44 · me · half. stuck on 4
131 · d-1 20:44 · maya · same lol. library tmrw?
132 · d-1 20:50 · me · yeah 2?
133 · d-1 20:51 · maya · 2. i'll bring snacks
134 · d-1 22:15 · maya · wait thesis draft is in
135 · d-1 22:15 · maya · i submitted it
136 · d-1 22:16 · me · MAYA
137 · d-1 22:16 · me · so proud · ❤️ maya
138 · d-1 22:17 · maya · posting about it and then sleeping for 3 days
139 · d-1 22:18 · me · you have a party tomorrow night
140 · d-1 22:18 · maya · sleeping for 3 days after the party
141 · d0 01:12 · maya · can't sleep. too happy
142 · d0 01:12 · maya · also question 4 is impossible
143 · d0 01:14 · me · it's the same trick as 3
144 · d0 01:14 · me · reverse it
145 · d0 01:16 · maya · oh my god
146 · d0 01:16 · maya · ok sleeping now for real
147 · d0 08:55 · maya · see you at 2
148 · d0 08:55 · maya · bring the charger pls
149 · d0 08:56 · maya · ok but where. 3rd floor main stacks is S tier and i will die on it
150 · d0 08:57 · me · physics library is S and it's not close
151 · d0 08:57 · TOOL · t-study · Study spot tier list
152 · d0 08:58 · maya · ranked. fight me
153 · d0 09:01 · me · our kitchen table at D is a choice · ↩ 152
154 · d0 09:02 · maya · the kitchen table has the sink next to it. you saw the sink
155 · d0 09:02 · me · fair · 😆 maya
156 · d0 09:05 · maya · also movie on the wall after friendsgiving. i pulled everyone's picks from 4b
157 · d0 09:05 · TOOL · t-movie · Movie night bracket
158 · d0 09:08 · me · paddington in round 1 is cheating
159 · d0 09:08 · maya · paddington is never cheating
160 · d0 09:09 · maya · charger. don't forget
```

Notes: 129 to 132 and 147 to 148 are the existing seeded lines. Messages Muse read: `t-study`
149 to 150 (and 075 to 080 for "physics library"), `t-movie` 156 plus the picks from the apt 4b
chat.
"**Maya** picked Paddington 2" at d0 09:06 is derived from the tool log.

#### F2 · `boys` · the boys

Members: me (Tsai Lin), dev (Aditya), jonah (Calvin), theo (Arun)
Messages: 158
Tools: t-juniper "Juniper Hale seats" (d0 09:25), t-gift "Gift pool" (d0 09:29), t-veto "After Juniper food" (d0 09:34)

```
001 · d-20 19:12 · jonah · fifa tonight?
002 · d-20 19:12 · jonah · den has snacks
003 · d-20 19:30 · dev · after 9, i have a lab report
004 · d-20 19:31 · theo · im in
005 · d-20 19:31 · theo · bringing my own controller this time
006 · d-20 19:33 · jonah · the left stick on mine is fine
007 · d-20 19:33 · theo · it drifts to the corner flag every time · 😆 dev,me
008 · d-20 19:40 · me · i'll come watch, i have readings
009 · d-20 19:40 · jonah · legend
010 · d-20 23:48 · dev · 3-1. calvin carried
011 · d-20 23:48 · dev · [photo: tv screen showing a final score in a dim living room, landscape, cozy late night]
012 · d-20 23:49 · jonah · no one carried. it was a team effort · ↩ 010
013 · d-20 23:49 · theo · night owl?
014 · d-20 23:50 · me · night owl
015 · d-20 23:50 · jonah · night owl
016 · d-20 23:51 · dev · night owl. i'll drive
017 · d-19 00:46 · theo · that patty melt fixed something in me
018 · d-19 00:47 · me · we go there after everything
019 · d-19 00:47 · jonah · it's tradition now · 👍 theo
020 · d-18 08:58 · theo · gym anyone
021 · d-18 08:59 · jonah · its 9am arun
022 · d-18 09:00 · theo · thats when the gym is empty
023 · d-18 12:15 · dev · ok joshua tree. who's actually going
024 · d-18 12:16 · theo · me. hana booked the airbnb
025 · d-18 12:16 · me · me too, climbing club crew
026 · d-18 12:20 · jonah · i have a midterm the monday after
027 · d-18 12:20 · jonah · next time for sure
028 · d-18 12:21 · dev · same, lab weekend. send pics
029 · d-18 12:22 · theo · bringing the crash pad rental
030 · d-17 21:05 · jonah · truck heater update
031 · d-17 21:05 · jonah · it works if you hit the dash twice
032 · d-17 21:06 · dev · that's not working, that's negotiating · 😆 theo,me
033 · d-17 21:07 · jonah · it's a relationship
034 · d-16 17:40 · me · halloween costumes?
035 · d-16 17:41 · theo · group costume or im not going
036 · d-16 17:43 · dev · mario kart. i call luigi
037 · d-16 17:43 · jonah · i'll be the banana
038 · d-16 17:44 · me · calvin as the banana is perfect · ↩ 037
039 · d-16 17:44 · jonah · i know
040 · d-16 17:50 · theo · im toad then
041 · d-16 17:51 · me · i'll do princess peach, i have a pink dress from formal
042 · d-16 17:51 · dev · that's the whole cast
043 · d-15 22:10 · theo · [photo: four cardboard go-kart costumes leaning on a couch, portrait, messy and fun]
044 · d-15 22:10 · theo · the karts are done
045 · d-15 22:11 · jonah · arun you made these??
046 · d-15 22:11 · theo · 3 hours and a hot glue gun
047 · d-15 22:12 · dev · legend behavior · 🔥 jonah,me
048 · d-15 22:12 · jonah · that's my word · ↩ 047
049 · d-14 01:32 · dev · best costume at the party btw
050 · d-14 01:33 · me · someone asked if we were a real band
051 · d-14 01:33 · theo · we should start one
052 · d-14 01:34 · jonah · night owl in costume?
053 · d-14 01:34 · dev · already parking
054 · d-14 02:20 · me · the waitress took a photo of us
055 · d-14 02:20 · me · [photo: four paper go-kart costumes piled on a diner booth seat, landscape, warm neon light]
056 · d-14 02:21 · jonah · we're on the wall now, calling it
057 · d-13 10:05 · theo · leaving for joshua tree at 2
058 · d-13 10:06 · dev · drive safe. send the stars
059 · d-12 21:40 · theo · [photo: night sky full of stars over desert rocks, landscape, quiet and huge]
060 · d-12 21:40 · theo · no filter
061 · d-12 21:42 · jonah · ok i regret the midterm
062 · d-12 21:43 · me · it was so cold. hana's tent came down twice
063 · d-12 21:44 · dev · next year all of us
064 · d-10 13:10 · jonah · tahoe. weekend of feb 7
065 · d-10 13:10 · jonah · cabin sleeps 8. i'll put the deposit down
066 · d-10 13:12 · dev · in
067 · d-10 13:15 · theo · in. jules and omar too
068 · d-10 13:20 · me · checking my schedule, maybe
069 · d-10 13:20 · jonah · i'll post the last 2 spots
070 · d-10 13:21 · jonah · driving the truck up. heater will be fixed by then
071 · d-10 13:21 · theo · it will not · 😆 dev,me
072 · d-9 19:00 · dev · juniper hale tickets go on sale thursday
073 · d-9 19:01 · me · will is obsessed with her right now
074 · d-9 19:02 · jonah · it's the day after his birthday. we have to
075 · d-9 19:03 · theo · i'm in if it's not front rows money
076 · d-8 23:58 · jonah · wait who's watching the game friday
077 · d-8 23:59 · theo · thats next friday
078 · d-8 23:59 · jonah · oh
079 · d-7 08:59 · theo · gym
080 · d-7 09:00 · dev · we know · 😆 jonah
081 · d-7 09:00 · theo · dont ask
082 · d-6 18:20 · me · is anyone at the wall tonight
083 · d-6 18:45 · theo · after 8
084 · d-6 18:46 · me · i'll save you the orange route
085 · d-6 22:30 · theo · smoke & barrel after. bea paid, claim your stuff on her post
086 · d-6 22:31 · me · ribs and banana pudding are yours i saw it · ↩ 085
087 · d-6 22:31 · theo · no regrets
088 · d-5 20:15 · jonah · fifa rematch. aditya you owe me one
089 · d-5 20:15 · dev · i owe you nothing, we drew
090 · d-5 20:16 · jonah · 2-2 is a moral loss for both of us
091 · d-5 20:20 · theo · i'll ref
092 · d-5 23:52 · dev · 4-2 me. calvin took it well
093 · d-5 23:53 · jonah · i'm happy for you. genuinely
094 · d-5 23:53 · jonah · rematch next week
095 · d-5 23:54 · theo · night owl?
096 · d-5 23:54 · me · it's tuesday
097 · d-5 23:55 · theo · night owl doesn't care what day it is · 👍 jonah,dev
098 · d-4 14:00 · jonah · ok real talk. will's 21st
099 · d-4 14:01 · jonah · thursday night at the den, countdown on the roof at midnight
100 · d-4 14:02 · dev · love it. string lights?
101 · d-4 14:02 · jonah · got 3 boxes from the hardware store
102 · d-4 14:03 · theo · i'll do the door. we can't fit 60 people on that roof
103 · d-4 14:04 · me · cap it at 40
104 · d-4 14:05 · jonah · arun on door, 40 cap. legend
105 · d-4 14:06 · me · rae is flying in for it btw. lands thursday at 6
106 · d-4 14:06 · dev · will is going to be so happy
107 · d-3 10:30 · dev · gift ideas for will?
108 · d-3 10:45 · me · he keeps sending me record player listings
109 · d-3 10:46 · jonah · let me find it. he said something in september
110 · d-3 10:50 · theo · a record player and one juniper hale record
111 · d-3 10:51 · dev · that's the one
112 · d-2 21:10 · jonah · wes is moving sunday. he needs hands for a couch
113 · d-2 21:12 · theo · omar and kev are on it already
114 · d-2 21:13 · dev · i can do the tv. careful hands
115 · d-2 21:13 · jonah · legend
116 · d-2 21:30 · me · is calvin's truck free saturday? apt 4b might need it for a couch
117 · d-2 21:31 · jonah · free at 11. heater optional
118 · d-2 21:31 · me · it's 2 miles we'll survive
119 · d-1 13:05 · theo · tickets on sale tomorrow 10am
120 · d-1 13:06 · dev · alarm set
121 · d-1 13:06 · jonah · alarm set
122 · d-1 13:07 · me · alarm set and a backup alarm
123 · d-1 18:02 · jonah · anyone going to the game friday
124 · d-1 18:03 · theo · depends who's driving
125 · d-1 18:03 · theo · not me
126 · d-1 18:05 · dev · i can drive if someone covers gas
127 · d-1 18:06 · me · ill cover gas
128 · d-1 18:06 · jonah · legend · ❤️ me
129 · d-1 18:07 · dev · it's at 3 so we're back way before juniper
130 · d-1 18:08 · theo · perfect
131 · d-1 23:41 · jonah · roof is swept
132 · d-1 23:41 · jonah · [photo: empty rooftop at night with unlit string lights coiled on a chair, portrait, calm before a party]
133 · d-1 23:42 · me · it looks so good already
134 · d-1 23:44 · theo · door list is at 36. we're fine
135 · d-1 23:45 · dev · going to bed. lab at 8
136 · d-1 23:45 · jonah · good night king
137 · d0 01:58 · theo · cant sleep. thinking about the bracket
138 · d0 01:58 · theo · halal cart vs lupe's is tied
139 · d0 02:01 · jonah · it's late night chat business · ↩ 138
140 · d0 02:01 · theo · true. goodnight
141 · d0 09:22 · jonah · bro its 9am why are you all awake
142 · d0 09:22 · theo · gym
143 · d0 09:23 · theo · dont ask · 😆 jonah,me
144 · d0 09:24 · theo · [link: Fri at 8:00 PM | Juniper Hale live · Meridian Hall · 84 going]
145 · d0 09:24 · theo · we're going right
146 · d0 09:25 · TOOL · t-juniper · Juniper Hale seats
147 · d0 09:26 · dev · if it's under $60 im in
148 · d0 09:27 · jonah · 103 has 8 together. that's us
149 · d0 09:29 · jonah · ok will's gift. he said he'd die for a record player in september
150 · d0 09:29 · jonah · $20 each, 9 of us with maya, rae, jules, hana and omar
151 · d0 09:29 · TOOL · t-gift · Gift pool
152 · d0 09:30 · theo · sent
153 · d0 09:31 · dev · sent. he's going to cry · ❤️ jonah,me
154 · d0 09:33 · dev · food after the show tmrw? night owl or lupe's, both open late
155 · d0 09:34 · theo · anything but pier pizza. im so over it · 😆 dev
156 · d0 09:34 · jonah · halal cart is right there tho
157 · d0 09:34 · TOOL · t-veto · After Juniper food
158 · d0 09:35 · jonah · veto fast before i change my mind
```

Notes: 123 to 128, 141 to 146 and 149 to 157 are the existing and B8 lines, verbatim. The
activity lines ("**Arun** took a seat in 103", "**Arun** vetoed Pier Pizza") are derived live from
the tools' own logs and are not seeded as messages. The game on Friday is at 3 PM (129), so it does
not clash with Juniper Hale at 8.

#### F6 · `latenight` · late night

Members: theo (Arun), jonah (Calvin), dev (Aditya). Tsai Lin is not a member; Arun's note "Join"
adds Tsai Lin live.
Messages: 156
Tools: t-bracket "Best late night food in Eastfield" (d0 01:03), t-lobby "Who's on tonight" (d0 01:22), t-kings "King's cup" (d0 01:31)

```
001 · d-20 19:00 · system · **Arun** named the group **late night**
002 · d-20 23:14 · theo · smash at the den?
003 · d-20 23:14 · jonah · already plugged in
004 · d-20 23:20 · dev · 20 min, finishing a problem set
005 · d-20 23:21 · theo · we'll warm up
006 · d-19 01:12 · dev · ok who's actually best at this
007 · d-19 01:12 · jonah · me
008 · d-19 01:12 · theo · me
009 · d-19 01:13 · dev · we need a ranking
010 · d-19 01:15 · theo · one more game then we decide
011 · d-19 01:58 · jonah · that was 6 more games
012 · d-19 01:58 · theo · and nothing was decided · 😆 dev
013 · d-19 02:01 · dev · halal cart?
014 · d-19 02:01 · jonah · lupe's is closer
015 · d-19 02:02 · theo · halal cart is open later
016 · d-19 02:02 · jonah · lupe's has the al pastor
017 · d-19 02:03 · dev · we'll do both and settle it
018 · d-19 02:40 · dev · [photo: two foil-wrapped takeout boxes on a curb under a streetlight, portrait, late and happy]
019 · d-19 02:41 · theo · still halal
020 · d-19 02:41 · jonah · still lupe's
021 · d-18 23:30 · jonah · gerald is drooping
022 · d-18 23:31 · theo · jules is in the library, who's watering him
023 · d-18 23:31 · jonah · [photo: a potted plant with drooping leaves on a windowsill at night, portrait, slightly sad]
024 · d-18 23:33 · dev · half a cup. not more. jules was very specific
025 · d-18 23:34 · jonah · half a cup administered
026 · d-18 23:50 · jonah · he looks better already
027 · d-18 23:51 · theo · gerald is resilient · ❤️ jonah
028 · d-17 00:42 · theo · smash tonight?
029 · d-17 00:43 · jonah · it's 12:42
030 · d-17 00:43 · theo · so tonight
031 · d-17 00:44 · dev · omw
032 · d-17 01:50 · dev · ok i'm officially a fox main now
033 · d-17 01:51 · jonah · you were a fox main yesterday too
034 · d-17 01:51 · dev · now it's official
035 · d-17 01:52 · theo · one more game
036 · d-17 02:30 · jonah · arun said one more game 40 min ago · ↩ 035
037 · d-17 02:31 · theo · it was a long game
038 · d-15 23:22 · dev · omar got an offer?? he told me in the hallway
039 · d-15 23:23 · theo · lakeside labs. starts july
040 · d-15 23:23 · jonah · lab partner of the year
041 · d-15 23:24 · theo · that's what i'm putting on his cake
042 · d-15 23:25 · dev · we should do something
043 · d-15 23:26 · jonah · cake at will's party. we'll share
044 · d-14 00:58 · jonah · night owl or halal
045 · d-14 00:59 · theo · we're in costumes
046 · d-14 00:59 · dev · night owl took a photo of us last time in costumes
047 · d-14 01:00 · jonah · night owl it is
048 · d-12 23:45 · dev · arun how's joshua tree
049 · d-12 23:59 · theo · [photo: a small campfire with a pot of water on a grate, landscape, cold desert night]
050 · d-12 23:59 · theo · freezing and perfect
051 · d-11 00:01 · jonah · bring back a rock
052 · d-11 00:02 · theo · park rules. i'm bringing back a photo of a rock
053 · d-10 23:40 · jonah · tahoe group is growing. 6 in
054 · d-10 23:41 · dev · do we need snow chains
055 · d-10 23:42 · jonah · kofi has chains apparently
056 · d-10 23:42 · theo · kofi has everything
057 · d-9 01:10 · theo · ok smash ranking attempt #2
058 · d-9 01:11 · theo · 1 me 2 calvin 3 aditya 4 omar
059 · d-9 01:11 · dev · 1 me 2 arun 3 calvin 4 omar
060 · d-9 01:12 · jonah · 1 me 2 me 3 me
061 · d-9 01:12 · theo · omar is 4 in every list lol · 😆 dev,jonah
062 · d-9 01:13 · jonah · omar wasn't even playing tonight
063 · d-9 01:13 · dev · he's 4 in spirit
064 · d-9 01:20 · theo · one more game to settle it
065 · d-9 02:05 · dev · nothing settled again
066 · d-9 02:06 · jonah · we need a real ranking system
067 · d-9 02:06 · theo · elo
068 · d-9 02:07 · dev · we're not doing math at 2am
069 · d-7 23:15 · jonah · gerald has a new leaf
070 · d-7 23:15 · jonah · [photo: close-up of a new green leaf unfurling on a houseplant, portrait, bright and hopeful]
071 · d-7 23:16 · dev · the half cup worked
072 · d-7 23:17 · theo · we raised him · 🌱 jonah,dev
073 · d-6 00:30 · dev · halal or lupe's. final answer each
074 · d-6 00:31 · theo · halal
075 · d-6 00:31 · jonah · lupe's
076 · d-6 00:32 · dev · i'm a swing voter
077 · d-6 00:32 · theo · the swing voter has never swung
078 · d-6 00:33 · dev · donuts. dough bros
079 · d-6 00:33 · jonah · chaos
080 · d-5 01:40 · theo · fifa or smash tonight
081 · d-5 01:41 · jonah · fifa is for the boys chat
082 · d-5 01:41 · theo · fair. smash
083 · d-5 01:42 · dev · i have an 8am
084 · d-5 01:42 · dev · ...i'll play one
085 · d-5 02:22 · jonah · aditya's one game · ↩ 084
086 · d-5 02:22 · dev · i lost track
087 · d-4 23:10 · jonah · den rules for the party
088 · d-4 23:11 · jonah · what are we doing besides the countdown
089 · d-4 23:12 · theo · cards on the roof table
090 · d-4 23:12 · dev · king's cup but our version
091 · d-4 23:13 · theo · v1 had too many rules about pans
092 · d-4 23:13 · jonah · jules still owes the sink an apology
093 · d-4 23:14 · dev · keep the pan rule, it's tradition
094 · d-3 00:20 · theo · string lights test
095 · d-3 00:20 · theo · [photo: string lights glowing along a rooftop railing at night, landscape, warm and quiet]
096 · d-3 00:21 · jonah · it's so good
097 · d-3 00:22 · dev · will is going to cry
098 · d-3 00:22 · jonah · rae is going to cry. will is going to cry harder
099 · d-2 01:05 · dev · halal cart run, anyone awake
100 · d-2 01:06 · theo · awake
101 · d-2 01:06 · jonah · awake
102 · d-2 01:07 · dev · obviously
103 · d-2 01:30 · jonah · halal cart guy knows our order now
104 · d-2 01:31 · theo · he said "the usual?" i felt seen
105 · d-2 01:31 · dev · lupe's would never · 😆 theo
106 · d-2 01:32 · jonah · lupe's knows me by name, we don't talk about it
107 · d-1 00:15 · theo · the bracket needs to happen
108 · d-1 00:16 · jonah · public. let everyone vote
109 · d-1 00:16 · dev · 8 spots. lupe's, el primo, dough bros, night owl, gino's, smash shack, halal cart, fry guy
110 · d-1 00:17 · theo · that's the 8
111 · d-1 00:18 · jonah · post it tomorrow night
112 · d-1 23:58 · theo · door list at 36
113 · d-1 23:59 · jonah · 4 spots. rae counts
114 · d-1 23:59 · dev · omar's cake is in our fridge btw. don't eat it
115 · d0 00:00 · theo · noted
116 · d0 00:40 · jonah · who's still up
117 · d0 00:41 · dev · me, problem set
118 · d0 00:41 · theo · me
119 · d0 00:55 · theo · ok doing the bracket
120 · d0 01:02 · theo · settling this once and for all
121 · d0 01:03 · TOOL · t-bracket · Best late night food in Eastfield
122 · d0 01:05 · jonah · halal cart wins this in round 1
123 · d0 01:06 · dev · it's not round 1, we're already in the final · ↩ 122
124 · d0 01:06 · jonah · then it wins the final
125 · d0 01:07 · theo · it's tied 31 31
126 · d0 01:07 · jonah · i voted lupe's
127 · d0 01:08 · theo · you voted lupe's and said halal wins?
128 · d0 01:08 · jonah · i'm a man of many opinions · 😆 dev,theo
129 · d0 01:10 · dev · posting it to the feed so the tie breaks
130 · d0 01:12 · theo · it's on my profile now
131 · d0 01:20 · theo · smash before the party tonight? who's on
132 · d0 01:21 · dev · 7 to 8:30 then i'm showering
133 · d0 01:21 · jonah · on all night till the party
134 · d0 01:22 · TOOL · t-lobby · Who's on tonight
135 · d0 01:23 · theo · after gym ~7, done by 9
136 · d0 01:23 · jonah · 7 to 8:30 it is
137 · d0 01:24 · dev · one game each, then roof setup
138 · d0 01:24 · theo · one game
139 · d0 01:25 · jonah · we all know what one game means · 😆 dev
140 · d0 01:30 · jonah · den rules v2 for tonight. the no phones rule is banned
141 · d0 01:31 · TOOL · t-kings · King's cup
142 · d0 01:32 · theo · arun starts the waterfall, that's fair
143 · d0 01:32 · dev · rhyme with roof is hard
144 · d0 01:33 · jonah · proof
145 · d0 01:33 · theo · goof
146 · d0 01:33 · dev · hoof · 😆 jonah
147 · d0 01:34 · jonah · lemonade counts. we have 2 jugs
148 · d0 01:35 · dev · and water on the roof table
149 · d0 01:36 · theo · drew a 3, i'm the first me
150 · d0 01:36 · jonah · king for me already
151 · d0 01:37 · dev · 9 for me. rhyme time
152 · d0 01:38 · jonah · ok saving the rest for tonight
153 · d0 01:39 · theo · gerald gets a spot on the roof table
154 · d0 01:39 · jonah · he's family · 🌱 theo,dev
155 · d0 01:41 · dev · bed. for real
156 · d0 01:41 · theo · one more game
```

Notes: 120 to 122 (ln1 to ln4) and 131 to 134, 140 to 141 (ln5 to ln10) are the existing and B8
lines verbatim. 135 is Arun's lobby reply, so his `reply` field ("after gym ~7, done by 9") has a
message behind it. Line 001 is the group's naming line.

#### F3 · `senior` · senior week

- Members: me (Tsai Lin), maya, dev, jonah, priya (Will), theo
- Messages: 169 (3 tool insertions)
- Tools: 128 `t-bingo` Road trip bingo (read 122 to 127), 135 `t-captions` Caption this (read 131 to 134), 142 `t-trip` Senior week or never (read 140 to 141, with 064 to 067 and 105 to 112 for the price and headcount)
- Ends with the stuck dinner exchange (155 to 169) that ask path C1 reads. Lines 122 to 127, 131 to 132, 136, 140 to 141, 143, 147 and 155 to 169 are the existing seed lines (renamed); keep their times.

```
001 · d-20 19:12 · maya · ok senior week. we need to talk about it before everyone gets jobs and leaves me
002 · d-20 19:12 · maya · i'm serious
003 · d-20 19:14 · jonah · we have like 6 months
004 · d-20 19:14 · maya · thats nothing
005 · d-20 19:20 · dev · beach or mountains
006 · d-20 19:21 · priya · beach. i want to be horizontal for 4 days
007 · d-20 19:21 · theo · beach · 👍 priya,maya
008 · d-20 19:23 · me · beach but somewhere we can cook. i'm not paying for every meal
009 · d-20 19:24 · jonah · tsai lin already budgeting · 😆 dev,priya
010 · d-20 19:24 · me · someone has to
011 · d-20 19:31 · dev · i'll look at houses this week
012 · d-20 19:31 · maya · legend
013 · d-20 19:32 · jonah · thats my word · ↩ 012 · 😆 maya,theo
014 · d-19 12:40 · priya · [photo: hand-written list of beach towns on a napkin next to a coffee cup, portrait, sunny cafe table] i made a list
015 · d-19 12:41 · priya · cayucos, pismo, morro bay, santa cruz
016 · d-19 12:43 · theo · santa cruz is too close it doesnt count as a trip
017 · d-19 12:44 · me · cayucos has the pier and the cookie place
018 · d-19 12:44 · dev · cayucos houses are cheaper too
019 · d-19 12:50 · maya · i vote cayucos
020 · d-19 12:50 · maya · wait did i already vote
021 · d-19 12:51 · jonah · there is no poll maya · ↩ 020 · 😆 priya,me,dev
022 · d-19 12:51 · maya · i'm voting in spirit
023 · d-18 22:15 · theo · gym at 6 tomorrow anyone
024 · d-18 22:15 · theo · wrong chat
025 · d-18 22:16 · priya · we know arun · 😆 jonah
026 · d-18 22:17 · jonah · i'll go actually
027 · d-18 22:17 · theo · legend
028 · d-18 22:18 · jonah · ...
029 · d-17 18:02 · dev · dinner tonight? i'm not cooking, i used every pan i own sunday
030 · d-17 18:03 · me · we know · 😆 priya,maya
031 · d-17 18:05 · jonah · pier pizza?
032 · d-17 18:05 · theo · we had pier pizza monday and friday
033 · d-17 18:06 · jonah · and it was great both times
034 · d-17 18:07 · priya · fine pier pizza. 7?
035 · d-17 18:07 · maya · omw
036 · d-17 18:07 · dev · it's 6. you're not omw to anything · ↩ 035 · 😆 me,priya,jonah,theo
037 · d-17 18:08 · maya · i'm omw in my heart
038 · d-17 19:24 · maya · ok actually omw
039 · d-17 19:25 · priya · we're done eating
040 · d-17 19:25 · priya · [photo: open pizza box with two slices left on a red checkered table, landscape, warm restaurant light]
041 · d-17 19:26 · maya · saved me 2. this is love · ❤️ priya
042 · d-15 16:40 · theo · [link: meridianhall.example | Juniper Hale live · Fri at 8:00 PM]
043 · d-15 16:41 · theo · who's going
044 · d-15 16:41 · maya · me me me
045 · d-15 16:42 · priya · that's the night after my birthday
046 · d-15 16:42 · priya · so yes obviously
047 · d-15 16:45 · dev · if student tickets are under 60
048 · d-15 16:46 · me · balcony is 38
049 · d-15 16:46 · dev · in
050 · d-14 01:12 · jonah · random thought
051 · d-14 01:12 · jonah · what if senior week is 5 days not 4
052 · d-14 01:13 · theo · why are you awake
053 · d-14 01:13 · jonah · why are YOU awake
054 · d-14 01:14 · theo · lab report
055 · d-14 01:15 · priya · 5 days yes
056 · d-14 01:15 · priya · also why am i awake
057 · d-14 01:20 · jonah · 5 days. may 17 to 21. book it aditya
058 · d-14 01:21 · jonah · he's asleep isn't he
059 · d-14 08:02 · dev · i was asleep. 5 days works. finals end the 14th · 👍 jonah,priya,theo
060 · d-14 08:30 · me · 17 to 21 works for me
061 · d-14 09:45 · maya · wait what did i miss
062 · d-14 09:46 · priya · scroll
063 · d-14 09:52 · maya · ok 5 days. i'm in. probably
064 · d-12 14:20 · dev · [link: stayfinder.example | Beach house in Cayucos · sleeps 8 · 4 bedrooms]
065 · d-12 14:20 · dev · this one. 2 blocks from the pier, has a grill
066 · d-12 14:22 · me · how much
067 · d-12 14:24 · dev · about 140 each for 5 nights if all 6 of us go
068 · d-12 14:25 · priya · 140 for 5 nights at the beach???? · 😮 maya,jonah
069 · d-12 14:25 · jonah · sleeps 8. we can bring 2 more
070 · d-12 14:26 · theo · we are not bringing 2 more
071 · d-12 14:26 · theo · i want my own pillow
072 · d-12 14:30 · maya · the hot tub omg
073 · d-12 14:31 · me · there's a hot tub??
074 · d-12 14:31 · maya · photo 7
075 · d-12 14:33 · me · ok i'm in · ❤️ dev
076 · d-12 14:40 · priya · book it before someone else does
077 · d-12 14:41 · dev · need to talk to the host first, she's slow to reply
078 · d-10 20:05 · jonah · pier pizza tonight
079 · d-10 20:05 · theo · no
080 · d-10 20:05 · theo · absolutely not
081 · d-10 20:06 · jonah · arun we don't have to tell the pier guy you said that · 😆 priya,me
082 · d-10 20:07 · priya · thai basil?
083 · d-10 20:07 · theo · thai basil yes
084 · d-10 20:10 · me · thai basil at 8
085 · d-10 20:11 · maya · omw
086 · d-10 20:11 · dev · see you at 8:20 maya · ↩ 085 · 😆 jonah,priya,me
087 · d-10 20:31 · maya · 8:20 is so unfair
088 · d-10 20:31 · maya · it was 8:25
089 · d-8 09:15 · me · joshua tree crew leaves friday at 3. arun and maya you're in hana's car
090 · d-8 09:16 · theo · got it. bringing the crash pad
091 · d-8 09:20 · maya · what time do we leave
092 · d-8 09:20 · me · 3 · ↩ 089
093 · d-8 09:21 · maya · so 3:20 · 😆 dev,jonah
094 · d-8 09:22 · priya · bring me back a rock
095 · d-8 09:24 · jonah · bring me back a cactus
096 · d-8 09:24 · theo · we are not bringing back a cactus
097 · d-6 21:40 · theo · back. legs are gone
098 · d-6 21:41 · maya · [photo: dome tent pitched slightly crooked between granite boulders at dusk, landscape, desert blue hour, no people]
099 · d-6 21:41 · maya · hana's tent engineering
100 · d-6 21:43 · dev · 5 stars
101 · d-6 21:44 · priya · where's my rock
102 · d-6 21:47 · me · [photo: small smooth desert rock held on an open palm, close up, warm evening light, hand only]
103 · d-6 21:47 · me · your rock · ❤️ priya
104 · d-6 21:48 · priya · i love it. naming it rocky · 😆 jonah
105 · d-5 13:10 · dev · update the host finally replied. deposit is due next friday
106 · d-5 13:11 · dev · so we need a real headcount by then
107 · d-5 13:12 · jonah · real headcount: me
108 · d-5 13:12 · priya · me
109 · d-5 13:20 · me · me
110 · d-5 15:02 · maya · me!!
111 · d-5 15:02 · maya · sorry was in lab
112 · d-5 17:40 · theo · checking when my last lab is
113 · d-4 00:58 · priya · guys
114 · d-4 00:58 · priya · i turn 21 in 4 days
115 · d-4 00:59 · jonah · we know. we have plans. go to sleep · ❤️ priya
116 · d-4 01:00 · priya · what plans
117 · d-4 01:00 · jonah · go to sleep will
118 · d-4 01:02 · maya · go to sleep will
119 · d-4 01:02 · dev · go to sleep will · 😆 priya,me
120 · d-4 01:05 · priya · this is bullying
121 · d-4 01:05 · me · it's love. sleep
122 · d-3 14:05 · maya · ok so are we actually doing the beach thing
123 · d-3 14:09 · jonah · if there is a house yes
124 · d-3 14:31 · dev · i booked the house
125 · d-3 14:31 · dev · sleeps 8, 4 bedrooms · 😮 maya,jonah,priya
126 · d-3 14:40 · priya · aditya you are carrying this trip · ❤️ dev
127 · d-3 14:42 · jonah · road trip bingo or im not getting in the car
128 · d-3 14:43 · TOOL · t-bingo · Road trip bingo
129 · d-3 14:50 · theo · wrong exit (blame maps) is going to happen in the first 10 min
130 · d-3 14:52 · me · it's 212 miles we'll be fine
131 · d-2 20:10 · priya · found the pics from big sur and joshua tree
132 · d-2 20:10 · priya · caption them, loser buys first round
133 · d-2 20:11 · priya · [photo: empty beach at golden hour with a striped towel and a cooler on the sand, landscape, warm and hazy, no people]
134 · d-2 20:11 · priya · [photo: dome tent between boulders under a deep blue night sky, landscape, desert night, a little crooked, no people]
135 · d-2 20:12 · TOOL · t-captions · Caption this
136 · d-2 20:15 · theo · the tent one is a crime · 😆 maya,me
137 · d-2 20:20 · maya · i'm voting later
138 · d-2 20:20 · jonah · she won't · ↩ 137 · 😆 priya,dev
139 · d-2 23:40 · dev · first round is lemonade btw. i'm driving to everything
140 · d-1 19:02 · dev · deposit for the cayucos house is due friday. $140 each
141 · d-1 19:03 · dev · i'm not putting it down unless all 6 of us are in
142 · d-1 19:03 · TOOL · t-trip · Senior week or never
143 · d-1 19:10 · priya · took 1b. obviously
144 · d-1 19:12 · maya · took 1c
145 · d-1 19:12 · maya · i answered something on time. screenshot this · 😆 me,jonah,dev
146 · d-1 19:14 · jonah · 1d. window seat energy
147 · d-1 19:20 · theo · checking if my last lab is the 14th or the 16th, one sec
148 · d-1 19:21 · me · i'll take mine after i do the venmo math
149 · d-1 22:30 · priya · tomorrow is my last day as a 20 year old
150 · d-1 22:31 · maya · tonight at the den is going to be so good
151 · d-1 22:31 · jonah · roof is ready. you'll see · ❤️ priya
152 · d0 08:10 · theo · gym
153 · d0 08:10 · theo · wrong chat again · 😆 jonah,dev
154 · d0 09:20 · jonah · dinner before the den tonight? party starts at 9 but nobody shows before 10
155 · d0 09:31 · maya · where are we eating tonight
156 · d0 09:32 · dev · thai basil or sushi ko
157 · d0 09:33 · priya · or the taco truck on college ave, open til 11
158 · d0 09:33 · theo · not pier pizza again, im so over it · 😆 jonah
159 · d0 09:34 · maya · drinks after?
160 · d0 09:34 · jonah · $3 wells at the dive or byob on the deck
161 · d0 09:35 · priya · or $2 pbr at lucky's
162 · d0 09:35 · jonah · not $14 cocktails, im broke
163 · d0 09:36 · dev · leave at 9:45 or 10:15
164 · d0 09:36 · theo · or 1am lol
165 · d0 09:37 · dev · not 1am, im driving
166 · d0 09:37 · maya · ok so which one
167 · d0 09:38 · theo · idk anything works
168 · d0 09:38 · dev · idk u pick
169 · d0 09:39 · priya · no u pick
```

Notes: line 138's "she" is Maya (the running joke: Maya never answers polls; 019 to 022, 137). Maya's late "omw" recurs at 035 to 038, 085 to 088, 091 to 093; she is on time once, at 144 to 145. Pier pizza fatigue recurs at 031 to 033, 078 to 081, 158. The house sleeps 8 at 064, 069, 125.

#### F5 · `priya` · Will Li

- Members: me (Tsai Lin), priya (Will)
- Messages: 158 (2 tool insertions)
- Tools: 142 `t-sx-try` To try (read 140 to 141: the cami.eats reel and "we need to go to all 3"), 158 `t-pizza` Pizza run (read 156 to 157, with 130 to 131 for Rae's 6 PM landing)
- Lines 094 to 097 (registrar, charger), 140 to 141 (the reel share from `seed-surfaces.ts`, ids `sx-reel` and `sx-wait`) and 156 to 157 (pizza) are the existing lines; keep their times. Will and Tsai Lin are roommates in Apt 4B.

```
001 · d-20 10:02 · priya · are you up
002 · d-20 10:02 · priya · laundry room is free rn
003 · d-20 10:05 · me · omw with my whole hamper
004 · d-20 10:05 · priya · leave me one dryer
005 · d-20 10:31 · me · took 2 sorry
006 · d-20 10:31 · priya · betrayal · 😆 me
007 · d-20 10:32 · me · i'll fold yours
008 · d-20 10:32 · priya · forgiven
009 · d-20 22:14 · priya · [photo: desk covered in highlighted econ notes next to a cold mug, top down, late night lamp light]
010 · d-20 22:14 · priya · send help
011 · d-20 22:16 · me · what chapter
012 · d-20 22:16 · priya · 9. game theory. i am losing the game
013 · d-20 22:17 · me · come to the kitchen i'll explain it with snacks
014 · d-20 22:17 · priya · coming · ❤️ me
015 · d-19 08:40 · me · did you take my umbrella
016 · d-19 08:41 · priya · ...
017 · d-19 08:41 · priya · it was raining
018 · d-19 08:41 · me · that's when you need an umbrella will
019 · d-19 08:42 · priya · i'll bring it back at 12 · 👍 me
020 · d-19 12:10 · priya · [photo: wet purple umbrella hanging on a door handle, portrait, grey daylight]
021 · d-19 12:10 · priya · returned with interest (it's dry now)
022 · d-18 17:20 · me · climbing tonight?
023 · d-18 17:22 · priya · my arms still hurt from tuesday
024 · d-18 17:22 · me · that's how you know it's working
025 · d-18 17:23 · priya · ok fine. 7?
026 · d-18 17:23 · me · 7. ride from the union steps at 6:40
027 · d-18 17:24 · priya · i'm stealing your "ok fine" · 😆 me
028 · d-18 21:30 · priya · i did the orange route!!!
029 · d-18 21:30 · me · you DID · ❤️ priya
030 · d-18 21:31 · priya · arun spotted me. he's a very calm spotter
031 · d-18 21:31 · me · best spotter in the club
032 · d-17 14:00 · priya · what are you getting me for my birthday
033 · d-17 14:00 · me · a hug
034 · d-17 14:01 · priya · a big one?
035 · d-17 14:01 · me · medium
036 · d-17 14:01 · priya · 😭
037 · d-17 14:02 · me · fine large
038 · d-16 19:45 · priya · rae booked her flight!!
039 · d-16 19:45 · priya · she lands thursday at 6
040 · d-16 19:46 · me · the day of??
041 · d-16 19:46 · priya · night before. i turn 21 at midnight thursday
042 · d-16 19:47 · me · right right. thursday night party, friday birthday
043 · d-16 19:47 · priya · and then juniper hale friday
044 · d-16 19:48 · me · best birthday weekend in eastfield history · ❤️ priya
045 · d-16 19:50 · priya · can she sleep on our couch
046 · d-16 19:50 · me · the couch with the spring?
047 · d-16 19:51 · priya · ok my floor then
048 · d-16 19:51 · me · i have an air mattress
049 · d-16 19:52 · priya · you're the best roommate · ❤️ me
050 · d-15 23:58 · priya · is it weird if i'm nervous about turning 21
051 · d-15 23:59 · me · no
052 · d-15 23:59 · me · what part
053 · d-14 00:01 · priya · idk. it feels like the last young birthday
054 · d-14 00:01 · me · 22 is still young will
055 · d-14 00:02 · priya · you sound like my mom
056 · d-14 00:02 · me · your mom is right about most things
057 · d-14 00:03 · priya · true
058 · d-14 00:04 · me · you're going to have the best night. calvin has been planning for weeks
059 · d-14 00:04 · priya · wait what
060 · d-14 00:05 · me · nothing. go to sleep
061 · d-14 00:05 · priya · TSAI LIN · 😆 me
062 · d-14 00:06 · me · goodnight
063 · d-13 11:20 · priya · [link: registrar.eastfield.example | Graduation application: due Nov 20]
064 · d-13 11:20 · priya · did you do this yet
065 · d-13 11:25 · me · no. thank you
066 · d-13 11:25 · priya · we're graduating. that's insane
067 · d-13 11:26 · me · don't
068 · d-13 11:26 · priya · ok
069 · d-12 18:30 · priya · [photo: fridge door shelf with one empty oat milk carton, portrait, bright fridge light]
070 · d-12 18:30 · priya · again.
071 · d-12 18:31 · me · aditya?
072 · d-12 18:31 · priya · he says allegedly
073 · d-12 18:32 · me · he replaced it last time to be fair
074 · d-12 18:32 · priya · he replaced it with almond milk · 😆 me
075 · d-12 18:33 · me · close enough
076 · d-12 18:33 · priya · it is not close enough
077 · d-10 16:10 · priya · thai basil tonight with everyone?
078 · d-10 16:12 · me · yes. 8
079 · d-10 16:12 · priya · i'll tell maya 7:40 so she's on time
080 · d-10 16:13 · me · genius · 😆 priya
081 · d-10 21:15 · priya · it worked. she was 2 min late
082 · d-10 21:15 · me · we have to do this forever
083 · d-8 09:30 · priya · have fun at joshua tree
084 · d-8 09:30 · priya · bring me a rock
085 · d-8 09:31 · me · i'll find you the best rock in the desert
086 · d-8 09:31 · priya · i'm holding you to that · ❤️ me
087 · d-7 22:40 · priya · how's the desert
088 · d-7 23:10 · me · [photo: night sky full of stars over dark boulder silhouettes, landscape, quiet and cold, no people]
089 · d-7 23:10 · me · no signal till now
090 · d-7 23:11 · priya · that's unreal
091 · d-7 23:11 · priya · jealous
092 · d-6 21:50 · priya · the rock is perfect. rocky lives on my desk now
093 · d-6 21:51 · me · good. he has a nice view
094 · d-5 21:10 · me · did you get the email from the registrar
095 · d-5 21:12 · priya · ya its fine, just a form
096 · d-5 21:12 · priya · ill send it
097 · d-5 21:20 · me · ok bring the charger tmrw
098 · d-5 21:21 · priya · which charger
099 · d-5 21:21 · me · mine. the one you have
100 · d-5 21:22 · priya · oh that one · 😆 me
101 · d-4 13:00 · priya · friendsgiving: i'm doing pumpkin pie
102 · d-4 13:01 · me · your mom's recipe?
103 · d-4 13:01 · priya · she's sending it. she says don't skip the nutmeg
104 · d-4 13:02 · me · we will not skip the nutmeg
105 · d-4 13:05 · priya · calvin and arun both said chips
106 · d-4 13:05 · me · i saw. the bring list flagged it
107 · d-4 13:06 · priya · i love that it flags it
108 · d-3 08:00 · priya · gm. can you check if my black jacket is in the dryer
109 · d-3 08:04 · me · it is. it's warm
110 · d-3 08:04 · priya · bring it to me i'm in the kitchen
111 · d-3 08:05 · me · we live 10 feet apart will
112 · d-3 08:05 · priya · 10 very cold feet · 😆 me
113 · d-3 19:40 · priya · what do i wear thursday
114 · d-3 19:41 · me · the green shirt
115 · d-3 19:41 · priya · the green shirt is my interview shirt
116 · d-3 19:42 · me · exactly. it's your nicest shirt
117 · d-3 19:42 · priya · ok green shirt
118 · d-3 19:50 · priya · [photo: green button-up shirt on a hanger against a white closet door, portrait, soft daylight]
119 · d-3 19:50 · priya · ironed it. growing up
120 · d-3 19:51 · me · proud of you · ❤️ priya
121 · d-2 15:30 · priya · is calvin doing something on the roof
122 · d-2 15:31 · me · i don't know anything about a roof
123 · d-2 15:31 · priya · you're a terrible liar
124 · d-2 15:32 · me · i'm a great liar. you just know me
125 · d-2 15:32 · priya · fair · 😆 me
126 · d-2 23:05 · priya · random but thank you for being my roommate for 3 years
127 · d-2 23:06 · me · will it's not your birthday yet. save it
128 · d-2 23:06 · priya · i'm practicing
129 · d-2 23:07 · me · ok. love you too · ❤️ priya
130 · d-1 12:15 · priya · rae says her flight is on time
131 · d-1 12:15 · priya · lands at 6
132 · d-1 12:16 · me · i can get her from the airport train
133 · d-1 12:16 · priya · you would do that??
134 · d-1 12:17 · me · you'll be busy being celebrated
135 · d-1 12:17 · priya · i'm going to cry · ❤️ me
136 · d-1 17:40 · priya · last night as a 20 year old. what do i do
137 · d-1 17:41 · me · econ problem set
138 · d-1 17:41 · priya · romantic
139 · d-1 17:45 · me · and then dumplings this weekend. you pick where
140 · d-1 22:40 · priya · [link: Reel · cami.eats | 3 dumpling spots worth the line. the last one is cash only]
141 · d-1 22:41 · priya · we need to go to all 3
142 · d-1 22:42 · TOOL · t-sx-try · To try
143 · d-1 22:43 · priya · golden fold first. it's the one with the line
144 · d-1 22:44 · me · dumpling alley is cash only, bring cash
145 · d-1 22:44 · priya · i never have cash
146 · d-1 22:45 · me · i know. i'll bring cash · ↩ 145 · ❤️ priya
147 · d0 00:30 · priya · 23.5 hours
148 · d0 00:31 · me · go to sleep
149 · d0 00:31 · priya · ok · 😆 me
150 · d0 07:55 · priya · I'M 21 TOMORROW
151 · d0 07:55 · priya · sorry caps
152 · d0 07:58 · me · the caps are earned
153 · d0 08:30 · priya · can you bring my charger back
154 · d0 08:31 · me · it's on your desk next to rocky
155 · d0 08:31 · priya · rocky is guarding it · 😆 me
156 · d0 09:10 · priya · rae lands at 6. pizza at ours before the den?
157 · d0 09:10 · priya · getting gino's. tell me what u want or u get mushrooms
158 · d0 09:11 · TOOL · t-pizza · Pizza run
```

Notes: running threads are the charger (097 to 100, 153 to 155), Rocky the rock (094 to 104 in senior week, 092, 154), Maya's lateness (079 to 081), the oat milk (069 to 076, matching apt 4b), and the roof Calvin is keeping secret (058 to 061, 121 to 125). The record player gift is never mentioned here, since Will is in this chat.

### More one-to-one chats and two group chats (no tools)

Day offsets: d0 is Thursday Nov 12 (now 9:41 AM). d-13 is Fri Oct 30, the first day of Joshua
Tree; d-12 is Halloween. Times are 24h local. These chats carry no Muse tools; they exist so the
inbox looks lived in.

#### F7 · `dm-calvin` · Calvin Karthik

Members: me, jonah
Messages: 60
Tools: none

```
001 · d-20 14:12 · jonah · yo are you still doing the club van thing sunday
002 · d-20 14:30 · me · not this sunday, next one. why
003 · d-20 14:31 · jonah · arun wants to try outdoor and i said i'd ask the admin
004 · d-20 14:31 · jonah · you are the admin
005 · d-20 14:33 · me · lol tell him to request a spot like everyone else
006 · d-20 14:33 · jonah · nepotism denied. respect · 😆 me
007 · d-18 22:47 · jonah · random but do you still have the string lights from your birthday
008 · d-18 22:58 · me · two strands. one blinks on its own
009 · d-18 22:58 · jonah · perfect that's the vibe
010 · d-18 22:59 · jonah · will's 21st. thinking the roof at the den
011 · d-18 23:01 · me · CALVIN yes · ❤️ jonah
012 · d-18 23:01 · me · is the roof allowed
013 · d-18 23:02 · jonah · landlord said "be reasonable" which i'm choosing to read as yes
014 · d-18 23:02 · me · reasonable king
015 · d-15 09:10 · jonah · don't tell will
016 · d-15 09:10 · jonah · actually he knows. he found the group chat name
017 · d-15 09:12 · me · how
018 · d-15 09:12 · jonah · i airdropped him the guest list by accident · 😆 me
019 · d-15 09:13 · me · lmaooo ok so it's not a surprise it's an event
020 · d-15 09:14 · jonah · it's an event with a surprise in it. the gift is still secret
021 · d-15 09:14 · me · record player still?
022 · d-15 09:15 · jonah · yes. the teal one. arun found it
023 · d-11 19:40 · jonah · how was joshua tree
024 · d-11 19:52 · me · [photo: desert boulders at golden hour with a tent in the foreground, landscape, warm and quiet, no people]
025 · d-11 19:52 · me · hana set up the tent which was a whole saga
026 · d-11 19:53 · jonah · that rock is huge
027 · d-11 19:53 · jonah · next time bring me i have a truck and no fear
028 · d-11 19:54 · me · you said that about tahoe
029 · d-11 19:54 · jonah · and tahoe is happening!! feb 7. you're in right · ↩ 028
030 · d-11 19:58 · me · probably. depends on finals results lol
031 · d-11 19:58 · jonah · i'm holding a spot for you. 2 left after that
032 · d-7 16:20 · me · ok weird ask
033 · d-7 16:20 · me · can apt 4b borrow the truck saturday the 14th. couch pickup
034 · d-7 16:21 · jonah · which couch
035 · d-7 16:21 · me · we're voting. sectional or loveseat. maybe the futon if we're broke
036 · d-7 16:22 · jonah · i'll drive it. 11am?
037 · d-7 16:22 · me · you're a legend
038 · d-7 16:22 · jonah · that's my line · 😆 me
039 · d-7 16:23 · jonah · bring the straps from the club gear room. i only have one
040 · d-7 16:24 · me · on it
041 · d-3 01:07 · jonah · u up
042 · d-3 01:07 · jonah · not like that. like design emergency
043 · d-3 01:09 · me · i'm up. econ is killing me
044 · d-3 01:09 · jonah · balloons or no balloons on the roof
045 · d-3 01:10 · me · balloons will fly into the neighbors yard
046 · d-3 01:10 · jonah · ok no balloons
047 · d-3 01:10 · jonah · string lights + a countdown sign
048 · d-3 01:11 · me · and blankets. it's cold up there
049 · d-3 01:11 · jonah · omar has 6 blankets for some reason
050 · d-3 01:12 · me · don't question it
051 · d-3 01:12 · jonah · going to bed. thank you design consultant · ❤️ me
052 · d-1 18:35 · jonah · arun is doing the door. can you be on lights at 11:59
053 · d-1 18:41 · me · yes. what's the cue
054 · d-1 18:42 · jonah · i yell "10" and you flip the switch at 0
055 · d-1 18:42 · me · high pressure job. accepted
056 · d0 08:52 · jonah · roof is ready
057 · d0 08:52 · jonah · [photo: string lights strung over an empty rooftop at dusk, landscape, cozy, no people]
058 · d0 08:55 · me · CALVIN it looks so good · ❤️ jonah
059 · d0 08:56 · jonah · come by at 8:30 if you can help with chairs
060 · d0 08:58 · me · i'll bring the lights that blink on their own · 😆 jonah
```

#### F8 · `dm-arun` · Arun Vaithianathan

Members: me, theo
Messages: 60
Tools: none

```
001 · d-20 07:02 · theo · gym at 9?
002 · d-20 07:40 · me · i have class at 9
003 · d-20 07:41 · theo · gym at 8 then
004 · d-20 07:41 · me · it's 7:41
005 · d-20 07:42 · theo · plenty of time · 😆 me
006 · d-19 12:15 · me · how did the climbing wall go yesterday
007 · d-19 12:30 · theo · forearms are gone. completely gone
008 · d-19 12:30 · theo · but i did the blue route
009 · d-19 12:31 · me · the blue route!! that's a v2
010 · d-19 12:31 · theo · i'm telling everyone it was a v5
011 · d-17 20:08 · theo · is the club van going to castle rock this month
012 · d-17 20:14 · me · sunday the 15th. van seats 12
013 · d-17 20:15 · theo · put me down. i'll drive if the regular driver can't
014 · d-17 20:16 · me · bea will want your license number in a spreadsheet
015 · d-17 20:16 · theo · she can have it. i trust bea with my life · ❤️ me
016 · d-13 06:40 · theo · leaving for joshua tree in 20. you have the crash pad?
017 · d-13 06:41 · me · in the trunk. coffee?
018 · d-13 06:41 · theo · bringing 2
019 · d-13 06:44 · theo · 3. hana texted
020 · d-11 21:30 · theo · that trip was so good
021 · d-11 21:31 · theo · [photo: chalky hands resting on a granite boulder, square, dusty and bright, no face]
022 · d-11 21:35 · me · best weekend of the semester honestly
023 · d-11 21:35 · theo · hana's tab says i'm square. i don't fully understand how
024 · d-11 21:36 · me · you rented the pads, everyone owes you, you owe hana. math
025 · d-11 21:36 · theo · beautiful · 😆 me
026 · d-8 15:02 · theo · omar got the offer!!!
027 · d-8 15:02 · theo · lakeside labs. starts july
028 · d-8 15:03 · me · OMAR. tell him congrats from me
029 · d-8 15:04 · theo · he's pretending to be calm. he is not calm
030 · d-8 15:04 · theo · we're doing cake at will's party. shared cake
031 · d-8 15:05 · me · will won't mind. he loves omar · ❤️ theo
032 · d-6 23:12 · theo · ok calvin put me on the door for the 21st
033 · d-6 23:12 · theo · cap is 40. it's a roof. i take this seriously
034 · d-6 23:14 · me · door king
035 · d-6 23:15 · theo · is rae coming? will's friend from home
036 · d-6 23:16 · me · yes she lands at 6. put her down
037 · d-6 23:16 · theo · done. and hana?
038 · d-6 23:17 · me · yes, she's bringing her camera
039 · d-6 23:17 · theo · added both · 👍 me
040 · d-4 01:22 · theo · random thought
041 · d-4 01:22 · theo · we should do the wall every tuesday till finals
042 · d-4 01:23 · theo · accountability
043 · d-4 01:30 · me · why are you awake
044 · d-4 01:30 · theo · lab report. it's due at 9
045 · d-4 01:31 · me · ok tuesdays. deal
046 · d-4 01:31 · theo · deal. going back to my 4 page conclusion · 😆 me
047 · d-2 18:50 · me · did you get your chalk bag back
048 · d-2 18:55 · theo · no 😔 blue, carabiner on it
049 · d-2 18:55 · theo · aditya made me a flyer for it. 4 tabs torn already
050 · d-2 18:56 · me · people care about your chalk bag
051 · d-2 18:56 · theo · this town is good to me
052 · d-1 20:44 · theo · will asked if you're going to juniper friday
053 · d-1 20:50 · me · obviously. you?
054 · d-1 20:50 · theo · section 103 if aditya commits
055 · d-1 20:51 · me · he'll commit. he always says maybe first
056 · d0 07:15 · theo · gym at 9?
057 · d0 07:16 · me · tonight is the party. save your energy
058 · d0 07:16 · theo · gym. dont ask · 😆 me
059 · d0 09:02 · theo · door list is final at 6pm. last call for names
060 · d0 09:05 · me · you have everyone. thank you for doing this · ❤️ theo
```

#### F9 · `dm-aditya` · Aditya Kapoor

Members: me, dev
Messages: 60
Tools: none

```
001 · d-20 10:03 · dev · are you home
002 · d-20 10:05 · me · library. why
003 · d-20 10:05 · dev · package for you in the lobby. it's big
004 · d-20 10:06 · me · oh that's the climbing rope
005 · d-20 10:06 · dev · i'll bring it up so no one takes it
006 · d-20 10:07 · me · thank youuu · ❤️ dev
007 · d-18 19:20 · dev · found the house for senior week
008 · d-18 19:20 · dev · [link: rentals.example | Beach house in Cayucos · sleeps 8 · 4 bedrooms]
009 · d-18 19:22 · me · it's on the sand??
010 · d-18 19:22 · dev · basically. 2 min walk
011 · d-18 19:23 · me · ok you have to book this
012 · d-18 19:23 · dev · booked it. paid the hold myself, we'll sort the deposit later
013 · d-18 19:24 · me · aditya you are carrying this trip · 😆 dev
014 · d-15 08:30 · dev · tsai lin is that your pan in the sink
015 · d-15 08:31 · me · ...that's your pan from sunday
016 · d-15 08:31 · dev · allegedly
017 · d-15 08:32 · dev · ok it's mine. washing it now · 😆 me
018 · d-12 13:05 · dev · how's joshua tree
019 · d-12 13:40 · me · [photo: a winding desert road through joshua trees, portrait, bright midday, no people]
020 · d-12 13:41 · me · no signal anywhere. it's great
021 · d-12 13:41 · dev · jealous. i'm doing a problem set in the kitchen
022 · d-12 13:42 · dev · halloween in the apt is just me and maya's bat decoration
023 · d-12 13:43 · me · tell the bat i said hi
024 · d-10 11:00 · dev · it's been almost a year since big sur
025 · d-10 11:00 · dev · i'm making a recap for the 10th
026 · d-10 11:02 · me · the mcway falls hike twice
027 · d-10 11:02 · dev · the short one. twice. iconic
028 · d-10 11:03 · me · and nepenthe. maya picked it and was right
029 · d-10 11:03 · dev · she brings it up every time · 😆 me
030 · d-8 17:45 · dev · deposit for cayucos is due friday the 13th
031 · d-8 17:46 · dev · $140 each. i'll ask the group but tell me if you're in first
032 · d-8 17:48 · me · in. 100%
033 · d-8 17:48 · dev · knew it · ❤️ me
034 · d-6 12:10 · dev · ines is selling a mini fridge
035 · d-6 12:10 · dev · i posted asking for one like 10 min before she posted
036 · d-6 12:11 · me · the universe heard you
037 · d-6 12:11 · dev · claimed it. $40. it goes in my room
038 · d-6 12:12 · me · is it for snacks or for your pans
039 · d-6 12:12 · dev · for snacks. the pans live in the sink now · 😆 me
040 · d-3 00:58 · dev · are you still up
041 · d-3 00:58 · dev · i can hear you typing through the wall
042 · d-3 01:00 · me · econ problem set 5
043 · d-3 01:00 · dev · want tea
044 · d-3 01:01 · me · yes please
045 · d-3 01:01 · dev · leaving it outside your door
046 · d-3 01:06 · me · ur the best roommate · ❤️ dev
047 · d-2 19:30 · dev · couch vote is close
048 · d-2 19:31 · dev · maya and will want the sectional. i like the loveseat
049 · d-2 19:31 · me · the velvet one??
050 · d-2 19:32 · dev · velvet is rich roommate energy
051 · d-2 19:32 · me · we'll see if it fits. i'm measuring the long wall tonight
052 · d-2 22:15 · me · long wall is 104 in
053 · d-2 22:16 · dev · loveseat is 58. sectional is 92. both fit if nothing else is there
054 · d-2 22:16 · me · the rug is there
055 · d-2 22:17 · dev · the rug can move. the rug is flexible
056 · d0 06:02 · dev · up at 6 for no reason
057 · d0 06:02 · dev · [photo: sunrise over a quiet residential street with parked cars, landscape, soft pink light, no people]
058 · d0 08:40 · me · that's actually so pretty
059 · d0 08:41 · dev · see you at will's tonight. i'll be late, problem set first
060 · d0 08:42 · me · you always say that and you're always there by 9:15 · 😆 dev
```

#### F10 · `dm-hana` · Hana Ito

Members: me, hana
Messages: 60
Tools: none

```
001 · d-20 18:00 · hana · airbnb for joshua tree is booked!!
002 · d-20 18:00 · hana · [link: rentals.example | Desert cabin near Joshua Tree · 3 bedrooms · fire pit]
003 · d-20 18:02 · me · the fire pit!!
004 · d-20 18:02 · hana · i'll split it once we know who's actually coming
005 · d-20 18:03 · me · me, maya, arun, bea, kofi so far
006 · d-20 18:03 · hana · and me. six. perfect
007 · d-17 14:22 · hana · do you have a sleeping bag or should i borrow one
008 · d-17 14:30 · me · the club has 4 in the gear room. i'll grab two
009 · d-17 14:30 · hana · ur a hero · ❤️ me
010 · d-14 21:10 · hana · bringing my film camera. 3 rolls
011 · d-14 21:11 · me · only 3?
012 · d-14 21:11 · hana · ok 5
013 · d-13 22:40 · hana · stars out here are unreal
014 · d-13 22:41 · hana · [photo: a desert night sky full of stars over dark rock silhouettes, portrait, still and cold, no people]
015 · d-13 22:42 · me · i'm literally next to you
016 · d-13 22:42 · hana · i know but now it's in writing · 😆 me
017 · d-12 09:15 · hana · tent update: still standing
018 · d-12 09:15 · me · barely
019 · d-12 09:16 · hana · we asked if i needed help and i said "i got it"
020 · d-12 09:16 · hana · i did not have it · 😆 me
021 · d-12 09:17 · me · it's a good tent now. a beautiful tent
022 · d-10 20:05 · hana · ok made the tab
023 · d-10 20:05 · hana · 9 iou's turned into 4 payments
024 · d-10 20:06 · hana · you pay me $229 and that's everything
025 · d-10 20:08 · me · that's the airbnb plus what i owe kofi?
026 · d-10 20:08 · hana · yep it routes kofi's through me
027 · d-10 20:09 · me · smart. sending friday when my check comes in
028 · d-10 20:09 · hana · no rush at all · ❤️ me
029 · d-7 12:30 · hana · film is developed!!!
030 · d-7 12:31 · hana · [photo: a film photo of a campfire with marshmallows on sticks, landscape, grainy and warm, hands only]
031 · d-7 12:31 · hana · [photo: a film photo of a granite boulder with a crash pad at its base, portrait, sunny, no people]
032 · d-7 12:33 · me · HANA these are so good
033 · d-7 12:33 · me · the campfire one
034 · d-7 12:34 · hana · i'm printing that one for you · ❤️ me
035 · d-5 16:45 · hana · are you going to will's party thursday
036 · d-5 16:50 · me · yes! arun has you on the door list
037 · d-5 16:50 · hana · bringing the camera. will doesn't know yet
038 · d-5 16:51 · me · he'll love it. he posts everything
039 · d-3 01:14 · hana · random 1am question
040 · d-3 01:14 · hana · is crag day ok for someone who's only done the wall
041 · d-3 01:20 · me · totally. top rope, all levels
042 · d-3 01:20 · hana · ok requesting a spot
043 · d-3 01:21 · me · i'm an admin, i'll see it
044 · d-3 01:21 · hana · no favoritism. treat me like a stranger
045 · d-3 01:22 · me · ok stranger · 😆 hana
046 · d-2 10:05 · hana · wait do i need my own harness
047 · d-2 10:10 · me · club has 12. bea also has one on marketplace for $35
048 · d-2 10:10 · hana · i'll borrow first
049 · d-1 13:40 · hana · sent my request with a note
050 · d-1 13:41 · me · saw it. the film camera line is very persuasive
051 · d-1 13:41 · hana · that's the plan · 😆 me
052 · d-1 13:45 · hana · what time is the van
053 · d-1 13:47 · me · 8am, union steps. back by 5
054 · d-1 13:47 · hana · 8am on a sunday. for you. ok
055 · d0 07:50 · hana · shot the fog on the way to class
056 · d0 07:51 · hana · [photo: fog rolling over an empty campus quad at sunrise, landscape, soft and grey, no people]
057 · d0 08:20 · me · posting this?
058 · d0 08:20 · hana · already did. the fog was showing off
059 · d0 08:21 · me · see you tonight
060 · d0 08:21 · hana · see you on the roof · ❤️ me
```

#### F11 · `econ140` · econ 140 final

Members: me, tess, zoe, kev, ava, omar
Messages: 80
Tools: none

```
001 · d-20 16:00 · zoe · made this chat for the final. same group as the midterm
002 · d-20 16:01 · tess · thank god
003 · d-20 16:01 · ava · in
004 · d-20 16:02 · kev · in. i'm not even tired
005 · d-20 16:02 · omar · it's 4pm kev
006 · d-20 16:03 · kev · exactly. peak hours · 😆 ava,tess
007 · d-20 16:05 · me · when's problem set 4 due again
008 · d-20 16:06 · zoe · tuesday 11:59
009 · d-20 16:06 · zoe · [link: course.eastfield.example | Econ 140 · problem set 4]
010 · d-18 19:30 · tess · q3 on ps4. is the demand curve supposed to be kinked
011 · d-18 19:42 · omar · yes. at the price floor
012 · d-18 19:42 · tess · omg that's why my graph looked like a lightning bolt
013 · d-18 19:43 · ava · same
014 · d-18 19:43 · me · same honestly · ↩ 012
015 · d-18 19:50 · zoe · union 2nd floor thursday 7pm? study session
016 · d-18 19:51 · ava · yes
017 · d-18 19:51 · me · yes
018 · d-18 19:52 · omar · yes but i'll be 10 min late, lab
019 · d-18 20:30 · kev · i can come
020 · d-18 20:30 · kev · probably
021 · d-16 19:05 · zoe · we're at the big table by the window
022 · d-16 19:06 · zoe · [photo: a long table covered in notebooks, laptops and coffee cups, landscape, late evening lamp light, no faces]
023 · d-16 19:15 · omar · omw
024 · d-16 19:34 · me · kev?
025 · d-16 19:40 · kev · omw
026 · d-16 20:10 · tess · kev is here. kev is asleep · 😆 ava,me,zoe
027 · d-16 20:11 · kev · resting my eyes
028 · d-14 11:20 · ava · has anyone seen the slides for lecture 14
029 · d-14 11:25 · tess · they're not on the course site
030 · d-14 11:26 · zoe · prof said he'd upload them "tonight" on monday
031 · d-14 11:26 · me · which monday
032 · d-14 11:27 · ava · the eternal monday
033 · d-14 11:30 · omar · i have photos of half of them
034 · d-14 11:31 · omar · [photo: a projector screen showing a supply and demand chart, landscape, blurry lecture hall, no faces]
035 · d-14 11:31 · ava · omar saving lives · ❤️ ava,tess
036 · d-12 02:10 · kev · question
037 · d-12 02:10 · kev · what's elasticity
038 · d-12 08:40 · tess · kev the final is in 4 weeks
039 · d-12 08:41 · kev · i know i'm getting ahead · 😆 omar,zoe
040 · d-10 15:00 · me · ps5 is up. it's long
041 · d-10 15:01 · zoe · how long
042 · d-10 15:01 · me · 9 questions and a "short essay"
043 · d-10 15:02 · tess · the short essay is never short
044 · d-10 15:03 · ava · splitting it up? i'll take 1-3 and compare
045 · d-10 15:04 · omar · 4-6
046 · d-10 15:04 · me · 7-9
047 · d-10 15:05 · zoe · i'll do the essay outline
048 · d-10 15:07 · kev · i'll bring snacks thursday
049 · d-10 15:07 · tess · kev that's actually so valuable · ❤️ kev
050 · d-8 18:20 · omar · got the job offer btw. lakeside labs
051 · d-8 18:21 · zoe · OMAR
052 · d-8 18:21 · ava · congrats!!!
053 · d-8 18:21 · tess · omg congrats
054 · d-8 18:22 · me · congrats omar. you earned it
055 · d-8 18:23 · kev · congrats man
056 · d-8 18:25 · omar · thanks. still have to pass this class though · 😆 zoe,ava
057 · d-6 20:40 · ava · slides for lecture 14 are up
058 · d-6 20:41 · tess · it's not monday
059 · d-6 20:41 · ava · a miracle
060 · d-6 20:42 · zoe · [link: course.eastfield.example | Lecture 14 · market power]
061 · d-4 01:35 · me · is anyone else on 8
062 · d-4 01:37 · omar · yes. i think the answer is the deadweight triangle
063 · d-4 01:38 · me · i got 42.5
064 · d-4 01:38 · omar · same. ok we're right
065 · d-4 01:39 · kev · i'm also up
066 · d-4 01:39 · kev · not even tired
067 · d-4 01:40 · tess · go to sleep kev · 😆 me,omar
068 · d-3 12:00 · zoe · study session this thursday is off, half of us are at will li's party
069 · d-3 12:01 · ava · who's will
070 · d-3 12:01 · me · my roommate. he turns 21. you're all welcome honestly
071 · d-3 12:02 · tess · moving it to sunday then?
072 · d-3 12:03 · me · sunday i'm at castle rock till 5
073 · d-3 12:03 · zoe · sunday 7pm union then
074 · d-3 12:04 · ava · sunday 7
075 · d-3 12:04 · omar · sunday 7
076 · d-3 12:20 · kev · sunday works
077 · d-1 21:10 · tess · reminder ps5 due tonight
078 · d-1 23:58 · kev · submitted
079 · d-1 23:58 · kev · 2 minutes to spare · 😆 ava,zoe
080 · d0 08:15 · zoe · see everyone sunday. bring the ps5 answers
```

#### F12 · `lin-family` · lin family

Members: me, lin-mom ("Mom"), lin-dad ("Dad"), lin-eric ("Eric Lin", younger brother)
New made-up extras: `lin-mom`, `lin-dad`, `lin-eric` (add to STRANGERS; no posts, no photos of them).
Messages: 80
Tools: none

```
001 · d-20 08:00 · lin-mom · good morning everyone
002 · d-20 08:01 · lin-mom · [photo: a golden retriever asleep on a sunny kitchen floor, landscape, warm morning, no people]
003 · d-20 08:15 · lin-eric · she's been there since 6
004 · d-20 09:30 · me · BISCUIT · ❤️ lin-mom,lin-dad
005 · d-20 09:31 · me · tell her i miss her
006 · d-20 09:40 · lin-dad · she misses you too. she sleeps by your door
007 · d-19 19:00 · lin-mom · have you booked your flight for thanksgiving
008 · d-19 20:10 · me · not yet. looking tonight
009 · d-19 20:11 · lin-mom · prices go up after the 1st
010 · d-19 20:11 · lin-dad · listen to your mother
011 · d-19 20:12 · me · ok ok booking tonight
012 · d-18 22:30 · me · found one. tue the 24th, lands at 4:10
013 · d-18 22:31 · me · [link: flights.example | Eastfield to home · Tue Nov 24 · 1 stop]
014 · d-18 22:35 · lin-dad · i'll pick you up
015 · d-18 22:36 · lin-eric · can i come
016 · d-18 22:36 · lin-dad · if your homework is done
017 · d-18 22:37 · lin-eric · it will be
018 · d-18 22:40 · me · booked!! · 🎉 lin-mom
019 · d-16 12:20 · lin-eric · tsai lin how do you do derivatives
020 · d-16 12:45 · me · which kind
021 · d-16 12:45 · lin-eric · the kind on my test friday
022 · d-16 12:46 · me · send me the problem
023 · d-16 12:48 · lin-eric · [photo: a math worksheet with one problem circled in pencil, portrait, desk lamp light, no faces]
024 · d-16 12:55 · me · power rule. bring the 2 down, subtract 1
025 · d-16 12:56 · lin-eric · oh. that's it?
026 · d-16 12:56 · me · that's it
027 · d-16 12:57 · lin-eric · ur smart · ❤️ me,lin-mom
028 · d-13 07:30 · lin-mom · drive safe to the desert
029 · d-13 07:31 · lin-mom · text when you get there
030 · d-13 11:45 · me · here!! no signal so i'll text tonight
031 · d-13 11:46 · lin-dad · good. drink water
032 · d-12 20:15 · me · [photo: a desert sunset behind joshua trees, landscape, orange and purple sky, no people]
033 · d-12 20:20 · lin-mom · beautiful
034 · d-12 20:21 · lin-dad · is it cold at night
035 · d-12 20:22 · me · freezing. my friend set up the tent and it's very cozy now
036 · d-12 20:23 · lin-dad · good tent is important
037 · d-12 20:30 · lin-eric · happy halloween. i was a ghost
038 · d-12 20:31 · lin-eric · [photo: a white sheet costume with two eye holes on a hanger, portrait, playful, no person]
039 · d-12 20:35 · me · classic. respect · 😆 lin-eric
040 · d-10 18:00 · lin-mom · thanksgiving plan. auntie mei is bringing pie
041 · d-10 18:01 · lin-mom · dad is doing the turkey
042 · d-10 18:01 · lin-dad · second year in a row. this time i read the instructions
043 · d-10 18:05 · me · lol what should i bring
044 · d-10 18:06 · lin-mom · yourself
045 · d-10 18:06 · lin-mom · and the scallion pancakes you made last year
046 · d-10 18:07 · me · deal · ❤️ lin-mom
047 · d-8 21:20 · lin-eric · biscuit ate a sock
048 · d-8 21:21 · lin-eric · she's fine
049 · d-8 21:21 · lin-mom · she is fine
050 · d-8 21:22 · me · BISCUIT why
051 · d-8 21:22 · lin-dad · she has no regrets · 😆 me,lin-eric
052 · d-6 09:00 · lin-mom · i found your old photos from big sur last year
053 · d-6 09:01 · lin-mom · [photo: a bridge over a misty coastline from a highway pullout, landscape, soft morning light, no people]
054 · d-6 09:10 · me · omg aditya drove that whole trip
055 · d-6 09:11 · lin-mom · tell him thank you from us
056 · d-6 09:12 · me · i will. he's the best
057 · d-4 13:00 · lin-dad · how are classes
058 · d-4 13:30 · me · econ is hard but my study group is good
059 · d-4 13:31 · lin-dad · proud of you
060 · d-4 13:31 · lin-mom · proud of you · ❤️ me
061 · d-3 00:50 · lin-eric · are you up
062 · d-3 00:52 · me · yes why are YOU up
063 · d-3 00:52 · lin-eric · couldn't sleep. test tomorrow
064 · d-3 00:53 · me · you'll do great. power rule
065 · d-3 00:53 · lin-eric · power rule
066 · d-3 00:54 · me · go to sleep eric
067 · d-3 00:54 · lin-eric · ok night · ❤️ me
068 · d-2 16:10 · lin-eric · got a 94
069 · d-2 16:11 · me · ERIC
070 · d-2 16:11 · lin-mom · 🎉🎉
071 · d-2 16:12 · lin-dad · power rule · 😆 me,lin-eric
072 · d-1 19:00 · lin-mom · what are you doing this weekend
073 · d-1 19:05 · me · friend's birthday tonight, concert friday, friendsgiving saturday, climbing sunday
074 · d-1 19:06 · lin-dad · sleep somewhere in there
075 · d-1 19:06 · me · i'll try lol
076 · d-1 19:10 · lin-mom · send photos of the friendsgiving table
077 · d-1 19:11 · me · i'm making the mac and cheese
078 · d0 07:30 · lin-mom · good morning
079 · d0 07:31 · lin-mom · [photo: a golden retriever sitting by a front door with a leash in its mouth, portrait, early light, no people]
080 · d0 08:10 · me · tell biscuit 12 more days · ❤️ lin-mom,lin-dad
```

