const example = {
  listing: { name: "Road bike", priceCents: 22000 },
  buyer: "Calvin",
  buyerSaid: "i know nothing about bikes. is the pointy seat normal",
  parts: [
    { part: "tires", fixCents: 6000, check: { who: "Will", ok: true, note: "tires are new, like 100 miles on them" } },
    { part: "chain", fixCents: 1500, check: { who: "Will", ok: false, note: "chain's rusty, $15 fix" } },
    { part: "brakes", fixCents: 2500 },
    { part: "frame", fixCents: 0, check: { who: "Will", ok: true, note: "no cracks. aluminum, she's fine" } },
    { part: "saddle", fixCents: 3000 },
    { part: "gears", fixCents: 4000 },
  ],
};

export default example;
