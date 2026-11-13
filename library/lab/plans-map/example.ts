const example = {
  title: "Our year in Eastfield",
  stats: { plans: 38, nights: 21, dinners: 14 },
  places: [
    { name: "Kettle & Crumb", kind: "coffee", x: 0.24, y: 0.36, visits: 7, who: ["Calvin", "Maya", "Aditya"], note: "Calvin: 7 alarms, 1 latte" },
    { name: "Golden Lantern", kind: "food", x: 0.56, y: 0.6, visits: 9, who: ["Arun", "Tsai Lin", "Will", "Maya", "Calvin", "Aditya"], note: "Arun: the dumpling count is classified" },
    { name: "Lake Wren", kind: "outdoor", x: 0.14, y: 0.78, visits: 3, who: ["Will", "Maya", "Arun"], note: "Will: the sube survived the puddle" },
    { name: "Rook's Pizza", kind: "food", x: 0.72, y: 0.36, visits: 6, who: ["Aditya", "Will", "Calvin", "Arun"], note: "Aditya: lowkey the best slice" },
    { name: "Midtown Lanes", kind: "night", x: 0.84, y: 0.74, visits: 4, who: ["Tsai Lin", "Will", "Calvin", "Maya"], note: "Tsai Lin vetoed the bowling playlist" },
    { name: "Miller Hill", kind: "outdoor", x: 0.88, y: 0.2, visits: 2, who: ["Arun", "Will", "Tsai Lin", "Calvin"], note: "Arun brought three trays" },
  ],
  favs: [
    { by: "Maya", place: "Lake Wren" },
    { by: "Will", place: "Midtown Lanes" },
    { by: "Arun", place: "Golden Lantern" },
    { by: "Tsai Lin", place: "Golden Lantern" },
  ],
};

export default example;
