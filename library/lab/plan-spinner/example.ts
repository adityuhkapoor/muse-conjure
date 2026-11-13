export default {
  title: "Saturday plan",
  why: "\"idk anything\" ×4 · so Muse spins it",
  date: "Sat, Nov 15",
  tapes: [
    {
      name: "Activity",
      options: [
        { label: "Mini golf", when: "4:00 PM", costCents: 1400, vetoedBy: "" },
        { label: "Eagle Peak hike", when: "3:00 PM", costCents: 0, vetoedBy: "Jess" },
        { label: "Bowling", when: "4:00 PM", costCents: 1200, vetoedBy: "" },
        { label: "Escape room", when: "3:30 PM", costCents: 3800, vetoedBy: "Dev" },
        { label: "Thrift crawl", when: "2:30 PM", costCents: 1000, vetoedBy: "" },
        { label: "Arcade bar", when: "4:30 PM", costCents: 1500, vetoedBy: "" },
      ],
    },
    {
      name: "Food",
      options: [
        { label: "Tacos El Gordo", when: "6:30 PM", costCents: 900, vetoedBy: "" },
        { label: "Omakase", when: "6:00 PM", costCents: 8500, vetoedBy: "Dev" },
        { label: "Hot pot", when: "6:30 PM", costCents: 2200, vetoedBy: "" },
        { label: "Gino's pizza", when: "6:00 PM", costCents: 800, vetoedBy: "" },
        { label: "Ramen Ya", when: "7:00 PM", costCents: 1600, vetoedBy: "" },
        { label: "Food trucks", when: "6:30 PM", costCents: 1200, vetoedBy: "" },
      ],
    },
    {
      name: "After",
      options: [
        { label: "Karaoke at Rose's", when: "8:30 PM", costCents: 500, vetoedBy: "" },
        { label: "Club Volt", when: "11:30 PM", costCents: 2000, vetoedBy: "Sam" },
        { label: "Movie at Sam's", when: "8:30 PM", costCents: 0, vetoedBy: "" },
        { label: "Dessert run", when: "8:00 PM", costCents: 600, vetoedBy: "" },
        { label: "Beach bonfire", when: "8:00 PM", costCents: 300, vetoedBy: "" },
        { label: "Rooftop bar", when: "10:30 PM", costCents: 1800, vetoedBy: "Sam" },
      ],
    },
  ],
  rules: [
    { text: "No hikes", who: "Jess's ankle" },
    { text: "Under $25", who: "Dev" },
    { text: "Home by 11", who: "Sam" },
  ],
  lockAt: 4,
};
