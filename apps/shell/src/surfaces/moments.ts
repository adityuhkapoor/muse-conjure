// Which tool each Muse moment on a surface lands. One line per moment: `piece` is a ported lab tool
// in `library/lab/`, never a plain library piece (apps/shell/scripts/lab-only.ts fails on one). To
// swap in another lab tool, change the id here and its params builder in flows.svelte.ts or backing.ts.
// `templateId` is the chat template the card falls back to (its name, blurb and fake-store state).

export type Moment = { piece: string; templateId: string };

export const MOMENTS = {
  /** Home: the den's chore wheel shared as a post, and "Use for my group" rebuilding it */
  homeToolPost: { piece: "chore-wheel", templateId: "chore-wheel" }, // lab port; was "chore-draft", before that "assign"
  /** Home: Arun's dining hall bracket you vote in from the feed */
  homeBracketPost: { piece: "feed-tier-list", templateId: "bracket" }, // lab port; was "bracket"
  /** Groups: "See 7 that match" under the composer, the pinned finder: save or skip each sublet */
  groupFinder: { piece: "sublet-finder", templateId: "poll" }, // lab port; was "shortlist"
  /** Groups: the club's gear room sign-up, "Pinned by admins" */
  groupPinned: { piece: "signup-board", templateId: "poll" }, // lab port; was "shifts"
  /** Groups: the meeting-time post that became a tool. Lab port (gate ok 1); was "overlap" */
  groupMeeting: { piece: "meeting-time", templateId: "poll" },
  /** Groups: a member's post "make a flyer for friday social", pinned, with the flyer under it */
  groupFlyer: { piece: "flyer-wall", templateId: "poll" },
  /** Marketplace: "Decide with roommates" after a second saved listing of a kind, or from Share */
  marketplaceDecide: { piece: "group-buy", templateId: "poll" }, // lab port; was "shortlist"
  /** Marketplace: "Split it" for a shared purchase */
  marketplaceSplit: { piece: "split-purchase", templateId: "bill-split" }, // lab port; was "split"
  /** Reels: "Add to our to-try list" under a reel shared to a chat; later reels add their places to it */
  reelToTry: { piece: "reel-to-try", templateId: "poll" }, // lab port; was "poll"
  /** Stories: "Make it a plan" on your finished story poll. Lab port (gate ok 1); was "lock" */
  storyPlan: { piece: "trip-lock", templateId: "whos-in" },
  /** Gaming: the bracket games */
  gameBracket: { piece: "bracket-post", templateId: "bracket" }, // lab port; was "bracket"
  /** Gaming: the dining hall tier list */
  gameTier: { piece: "feed-tier-list", templateId: "bracket" },
  /** Gaming: the wheel game */
  gameWheel: { piece: "movie-bracket", templateId: "bracket" }, // lab port; was "wheel"
} satisfies Record<string, Moment>;
