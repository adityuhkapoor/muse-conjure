const example = {
  title: "Larkin laundry",
  sub: "everyone dry by 10 · tap bags in order",
  opens: 410,
  due: 600,
  washers: 4,
  dryers: 2,
  loads: [
    { who: "Will", what: "the comforter", wash: 50, dry: 80 },
    { who: "Calvin", what: "7 hoodies", wash: 35, dry: 50 },
    { who: "Maya", what: "darks, sorted", wash: 30, dry: 40 },
    { who: "Arun", what: "rice apron", wash: 30, dry: 45 },
    { who: "Tsai Lin", what: "gym stuff", wash: 35, dry: 35 },
    { who: "Aditya", what: "lowkey all of it", wash: 40, dry: 55 },
  ],
  board: [
    { name: "Maya", order: ["Calvin", "Maya", "Will", "Arun", "Aditya", "Tsai Lin"], said: "i made a sheet for this" },
    { name: "Arun", order: ["Calvin", "Maya", "Will", "Tsai Lin", "Aditya", "Arun"], said: "apron last, it needs to think" },
    { name: "Will", order: ["Will", "Calvin", "Maya", "Tsai Lin", "Arun", "Aditya"], said: "the comforter goes first. always." },
  ],
};

export default example;
