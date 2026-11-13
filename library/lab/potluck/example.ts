const example = {
  title: "Thanksgiving potluck",
  coming: 14,
  host: "Dad's turkey",
  plates: [
    { need: "potatoes", who: "Grandma Jo", dish: "mashed potatoes" },
    { need: "stuffing", who: "Mom", dish: "stuffing" },
    { need: "dessert", who: "Aunt Linda", dish: "pumpkin pie" },
    { need: "veggies", who: "", dish: "" },
    { need: "dessert", who: "Cousin Rae", dish: "apple pie" },
    { need: "mac", who: "Nate", dish: "mac & cheese" },
    { need: "dessert", who: "Aunt Bev", dish: "pecan pie" },
    { need: "drinks", who: "", dish: "" },
    { need: "rolls", who: "", dish: "" },
    { need: "", who: "Uncle T", dish: 'a "surprise"' },
  ],
  defaults: { veggies: "green beans", drinks: "cider + wine", rolls: "rolls", potatoes: "mashed potatoes", stuffing: "stuffing", mac: "mac & cheese" },
  tips: [
    { who: "Uncle T", to: "rolls", why: 'his "surprise" last year was lime jello' },
    { who: "Aunt Bev", to: "veggies", why: "3 pies for 14 people is a lot of pie" },
    { who: "Cousin Rae", to: "drinks", why: "she has the Costco card" },
  ],
};

export default example;
