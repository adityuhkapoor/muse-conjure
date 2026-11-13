import { defineApp, rng, Button, CardHeader, Facepile, SystemLine } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Two truths and a lie, from today's flag football game. One person at a time writes two truths and
// one lie, everyone else guesses the lie, then the author reveals it.
const CHAT = {
	title: "Two truths and a lie",
	rules: "Only real stuff from today. The lie has to sound real.",
	hints: [
		"We made the semis",
		"Theo had 3 TDs against the chem majors",
		"Theo still has a bruise",
		"Abby got a flag penalty for holding",
		"Ines did the bus playlist, 90s throwbacks only",
		"Luis slept the whole ride to the field",
		"Luis was up til 3 doing a lab report",
		"Ines did Mr Brightside karaoke",
		"We lost 21-14 in the semis",
		"Sam dropped the last pass in the endzone",
		"Chick-fil-A after, 12 nuggets for Luis",
		"The team name was the Sleepy Otters"
	]
};
const MAX = 80;
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const clean = (x) => typeof x === "string" ? x.trim().replace(/\s+/g, " ") : "";
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const pts = (s, u) => s.score.find((e) => e.user === u)?.points ?? 0;
const addPoint = (score, u) => score.some((e) => e.user === u) ? score.map((e) => e.user === u ? {
	...e,
	points: e.points + 1
} : e) : [...score, {
	user: u,
	points: 1
}];
const distinct = (texts) => new Set(texts.map((t) => t.toLowerCase())).size === texts.length;
const nameIn = (members, id) => id === null ? "Someone" : members.find((m) => m.id === id)?.name ?? "Someone";
const others = (s, user) => s.guesses.filter((g) => g.user !== user).map((g) => `${g.user}:${g.pick}`).join();
const reset = (s, at, score) => ({
	...s,
	phase: "setup",
	author: null,
	statements: [],
	lieIndex: null,
	guesses: [],
	score,
	at
});
export default defineApp({
	name: "Two truths one lie",
	summary: (s, ctx) => s.phase === "setup" ? `${CHAT.title} · no round yet` : s.phase === "guessing" ? `${CHAT.title} · ${nameIn(ctx.members, s.author)} is up · ${s.guesses.length} guessed` : `${CHAT.title} · round ${s.rounds} done`,
	init: () => ({
		phase: "setup",
		author: null,
		statements: [],
		lieIndex: null,
		guesses: [],
		score: [],
		rounds: 0,
		at: 0
	}),
	reduce: (s, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return s;
		if (action.t === "start") {
			if (s.phase === "guessing") return s;
			const texts = [
				clean(action.a),
				clean(action.b),
				clean(action.lie)
			];
			if (texts.some((t) => !t || t.length > MAX) || !distinct(texts)) return s;
			const order = rng(meta.seed).shuffle([
				0,
				1,
				2
			]);
			return {
				...s,
				phase: "guessing",
				author: meta.user,
				statements: order.map((i) => texts[i]),
				lieIndex: order.indexOf(2),
				guesses: [],
				at: meta.time
			};
		}
		if (action.t === "guess") {
			if (s.phase !== "guessing" || meta.user === s.author) return s;
			const pick = action.pick;
			if (typeof pick !== "number" || !Number.isInteger(pick) || pick < 0 || pick > 2) return s;
			const cur = s.guesses.find((g) => g.user === meta.user);
			if (cur && cur.pick === pick) return s;
			const guesses = cur ? s.guesses.map((g) => g.user === meta.user ? {
				...g,
				pick
			} : g) : [...s.guesses, {
				user: meta.user,
				pick
			}];
			return {
				...s,
				guesses,
				at: meta.time
			};
		}
		if (action.t === "reveal") {
			if (s.phase !== "guessing" || meta.user !== s.author || s.guesses.length === 0) return s;
			let score = s.score;
			for (const g of s.guesses) score = g.pick === s.lieIndex ? addPoint(score, g.user) : addPoint(score, meta.user);
			return {
				...s,
				phase: "revealed",
				score,
				rounds: s.rounds + 1,
				at: meta.time
			};
		}
		if (action.t === "cancel") {
			if (s.phase !== "guessing" || meta.user !== s.author) return s;
			return reset(s, meta.time, s.score);
		}
		return s;
	},
	// Someone left: their guesses and points go. If the author left, the round ends without points.
	onMembers: (s, ctx) => {
		const score = s.score.filter((e) => inChat(ctx, e.user));
		if (s.author !== null && !inChat(ctx, s.author)) return reset(s, s.at, score);
		const guesses = s.guesses.filter((g) => inChat(ctx, g.user));
		if (score.length === s.score.length && guesses.length === s.guesses.length) return s;
		return {
			...s,
			guesses,
			score
		};
	},
	invariants: {
		"statements are empty or exactly three distinct texts of 1 to 80 characters": (s) => s.statements.length === 0 || s.statements.length === 3 && s.statements.every((t) => t.length > 0 && t.length <= MAX) && distinct(s.statements),
		"setup has no round, otherwise there is an author, a lie and three statements": (s) => s.phase === "setup" ? s.author === null && s.lieIndex === null && s.statements.length === 0 && s.guesses.length === 0 : s.author !== null && s.lieIndex !== null && Number.isInteger(s.lieIndex) && s.lieIndex >= 0 && s.lieIndex <= 2 && s.statements.length === 3,
		"one guess per person, picks are 0 to 2, the author never guesses": (s) => new Set(s.guesses.map((g) => g.user)).size === s.guesses.length && s.guesses.every((g) => Number.isInteger(g.pick) && g.pick >= 0 && g.pick <= 2 && g.user !== s.author),
		"the author, guessers and scorers are in the chat": (s, ctx) => (s.author === null || inChat(ctx, s.author)) && s.guesses.every((g) => inChat(ctx, g.user)) && s.score.every((e) => inChat(ctx, e.user)),
		"points are whole numbers, one entry per person": (s) => new Set(s.score.map((e) => e.user)).size === s.score.length && s.score.every((e) => Number.isInteger(e.points) && e.points >= 0),
		"rounds are whole numbers and a revealed round was counted": (s) => Number.isInteger(s.rounds) && s.rounds >= 0 && (s.phase !== "revealed" || s.rounds >= 1)
	},
	transitions: {
		"a start makes the actor author with the three texts shuffled by the seed": (p, n, a, m) => {
			if (a.t !== "start" || p === n) return true;
			if (typeof a.a !== "string" || typeof a.b !== "string" || typeof a.lie !== "string") return false;
			const texts = [
				clean(a.a),
				clean(a.b),
				clean(a.lie)
			];
			const order = rng(m.seed).shuffle([
				0,
				1,
				2
			]);
			return p.phase !== "guessing" && n.phase === "guessing" && n.author === m.user && n.guesses.length === 0 && n.rounds === p.rounds && same(n.score, p.score) && n.statements.length === 3 && order.every((o, i) => n.statements[i] === texts[o]) && n.statements[n.lieIndex ?? -1] === texts[2];
		},
		"a guess sets only the actor's own pick": (p, n, a, m) => a.t !== "guess" || p === n || p.phase === "guessing" && m.user !== p.author && n.guesses.find((g) => g.user === m.user)?.pick === a.pick && others(p, m.user) === others(n, m.user) && same(n.score, p.score) && same(n.statements, p.statements) && n.lieIndex === p.lieIndex && n.author === p.author,
		"only the author can reveal or cancel": (p, n, a, m) => a.t !== "reveal" && a.t !== "cancel" || p === n || m.user === p.author,
		"a reveal gives one point per guess, to the guesser if right, else to the author": (p, n, a) => {
			if (a.t !== "reveal" || p === n) return true;
			const ids = [...new Set([
				...p.score.map((e) => e.user),
				...n.score.map((e) => e.user),
				...p.guesses.map((g) => g.user),
				...p.author ? [p.author] : []
			])];
			const wrong = p.guesses.filter((g) => g.pick !== p.lieIndex).length;
			return p.phase === "guessing" && n.phase === "revealed" && n.rounds === p.rounds + 1 && same(n.guesses, p.guesses) && same(n.statements, p.statements) && ids.every((u) => pts(n, u) - pts(p, u) === (p.guesses.some((g) => g.user === u && g.pick === p.lieIndex) ? 1 : 0) + (u === p.author ? wrong : 0));
		},
		"a cancel returns to setup and leaves points and rounds alone": (p, n, a) => a.t !== "cancel" || p === n || p.phase === "guessing" && n.phase === "setup" && same(n.score, p.score) && n.rounds === p.rounds,
		"only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		if (s.phase === "guessing") {
			if (user === s.author) {
				const x = r.next();
				if (x < .6) return { t: "reveal" };
				if (x < .8) return { t: "cancel" };
				return {
					t: "guess",
					pick: r.int(3)
				};
			}
			if (r.next() < .1) return { t: "reveal" };
			return {
				t: "guess",
				pick: r.next() < .1 ? 5 : r.int(3)
			};
		}
		const f = r.shuffle([...CHAT.hints]);
		if (r.next() < .1) return {
			t: "start",
			a: "",
			b: f[0],
			lie: f[1]
		};
		return {
			t: "start",
			a: f[0],
			b: f[1],
			lie: f[2]
		};
	},
	local: {
		open: false,
		a: "",
		b: "",
		lie: ""
	},
	view: ({ state, confirmed, pending, me, members, dispatch, theme, local, setLocal }) => {
		const c = confirmed;
		const nameOf = (id) => id === me ? "You" : nameIn(members, id);
		const shuffling = pending && state.phase === "guessing" && c.phase !== "guessing";
		const guesses = c.phase === "guessing" && state.phase === "guessing" ? state.guesses : c.guesses;
		const isAuthor = c.author === me;
		const myPick = guesses.find((g) => g.user === me)?.pick;
		const guessers = members.filter((m) => m.id !== c.author).length;
		const wrong = c.guesses.filter((g) => g.pick !== c.lieIndex).length;
		const subtitle = shuffling ? "Shuffling" : c.phase === "setup" ? "No round yet" : c.phase === "guessing" ? `${isAuthor ? "You're" : nameOf(c.author) + " is"} up · ${guesses.length} of ${guessers} guessed` : `${isAuthor ? "You" : nameOf(c.author)} fooled ${wrong} of ${c.guesses.length}`;
		const texts = [
			clean(local.a),
			clean(local.b),
			clean(local.lie)
		];
		const valid = texts.every((t) => t.length > 0 && t.length <= MAX) && distinct(texts);
		const post = () => {
			if (!valid || c.phase === "guessing") return;
			dispatch({
				t: "start",
				a: texts[0],
				b: texts[1],
				lie: texts[2]
			});
			setLocal({
				open: false,
				a: "",
				b: "",
				lie: ""
			});
		};
		const ranked = [...c.score].sort((x, y) => y.points - x.points).slice(0, 6);
		const rows = c.phase !== "setup" && !shuffling ? c.statements.map((t, i) => {
			const mine = myPick === i;
			const canPick = c.phase === "guessing" && !isAuthor;
			const isLie = c.phase === "revealed" && i === c.lieIndex;
			const tag = c.phase === "revealed" ? isLie ? "Lie · " : "Truth · " : isAuthor && i === c.lieIndex ? "Your lie · " : "";
			return /* @__PURE__ */ _jsxs("div", {
				...canPick ? {
					role: "button",
					tabIndex: 0
				} : {},
				onClick: () => {
					if (canPick) dispatch({
						t: "guess",
						pick: i
					});
				},
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					minHeight: 44,
					padding: "8px 12px",
					borderRadius: theme.radius.input,
					background: mine ? theme.color.primary : theme.color.input,
					color: mine ? theme.color.onPrimary : theme.color.text,
					border: `2px solid ${isLie ? theme.color.negative : theme.color.divider}`,
					cursor: canPick ? "pointer" : "default"
				},
				children: [/* @__PURE__ */ _jsxs("span", {
					style: {
						flex: 1,
						minWidth: 0,
						overflowWrap: "anywhere"
					},
					children: [tag ? /* @__PURE__ */ _jsx("b", { children: tag }) : null, t]
				}), c.phase === "revealed" ? /* @__PURE__ */ _jsx(Facepile, {
					users: c.guesses.filter((g) => g.pick === i).map((g) => g.user),
					max: 3,
					size: 20
				}) : null]
			}, i);
		}) : null;
		return /* @__PURE__ */ _jsxs("div", {
			style: {
				display: "grid",
				gap: 8
			},
			children: [
				/* @__PURE__ */ _jsx(CardHeader, {
					title: CHAT.title,
					subtitle
				}),
				shuffling ? /* @__PURE__ */ _jsx(SystemLine, { children: "Shuffling" }) : null,
				rows ? /* @__PURE__ */ _jsx("div", {
					style: {
						display: "grid",
						gap: 8
					},
					children: rows
				}) : null,
				c.phase === "guessing" && !shuffling ? /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "grid",
						gap: 8
					},
					children: [/* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: 32
						},
						children: [/* @__PURE__ */ _jsx(Facepile, {
							users: guesses.map((g) => g.user),
							max: 6,
							size: 24
						}), /* @__PURE__ */ _jsx("small", { children: isAuthor ? "Waiting for guesses" : myPick === undefined ? "Tap the one you think is the lie" : "Tap another to change your pick" })]
					}), isAuthor ? /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							gap: 8
						},
						children: [/* @__PURE__ */ _jsx(Button, {
							kind: "primary",
							disabled: guesses.length === 0,
							onClick: () => dispatch({ t: "reveal" }),
							children: "Reveal"
						}), /* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							onClick: () => dispatch({ t: "cancel" }),
							children: "Cancel"
						})]
					}) : null]
				}) : null,
				(c.phase === "setup" || c.phase === "revealed") && !shuffling ? local.open ? /* @__PURE__ */ _jsxs("form", {
					style: {
						display: "grid",
						gap: 8
					},
					onSubmit: (e) => {
						e.preventDefault();
						post();
					},
					children: [
						/* @__PURE__ */ _jsx("input", {
							value: local.a,
							maxLength: MAX,
							placeholder: "A true thing",
							"aria-label": "First truth",
							onInput: (e) => setLocal({ a: e.currentTarget.value })
						}),
						/* @__PURE__ */ _jsx("input", {
							value: local.b,
							maxLength: MAX,
							placeholder: "Another true thing",
							"aria-label": "Second truth",
							onInput: (e) => setLocal({ b: e.currentTarget.value })
						}),
						/* @__PURE__ */ _jsx("input", {
							value: local.lie,
							maxLength: MAX,
							placeholder: "The lie",
							"aria-label": "The lie",
							onInput: (e) => setLocal({ lie: e.currentTarget.value })
						}),
						/* @__PURE__ */ _jsx("small", { children: CHAT.rules }),
						/* @__PURE__ */ _jsxs("div", {
							style: {
								display: "flex",
								gap: 8
							},
							children: [/* @__PURE__ */ _jsx(Button, {
								kind: "primary",
								disabled: !valid,
								onClick: post,
								children: "Post"
							}), /* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => setLocal({ open: false }),
								children: "Close"
							})]
						})
					]
				}) : /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "grid",
						gap: 8
					},
					children: [
						ranked.length ? /* @__PURE__ */ _jsx("div", {
							style: {
								display: "flex",
								flexWrap: "wrap",
								gap: 6
							},
							children: ranked.map((e) => /* @__PURE__ */ _jsx("span", {
								style: {
									padding: "4px 10px",
									borderRadius: theme.radius.pill,
									background: theme.color.input,
									color: theme.color.text,
									fontSize: theme.type.meta,
									maxWidth: "100%",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap"
								},
								children: `${nameOf(e.user)} · ${e.points}`
							}, e.user))
						}) : null,
						c.phase === "setup" ? /* @__PURE__ */ _jsx("small", { children: CHAT.rules }) : null,
						/* @__PURE__ */ _jsx("div", { children: /* @__PURE__ */ _jsx(Button, {
							kind: "primary",
							onClick: () => setLocal({ open: true }),
							children: c.phase === "revealed" ? "Next round" : "Start round"
						}) })
					]
				}) : null
			]
		});
	}
});
