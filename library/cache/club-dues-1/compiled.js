import { defineApp, Avatar, Button, CardHeader, Progress } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Split a bill evenly across everyone in the chat, paid to one collector.
const CHAT = {
	title: "League fee and pinnies",
	collector: "dev",
	due: "Friday",
	items: [{
		label: "League fee",
		cents: 12e3
	}, {
		label: "Pinnies",
		cents: 1500
	}],
	alreadyPaid: {
		cents: 2e3,
		names: [
			"abby",
			"theo",
			"ty"
		]
	}
};
const total = (s) => s.items.reduce((n, i) => n + i.cents, 0);
const CHAT_TOTAL = CHAT.items.reduce((n, i) => n + i.cents, 0);
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const money = (c) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
/** Each member's share; the first members take the leftover cents. */
function shares(s, ctx) {
	const out = {};
	const n = ctx.members.length;
	const t = total(s);
	ctx.members.forEach((m, i) => {
		out[m.id] = Math.floor(t / n) + (i < t % n ? 1 : 0);
	});
	return out;
}
const owed = (s, sh, id) => id === s.collector ? 0 : Math.max(0, (sh[id] ?? 0) - (s.paid[id] ?? 0));
const othersSame = (p, n, id) => [...new Set([...Object.keys(p.paid), ...Object.keys(n.paid)])].every((k) => k === id || (p.paid[k] ?? 0) === (n.paid[k] ?? 0));
const samePaid = (a, b) => {
	const ka = Object.keys(a);
	return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};
export default defineApp({
	name: "Bill split",
	summary: (s, ctx) => {
		const sh = shares(s, ctx);
		const done = ctx.members.filter((m) => owed(s, sh, m.id) === 0).length;
		return `${s.title} · ${money(total(s))} · ${done} of ${ctx.members.length} paid`;
	},
	init: (ctx) => {
		const collector = ctx.members.find((m) => m.name.toLowerCase() === CHAT.collector)?.id ?? ctx.members[0]?.id ?? "";
		const base = {
			title: CHAT.title,
			collector,
			items: CHAT.items.map((i) => ({ ...i })),
			paid: {},
			due: CHAT.due
		};
		const sh = shares(base, ctx);
		const paid = {};
		for (const m of ctx.members) {
			if (m.id !== collector && CHAT.alreadyPaid.names.includes(m.name.toLowerCase())) paid[m.id] = Math.min(CHAT.alreadyPaid.cents, sh[m.id] ?? 0);
		}
		return {
			...base,
			paid
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		const sh = shares(state, ctx);
		if (action.t === "settle") {
			const mine = sh[meta.user];
			if (mine === undefined || meta.user === state.collector || state.paid[meta.user] === mine) return state;
			return {
				...state,
				paid: {
					...state.paid,
					[meta.user]: mine
				}
			};
		}
		if (action.t === "confirm") {
			const who = action.user;
			const cents = action.cents;
			if (meta.user !== state.collector || typeof who !== "string" || typeof cents !== "number" || !Number.isInteger(cents)) return state;
			const max = sh[who];
			if (max === undefined || who === state.collector || cents < 0 || cents > max || (state.paid[who] ?? 0) === cents) return state;
			return {
				...state,
				paid: {
					...state.paid,
					[who]: cents
				}
			};
		}
		return state;
	},
	onMembers: (state, ctx) => {
		const collector = inChat(ctx, state.collector) ? state.collector : ctx.members[0]?.id ?? "";
		const next = {
			...state,
			collector
		};
		const sh = shares(next, ctx);
		const paid = {};
		for (const [u, c] of Object.entries(state.paid)) {
			if (u !== collector && sh[u] !== undefined) paid[u] = Math.min(c, sh[u]);
		}
		if (collector === state.collector && samePaid(paid, state.paid)) return state;
		return {
			...next,
			paid
		};
	},
	invariants: {
		"the items add up to the bill": (s) => total(s) === CHAT_TOTAL && s.items.every((i) => Number.isInteger(i.cents) && i.cents > 0),
		"shares add up to the bill and differ by at most one cent": (s, ctx) => {
			const v = Object.values(shares(s, ctx));
			if (v.length === 0) return true;
			return v.reduce((a, c) => a + c, 0) === total(s) && Math.max(...v) - Math.min(...v) <= 1;
		},
		"no one has paid less than nothing or more than their share": (s, ctx) => {
			const sh = shares(s, ctx);
			return Object.entries(s.paid).every(([u, c]) => Number.isInteger(c) && c >= 0 && c <= (sh[u] ?? -1));
		},
		"the collector and everyone who paid are in the chat": (s, ctx) => (ctx.members.length === 0 ? s.collector === "" : inChat(ctx, s.collector)) && Object.keys(s.paid).every((u) => inChat(ctx, u)),
		"the collector has no payment of their own to make": (s) => !(s.collector in s.paid)
	},
	transitions: {
		"settle puts the actor at their full share and moves no one else": (p, n, a, m, ctx) => a.t !== "settle" || p === n || m.user !== p.collector && n.paid[m.user] === shares(n, ctx)[m.user] && othersSame(p, n, m.user),
		"confirm is only by the collector and sets that one person's amount": (p, n, a, m) => a.t !== "confirm" || p === n || m.user === p.collector && n.paid[a.user] === a.cents && othersSame(p, n, a.user),
		"paid amounts only go up, except through confirm": (p, n, a) => a.t === "confirm" || Object.keys(p.paid).every((u) => (n.paid[u] ?? 0) >= (p.paid[u] ?? 0)),
		"the collector, items and due date never change by an action": (p, n) => p.collector === n.collector && p.due === n.due && p.title === n.title && p.items === n.items,
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r, ctx) => {
		const k = r.next();
		if (user === s.collector && k < .6) {
			const sh = shares(s, ctx);
			const who = r.pick(ctx.members)?.id ?? user;
			return {
				t: "confirm",
				user: who,
				cents: k < .05 ? 999999 : r.int((sh[who] ?? 0) + 1)
			};
		}
		if (k > .92) return {
			t: "confirm",
			user: r.pick(ctx.members)?.id ?? user,
			cents: r.int(2500)
		};
		return { t: "settle" };
	},
	local: {},
	view: ({ state, me, members, dispatch }) => {
		const ctx = { members };
		const sh = shares(state, ctx);
		const nameOf = (id) => id === me ? "You" : members.find((m) => m.id === id)?.name ?? "Someone";
		const isCollector = me === state.collector;
		const ordered = [...members].sort((a, b) => a.id === me ? -1 : b.id === me ? 1 : 0);
		const owing = members.filter((m) => owed(state, sh, m.id) > 0);
		const paidCount = members.length - owing.length;
		const collected = members.reduce((n, m) => n + (m.id === state.collector ? sh[m.id] ?? 0 : state.paid[m.id] ?? 0), 0);
		const each = Math.max(0, ...Object.values(sh));
		const names = owing.slice(0, 3).map((m) => m.id === me ? "you" : m.name);
		const more = owing.length > 3 ? ` +${owing.length - 3}` : "";
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `${paidCount} of ${members.length} paid · ${money(each)} each · due ${state.due}`
			}),
			/* @__PURE__ */ _jsx(Progress, {
				value: collected,
				max: Math.max(1, total(state)),
				label: `${money(collected)} of ${money(total(state))}`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 0,
					marginTop: 4
				},
				children: ordered.map((m) => {
					const o = owed(state, sh, m.id);
					const isC = m.id === state.collector;
					const note = isC ? "Collecting" : o === 0 ? "Paid" : `${money(o)} owed`;
					return /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: 44
						},
						children: [
							/* @__PURE__ */ _jsx(Avatar, {
								user: m,
								size: 28
							}),
							/* @__PURE__ */ _jsxs("div", {
								style: {
									flex: 1,
									minWidth: 0
								},
								children: [/* @__PURE__ */ _jsx("div", {
									style: {
										fontWeight: 600,
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap"
									},
									children: nameOf(m.id)
								}), /* @__PURE__ */ _jsx("small", { children: note })]
							}),
							!isC && o > 0 && m.id === me ? /* @__PURE__ */ _jsx(Button, {
								kind: "primary",
								onClick: () => dispatch({ t: "settle" }),
								children: "I paid"
							}) : !isC && o > 0 && isCollector ? /* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => dispatch({
									t: "confirm",
									user: m.id,
									cents: sh[m.id] ?? 0
								}),
								children: "Mark paid"
							}) : null
						]
					}, m.id);
				})
			}),
			/* @__PURE__ */ _jsxs("small", {
				style: {
					display: "block",
					marginTop: 4
				},
				children: [`${nameOf(state.collector)} ${state.collector === me ? "are" : "is"} collecting`, owing.length ? ` · ${names.join(", ")}${more} owe${owing.length === 1 && names[0] !== "you" ? "s" : ""}` : " · everyone has paid"]
			})
		] });
	}
});
