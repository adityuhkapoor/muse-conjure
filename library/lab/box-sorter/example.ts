const example = {
  owner: "Arun",
  when: "moves out in 14 days",
  items: [
    { name: "40 hangers", kind: "hangers", priceCents: 0 },
    { name: "Mini fridge", kind: "fridge", priceCents: 4000 },
    { name: "Rice cooker", kind: "cooker", priceCents: 3000, noSell: true },
    { name: "Desk lamp", kind: "lamp", priceCents: 1200 },
    { name: "Desk chair", kind: "chair", priceCents: 2500 },
    { name: "Orgo textbooks", kind: "books", priceCents: 6000 },
    { name: "Pothos plant", kind: "plant", priceCents: 800 },
    { name: "Box fan", kind: "fan", priceCents: 1500 },
    { name: "Full mirror", kind: "mirror", priceCents: 2000 },
  ],
  sorted: [
    { item: 0, box: "give", who: "Calvin", said: "nobody needs 40 hangers" },
    { item: 1, box: "sell", who: "Maya", said: "$40 firm, i've seen the comps" },
    { item: 2, box: "keep", who: "Arun", said: "obviously" },
  ],
};

export default example;
