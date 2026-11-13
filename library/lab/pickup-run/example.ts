export default {
  title: "Couch pickup run",
  sub: "84″ couch · 3rd floor walk-up",
  item: "couch",
  route: { from: "Campus", to: "Seller · Rockridge", dist: "3.4 mi · 14 min" },
  cars: [
    { driver: "Maya", car: "Civic", kind: "hatch", fits: 0, seats: "5 seats" },
    { driver: "Dev", car: "Tacoma", kind: "truck", fits: 2, seats: "2 seats + bed" },
    { driver: "Jess", car: "Outback", kind: "wagon", fits: 1, seats: "5 seats + rack" },
  ],
  slots: [
    { label: "Sat 10:00", free: ["Sam", "Theo", "Noa"] },
    { label: "Sat 11:30", free: ["Sam", "Priya", "Theo", "Maya", "Noa"] },
    { label: "Sat 2:00", free: ["Priya", "Theo", "Maya"] },
  ],
  crew: 5,
  lifting: ["Theo"],
  need: 2,
};
