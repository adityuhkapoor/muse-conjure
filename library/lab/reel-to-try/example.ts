type Params = {
  reel: { from: string; note: string; account: string; caption: string; likes: string; place: string; area: string };
  spots: { name: string; area: string; tried: string; ratings: { by: string; stars: number }[]; want: string[] }[];
};

const example: Params = {
  reel: { from: "Maya", note: "Friday??", account: "sfbitesdaily", caption: "The $13 tonkotsu in Japantown that ended me", likes: "48K", place: "Marufuku Ramen", area: "Japantown" },
  spots: [
    { name: "Señor Sisig", area: "Mission", tried: "Oct 3", ratings: [{ by: "Priya", stars: 5 }, { by: "Sam", stars: 4 }], want: [] },
    { name: "Tartine", area: "Mission", tried: "Sep 20", ratings: [{ by: "Ana", stars: 4 }, { by: "Kev", stars: 5 }, { by: "Leo", stars: 4 }], want: [] },
    { name: "Mitchell's Ice Cream", area: "Bernal", tried: "", ratings: [], want: ["Sam", "Ana", "Kev"] },
    { name: "Boba Guys", area: "Hayes Valley", tried: "Aug 30", ratings: [{ by: "Jess", stars: 3 }, { by: "Nico", stars: 4 }, { by: "Leo", stars: 3 }], want: [] },
  ],
};

export default example;
