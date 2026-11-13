const example = {
  title: "412 Pine mini golf",
  hole: "hole 3 · front door to the bathroom",
  par: 4,
  things: [
    { kind: "wall", x: 0, y: 220, w: 230, h: 16 },
    { kind: "wall", x: 330, y: 220, w: 270, h: 16 },
    { kind: "wall", x: 600, y: 0, w: 16, h: 316 },
    { kind: "wall", x: 616, y: 300, w: 150, h: 16 },
    { kind: "wall", x: 866, y: 300, w: 134, h: 16 },
    { kind: "rug", x: 120, y: 330, w: 260, h: 200 },
    { kind: "couch", x: 150, y: 420, w: 200, h: 64, label: "the couch" },
    { kind: "table", x: 420, y: 330, w: 140, h: 110, label: "table" },
    { kind: "cooker", x: 720, y: 430, w: 64, h: 64, label: "rice cooker" },
    { kind: "plant", x: 940, y: 580, w: 40, h: 40 },
    { kind: "bed", x: 30, y: 30, w: 170, h: 150, label: "Calvin's room" },
  ],
  start: { x: 70, y: 580 },
  cup: { x: 880, y: 130, label: "bathroom" },
  players: [
    { name: "Arun", strokes: 3, x: 880, y: 130, holed: true, said: "bounced it off the rice cooker on purpose" },
    { name: "Will", strokes: 2, x: 812, y: 360, said: "24 minutes in that bathroom, i know the line" },
    { name: "Maya", strokes: 2, x: 520, y: 560 },
    { name: "Calvin", strokes: 1, x: 300, y: 600, said: "the couch moved" },
  ],
};

export default example;
