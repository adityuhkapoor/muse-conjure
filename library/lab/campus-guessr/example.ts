const example = {
  title: "Campus guessr",
  campus: "Eastfield",
  places: [
    { name: "Fenwick", kind: "building", x: 430, y: 190 },
    { name: "the Quad", kind: "green", x: 540, y: 460 },
    { name: "Larkin", kind: "building", x: 720, y: 250 },
    { name: "Hollis", kind: "building", x: 330, y: 620 },
    { name: "Lake Wren", kind: "lake", x: 160, y: 820 },
    { name: "Miller Hill", kind: "hill", x: 880, y: 760 },
    { name: "Lot C", kind: "lot", x: 860, y: 470 },
    { name: "Rook's", kind: "shop", x: 620, y: 860 },
  ],
  rounds: [
    { by: "Maya", scene: "pond", x: 230, y: 760, caption: "the bench by the pond, 7am, nobody else awake" },
    { by: "Calvin", scene: "library", x: 410, y: 175, caption: "Fenwick 4th floor, alarm number six" },
    { by: "Arun", scene: "pizza", x: 630, y: 850, caption: "Rook's at 1:40am. worth it" },
    { by: "Will", scene: "hill", x: 900, y: 730, caption: "top of Miller Hill, the Sube made it" },
    { by: "Tsai Lin", scene: "tree", x: 540, y: 400, caption: "the Quad's big oak, aux-free zone" },
  ],
  guesses: [
    { name: "Aditya", round: 1, x: 300, y: 690 },
    { name: "Will", round: 1, x: 180, y: 820 },
    { name: "Tsai Lin", round: 1, x: 420, y: 760 },
    { name: "Maya", round: 2, x: 470, y: 260 },
    { name: "Arun", round: 2, x: 700, y: 260 },
  ],
};

export default example;
