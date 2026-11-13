const example = {
  place: "the Airbnb",
  totalCents: 61200,
  beds: [
    { label: "Queen", kind: "queen", spots: 2, premiumCents: 1400, room: "Big room" },
    { label: "Double", kind: "double", spots: 2, premiumCents: 0, room: "Small room" },
    { label: "Couch", kind: "couch", spots: 1, premiumCents: -800, room: "Living room" },
    { label: "Air mattress", kind: "air", spots: 1, premiumCents: -2000, room: "Living room" },
  ],
  crew: ["Aditya", "Calvin", "Arun", "Tsai Lin", "Will", "Maya"],
  claimed: [
    { who: "Will", bed: 0, said: "i'll throw in $30 for the queen" },
    { who: "Maya", bed: 1 },
    { who: "Tsai Lin", bed: 1, said: "we're sharing, obviously" },
    { who: "Arun", bed: 3, said: "me and the rice cooker are low maintenance" },
  ],
};

export default example;
