import { defineApp, Button, CardHeader, OptionRow } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Snack bracket: snacks face off two at a time. Everyone votes, anyone settles once most of the
// chat has voted. The winner of each match goes on the buy list until the list is full.
const C = {
	title: "Which snacks do we buy?",
	keep: 3,
	snacks: [
		"Takis",
		"Hot Cheetos Puffs",
		"Mochi (CVS)",
		"Taquitos (Sunoco)",
		"Cup noodles (spicy Shin)",
		"Big pickle in a bag"
	],
	note: "Ty has $9 · Hugo has $6"
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const core = (s) => JSON.stringify([
	s.options,
	s.keep,
	s.queue,
	s.champ,
	s.challenger,
	s.winners,
	s.out,
	s.round
]);
const restVotes = (s, user) => Object.keys(s.votes).filter((k) => k !== user).sort().map((k) => `${k}=${s.votes[k]}`).join();
/** Votes from people still in the chat, split by side. */
function tally(s, ctx) {
	const voters = Object.keys(s.votes).filter((u) => inChat(ctx, u));
	const a = voters.filter((u) => s.votes[u] === "a").length;
	return {
		n: voters.length,
		a,
		b: voters.length - a
	};
}
const canSettle = (s, ctx) => {
	if (s.champ === null || s.challenger === null) return false;
	const t = tally(s, ctx);
	return t.n * 2 > ctx.members.length && t.a !== t.b;
};
function settle(s, ctx) {
	if (s.champ === null || s.challenger === null || !canSettle(s, ctx)) return s;
	const t = tally(s, ctx);
	const win = t.a > t.b ? s.champ : s.challenger;
	const lose = t.a > t.b ? s.challenger : s.champ;
	let winners = [...s.winners, win];
	let out = [...s.out, lose];
	let queue = s.queue;
	let champ = null;
	let challenger = null;
	if (winners.length < s.keep) {
		if (queue.length >= 2) {
			champ = queue[0];
			challenger = queue[1];
			queue = queue.slice(2);
		} else if (queue.length === 1) {
			winners = [...winners, queue[0]];
			queue = [];
		}
	}
	if (champ === null) {
		out = [...out, ...queue];
		queue = [];
	}
	return {
		...s,
		winners,
		out,
		queue,
		champ,
		challenger,
		votes: {},
		round: s.round + 1
	};
}
export default defineApp({
	name: "Snack bracket",
	summary: (s, ctx) => {
		const label = (id) => s.options.find((o) => o.id === id)?.label ?? "";
		if (s.challenger === null) return `${s.title} Buy: ${s.winners.map(label).join(", ")}.`;
		return `${s.title} ${label(s.champ)} or ${label(s.challenger)}: ${tally(s, ctx).n} of ${ctx.members.length} voted.`;
	},
	init: () => {
		const options = C.snacks.slice(0, 8).map((label, i) => ({
			id: `o${i}`,
			label
		}));
		const ids = options.map((o) => o.id);
		const keep = Math.max(1, Math.min(C.keep, ids.length));
		if (ids.length < 2) return {
			title: C.title,
			note: C.note,
			options,
			keep,
			queue: [],
			champ: null,
			challenger: null,
			votes: {},
			winners: ids,
			out: [],
			round: 0
		};
		return {
			title: C.title,
			note: C.note,
			options,
			keep,
			queue: ids.slice(2),
			champ: ids[0],
			challenger: ids[1],
			votes: {},
			winners: [],
			out: [],
			round: 0
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "vote") {
			if (state.challenger === null || action.side !== "a" && action.side !== "b") return state;
			if (state.votes[meta.user] === action.side) return state;
			return {
				...state,
				votes: {
					...state.votes,
					[meta.user]: action.side
				}
			};
		}
		if (action.t === "pass") {
			if (state.challenger === null || state.votes[meta.user] === undefined) return state;
			return {
				...state,
				votes: Object.fromEntries(Object.entries(state.votes).filter(([k]) => k !== meta.user))
			};
		}
		if (action.t === "settle") return settle(state, ctx);
		return state;
	},
	// Someone left: their pick in the open match goes with them.
	onMembers: (state, ctx) => {
		if (Object.keys(state.votes).every((u) => inChat(ctx, u))) return state;
		return {
			...state,
			votes: Object.fromEntries(Object.entries(state.votes).filter(([k]) => inChat(ctx, k)))
		};
	},
	invariants: {
		"every snack is in exactly one place": (s) => {
			const all = [
				...s.queue,
				...s.champ === null ? [] : [s.champ],
				...s.challenger === null ? [] : [s.challenger],
				...s.winners,
				...s.out
			];
			return all.length === s.options.length && [...all].sort().join() === s.options.map((o) => o.id).sort().join();
		},
		"winners fit the buy list and never repeat": (s) => s.winners.length <= s.keep && new Set(s.winners).size === s.winners.length,
		"the two sides are different, and no challenger without a champ": (s) => s.champ !== s.challenger || s.champ === null ? s.champ !== null || s.challenger === null : false,
		"voters are in the chat and each pick is a or b": (s, ctx) => Object.keys(s.votes).every((u) => inChat(ctx, u) && (s.votes[u] === "a" || s.votes[u] === "b")),
		"no votes unless a match is open": (s) => s.challenger !== null || Object.keys(s.votes).length === 0,
		"a match is open only while the buy list has room": (s) => s.challenger === null || s.winners.length < s.keep,
		"the snack list keeps its ids": (s) => s.options.every((o, i) => o.id === `o${i}`)
	},
	transitions: {
		"a vote sets the actor's own pick and nothing else": (p, n, a, m) => a.t !== "vote" || p === n || p.challenger !== null && n.votes[m.user] === a.side && restVotes(p, m.user) === restVotes(n, m.user) && core(p) === core(n),
		"a pass clears only the actor's own pick": (p, n, a, m) => a.t !== "pass" || p === n || p.votes[m.user] !== undefined && n.votes[m.user] === undefined && restVotes(p, m.user) === restVotes(n, m.user) && core(p) === core(n),
		"a settle needs most of the chat and a clear leader, and the leader goes on the list": (p, n, a, m, ctx) => {
			if (a.t !== "settle" || p === n) return true;
			if (p.champ === null || p.challenger === null || !canSettle(p, ctx)) return false;
			const t = tally(p, ctx);
			const win = t.a > t.b ? p.champ : p.challenger;
			const lose = t.a > t.b ? p.challenger : p.champ;
			return n.winners[p.winners.length] === win && n.out.includes(lose) && !n.winners.includes(lose);
		},
		"a settle clears the votes and moves the round up by one": (p, n, a) => a.t !== "settle" || p === n || Object.keys(n.votes).length === 0 && n.round === p.round + 1,
		"a settle only adds to the buy list, one or two at a time": (p, n, a) => a.t !== "settle" || p === n || n.winners.slice(0, p.winners.length).join() === p.winners.join() && n.winners.length - p.winners.length >= 1 && n.winners.length - p.winners.length <= 2,
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
		"the snacks and the list size never change": (p, n) => JSON.stringify(p.options) === JSON.stringify(n.options) && p.keep === n.keep && n.round >= p.round
	},
	arbitrary: (s, user, r, ctx) => {
		if (s.challenger === null) return { t: "pass" };
		const t = tally(s, ctx);
		if (t.n * 2 > ctx.members.length && r.next() < .5) return { t: "settle" };
		const x = r.next();
		if (x < .1) return { t: "pass" };
		if (x < .2) return { t: "settle" };
		return {
			t: "vote",
			side: s.votes[user] === "a" ? "b" : r.next() < .5 ? "a" : "b"
		};
	},
	local: {},
	view: ({ state, me, members, dispatch, theme }) => {
		const label = (id) => state.options.find((o) => o.id === id)?.label ?? "";
		const open = state.champ !== null && state.challenger !== null;
		const t = tally(state, { members });
		const need = Math.floor(members.length / 2) + 1;
		const ready = canSettle(state, { members });
		const side = (x) => Object.keys(state.votes).filter((u) => state.votes[u] === x);
		const total = Math.max(1, t.n);
		if (!open) {
			return /* @__PURE__ */ _jsxs("div", { children: [
				/* @__PURE__ */ _jsx(CardHeader, {
					title: state.title,
					subtitle: "Done"
				}),
				/* @__PURE__ */ _jsx("h2", { children: `Buy ${state.winners.length}` }),
				/* @__PURE__ */ _jsx("div", {
					style: {
						display: "flex",
						flexWrap: "wrap",
						gap: 8,
						margin: "8px 0"
					},
					children: state.winners.map((id) => /* @__PURE__ */ _jsx("span", {
						style: {
							background: theme.color.secondaryButton,
							color: theme.color.secondaryButtonText,
							borderRadius: theme.radius.pill,
							padding: "4px 10px",
							maxWidth: "100%",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap"
						},
						children: label(id)
					}, id))
				}),
				/* @__PURE__ */ _jsx("small", { children: state.out.length ? `Not this time: ${state.out.map(label).join(", ")}` : "Nothing left out" }),
				/* @__PURE__ */ _jsx("div", {
					style: { marginTop: 8 },
					children: /* @__PURE__ */ _jsx("small", { children: state.note })
				})
			] });
		}
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `Match ${state.round + 1} · ${state.winners.length} of ${state.keep} picked`
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 2
				},
				children: [/* @__PURE__ */ _jsx(OptionRow, {
					label: label(state.champ),
					count: side("a").length,
					total,
					voters: side("a"),
					selected: state.votes[me] === "a",
					onClick: () => dispatch({
						t: "vote",
						side: "a"
					})
				}), /* @__PURE__ */ _jsx(OptionRow, {
					label: label(state.challenger),
					count: side("b").length,
					total,
					voters: side("b"),
					selected: state.votes[me] === "b",
					onClick: () => dispatch({
						t: "vote",
						side: "b"
					})
				})]
			}),
			/* @__PURE__ */ _jsx("div", {
				style: { marginTop: 8 },
				children: /* @__PURE__ */ _jsx("small", { children: t.n >= need && t.a === t.b ? "Tied · someone change a vote" : `${t.n} of ${members.length} voted · ${need} needed` })
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginTop: 8
				},
				children: [
					/* @__PURE__ */ _jsx("div", { style: { flex: 1 } }),
					/* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						disabled: state.votes[me] === undefined,
						onClick: () => dispatch({ t: "pass" }),
						children: "Clear"
					}),
					/* @__PURE__ */ _jsx(Button, {
						kind: "primary",
						disabled: !ready,
						onClick: () => dispatch({ t: "settle" }),
						children: "Settle"
					})
				]
			}),
			/* @__PURE__ */ _jsx("div", {
				style: { marginTop: 8 },
				children: /* @__PURE__ */ _jsx("small", { children: `${state.winners.length ? `Picked: ${state.winners.map(label).join(", ")}` : "Nothing picked yet"} · ${state.queue.length} waiting` })
			}),
			/* @__PURE__ */ _jsx("div", { children: /* @__PURE__ */ _jsx("small", { children: state.note }) })
		] });
	}
});
