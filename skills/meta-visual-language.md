---
name: meta-visual-language
use_when: When styling any part of the card: colour, type, shape, buttons, and how loud the picture may be. Also the reference the critic grades against.
---

# Meta's visual language for a rich message

A Muse tool should look like a feature Meta already shipped. The only new thing is what it does.
That is not a cage: Messenger polls, Event cards, Instagram stickers, Facebook Memories and
Instant Games are all Meta, and they range from plain rows to full illustrations. The rules below
are what makes them read as one family.

## The card

- It sits in the thread like a rich message: `theme.color.card` background, radius 18, 12 px
  padding, no shadow, no border. The host draws the card; you fill it.
- `CardHeader` first: the Muse mark, a title from the chat, a subtitle with the state in a few
  words ("3 of 8 seats taken · $62 each").
- Separate parts with space, a wash band (`color.wash`) or a 1 px `color.divider` line. Never
  boxes inside boxes, never outlines thicker than 1 px, never drop shadows inside the card.

## Colour

- One accent: `theme.color.primary` (it follows the chat theme). It marks the one primary
  button, the viewer's own choice, progress fill and links. Nothing else is blue.
- Everything else is neutral: `text`, `secondaryText`, `secondaryButton`, `wash`, `track`,
  `divider`.
- People are coloured with `userColor(id, theme)`, and only where colour means that person.
- Pictures may use the illustration palette (`pal()`: Facebook reaction hues) and the `series`
  colours. Keep the fill of large areas soft; let small marks be bright.
- `positive` for done, paid, correct; `negative` for wrong or over budget; `warning` sparingly.
- No gradients outside the Muse mark. No literal colours anywhere.

## Type

- 15/20 body, 13/16 meta in `secondaryText`, 17 semibold for a title, 20 for one big number.
- One big number or fact per card at most (the total you owe, the winner, days to go).
- Weight does the hierarchy: 600 for names and the key fact, 400 for the rest.
- Sentence case. The only capitals: an event date line ("FRI, OCT 31 AT 9 PM") and the short
  codes on a ticket ("AUS", "MRF").

## Controls

- `Button` is 36 px tall with a 44 px hit area, radius 8. One `primary` per card, for the action
  most people need next. Others are `secondary` (grey) or `deemphasized`.
- Labels are short verbs, up to four words inside a tool: "Vote", "I'm in", "Take it", "Mark paid".
- Selection: the chosen row or cell turns `color.selected` with the primary ring or text. Not a
  checkbox if a tint will do.

## How loud the picture can be

Meta ships playful things (stickers, games, Memories), and they are still calm: flat shapes,
soft fills, rounded corners, real data inside. A good test: would this look at home as an
Instagram sticker or an Instant Game tile? Fine. Would it look at home on a casino floor or a
kids' birthday flyer? Too loud.

Meta celebrates with: a reaction burst rising from the tap (`Burst`), a short warm line ("It's a
plan."), and the component changing state (the row turns blue, the card shows "Locked · 4
going"). No confetti cannons, stamps, trophies or mascots.

## Worked example: same job, two looks

Late-night food after a show. Plain version: four OptionRows. Made-for-this version: four rows,
each with a 40 px drawn thumbnail (`Thumb` kind "pizza", "ramen", "taco", "storefront"), the
name in 600, and the chat's note in 13 px grey ("open til 2 · cash only"). Votes show as faces at the right. The
viewer's row tints `selected`. When everyone has voted, the winner's row grows a little and
`Locked` replaces the button. Both are Meta; the second looks like it was made for that night.

## Worked example: what the critic flags

- Two blue buttons: pick one primary, make the other secondary.
- A coloured card background behind the whole tool: remove it; let the picture carry colour.
- A 28 px headline and a 12 px everything else: pull the headline to 17 or 20 and the rest to
  15/13.
- Emoji used as icons in every row: keep one in content if the chat used it, draw the rest.
