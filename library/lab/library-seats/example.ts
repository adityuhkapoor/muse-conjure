const example = {
  title: "Library seats",
  place: "Fenwick 3rd floor regulars",
  tables: [
    { name: "Window carrels", kind: "carrels", seats: 4, strangers: 2 },
    { name: "Long table", kind: "long", seats: 8, strangers: 3 },
    { name: "Round table", kind: "round", seats: 4, strangers: 2 },
    { name: "Round by the stairs", kind: "round", seats: 4, strangers: 4 },
  ],
  here: [
    { name: "Tsai Lin", table: "Long table", said: "long table, no aux allowed, it's perfect" },
    { name: "Arun", table: "Window carrels", said: "they said no rice cooker. I asked" },
    { name: "Will", table: "Round table" },
  ],
  saving: { by: "Will", for: "Calvin", table: "Round table", minutesLeft: 11 },
};

export default example;
