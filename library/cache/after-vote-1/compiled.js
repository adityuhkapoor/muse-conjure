import { defineApp, Button, CardHeader, OptionRow, rng, running } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Knockout bracket for the afterparty: four places, two semifinals, one final.
// Everyone votes in each match. The host closes a match; a tie goes to the seed.
const CHAT = {
	title: "Where should we go after?",
	places: [
		{
			name: "Waffle House",
			tag: ""
		},
		{
			name: "Neon Pelican karaoke",
			tag: "$15"
		},
		{
			name: "Dre's apartment",
			tag: "25 min"
		},
		{
			name: "Starlite",
			tag: "24hr"
		}
	]
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const mk = (id, a, b) => ({
	id,
	a,
	b,
	va: [],
	vb: [],
	winner: null,
	at: 0
});
const semis = () => [mk("m0", "p0", "p1"), mk("m1", "p2", "p3")];
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const findIn = (s, id) => s.matches.find((x) => x.id === id);
const isStart = (s) => s.round === 0 && s.matches.length === 2 && s.matches.every((m) => m.winner === null && m.va.length + m.vb.length === 0);
const placeName = (s, id) => s.places.find((p) => p.id === id)?.name ?? "";
const placeLabel = (s, id) => {
	const p = s.places.find((x) => x.id === id);
	return p ? p.tag ? `${p.name} · ${p.tag}` : p.name : "";
};
const matchTitle = (id) => id === "m2" ? "Final" : id === "m0" ? "Semifinal 1" : "Semifinal 2";
function vote(s, user, matchId, side) {
	if (typeof matchId !== "string" || side !== "a" && side !== "b") return s;
	const m = findIn(s, matchId);
	if (!m || m.winner !== null) return s;
	const had = (side === "a" ? m.va : m.vb).includes(user);
	const next = {
		...m,
		va: side === "a" ? had ? m.va.filter((u) => u !== user) : [...m.va, user] : m.va.filter((u) => u !== user),
		vb: side === "b" ? had ? m.vb.filter((u) => u !== user) : [...m.vb, user] : m.vb.filter((u) => u !== user)
	};
	return {
		...s,
		matches: s.matches.map((x) => x.id === m.id ? next : x)
	};
}
function close(s, user, matchId, seed, time) {
	if (user !== s.host || typeof matchId !== "string") return s;
	const m = findIn(s, matchId);
	if (!m || m.winner !== null || m.va.length + m.vb.length === 0) return s;
	const win = m.va.length > m.vb.length ? m.a : m.vb.length > m.va.length ? m.b : rng(seed).int(2) === 0 ? m.a : m.b;
	let matches = s.matches.map((x) => x.id === m.id ? {
		...x,
		winner: win,
		at: time
	} : x);
	const x0 = matches.find((x) => x.id === "m0");
	const x1 = matches.find((x) => x.id === "m1");
	if (x0 && x1 && x0.winner !== null && x1.winner !== null && !matches.some((x) => x.id === "m2")) {
		matches = [...matches, mk("m2", x0.winner, x1.winner)];
	}
	const fin = matches.find((x) => x.id === "m2");
	return {
		...s,
		matches,
		round: fin ? fin.winner !== null ? 2 : 1 : 0,
		champion: fin ? fin.winner : null
	};
}
function reset(s, user) {
	if (user !== s.host || isStart(s)) return s;
	return {
		...s,
		matches: semis(),
		round: 0,
		champion: null
	};
}
export default defineApp({
	name: "After party bracket",
	summary: (s) => {
		if (s.champion !== null) return `${s.title} ${placeName(s, s.champion)} wins.`;
		if (s.round === 1) return `${s.title} Final is open.`;
		const done = s.matches.filter((m) => m.winner !== null).length;
		return `${s.title} Semifinals, ${done} of 2 decided.`;
	},
	init: (ctx) => ({
		title: CHAT.title,
		places: CHAT.places.map((p, i) => ({
			id: `p${i}`,
			name: p.name,
			tag: p.tag
		})),
		matches: semis(),
		round: 0,
		champion: null,
		host: ctx.members[0]?.id ?? ""
	}),
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "vote") return vote(state, meta.user, action.match, action.side);
		if (action.t === "close") return close(state, meta.user, action.match, meta.seed, meta.time);
		if (action.t === "reset") return reset(state, meta.user);
		return state;
	},
	// Someone left: their votes in open matches go, and the host role passes on.
	onMembers: (state, ctx) => {
		const host = inChat(ctx, state.host) ? state.host : ctx.members[0]?.id ?? "";
		const dirty = (m) => m.winner === null && [...m.va, ...m.vb].some((u) => !inChat(ctx, u));
		if (host === state.host && !state.matches.some(dirty)) return state;
		return {
			...state,
			host,
			matches: state.matches.map((m) => dirty(m) ? {
				...m,
				va: m.va.filter((u) => inChat(ctx, u)),
				vb: m.vb.filter((u) => inChat(ctx, u))
			} : m)
		};
	},
	invariants: {
		"no one is on both sides of a match or twice": (s) => s.matches.every((m) => new Set([...m.va, ...m.vb]).size === m.va.length + m.vb.length),
		"voters in open matches are in the chat": (s, ctx) => s.matches.every((m) => m.winner !== null || [...m.va, ...m.vb].every((u) => inChat(ctx, u))),
		"the host is in the chat while the chat has people": (s, ctx) => ctx.members.length === 0 || inChat(ctx, s.host),
		"a winner is one of the two places and did not trail": (s) => s.matches.every((m) => m.winner === null || m.winner === m.a && m.va.length >= m.vb.length || m.winner === m.b && m.vb.length >= m.va.length),
		"the final exists only after both semifinals, with their winners": (s) => {
			const x = s.matches.find((m) => m.id === "m0");
			const y = s.matches.find((m) => m.id === "m1");
			const f = s.matches.find((m) => m.id === "m2");
			if (!x || !y || s.matches.length !== (f ? 3 : 2)) return false;
			if (!f) return s.round === 0 && s.champion === null && !(x.winner !== null && y.winner !== null);
			return x.winner !== null && y.winner !== null && f.a === x.winner && f.b === y.winner && s.round === (f.winner === null ? 1 : 2) && s.champion === f.winner;
		},
		"the semifinals pair the four places in order": (s) => {
			const x = s.matches.find((m) => m.id === "m0");
			const y = s.matches.find((m) => m.id === "m1");
			return s.places.length === 4 && s.places.every((p, i) => p.id === `p${i}`) && !!x && !!y && x.a === "p0" && x.b === "p1" && y.a === "p2" && y.b === "p3";
		}
	},
	transitions: {
		"a vote moves only the voter between sides of that one match": (p, n, a, m) => {
			if (a.t !== "vote" || p === n) return true;
			const before = findIn(p, a.match);
			const after = findIn(n, a.match);
			if (!before || !after || before.winner !== null || after.winner !== null) return false;
			const side = (x) => x.va.includes(m.user) ? "a" : x.vb.includes(m.user) ? "b" : "";
			const rest = (x) => `${x.va.filter((u) => u !== m.user)}|${x.vb.filter((u) => u !== m.user)}`;
			return rest(before) === rest(after) && side(after) === (side(before) === a.side ? "" : a.side) && n.matches.length === p.matches.length && p.round === n.round && p.host === n.host && p.matches.every((x) => x.id === a.match || same(x, findIn(n, x.id)));
		},
		"a close decides that match by votes, or by the seed on a tie": (p, n, a, m) => {
			if (a.t !== "close" || p === n) return true;
			const before = findIn(p, a.match);
			const after = findIn(n, a.match);
			if (!before || !after || before.winner !== null || after.winner === null) return false;
			const expected = before.va.length > before.vb.length ? before.a : before.vb.length > before.va.length ? before.b : rng(m.seed).int(2) === 0 ? before.a : before.b;
			return after.winner === expected && after.at === m.time && JSON.stringify(after.va) === JSON.stringify(before.va) && JSON.stringify(after.vb) === JSON.stringify(before.vb) && p.matches.every((x) => x.id === a.match || same(x, findIn(n, x.id)));
		},
		"only the host can close a match or reset the bracket": (p, _n, a, m) => a.t !== "close" && a.t !== "reset" || p === _n || m.user === p.host,
		"a decided match never changes except by reset": (p, n, a) => a.t === "reset" || p === n || p.matches.every((x) => x.winner === null || same(x, findIn(n, x.id))),
		"a reset returns to two empty semifinals": (p, n, a) => a.t !== "reset" || p === n || n.round === 0 && n.champion === null && n.host === p.host && n.matches.length === 2 && n.matches.every((x) => x.winner === null && x.va.length + x.vb.length === 0),
		"only people in the chat change the bracket": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		const open = s.matches.filter((m) => m.winner === null);
		if (!open.length) return { t: "reset" };
		const m = r.pick(open);
		const x = r.next();
		if (user === s.host && x < .3) return {
			t: "close",
			match: m.id
		};
		if (x < .34) return {
			t: "close",
			match: m.id
		};
		if (x < .37) return { t: "reset" };
		if (x < .4) return {
			t: "vote",
			match: "zz",
			side: "a"
		};
		return {
			t: "vote",
			match: m.id,
			side: r.next() < .5 ? "a" : "b"
		};
	},
	local: {},
	view: ({ state, confirmed, pending, me, members, dispatch }) => {
		// Ties are settled by the server's seed: while my own close is unconfirmed, show the bracket as the server has it.
		const winners = (x) => x.matches.map((m) => m.winner ?? "-").join();
		const closing = pending && winners(state) !== winners(confirmed);
		const s = closing ? confirmed : state;
		const isHost = me === s.host;
		const hostName = isHost ? "You" : members.find((m) => m.id === s.host)?.name ?? "Host";
		const settling = (m) => m.winner !== null && running(m.at, 1500) !== null;
		const final = s.matches.find((m) => m.id === "m2");
		const crowned = s.champion !== null && !!final && !settling(final);
		const decided = (m) => m.winner !== null && !settling(m);
		const subtitle = crowned ? "Done" : `${s.round === 0 ? "Semifinals" : "Final"} · ${hostName} close${isHost ? "" : "s"}`;
		const score = (m) => {
			const w = m.winner === m.a ? m.va.length : m.vb.length;
			const l = m.winner === m.a ? m.vb.length : m.va.length;
			return `${w} to ${l}`;
		};
		return /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx(CardHeader, {
			title: s.title,
			subtitle
		}), /* @__PURE__ */ _jsxs("div", {
			style: {
				display: "grid",
				gap: 8
			},
			children: [
				crowned && final ? /* @__PURE__ */ _jsxs("div", {
					style: {
						padding: "8px 0",
						textAlign: "center"
					},
					children: [/* @__PURE__ */ _jsx("h2", { children: placeName(s, s.champion) }), /* @__PURE__ */ _jsx("small", { children: `Winner · ${score(final)}` })]
				}) : null,
				s.matches.map((m) => {
					if (decided(m)) {
						if (crowned && m.id === "m2") return null;
						const loser = m.winner === m.a ? m.b : m.a;
						return /* @__PURE__ */ _jsx("small", { children: `${matchTitle(m.id)} · ${placeName(s, m.winner)} beat ${placeName(s, loser)} · ${score(m)}` }, m.id);
					}
					const n = m.va.length + m.vb.length;
					const total = Math.max(1, n);
					return /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: isHost ? 44 : 24
						},
						children: [/* @__PURE__ */ _jsx("small", {
							style: { flex: 1 },
							children: `${matchTitle(m.id)} · ${m.winner !== null ? "Closing" : n === 0 ? "No votes" : `${n} voted`}`
						}), isHost ? /* @__PURE__ */ _jsx(Button, {
							kind: "secondary",
							disabled: n === 0 || m.winner !== null || closing,
							onClick: () => dispatch({
								t: "close",
								match: m.id
							}),
							children: "Close"
						}) : null]
					}), /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "grid",
							gap: 2
						},
						children: [/* @__PURE__ */ _jsx(OptionRow, {
							label: placeLabel(s, m.a),
							count: m.va.length,
							total,
							voters: m.va,
							selected: m.va.includes(me),
							onClick: () => dispatch({
								t: "vote",
								match: m.id,
								side: "a"
							})
						}), /* @__PURE__ */ _jsx(OptionRow, {
							label: placeLabel(s, m.b),
							count: m.vb.length,
							total,
							voters: m.vb,
							selected: m.vb.includes(me),
							onClick: () => dispatch({
								t: "vote",
								match: m.id,
								side: "b"
							})
						})]
					})] }, m.id);
				}),
				crowned && isHost ? /* @__PURE__ */ _jsx(Button, {
					kind: "secondary",
					onClick: () => dispatch({ t: "reset" }),
					children: "Reset"
				}) : null
			]
		})] });
	}
});
