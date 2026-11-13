const example = {
  title: "One group photo, this year",
  post: { by: "Tsai Lin", text: "we have no group photo from this year" },
  people: ["Aditya", "Calvin", "Arun", "Tsai Lin", "Will", "Maya"],
  days: [
    { dow: "Tue", date: "Dec 2", label: "", free: ["Maya", "Arun", "Calvin"] },
    { dow: "Wed", date: "Dec 3", label: "", free: ["Tsai Lin", "Maya"] },
    { dow: "Thu", date: "Dec 4", label: "", free: ["Arun", "Will", "Tsai Lin", "Aditya"] },
    { dow: "Fri", date: "Dec 5", label: "", free: ["Will", "Calvin"] },
    { dow: "Sat", date: "Dec 6", label: "formal", free: ["Calvin", "Arun", "Tsai Lin", "Will", "Maya"] },
    { dow: "Sun", date: "Dec 7", label: "", free: ["Maya", "Arun"] },
  ],
  remindAt: "8pm",
};

export default example;
