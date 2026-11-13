const example = {
  title: "Late night order",
  shop: "Golden Lantern",
  minCents: 2500,
  feeCents: 399,
  menu: [
    { label: "egg tarts", cents: 450, kind: "box" },
    { label: "shrimp chips", cents: 300, kind: "bag" },
    { label: "pork dumplings", cents: 850, kind: "tray" },
    { label: "bubble tea", cents: 575, kind: "cup" },
    { label: "fried rice", cents: 925, kind: "box" },
    { label: "scallion pancake", cents: 600, kind: "tray" },
  ],
  cart: [
    { who: "Arun", item: "pork dumplings" },
    { who: "Tsai Lin", item: "bubble tea" },
    { who: "Will", item: "fried rice" },
  ],
  said: { who: "Arun", said: "i'm so hungry i could cry" },
};

export default example;
