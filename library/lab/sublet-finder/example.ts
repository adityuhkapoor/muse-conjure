export default {
  group: "Bay Area Sublets", posts: 1083, swiped: 38, budgets: [120000, 160000, 220000],
  listings: [
    { hood: "Rockridge", city: "Oakland", priceCents: 135000, dates: "Jun 1 – Aug 15", perk: "2 blocks to BART · bay window", via: "Priya's lab partner", viaWho: "Priya", mutuals: 3, view: 2, x: 0.68, y: 0.27 },
    { hood: "Mission", city: "SF", priceCents: 155000, dates: "Jun 1 – Aug 31", perk: "taqueria downstairs", via: "Theo's cousin", viaWho: "Theo", mutuals: 2, view: 3, x: 0.2, y: 0.47 },
    { hood: "Northside", city: "Berkeley", priceCents: 110000, dates: "May 20 – Aug 10", perk: "walk to campus · loft bed", via: "", viaWho: "", mutuals: 0, view: 2, x: 0.6, y: 0.11 },
    { hood: "Inner Sunset", city: "SF", priceCents: 145000, dates: "Jun 5 – Aug 20", perk: "fog included · N-Judah outside", via: "Noa's teammate", viaWho: "Noa", mutuals: 4, view: 1, x: 0.09, y: 0.45 },
    { hood: "Palo Alto", city: "", priceCents: 180000, dates: "Jun 1 – Sep 1", perk: "bike to Caltrain · garden", via: "Jonah's old RA", viaWho: "Jonah", mutuals: 1, view: 3, x: 0.55, y: 0.94 },
    { hood: "Temescal", city: "Oakland", priceCents: 125000, dates: "Jun 1 – Aug 15", perk: "backyard and a lemon tree", via: "Dev's roommate's sister", viaWho: "Dev", mutuals: 2, view: 4, x: 0.63, y: 0.33 },
    { hood: "Downtown", city: "Berkeley", priceCents: 170000, dates: "Jun 15 – Aug 15", perk: "rooftop · 1 min to BART", via: "", viaWho: "", mutuals: 0, view: 0, x: 0.64, y: 0.17 },
    { hood: "SoMa", city: "SF", priceCents: 210000, dates: "Jun 1 – Aug 31", perk: "gym in building, tiny but shiny", via: "Maya's coworker", viaWho: "Maya", mutuals: 1, view: 0, x: 0.25, y: 0.4 },
    { hood: "Alameda", city: "", priceCents: 99000, dates: "Jun 1 – Aug 20", perk: "ferry to SF · very quiet street", via: "Priya's aunt", viaWho: "Priya", mutuals: 5, view: 4, x: 0.58, y: 0.52 },
  ],
  people: [
    { name: "Maya", saved: ["Rockridge", "Mission"], passed: [] },
    { name: "Noa", saved: ["Rockridge", "Alameda"], passed: ["Northside"] },
    { name: "Dev", saved: [], passed: ["Inner Sunset"] },
  ],
  labels: [{ name: "SF", x: 0.18, y: 0.6 }, { name: "Berk", x: 0.84, y: 0.18 }, { name: "Oak", x: 0.82, y: 0.48 }, { name: "Palo Alto", x: 0.4, y: 0.92 }],
} as const;
