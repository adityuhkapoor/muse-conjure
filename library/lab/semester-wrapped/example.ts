type Kind = "study" | "food" | "chat" | "music" | "night" | "squad";
type Card = { kind: Kind; title: string; big: string; unit: string; who: string; detail: string };
type Params = { term: string; cards: Card[]; opened: string[] };

const example: Params = {
  term: "Fall '26",
  cards: [
    { kind: "study", title: "Library hours", big: "212", unit: "hrs at Doe", who: "Leo", detail: "Mostly the 3rd floor" },
    { kind: "food", title: "Dining loyalty", big: "87", unit: "group visits", who: "Crossroads", detail: "Pesto pasta on Tuesdays" },
    { kind: "chat", title: "Chat MVP", big: "3,402", unit: "messages", who: "Maya", detail: "1,395 of them voice memos" },
    { kind: "music", title: "Pregame song", big: "61", unit: "plays", who: "Pink Pony Club", detail: "Always on Ana's aux" },
    { kind: "night", title: "Latest night", big: "4:12", unit: "am, finals week", who: "Kev", detail: "Dec 12, Moffitt" },
    { kind: "squad", title: "Holo rare", big: "6", unit: "of us, 1 semester", who: "The Unit 2 squad", detail: "Unit 2, floor 3" },
  ],
  opened: ["Ana", "Leo", "Kev", "Priya", "Theo"],
};

export default example;
