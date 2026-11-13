import { defineApp, Button, CardHeader, Facepile } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Dinner ranking: each person ranks up to 3 of the spots. 1st = 3 points, 2nd = 2, 3rd = 1.
const C = {
	title: "Where should we eat Friday?",
	spots: [
		"Menya (ramen)",
		"El Güero (tacos)",
		"Buffalo Wild Wings (wings)",
		"Siam Garden (Thai)"
	]
};
const MAX_PICKS = 3;
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const picksOf = (s, user) => s.ranks.find((r) => r.user === user)?.picks ?? [];
const score = (s, id) => s.ranks.reduce((n, r) => {
	const i = r.picks.indexOf(id);
	return i >= 0 ? n + (MAX_PICKS - i) : n;
}, 0);
const othersSame = (p, n, user) => JSON.stringify(p.ranks.filter((r) => r.user !== user)) === JSON.stringify(n.ranks.filter((r) => r.user !== user));
const pointsText = (n) => n === 1 ? "1 point" : `${n} points`;
function pick(s, user, option) {
	if (typeof option !== "string" || !s.options.some((o) => o.id === option)) return s;
	const mine = picksOf(s, user);
	if (mine.includes(option) || mine.length >= MAX_PICKS) return s;
	const next = [...mine, option];
	const has = s.ranks.some((r) => r.user === user);
	return {
		...s,
		ranks: has ? s.ranks.map((r) => r.user === user ? {
			...r,
			picks: next
		} : r) : [...s.ranks, {
			user,
			picks: next
		}]
	};
}
function unpick(s, user, option) {
	if (typeof option !== "string") return s;
	const mine = picksOf(s, user);
	if (!mine.includes(option)) return s;
	const next = mine.filter((x) => x !== option);
	return {
		...s,
		ranks: next.length ? s.ranks.map((r) => r.user === user ? {
			...r,
			picks: next
		} : r) : s.ranks.filter((r) => r.user !== user)
	};
}
function leaderOf(s) {
	const scored = s.options.map((o) => ({
		label: o.label,
		points: score(s, o.id)
	})).sort((a, b) => b.points - a.points);
	const top = scored[0];
	if (!top || top.points === 0) return null;
	return {
		label: top.label,
		points: top.points,
		tied: scored[1] !== undefined && scored[1].points === top.points
	};
}
export default defineApp({
	name: "Dinner ranking",
	summary: (s) => {
		const l = leaderOf(s);
		if (!l) return `${s.title} No rankings yet.`;
		return l.tied ? `${s.title} Tied at ${pointsText(l.points)}. ${s.ranks.length} ranked.` : `${s.title} ${l.label} leads with ${pointsText(l.points)}. ${s.ranks.length} ranked.`;
	},
	init: () => ({
		title: C.title,
		options: C.spots.map((label, i) => ({
			id: `p${i}`,
			label
		})),
		ranks: []
	}),
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "pick") return pick(state, meta.user, action.option);
		if (action.t === "unpick") return unpick(state, meta.user, action.option);
		if (action.t === "clear") return state.ranks.some((r) => r.user === meta.user) ? {
			...state,
			ranks: state.ranks.filter((r) => r.user !== meta.user)
		} : state;
		return state;
	},
	onMembers: (state, ctx) => state.ranks.every((r) => inChat(ctx, r.user)) ? state : {
		...state,
		ranks: state.ranks.filter((r) => inChat(ctx, r.user))
	},
	invariants: {
		"each person has at most one ranking": (s) => new Set(s.ranks.map((r) => r.user)).size === s.ranks.length,
		"a ranking has at most 3 picks and no spot twice": (s) => s.ranks.every((r) => r.picks.length <= MAX_PICKS && new Set(r.picks).size === r.picks.length),
		"every pick is one of the spots": (s) => s.ranks.every((r) => r.picks.every((p) => s.options.some((o) => o.id === p))),
		"people with a ranking are in the chat": (s, ctx) => s.ranks.every((r) => inChat(ctx, r.user)),
		"there are exactly 4 spots with unique ids": (s) => s.options.length === C.spots.length && new Set(s.options.map((o) => o.id)).size === s.options.length,
		"no ranking is empty": (s) => s.ranks.every((r) => r.picks.length > 0)
	},
	transitions: {
		"a pick adds the spot last in the actor's picks and no one else changes": (p, n, a, m) => a.t !== "pick" || p === n || picksOf(n, m.user).join() === [...picksOf(p, m.user), a.option].join() && othersSame(p, n, m.user),
		"an unpick removes that spot from the actor's picks and keeps the order": (p, n, a, m) => a.t !== "unpick" || p === n || picksOf(p, m.user).includes(a.option) && picksOf(n, m.user).join() === picksOf(p, m.user).filter((x) => x !== a.option).join() && othersSame(p, n, m.user),
		"a clear removes only the actor's ranking": (p, n, a, m) => a.t !== "clear" || p === n || picksOf(p, m.user).length > 0 && picksOf(n, m.user).length === 0 && othersSame(p, n, m.user),
		"only people in the chat change a ranking": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
		"the spots and title never change": (p, n) => p.title === n.title && JSON.stringify(p.options) === JSON.stringify(n.options)
	},
	arbitrary: (s, user, r) => {
		const mine = picksOf(s, user);
		const x = r.next();
		if (x < .1) return {
			t: "pick",
			option: "nope"
		};
		if (x < .2) return { t: "clear" };
		if (x < .4 && mine.length) return {
			t: "unpick",
			option: r.pick(mine)
		};
		return {
			t: "pick",
			option: r.pick(s.options).id
		};
	},
	local: {},
	view: ({ state, me, members, dispatch, theme }) => {
		const mine = picksOf(state, me);
		const left = MAX_PICKS - mine.length;
		const l = leaderOf(state);
		const sub = `${state.ranks.length} of ${members.length} ranked` + (l ? l.tied ? ` · tied at ${pointsText(l.points)}` : ` · ${l.label} leads` : "");
		const rows = state.options.map((o, i) => ({
			o,
			i,
			pts: score(state, o.id)
		})).sort((a, b) => b.pts - a.pts || a.i - b.i);
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: sub
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 4
				},
				children: rows.map(({ o, pts }) => {
					const rank = mine.indexOf(o.id);
					const voters = state.ranks.filter((r) => r.picks.includes(o.id)).map((r) => r.user);
					return /* @__PURE__ */ _jsxs("button", {
						onClick: () => dispatch(rank >= 0 ? {
							t: "unpick",
							option: o.id
						} : {
							t: "pick",
							option: o.id
						}),
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							width: "100%",
							minHeight: 48,
							padding: "4px 10px",
							borderRadius: theme.radius.button,
							textAlign: "left",
							background: rank >= 0 ? theme.color.selected : theme.color.input,
							color: theme.color.text
						},
						children: [
							/* @__PURE__ */ _jsx("span", {
								style: {
									width: 24,
									height: 24,
									borderRadius: theme.radius.pill,
									flexShrink: 0,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									background: rank >= 0 ? theme.color.primary : theme.color.track,
									color: rank >= 0 ? theme.color.onPrimary : theme.color.text,
									fontSize: theme.type.meta
								},
								children: rank >= 0 ? rank + 1 : ""
							}),
							/* @__PURE__ */ _jsxs("span", {
								style: {
									flex: 1,
									minWidth: 0,
									overflowWrap: "anywhere"
								},
								children: [/* @__PURE__ */ _jsx("span", {
									style: {
										display: "block",
										fontWeight: 600
									},
									children: o.label
								}), /* @__PURE__ */ _jsx("small", { children: pointsText(pts) })]
							}),
							voters.length ? /* @__PURE__ */ _jsx(Facepile, {
								users: voters,
								max: 3,
								size: 20
							}) : null
						]
					}, o.id);
				})
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginTop: 8,
					minHeight: 44
				},
				children: [/* @__PURE__ */ _jsx("small", {
					style: { flex: 1 },
					children: left > 0 ? `Tap to rank · ${left} ${left === 1 ? "pick" : "picks"} left` : "Your top 3 are set"
				}), mine.length > 0 ? /* @__PURE__ */ _jsx(Button, {
					kind: "deemphasized",
					onClick: () => dispatch({ t: "clear" }),
					children: "Clear"
				}) : null]
			})
		] });
	}
});
