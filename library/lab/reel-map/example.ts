const example = {
  city: "Montreal",
  from: "Tsai Lin",
  quote: "we need to do this exact trip",
  spots: [
    { name: "Bagels on Fairmount", kind: "bread", x: 300, y: 250 },
    { name: "Mount Royal lookout", kind: "park", x: 130, y: 470 },
    { name: "Jean-Talon market", kind: "storefront", x: 640, y: 170 },
    { name: "The tiny bookstore", kind: "book", x: 560, y: 520 },
    { name: "Poutine at 2am", kind: "curry", x: 820, y: 640 },
  ],
  wants: [
    { who: "Tsai Lin", spots: [0, 1, 2, 3, 4] },
    { who: "Maya", spots: [0, 2, 3], note: "i made a tab for the bookstore already" },
    { who: "Will", spots: [1, 4] },
    { who: "Calvin", spots: [4], note: "2am poutine is the only reason i'm going" },
    { who: "Arun", spots: [2], note: "can the rice cooker come" },
  ],
  weekend: "Oct 10–13, the long weekend",
};

export default example;
