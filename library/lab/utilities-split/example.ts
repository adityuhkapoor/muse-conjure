export default {
  title: "October utilities", due: "due Nov 15",
  bills: [
    { name: "Electric", cents: 14230, usage: "612 kWh · up from 443", level: 0.88 },
    { name: "Wi-Fi", cents: 6000, usage: "Flat · 500 Mbps", level: 0.5 },
    { name: "Water", cents: 4780, usage: "3,100 gal", level: 0.42 },
    { name: "Gas", cents: 3590, usage: "Heat's back on", level: 0.3 },
  ],
  people: ["Maya", "Noa", "Theo", "Dev"], payer: "Maya",
  heavy: { name: "Theo", note: "ran the AC 24/7", overageCents: 5200 },
  agree: ["Noa", "Dev"], paid: [{ name: "Noa", cents: 7150 }],
};
