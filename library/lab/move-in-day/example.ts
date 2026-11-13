const example = {
  title: "Move-in day",
  sub: "Sat · 412 Alder St",
  stops: [
    { time: "9:00", label: "Truck" },
    { time: "9:30", label: "Load" },
    { time: "10:40", label: "Drive" },
    { time: "11:15", label: "Unload" },
    { time: "1:00", label: "Pizza" },
  ],
  stage: 1,
  items: [
    { name: "Couch", need: 3, note: "Tilt it through the door", cuft: 110, kind: "couch", hands: ["Maya", "Theo"] },
    { name: "Mattress", need: 2, note: "Queen · very floppy", cuft: 60, kind: "mattress", hands: ["Priya"] },
    { name: "TV", need: 1, note: "The careful one", cuft: 30, kind: "tv", hands: [] },
  ],
  boxes: { label: "23 boxes", cuft: 160 },
  truckCuft: 400,
  after: "Pizza at 1, on Noa",
};

export default example;
