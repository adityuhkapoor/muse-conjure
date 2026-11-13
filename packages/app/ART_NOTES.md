# Why the lab tools looked made for their moment

Looked at 18 lab tools rendered headlessly in the Meta style (`--style Meta:Meta`, 120 frames):
concert, trip-lock, lobby, countdown, settle-up, rent-split, pizza, potluck, gift-pool, grocery,
power-rank, bet-tracker, sublet-finder, member-galaxy, group-bingo, setlist-bingo,
squad-constellation and reel-to-try. They are flat, use Meta blue as the only accent and system type,
and still look rich. These are the reasons.

## 1. One picture of the actual thing, near the top

Each tool has one hero picture that is the object the chat is talking about, drawn the way you'd
point at it: the arena with its sections (concert), the pizza cut by toppings (pizza), the table
seen from above with plates (potluck), the floor plan split into rooms (rent-split), the jar of
coins (gift-pool), the tangle of IOUs (settle-up), the dorm galaxy (member-galaxy). It takes 40 to
55 percent of the card's height at rest. Rows and buttons come after it. The library pieces start
with rows, and that is most of the gap.

## 2. Drawing primitives that keep coming back

- Filled shapes on a light grey stage (`#E4E6EB`-ish wash): wedges, rounded rects, circles. No
  outlines thicker than 1 px, apart from a 1.5 px primary outline on the selected thing.
- A texture of many tiny dots for the crowd that isn't in the chat (seats in a section, members in a
  dorm). It gives density without adding information to read.
- Dashed outlines for an empty spot ("Need veggies", open seats, "+ open"), often in red when the
  spot is needed.
- Curved threads in each person's color, with arrowheads and small labelled chips ("$145 airbnb")
  sitting on the threads.
- A sparkline with a soft fill and a dot on the latest value. A heat grid of rounded cells with an
  overlap histogram under it. A thermometer meter. A ring of progress around the hero.

## 3. Illustration instead of photos

Food, places and objects are drawn from 4 to 10 flat shapes in reaction colors (yellow, red,
green, orange, purple), seen from above for dishes (ramen bowl, pizza, plates) and from the side
for drinks and buildings. Each sits on a 44 px rounded grey tile in lists (reel-to-try) or is drawn
big as the hero (ramen, headphones, a sublet room). A soft shadow ellipse under each makes it read
as an object. The details are specific to the subject (egg and chashu on ramen, toppings per
quarter on the pizza), and that specificity is what makes them feel made for the chat.

## 4. Data becomes a picture

- Money is a graph of people with arrows, not a table.
- Rent split is a floor plan with each room's price written in it.
- Availability is a painted grid, and the best hour shows as the tallest overlap bar.
- Price history is a sparkline beside the price, with "Down $28 since Mon" in green.
- Countdown is weather on a landscape. Odds are a rope in a tug of war.
- Rankings keep the numbers, and the movement shows as small green and red triangles.

## 5. People are placed into the picture

Avatars are not in a separate list. They sit in the section they chose (stacked, 30 percent
overlap), on the plate they're bringing (a 16 px badge on its lower left), on the node they are,
inside their dorm's cluster, or on the day they picked. Status is a small badge on the avatar (a
check for "in"). The viewer is marked twice: a primary ring and "You" in blue. The "who's in" row
under the picture repeats the people with their state as one word ("Going", "Maybe", "You?").

## 6. Density and spacing

- 13 px meta text is used a lot, for quotes from the chat ("pepperoni or riot", Jess: "if it's
  <$150"), with right-aligned amounts.
- Gaps of 8 px and panels of 12 px. A wash panel holds a two-column summary: a big number on the
  left, a small picture on the right.
- There is almost no empty space at rest. Explanations are one grey line ("Tap a quarter to change
  toppings").

## 7. Color

- Neutral grey for everything not yours or not chosen.
- Primary blue fills the one thing that is yours or selected (your section, your row, your cell),
  plus the single primary button.
- People colors appear only on people: avatars, their threads, their dots.
- Green for good deltas and done, red only for "needed" or urgent.
- Food and illustrations use reaction colors, always inside a picture and never on chrome.

## Rules for the kit

1. Lead with one picture of the real object. Rows second.
2. Put the people into that picture, and mark the viewer with a primary ring.
3. Fill it with real specifics from the chat: names, quotes, amounts, places.
4. Use grey for everything else and blue for what's yours. Draw the empty spot with a dashed
   outline and say the first action in plain words.
