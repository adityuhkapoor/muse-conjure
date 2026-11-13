export default {
  group: "Cal Hackers", members: 31, place: "Soda 306", starts: "Jan 21",
  days: ["Mon", "Tue", "Wed", "Thu", "Fri"], times: ["5pm", "6pm", "7pm", "8pm", "9pm"],
  counts: [
    [8, 12, 9, 11, 6],
    [14, 17, 15, 17, 9],
    [18, 19, 19, 20, 12],
    [16, 20, 17, 19, 10],
    [9, 13, 11, 12, 5],
  ],
  people: [
    { name: "Maya", free: ["Tue 7pm", "Thu 7pm", "Tue 8pm"] },
    { name: "Theo", free: ["Tue 7pm", "Wed 7pm"] },
    { name: "Priya", free: ["Thu 7pm", "Tue 6pm"] },
    { name: "Dev", free: ["Mon 7pm", "Tue 7pm"] },
  ],
} as const;
