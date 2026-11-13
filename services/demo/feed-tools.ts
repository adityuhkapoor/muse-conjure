// Home feed tools (docs/FEED_SPEC.md A, F01-F41): each post's lab tool, its params, and the moves friends already made,
// replayed by their own users (cast and extras alike) so the state is real shared state. Seeded by
// seed-catalysts.ts into the room named here; surfaces/data.ts FEED shows each in its post. Names come from `n`
// (first name by id). Members: the six cast plus `members`, the extras who act or are named in it.

export type FeedTool = { post: string; lab: string; id: string; room: string; by: string; members?: string[]; name: string; summary: string; params: Record<string, unknown>; acts?: { user: string; action: unknown }[] };

const tiers = (user: string, letters: string) => [
  ...[...letters].map((c, item) => ({ user, action: { t: "place", item, tier: "SABCD".indexOf(c) } })),
  { user, action: { t: "post" } },
];

const entriesA = (n: (id: string) => string) => [
  {
    post: "p-den", lab: "chore-draft", id: "t-f-den", room: "surface:page:post:p-den", by: "jonah",
    members: ["jules", "omar"],
    name: "Chore draft", summary: "Calvin is on the clock",
    params: {
      title: "Chore draft", sub: "The den · November",
      chores: [
        { name: "Bathrooms", pts: 5, note: "Both. Yes both" }, { name: "Dishes", pts: 4, note: "Pans included" },
        { name: "Fridge", pts: 4, note: "Purge it 1st Sun" }, { name: "Trash", pts: 3, note: "+ curb on Tue" },
        { name: "Vacuum", pts: 3, note: "Whole apt" }, { name: "Recycling", pts: 2, note: "Flatten boxes" },
        { name: "Mail runs", pts: 2, note: "Lobby + packages" }, { name: "Plants", pts: 1, note: "Keep Gerald alive" },
      ],
      order: [n("theo"), n("jules"), n("jonah"), n("omar")],
      picks: [],
    },
    acts: [{ user: "theo", action: { t: "pick", chore: 0 } }, { user: "jules", action: { t: "pick", chore: 1 } }],
  },
  {
    post: "p-dining", lab: "bracket-post", id: "t-f-dining", room: "surface:page:post:p-dining", by: "theo",
    members: [],
    name: "Late night food bracket", summary: "Final live · tied 31 to 31",
    params: {
      title: "Best late night food in Eastfield", left: "3h left",
      teams: [
        { name: "Lupe's Tacos", food: "burrito" }, { name: "El Primo truck", food: "taco" },
        { name: "Dough Bros Donuts", food: "donut" }, { name: "Night Owl Diner", food: "shake" },
        { name: "Gino's Pizza", food: "pizza" }, { name: "Smash Shack", food: "burger" },
        { name: "Bancroft halal cart", food: "curry" }, { name: "Fry Guy", food: "fries" },
      ],
      quarters: [0, 0, 0, 0], semis: [[31, 26], [29, 28]], final: [31, 31],
      people: [],
    },
    acts: [
      { user: "jonah", action: { t: "vote", match: 0, side: 0 } },
      { user: "dev", action: { t: "vote", match: 0, side: 1 } },
      { user: "dev", action: { t: "vote", match: 1, side: 1 } },
      { user: "priya", action: { t: "vote", match: 1, side: 1 } },
      { user: "theo", action: { t: "vote", match: 0, side: 0 } },
      { user: "theo", action: { t: "vote", match: 1, side: 1 } },
      { user: "theo", action: { t: "close" } },
    ],
  },
  {
    post: "p-21st", lab: "host-board", id: "t-f-21st", room: "surface:page:event:will21", by: "jonah",
    members: [],
    name: "Will's 21st", summary: "36 heads, cap 40",
    params: {
      title: `${n("priya")}'s 21st`, when: "Tonight 9pm", host: n("jonah"), cap: 40, door: n("theo"),
      going: [n("jonah")], maybe: [],
      othersGoing: 14, othersMaybe: 12,
      guests: [n("rae"), n("jules"), n("hana"), n("omar"), n("bea")], plus: 1, rate: 1,
    },
    acts: [
      { user: "priya", action: { t: "rsvp", v: "going" } },
      { user: "theo", action: { t: "rsvp", v: "going" } },
      { user: "maya", action: { t: "rsvp", v: "going" } },
      { user: "dev", action: { t: "rsvp", v: "maybe" } },
    ],
  },
  {
    post: "p-boba", lab: "feed-tier-list", id: "t-cat-feed-ranking", room: "surface:page:post:p-boba", by: "maya",
    members: [],
    name: "Boba tier list", summary: "3 friends posted · Tea Hut leads S tier",
    params: {
      title: "Rank the boba on Telegraph", author: n("maya"),
      items: [
        { name: "Tea Hut", votes: [17, 13, 5, 2, 0] }, { name: "Boba Bliss", votes: [9, 15, 9, 3, 1] },
        { name: "Milk & Moon", votes: [12, 6, 6, 8, 5] }, { name: "Bubble Lab", votes: [4, 10, 11, 8, 4] },
        { name: "Union cafe boba", votes: [1, 4, 9, 13, 10] }, { name: "Kiki's Tea Truck", votes: [2, 7, 14, 9, 4] },
      ],
      people: [],
    },
    acts: [...tiers("maya", "SABCDB"), ...tiers("priya", "ASBCDA"), ...tiers("dev", "SBABCC")],
  },
  {
    post: "p-rides", lab: "event-carpool", id: "t-cat-event-carpool", room: "surface:page:event:juniper", by: "maya",
    members: [],
    name: "Rides to Juniper Hale", summary: "Maya is driving · 2 seats open",
    params: {
      title: "Rides to Juniper Hale", place: "Meridian Hall · Fri",
      cars: [
        { driver: n("maya"), model: `${n("maya")}'s Civic`, seats: 4, leaves: "7:00", from: "Apt 4B", costCents: 1200, costLabel: "Meridian lot", riders: [] },
        { driver: n("jonah"), model: `${n("jonah")}'s truck`, seats: 3, leaves: "7:10", from: "The den", costCents: 1200, costLabel: "Meridian lot", riders: [] },
        { driver: n("dev"), model: `${n("dev")}'s Jeep`, seats: 4, leaves: "7:20", from: "Dwight & College", costCents: 600, costLabel: "Street meter", riders: [] },
      ],
    },
    acts: [
      { user: "priya", action: { t: "sit", car: "c0", k: 1 } },
      { user: "theo", action: { t: "sit", car: "c1", k: 1 } },
    ],
  },
  {
    post: "p-rent", lab: "rent-split", id: "t-f-rent", room: "surface:page:post:p-rent", by: "jules",
    members: ["omar", "jules"],
    name: "Rent split", summary: "2 of 4 agree",
    params: {
      title: "2214 Ellis St", rentCents: 360000, weight: 60, bathCents: 12000, parkingCents: 7500,
      rooms: [
        { name: n("jonah"), sqft: 180, bath: true, parking: false }, { name: n("theo"), sqft: 140, bath: false, parking: false },
        { name: n("omar"), sqft: 120, bath: false, parking: true }, { name: n("jules"), sqft: 105, bath: false, parking: false },
      ],
      agreed: [],
    },
    acts: [{ user: "jonah", action: { t: "agree" } }, { user: "theo", action: { t: "agree" } }],
  },
];

const entriesB = (n: (id: string) => string) => [
  {
    post: "p-cook", lab: "reel-cook-night", id: "t-f-cook", room: "surface:page:post:p-cook", by: "dani", members: ["dani","leo","hana","bea"],
    name: "Chili crisp cook night", summary: "Cook night at Dani's · 6 of 9 claimed · Fri leads",
    params: {
      reel: { from: n("dani"), note: `We're making this`, account: "ines.cooks", title: "15 minute chili crisp noodles", plays: "12.8K likes" },
      host: n("dani"), time: "7pm", serves: 6, costCents: 4200,
      items: [
        { label: "Wide noodles", by: n("dani") }, { label: "Chili crisp", by: n("dani") }, { label: "Soy sauce", by: n("leo") },
        { label: "Black vinegar", by: "" }, { label: "Garlic", by: n("hana") }, { label: "Peanuts", by: "" },
        { label: "Scallions", by: n("hana") }, { label: "Cucumbers", by: n("bea") }, { label: "Mochi", by: "" },
      ],
      nights: [
        { day: "Thu", date: "Nov 19", votes: [n("leo")] }, { day: "Fri", date: "Nov 20", votes: [n("dani"), n("hana"), n("bea")] },
        { day: "Sun", date: "Nov 22", votes: [] },
      ],
    },
    acts: [],
  },
  {
    post: "p-wrapped", lab: "semester-wrapped", id: "t-f-wrapped", room: "surface:page:story:s-priya", by: "priya",
    name: "Fall '26 wrapped", summary: "Fall '26 wrapped · 4 of 6 opened their pack",
    params: {
      term: "Fall '26",
      cards: [
        { kind: "study", title: "Library hours", big: "212", unit: "hrs at Main stacks", who: n("maya"), detail: "Mostly the 3rd floor" },
        { kind: "food", title: "Dining loyalty", big: "87", unit: "group visits", who: "Crossroads", detail: "Pesto pasta on Tuesdays" },
        { kind: "chat", title: "Chat MVP", big: "3,402", unit: "messages", who: n("jonah"), detail: "1,395 of them voice memos" },
        { kind: "music", title: "Pregame song", big: "61", unit: "plays", who: "Northbound", detail: `Always on ${n("theo")}'s aux` },
        { kind: "night", title: "Latest night", big: "4:12", unit: "am, midterms week", who: n("noa"), detail: "Oct 22, Main stacks" },
        { kind: "squad", title: "Holo rare", big: "8", unit: "of us, 1 semester", who: "Apt 4B and the den", detail: "Dwight and Ellis" },
      ],
      opened: [],
    },
    acts: ["maya", "dev", "jonah", "theo"].map((u) => ({ user: u, action: { t: "rip" } })),
  },
  {
    post: "p-ines-sale", lab: "move-out-sale", id: "t-f-sale", room: "surface:page:listing:l-desk", by: "ines", members: ["ines","kofi"],
    name: "Ines's move-out sale", summary: "Ines's move-out sale: 3 of 6 claimed · 3 left",
    params: {
      seller: n("ines"),
      items: [
        { name: "Standing desk", priceCents: 9000, kind: "desk", claimedBy: "" },
        { name: "Arc lamp", priceCents: 2500, kind: "lamp", claimedBy: "" },
        { name: "Road bike", priceCents: 12000, kind: "bike", claimedBy: "" },
        { name: "Mini fridge", priceCents: 4000, kind: "fridge", claimedBy: "" },
        { name: "Monstera", priceCents: 1500, kind: "plant", claimedBy: "" },
        { name: "Crash pad", priceCents: 6000, kind: "other", claimedBy: n("kofi") },
      ],
      publicWhen: "tomorrow 9am", pickup: "Sat 10–12 · 2400 Durant, 2nd floor", note: "bring a dolly lol",
    },
    acts: [
      { user: "priya", action: { t: "claim", item: "i1" } },
      { user: "dev", action: { t: "claim", item: "i3" } },
    ],
  },
  {
    post: "p-chatdle", lab: "daily-puzzle", id: "t-g-chatdle", room: "surface:page:gaming:gm-chatdle", by: "dev",
    name: "Chatdle #213", summary: "Chatdle #213 · 2 solved · 0 playing",
    params: {
      word: "DRAFT", said: 41, chat: "apt 4b", no: 213, day: "Thu",
      source: { who: n("noa"), text: "ok fine draft it", when: "today" },
      streaks: [{ who: n("maya"), days: 6 }, { who: n("dev"), days: 12 }, { who: n("priya"), days: 4 }, { who: n("noa"), days: 9 }],
      played: [],
    },
    acts: [
      ...["BOTCH", "ARISE", "DRAFT"].map((word) => ({ user: "dev", action: { t: "guess", word } })),
      ...["BOTCH", "HOLDS", "ARISE", "DROIT", "DRAFT"].map((word) => ({ user: "priya", action: { t: "guess", word } })),
    ],
  },
  {
    post: "p-trip-story", lab: "trip-story", id: "t-cat-story-trip", room: "surface:page:story:s-trip", by: "dev",
    name: "Big Sur trip story", summary: "Big Sur trip story · 2 in for Big Sur '26",
    params: {
      city: "Big Sur", days: 3, dates: "Nov 10-12",
      stops: [
        { label: "Apt 4B", x: 0.88, y: 0.12 }, { label: "Bixby Bridge", x: 0.62, y: 0.38 },
        { label: "Pfeiffer Beach", x: 0.45, y: 0.55 }, { label: "Nepenthe", x: 0.34, y: 0.66 }, { label: "McWay Falls", x: 0.2, y: 0.86 },
      ],
      miles: "312 mi", milesNote: "Highway 1, both ways",
      moment: "4:50pm · McWay Falls, the short hike, the second time",
      mvp: { who: n("dev"), facts: ["Drove all 312 miles", "Found the campsite with showers", "0 wrong turns"] },
      costs: [
        { label: "Campsite, 2 nights", cents: 14400 }, { label: "Nepenthe dinner", cents: 18800 },
        { label: "Gas", cents: 9600 }, { label: "Groceries", cents: 6200 }, { label: "Bixby parking", cents: 1000 },
      ],
      next: "Big Sur '26",
    },
    acts: [{ user: "maya", action: { t: "in" } }, { user: "priya", action: { t: "in" } }],
  },
  {
    post: "p-jt", lab: "settle-up", id: "t-f-jt", room: "surface:page:post:p-jt", by: "hana", members: ["hana","bea","kofi"],
    name: "Joshua Tree tab", summary: "Joshua Tree tab: 1 of 4 paid",
    params: {
      title: "Joshua Tree tab",
      ious: [
        { from: n("bea"), to: n("hana"), cents: 15000, why: "airbnb" }, { from: n("noa"), to: n("hana"), cents: 14500, why: "airbnb" },
        { from: n("kofi"), to: n("hana"), cents: 15000, why: "airbnb" }, { from: n("theo"), to: n("hana"), cents: 15000, why: "airbnb" },
        { from: n("hana"), to: n("bea"), cents: 4800, why: "gas" }, { from: n("noa"), to: n("kofi"), cents: 8400, why: "groceries+gas" },
        { from: n("hana"), to: n("maya"), cents: 8100, why: "firewood+tacos" }, { from: n("bea"), to: n("theo"), cents: 11000, why: "crash pad rental" },
        { from: n("maya"), to: n("theo"), cents: 4000, why: "crash pad rental" },
      ],
    },
    acts: [{ user: "hana", action: { t: "untangle" } },
      { user: "bea", action: { t: "pay", id: "s1" } }],
  },
];

const entriesC = (n: (id: string) => string) => [
  {
    post: "p-trivia", lab: "friend-trivia-pub", id: "t-cat-game-trivia", room: "surface:page:gaming:gaming", by: "maya", members: [] as string[],
    name: "Senior week quiz", summary: "4 played · top score 850",
    params: {
      title: "How well do you know senior week?", by: n("maya"), plays: 38,
      questions: [
        { about: n("maya"), q: `${n("maya")}'s boba order, every time?`, options: ["Taro milk tea", "Brown sugar", "Thai tea", "Matcha latte"], answer: 1 },
        { about: n("dev"), q: `How many does ${n("dev")}'s beach house sleep?`, options: ["6", "8", "10", "12"], answer: 1 },
        { about: n("priya"), q: `How many of the 27 Big Sur stories did ${n("priya")} post?`, options: ["4", "9", "11", "14"], answer: 2 },
        { about: n("jonah"), q: `${n("jonah")}'s karaoke song?`, options: ["Mr. Brightside", "Dancing Queen", "Since U Been Gone", "Valerie"], answer: 1 },
        { about: "the group", q: "Where did senior week first hang out?", options: ["Laundry room", "Lupe's line", "The 3am fire drill", "Intro CS lab"], answer: 2 },
      ],
      played: [
        { who: n("dev"), picks: [1, 1, 2, 1, 2], points: [190, 170, 150, 180, 160] },
        { who: n("theo"), picks: [1, 1, 2, 0, 2], points: [160, 180, 200, 0, 150] },
        { who: n("priya"), picks: [0, 1, 3, 1, 2], points: [0, 150, 0, 190, 170] },
        { who: n("jonah"), picks: [1, 3, 2, 1, 1], points: [140, 0, 120, 130, 0] },
      ],
    },
    // Aditya, Arun, Will, Calvin kept in params: init maps each name onto the matching member id.
    acts: [],
  },
  {
    post: "p-couch", lab: "group-buy", id: "t-f-couch", room: "surface:page:listing:l-sectional", by: "dev", members: [] as string[],
    name: "Couch hunt", summary: "3 votes · sectional leads 2 to 1",
    params: {
      title: "Couch hunt · apt 4b",
      listings: [
        { name: "Grey sectional", priceCents: 18000, where: "0.8 mi · Eastfield", style: "sectional", color: "grey", quote: `${n("maya")}: “fits all 4 of us for movie night”` },
        { name: "Green velvet loveseat", priceCents: 12000, where: "1.1 mi · Eastfield", style: "velvet", color: "green", quote: `${n("dev")}: “velvet is rich roommate energy”` },
        { name: "Futon", priceCents: 6000, where: "2.3 mi · North Eastfield", style: "other", color: "blue", quote: "" },
      ],
      votes: [{ name: n("maya"), listing: 0 }, { name: n("priya"), listing: 0 }, { name: n("dev"), listing: 1 }],
      wins: 3, pickup: `Sat 11am · ${n("jonah")}'s truck`,
    },
    // Votes kept in params: init maps each name onto the member id.
    acts: [],
  },
  {
    post: "p-setlist", lab: "setlist-bingo", id: "t-f-setlist", room: "surface:page:post:p-setlist", by: "nico", members: ["nico", "zoe", "ava", "kev", "hana"],
    name: "Setlist bingo", summary: "6 called · Nico is 1 to go",
    params: {
      title: "Setlist bingo", sub: "Juniper Hale · Alder Theater · Wed",
      cells: ["Paper Lanterns", "Northbound", "Glasshouse", "Slow Tide", "Crowd sings along",
        "Ferris Wheel", "Rooftops", "Juniper's hat toss", "Lighthouse", "Seventeen",
        "Acoustic one", "Phone lights up", "Says the city's name", "Blue Hour",
        "Cover song", "A 10-min jam", "Polaroid", "Tells the van story", "New song",
        "Brings a fan on stage", "Encore", "Drops a pick", "Northbound (reprise)", "Thank you, Riverside"],
      played: [2, 7, 10, 11, 12, 13],
      marks: [
        { name: n("nico"), cells: [2, 7, 10, 11, 12] }, { name: n("zoe"), cells: [7, 10, 11, 12] },
        { name: n("ava"), cells: [2, 11, 12] }, { name: n("kev"), cells: [2, 7] }, { name: n("hana"), cells: [10] },
      ],
    },
    // Marks kept in params: init maps each name onto the member id.
    acts: [],
  },
  {
    post: "p-tahoe", lab: "open-spots", id: "t-f-tahoe", room: "surface:page:post:p-tahoe", by: "jonah", members: ["jules", "omar"],
    name: "Tahoe cabin", summary: "6 going · 2 spots left · 5 waiting",
    params: {
      title: "Tahoe cabin", when: "Feb 7–9 · leaves Fri 4pm from the den",
      going: [n("jonah"), n("theo"), n("jules"), n("omar"), n("maya"), n("dev")], spots: 2,
      requests: [
        { name: `${n("wes")} Duarte`, meta: "Foothill RA · moving to 2C", mutuals: [n("jonah"), n("maya")], note: "I'll cook one night" },
        { name: `${n("kev")} Tran`, meta: "Eastfield '27 · snowboards", mutuals: [n("theo")], note: "Can bring the speaker" },
        { name: `${n("rae")} Whitfield`, meta: `${n("priya")}'s friend · visiting this week`, mutuals: [n("priya")], note: "If I'm back in town, yes" },
        { name: `${n("kofi")} Mensah`, meta: "Grad student · has chains for the car", mutuals: [n("maya"), n("theo"), n("dev")], note: "Can drive 3 and I have chains" },
        { name: `${n("hana")} Ito`, meta: "Eastfield '28 · photo club", mutuals: [n("noa")], note: "I'll bring my film camera" },
      ],
    },
    // Going has no reducer action: init maps all six onto members (Calvin first, so host).
    acts: [],
  },
  {
    post: "p-beat", lab: "story-beat", id: "t-f-beat", room: "surface:page:story:s-theo", by: "theo", members: ["jules", "omar"],
    name: "Den beat", summary: "7 shouts in an 8-step loop",
    params: {
      rows: [{ who: n("jonah"), shout: "Legend" }, { who: n("theo"), shout: "Gym" }, { who: n("jules"), shout: "Gerald" }, { who: n("omar"), shout: "Boom" }],
      grid: ["........", "........", "........", "........"],
    },
    // Each row replayed by its owner as toggles; Calvin toggles one cell on and off so he is a maker.
    acts: [
      { user: "theo", action: { t: "toggle", row: 1, step: 3 } },
      { user: "theo", action: { t: "toggle", row: 1, step: 7 } },
      { user: "jules", action: { t: "toggle", row: 2, step: 2 } },
      { user: "jules", action: { t: "toggle", row: 2, step: 6 } },
      { user: "omar", action: { t: "toggle", row: 3, step: 0 } },
      { user: "omar", action: { t: "toggle", row: 3, step: 4 } },
      { user: "omar", action: { t: "toggle", row: 3, step: 6 } },
      { user: "jonah", action: { t: "toggle", row: 0, step: 0 } },
      { user: "jonah", action: { t: "toggle", row: 0, step: 0 } },
    ],
  },
  {
    post: "p-move", lab: "move-in-day", id: "t-f-move", room: "surface:page:post:p-move", by: "wes", members: ["omar", "kev", "hana"],
    name: "Move-in day", summary: "0 of 3 items loaded · 3 hands still needed",
    params: {
      title: "Move-in day", sub: "Sun · Foothill to 2C, 1915 Hearst",
      stops: [{ time: "9:00", label: "Truck" }, { time: "9:30", label: "Load" }, { time: "10:40", label: "Drive" }, { time: "11:15", label: "Unload" }, { time: "1:00", label: "Pizza" }],
      stage: 1,
      items: [
        { name: "Couch", need: 3, note: "Tilt it through the door", cuft: 110, kind: "couch", hands: [n("omar"), n("kev")] },
        { name: "Mattress", need: 2, note: "Queen · very floppy", cuft: 60, kind: "mattress", hands: [n("hana")] },
        { name: "TV", need: 1, note: "The careful one", cuft: 30, kind: "tv", hands: [] },
      ],
      boxes: { label: "23 boxes", cuft: 160 }, truckCuft: 400, after: "Pizza at 1, on Wes",
    },
    // Hands kept in params: init maps each name onto the member id.
    acts: [],
  },
];

const entriesD = (n: (id: string) => string) => {
  const V = (label: string, when: string, costCents: number, vetoedBy: string) => ({ label, when, costCents, vetoedBy });
  const xs = [120, 340, 560, 220, 700, 430, 880, 60, 610, 290, 770, 500, 160, 820];
  const faceActs = xs.map((x, i) => ({ user: ["jonah", "theo", "jules", "omar"][i % 4]!, action: { t: "drop", x, y: 300 + (i % 4) * 60 } }));
    return [
    {
      post: "p-faces", lab: "face-drop", id: "t-f-faces", room: "surface:page:post:p-faces", by: "jules", members: ["jules", "omar"],
      name: "Face drop", summary: "Face drop · 45 dropped",
      params: { names: [n("jonah"), n("theo"), n("jules"), n("omar"), n("maya"), n("priya"), n("dev"), n("noa")] },
      acts: faceActs,
    },
    {
      post: "p-ramen", lab: "reel-to-try", id: "t-f-ramen", room: "surface:page:post:p-ramen", by: "maya",
      name: "Apt 4B to-try list", summary: "Menya Kuro is on the to-try list · 5 spots",
      params: {
        reel: { from: n("maya"), note: "Friday??", account: "eastfield.bites", caption: "The $13 tonkotsu on Shattuck that ended me", likes: "48K", place: "Menya Kuro", area: "Shattuck" },
        spots: [
          { name: "Mr. Bao", area: "Shattuck", tried: "Oct 3", ratings: [{ by: n("priya"), stars: 5 }, { by: n("dev"), stars: 5 }], want: [] },
          { name: "Lupe's Tacos", area: "Telegraph", tried: "Sep 20", ratings: [{ by: n("maya"), stars: 4 }, { by: n("priya"), stars: 5 }, { by: n("dev"), stars: 4 }], want: [] },
          { name: "Dumpling Alley", area: "Downtown", tried: "", ratings: [], want: [n("priya"), n("maya"), n("dev")] },
          { name: "Tea Hut", area: "Telegraph", tried: "Aug 30", ratings: [{ by: n("maya"), stars: 3 }, { by: n("dev"), stars: 4 }, { by: n("priya"), stars: 3 }], want: [] },
        ],
      },
      acts: [
        { user: "maya", action: { t: "add" } },
        { user: "priya", action: { t: "want", spot: "reel" } },
        { user: "dev", action: { t: "want", spot: "reel" } },
      ],
    },
    {
      post: "p-tab", lab: "tab-claim", id: "t-f-tab", room: "surface:page:post:p-tab", by: "bea", members: ["bea", "kofi", "hana"],
      name: "Smoke & Barrel tab", summary: "Smoke & Barrel tab: 6 of 12 claimed · $189.10",
      params: {
        place: "Smoke & Barrel", payer: n("bea"), tipBps: 2200,
        items: [
          { label: "Brisket plate", priceCents: 2400, claimedBy: n("kofi") }, { label: "Pulled pork sando", priceCents: 1600, claimedBy: "" },
          { label: "Half rack ribs", priceCents: 2800, claimedBy: n("theo") }, { label: "Wings (12)", priceCents: 1800, claimedBy: n("hana") },
          { label: "Mac & cheese", priceCents: 700, claimedBy: "" }, { label: "Burnt ends", priceCents: 1900, claimedBy: n("maya") },
          { label: "Chips & queso", priceCents: 900, claimedBy: "" }, { label: "Lemonade pitcher", priceCents: 1400, claimedBy: "" },
          { label: "Cornbread", priceCents: 500, claimedBy: "" }, { label: "Banana pudding", priceCents: 800, claimedBy: n("theo") },
          { label: "Sweet tea", priceCents: 300, claimedBy: n("hana") }, { label: "Coleslaw", priceCents: 400, claimedBy: "" },
        ],
      },
      acts: [],
    },
    {
      post: "p-potluck", lab: "potluck", id: "t-f-potluck", room: "surface:page:post:p-potluck", by: "tess",
      name: "Thanksgiving potluck", summary: "Thanksgiving potluck: 4 of 7 dishes covered",
      params: {
        title: "Thanksgiving potluck", coming: 14, host: "Dad's turkey",
        plates: [
          { need: "potatoes", who: "Grandma Jo", dish: "mashed potatoes" }, { need: "stuffing", who: "Mom", dish: "stuffing" },
          { need: "dessert", who: "Aunt Linda", dish: "pumpkin pie" }, { need: "veggies", who: "", dish: "" },
          { need: "dessert", who: "Cousin Mei", dish: "apple pie" }, { need: "mac", who: "Nate", dish: "mac & cheese" },
          { need: "dessert", who: "Aunt Bev", dish: "pecan pie" }, { need: "drinks", who: "", dish: "" },
          { need: "rolls", who: "", dish: "" }, { need: "", who: "Uncle T", dish: 'a "surprise"' },
        ],
        defaults: { veggies: "green beans", drinks: "cider + sparkling water", rolls: "rolls", potatoes: "mashed potatoes", stuffing: "stuffing", mac: "mac & cheese" },
        tips: [
          { who: "Uncle T", to: "rolls", why: 'his "surprise" last year was lime jello' },
          { who: "Aunt Bev", to: "veggies", why: "3 pies for 14 people is a lot of pie" },
          { who: "Cousin Mei", to: "drinks", why: "she has the Costco card" },
        ],
      },
      acts: [],
    },
    {
      post: "p-spinner", lab: "plan-spinner", id: "t-f-spinner", room: "surface:page:post:p-spinner", by: "kev", members: ["kev", "ava", "wes", "tess"],
      name: "Saturday plan", summary: "Locked: Bowling · Hot pot · Karaoke at Rose's · 4 going",
      params: {
        title: "Saturday plan", why: '"idk anything" ×4 · so Muse spins it', date: "Sat",
        tapes: [
          { name: "Activity", options: [V("Mini golf", "4:00 PM", 1400, n("ava")), V("Sibley ridge hike", "3:00 PM", 0, n("tess")), V("Bowling", "4:00 PM", 1200, ""), V("Escape room", "3:30 PM", 3800, n("kev")), V("Thrift crawl", "2:30 PM", 1000, n("wes")), V("Arcade bar", "4:30 PM", 1500, n("kev"))] },
          { name: "Food", options: [V("Lupe's Tacos", "6:30 PM", 900, n("tess")), V("Omakase", "6:00 PM", 8500, n("kev")), V("Hot pot", "6:30 PM", 2200, ""), V("Gino's Pizza", "6:00 PM", 800, n("ava")), V("Ramen Ya", "7:00 PM", 1600, n("wes")), V("Food trucks", "6:30 PM", 1200, n("kev"))] },
          { name: "After", options: [V("Karaoke at Rose's", "8:30 PM", 500, ""), V("Club Volt", "11:30 PM", 2000, n("wes")), V("Movie at Ava's".replace("Ava", n("ava")), "8:30 PM", 0, n("tess")), V("Dessert run", "8:00 PM", 600, n("ava")), V("Beach bonfire", "8:00 PM", 300, n("kev")), V("Rooftop bar", "10:30 PM", 1800, n("wes"))] },
        ],
        rules: [{ text: "No hikes", who: `${n("tess")}'s ankle` }, { text: "Under $25", who: n("kev") }, { text: "Home by 11", who: n("wes") }],
        lockAt: 4,
      },
      acts: [
        { user: "kev", action: { t: "spin" } },
        { user: "kev", action: { t: "rsvp", v: "going" } },
        { user: "ava", action: { t: "rsvp", v: "going" } },
        { user: "wes", action: { t: "rsvp", v: "going" } },
        { user: "tess", action: { t: "rsvp", v: "going" } },
      ],
    },
    {
      post: "p-veto", lab: "dinner-veto", id: "t-f-veto", room: "surface:page:post:p-veto", by: "leo", members: ["dani", "ava", "sam", "kev", "leo", "nico"],
      name: "Dinner for 6", summary: "Dinner for 6: 3 places left, 3 of 12 vetoed",
      params: {
        title: "Dinner for 6", time: "7:30", leaveBy: "7:15",
        spots: [
          { name: "Ramen Ya", kind: "ramen", price: "$$", miles: 0.3, stars: 4.6 }, { name: "Lucia's Trattoria", kind: "pasta", price: "$$$", miles: 0.8, stars: 4.7 },
          { name: "El Primo truck", kind: "tacos", price: "$", miles: 0.5, stars: 4.5 }, { name: "Golden Fold", kind: "dim sum", price: "$$", miles: 0.6, stars: 4.4 },
          { name: "Smoke & Barrel", kind: "bbq", price: "$$", miles: 1.2, stars: 4.5 }, { name: "Thai Basil", kind: "thai", price: "$", miles: 0.4, stars: 4.3 },
        ],
        vetoes: [{ name: n("dani"), spot: 0, why: "had it tues" }, { name: n("ava"), spot: 1, why: "$$ this week?" }, { name: n("sam"), spot: 4, why: "1.2 mi in the rain??" }],
        passed: [n("kev")],
      },
      acts: [],
    },
    {
      post: "p-formal", lab: "date-swipe", id: "t-f-formal", room: "surface:page:post:p-formal", by: "zoe", members: ["zoe", "tess", "nico", "kev", "ava"],
      name: "Winter formal weekend", summary: "Winter formal: Jan 22–24 is at 4 of 5",
      params: {
        place: "Winter formal", lockAt: 5,
        weekends: [
          { label: "Dec 4–6", month: "Dec", day: 4, span: "Fri–Sun", why: "last weekend before finals", free: [n("zoe"), n("tess")] },
          { label: "Dec 11–13", month: "Dec", day: 11, span: "Fri–Sun", why: "finals week tho", free: [n("ava")] },
          { label: "Jan 22–24", month: "Jan", day: 22, span: "Fri–Sun", why: "first weekend back · venue is $200 less", free: [n("zoe"), n("tess"), n("nico"), n("kev")] },
          { label: "Feb 5–7", month: "Feb", day: 5, span: "Fri–Sun", why: "tahoe weekend for half of us", free: [n("nico")] },
        ],
      },
      acts: [],
    },
  ];
};

export const feedTools = (n: (id: string) => string): FeedTool[] => [...entriesA(n), ...entriesB(n), ...entriesC(n), ...entriesD(n)] as FeedTool[];
