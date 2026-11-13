// The made-up friends, as people: how fast they answer, how much they say, which reaction they
// reach for, whether they just decide. Read from the fake chats in apps/shell (Maya organises,
// Aditya is easy-going and slow, Will is quick and dry, Calvin hypes, Arun says two words).

export type Persona = {
  id: string;
  first: string;
  /** notice delay for a new message, ms (before speed) */
  notice: [number, number];
  /** typing speed on a phone, characters per second */
  cps: number;
  /** 0-1: how likely to say something at all */
  chatty: number;
  /** favourite reaction, and a second one */
  react: [string, string];
  /** 0-1: goes for the finishing move instead of adding to it */
  decisive: number;
  /** 0-1: likes adding options and ideas */
  ideas: number;
  /** chance of a typo per message */
  typo: number;
  /** 0-1: how keen on a tool when one appears */
  keen: number;
  /** places this person would put on a food wheel */
  food: string[];
};

export const PERSONAS: Record<string, Persona> = {
  noa: { id: "noa", first: "Tsai Lin", notice: [2000, 7000], cps: 6, chatty: 0.45, react: ["😆", "❤️"], decisive: 0.6, ideas: 0.4, typo: 0.04, keen: 0.75, food: ["Pho", "Bagels"] },
  maya: { id: "maya", first: "Maya", notice: [1500, 5000], cps: 7, chatty: 0.6, react: ["❤️", "👍"], decisive: 0.8, ideas: 0.3, typo: 0.03, keen: 0.95, food: ["Ramen", "Sushi"] },
  dev: { id: "dev", first: "Aditya", notice: [4000, 12000], cps: 4.5, chatty: 0.35, react: ["😆", "👍"], decisive: 0.35, ideas: 0.6, typo: 0.08, keen: 0.7, food: ["Burgers", "Wings"] },
  priya: { id: "priya", first: "Will", notice: [2000, 6000], cps: 6.5, chatty: 0.55, react: ["😆", "😮"], decisive: 0.7, ideas: 0.5, typo: 0.04, keen: 0.85, food: ["Dumplings", "Thai"] },
  jonah: { id: "jonah", first: "Calvin", notice: [3000, 9000], cps: 5.5, chatty: 0.5, react: ["👍", "😆"], decisive: 0.5, ideas: 0.7, typo: 0.06, keen: 0.8, food: ["Dollar pizza", "Wings"] },
  theo: { id: "theo", first: "Arun", notice: [6000, 15000], cps: 5, chatty: 0.25, react: ["👍", "😮"], decisive: 0.9, ideas: 0.2, typo: 0.03, keen: 0.6, food: ["Halal cart", "Tacos"] },
};

export const PEOPLE_IDS = Object.keys(PERSONAS);

export const persona = (id: string): Persona => PERSONAS[id] ?? { ...PERSONAS.dev!, id, first: id[0]!.toUpperCase() + id.slice(1) };

export type Speed = "calm" | "normal" | "lively";

/** Delays are multiplied by `delay`; chances of saying or doing something by `talk`. */
export const SPEEDS: Record<Speed, { delay: number; talk: number; label: string }> = {
  calm: { delay: 1.6, talk: 0.6, label: "Calm" },
  normal: { delay: 1, talk: 1, label: "Normal" },
  lively: { delay: 0.6, talk: 1.4, label: "Lively" },
};
