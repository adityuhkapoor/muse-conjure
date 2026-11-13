export default {
  room: "Unit 4B",
  cols: 12,
  rows: 7,
  fixed: [
    { label: "Bed", kind: "bed", x: 9, y: 0, w: 3, h: 4 },
    { label: "Closet", kind: "closet", x: 0, y: 0, w: 2, h: 1 },
  ],
  finds: [
    { name: "Couch", priceCents: 18000, w: 4, h: 2, by: "Noa", at: null },
    { name: "Desk", priceCents: 9000, w: 3, h: 1, by: "Dev", at: null },
    { name: "Shelf", priceCents: 4000, w: 2, h: 1, by: "Maya", at: null },
    { name: "Chair", priceCents: 3500, w: 1, h: 1, by: "Dev", at: null },
    { name: "Rug", priceCents: 3000, w: 3, h: 3, by: "Maya", at: [5, 2] },
  ],
} as const;
