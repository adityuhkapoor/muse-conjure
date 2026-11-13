const example = {
  place: "412 Pine",
  ends: "lease ends May 31",
  roommates: ["Aditya", "Calvin", "Arun", "Will"],
  items: [
    { name: "TV", kind: "tv" },
    { name: "Couch", kind: "couch" },
    { name: "Air fryer", kind: "airfryer" },
    { name: "Rice cooker", kind: "cooker" },
  ],
  bids: [
    { item: 0, who: "Calvin", cents: 12000 },
    { item: 1, who: "Will", cents: 6000, said: "the sube can fit it if we take the seats out" },
    { item: 3, who: "Will", cents: 4000 },
    { item: 3, who: "Arun", cents: 4100, said: "+$1. always +$1." },
  ],
};

export default example;
