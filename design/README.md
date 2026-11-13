# design

One reconciled, machine-readable source of the measured design values for the Messenger and Facebook mock, and the two things generated from it. Check command: `bun design/build.ts` (add `--check` to run the checks without writing files).

## Files

| file | what it is |
|---|---|
| `tokens.json` | The source. Every value as `{ value, platform, theme, source, confidence, note? }`, grouped into `color`, `type`, `radius`, `spacing`, `elevation`, `motion`. Extra keys: `use` (where the mock reads it: `phone`, `desktop`, `phone+desktop`, `phone-black`), `css` (the shell property it writes), `app` (the `packages/app/src/theme.ts` field it feeds). A `value` of `null` is a gap. Schema is at the top of the file. |
| `build.ts` | Writes the two files below and runs the checks. |
| `out/shell-tokens.css` | A full replacement for `apps/shell/src/tokens/tokens.css`. Same property names, plus new ones. Not applied: the shell is being rewired by someone else. |
| `out/shell-changes.md` | Every value that changes (old, new, source), every new property, and the structural checklist for whoever edits the shell next. |
| `fixtures/` | One broken input per check. The build stops if a check accepts its fixture. |

Points (iOS) and dp (Android) are written as px at 1:1. Findings files under `tools/capture/` and `muse/research/` are the sources; `reference/` is never copied, only single numbers and colours.

## Precedence

1. Phone: iOS values win. Android values apply only where iOS has nothing, and never override iOS. Android is the only source for the page-open fade, the tab-switch rule, the fling decay, the 36 px chip and the event card border.
2. Desktop: web values win.
3. Same platform, two captures: the newer one wins, and the entry's `note` says so. Where a platform-level choice was made (for example dark divider `#46484b` on phone and `#65686c` on desktop), both values are kept as separate entries.
4. Where two sources disagree and neither is a newer capture of the same thing, the entry that is not used stays in the file with no `use` key.
5. Older sources (`META_PARITY`, `META_TOKENS`, `fb_tokens.rs`, the public iOS screenshots behind `DESIGN_FACTS`) are carried only where no 2026-11-12 capture covers the value. Their web measurements keep `measured`; their iOS screenshot values are `derived`. Everything carried unchanged from the old `tokens.css` is a separate entry named after its shell property.

Confidence: `measured` is read from a capture or token file; `derived` is an inference (APK day/night pair matched by value, alpha flattened onto a surface, a noisy fit, an older screenshot not re-measured); `assumed` has no measurement and is on the to-do list.

## Gaps

These are `value: null` entries; search tokens.json for `"value": null`.

- Outgoing bubble colour or gradient on iOS (no outgoing bubble was on screen).
- Grouped inner radius on iOS and on web.
- Reaction pill geometry, on every platform.
- Maximum bubble width on iOS (widest seen was 0.45 of the screen); gap between bubbles inside a group.
- Header translucency on iOS, and the blur radius and shadow of the floating Facebook tab bar.
- Messenger on Android: no inbox row, avatar, composer, bubble or tab metrics (not signed in).
- Facebook dark pixels on iOS and Android (both apps ignored the system setting); dark Facebook values here are web tokens and APK night resources.
- iOS active dot size, tab badge size, Android event card corner radius.
- iOS motion: page open, scroll deceleration, springs; thread open, composer rise, keyboard and long-press menu motion on every platform.
- Not gaps in the file but still open: Messenger in light on iOS (phone light bubble, field and header colours come from older screenshots), the unfocused iOS composer, and dark values at element level on web (the root tokens are valid, the element swap is not).

## Font

The apps use Meta's Optimistic (Android measured: cap height 0.700 em, x-height 0.500, line box 1.288 em; Text 400/500/700, Display 500/700, SemiBold 600). It cannot be shipped and no font is downloaded here. Recommendations below are not measurements; verify each substitute's own metrics when it is added.

| platform | use | why | size and line height |
|---|---|---|---|
| iOS look (phone) | `system-ui` / SF Pro on Apple devices. Inter (SIL OFL) as the fallback for everyone else. | The app is SF Pro on iOS (x-height 0.528 fit the sizes). Inter is the nearest free face to SF: similar cap/x ratio (about 1.33 against SF's 1.335) and neutral grotesque forms. | Keep px line heights from the frames: 17/22, 15/19, 13/16 (ratio about 1.29, Meta sets its own). For Inter set `font-size-adjust: 0.528` so its x-height equals SF's; cap height lands at about 0.703 against SF's 0.705. Apple's tracking table (about -0.025em at 17, -0.015em at 15, -0.006em at 13) is worth applying to Inter only. |
| Android look | Figtree (SIL OFL). Fallbacks: Plus Jakarta Sans, DM Sans. | Optimistic is a geometric sans with round bowls, a two-storey a, and a cap/x ratio of 1.40. Figtree is the closest free geometric face I know, and reportedly shares the 0.70 cap / 0.50 x proportions. Unverified: I could not read its metrics here. | `font-size-adjust: 0.5` pins any substitute's x-height to Optimistic's 0.500. Set `line-height: 1.288` (unitless) so text blocks match: 12 sp is 15.5, 13 is 16.7, 15 is 19.3, 17 is 21.9, 24.5 is 31.6. Compare wrapping on real copy and trim `letter-spacing` by up to 0.01em if lines break differently. |
| Desktop web | Keep the measured stack `system-ui, -apple-system, "system-ui", ".SFNSText-Regular", sans-serif`. Inter only as the last fallback. | facebook.com itself uses the system face, not Optimistic. Measured 15 px text has a 20.1 px line (ratio 1.34). | 15/20, 13/16, 17/20, 12/16. No adjustment. |

Text size caution: the iOS bubble line box of 19 implies 15 pt text, not the 17 pt older screenshots gave; the new 15/19 phone body is `derived`, so check it against a long message before trusting it.

## Checks

`bun design/build.ts` runs, first against a broken fixture and then for real:

1. tokens.json schema: platform, theme, confidence, source present; a gap needs a note; no two entries write the same property in the same layer.
2. Every custom property the shell uses (names in `var(--x)` in `apps/shell/src`, plus every name in the current `tokens.css`, minus names a component defines itself) is in the output.
3. No colour set for desktop light is missing its dark counterpart.
4. Text contrast for the pairs the shell draws, in all five cascade contexts (phone light, phone dark Meta, phone true black, desktop light, desktop dark). One pair is exempt: white on the phone light outgoing bubble `#006fff` is 4.4:1, as the shell already notes.
5. `packages/app/src/theme.ts` contrast, light and dark.
6. Every `app` entry in tokens.json equals what `theme.ts` holds for that field, in each mode.
