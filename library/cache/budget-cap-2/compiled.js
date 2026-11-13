import { defineApp, Button, CardHeader, Facepile } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
const C = {
	options: [
		1500,
		2e3,
		2500,
		3e3
	],
	note: "Exchange Sunday the 14th at the lounge"
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const money = (c) => `$${Math.floor(c / 100)}`;
const votersOf = (s, amount) => Object.keys(s.picks).filter((u) => s.picks[u] === amount);
/** Lower middle value of all picks, so a tie leans to the cheaper limit. */
function median(s) {
	const v = Object.values(s.picks).sort((a, b) => a - b);
	return v.length ? v[Math.floor((v.length - 1) / 2)] : null;
}
const othersSame = (p, n, user) => {
	const pk = Object.keys(p.picks).filter((k) => k !== user);
	const nk = Object.keys(n.picks).filter((k) => k !== user);
	return pk.length === nk.length && pk.every((k) => n.picks[k] === p.picks[k]);
};
export default defineApp({
	name: "Budget vote",
	summary: (s) => {
		const mid = median(s);
		const n = Object.keys(s.picks).length;
		return mid === null ? "Secret Santa spending limit. No picks yet." : `Secret Santa spending limit. Middle is ${money(mid)} from ${n} picks.`;
	},
	init: () => ({
		options: [...C.options],
		picks: {},
		note: C.note
	}),
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "pick") {
			const amount = action.amount;
			if (typeof amount !== "number" || !state.options.includes(amount) || state.picks[meta.user] === amount) return state;
			return {
				...state,
				picks: {
					...state.picks,
					[meta.user]: amount
				}
			};
		}
		if (action.t === "clear") {
			if (state.picks[meta.user] === undefined) return state;
			const next = { ...state.picks };
			delete next[meta.user];
			return {
				...state,
				picks: next
			};
		}
		return state;
	},
	onMembers: (state, ctx) => {
		const keys = Object.keys(state.picks);
		if (keys.every((k) => inChat(ctx, k))) return state;
		const picks = {};
		for (const k of keys) if (inChat(ctx, k)) picks[k] = state.picks[k];
		return {
			...state,
			picks
		};
	},
	invariants: {
		"every pick is one of the allowed limits": (s) => Object.values(s.picks).every((v) => s.options.includes(v)),
		"everyone who picked is in the chat": (s, ctx) => Object.keys(s.picks).every((k) => inChat(ctx, k)),
		"the limits are always 15, 20, 25 and 30 dollars": (s) => s.options.join() === C.options.join(),
		"there are never more picks than people": (s, ctx) => Object.keys(s.picks).length <= ctx.members.length,
		"the note is the exchange note": (s) => s.note === C.note
	},
	transitions: {
		"a pick sets the actor's pick and leaves everyone else's alone": (p, n, a, m) => a.t !== "pick" || p === n || n.picks[m.user] === a.amount && p.picks[m.user] !== a.amount && othersSame(p, n, m.user),
		"a clear removes only the actor's pick": (p, n, a, m) => a.t !== "clear" || p === n || p.picks[m.user] !== undefined && n.picks[m.user] === undefined && othersSame(p, n, m.user),
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
		"the limits and the note never change": (p, n) => p.options.join() === n.options.join() && p.note === n.note
	},
	arbitrary: (s, user, r) => {
		const k = r.next();
		if (s.picks[user] !== undefined && k < .15) return { t: "clear" };
		if (k < .2) return {
			t: "pick",
			amount: 1700
		};
		return {
			t: "pick",
			amount: r.pick(s.options)
		};
	},
	local: {},
	view: ({ state, me, members, dispatch, theme }) => {
		const mid = median(state);
		const n = Object.keys(state.picks).length;
		const maxCount = Math.max(1, ...state.options.map((o) => votersOf(state, o).length));
		const waiting = members.filter((m) => state.picks[m.id] === undefined);
		const names = waiting.slice(0, 3).map((m) => m.id === me ? "you" : m.name);
		const more = waiting.length - names.length;
		const midVotes = mid === null ? 0 : votersOf(state, mid).length;
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: "Secret Santa spending limit",
				subtitle: `${n} of ${members.length} picked`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "flex",
					gap: 8,
					marginTop: 8
				},
				children: state.options.map((o) => {
					const v = votersOf(state, o);
					const mine = state.picks[me] === o;
					const h = v.length ? 8 + Math.round(v.length / maxCount * 64) : 8;
					return /* @__PURE__ */ _jsxs("div", {
						style: {
							flex: 1,
							minWidth: 0,
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: 4
						},
						children: [
							/* @__PURE__ */ _jsx("div", {
								style: {
									minHeight: 24,
									display: "flex",
									alignItems: "center"
								},
								children: mid === o ? /* @__PURE__ */ _jsx("span", {
									style: {
										background: theme.color.primary,
										color: theme.color.onPrimary,
										borderRadius: theme.radius.pill,
										padding: "2px 8px",
										fontSize: theme.type.meta,
										whiteSpace: "nowrap"
									},
									children: "Middle"
								}) : null
							}),
							/* @__PURE__ */ _jsx("div", {
								style: {
									minHeight: 24,
									display: "flex",
									alignItems: "center"
								},
								children: v.length ? /* @__PURE__ */ _jsx(Facepile, {
									users: v,
									max: 3,
									size: 20
								}) : null
							}),
							/* @__PURE__ */ _jsx("div", {
								style: {
									height: 80,
									width: "100%",
									display: "flex",
									alignItems: "flex-end",
									justifyContent: "center"
								},
								children: /* @__PURE__ */ _jsx("div", { style: {
									width: "70%",
									height: h,
									borderRadius: theme.radius.button,
									background: v.length ? mine ? theme.color.primary : theme.color.track : "transparent",
									border: v.length ? "none" : `1px dashed ${theme.color.divider}`
								} })
							}),
							/* @__PURE__ */ _jsx("small", { children: v.length === 1 ? "1 vote" : `${v.length} votes` }),
							/* @__PURE__ */ _jsx(Button, {
								wide: true,
								kind: mine ? "primary" : "secondary",
								onClick: () => dispatch(mine ? { t: "clear" } : {
									t: "pick",
									amount: o
								}),
								children: money(o)
							})
						]
					}, o);
				})
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: { marginTop: 12 },
				children: [/* @__PURE__ */ _jsx("h2", { children: mid === null ? "No picks yet" : `Middle: ${money(mid)}` }), /* @__PURE__ */ _jsx("small", { children: mid === null ? "Tap a limit to pick" : `${midVotes === 1 ? "1 vote" : `${midVotes} votes`} at ${money(mid)} · ${n} picked` })]
			}),
			/* @__PURE__ */ _jsx("div", {
				style: { marginTop: 8 },
				children: /* @__PURE__ */ _jsx("small", { children: waiting.length ? `Waiting on ${names.join(", ")}${more > 0 ? ` +${more}` : ""}` : "Everyone has picked" })
			}),
			/* @__PURE__ */ _jsx("div", { children: /* @__PURE__ */ _jsx("small", { children: state.note }) })
		] });
	}
});
