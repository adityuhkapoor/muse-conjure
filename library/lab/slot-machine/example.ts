export default {
  title: "Tonight's plan",
  why: "“idk u pick” ×4 · rigged by the chat",
  reels: [
    { name: "Where", options: [ { label: "Lucky's", vetoed: false }, { label: "Frat Row", vetoed: true }, { label: "The Tap", vetoed: false },
      { label: "Pita Pit", vetoed: false }, { label: "Murphy's", vetoed: false }, { label: "Rooftop", vetoed: false } ] },
    { name: "Drinks", options: [ { label: "$3 drafts", vetoed: false }, { label: "$12 cocktails", vetoed: true }, { label: "$5 wells", vetoed: false },
      { label: "BYOB", vetoed: false }, { label: "$2 PBR", vetoed: false } ] },
    { name: "Leave at", options: [ { label: "10:15", vetoed: false }, { label: "9:45", vetoed: false }, { label: "1:30am", vetoed: true },
      { label: "10:30", vetoed: false }, { label: "11:00", vetoed: false } ] },
  ],
  rules: [ { text: "frat row", who: "Jess" }, { text: "$12+", who: "Maya's broke" }, { text: "past 11", who: "Sam 8am lab" } ],
  rest: [2, 3, 1],
};
