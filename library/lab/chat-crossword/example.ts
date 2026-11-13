const example = {
  title: "The six mini",
  sub: "Monday · every clue is from the chat",
  rows: ["SLOT", "NOPE", "OVEN", "WENT"],
  clues: [
    { num: 1, dir: "across", text: "Lot C had one left. Will took it" },
    { num: 5, dir: "across", text: "Tsai Lin's answer to every aux request" },
    { num: 6, dir: "across", text: "What Arun says the rice cooker basically is" },
    { num: 7, dir: "across", text: "Who ___ to Kettle & Crumb without us" },
    { num: 1, dir: "down", text: "What shut Miller Hill down last week" },
    { num: 2, dir: "down", text: "Aditya's feelings for Golden Lantern, lowkey" },
    { num: 3, dir: "down", text: "Rook's is ___ till 2am" },
    { num: 4, dir: "down", text: "Will's Lake Wren sleeping plan" },
  ],
  solved: [
    { name: "Tsai Lin", answer: "NOPE" },
    { name: "Arun", answer: "OVEN" },
    { name: "Maya", answer: "SNOW" },
  ],
  misses: [{ name: "Calvin", guess: "NAPS", num: 1, dir: "across" }],
};

export default example;
