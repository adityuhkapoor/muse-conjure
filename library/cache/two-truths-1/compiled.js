import { defineApp, rng, Button, CardHeader, Facepile, SystemLine } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "@muse/app/jsx-runtime";
// Two truths and a lie about the cabin weekend. Each round starts with two real moments from the
// chat. Someone writes the lie, the order is shuffled, everyone else guesses, the author reveals.
const CABIN = {
	title: "Two truths and a lie",
	place: "Cabin weekend",
	rounds: [
		["Owen set off the smoke alarm twice on pancakes", "Bea drove 40 min the wrong way to a gravel quarry"],
		["Nora hit the 2am raccoon with a pool noodle", "Eli's shoe ended up at the bottom of Lake Tamarack"],
		["Jake ripped the hammock rated for 300 lbs", "Maya won Monopoly in about 45 min"],
		["A raccoon got into the kitchen at 2am", "Jake slept about 3 hours all weekend"]
	]
};
const MAX_ROUNDS = 12;
const MAX_LIE = 80;
const clean = (x) => x.trim().replace(/\s+/g, " ");
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const withRound = (s, id, f) => ({
	...s,
	rounds: s.rounds.map((r) => r.id === id ? f(r) : r)
});
const without = (g, user) => Object.fromEntries(Object.entries(g).filter(([k]) => k !== user));
const others = (s, id) => s.rounds.filter((r) => r.id !== id);
const lieOf = (r) => r.statements.find((x) => x.lie);
const revealedCount = (s) => s.rounds.filter((r) => r.status === "revealed").length;
const rightGuessers = (r) => Object.entries(r.guesses).filter(([, pick]) => r.statements[pick]?.lie === true).map(([u]) => u);
const score = (s, user) => s.rounds.filter((r) => r.status === "revealed" && rightGuessers(r).includes(user)).length;
const blocked = (s, user) => s.rounds.some((r) => r.author === user && r.status !== "revealed");
export default defineApp({
	name: "Two truths and a lie",
	summary: (s) => `${s.title}: ${revealedCount(s)} of ${s.rounds.length} rounds revealed.`,
	init: () => ({
		title: CABIN.title,
		place: CABIN.place,
		at: 0,
		rounds: CABIN.rounds.filter((t) => t.length === 2 && t.every((x) => clean(x).length > 0)).slice(0, MAX_ROUNDS).map((t, i) => ({
			id: `r${i}`,
			truths: [clean(t[0]), clean(t[1])],
			author: null,
			statements: [],
			guesses: {},
			status: "open"
		}))
	}),
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		const r = state.rounds.find((x) => x.id === action.round);
		if (!r) return state;
		if (action.t === "write") {
			if (r.status !== "open" || typeof action.lie !== "string") return state;
			const lie = clean(action.lie);
			if (!lie || lie.length > MAX_LIE) return state;
			if (r.truths.some((t) => t.toLowerCase() === lie.toLowerCase())) return state;
			if (blocked(state, meta.user)) return state;
			const order = rng(meta.seed).shuffle([
				{
					text: r.truths[0],
					lie: false
				},
				{
					text: r.truths[1],
					lie: false
				},
				{
					text: lie,
					lie: true
				}
			]);
			return {
				...withRound(state, r.id, (x) => ({
					...x,
					author: meta.user,
					statements: order,
					guesses: {},
					status: "guessing"
				})),
				at: meta.time
			};
		}
		if (action.t === "guess") {
			const pick = action.pick;
			if (r.status !== "guessing" || typeof pick !== "number" || !Number.isInteger(pick) || pick < 0 || pick > 2) return state;
			if (r.author === meta.user || r.guesses[meta.user] === pick) return state;
			return withRound(state, r.id, (x) => ({
				...x,
				guesses: {
					...x.guesses,
					[meta.user]: pick
				}
			}));
		}
		if (action.t === "reveal") {
			if (r.status !== "guessing" || r.author !== meta.user) return state;
			return withRound(state, r.id, (x) => ({
				...x,
				status: "revealed"
			}));
		}
		return state;
	},
	// Someone left: their guesses go. A round waiting on a gone author opens again; a revealed
	// round keeps its lie and the remaining guesses.
	onMembers: (s, ctx) => {
		let changed = false;
		const rounds = s.rounds.map((r) => {
			if (r.status === "open") return r;
			if (r.status === "guessing" && (r.author === null || !inChat(ctx, r.author))) {
				changed = true;
				return {
					...r,
					author: null,
					statements: [],
					guesses: {},
					status: "open"
				};
			}
			const keep = Object.entries(r.guesses).filter(([u]) => inChat(ctx, u));
			const authorGone = r.author !== null && !inChat(ctx, r.author);
			if (keep.length === Object.keys(r.guesses).length && !authorGone) return r;
			changed = true;
			return {
				...r,
				author: authorGone ? null : r.author,
				guesses: Object.fromEntries(keep)
			};
		});
		return changed ? {
			...s,
			rounds
		} : s;
	},
	invariants: {
		"open rounds have no author, no statements and no guesses": (s) => s.rounds.every((r) => r.status !== "open" || r.author === null && r.statements.length === 0 && Object.keys(r.guesses).length === 0),
		"guessing and revealed rounds have three statements: the two truths and one lie": (s) => s.rounds.every((r) => r.status === "open" || r.statements.length === 3 && r.statements.filter((x) => x.lie).length === 1 && r.statements.filter((x) => !x.lie).map((x) => x.text).sort().join("|") === [...r.truths].sort().join("|")),
		"every lie is 1 to 80 characters and not one of the truths": (s) => s.rounds.every((r) => {
			const lie = lieOf(r);
			return r.status === "open" || !!lie && lie.text.length >= 1 && lie.text.length <= MAX_LIE && !r.truths.some((t) => t.toLowerCase() === lie.text.toLowerCase());
		}),
		"every guess is 0 to 2, from someone in the chat who is not the author": (s, ctx) => s.rounds.every((r) => Object.entries(r.guesses).every(([u, p]) => Number.isInteger(p) && p >= 0 && p <= 2 && u !== r.author && inChat(ctx, u))),
		"a guessing round has an author in the chat, a revealed one has one or none": (s, ctx) => s.rounds.every((r) => (r.status !== "guessing" || r.author !== null && inChat(ctx, r.author)) && (r.status !== "revealed" || r.author === null || inChat(ctx, r.author))),
		"round ids are unique, at most 12 rounds, and no one authors two live rounds": (s) => s.rounds.length <= MAX_ROUNDS && new Set(s.rounds.map((r) => r.id)).size === s.rounds.length && s.rounds.every((r) => r.author === null || r.status === "revealed" || s.rounds.filter((x) => x.author === r.author && x.status !== "revealed").length === 1)
	},
	transitions: {
		"a write gives the round to the actor for guessing and touches no other round": (p, n, a, m) => {
			if (a.t !== "write" || p === n) return true;
			const pr = p.rounds.find((r) => r.id === a.round);
			const nr = n.rounds.find((r) => r.id === a.round);
			return !!pr && !!nr && pr.status === "open" && nr.status === "guessing" && nr.author === m.user && Object.keys(nr.guesses).length === 0 && same(pr.truths, nr.truths) && n.at === m.time && same(others(p, a.round), others(n, a.round));
		},
		"a write puts the statements in the order the seed gives": (p, n, a, m) => {
			if (a.t !== "write" || p === n) return true;
			const pr = p.rounds.find((r) => r.id === a.round);
			const nr = n.rounds.find((r) => r.id === a.round);
			const lie = nr ? lieOf(nr) : undefined;
			if (!pr || !nr || !lie || typeof a.lie !== "string") return false;
			const expected = rng(m.seed).shuffle([
				{
					text: pr.truths[0],
					lie: false
				},
				{
					text: pr.truths[1],
					lie: false
				},
				{
					text: clean(a.lie),
					lie: true
				}
			]);
			return same(expected, nr.statements);
		},
		"a guess sets only the actor's own guess": (p, n, a, m) => {
			if (a.t !== "guess" || p === n) return true;
			const pr = p.rounds.find((r) => r.id === a.round);
			const nr = n.rounds.find((r) => r.id === a.round);
			return !!pr && !!nr && pr.status === "guessing" && pr.author !== m.user && nr.guesses[m.user] === a.pick && same({
				...nr,
				guesses: without(nr.guesses, m.user)
			}, {
				...pr,
				guesses: without(pr.guesses, m.user)
			}) && same(others(p, a.round), others(n, a.round)) && n.at === p.at;
		},
		"only the author reveals, and a reveal changes only the status": (p, n, a, m) => {
			if (a.t !== "reveal" || p === n) return true;
			const pr = p.rounds.find((r) => r.id === a.round);
			const nr = n.rounds.find((r) => r.id === a.round);
			return !!pr && !!nr && pr.author === m.user && pr.status === "guessing" && same({
				...pr,
				status: "revealed"
			}, nr) && same(others(p, a.round), others(n, a.round)) && n.at === p.at;
		},
		"a revealed round and the title never change by an action": (p, n) => p.title === n.title && p.place === n.place && p.rounds.every((r) => r.status !== "revealed" || same(r, n.rounds.find((x) => x.id === r.id))),
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		const open = s.rounds.filter((x) => x.status === "open");
		const live = s.rounds.filter((x) => x.status === "guessing");
		const lies = [
			"A made up thing",
			"Another made up thing",
			"Something that never happened",
			"",
			"  spaced   out lie  "
		];
		const x = r.next();
		if (open.length && (x < .3 || live.length === 0)) {
			const round = r.pick(open);
			return {
				t: "write",
				round: round.id,
				lie: r.next() < .1 ? round.truths[0] : r.pick(lies)
			};
		}
		if (live.length) {
			const mine = live.find((q) => q.author === user);
			if (mine && x < .6) return {
				t: "reveal",
				round: mine.id
			};
			return {
				t: "guess",
				round: r.pick(live).id,
				pick: r.int(3)
			};
		}
		return s.rounds.length ? {
			t: "reveal",
			round: r.pick(s.rounds).id
		} : null;
	},
	local: {
		idx: -1,
		draft: ""
	},
	view: ({ state, confirmed, pending, me, members, dispatch, local, setLocal, theme }) => {
		const rounds = state.rounds;
		const firstLive = rounds.findIndex((r) => r.status !== "revealed");
		const auto = firstLive >= 0 ? firstLive : rounds.length - 1;
		const idx = local.idx >= 0 && local.idx < rounds.length ? local.idx : auto;
		const cur = rounds[idx];
		const header = /* @__PURE__ */ _jsx(CardHeader, {
			title: state.title,
			subtitle: `${state.place} · ${revealedCount(state)} of ${rounds.length} revealed`
		});
		if (!cur) return /* @__PURE__ */ _jsxs("div", { children: [header, /* @__PURE__ */ _jsx(SystemLine, { children: "No rounds yet" })] });
		const nameOf = (id) => id === null ? "Someone" : id === me ? "You" : members.find((m) => m.id === id)?.name ?? "Someone";
		const isAuthor = cur.author === me;
		const eligible = members.filter((m) => m.id !== cur.author).length;
		const guessed = Object.keys(cur.guesses).filter((u) => members.some((m) => m.id === u)).length;
		const waiting = Math.max(0, eligible - guessed);
		const shuffling = pending && cur.status === "guessing" && confirmed.rounds.find((r) => r.id === cur.id)?.status === "open";
		const busy = blocked(state, me);
		const draft = clean(local.draft);
		const canAdd = draft.length > 0 && draft.length <= MAX_LIE && !cur.truths.some((t) => t.toLowerCase() === draft.toLowerCase());
		const submit = () => {
			if (!canAdd) return;
			dispatch({
				t: "write",
				round: cur.id,
				lie: draft
			});
			setLocal({ draft: "" });
		};
		const voters = (i) => Object.entries(cur.guesses).filter(([, p]) => p === i).map(([u]) => u);
		const right = rightGuessers(cur);
		const board = members.map((m) => ({
			name: m.name,
			n: score(state, m.id)
		})).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3);
		const status = cur.status === "open" ? "Needs a lie" : cur.status === "guessing" ? `By ${nameOf(cur.author)} · ${guessed} ${guessed === 1 ? "guess" : "guesses"}` : `By ${nameOf(cur.author)} · revealed`;
		return /* @__PURE__ */ _jsxs("div", { children: [
			header,
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					justifyContent: "space-between",
					alignItems: "baseline",
					gap: 8,
					margin: "4px 0"
				},
				children: [/* @__PURE__ */ _jsx("div", {
					style: { fontWeight: 600 },
					children: `Round ${idx + 1}`
				}), /* @__PURE__ */ _jsx("small", {
					style: {
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap"
					},
					children: status
				})]
			}),
			cur.status === "open" ? /* @__PURE__ */ _jsxs("div", { children: [cur.truths.map((t, i) => /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					gap: 8,
					padding: "4px 0"
				},
				children: [/* @__PURE__ */ _jsx("small", {
					style: {
						minWidth: 40,
						flexShrink: 0
					},
					children: "Truth"
				}), /* @__PURE__ */ _jsx("span", { children: t })]
			}, i)), busy ? /* @__PURE__ */ _jsx(SystemLine, { children: "Reveal your other round first" }) : /* @__PURE__ */ _jsxs("form", {
				style: {
					display: "flex",
					gap: 8,
					marginTop: 8
				},
				onSubmit: (e) => {
					e.preventDefault();
					submit();
				},
				children: [/* @__PURE__ */ _jsx("input", {
					value: local.draft,
					maxLength: MAX_LIE,
					placeholder: "Write a lie",
					"aria-label": "Write a lie",
					onInput: (e) => setLocal({ draft: e.currentTarget.value })
				}), /* @__PURE__ */ _jsx(Button, {
					kind: "secondary",
					disabled: !canAdd,
					onClick: submit,
					children: "Add"
				})]
			})] }) : shuffling ? /* @__PURE__ */ _jsx(SystemLine, { children: "Shuffling" }) : /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 4
				},
				children: cur.statements.map((st, i) => {
					const v = voters(i);
					const sel = cur.status === "revealed" ? st.lie : cur.guesses[me] === i;
					const label = cur.status === "revealed" && st.lie ? `Lie · ${st.text}` : isAuthor && st.lie ? `Your lie · ${st.text}` : st.text;
					return /* @__PURE__ */ _jsxs("div", {
						role: "button",
						tabIndex: 0,
						onClick: () => {
							if (cur.status === "guessing" && !isAuthor) dispatch({
								t: "guess",
								round: cur.id,
								pick: i
							});
						},
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: 44,
							padding: "6px 10px",
							borderRadius: theme.radius.button,
							background: sel ? theme.color.selected : theme.color.wash,
							color: theme.color.text
						},
						children: [/* @__PURE__ */ _jsx("span", {
							style: {
								flex: 1,
								minWidth: 0
							},
							children: label
						}), /* @__PURE__ */ _jsxs("span", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 4,
								flexShrink: 0
							},
							children: [v.length ? /* @__PURE__ */ _jsx(Facepile, {
								users: v,
								max: 2,
								size: 20
							}) : null, /* @__PURE__ */ _jsx("small", { children: v.length })]
						})]
					}, i);
				})
			}), /* @__PURE__ */ _jsx("div", {
				style: {
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 8,
					minHeight: 44,
					marginTop: 4
				},
				children: cur.status === "guessing" ? isAuthor ? /* @__PURE__ */ _jsxs(_Fragment, { children: [/* @__PURE__ */ _jsx("small", { children: waiting === 0 ? "Everyone has guessed" : `Waiting on ${waiting} ${waiting === 1 ? "guess" : "guesses"}` }), /* @__PURE__ */ _jsx(Button, {
					kind: "primary",
					onClick: () => dispatch({
						t: "reveal",
						round: cur.id
					}),
					children: "Reveal"
				})] }) : /* @__PURE__ */ _jsx("small", { children: cur.guesses[me] === undefined ? "Tap the one you think is fake" : "You can change your guess until the reveal" }) : /* @__PURE__ */ _jsx("small", { children: right.length ? `Guessed it: ${right.map((u) => nameOf(u)).slice(0, 3).join(", ")}${right.length > 3 ? ` and ${right.length - 3} more` : ""}` : "No one guessed it" })
			})] }),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 8,
					marginTop: 4
				},
				children: [
					/* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						disabled: idx <= 0,
						onClick: () => setLocal({ idx: idx - 1 }),
						children: "Previous"
					}),
					/* @__PURE__ */ _jsx("small", { children: `${idx + 1} of ${rounds.length}` }),
					/* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						disabled: idx >= rounds.length - 1,
						onClick: () => setLocal({ idx: idx + 1 }),
						children: "Next"
					})
				]
			}),
			board.length ? /* @__PURE__ */ _jsx("small", {
				style: {
					display: "block",
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
					marginTop: 4
				},
				children: `Right guesses · ${board.map((b) => `${b.name} ${b.n}`).join(" · ")}`
			}) : null
		] });
	}
});
