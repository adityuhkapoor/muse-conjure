const example = {
  title: "Airport shuttle",
  group: "Eastfield Class of '28",
  to: "BDL airport",
  asked: 31,
  runs: [
    { day: "Thu", time: "4:15p", stop: "Larkin Hall", seats: 14, outside: 9 },
    { day: "Fri", time: "10:00a", stop: "The Quad", seats: 14, outside: 14 },
    { day: "Fri", time: "12:10p", stop: "Larkin Hall", seats: 14, outside: 6 },
    { day: "Fri", time: "1:40p", stop: "The Quad", seats: 14, outside: 8, riders: ["Maya", "Tsai Lin"] },
    { day: "Fri", time: "3:40p", stop: "Lot C", seats: 14, outside: 7, riders: ["Calvin", "Arun"], last: true },
  ],
  said: [
    { name: "Maya", text: "flight's 5:50. 1:40 is already in the spreadsheet" },
    { name: "Calvin", text: "setting all seven alarms for this one" },
    { name: "Arun", text: "the rice cooker is coming home with me" },
  ],
};

export default example;
