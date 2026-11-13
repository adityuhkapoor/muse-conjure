export default {
  photos: [
    {
      place: "Gulf Shores, day 2",
      scene: "beach",
      captions: [
        { by: "Priya", text: "Theo's final form: low maintenance", voters: [] },
        { by: "Noa", text: "He said he wanted to ‘ground himself’", voters: ["Priya", "Theo"] },
        { by: "Dev", text: "Sunscreen: 0. Theo: also 0.", voters: ["Jonah"] },
        { by: "Jonah", text: "Tide comes in at 4. We leave at 3:55", voters: ["Dev", "Noa"] },
      ],
    },
    {
      place: "Smoky Mtns, night 1",
      scene: "camp",
      captions: [
        { by: "Theo", text: "Jonah set up the tent. Jonah is now the tent.", voters: ["Noa"] },
        { by: "Dev", text: "5-star glamping, 0-star engineering", voters: ["Priya", "Theo"] },
        { by: "Noa", text: "We asked if he needed help. “I got it”", voters: ["Jonah"] },
        { by: "Priya", text: "The bears are not the threat here", voters: ["Dev"] },
      ],
    },
  ],
} as const;
