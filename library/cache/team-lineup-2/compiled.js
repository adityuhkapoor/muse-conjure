import { defineApp, Button, CardHeader, Facepile } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
const CHAT = {
	title: "Who's playing on Sunday?",
	cap: 6,
	minWomen: 2,
	games: [
		{
			label: "Nov 16",
			note: ""
		},
		{
			label: "Nov 23",
			note: "Mia has a 4pm thing"
		},
		{
			label: "Dec 7",
			note: ""
		}
	]
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const gameOf = (s, id) => s.games.find((g) => g.id === id);
const restOf = (s, id) => s.games.filter((g) => g.id !== id).map((g) => JSON.stringify(g)).join("|");
const fixedOf = (s) => JSON.stringify([
	s.cap,
	s.minWomen,
	s.games.map((g) => [
		g.id,
		g.label,
		g.note
	])
]);
function join(s, user, id) {
	if (typeof id !== "string") return s;
	const g = gameOf(s, id);
	if (!g || g.players.includes(user) || g.players.length >= s.cap) return s;
	return {
		...s,
		games: s.games.map((x) => x.id === g.id ? {
			...x,
			players: [...x.players, user]
		} : x)
	};
}
function leave(s, user, id) {
	if (typeof id !== "string") return s;
	const g = gameOf(s, id);
	if (!g || !g.players.includes(user)) return s;
	return {
		...s,
		games: s.games.map((x) => x.id === g.id ? {
			...x,
			players: x.players.filter((p) => p !== user)
		} : x)
	};
}
export default defineApp({
	name: "Game sign up",
	summary: (s) => `${CHAT.title} ${s.games.map((g) => `${g.label} ${g.players.length} of ${s.cap}`).join(" · ")}`,
	init: () => ({
		cap: CHAT.cap,
		minWomen: CHAT.minWomen,
		games: CHAT.games.map((g, i) => ({
			id: `g${i}`,
			label: g.label,
			note: g.note,
			players: []
		}))
	}),
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "join") return join(state, meta.user, action.game);
		if (action.t === "leave") return leave(state, meta.user, action.game);
		return state;
	},
	onMembers: (state, ctx) => {
		if (state.games.every((g) => g.players.every((p) => inChat(ctx, p)))) return state;
		return {
			...state,
			games: state.games.map((g) => g.players.every((p) => inChat(ctx, p)) ? g : {
				...g,
				players: g.players.filter((p) => inChat(ctx, p))
			})
		};
	},
	invariants: {
		"no game has more players than the cap": (s) => s.games.every((g) => g.players.length <= s.cap),
		"no one is listed twice in a game": (s) => s.games.every((g) => new Set(g.players).size === g.players.length),
		"everyone listed is in the chat": (s, ctx) => s.games.every((g) => g.players.every((p) => inChat(ctx, p))),
		"there are exactly 3 games with unique ids and the cap is 6": (s) => s.games.length === 3 && new Set(s.games.map((g) => g.id)).size === 3 && s.cap === 6
	},
	transitions: {
		"a join adds only the actor to the end of that game": (p, n, a, m) => {
			if (a.t !== "join" || p === n) return true;
			const b = gameOf(p, a.game);
			const c = gameOf(n, a.game);
			return !!b && !!c && c.players.join() === [...b.players, m.user].join() && restOf(p, a.game) === restOf(n, a.game);
		},
		"a leave removes only the actor and keeps the order of the rest": (p, n, a, m) => {
			if (a.t !== "leave" || p === n) return true;
			const b = gameOf(p, a.game);
			const c = gameOf(n, a.game);
			return !!b && !!c && b.players.includes(m.user) && c.players.join() === b.players.filter((u) => u !== m.user).join() && restOf(p, a.game) === restOf(n, a.game);
		},
		"a join never pushes a game over the cap": (p, n, a) => {
			if (a.t !== "join" || p === n) return true;
			const b = gameOf(p, a.game);
			return !!b && b.players.length < p.cap && n.games.every((g) => g.players.length <= n.cap);
		},
		"a join that fits always lands": (p, n, a, m, ctx) => {
			if (a.t !== "join" || !inChat(ctx, m.user)) return true;
			const b = gameOf(p, a.game);
			if (!b || b.players.includes(m.user) || b.players.length >= p.cap) return true;
			return !!gameOf(n, a.game)?.players.includes(m.user);
		},
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
		"the games, notes and cap never change": (p, n) => fixedOf(p) === fixedOf(n)
	},
	arbitrary: (s, user, r) => {
		const g = r.pick(s.games);
		if (g.players.includes(user) && r.next() < .35) return {
			t: "leave",
			game: g.id
		};
		return {
			t: "join",
			game: g.id
		};
	},
	local: {},
	view: ({ state, me, dispatch, theme }) => {
		const mine = state.games.filter((g) => g.players.includes(me)).length;
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: CHAT.title,
				subtitle: mine === 0 ? "You're not signed up yet" : `You're in ${mine} of ${state.games.length} games`
			}),
			/* @__PURE__ */ _jsx("div", { children: state.games.map((g) => {
				const isIn = g.players.includes(me);
				const full = g.players.length >= state.cap;
				return /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						minHeight: 56,
						padding: "6px 0",
						borderBottom: `1px solid ${theme.color.divider}`
					},
					children: [/* @__PURE__ */ _jsxs("div", {
						style: {
							flex: 1,
							minWidth: 0
						},
						children: [
							/* @__PURE__ */ _jsxs("div", {
								style: { fontWeight: 600 },
								children: [
									g.label,
									" ",
									/* @__PURE__ */ _jsxs("small", { children: [
										"· ",
										g.players.length,
										" of ",
										state.cap
									] })
								]
							}),
							g.note ? /* @__PURE__ */ _jsx("small", {
								style: { display: "block" },
								children: g.note
							}) : null,
							/* @__PURE__ */ _jsx("div", {
								style: {
									marginTop: 4,
									minHeight: 20
								},
								children: g.players.length ? /* @__PURE__ */ _jsx(Facepile, {
									users: g.players,
									max: 6,
									size: 20
								}) : /* @__PURE__ */ _jsx("small", { children: "No one yet" })
							})
						]
					}), /* @__PURE__ */ _jsx("div", {
						style: {
							width: 76,
							flex: "none",
							display: "flex",
							justifyContent: "flex-end"
						},
						children: isIn ? /* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							onClick: () => dispatch({
								t: "leave",
								game: g.id
							}),
							children: "Leave"
						}) : full ? /* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							disabled: true,
							children: "Full"
						}) : /* @__PURE__ */ _jsx(Button, {
							kind: "secondary",
							onClick: () => dispatch({
								t: "join",
								game: g.id
							}),
							children: "Join"
						})
					})]
				}, g.id);
			}) }),
			/* @__PURE__ */ _jsxs("small", {
				style: {
					display: "block",
					marginTop: 8
				},
				children: [
					"At least ",
					state.minWomen,
					" girls on court each game"
				]
			})
		] });
	}
});
