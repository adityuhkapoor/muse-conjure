export default {
  teams: [
    { name: "Aux Cords", people: ["Maya", "Noa", "Dev"] },
    { name: "Late Again", people: ["Jonah", "Priya", "Theo"] },
  ],
  questions: [
    { about: "Dev", q: "How many times has Dev said “last one, I swear” this month?", opts: ["3", "7", "12", "19"], answer: 2, note: "12 times. There were 14 last ones." },
    { about: "Jonah", q: "Whose Uber rating is a 4.62?", opts: ["Maya", "Jonah", "Theo", "Noa"], answer: 1, note: "He slammed one door. One door." },
    { about: "Theo", q: "What did Theo name his car?", opts: ["Big Sauce", "The Tank", "Shirley", "Lightning"], answer: 2, note: "Shirley: 212k miles and a cassette deck." },
    { about: "the chat", q: "Most-sent reaction in this chat?", opts: ["Skull", "Crying laughing", "The goat", "Thumbs up"], answer: 0, note: "4,812 skulls since 2022." },
    { about: "Noa", q: "Who left the chat in 2023 and rejoined 9 minutes later?", opts: ["Dev", "Priya", "Theo", "Noa"], answer: 3, note: "She said it was an accident. It was not." },
  ],
  stake: "the wings",
  where: "Thursday at Buffalo Joe's",
} as const;
