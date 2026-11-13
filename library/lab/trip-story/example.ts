type Params = {
  city: string; days: number; dates: string;
  stops: { label: string; x: number; y: number }[];
  miles: string; milesNote: string;
  moment: string;
  mvp: { who: string; facts: string[] };
  costs: { label: string; cents: number }[];
  next: string;
};

const example: Params = {
  city: "Nashville", days: 4, dates: "Mar 13-16",
  stops: [
    { label: "Airbnb", x: 0.88, y: 0.42 }, { label: "Broadway", x: 0.51, y: 0.53 }, { label: "Hattie B's", x: 0.34, y: 0.29 },
    { label: "Parthenon", x: 0.18, y: 0.76 }, { label: "The Opry", x: 0.83, y: 0.84 },
  ],
  miles: "31.4 mi", milesNote: "42,118 steps each",
  moment: "1:12am · Ana got on stage at Robert's",
  mvp: { who: "Priya", facts: ["Booked all 3 nights", "Found the $4 tacos", "0 missed flights"] },
  costs: [
    { label: "Airbnb, East Nash", cents: 96000 }, { label: "Hot chicken and tacos", cents: 61200 },
    { label: "Broadway drinks", cents: 34400 }, { label: "Ubers", cents: 18000 }, { label: "Boots", cents: 8800 },
  ],
  next: "Nash '27",
};

export default example;
