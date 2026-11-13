import { defineApp, Button, CardHeader, OptionRow } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Single-elimination bracket for the Friday movie. The chat votes in each head-to-head match,
// anyone can decide a match once one side leads, and winners move on until one movie is left.
const CHAT = {
	title: "Friday movie bracket",
	venue: "Friday movie night at Rohan's place",
	movies: [
		"Spirited Away",
		"Superbad",
		"Scream 2",
		"Parasite",
		"Whiplash",
		"The Grand Budapest Hotel",
		"Mamma Mia",
		"Knives Out"
	]
};
const STAGES = [
	"Quarterfinals",
	"Semifinals",
	"Final"
];
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
/** Index of the match a winner moves into, or -1 for the final. */
const nextOf = (i) => i < 4 ? 4 + Math.floor(i / 2) : i < 6 ? 6 : -1;
const currentRound = (s) => {
	const open = s.matches.find((m) => m.winner === null);
	return open ? open.round : -1;
};
function vote(s, user, match, side) {
	if (side !== "a" && side !== "b") return s;
	const i = s.matches.findIndex((m) => m.id === match);
	if (i < 0) return s;
	const m = s.matches[i];
	if (m.winner !== null || m.a === null || m.b === null) return s;
	const had = (side === "a" ? m.votesA : m.votesB).includes(user);
	const next = {
		...m,
		votesA: side === "a" ? had ? m.votesA.filter((u) => u !== user) : [...m.votesA, user] : m.votesA.filter((u) => u !== user),
		votesB: side === "b" ? had ? m.votesB.filter((u) => u !== user) : [...m.votesB, user] : m.votesB.filter((u) => u !== user)
	};
	return {
		...s,
		matches: s.matches.map((x, j) => j === i ? next : x)
	};
}
function decide(s, match) {
	const i = s.matches.findIndex((m) => m.id === match);
	if (i < 0) return s;
	const m = s.matches[i];
	if (m.winner !== null || m.a === null || m.b === null) return s;
	if (m.votesA.length === m.votesB.length) return s;
	const w = m.votesA.length > m.votesB.length ? m.a : m.b;
	const nx = nextOf(i);
	const matches = s.matches.map((x, j) => {
		if (j === i) return {
			...x,
			winner: w
		};
		if (j === nx) return i % 2 === 0 ? {
			...x,
			a: w
		} : {
			...x,
			b: w
		};
		return x;
	});
	return {
		...s,
		matches,
		champion: nx < 0 ? w : s.champion
	};
}
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
export default defineApp({
	name: "Movie bracket",
	summary: (s) => {
		if (s.champion !== null) return `${s.title}: ${s.movies[s.champion] ?? ""} wins.`;
		const rd = currentRound(s);
		const list = s.matches.filter((m) => m.round === rd);
		return `${s.title}: ${STAGES[rd] ?? "Bracket"}, ${list.filter((m) => m.winner !== null).length} of ${list.length} decided.`;
	},
	init: () => {
		const movies = CHAT.movies.slice(0, 8);
		const matches = [];
		for (let i = 0; i < 4; i++) matches.push({
			id: `m${i}`,
			round: 0,
			a: 2 * i,
			b: 2 * i + 1,
			votesA: [],
			votesB: [],
			winner: null
		});
		for (let i = 4; i < 6; i++) matches.push({
			id: `m${i}`,
			round: 1,
			a: null,
			b: null,
			votesA: [],
			votesB: [],
			winner: null
		});
		matches.push({
			id: "m6",
			round: 2,
			a: null,
			b: null,
			votesA: [],
			votesB: [],
			winner: null
		});
		return {
			title: CHAT.title,
			movies,
			matches,
			champion: null
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "vote") return vote(state, meta.user, action.match, action.side);
		if (action.t === "decide") return decide(state, action.match);
		return state;
	},
	// Someone left: their votes go, in every match. Someone joined: they can vote at once.
	onMembers: (state, ctx) => {
		const dirty = (m) => [...m.votesA, ...m.votesB].some((u) => !inChat(ctx, u));
		if (!state.matches.some(dirty)) return state;
		return {
			...state,
			matches: state.matches.map((m) => dirty(m) ? {
				...m,
				votesA: m.votesA.filter((u) => inChat(ctx, u)),
				votesB: m.votesB.filter((u) => inChat(ctx, u))
			} : m)
		};
	},
	invariants: {
		"every voter is in the chat": (s, ctx) => s.matches.every((m) => [...m.votesA, ...m.votesB].every((u) => inChat(ctx, u))),
		"no one votes twice or for both sides of a match": (s) => s.matches.every((m) => new Set([...m.votesA, ...m.votesB]).size === m.votesA.length + m.votesB.length),
		"a match has votes or a winner only when both movies are set": (s) => s.matches.every((m) => m.a !== null && m.b !== null || m.votesA.length + m.votesB.length === 0 && m.winner === null),
		"a winner is one of the two movies in its match": (s) => s.matches.every((m) => m.winner === null || m.a !== null && m.b !== null && (m.winner === m.a || m.winner === m.b)),
		"each next slot holds the winner of its feeder match, or is empty": (s) => s.matches.every((m, i) => {
			const nx = nextOf(i);
			if (nx < 0) return true;
			const t = s.matches[nx];
			return !!t && (i % 2 === 0 ? t.a : t.b) === m.winner;
		}),
		"the champion is the final's winner": (s) => s.matches.length === 7 && s.champion === s.matches[6].winner,
		"there are 8 movies and 7 matches with fixed first-round pairs": (s) => s.movies.length === 8 && s.matches.length === 7 && s.matches.every((m, i) => m.id === `m${i}` && (i >= 4 || m.a === 2 * i && m.b === 2 * i + 1))
	},
	transitions: {
		"a vote changes only the actor's own presence in that one open match": (p, n, a, m) => {
			if (a.t !== "vote" || p === n) return true;
			if (p.matches.length !== n.matches.length || p.champion !== n.champion) return false;
			const presence = (x) => x.votesA.includes(m.user) ? "a" : x.votesB.includes(m.user) ? "b" : "";
			const rest = (x) => JSON.stringify([x.votesA.filter((u) => u !== m.user), x.votesB.filter((u) => u !== m.user)]);
			return p.matches.every((x, j) => {
				const y = n.matches[j];
				if (x.id !== a.match) return same(x, y);
				return x.winner === null && y.winner === null && x.a === y.a && x.b === y.b && rest(x) === rest(y) && presence(y) === (presence(x) === a.side ? "" : a.side);
			});
		},
		"a decide gives the win to the side with more votes and touches only that match, the next slot and the champion": (p, n, a) => {
			if (a.t !== "decide" || p === n) return true;
			const i = p.matches.findIndex((x) => x.id === a.match);
			if (i < 0 || p.matches.length !== n.matches.length) return false;
			const x = p.matches[i];
			if (x.winner !== null || x.a === null || x.b === null || x.votesA.length === x.votesB.length) return false;
			const w = x.votesA.length > x.votesB.length ? x.a : x.b;
			const nx = nextOf(i);
			const ok = p.matches.every((q, j) => {
				const y = n.matches[j];
				if (j === i) return same(y, {
					...q,
					winner: w
				});
				if (j === nx) return same(y, i % 2 === 0 ? {
					...q,
					a: w
				} : {
					...q,
					b: w
				});
				return same(y, q);
			});
			return ok && n.champion === (nx < 0 ? w : p.champion);
		},
		"a decided match never changes": (p, n) => p.matches.every((x, j) => x.winner === null || same(x, n.matches[j])),
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
		"the movies never change": (p, n) => p.movies.join("|") === n.movies.join("|") && p.title === n.title
	},
	arbitrary: (s, _user, r) => {
		const open = s.matches.filter((m) => m.winner === null && m.a !== null && m.b !== null);
		if (!open.length) return {
			t: "vote",
			match: "m0",
			side: "a"
		};
		const m = r.pick(open);
		if (r.next() < .3) return {
			t: "decide",
			match: m.id
		};
		return {
			t: "vote",
			match: m.id,
			side: r.next() < .5 ? "a" : "b"
		};
	},
	local: {},
	view: ({ state, me, dispatch, theme }) => {
		const name = (i) => i === null ? "" : state.movies[i] ?? "";
		const rd = currentRound(state);
		const list = state.matches.filter((m) => m.round === rd);
		const decidedCount = list.filter((m) => m.winner !== null).length;
		const champ = state.champion;
		const compact = list.length > 1;
		const through = rd > 0 ? state.matches.filter((m) => m.round === rd - 1).map((m) => name(m.winner)) : [];
		const countText = (n) => n === 1 ? "1 vote" : `${n} votes`;
		const cell = (m, side) => {
			const votes = side === "a" ? m.votesA : m.votesB;
			const mine = votes.includes(me);
			return /* @__PURE__ */ _jsxs("button", {
				onClick: () => dispatch({
					t: "vote",
					match: m.id,
					side
				}),
				style: {
					flex: 1,
					minWidth: 0,
					minHeight: 48,
					padding: "4px 8px",
					border: "none",
					borderRadius: theme.radius.button,
					textAlign: "left",
					background: mine ? theme.color.selected : theme.color.input,
					color: theme.color.text,
					overflowWrap: "anywhere"
				},
				children: [/* @__PURE__ */ _jsx("div", {
					style: { fontWeight: 600 },
					children: name(side === "a" ? m.a : m.b)
				}), /* @__PURE__ */ _jsx("small", { children: countText(votes.length) })]
			}, side);
		};
		return /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx(CardHeader, {
			title: state.title,
			subtitle: champ !== null ? "Everyone has a pick" : `${STAGES[rd] ?? "Bracket"} · ${decidedCount} of ${list.length} decided`
		}), champ !== null ? /* @__PURE__ */ _jsxs("div", {
			style: {
				padding: "16px 0",
				textAlign: "center"
			},
			children: [/* @__PURE__ */ _jsx("h2", { children: name(champ) }), /* @__PURE__ */ _jsx("small", { children: CHAT.venue })]
		}) : /* @__PURE__ */ _jsxs("div", {
			style: {
				display: "grid",
				gap: 8
			},
			children: [
				through.length ? /* @__PURE__ */ _jsx("small", { children: `Through: ${through.join(", ")}` }) : null,
				list.map((m) => {
					if (m.winner !== null) {
						const w = m.winner;
						const l = w === m.a ? m.b : m.a;
						const wv = w === m.a ? m.votesA.length : m.votesB.length;
						const lv = w === m.a ? m.votesB.length : m.votesA.length;
						return /* @__PURE__ */ _jsx("small", {
							style: { display: "block" },
							children: `${name(w)} beat ${name(l)} · ${wv} to ${lv}`
						}, m.id);
					}
					if (m.a === null || m.b === null) return null;
					const lead = m.votesA.length !== m.votesB.length;
					const total = Math.max(1, m.votesA.length + m.votesB.length);
					if (compact) return /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							gap: 8,
							alignItems: "center"
						},
						children: [
							cell(m, "a"),
							cell(m, "b"),
							/* @__PURE__ */ _jsx(Button, {
								kind: "secondary",
								disabled: !lead,
								onClick: () => dispatch({
									t: "decide",
									match: m.id
								}),
								children: "Decide"
							})
						]
					}, m.id);
					const leader = m.votesA.length > m.votesB.length ? m.a : m.b;
					const hi = Math.max(m.votesA.length, m.votesB.length);
					const lo = Math.min(m.votesA.length, m.votesB.length);
					return /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "grid",
							gap: 2
						},
						children: [
							/* @__PURE__ */ _jsx(OptionRow, {
								label: name(m.a),
								count: m.votesA.length,
								total,
								voters: m.votesA,
								selected: m.votesA.includes(me),
								onClick: () => dispatch({
									t: "vote",
									match: m.id,
									side: "a"
								})
							}),
							/* @__PURE__ */ _jsx(OptionRow, {
								label: name(m.b),
								count: m.votesB.length,
								total,
								voters: m.votesB,
								selected: m.votesB.includes(me),
								onClick: () => dispatch({
									t: "vote",
									match: m.id,
									side: "b"
								})
							}),
							/* @__PURE__ */ _jsxs("div", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: 8,
									marginTop: 4
								},
								children: [/* @__PURE__ */ _jsx("small", {
									style: { flex: 1 },
									children: lead ? `${name(leader)} leads · ${hi} to ${lo}` : hi === 0 ? "No votes yet" : `Tied · ${hi} to ${lo}`
								}), /* @__PURE__ */ _jsx(Button, {
									kind: "primary",
									disabled: !lead,
									onClick: () => dispatch({
										t: "decide",
										match: m.id
									}),
									children: "Decide"
								})]
							})
						]
					}, m.id);
				}),
				/* @__PURE__ */ _jsx("small", { children: "Tap a movie to vote" })
			]
		})] });
	}
});
