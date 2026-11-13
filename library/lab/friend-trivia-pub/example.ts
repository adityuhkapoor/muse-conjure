type Params = {
  title: string;
  by: string;
  plays: number;
  questions: { about: string; q: string; options: string[]; answer: number }[];
  played: { who: string; picks: number[]; points: number[] }[];
};

const example: Params = {
  title: "How well do you know Unit 7?",
  by: "Maya",
  plays: 212,
  questions: [
    { about: "Maya", q: "Maya's boba order, every time?", options: ["Taro milk tea", "Brown sugar", "Thai tea", "Matcha latte"], answer: 1 },
    { about: "Theo", q: "Theo's major?", options: ["Econ", "Film", "Data science", "Undeclared"], answer: 2 },
    { about: "Leo", q: "How many hot sauces are in Leo's fridge?", options: ["4", "9", "14", "22"], answer: 2 },
    { about: "Priya", q: "Priya's karaoke song?", options: ["Mr. Brightside", "Dancing Queen", "Since U Been Gone", "Valerie"], answer: 2 },
    { about: "the group", q: "Where did Unit 7 first hang out?", options: ["Laundry room", "Ike's line", "The 3am fire drill", "CS 61A lab"], answer: 2 },
  ],
  played: [
    { who: "Leo", picks: [1, 2, 2, 0, 2], points: [160, 180, 200, 0, 150] },
    { who: "Priya", picks: [0, 2, 3, 2, 2], points: [0, 150, 0, 190, 170] },
    { who: "Sam", picks: [1, 3, 2, 2, 1], points: [140, 0, 120, 130, 0] },
    { who: "Theo", picks: [2, 3, 1, 2, 2], points: [0, 0, 0, 110, 140] },
    { who: "Ana", picks: [1, 2, 2, 2, 2], points: [190, 170, 150, 180, 160] },
  ],
};
export default example;
