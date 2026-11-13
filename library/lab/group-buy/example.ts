export default {
  title: "Couch hunt · apt 4",
  listings: [
    { name: "Grey sectional", priceCents: 36000, where: "1.2 mi · Berkeley", style: "sectional", color: "grey", quote: "Maya: “fits all 5 for movie night”" },
    { name: "Green velvet", priceCents: 28000, where: "2.4 mi · Oakland", style: "velvet", color: "green", quote: "Dev: “velvet is rich roommate energy”" },
    { name: "Mustard MCM", priceCents: 22000, where: "0.6 mi · Northside", style: "midcentury", color: "mustard", quote: "" },
  ],
  votes: [
    { name: "Maya", listing: 0 },
    { name: "Priya", listing: 0 },
    { name: "Dev", listing: 1 },
    { name: "Noa", listing: 1 },
  ],
  wins: 3,
  pickup: "Sat 11am · Dev's truck",
} as const;
