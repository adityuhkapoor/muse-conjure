export default {
  title: "Dinner for 6",
  time: "7:30",
  leaveBy: "7:15",
  spots: [
    { name: "Sakura Ramen", kind: "ramen", price: "$$", miles: 0.3, stars: 4.6 },
    { name: "Lucia's Trattoria", kind: "pasta", price: "$$$", miles: 0.8, stars: 4.7 },
    { name: "El Toro Taqueria", kind: "tacos", price: "$", miles: 0.5, stars: 4.5 },
    { name: "Golden Dumpling", kind: "dim sum", price: "$$", miles: 0.6, stars: 4.4 },
    { name: "Smoke & Barrel", kind: "bbq", price: "$$", miles: 1.2, stars: 4.5 },
    { name: "Basil Thai", kind: "thai", price: "$", miles: 0.4, stars: 4.3 },
  ],
  vetoes: [
    { name: "Maya", spot: 0, why: "had it tues" },
    { name: "Jess", spot: 1, why: "$$$ this week?" },
    { name: "Sam", spot: 4, why: "1.2 mi in the rain??" },
  ],
  passed: ["Rae"],
} as const;
