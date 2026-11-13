type Params = { rows: { who: string; shout: string }[]; grid: string[] };

const example: Params = {
  rows: [{ who: "Priya", shout: "Yeehaw" }, { who: "Sam", shout: "Bruh" }, { who: "Ana", shout: "Clap" }, { who: "Leo", shout: "Boom" }],
  grid: ["........", "...x...x", "..x...x.", "x...x.x."],
};

export default example;
