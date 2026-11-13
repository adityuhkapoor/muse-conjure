const example = {
  title: "Blind taste",
  sub: "“settle it: best pizza in Eastfield”",
  items: [
    { label: "Rook's", kind: "pizza" },
    { label: "Sal's", kind: "pizza" },
    { label: "Hollis pizza", kind: "pizza", note: "from the dining hall" },
    { label: "Frozen one", kind: "pizza", note: "Arun's, heated in the rice cooker" },
  ],
  ranks: [
    { who: "Calvin", order: [0, 3, 1, 2], said: "box 3 is clearly rook's. calling it" },
    { who: "Arun", order: [3, 0, 1, 2], said: "box 2 tastes like home" },
    { who: "Tsai Lin", order: [0, 1, 3, 2] },
    { who: "Will", order: [1, 3, 0, 2], said: "they're all good at 1am" },
    { who: "Maya", order: [0, 3, 2, 1], said: "scored them on a 12 point rubric" },
  ],
};

export default example;
