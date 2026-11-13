const example = {
  title: "Fridge cleanout",
  deadline: "Sun 9pm",
  items: [
    { owner: "Will", label: "pad thai", kind: "takeout", days: 9 },
    { owner: "Arun", label: "rice cooker biryani", kind: "tub", days: 6 },
    { owner: "Calvin", label: "yogurt", kind: "cup", days: 3 },
    { owner: "Aditya", label: "half a burrito", kind: "foil", days: 5 },
    { owner: "Maya", label: "meal prep (blue lid)", kind: "tub", days: 2, fate: "eat" },
    { owner: "Tsai Lin", label: "Golden Lantern dumplings", kind: "takeout", days: 4, fate: "eat" },
    { owner: "", label: "the jar", kind: "jar", days: 14 },
    { owner: "Will", label: "milk", kind: "carton", days: 11 },
    { owner: "Calvin", label: "Rook's slice", kind: "slice", days: 7, fate: "toss" },
    { owner: "Arun", label: "more rice", kind: "bowl", days: 8 },
  ],
  said: [
    { who: "Maya", said: "something in the fridge is alive" },
    { who: "Will", said: "the pad thai is fine. it's aging" },
  ],
};

export default example;
