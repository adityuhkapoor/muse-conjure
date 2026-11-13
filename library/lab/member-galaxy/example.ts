export default {
  title: "Class galaxy",
  group: "Cal Class of '28",
  members: 6200,
  lenses: [
    { label: "By dorm", noun: "dorm", groups: [
      { label: "Unit 1", count: 1300, suggest: [{ name: "Zoe", mutual: 4 }, { name: "Raf", mutual: 3 }, { name: "Ivy", mutual: 2 }] },
      { label: "Unit 2", count: 2000, suggest: [{ name: "Kim", mutual: 6 }, { name: "Ben", mutual: 3 }, { name: "Omar", mutual: 2 }] },
      { label: "Clark Kerr", count: 988, suggest: [{ name: "Hana", mutual: 5 }, { name: "Gus", mutual: 2 }, { name: "Eli", mutual: 2 }] },
      { label: "Foothill", count: 936, suggest: [{ name: "Fran", mutual: 4 }, { name: "Lucía", mutual: 3 }, { name: "Kev", mutual: 1 }] },
      { label: "Off campus", count: 962, suggest: [{ name: "Nico", mutual: 3 }, { name: "Jess", mutual: 3 }, { name: "Dani", mutual: 2 }] },
    ] },
    { label: "By major", noun: "major", groups: [
      { label: "CS", count: 1860, suggest: [{ name: "Arjun", mutual: 5 }, { name: "Lena", mutual: 3 }, { name: "Marcus", mutual: 2 }] },
      { label: "Bio", count: 1116, suggest: [{ name: "Sofia", mutual: 4 }, { name: "Wes", mutual: 2 }, { name: "June", mutual: 1 }] },
      { label: "Econ", count: 992, suggest: [{ name: "Rohan", mutual: 3 }, { name: "Tess", mutual: 3 }, { name: "Caleb", mutual: 2 }] },
      { label: "Engineering", count: 1240, suggest: [{ name: "Mina", mutual: 6 }, { name: "Oscar", mutual: 2 }, { name: "Ruth", mutual: 2 }] },
      { label: "Undeclared", count: 992, suggest: [{ name: "Ava", mutual: 2 }, { name: "Felix", mutual: 2 }, { name: "Lou", mutual: 1 }] },
    ] },
  ],
  people: [
    { name: "Maya", at: ["Unit 2", "CS"] }, { name: "Theo", at: ["Unit 2", "Bio"] }, { name: "Noa", at: ["Clark Kerr", "Econ"] },
    { name: "Priya", at: ["Unit 1", "CS"] }, { name: "Jonah", at: ["Foothill", "Engineering"] }, { name: "Dev", at: ["Off campus", "CS"] },
  ],
} as const;
