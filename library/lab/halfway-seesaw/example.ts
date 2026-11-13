const example = {
  title: "Meet in the middle",
  quote: "you're at Larkin, i'm at Second Chapter. where do we meet",
  quoteBy: "Arun",
  people: [
    { name: "Arun", at: "Larkin Hall", x: 0.1, y: 0.78 },
    { name: "Calvin", at: "Second Chapter", x: 0.9, y: 0.2 },
  ],
  spots: [
    { name: "Kettle & Crumb", x: 0.47, y: 0.52, minA: 9, minB: 8 },
    { name: "Rook's Pizza", x: 0.28, y: 0.3, minA: 6, minB: 14 },
    { name: "Tío's Tacos", x: 0.7, y: 0.72, minA: 13, minB: 7 },
    { name: "The Quad", x: 0.55, y: 0.18, minA: 12, minB: 5 },
  ],
  picked: ["Rook's Pizza", ""],
};

export default example;
