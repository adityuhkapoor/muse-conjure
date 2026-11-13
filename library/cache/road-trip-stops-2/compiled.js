import { defineApp, Button, CardHeader } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Head-to-head bracket for the road trip stops. The host starts it, everyone votes in each
// matchup, anyone closes a matchup that has a leader, and winners move on until one is left.
const CHAT = {
	title: "Which stops make the trip?",
	hostName: "Priya",
	trip: "3 days · 4 stops tops",
	stops: [
		"Crater Lake",
		"Redwoods",
		"Mount Shasta",
		"San Francisco",
		"Santa Cruz",
		"Hearst Castle"
	],
	notes: {
		"hearst castle": "$25 each",
		"santa cruz": "Free"
	}
};
const MAX_ENTRIES = 8;
const MAX_LABEL = 40;
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const clean = (label) => label.trim().replace(/\s+/g, " ");
const sameJson = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const strip = (xs, u) => xs.filter((x) => x !== u).join();
const sideOf = (mt, u) => mt.votesA.includes(u) ? "a" : mt.votesB.includes(u) ? "b" : "";
const last = (s) => s.rounds[s.rounds.length - 1] ?? [];
const idsOf = (r) => r.flatMap((mt) => mt.b === null ? [mt.a] : [mt.a, mt.b]);
function pairUp(ids) {
	const out = [];
	for (let i = 0; i < ids.length; i += 2) {
		const a = ids[i];
		const b = ids[i + 1] ?? null;
		out.push({
			a,
			b,
			votesA: [],
			votesB: [],
			winner: b === null ? a : null
		});
	}
	return out;
}
function start(s, user) {
	if (s.started || s.entries.length < 2 || user !== s.host) return s;
	return {
		...s,
		started: true,
		rounds: [pairUp(s.entries.map((_, i) => i))]
	};
}
function vote(s, user, round, match, side) {
	const ri = s.rounds.length - 1;
	if (!s.started || s.champion !== null || round !== ri) return s;
	if (typeof match !== "number" || !Number.isInteger(match) || side !== "a" && side !== "b") return s;
	const cur = s.rounds[ri];
	const mt = cur[match];
	if (!mt || mt.b === null || mt.winner !== null) return s;
	const had = (side === "a" ? mt.votesA : mt.votesB).includes(user);
	const next = {
		...mt,
		votesA: side === "a" ? had ? mt.votesA.filter((u) => u !== user) : [...mt.votesA, user] : mt.votesA.filter((u) => u !== user),
		votesB: side === "b" ? had ? mt.votesB.filter((u) => u !== user) : [...mt.votesB, user] : mt.votesB.filter((u) => u !== user)
	};
	return {
		...s,
		rounds: s.rounds.map((r, i) => i === ri ? r.map((x, j) => j === match ? next : x) : r)
	};
}
function close(s, round, match) {
	const ri = s.rounds.length - 1;
	if (!s.started || s.champion !== null || round !== ri) return s;
	if (typeof match !== "number" || !Number.isInteger(match)) return s;
	const cur = s.rounds[ri];
	const mt = cur[match];
	if (!mt || mt.b === null || mt.winner !== null || mt.votesA.length === mt.votesB.length) return s;
	const winner = mt.votesA.length > mt.votesB.length ? mt.a : mt.b;
	const decided = cur.map((x, j) => j === match ? {
		...x,
		winner
	} : x);
	const rounds = [...s.rounds.slice(0, ri), decided];
	if (decided.every((x) => x.winner !== null)) {
		if (decided.length === 1) return {
			...s,
			rounds,
			champion: winner
		};
		rounds.push(pairUp(decided.map((x) => x.winner)));
	}
	return {
		...s,
		rounds
	};
}
function add(s, raw) {
	if (s.started || typeof raw !== "string") return s;
	const label = clean(raw);
	if (!label || label.length > MAX_LABEL || s.entries.length >= MAX_ENTRIES) return s;
	if (s.entries.some((e) => e.toLowerCase() === label.toLowerCase())) return s;
	return {
		...s,
		entries: [...s.entries, label]
	};
}
export default defineApp({
	name: "Stop bracket",
	summary: (s) => {
		if (s.champion !== null) return `${s.title} ${s.entries[s.champion] ?? ""} wins.`;
		if (!s.started) return `${s.title} ${s.entries.length} stops, not started.`;
		const open = last(s).filter((mt) => mt.b !== null);
		return `${s.title} Round ${s.rounds.length}, ${open.filter((mt) => mt.winner !== null).length} of ${open.length} decided.`;
	},
	init: (ctx) => {
		const seen = new Set();
		const entries = [];
		for (const raw of CHAT.stops) {
			const e = clean(raw).slice(0, MAX_LABEL);
			if (e && !seen.has(e.toLowerCase()) && entries.length < MAX_ENTRIES) {
				seen.add(e.toLowerCase());
				entries.push(e);
			}
		}
		const host = ctx.members.find((m) => m.name.toLowerCase() === CHAT.hostName.toLowerCase())?.id ?? ctx.members[0]?.id ?? "";
		return {
			title: CHAT.title,
			entries,
			rounds: [],
			champion: null,
			started: false,
			host
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "start") return start(state, meta.user);
		if (action.t === "vote") return vote(state, meta.user, action.round, action.match, action.side);
		if (action.t === "close") return close(state, action.round, action.match);
		if (action.t === "add") return add(state, action.label);
		return state;
	},
	// Someone left: the host role moves on, and their votes in open matchups go.
	onMembers: (state, ctx) => {
		const host = inChat(ctx, state.host) ? state.host : ctx.members[0]?.id ?? "";
		const stale = (mt) => mt.winner === null && [...mt.votesA, ...mt.votesB].some((u) => !inChat(ctx, u));
		const dirty = state.rounds.some((r) => r.some(stale));
		if (host === state.host && !dirty) return state;
		return {
			...state,
			host,
			rounds: dirty ? state.rounds.map((r) => r.map((mt) => stale(mt) ? {
				...mt,
				votesA: mt.votesA.filter((u) => inChat(ctx, u)),
				votesB: mt.votesB.filter((u) => inChat(ctx, u))
			} : mt)) : state.rounds
		};
	},
	invariants: {
		"no one votes twice or on both sides of a matchup": (s) => s.rounds.every((r) => r.every((mt) => new Set([...mt.votesA, ...mt.votesB]).size === mt.votesA.length + mt.votesB.length)),
		"the host and everyone voting in an open matchup are in the chat": (s, ctx) => (ctx.members.length === 0 || inChat(ctx, s.host)) && s.rounds.every((r) => r.every((mt) => mt.winner !== null || [...mt.votesA, ...mt.votesB].every((u) => inChat(ctx, u)))),
		"a winner is a bye or the side with strictly more votes": (s) => s.rounds.every((r) => r.every((mt) => mt.b === null ? mt.winner === mt.a : mt.winner === null || mt.winner === mt.a && mt.votesA.length > mt.votesB.length || mt.winner === mt.b && mt.votesB.length > mt.votesA.length)),
		"round 1 pairs the entries in order and each later round is the winners of the last": (s) => {
			if (!s.started) return s.rounds.length === 0;
			if (s.rounds.length === 0 || s.entries.length < 2) return false;
			return s.rounds.every((r, i) => {
				if (i === 0) return idsOf(r).join() === s.entries.map((_, k) => k).join();
				const prev = s.rounds[i - 1];
				return prev.every((mt) => mt.winner !== null) && idsOf(r).join() === prev.map((mt) => mt.winner).join();
			});
		},
		"the champion is the winner of a single final matchup, and no one else": (s) => {
			const r = last(s);
			const expect = r.length === 1 && r[0].winner !== null ? r[0].winner : null;
			return s.champion === expect;
		},
		"entries are unique, 1 to 40 characters, at most 8": (s) => s.entries.length <= MAX_ENTRIES && new Set(s.entries.map((e) => e.toLowerCase())).size === s.entries.length && s.entries.every((e) => e.length > 0 && e.length <= MAX_LABEL && e === clean(e))
	},
	transitions: {
		"a vote puts the actor on that side and off the other, and changes no one else": (p, n, a, m) => {
			if (a.t !== "vote" || p === n) return true;
			const before = p.rounds[a.round]?.[a.match];
			const after = n.rounds[a.round]?.[a.match];
			if (!before || !after || n.rounds.length !== p.rounds.length) return false;
			const was = sideOf(before, m.user);
			const hole = (s) => s.rounds.map((r, i) => r.map((x, j) => i === a.round && j === a.match ? null : x));
			return a.round === p.rounds.length - 1 && before.winner === null && after.winner === null && strip(before.votesA, m.user) === strip(after.votesA, m.user) && strip(before.votesB, m.user) === strip(after.votesB, m.user) && sideOf(after, m.user) === (was === a.side ? "" : a.side) && sameJson(hole(p), hole(n));
		},
		"a close decides one matchup for the side with more votes and keeps its votes": (p, n, a) => {
			if (a.t !== "close" || p === n) return true;
			const before = p.rounds[a.round]?.[a.match];
			const after = n.rounds[a.round]?.[a.match];
			if (!before || !after || before.b === null || before.winner !== null) return false;
			const lead = before.votesA.length > before.votesB.length ? before.a : before.votesB.length > before.votesA.length ? before.b : null;
			const hole = (s) => s.rounds.slice(0, p.rounds.length).map((r, i) => r.map((x, j) => i === a.round && j === a.match ? null : x));
			return lead !== null && after.winner === lead && sameJson(after.votesA, before.votesA) && sameJson(after.votesB, before.votesB) && sameJson(hole(p), hole(n));
		},
		"only the host starts, and a start builds round 1 from the entries": (p, n, a, m) => a.t !== "start" || p === n || m.user === p.host && !p.started && n.started && n.rounds.length === 1 && sameJson(n.entries, p.entries) && n.host === p.host,
		"an add appends one entry, and only before the bracket starts": (p, n, a) => a.t !== "add" || p === n || typeof a.label === "string" && !p.started && n.entries.length === p.entries.length + 1 && sameJson(n.entries.slice(0, -1), p.entries) && n.entries[n.entries.length - 1] === clean(a.label) && sameJson(n.rounds, p.rounds),
		"a decided matchup never changes its winner": (p, n) => p.rounds.every((r, i) => r.every((mt, j) => mt.winner === null || n.rounds[i]?.[j]?.winner === mt.winner)),
		"only people in the chat change the bracket": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		if (!s.started) {
			if (user === s.host && r.next() < .5) return { t: "start" };
			if (r.next() < .1) return { t: "start" };
			return {
				t: "add",
				label: r.pick([
					"Big Sur",
					"  Joshua   Tree ",
					"",
					"Crater Lake",
					"Portland Saturday Market",
					"Hollywood sign"
				])
			};
		}
		const ri = s.rounds.length - 1;
		const open = last(s).map((mt, i) => mt.winner === null && mt.b !== null ? i : -1).filter((i) => i >= 0);
		if (!open.length) return {
			t: "close",
			round: ri,
			match: 0
		};
		if (r.next() < .35) return {
			t: "close",
			round: ri,
			match: r.pick(open)
		};
		return {
			t: "vote",
			round: ri,
			match: r.pick(open),
			side: r.next() < .5 ? "a" : "b"
		};
	},
	local: { draft: "" },
	view: ({ state, me, members, dispatch, local, setLocal, theme }) => {
		const name = (i) => i === null ? "Bye" : state.entries[i] ?? "";
		const hostName = members.find((x) => x.id === state.host)?.name ?? "the host";
		const isHost = state.host === me;
		const votesText = (n) => n === 1 ? "1 vote" : `${n} votes`;
		if (!state.started) {
			const canAdd = clean(local.draft).length > 0 && state.entries.length < MAX_ENTRIES;
			const submit = () => {
				if (!canAdd) return;
				dispatch({
					t: "add",
					label: local.draft.slice(0, MAX_LABEL)
				});
				setLocal({ draft: "" });
			};
			return /* @__PURE__ */ _jsxs("div", { children: [
				/* @__PURE__ */ _jsx(CardHeader, {
					title: state.title,
					subtitle: `${state.entries.length} stops · ${CHAT.trip}`
				}),
				/* @__PURE__ */ _jsx("div", {
					style: {
						display: "grid",
						gridTemplateColumns: "1fr 1fr",
						gap: 4
					},
					children: state.entries.map((e) => /* @__PURE__ */ _jsxs("div", {
						style: {
							minWidth: 0,
							overflowWrap: "anywhere"
						},
						children: [/* @__PURE__ */ _jsx("div", {
							style: { fontWeight: 600 },
							children: e
						}), CHAT.notes[e.toLowerCase()] ? /* @__PURE__ */ _jsx("small", { children: CHAT.notes[e.toLowerCase()] }) : null]
					}, e))
				}),
				state.entries.length < MAX_ENTRIES ? /* @__PURE__ */ _jsxs("form", {
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
						maxLength: MAX_LABEL,
						placeholder: "Add stop",
						"aria-label": "Add stop",
						onInput: (e) => setLocal({ draft: e.currentTarget.value })
					}), /* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						disabled: !canAdd,
						onClick: submit,
						children: "Add"
					})]
				}) : null,
				/* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						marginTop: 8
					},
					children: [/* @__PURE__ */ _jsx("small", {
						style: { flex: 1 },
						children: isHost ? "You start the bracket" : `Waiting for ${hostName} to start`
					}), isHost ? /* @__PURE__ */ _jsx(Button, {
						kind: "primary",
						disabled: state.entries.length < 2,
						onClick: () => dispatch({ t: "start" }),
						children: "Start"
					}) : null]
				})
			] });
		}
		if (state.champion !== null) {
			return /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: "Bracket done"
			}), /* @__PURE__ */ _jsxs("div", {
				style: {
					padding: "16px 0",
					textAlign: "center"
				},
				children: [/* @__PURE__ */ _jsx("h2", { children: name(state.champion) }), /* @__PURE__ */ _jsx("small", { children: "Won the bracket" })]
			})] });
		}
		const ri = state.rounds.length - 1;
		const round = last(state);
		const real = round.filter((mt) => mt.b !== null);
		const stage = round.length === 1 ? "Final" : round.length === 2 ? "Semifinals" : `Round ${state.rounds.length}`;
		const prev = ri > 0 ? state.rounds[ri - 1] : null;
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `${stage} · ${real.filter((mt) => mt.winner !== null).length} of ${real.length} decided`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 8
				},
				children: round.map((mt, i) => {
					if (mt.b === null) {
						return /* @__PURE__ */ _jsx("small", {
							style: { minHeight: 24 },
							children: `${name(mt.a)} · bye`
						}, i);
					}
					if (mt.winner !== null) {
						const loser = mt.winner === mt.a ? mt.b : mt.a;
						return /* @__PURE__ */ _jsxs("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 8,
								minHeight: 36,
								overflowWrap: "anywhere"
							},
							children: [/* @__PURE__ */ _jsx("span", {
								style: { fontWeight: 600 },
								children: name(mt.winner)
							}), /* @__PURE__ */ _jsx("small", { children: `beat ${name(loser)}` })]
						}, i);
					}
					return /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8
						},
						children: [["a", "b"].map((side) => {
							const votes = side === "a" ? mt.votesA : mt.votesB;
							return /* @__PURE__ */ _jsxs("button", {
								onClick: () => dispatch({
									t: "vote",
									round: ri,
									match: i,
									side
								}),
								style: {
									flex: 1,
									minWidth: 0,
									minHeight: 48,
									padding: "4px 8px",
									borderRadius: theme.radius.button,
									textAlign: "left",
									background: votes.includes(me) ? theme.color.selected : theme.color.input,
									color: theme.color.text,
									overflowWrap: "anywhere"
								},
								children: [/* @__PURE__ */ _jsx("div", {
									style: { fontWeight: 600 },
									children: name(side === "a" ? mt.a : mt.b)
								}), /* @__PURE__ */ _jsx("small", { children: votesText(votes.length) })]
							}, side);
						}), /* @__PURE__ */ _jsx(Button, {
							kind: "secondary",
							disabled: mt.votesA.length === mt.votesB.length,
							onClick: () => dispatch({
								t: "close",
								round: ri,
								match: i
							}),
							children: "Close"
						})]
					}, i);
				})
			}),
			prev ? /* @__PURE__ */ _jsx("div", {
				style: { marginTop: 8 },
				children: /* @__PURE__ */ _jsx("small", { children: `Round ${ri} winners · ${prev.map((mt) => name(mt.winner)).join(", ")}` })
			}) : null
		] });
	}
});
