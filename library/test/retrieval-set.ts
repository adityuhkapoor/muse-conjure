// Asks for the library pieces added after the first nine, written the way college friends text,
// each mapped to the piece that should rank first. The factory's 30 asks
// (packages/factory/test/retrieval-set.ts) stay as they are; retrieval.test.ts runs both.
//
// CONFUSABLE asks were written before the new pieces existed and are kept fixed: each sits close
// to a new piece but must still route to an existing one. Do not tune keywords against them.

import type { RetrievalCase } from "../../packages/factory/test/retrieval-set.ts";

export const CONFUSABLE: RetrievalCase[] = [
  { ask: "muse spin for where we eat tonight", chat: ["sweetgreen", "the halal truck", "literally anything but dhall"], want: "wheel" },
  { ask: "vote on which airbnb", chat: ["the one in east nashville is $212 a night", "the germantown one has a hot tub"], want: "poll" },
  { ask: "who's taking which seat in my car", chat: ["i call shotgun", "theo has long legs"], want: "slots" },
  { ask: "venmo request everyone for the uber", chat: ["it was $41.80 total", "i paid"], want: "split" },
  { ask: "who's bringing what to the tailgate", chat: ["i got the speaker", "someone get ice"], want: "claims" },
  { ask: "make a chore wheel for the new place", chat: ["spin it so its fair", "i did trash last month"], want: "assign" },
  { ask: "are we actually going to nashville or not, need 4 to book", chat: ["im in", "depends on price"], want: "lock" },
  { ask: "when can everyone do a study session for orgo", chat: ["tue after 6", "wed is bad"], want: "overlap" },
  { ask: "bracket for best dining hall", chat: ["worcester", "frank", "berk", "hamp"], want: "bracket" },
  { ask: "who covered dinner, split it evenly", chat: ["leo paid $96 at nopa"], want: "split" },
];

export const NEW_ASKS: RetrievalCase[] = [
  { ask: "muse can we do the group ticket buy for the sza show", chat: ["floor is 189, lower bowl 129", "i can put it on my card"], want: "tickets" },
  { ask: "which tier are we getting for odesza", chat: ["GA is 95 w fees", "pit is 160 thats insane"], want: "tickets" },
  { ask: "ok who's covering the tickets and how much each", chat: ["5 of us for the warriors game", "upper deck 48 each"], want: "tickets" },

  { ask: "muse carpool to the away game", chat: ["i can drive 4", "kev has the minivan"], want: "carpool" },
  { ask: "who needs a ride to the formal, drivers say when ur leaving", chat: ["leaving at 7:15 from wilson", "i can take 3"], want: "carpool" },
  { ask: "pickup run for the ikea couch, who's driving", chat: ["need someone with an suv", "split gas?"], want: "carpool" },

  { ask: "open up our dinner to 3 more people", chat: ["we have a table for 8 at nopa", "only 5 of us confirmed"], want: "spots" },
  { ask: "muse post that we have 2 extra spots for the cabin", chat: ["priya's cousin wants in", "ask around"], want: "spots" },
  { ask: "let ppl request to join the hike, we have room for 4 more", chat: ["mt tam saturday 9am"], want: "spots" },

  { ask: "muse settle up nashville", chat: ["priya paid the airbnb 840", "sam did gas 96", "i got groceries 72.40"], want: "settle" },
  { ask: "untangle who owes who from the whole trip", chat: ["kev paid the bar tab", "leo got both ubers", "i covered breakfast"], want: "settle" },
  { ask: "can we square up all the ious from spring break", chat: ["i owe ana for the jet skis", "sam owes me 40"], want: "settle" },

  { ask: "muse snake draft the nashville itinerary", chat: ["hot chicken at hattie b's", "ryman tour", "broadway honky tonks"], want: "draft" },
  { ask: "lets draft chores so its fair, take turns picking", chat: ["bathroom is worst", "i want dishes"], want: "draft" },
  { ask: "draft order for picking rooms at the beach house", chat: ["the ocean view one is mine", "lol no"], want: "draft" },

  { ask: "everyone gets one veto, where are we eating", chat: ["tacos el gordo", "shake shack", "the ramen place"], want: "veto" },
  { ask: "muse veto game for the movie tonight", chat: ["oppenheimer again?", "not a horror"], want: "veto" },
  { ask: "knock options out until one is left for dinner", chat: ["nopa", "souvla", "zachary's"], want: "veto" },

  { ask: "muse help us shortlist sublets for summer", chat: ["found one in the mission $1450", "the soma one has a gym"], want: "shortlist" },
  { ask: "swipe through these couches and save the ones u like", chat: ["marketplace has a west elm one for 300", "the green velvet one"], want: "shortlist" },
  { ask: "shortlist apartments for next year", chat: ["4br on college ave $3800", "the one by safeway"], want: "shortlist" },

  { ask: "muse grocery list for the apt", chat: ["we're out of eggs", "TP is critical", "oat milk"], want: "list" },
  { ask: "who's doing the costco run, add what we need", chat: ["paper towels", "frozen dumplings"], want: "list" },
  { ask: "start a shared list for target", chat: ["shower curtain", "command hooks", "trash bags asap"], want: "list" },

  { ask: "gym streak board for the group", chat: ["day 1 of locking in", "i went at 6am"], want: "streak" },
  { ask: "muse track who checks in daily for the run club challenge", chat: ["loser buys smoothies sunday"], want: "streak" },
  { ask: "keep a streak for leetcode every day", chat: ["did 2 today", "skip saturday?"], want: "streak" },

  { ask: "rate this hinge profile out of 10", chat: ["he has a fish pic", "but he's 6'2"], want: "rate" },
  { ask: "is $350 fair for this couch, everyone give a number", chat: ["seems high", "west elm retail is 900"], want: "rate" },
  { ask: "everyone rate the new dining hall menu 1 to 10", chat: ["the stir fry was mid", "dessert bar goes hard"], want: "rate" },

  { ask: "muse slot machine for saturday, where budget and when", chat: ["frat row is a no", "maya is broke this week"], want: "reels" },
  { ask: "spin the plan: activity, food, after", chat: ["not bowling again", "under $20"], want: "reels" },
  { ask: "idk randomize our whole night out, place price and leave time", chat: ["not the mission", "leave by 10"], want: "reels" },

  { ask: "sign up sheet for move in day", chat: ["truck at 9am", "couch needs 3 people"], want: "shifts" },
  { ask: "booth shifts for the club fair, 2 people each", chat: ["10-12 and 12-2", "i can do morning"], want: "shifts" },
  { ask: "volunteer signups for the food drive", chat: ["setup 8am needs 4", "cleanup after 2"], want: "shifts" },

  { ask: "muse make a recap of the nashville trip", chat: ["that was insane", "we walked 60k steps"], want: "recap" },
  { ask: "semester wrapped for the group chat", chat: ["we sent 12k messages lol"], want: "recap" },
  { ask: "year in review for apt 4b", chat: ["the pans saga", "4 parties"], want: "recap" },
];
