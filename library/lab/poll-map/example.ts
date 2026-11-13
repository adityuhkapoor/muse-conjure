const example = {
  author: "Tsai Lin",
  ago: "5h",
  question: "best study spot on campus",
  options: [
    { label: "Fenwick 3rd floor", votes: 88, kind: "library", x: 250, y: 300 },
    { label: "Larkin basement", votes: 61, kind: "basement", x: 760, y: 250 },
    { label: "Kettle & Crumb", votes: 39, kind: "cafe", x: 780, y: 760 },
    { label: "The Quad lawn", votes: 24, kind: "lawn", x: 330, y: 720 },
  ],
  when: "Thursday 7pm",
  friends: [
    { who: "Tsai Lin", pick: 0, note: "silent floor or nothing" },
    { who: "Maya", pick: 0, note: "i'll bring the color-coded schedule" },
    { who: "Calvin", pick: 1, note: "fine, but larkin has outlets. setting 7 alarms for 6:55" },
    { who: "Arun", pick: 2 },
    { who: "Will", pick: 3, note: "the lawn is a study spot if you believe" },
  ],
  going: ["Tsai Lin", "Maya", "Calvin"],
};

export default example;
