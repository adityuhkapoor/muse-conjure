export default {
  title: "The girlies book", sub: "Ana's bday",
  props: [
    { who: "Lily", title: "Lily's arrival time", context: "Texted \"omw\" at 8:41. She was in the shower.", kind: "line", line: "9:15 PM", short: "Lily 9:15",
      lean: 720, trend: [500, 520, 510, 550, 540, 570, 580, 650, 632, 720, 685] },
    { who: "Ana", title: "Ana says \"literally\"", context: "It's her bday. She's already emotional.", kind: "line", line: "12.5", short: "Ana lit 12.5",
      lean: 710, trend: [550, 580, 600, 590, 620, 610, 640, 675, 640, 675, 728] },
    { who: "Maya", title: "Maya's \"just one drink\"", context: "Historically: never one. Never.", kind: "line", line: "3.5", short: "Maya 3.5",
      lean: 763, trend: [620, 660, 650, 680, 700, 690, 710, 763, 798, 728] },
  ],
  book: [ { who: "Sam", prop: 1, side: 1, pts: 100 }, { who: "Jess", prop: 2, side: 0, pts: 50 },
    { who: "Priya", prop: 0, side: 0, pts: 200 }, { who: "Zoe", prop: 1, side: 0, pts: 100 }, { who: "Lily", prop: 2, side: 0, pts: 150 },
    { who: "Ana", prop: 0, side: 1, pts: 50 }, { who: "Maya", prop: 1, side: 1, pts: 100 }, { who: "Priya", prop: 2, side: 0, pts: 100 },
    { who: "Zoe", prop: 0, side: 0, pts: 250 }, { who: "Lily", prop: 1, side: 0, pts: 100 }, { who: "Ana", prop: 2, side: 1, pts: 200 },
    { who: "Maya", prop: 0, side: 1, pts: 100 }, { who: "Priya", prop: 1, side: 0, pts: 150 }, { who: "Zoe", prop: 2, side: 0, pts: 100 },
    { who: "Ana", prop: 0, side: 0, pts: 100 }, { who: "Zoe", prop: 1, side: 1, pts: 50 } ],
};
