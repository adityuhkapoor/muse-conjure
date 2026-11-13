// 123 asks for routing to a lab tool, typed the way people type them in a group chat, each with the
// lab tool ids that would be a right answer. `ok: []` means nothing in the lab fits and the right
// answer is "nothing fits". A few lines of chat where the ask leans on it. All people are made up.
// Nobody tunes the keyword lane or the router prompt on the "held" half (every second ask).

import type { Surface } from "../src/types.ts";

export type RoutingAsk = { ask: string; ok: string[]; surface?: Surface; chat?: string[] };

const MONEY = ["settle-up", "tab-claim"];
const PICK = ["slot-machine", "plan-spinner", "dinner-veto", "bill-roulette"];
const WHO_IN = ["squad-lock", "trip-lock", "after-vote", "date-swipe"];
const WHEN = ["lobby", "meeting-time", "date-swipe"];
const RANK = ["tier-list", "best-of", "feed-tier-list", "smash-elo"];
const BRING = ["bring-list", "potluck"];
const CHORES = ["chore-wheel", "chore-draft"];
const GAME = ["imposter", "two-truths", "trivia-night", "kings-cup", "friend-trivia-pub", "road-bingo"];

export const ROUTING_ASKS: RoutingAsk[] = [
  // picking for the group
  { ask: "muse pick for us", ok: PICK, chat: ["thai basil or sushi ko", "idk u pick"] },
  { ask: "can someone just pick", ok: PICK, chat: ["tacos or pho", "i dont care"] },
  { ask: "muse decide for us we've been going back and forth for an hour", ok: PICK },
  { ask: "ok muse u choose where we eat", ok: PICK },
  { ask: "muse spin for it", ok: PICK },
  { ask: "everyone veto one place and whatever's left wins", ok: ["dinner-veto"] },
  { ask: "muse where should we go tonight, nobody can decide", ok: ["slot-machine", "plan-spinner"] },
  { ask: "plan our saturday for us muse, activity food and after", ok: ["plan-spinner", "slot-machine", "trip-draft"] },
  { ask: "muse who's paying tonight, spin the wheel", ok: ["bill-roulette"] },
  { ask: "loser of the wheel covers dinner", ok: ["bill-roulette"] },
  { ask: "muse anything but sushi, help us pick dinner", ok: ["dinner-veto", "slot-machine"] },
  { ask: "idk anything works just pick something muse", ok: PICK },
  // money
  { ask: "who still owes me for the uber", ok: MONEY, chat: ["uber was $48 i paid", "ill venmo u"] },
  { ask: "muse who owes who", ok: MONEY },
  { ask: "can we settle up the trip finally", ok: ["settle-up"] },
  { ask: "muse split the airbnb", ok: ["settle-up", "rent-split"] },
  { ask: "i paid for everyones food tonight, here's the receipt, tap what you had", ok: ["tab-claim"] },
  { ask: "split the bill by what everyone ordered", ok: ["tab-claim"] },
  { ask: "muse venmo requests for the groceries", ok: MONEY },
  { ask: "how do we split rent if my room is bigger", ok: ["rent-split"] },
  { ask: "electric bill came in, split it", ok: ["utilities-split"] },
  { ask: "whos running the ac, split utilities fairly", ok: ["utilities-split"] },
  { ask: "muse lets all chip in for jakes birthday present", ok: ["gift-pool", "bday-pool"] },
  { ask: "collect $20 each for priyas gift", ok: ["gift-pool", "bday-pool"] },
  { ask: "muse who hasnt paid club dues", ok: ["club-dues"], surface: "group" },
  { ask: "we're buying a couch together, who gets it which week", ok: ["split-purchase"], surface: "marketplace" },
  // who's in, plans
  { ask: "who's in for friday", ok: WHO_IN },
  { ask: "muse headcount for the concert", ok: ["squad-lock", "concert"] },
  { ask: "who's down for nashville in march", ok: ["trip-lock", "date-swipe", "squad-lock"] },
  { ask: "we need to figure out friday", ok: ["after-vote", "squad-lock", "lobby", "plan-spinner", "slot-machine"] },
  { ask: "muse lock the trip once 4 of us commit", ok: ["trip-lock"] },
  { ask: "which weekend works for the beach", ok: ["date-swipe"] },
  { ask: "muse when is everyone free tonight", ok: ["lobby"] },
  { ask: "what time works for the weekly meeting", ok: ["meeting-time"], surface: "group" },
  { ask: "muse find a time we can all do", ok: WHEN },
  { ask: "who's on tonight, new season dropped", ok: ["lobby"] },
  { ask: "after the show where are we going", ok: ["after-vote"], surface: "event" },
  { ask: "where do we meet before the game and when", ok: ["pregame-vote"], surface: "event" },
  { ask: "muse plan the trip", ok: ["trip-draft", "trip-lock"] },
  { ask: "lets draft the itinerary, everyone picks two things", ok: ["trip-draft"] },
  { ask: "muse rsvp for my party", ok: ["squad-lock", "host-board"], surface: "event" },
  { ask: "who's coming to my place saturday and are they bringing anyone", ok: ["host-board", "squad-lock"], surface: "event" },
  { ask: "we have 3 open spots on the hike, who wants them", ok: ["open-spots"], surface: "event" },
  { ask: "muse which section should we sit in for sza", ok: ["concert", "ticket-split"] },
  { ask: "split the tickets, i'll front it", ok: ["ticket-split"], surface: "event" },
  { ask: "who's driving to the game", ok: ["event-carpool"] },
  { ask: "muse rides to the concert, i have 3 seats", ok: ["event-carpool"] },
  // food
  { ask: "what should everyone bring", ok: BRING },
  { ask: "muse potluck list for friendsgiving", ok: BRING },
  { ask: "who's bringing what for thanksgiving", ok: BRING },
  { ask: "we're out of everything, grocery list", ok: ["grocery"] },
  { ask: "muse add oat milk and eggs to the list, someone do a run", ok: ["grocery"] },
  { ask: "ordering pizza, what toppings", ok: ["pizza"] },
  { ask: "muse split a pizza order, i want pepperoni", ok: ["pizza"] },
  { ask: "this recipe reel looks easy, cook night?", ok: ["reel-cook-night"], surface: "story" },
  { ask: "we need to try these dumpling places", ok: ["reel-to-try"] },
  // chores, home
  { ask: "muse assign chores", ok: CHORES },
  { ask: "who's on dishes this week", ok: CHORES },
  { ask: "chore wheel pls the sink is a biohazard", ok: ["chore-wheel"] },
  { ask: "draft the chores, bathrooms count double", ok: ["chore-draft"] },
  { ask: "moving saturday, need hands for the couch and the bed", ok: ["move-in-day"] },
  { ask: "muse help me move out, friends get first dibs on my stuff", ok: ["move-out-sale"], surface: "marketplace" },
  { ask: "who can help pick up the dresser, whose car fits it", ok: ["pickup-run"], surface: "marketplace" },
  { ask: "will this shelf fit in our room", ok: ["room-fit"], surface: "marketplace" },
  { ask: "is $120 fair for this loveseat", ok: ["price-check"], surface: "marketplace" },
  { ask: "which of these couches should we get, vote", ok: ["group-buy"], surface: "marketplace" },
  { ask: "find me a sublet under 1200", ok: ["sublet-finder"], surface: "group" },
  { ask: "who in the group is looking for a roommate", ok: ["roommate-match"], surface: "group" },
  // ranking, votes
  { ask: "rank the dining halls", ok: RANK },
  { ask: "tier list of late night food", ok: ["tier-list", "feed-tier-list"] },
  { ask: "muse make a bracket", ok: ["movie-bracket", "bracket-post"] },
  { ask: "movie night, bracket the ones we mentioned", ok: ["movie-bracket"] },
  { ask: "best burrito near campus, settle it", ok: ["best-of", "bracket-post", "tier-list"] },
  { ask: "who's actually best at smash, keep score", ok: ["smash-elo"] },
  { ask: "muse quick poll", ok: ["after-vote", "story-poll-plan"] },
  { ask: "vote: tacos or karaoke after", ok: ["after-vote"] },
  // games, fun
  { ask: "road trip bingo", ok: ["road-bingo"] },
  { ask: "setlist bingo for the show", ok: ["setlist-bingo"], surface: "event" },
  { ask: "two truths and a lie about us", ok: ["two-truths"] },
  { ask: "muse trivia about the group", ok: ["trivia-night", "friend-trivia-pub"] },
  { ask: "game night, something with a secret word", ok: ["imposter"] },
  { ask: "kings cup rules but ours", ok: ["kings-cup"] },
  { ask: "muse make a game for tonight", ok: GAME },
  { ask: "over under on dev being late", ok: ["over-under"] },
  { ask: "bet you calvin doesnt finish the burrito", ok: ["over-under"] },
  { ask: "caption these trip pics, loser buys first round", ok: ["caption-contest"] },
  { ask: "rate my hinge matches", ok: ["hinge-rate"] },
  { ask: "daily word game from our chat", ok: ["daily-puzzle"], surface: "gaming" },
  { ask: "stopwatch challenge, who can stop closest to 10", ok: ["challenge-friend"], surface: "gaming" },
  { ask: "make a whack a mole about the guy who's always late", ok: ["inside-joke-game"], surface: "gaming" },
  // streaks, recaps
  { ask: "gym streaks, loser buys smoothies", ok: ["gym", "public-challenge"] },
  { ask: "did everyone go today, streak check", ok: ["gym"] },
  { ask: "30 day challenge, who's joining", ok: ["public-challenge", "gym"], surface: "feed" },
  { ask: "recap the semester", ok: ["semester-wrapped", "wrapped"] },
  { ask: "wrapped but for our group chat", ok: ["wrapped"] },
  { ask: "make an album of the weekend pics", ok: ["album"] },
  { ask: "recap story of the nashville trip", ok: ["trip-story"], surface: "story" },
  { ask: "birthday reel for maya", ok: ["bday-montage"], surface: "story" },
  // groups, events
  { ask: "volunteer shifts for move-in day", ok: ["signup-board"], surface: "group" },
  { ask: "sign up sheet for the bake sale", ok: ["signup-board"], surface: "group" },
  { ask: "flyer for the corkboard", ok: ["flyer-wall"], surface: "group" },
  { ask: "who's in the club by dorm", ok: ["member-galaxy"], surface: "group" },
  { ask: "who else is going to the show that i know", ok: ["squad-constellation"], surface: "event" },
  { ask: "remember the trip last year, lets do it again", ok: ["memory-redo", "trip-lock", "date-swipe"] },
  // nothing fits
  { ask: "muse what's the capital of peru", ok: [] },
  { ask: "lol", ok: [] },
  { ask: "muse write my bio essay", ok: [] },
  { ask: "muse book us a table at nopa", ok: [] },
  { ask: "can you text my mom happy birthday", ok: [] },
  { ask: "muse whats the weather saturday", ok: [] },
  { ask: "remind me at 5 to call the landlord", ok: [] },
  { ask: "translate this to spanish", ok: [] },
  { ask: "muse make me a workout plan for my legs", ok: [] },
  { ask: "summarize this chat", ok: [] },
  { ask: "muse order me an uber", ok: [] },
  { ask: "how do i fix my wifi", ok: [] },
  { ask: "muse tell me a joke", ok: [] },
  { ask: "what time does target close", ok: [] },
  { ask: "muse play some music", ok: [] },
  { ask: "can you explain derivatives", ok: [] },
  { ask: "muse unsend my last message", ok: [] },
  { ask: "who's the best rapper of all time", ok: [] },
];
