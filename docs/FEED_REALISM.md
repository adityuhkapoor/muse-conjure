# Feed realism

How to make the mock Facebook and Messenger read like a real 21-year-old's feed instead of a
feed written for a demo. For the content writers working from `docs/FEED_SPEC.md`. Includes
sources, measured numbers, the 20 things that give our content away, rewrites of our own lines,
recipes, and templates. The phrasebank of original lines is `assets/corpus/phrasebank.json`.

All people and content stay made up. Nothing below copies a real person's post. The two short
quotes are from openly licensed data and carry no usernames.

One scope note: the "no exclamation marks, sentence case" rule in `AGENTS.md` is for product copy
(buttons, labels, Muse's own lines). What the made-up people post is not product copy. Real posts
use "!!" and capitals, so this guide allows them in user content. If the owner reads the rule
as covering user content too, drop the "!" lines from the phrasebank (they are tagged).

---

## 1. Sources

### Sampled (small samples in `assets/corpus/<name>/`, git-ignored, each with a `SOURCE.md`)

| Name | URL | Size (full) | Licence | Voice | Recent | Cleaning | Use |
|---|---|---|---|---|---|---|---|
| Top American universities on Reddit | huggingface.co/datasets/SocialGrep/top-american-universities-on-reddit | 338k comments, 78k posts, 10 college subreddits | CC BY 4.0 | Students, mostly 18-24 | to 2022 | Low; drop `[removed]` | Counting, comment voice. Best student source found |
| Discord-Dialogues | huggingface.co/datasets/mookiezi/Discord-Dialogues | 7.3M exchanges, 347 MB | Apache 2.0 | Young, very casual | 2025 | Medium: emoji, links, bots stripped by publisher; two-person only | Chat voice, abbreviations, typos |
| Two million Bluesky posts | huggingface.co/datasets/alpindale/two-million-bluesky-posts | 2M posts, 40 MB files | Tagged Apache 2.0, card says Bluesky terms apply | Mixed adults | Nov 2024 | Medium: multilingual, lots of news and art promo | Style reference only. Emoji rates, post vs reply length |
| GoEmotions | huggingface.co/datasets/google-research-datasets/go_emotions | 58k Reddit comments | Apache 2.0 | Mixed, younger skew | 2005-2019 | Low; names masked | Short reaction comments |
| Craigslist bargains | huggingface.co/datasets/aladar/craigslist_bargains (copy of stanfordnlp/craigslist_bargains) | 6.6k negotiations | Copy tagged MIT, original unknown | Crowdworkers role-playing | 2018 | Low | Style reference for haggling DMs only; too polite |

### Found, not downloaded

| Name | URL | Licence | Why not, or how to get it |
|---|---|---|---|
| NUS SMS Corpus | github.com/kite1988/nus-sms-corpus | Research use; authors ask for an email before use | 55,835 English texts, 2 MB, real SMS from students (Singapore, 2010-2015). The closest thing to real group texting voice, but dated. Ask the owner whether to email the authors |
| ConvoKit Reddit corpus by subreddit | convokit.cornell.edu/documentation/subreddit.html | No explicit open licence (Reddit content) | Full reply trees for r/college, r/roommates, campus subreddits. Best source for comment-thread shape. Owner's call |
| Unicode emoji frequency 2021 | home.unicode.org/emoji/emoji-frequency/ | Unicode terms of use (permissive) | Ranking, not a dataset. Top 10: 😂 ❤️ 🤣 👍 😭 🙏 😘 🥰 😍 😊 |
| Emojipedia stats | emojipedia.org/stats | Copyright, read only | 😭 overtook 😂 on Twitter in 2021; neck and neck in 2022 |
| Pew social media fact sheet 2026 | pewresearch.org/internet/fact-sheet/social-media/ | Free to cite | 69% of US adults 18-29 use Facebook. Teens 32% (2024). Facebook for this age group is groups, Marketplace, events, family and Messenger more than status posts |
| MultiLexNorm (typos and texting normalisation) | noisy-text.github.io/2021/multi-lexnorm.html | Per-dataset; English part from Twitter, research terms | Word-level pairs like "u"→"you". Ask owner before downloading |
| Craigslist used cars (Kaggle) | kaggle.com/datasets/austinreese/craigslist-carstrucks-data | Kaggle account needed | Ask the owner. Cars only, so limited use |
| Mercari price challenge | multabench/core-text-reg-mercari-marketplace on HF, original on Kaggle | No licence on HF copy; Kaggle competition rules | Ask the owner. 1.4M resale listings with title, description, price: the best open-ish listing voice |
| DailyDialog | huggingface.co/datasets/li2017dailydialog/daily_dialog | CC BY-NC-SA 4.0 | Too clean (English-learner dialogues). Useful only as a "what not to sound like" |
| PersonaChat, SODA | HF `bavard/personachat_truecased`, `allenai/soda` (CC BY 4.0) | | Too clean; SODA is model-written |
| Facebook status updates (myPersonality) | | Withdrawn in 2018 | Not available |
| Meetup, Eventbrite descriptions | | No open dataset; scraping is against terms | Use the templates in section 8 |
| Facebook Marketplace, Facebook groups | | No open dataset; scraping is against terms | Read only through search-engine snippets (below); the owner's own groups are the real source |
| WhatsApp public groups (Garimella 2018) | aaai.org ICWSM-18 paper | Data on request, political groups | Not young-adult casual |

### Read on public pages (patterns only, nothing copied)

Search-engine snippets of public Facebook buy-and-sell and campus groups, and public student-club
pages. No login, no clicks on profiles, no names kept. Patterns seen: titles in caps with "!!"
("move out sale", "need gone"), a bulleted price list with "SOLD" written over sold items,
"$X OBO, originally $Y", "pick up only", "first come first serve", "no holds", "comment for
offers", address and a day range for pickup, and club event posts with "FREE PIZZA" in caps,
"all are welcome", "bring your friends" and a room number. Threads, X and Instagram need a
login for anything past the first screen, so they were skipped.

---

## 2. What real posts look like, in numbers

Measured on the samples above with a short Bun script (kept out of the repo). "Ours" is every
post text, shown comment and chat line in `FEED_SPEC.md` sections A and F.

| Measure | College Reddit comments | College Reddit titles | Bluesky posts | Bluesky replies | Discord chat turns | **Ours: posts** | **Ours: comments** | **Ours: chat** |
|---|---|---|---|---|---|---|---|---|
| Count | 866 | 600 | 1,312 | 1,517 | 3,548 | 41 | 123 | 1,313 |
| Median words | 23 | 6 | 19 | 15 | 8 | 12 | 6 | 5 |
| Under 8 words | 20% | 59% | 12% | 21% | 48% | 17% | 68% | 77% |
| 3 words or fewer | 9% | 22% | 2% | 5% | 20% | **0%** | 15% | 31% |
| 30 words or more | 41% | 1% | 27% | 24% | 6% | **0%** | **0%** | **0%** |
| Spread (25th to 90th percentile words) | 10 to 95 | 4 to 15 | 11 to 45 | 8 to 44 | 4 to 23 | **10 to 17** | **5 to 9** | 3 to 10 |
| All lowercase | 7% | 6% | 8% | 9% | 36% | **100%** | **98%** | **96%** |
| No punctuation at all | 11% | 43% | 18% | 19% | 59% | 15% | 59% | 64% |
| Has "!" | 17% | 5% | 15% | 17% | 4% | **0%** | **0%** | 1% |
| Has "..." | 5% | 3% | 17% | 9% | 2% | **0%** | **0%** | **0%** |
| A word in caps | 16% | 14% | 17% | 11% | 6% | **0%** | 2% | 2% |
| Elongation ("sooo") | 2% | 1% | 6% | 3% | 4% | **0%** | **0%** | **0%** |
| Dropped apostrophe ("im", "dont") | 1% | 1% | 1% | 2% | 9% | **0%** | **0%** | 2% |
| Has an emoji in the text | 2% | 1% | 18% | 17% | (stripped) | **0%** | **0%** | **0%** |

Other measured facts:
- College Reddit comment scores: median 2, 45% have 1 or less, 7% reach 10. Most comments get
  almost nothing. Ours: reactions per post run 6 to 188, median 31; only 3 of 41 posts are under 10.
- College Reddit comment hours (US Eastern, approximate): spread across the day, a dip from 4 to
  8 AM (1-2% per hour), 6% at midnight, 7% at 11 AM and 1-2 PM. Ours: chats have 0% from 3 to 5 AM
  and 11% at 1 AM, which is about right; the feed has no 2 AM post besides Kev's.
- 31% of college Reddit posts are a link or image with no body. 25% of Bluesky top-level posts
  carry an image.
- Top emoji in Bluesky replies: 😭 😂 🥰 🤣 ❤️ 😅 🩷 😆 🙏 🥺. In college Reddit: 😭 👍 🤷 😂 🙃 🤡.
  😭 leads in both. Unicode's 2021 world ranking puts 😂 first and 😭 fifth.
- The most common texting markers in Discord turns, by share of messages: "im" 3.5%, "yeah"
  2.9%, "oh" 2.1%, "dont" 2.0%, "idk" 1.5%, "same" 1.4%, "okay" 1.2%, "ok" 1.1%, "thats" 1.1%,
  "wanna" 1.0%, "gonna" 1.0%. In ours, "ok" is 4.8% and everything else is under 1%.
- Our chats: the same sender sends the next line 23% of the time, the median gap between
  lines in a day is 1 minute, the 90th percentile is 8 minutes, and only 5% of gaps are over an
  hour. Real group chats go quiet for hours, and the answer to a question often arrives the
  next morning.
- Names: 20% of our post texts and 12% of chat lines name a cast member. Real chat almost
  never names the person you're talking to; it uses "u", a nickname, or a reply.

What the numbers don't show, from reading:
- Real feeds have dull posts that land nothing: "pesto pasta is back", "anyone know if the
  library is open", a photo of a sunset with no words. Every one of our 41 posts has a turn of
  phrase or a joke.
- Real comments on a friend's photo are mostly "😍", "omg", "ok wait", a tag ("@maya"), "cute",
  "where is this", "miss u". Ours are each a small written joke.
- People reply to the wrong thing, answer a question nobody asked, drift off topic, and repeat
  what someone just said. A Discord turn in the sample is just "Was this meant for me" (Apache
  2.0 data). A college comment is just "help pls" (CC BY 4.0 data).
- Group chats have three topics at once, a message split over four lines, "?" as a whole
  message, voice memos, a TikTok link with no comment, "lmaooo" two hours later, and a poll
  nobody votes in.
- Listings in campus groups are messier than ours: caps, "!!", "obo", "need gone", "pending",
  "SOLD" crossed through, "still available?" comments, and no full sentences.

---

## 3. The 20 tells

Ranked by how fast a reader notices.

1. **Every post lands a joke.** All 41 posts and almost every comment have a clever turn. Real
   feeds are mostly plain.
2. **Uniform lowercase.** 96-100% of our lines are all lowercase. Real young adults are 7-36%:
   autocorrect capitalises the first letter on phones, and people switch to caps for emphasis.
3. **No length spread.** Our posts run 10 to 17 words between the 25th and 90th percentile. Real
   posts run from 1 word to 95. We have no 1-word posts and no 30-word posts.
4. **Comments are a three-line sketch.** Every post shows exactly three comments that build
   on each other: setup, callback, button. Real threads are "😍", a tag, and an unrelated question.
5. **No emoji in the text.** 0% of our text has an emoji; Bluesky replies are 17%. Our emoji
   only appear as reactions.
6. **No "!" and no "...".** 0% versus 15-17%. Real excitement uses "!!", and real hesitation uses "...".
7. **No typos, no dropped apostrophes, no elongation.** 0% elongation against 2-6%; dropped
   apostrophes 0% in posts against 9% in chat. Nothing is misspelled, autocorrected or fixed
   with a "*word".
8. **Engagement is tidy and high.** Median 31 reactions, 3 of 41 under 10, comments 3 to 41.
   Real friend posts often have 2 likes and no comments.
9. **Everyone is on topic.** No one in a chat answers an older question, starts a new topic
   mid-thread, or sends something meant for another chat (one "wrong chat" exists, and it is a joke).
10. **No dead air.** Median chat gap 1 minute; 5% of gaps over an hour. Real: long silences,
    late answers, a burst of 12 lines at 1 AM.
11. **Catchphrases on repeat.** "legend" appears across chats and the feed; Kev says "i'm not
    even tired" in four places; "fight me", "i riot", "a hero" recur. Real in-jokes appear
    less often and are not explained.
12. **In-jokes are explained.** "the pesto pasta tuesday is the only constant in my life"
    explains itself. Real in-jokes are one word nobody outside gets ("shirley??").
13. **Names everywhere.** "arun took bathrooms first", "aditya sit down", "calvin as the banana".
    Real chat uses "u", nicknames, replies and tags.
14. **Every post is about the week's plot.** Nearly every post ties to a recurring thread. Real
    feeds have random life: a dentist, a sunset, a song, a sad post, a cousin's baby.
15. **No low-effort posts.** No photo with no caption, no shared link with no comment, no
    reshared meme, no "happy birthday!!" on a wall, no check-in.
16. **No other kinds of people.** Everyone is a peer. Real feeds have a mom commenting "So
    proud of you sweetie ❤️", a high school friend, a page, an ad.
17. **Grammar too clean in long text.** The few longer texts are full sentences, well
    punctuated. Real long posts run on with commas or have no punctuation at all.
18. **Times are round and tidy.** Comments from friends arrive with neat timing and the feed
    is in perfect plot order. Real feeds show "2d", "Yesterday at 11:48 PM", "Just now".
19. **Listings read like product copy.** "electric, goes up and down, 48 in wide" is helpful and
    complete. Real: "standing desk!! works great, $150 obo, pick up only".
20. **Muse-made things sound like people wrote them.** Real people post a tool with "vote" or
    "lol" or nothing, not a crafted caption explaining it.

---

## 4. Style guide for writers

### Rules

1. **Most posts are plain.** In 40 posts, at least 12 should have no joke at all.
2. **Vary length on purpose.** Use the distribution in section 5. Write some 1-word posts and
   some 40-word ones.
3. **Let the phone capitalise.** About half of posts start with a capital letter (autocorrect).
   Chat lines stay mostly lowercase. Use caps for one word of emphasis ("i am SO tired").
4. **Use emoji where people do.** About 1 in 5 posts and comments has one. Favour 😭 😂 🥹 ❤️
   🙏 💀 🫶 😍 🎉 🥳. Repeat them ("😭😭😭"). Not every line.
5. **Use "!!" in posts and comments about good news.** Birthdays, job offers, congrats.
6. **Leave in one small mistake per 15 lines.** A typo, "your" for "you're", an autocorrect,
   a follow-up "*the". Never on the cast's big moments.
7. **Comments are short and uneven.** 1-4 words is the norm. Mix one reaction-emoji comment,
   one tag, one unrelated question, and at most one joke.
8. **Don't name the person you're talking to.** Use "u", a nickname, or a reply.
9. **Explain nothing.** An in-joke is one word. If the reader needs a sentence of setup, cut
   the setup.
10. **One catchphrase per person per surface.** "legend" at most twice in the whole app.
11. **Let things go unanswered.** A question in a chat with no reply, a post with no comments,
    a poll with 1 vote.
12. **Put dull life in.** Lost keys, dentist, laundry, weather, a song, the bus is late.
13. **Long posts run on.** Commas, no paragraph breaks, an emoji at the end, maybe a "anyway".
14. **People post tools like people.** "vote pls", "lol", "settle this", or nothing.
15. **Keep the cast likeable.** The rules in `FEED_SPEC.md` 0 still hold: dull is fine, mean is not.

### Before and after (from `FEED_SPEC.md`)

| # | Where | Ours | Rewrite | Rule |
|---|---|---|---|---|
| 1 | F02 Maya, photo | "thesis draft is in. going to sleep for 3 days" | "THESIS DRAFT SUBMITTED 😭😭😭" | 4, 5 |
| 2 | F02 comments | Tsai Lin "proud of u. also you have 4 dishes in the sink", Will "sleep is for after friendsgiving", Calvin "legend" | Tsai Lin "SO PROUD OF U", Will "🎉🎉", Maya's aunt "Congratulations Maya! So proud ❤️", Calvin "lets gooo" | 7, 16 |
| 3 | F03 comments | Calvin "lupe's at 1am is a religious experience", Will "halal cart. this isn't a discussion", Tess "the final is TIED. someone break it" | Calvin "lupes", Will "halal cart no contest", Tess "wait how is it tied", Kev "where is gino's" | 1, 7 |
| 4 | F04 Calvin | "will's 21st is at the den tonight. arun is on the door. countdown on the roof at 11:59" | "Will turns 21 tonight 🥳 den, 9ish. roof at midnight. byob" | 2, 4 |
| 5 | F04 comments | Will "i'm going to cry and it's only 7am", Rae "landing at 6. save me a spot on the roof", Arun "door list is tight. if you're not on it, ask calvin nicely" | Will "ily guys", Rae "omw ✈️", Hana "what time are people actually coming", Calvin "@Arun Vaithianathan" | 7, 8 |
| 6 | F06 Maya | "ranked every boba place on telegraph. 1 tea hut 2 boba bliss 3 milk & moon 4 bubble lab. fight me" | "rank them. wrong answers only" | 14 |
| 7 | F06 comments | Will "boba bliss at 2 is slander", Arun "kiki's truck at 2am is an S and you know it", Maya "the truck is only open when i'm asleep" | Will "boba bliss??", Arun "kikis", Maya "kikis isnt even open", Arun "it is at 2am" (reply) | 7, 9 |
| 8 | F07 Hana, photo | "shot a whole roll on the walk to class. the fog was showing off" | "fog" | 2 |
| 9 | F07 comments | Tsai Lin "framing this", Bea "is that the bell tower or a ghost", Hana "both" | Tsai Lin "😍😍", Bea "ok wait this is so good", Kofi "film?", Hana "yes!! 400 speed" | 4, 7 |
| 10 | F11 Tess | "crossroads pesto pasta tuesday is the only constant in my life" | "pesto pasta is back at crossroads fyi" | 1, 12 |
| 11 | F12 comments | Ava "you were asleep at 1:14", Wes "he's asleep on the floor of the lounge rn", Kev "resting my eyes" | Ava "go to bed", Wes [photo: a hoodie and one sock on a lounge floor], Kev "that was 1 time" | 9, 10 |
| 12 | F14 Will, tool share | "fall '26 so far. calvin sent 1,395 voice memos and i'm framing it" | "lol accurate" | 14 |
| 13 | F15 Aditya | "anyone selling a mini fridge. asking for a friend (me)" | "Anyone selling a mini fridge? need one asap" | 1, 3 |
| 14 | F15 comments | Ines "i am. friends first sale is up", Aditya "claimed. you're a legend", Will "it's for his pans isn't it" | Will "@Ines Park", Ines "i have one! pm'd you", Sam "I have one too $45" | 7, 10 |
| 15 | F16 Ines | "moving to seattle in december. friends get first pick until tomorrow 9am, then it all goes on marketplace" | "MOVING SALE 📦 everything has to go before dec 15. friends get first dibs till tmrw 9am, then it goes on marketplace. pick up only, 2nd floor no elevator sorry" | 2, 13 |
| 16 | F18 memory | "big sur. aditya drove all of it and we did the short mcway falls hike twice" | Original from a year ago: "big sur w the best people 🌊❤️" · reshare text: "take me back" | 1, 2 |
| 17 | F19 Ruth, listing share | "selling my green velvet loveseat. fits 2, cat free home, i will miss her" | "selling this!! $120 obo, need it gone before thanksgiving" | 19 |
| 18 | F22 Will, photo | "sunday brunch before everyone leaves for break" | "brunch 🥞" | 2 |
| 19 | F22 comments | Maya "the french toast changed me", Rae "jealous. 6 hours till i'm there", Calvin "i'll go again tomorrow" | Maya "where is this", Will "night owl", Rae "why wasnt i invited", Will "ur in another state" (reply) | 7, 9 |
| 20 | F23 Omar, life event | "6am runs paid off somehow" | "Started new job at Halden Labs" card · text "excited to share i'll be joining halden after graduation!! so grateful for everyone who helped me along the way 🙏" · comments "Congrats!!", "proud of u omar", his mom "So proud of you habibi ❤️❤️", "lets gooo" | 5, 16 |
| 21 | F27 Calvin, photo | "we lost but the tailgate won" | "tailgate szn" with 7 photos (+4 shown) | 1, 2 |
| 22 | F28 Bea, link | "wall hours are longer for finals. tuesday and thursday till 10" | No text, just the link card "Rec center finals hours · rec.eastfield.example" | 15 |
| 23 | F31 Wes | "moving into apt 2c sunday morning. pizza for anyone who carries a box" | "anyone free sunday morning to help me move?? its literally 2 blocks. will pay in pizza 🍕" | 4, 5 |
| 24 | F32 comments | Tsai Lin "in. the wall is open till 10 for finals", Arun "in. gym then wall then sleep", Bea "logging it in a spreadsheet obviously" | Tsai Lin "in", Arun "in", Kofi "do rest days count", Bea "@Hana Ito" | 7 |
| 25 | F36 Zoe, group | "senior portraits this week at the union, 10 to 4. bring a jacket, the light is cold" | "REMINDER senior portraits are this week!! 📸 Union 2nd floor, 10am-4pm Mon-Fri. sign up link in comments. gowns provided. you do need an appointment, please stop emailing me 🙂" | 13 |
| 26 | F39 Kofi, photo | "first frost on the ridge trail. 34 degrees and worth it" | "cold one this morning" · comments "where is this??", Kofi "ridge trail!", Maya "😍" | 1, 7 |
| 27 | F05 Lena, group | "subletting my room jun-aug, 2br on dwight, $950 furnished. dm me" | "SUMMER SUBLET 🌞 1 room in a 2br on dwight, jun 1 - aug 31, $950/mo utilities incl. fully furnished (loft bed + desk stay). roommate is a quiet grad student. 8 min walk to campus. comment or dm if interested!!" · comments "interested!", "pm'd", "is this still available?", "bump" | 13, 16 |
| 28 | M1 listing | "moving to portland, has to go by sunday. no stains, one cushion is a little flat. you pick up" | "grey sectional $180 obo. NEED GONE BY SUNDAY, moving. no stains no pets no smoking. one cushion is a lil flat. you pick up (3rd floor, i'll help carry). first come first serve, no holds" | 19 |
| 29 | M3 listing | "works fine, frame is solid. mattress is thin" | "futon. works. $60" | 2, 19 |
| 30 | E3 description | "Will turns 21 at midnight. Countdown on the roof. Bring a sweater, it's cold up there." | "its will's 21st!!! 🎂 come thru to the den. countdown on the roof at midnight. bring a jacket its freezing up there. byob, we'll have pizza. text calvin if you can't find it" | 5, 13 |
| 31 | S7 story | "roof is ready for tonight" | no caption, a song sticker, and "🫡" | 2 |
| 32 | R3 reel | "every taco truck on telegraph, pt 2" | "every taco truck on telegraph pt 2 🌮 which one should i try next?? #eastfield #tacos" | 4 |

### Chat stretches

**apt 4b 001-009 (the big pot).** Ours: nine lines, one topic, a joke on almost every line, the
thread closes with a heart.

Rewrite (same facts, same times start):
```
001 · d-20 18:42 · maya · who has the big pot
002 · d-20 18:42 · maya · the good one
003 · d-20 18:42 · maya · w the lid
004 · d-20 19:31 · priya · not me
005 · d-20 19:31 · priya · also did anyone get a package its not mine
006 · d-20 20:14 · dev · pot is in my room sorry
007 · d-20 20:14 · dev · its clean
008 · d-20 20:15 · maya · why
009 · d-20 20:15 · maya · nvm dont tell me · 😂 me
010 · d-20 20:40 · me · package is mine 🙏
```
Bursts of three, a second topic, a 49-minute gap, a "nvm", the package answer arriving after.

**the boys 001-009 (fifa).** Ours ends with "legend". Rewrite:
```
001 · d-20 19:12 · jonah · fifa tn?
002 · d-20 19:30 · dev · after 9 lab report
003 · d-20 19:31 · theo · ya
004 · d-20 19:31 · theo · bringing my controller
005 · d-20 19:33 · jonah · mine works fine
006 · d-20 19:33 · theo · it does not 💀
007 · d-20 21:02 · me · coming to watch
008 · d-20 21:02 · me · whos there
009 · d-20 21:20 · jonah · [voice memo 0:14]
```

**senior week 029-041 (pier pizza).** Keep "omw in my heart"; it's good. Cut "we know" and add
the dead air: Maya's "ok actually omw" lands 77 minutes later with no reply to it, then Will's
photo of two slices with no text, then "saved u 2" four minutes later.

**econ 140, any stretch.** Add a "?" sent alone 20 minutes after a question nobody answered, one
person answering last week's question ("its tuesday" to "when's ps4 due" after the ps5 thread
started), and a poll "study thurs or fri?" with 2 votes.

---

## 5. A 40-post feed: target mix

These are targets from the measured spread and public-page reading, not Facebook data (none is
open). A tool post counts in whichever text row its caption belongs to.

| Kind | Posts | Notes |
|---|---|---|
| Plain and dull (info, ask, small complaint, no joke) | 9 | "anyone have a phone charger i can borrow in main stacks" |
| Photo with 0-3 words | 8 | 3 of them with no caption at all; 2 are carousels "+4" |
| Shared link, reel or post with no text | 3 | link card with a real-looking preview |
| Tool shared with 1-3 words ("vote", "lol", "settle this") | 6 | |
| Long (35+ words, runs on) | 3 | one life update, one sale, one rant or thank-you |
| Life event (job, new city, anniversary, birthday) | 2 | many reactions, many "congrats!!" |
| Group post (ISO, sublet, lost and found, reminder) | 4 | shows group name |
| Page, sponsored or "suggested for you" | 3 | campus rec, a local cafe, an ad |
| Memory ("1 year ago") | 1 | |
| Clever, one good joke | 3 | the only ones allowed a punchline |
| Vague post ("some people man") or sad post | 1 | one comment "u ok?" and a "dm me" |

Length targets for the 40 texts: 6 posts of 0 words, 8 of 1-3, 12 of 4-10, 9 of 11-30, 5 over 30.

Engagement targets: 6 posts under 5 reactions (two with 1 or 2), 12 with 5-25, 14 with 25-80,
6 with 80-200, 2 life events over 200. Comments: 8 posts with 0, 14 with 1-3, 12 with 4-15, 6
with 16+. Shares: 0 on 30 posts. Reaction mix: 👍 or ❤️ leads on most; 😆 leads only on the
three jokes; 😮 and 😢 appear on a few; 🥰 (care) on one life event.

Timestamps: spread "Just now", "12m", "3h", "Yesterday at 11:48 PM", "2d", "Nov 3"; at least two
posts from after midnight; the feed is not in plot order.

---

## 6. Comment-thread recipe

For a friend's post with N shown comments (show 1-3; the count says more).

- 40% one reaction: "😍", "omg", "cute", "!!!", "SO GOOD", "lets goo", "😭😭".
- 20% a tag with nothing else: "@Hana Ito". Sometimes the tagged person replies "😂" or "LMAO".
- 15% an unrelated or practical question: "where is this", "is this tonight?", "what time".
- 10% a real joke or callback. At most one per thread.
- 10% from outside the group: a relative ("So proud of you sweetie!"), a high school friend
  ("miss u!!"), someone who comments on everything ("nice").
- 5% replying to the wrong thing or late: answering a question someone already answered, a
  comment two days after the post.

Shape:
- One reply chain at most per post, two or three deep, often ending in "lol" or "😂".
- The poster replies to some comments with "ty!!" or a heart and ignores others.
- "View 6 more comments" appears more often than a full thread.
- Comment likes: most have 0-2; one has more.

---

## 7. Group-chat rhythm recipe

Per day in a 4-6 person chat:
- 2-5 bursts. A burst is 4-20 lines in 10 minutes, then nothing for hours.
- 30-40% of lines follow a line from the same sender (we have 23%). Split one thought over 2-4
  lines: "wait", "is the", "is the dining hall open tmrw".
- 10% of gaps longer than an hour inside a day, and at least one question per day answered
  more than 3 hours later or never.
- 1 in 5 questions gets no reply. 1 in 10 gets "?" or "??" as a follow-up from the asker.
- 2 topics overlap in any burst of 10+ lines. One person is still on the previous topic.
- Reactions replace replies: 1 in 6 lines gets a reaction; "😂" and "❤️" and "👍" most; "‼️"
  and "❓" now and then. A plan often gets only thumbs-ups and no text.
- Every 30-50 lines: a photo with no text, a link with no text, a voice memo ("voice memo
  0:42"), a sticker or GIF, a deleted message ("Maya unsent a message"), a "wrong chat", a
  late "lmaooo" to something from hours earlier.
- One person each day sends nothing; another sends half the lines.
- Nicknames, not names. The chat itself has a name nobody remembers choosing, an emoji, and
  a pinned message that's out of date.
- Typos: about 1 in 25 lines, with a correction line "*the" half the time.

---

## 8. Templates in real voice

### Marketplace listing

Title: `<thing>` or `<thing> - <price>` or `<THING> NEED GONE` or `<brand> <thing> like new`.

Body, pick 3-6 parts in any order, lowercase or capitals both fine:
- `$<price> obo` / `$<price> firm` / `free if you pick up today` / `originally $<higher>`
- `need gone by <day>` / `moving <day>` / `graduating`
- `works great` / `barely used` / `some wear (see pics)` / `one <flaw>`
- `no pets no smoking`
- `pick up only` / `<street> & <street>` / `<n> floor no elevator` / `can help carry`
- `first come first serve, no holds` / `pending pickup` / `SOLD`
- `msg me` / `still available if listed`

Example: "white desk $40 obo. need gone by sat, moving out. small scratch on the left side.
pick up on channing, 2nd floor. first come first serve"

Buyer messages: "Is this still available?" (the Marketplace default, sent most), "can u do
$30", "can i pick up tonight", "omw", "here", "which unit".

### Event description (student-written)

- Line 1: what it is in caps or with "!!" and one emoji.
- Line 2: day, time, place, often a room number.
- Line 3: food ("FREE PIZZA", "snacks provided", "byob").
- Line 4: "all are welcome", "bring friends", "no experience needed".
- Optional: a fee via Venmo, a sign-up link "in comments", "rsvp so we know how much food".

Example: "CLIMBING CLUB GENERAL MEETING 🧗 thurs 7pm, rec center back room. free pizza!! new
people welcome, no experience needed. we'll talk about the castle rock trip"

### Group post

- ISO: "ISO a 1br or room for spring, $800-1000, near campus. moving in jan. pm me!!"
- Lost: "LOST: blue water bottle w a frog sticker, main stacks 3rd floor tues. please dm 🙏"
- Ride: "anyone driving to the airport sunday morning? will chip in for gas"
- Recs: "dentist recs that take the student plan??"
- Comments: "bump", "following", "pm'd", "@<friend>", "still looking?", "this is so specific
  lol i saw it yesterday".

---

## 9. What would help most from the owner

In order of value:
1. **A real group-chat export of your own** (Messenger "Download your information", JSON;
   or WhatsApp "Export chat" without media). One busy chat, a few weeks. We'd count rhythm
   (bursts, gaps, reactions, splits) and never copy lines or names.
2. **Screenshots of your real Facebook feed, 30-40 posts, names and faces blurred.** The
   single best check of the post mix, engagement numbers and timestamps.
3. **Screenshots of 2-3 campus groups you're in** (housing, free and for sale, class of '26 or
   '27): 15 posts each, names blurred.
4. **Your own posts and comments** from the last two years (Download your information, posts
   and comments only). Shows how a real person writes captions.
5. **Five real Marketplace listings you've sold or looked at**, and the buyer messages.
6. **Two or three event pages you were invited to** by student orgs.
7. Optional, closed sources only you can export: Instagram (captions, comments), Snapchat chat
   history (text only), Discord server export if your friends use one, Google Takeout of
   Messages, iMessage via a Mac backup tool.
8. Decisions: may we email the NUS SMS Corpus authors; may we use ConvoKit's r/college corpus
   for counting only; does the "no exclamation marks" rule apply to made-up people's posts.

---

## 10. Other realism levers beyond text

- **Timestamps with gaps**: "Yesterday at 11:48 PM" next to "3h" next to "Nov 3" is what makes a feed feel lived in.
- **Mixed engagement**: a post with 2 likes and no comments next to one with 140 tells the eye these are different people.
- **Page and sponsored posts**: real feeds are a third non-friend content; without an ad or a page it reads as a set.
- **Suggested for you**: a group or reel you don't follow, with "Join" or "Follow", is a strong Facebook marker.
- **People you may know**: a row of 4 faces with mutual counts, one of them obviously a TA.
- **Birthdays**: "Will Li's birthday is today" with "Write on his timeline" and a few wall posts saying "happy birthday!!🎉".
- **Memories**: one "On this day" card, ideally a little embarrassing.
- **Friend activity lines**: "Maya Chen commented on Hana Ito's post" and "Arun reacted to this" above posts.
- **Link preview cards**: real-looking domain, title, a cropped image, not "example".
- **Low-quality photos**: tilted, slightly dark, a thumb in the corner, a receipt; not only nice stock shots.
- **Video thumbnails**: a play icon and a duration "0:47", and a view count on reels.
- **Unread badges that add up**: the Messenger count equals the unread chats; notifications show 3 not 10.
- **Typing indicator**: "Maya is typing..." that starts and stops without a message.
- **Seen receipts**: small faces under the last read line, one person "seen" but not replying.
- **Reaction variety**: care 🥰 and wow 😮 in the mix, a few sad on a vague post; reactions on comments too.
- **Nicknames in chats**: Messenger nicknames ("big pan energy" for Aditya) set by friends, shown in the header.
- **Chat themes and quick emoji**: one chat with a colour theme and a custom quick reaction (🍕 for the boys).
- **Pinned messages**: the wifi password pinned months ago and the Airbnb address pinned in senior week.
- **Polls nobody answered**: "study thurs or fri?" with 2 votes, still open.
- **Unsent and edited messages**: "Maya unsent a message" and an "Edited" tag on one line.
- **Missed call and voice memo bubbles**: "Missed audio call" in a DM, a 0:42 voice memo with a waveform.
- **Group admin noise**: "Calvin changed the group name to 'the boys 2'", "Tsai Lin added Rae".
- **Marketplace chrome**: "Is this still available?" auto-message, "Pending", "Sold" stamp, distance "1.4 mi".
- **Notification mix**: "Kofi posted in Eastfield climbing club", "You have a memory", "3 friends are going to an event near you", "Your post has 12 new reactions".
