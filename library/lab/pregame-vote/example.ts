const example = {
  title: "Pregame before the Greek",
  sub: "Doors 7:00 · 7 going",
  venue: "The Greek",
  doorsMin: 1140,
  spots: [
    { name: "Jana's apt", walk: 14, x: 0.205, y: 0.63, voters: ["Maya", "Theo"] },
    { name: "Top Dog", walk: 11, x: 0.437, y: 0.37, voters: ["Noa", "Jonah"] },
    { name: "Memorial Glade", walk: 7, x: 0.658, y: 0.75, voters: ["Priya", "Dev"] },
  ],
  times: [
    { label: "6:00 PM", voters: ["Jonah"] },
    { label: "6:30 PM", voters: ["Maya", "Noa", "Priya"] },
    { label: "7:00 PM", voters: ["Theo", "Dev"] },
  ],
  streets: [
    { name: "Bancroft", x: 0.32, y: 0.8 },
    { name: "Piedmont", x: 0.76, y: 0.95 },
  ],
};

export default example;
