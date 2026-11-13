type Params = {
  reel: { from: string; note: string; account: string; title: string; plays: string };
  host: string; time: string; serves: number; costCents: number;
  items: { label: string; by: string }[];
  nights: { day: string; date: string; votes: string[] }[];
};

const example: Params = {
  reel: { from: "Dani", note: "We're making this", account: "cookwithjun", title: "15-min gochujang pasta", plays: "2.1M plays" },
  host: "Dani", time: "7pm", serves: 6, costCents: 4200,
  items: [
    { label: "Rigatoni", by: "Dani" }, { label: "Gochujang", by: "Dani" }, { label: "Heavy cream", by: "Theo" },
    { label: "Parmesan", by: "" }, { label: "Garlic", by: "Ana" }, { label: "Butter", by: "" },
    { label: "Scallions", by: "Ana" }, { label: "Red wine", by: "Marcus" }, { label: "Mochi", by: "" },
  ],
  nights: [
    { day: "Thu", date: "Nov 19", votes: ["Marcus"] },
    { day: "Fri", date: "Nov 20", votes: ["Dani", "Theo", "Ana"] },
    { day: "Sun", date: "Nov 22", votes: [] },
  ],
};

export default example;
