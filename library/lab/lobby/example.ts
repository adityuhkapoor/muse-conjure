export default {
  title: "Who's on tonight",
  people: [
    { name: "Bryan", reply: "on all night after 7", from: 2, to: 14, maybe: false },
    { name: "Kev", reply: "maybe after 10", from: 8, to: 14, maybe: true },
    { name: "Dev", reply: "9-11 then im out", from: 6, to: 10, maybe: false },
    { name: "Omar", reply: "after dinner ~8, done by 12", from: 4, to: 12, maybe: false },
  ],
} as const;
