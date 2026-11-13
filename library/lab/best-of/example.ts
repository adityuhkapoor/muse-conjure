export default {
  group: "Cal Class of '28", members: 6200, question: "Best dentist near campus", posts: 40, replies: 212, helped: 86,
  asks: [
    { who: "Jordan", text: "best dentist near campus?", ago: "2h" },
    { who: "Kev", text: "dentist recs?? tooth emergency", ago: "3d" },
    { who: "Ana", text: "anyone know a dentist that takes SHIP", ago: "1w" },
  ],
  picks: [
    { name: "Telegraph Smiles", detail: "Telegraph Ave · takes SHIP", mentions: 56, rating: 4.8, quotes: [{ who: "Priya", text: "Dr. Lin numbed me like a pro, zero pain" }, { who: "Kev", text: "walked in w/ a cracked tooth, out in 40 min" }] },
    { name: "Tang Center Dental", detail: "on campus · free cleanings", mentions: 50, rating: 4.3, quotes: [{ who: "Ana", text: "free cleaning w/ SHIP, book 2 wks out" }, { who: "Theo", text: "slow but it's literally free" }] },
    { name: "Shattuck Family DDS", detail: "Downtown · Sat hours", mentions: 33, rating: 4.6, quotes: [{ who: "Maya", text: "only place open saturdays" }, { who: "Dev", text: "they gave me a toothbrush and a sticker" }] },
    { name: "Elmwood Dental", detail: "College Ave · pricey", mentions: 19, rating: 4.9, quotes: [{ who: "Jess", text: "fancy, $$$, but the TVs on the ceiling" }, { who: "Nico", text: "my parents' insurance only lol" }] },
  ],
  plus: [{ name: "Priya", pick: "Telegraph Smiles" }, { name: "Maya", pick: "Telegraph Smiles" }, { name: "Theo", pick: "Tang Center Dental" }],
} as const;
