export default {
  when: "Fri 9 PM",
  where: "Theo's projector",
  movies: [
    { title: "Dune: Part Two", by: "Theo", quote: "needs the big screen" },
    { title: "Paddington 2", by: "Dani", quote: "a perfect film, fight me" },
    { title: "Past Lives", by: "Theo", quote: "bring tissues" },
    { title: "Shrek 2", by: "Marcus", quote: "holding out for a hero" },
    { title: "Interstellar", by: "Theo", quote: "the docking scene" },
    { title: "Mean Girls", by: "Dani", quote: "it's october 3rd energy" },
    { title: "Spider-Verse", by: "Marcus", quote: "the animation tho" },
    { title: "The Notebook", by: "Dani", quote: "ironically. mostly." },
  ],
  picks: [
    { name: "Marcus", side: 0 },
    { name: "Theo", side: 0 },
    { name: "Dani", side: 1 },
  ],
} as const;
