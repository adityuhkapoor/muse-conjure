const example = {
  place: "Tony's on 9th",
  messages: 23,
  baseCents: 2200,
  toppingCents: 125,
  tipPercent: 20,
  wings: { label: "10 wings", cents: 1300, note: "Marcus asked twice" },
  crew: [
    { name: "Marcus", quote: "pepperoni or i riot", toppings: ["pepperoni"], whatever: false },
    { name: "Dani", quote: "mush + olive. no pepp", toppings: ["mushroom", "olive"], whatever: false },
    { name: "Theo", quote: "whatever", toppings: [] as string[], whatever: true },
    { name: "Jess", quote: "pineapple. don't @ me", toppings: ["pineapple"], whatever: false },
  ],
};

export default example;
