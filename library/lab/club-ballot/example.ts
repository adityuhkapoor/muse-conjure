const example = {
  title: "Climbing club election",
  club: "Eastfield Climbing Club",
  members: 212,
  role: "President",
  closes: "Fri 6pm",
  candidates: [
    { name: "Priya", pitch: "more weeknight sessions" },
    { name: "Jonah", pitch: "a real trip to the Gunks" },
    { name: "Calvin", pitch: "7am bouldering. I have the alarms" },
  ],
  outside: [
    { rank: ["Priya", "Jonah", "Calvin"], n: 14 }, { rank: ["Priya", "Calvin", "Jonah"], n: 6 },
    { rank: ["Jonah", "Priya", "Calvin"], n: 12 }, { rank: ["Jonah", "Calvin", "Priya"], n: 7 }, { rank: ["Jonah"], n: 3 },
    { rank: ["Calvin", "Priya", "Jonah"], n: 6 }, { rank: ["Calvin", "Jonah", "Priya"], n: 7 },
  ],
  voted: [
    { name: "Tsai Lin", rank: ["Jonah", "Priya", "Calvin"], said: "jonah promised me the aux on the drive" },
    { name: "Arun", rank: ["Priya", "Jonah"], said: "weeknights = rice cooker dinners after" },
    { name: "Will", rank: ["Jonah", "Calvin", "Priya"], said: "gunks or bust. the sube fits 4" },
    { name: "Maya", rank: ["Priya", "Calvin", "Jonah"], said: "I made a spreadsheet of all three platforms" },
  ],
};

export default example;
