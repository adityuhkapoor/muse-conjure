// Router asks for the generalise-arms experiment: per tool, 2 paraphrases that should pick it and
// 2 near misses that should not. Made-up people; chats are short.
export type RouterAsk = { ask: string; should: boolean; chat: { title: string; messages: { from: string; text: string }[] } };
const c = (title: string, ...m: [string, string][]) => ({ title, messages: m.map(([from, text]) => ({ from, text })) });

export const ROUTER_ASKS: Record<string, RouterAsk[]> = {
  "slot-machine": [
    { should: true, ask: "muse just choose for us", chat: c("fri night", ["Chris", "where do we eat then what"], ["Maya", "idk anything but sushi"], ["Chris", "muse just choose for us"]) },
    { should: true, ask: "muse spin something for the whole night, food drinks and what time we head home", chat: c("🍻", ["Dev", "no one has any ideas"], ["Jess", "not the same bar again"], ["Dev", "muse spin something for the whole night, food drinks and what time we head home"]) },
    { should: false, ask: "muse make a poll: pizza or tacos", chat: c("dinner", ["Sam", "pizza or tacos"], ["Jess", "muse make a poll: pizza or tacos"]) },
    { should: false, ask: "muse who pays for last night", chat: c("last night", ["Maya", "i covered the cab"], ["Chris", "muse who pays for last night"]) },
  ],
  "bake-sale-shifts": [
    { should: true, ask: "muse set up hourly slots so people can claim a table spot", chat: c("Chem Club", ["Ines", "table is open 9 to 1 saturday"], ["Omar", "we need two people each hour"], ["Ines", "muse set up hourly slots so people can claim a table spot"]) },
    { should: true, ask: "muse a sign-up sheet for staffing the booth", chat: c("Rec Club", ["Tori", "fair booth runs all afternoon"], ["Jun", "i can only do the first half"], ["Tori", "muse a sign-up sheet for staffing the booth"]) },
    { should: false, ask: "muse split the cost of the ingredients", chat: c("Chem Club", ["Ines", "flour and sugar came to 64 dollars"], ["Ines", "muse split the cost of the ingredients"]) },
    { should: false, ask: "muse find a time everyone can meet next week", chat: c("Chem Club", ["Omar", "we need a planning meeting"], ["Ines", "muse find a time everyone can meet next week"]) },
  ],
  "tailgate-draft": [
    { should: true, ask: "muse take turns picking who brings which supplies, fair order", chat: c("Game day · Lot B", ["Rae", "we need chips, drinks, a tent, a grill"], ["Kofi", "everyone picks one so nobody gets stuck"], ["Rae", "muse take turns picking who brings which supplies, fair order"]) },
    { should: true, ask: "muse run a draft for the party supplies, back and forth order", chat: c("Rooftop party", ["Lena", "someone has to bring ice, cups, speakers"], ["Ty", "draft it"], ["Lena", "muse run a draft for the party supplies, back and forth order"]) },
    { should: false, ask: "muse split what we spent on the grill and charcoal", chat: c("Game day · Lot B", ["Rae", "grill was 90, charcoal 20"], ["Rae", "muse split what we spent on the grill and charcoal"]) },
    { should: false, ask: "muse show where everyone is parked on a map", chat: c("Game day · Lot B", ["Kofi", "where is everyone"], ["Rae", "muse show where everyone is parked on a map"]) },
  ],
  "room-fit": [
    { should: true, ask: "does this desk fit by our window", chat: c("Ikea LINNMON desk", ["Noor", "does this desk fit by our window"]) },
    { should: true, ask: "muse check whether this bookcase will work in the dorm", chat: c("bookcase listing", ["Pia", "found this for 40 bucks"], ["Pia", "muse check whether this bookcase will work in the dorm"]) },
    { should: false, ask: "is this a fair price for the couch", chat: c("couch listing", ["Noor", "is this a fair price for the couch"]) },
    { should: false, ask: "muse split the cost of this couch four ways", chat: c("couch listing", ["Pia", "muse split the cost of this couch four ways"]) },
  ],
  "friend-trivia-pub": [
    { should: true, ask: "muse quiz us on each other", chat: c("Floor 3", ["Ben", "who here knows us best lol"], ["Ben", "muse quiz us on each other"]) },
    { should: true, ask: "muse make a game where we guess facts about the group", chat: c("Roommates", ["Zoe", "game night?"], ["Zoe", "muse make a game where we guess facts about the group"]) },
    { should: false, ask: "muse a daily word puzzle for the chat", chat: c("Roommates", ["Zoe", "i miss wordle"], ["Zoe", "muse a daily word puzzle for the chat"]) },
    { should: false, ask: "muse who is the most likely to be late, vote", chat: c("Roommates", ["Zoe", "vote on who is always late"], ["Zoe", "muse who is the most likely to be late, vote"]) },
  ],
};
