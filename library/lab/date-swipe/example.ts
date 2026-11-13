export default {
  place: "Nashville",
  lockAt: 5,
  weekends: [
    { label: "Mar 6–8", month: "Mar", day: 6, span: "Thu–Sun", why: "midterms week tho", free: ["Priya", "Sam"] },
    { label: "Mar 13–15", month: "Mar", day: 13, span: "Thu–Sun", why: "break starts · flights $118", free: ["Priya", "Sam", "Ana", "Kev"] },
    { label: "Mar 27–29", month: "Mar", day: 27, span: "Thu–Sun", why: "Leo's bday weekend", free: ["Leo", "Ana", "Kev"] },
    { label: "Apr 10–12", month: "Apr", day: 10, span: "Thu–Sun", why: "warm out · fest crowds", free: ["Leo"] },
  ],
} as const;
