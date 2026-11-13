const example = {
  author: "Maya",
  trip: "Lake Wren weekend",
  ago: "1d",
  questions: [
    { scene: "paddleboard", q: "who fell off the paddleboard first?", options: ["Will", "Calvin", "Arun", "Tsai Lin"], answer: 1 },
    { scene: "grill", q: "what did Arun cook on the grill?", options: ["Burgers", "Corn", "Rice, in the rice cooker", "Pineapple"], answer: 2 },
    { scene: "car", q: "whose car got stuck in the mud?", options: ["Maya", "Will", "Aditya", "Arun"], answer: 1 },
    { scene: "campfire", q: "who burned every single marshmallow?", options: ["Tsai Lin", "Calvin", "Maya", "Aditya"], answer: 0 },
    { scene: "tent", q: "who brought a color-coded packing list?", options: ["Arun", "Will", "Maya", "Calvin"], answer: 2 },
  ],
  played: [
    { who: "Will", picks: [1, 2, 1, 0, 2] },
    { who: "Tsai Lin", picks: [1, 2, 1, 0, 2] },
    { who: "Calvin", picks: [0, 2, 1, 2, 2] },
    { who: "Arun", picks: [1, 0, 1, 0, 2] },
  ],
};

export default example;
