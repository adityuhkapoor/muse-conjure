---
name: filling-from-chat
use_when: When putting content into the tool's first state: options, items, amounts, times, places, roles.
---

# Filling from the chat

The fastest way to make a tool feel made for this group is to have it already know what they
said. The fastest way to break trust is to have it say something they did not.

## Use what is there

- Put every fact from the chat in one `const CHAT = { ... }` near the top of the module, each with
  a comment quoting the message it came from. The reducer and view read from it. Reuse later
  replaces only this block.
- Keep the chat's own words for labels: "noodle bar" becomes "Noodle bar", "el farolito" becomes
  "El Farolito". Fix case, not wording.
- Money becomes integer cents from the exact amounts: "$1,500" is 150000. Never round a stated
  amount.
- Times stay as people said them plus what the card needs: "Fri 7 AM", "7:40 AM · gate B".
- People are matched by name in `init` (`ctx.members.find(m => m.name.toLowerCase() === "sasha")`);
  never hard-code ids.
- Constraints people stated pre-fill state where they are clear ("jun doesn't eat meat" means Jun is
  not on the pepperoni line) and show as a note where they are soft ("i want to be peach").

## Never invent facts

- No made-up prices, tips, addresses, ratings, distances, scores or dates.
- No extra options beyond what the chat gave, unless the ask is open ("pick a movie") and the chat
  named none; then see below.
- No facts about people: no "Sam's favourite", no invented history for a recap or quiz.
- A known public fact about a named thing is allowed only when it is not checkable trivia that
  could be wrong. The Mario Kart cast is fine; a restaurant's opening hours are not.

## When something needed is missing

Leave a clear, editable slot and say so: "Tip not set · Add", "Table 2 · 6 seats" with the size
editable by the host. The empty value is visibly empty, not a silent zero or a guess.

## When the chat gives nothing

Some asks arrive cold: "muse let's play pictionary" with no word list; "muse make a poll" with no
options. Then:

1. Build the tool so people can add the content in one tap ("Add a word", "Add option").
2. Give a small starter set only where the tool cannot run without one (a game needs words to
   draw), drawn from general knowledge that cannot be wrong (everyday objects: "bicycle",
   "pancake", "umbrella"), and say on the card that anyone can add their own.
3. Never pretend the starter came from them.

## Worked example: Nashville IOUs

Chat: Priya "airbnb was 840, on my card"; Sam "gas both ways 96"; Leo "groceries 112 and the uber
downtown 38"; Kev "i got the bar tab, 150"; Ana "i owe everyone lol".

```ts
const CHAT = {
  trip: "Nashville",
  // Who paid what, all shared by everyone on the trip.
  paid: [
    { by: "Priya", what: "Airbnb", cents: 84000 },     // "airbnb was 840, on my card"
    { by: "Sam", what: "Gas", cents: 9600 },           // "gas both ways 96"
    { by: "Leo", what: "Groceries", cents: 11200 },    // "groceries 112 and the uber downtown 38"
    { by: "Leo", what: "Uber downtown", cents: 3800 },
    { by: "Kev", what: "Bar tab", cents: 15000 },      // "i got the bar tab, 150"
  ],
};
```

Nothing about who was at the bar: the chat did not say, so each expense starts shared by all and
anyone can tap themselves off a line. Ana's "i owe everyone" is not a payment.

## Worked example: trivia from chat facts

Facts usable as questions: Bo has a pet snail named Kevin; Sasha has been to 3 countries this
year; Jun broke his wrist skateboarding twice; Ollie can't whistle. Each question's answer is a
person in the chat or a number they stated. Wrong options are the other members or nearby numbers
(2, 3, 4, 5 countries). Do not add a fifth fact.
