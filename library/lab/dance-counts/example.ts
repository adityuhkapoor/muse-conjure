const example = {
  title: "Formal dance, eight counts",
  from: "Maya",
  quote: "we're learning this for formal",
  counts: [
    { name: "step out", pose: "step" },
    { name: "clap", pose: "clap" },
    { name: "point", pose: "point" },
    { name: "hands up", pose: "up" },
    { name: "hip", pose: "hip" },
    { name: "the spin", pose: "spin" },
    { name: "kick", pose: "kick" },
    { name: "the dip", pose: "dip" },
  ],
  nailed: [
    { who: "Maya", counts: [1, 2, 3, 4, 5, 6, 7, 8] },
    { who: "Tsai Lin", counts: [1, 2, 3, 4, 5, 7, 8] },
    { who: "Arun", counts: [1, 2, 3, 4, 5, 7] },
    { who: "Will", counts: [1, 2, 3, 7] },
    { who: "Calvin", counts: [1, 2] },
  ],
  slots: [
    { label: "Thu 9pm · Larkin basement", free: ["Calvin", "Will", "Tsai Lin", "Aditya"] },
    { label: "Fri 4pm · the Quad", free: ["Maya", "Arun"] },
    { label: "Sun 2pm · 412 Pine", free: ["Will", "Calvin", "Arun", "Aditya", "Tsai Lin", "Maya"] },
  ],
};

export default example;
