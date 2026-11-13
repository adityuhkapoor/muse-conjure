const example = {
  title: "Road trip crate",
  chat: "the six",
  forWhat: "the road trip",
  songs: [
    { title: "Lake Wren Summer", artist: "The Tidy Hours", secs: 192, from: "Maya" },
    { title: "Highway Snacks", artist: "Duplex Moon", secs: 168, from: "Will" },
    { title: "Snooze Button Love", artist: "Neon Cardigan", secs: 210, from: "Calvin" },
    { title: "Rice and Shine", artist: "Steam Club", secs: 175, from: "Arun" },
    { title: "Spreadsheet Heart", artist: "Cellmates", secs: 221, from: "Maya" },
    { title: "Sube Anthem", artist: "Parking Brake", secs: 242, from: "Will" },
    { title: "Lowkey", artist: "Low Tide Kid", secs: 185, from: "Aditya" },
    { title: "Golden Lantern", artist: "Paper Dragons", secs: 202, from: "Tsai Lin" },
    { title: "Night Drive to Millbrook", artist: "Glass Garage", secs: 238, from: "Calvin" },
    { title: "Miller Hill Sunrise", artist: "Early Birds Club", secs: 160, from: "Tsai Lin" },
  ],
  pulls: [
    { who: "Maya", songs: [0, 4, 7] },
    { who: "Will", songs: [1, 5] },
    { who: "Tsai Lin", songs: [7, 9] },
    { who: "Calvin", songs: [8] },
    { who: "Arun", songs: [3, 0] },
  ],
  vetoer: "Tsai Lin",
  stamps: 2,
  vetoed: [{ song: 5, note: "the Sube does not get an anthem" }],
};

export default example;
