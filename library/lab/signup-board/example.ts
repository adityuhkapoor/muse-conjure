export default {
  title: "Move-in day signups", group: "Unit 2 Volunteers", date: "Sat, Aug 23", meet: "Unit 2 lobby",
  shifts: ["8–10am", "10–12", "12–2pm"],
  roles: [
    { label: "Cart crew", icon: "cart", cap: 4, others: [["Sam"], ["Leo", "Kev"], ["Ana"]] },
    { label: "Check-in", icon: "clipboard", cap: 2, others: [["Jess"], ["Marco"], ["Eli"]] },
    { label: "Water", icon: "water", cap: 2, others: [["Dani"], ["Zoe"], ["Omar"]] },
    { label: "Elevators", icon: "elevator", cap: 3, others: [["Ben", "Ivy"], ["Kim"], ["Raf", "Hana", "Gus"]] },
  ],
  people: [
    { name: "Maya", role: "Cart crew", shift: "8–10am" }, { name: "Dev", role: "Cart crew", shift: "8–10am" },
    { name: "Theo", role: "Cart crew", shift: "8–10am" }, { name: "Priya", role: "Check-in", shift: "8–10am" },
    { name: "Noa", role: "Water", shift: "10–12" },
  ],
} as const;
