export default {
  group: "SF Roommate Exchange",
  took: 412,
  listings: [
    { name: "Marco", hood: "SoMa", note: "startup, big kitchen", answers: [1, 1, 1, 2, 2, 2] },
    { name: "Kai", hood: "Inner Richmond", note: "grad student, quiet", answers: [0, 0, 0, 2, 1, 1] },
    { name: "Dani", hood: "Temescal", note: "DJ on weekends", answers: [2, 2, 2, 1, 1, 0] },
    { name: "Rosa", hood: "Mission", note: "has a cat named Tofu", answers: [1, 0, 1, 1, 0, 1] },
    { name: "Jess", hood: "Nob Hill", note: "nurse, night shifts", answers: [2, 1, 0, 0, 1, 2] },
    { name: "Leo", hood: "Sunset", note: "surfs, up at 6", answers: [0, 1, 1, 0, 0, 0] },
    { name: "Ana", hood: "Lower Haight", note: "Priya's friend", answers: [1, 0, 1, 1, 1, 1] },
  ],
  people: [
    { name: "Noa", picks: [1, 0, 1, 1, 1, 1], hi: ["Ana"] },
    { name: "Dev", picks: [2, 1, 2] },
  ],
} as const;
