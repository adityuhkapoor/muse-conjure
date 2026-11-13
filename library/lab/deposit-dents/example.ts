const example = {
  home: "412 Pine",
  keptCents: 34000,
  rooms: [
    { name: "Aditya", kind: "bed", who: "Aditya" },
    { name: "Calvin", kind: "bed", who: "Calvin" },
    { name: "Bath", kind: "bath" },
    { name: "Arun", kind: "bed", who: "Arun" },
    { name: "Will", kind: "bed", who: "Will" },
    { name: "Living room", kind: "living" },
    { name: "Kitchen", kind: "kitchen" },
  ],
  roommates: ["Aditya", "Calvin", "Arun", "Will"],
  charges: [
    { label: "Wall dent", cents: 12000, room: "Living room" },
    { label: "Burned counter", cents: 16000, room: "Kitchen", owner: "Arun", by: "Calvin", said: "it was the rice cooker. everyone knows" },
    { label: "Missing blind", cents: 6000, room: "Calvin" },
  ],
};

export default example;
