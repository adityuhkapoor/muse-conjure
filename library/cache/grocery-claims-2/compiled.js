import { defineApp, Avatar, Button, CardHeader, Facepile } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "@muse/app/jsx-runtime";
// Aldi receipt split by item. Zoe paid; everyone taps the items they had and marks when they have
// paid her back. Each item splits across its sharers, leftover cents go to the first sharers.
const CHAT = {
	title: "Aldi receipt · $87.40",
	payer: "Zoe",
	totalCents: 8740,
	items: [
		{
			label: "Pasta night",
			cents: 5340,
			who: [
				"Paige",
				"Noor",
				"Jalen",
				"June"
			]
		},
		{
			label: "Sausage",
			cents: 900,
			who: [
				"Paige",
				"Jalen",
				"June"
			]
		},
		{
			label: "Eggs and milk",
			cents: 1100,
			who: ["Rhea"]
		},
		{
			label: "Bread and salad",
			cents: 1400,
			who: "all"
		}
	]
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const ids = (ctx) => ctx.members.map((m) => m.id);
const money = (c) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
function shares(s) {
	const out = {};
	for (const it of s.items) {
		const n = it.sharers.length;
		if (n === 0) continue;
		const base = Math.floor(it.cents / n);
		const extra = it.cents % n;
		it.sharers.forEach((u, i) => {
			out[u] = (out[u] ?? 0) + base + (i < extra ? 1 : 0);
		});
	}
	return out;
}
const billed = (s) => s.items.reduce((a, i) => a + (i.sharers.length ? i.cents : 0), 0);
const owersOf = (s) => {
	const owe = shares(s);
	return Object.keys(owe).filter((u) => u !== s.payer && (owe[u] ?? 0) > 0);
};
function edit(s, id, f, time) {
	const it = s.items.find((i) => i.id === id);
	if (!it) return s;
	const next = f(it.sharers);
	if (next.join() === it.sharers.join()) return s;
	return {
		...s,
		at: time,
		items: s.items.map((i) => i.id === id ? {
			...i,
			sharers: next
		} : i)
	};
}
const sharersOf = (s, id) => s.items.find((i) => i.id === id)?.sharers ?? [];
const without = (xs, u) => xs.filter((x) => x !== u).join();
const sameExcept = (p, n, id) => p.items.length === n.items.length && p.items.every((i, j) => i.id === n.items[j].id && i.label === n.items[j].label && i.cents === n.items[j].cents && (i.id === id || i.sharers.join() === n.items[j].sharers.join()));
export default defineApp({
	name: "Bill split",
	summary: (s) => `${CHAT.title}: ${owersOf(s).filter((u) => s.paid.includes(u)).length} of ${owersOf(s).length} paid back.`,
	init: (ctx) => {
		const byName = (name) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id;
		const payer = byName(CHAT.payer) ?? ctx.members[0]?.id ?? "";
		const items = CHAT.items.map((it, n) => {
			const sharers = it.who === "all" ? ids(ctx) : [...new Set(it.who.map(byName).filter((x) => typeof x === "string"))];
			return {
				id: `p${n}`,
				label: it.label,
				cents: it.cents,
				sharers
			};
		});
		return {
			payer,
			total: CHAT.totalCents,
			items,
			paid: [],
			at: 0
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		const u = meta.user;
		if (action.t === "toggle") {
			if (typeof action.item !== "string") return state;
			return edit(state, action.item, (cur) => cur.includes(u) ? cur.filter((x) => x !== u) : [...cur, u], meta.time);
		}
		if (action.t === "all") {
			if (typeof action.item !== "string") return state;
			return edit(state, action.item, (cur) => ids(ctx).every((x) => cur.includes(x)) ? [] : ids(ctx), meta.time);
		}
		if (action.t === "paid") {
			if (u === state.payer) return state;
			return {
				...state,
				at: meta.time,
				paid: state.paid.includes(u) ? state.paid.filter((x) => x !== u) : [...state.paid, u]
			};
		}
		return state;
	},
	onMembers: (state, ctx) => {
		const payer = inChat(ctx, state.payer) ? state.payer : ctx.members[0]?.id ?? "";
		const items = state.items.map((i) => i.sharers.every((u) => inChat(ctx, u)) ? i : {
			...i,
			sharers: i.sharers.filter((u) => inChat(ctx, u))
		});
		const paid = state.paid.filter((u) => inChat(ctx, u) && u !== payer);
		if (payer === state.payer && items.every((i, j) => i === state.items[j]) && paid.length === state.paid.length) return state;
		return {
			...state,
			payer,
			items,
			paid
		};
	},
	invariants: {
		"item amounts add up to the receipt total": (s) => s.items.reduce((a, i) => a + i.cents, 0) === s.total,
		"every item is a positive whole number of cents": (s) => s.items.every((i) => Number.isInteger(i.cents) && i.cents > 0),
		"no one shares an item twice": (s) => s.items.every((i) => new Set(i.sharers).size === i.sharers.length),
		"sharers, payer and paid people are in the chat": (s, ctx) => (ctx.members.length === 0 || inChat(ctx, s.payer)) && s.paid.every((u) => inChat(ctx, u)) && s.items.every((i) => i.sharers.every((u) => inChat(ctx, u))),
		"the payer is never in the paid list": (s) => !s.paid.includes(s.payer) && new Set(s.paid).size === s.paid.length,
		"personal shares add up to the items that have sharers": (s) => Object.values(shares(s)).reduce((a, c) => a + c, 0) === billed(s)
	},
	transitions: {
		"a toggle flips only the actor on that one item": (p, n, a, m) => a.t !== "toggle" || p === n || sameExcept(p, n, a.item) && sharersOf(p, a.item).includes(m.user) !== sharersOf(n, a.item).includes(m.user) && without(sharersOf(p, a.item), m.user) === without(sharersOf(n, a.item), m.user),
		"all puts every member on that item, or clears it when everyone was on": (p, n, a, _m, ctx) => {
			if (a.t !== "all" || p === n) return true;
			const before = sharersOf(p, a.item);
			const after = sharersOf(n, a.item);
			const everyone = (xs) => ctx.members.every((x) => xs.includes(x.id));
			const full = after.length === ctx.members.length && everyone(after);
			return sameExcept(p, n, a.item) && (after.length === 0 ? everyone(before) : full && !everyone(before));
		},
		"paid flips only the actor, and never the payer": (p, n, a, m) => a.t !== "paid" || p === n || m.user !== p.payer && p.paid.includes(m.user) !== n.paid.includes(m.user) && without(p.paid, m.user) === without(n.paid, m.user) && sameExcept(p, n, ""),
		"total, payer and item amounts never change by an action": (p, n) => p.total === n.total && p.payer === n.payer && sameExcept(p, n, undefined) === sameExcept(p, n, undefined) && p.items.length === n.items.length && p.items.every((i, j) => i.cents === n.items[j].cents && i.label === n.items[j].label),
		"a change records its time": (p, n, _a, m) => p === n || n.at === m.time,
		"only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, _user, r) => {
		const k = r.next();
		if (s.items.length === 0) return { t: "paid" };
		if (k < .05) return {
			t: "toggle",
			item: "nope"
		};
		if (k < .65) return {
			t: "toggle",
			item: r.pick(s.items).id
		};
		if (k < .8) return {
			t: "all",
			item: r.pick(s.items).id
		};
		return { t: "paid" };
	},
	local: { open: false },
	view: ({ state, me, members, dispatch, local, setLocal, theme }) => {
		const owe = shares(state);
		const owers = owersOf(state);
		const back = owers.filter((u) => state.paid.includes(u)).length;
		const nameOf = (id) => members.find((m) => m.id === id)?.name ?? "Someone";
		const isPayer = me === state.payer;
		const mine = owe[me] ?? 0;
		const isPaid = state.paid.includes(me);
		const clip = {
			overflow: "hidden",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap",
			display: "block"
		};
		const everyoneIn = (it) => members.length > 0 && members.every((m) => it.sharers.includes(m.id));
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: CHAT.title,
				subtitle: `Paid by ${nameOf(state.payer)} · ${back} of ${owers.length} paid`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 4
				},
				children: state.items.map((it) => {
					const mineIn = it.sharers.includes(me);
					return /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: 46,
							padding: "0 8px",
							borderRadius: theme.radius.input,
							border: `1px ${it.sharers.length ? "solid" : "dashed"} ${theme.color.divider}`
						},
						children: [
							/* @__PURE__ */ _jsxs("div", {
								style: {
									flex: 1,
									minWidth: 0
								},
								children: [/* @__PURE__ */ _jsx("span", {
									style: {
										...clip,
										fontWeight: 600
									},
									children: it.label
								}), /* @__PURE__ */ _jsx("small", {
									style: clip,
									children: it.sharers.length ? `${money(it.cents)} · ${it.sharers.length} sharing` : `${money(it.cents)} · No one yet`
								})]
							}),
							it.sharers.length ? /* @__PURE__ */ _jsx(Facepile, {
								users: it.sharers,
								max: 3,
								size: 20
							}) : null,
							/* @__PURE__ */ _jsx(Button, {
								kind: mineIn ? "deemphasized" : "secondary",
								onClick: () => dispatch({
									t: "toggle",
									item: it.id
								}),
								children: mineIn ? "Leave" : "Join"
							})
						]
					}, it.id);
				})
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					minHeight: 52,
					marginTop: 4
				},
				children: isPayer ? /* @__PURE__ */ _jsxs("div", {
					style: {
						flex: 1,
						minWidth: 0
					},
					children: [/* @__PURE__ */ _jsx("span", {
						style: {
							...clip,
							fontWeight: 600
						},
						children: `You paid ${money(state.total)}`
					}), /* @__PURE__ */ _jsx("small", {
						style: clip,
						children: `${back} of ${owers.length} paid you back`
					})]
				}) : /* @__PURE__ */ _jsxs(_Fragment, { children: [/* @__PURE__ */ _jsxs("div", {
					style: {
						flex: 1,
						minWidth: 0
					},
					children: [/* @__PURE__ */ _jsx("span", {
						style: {
							...clip,
							fontWeight: 600
						},
						children: money(mine)
					}), /* @__PURE__ */ _jsx("small", {
						style: clip,
						children: `You owe ${nameOf(state.payer)}`
					})]
				}), /* @__PURE__ */ _jsx(Button, {
					kind: isPaid ? "deemphasized" : "primary",
					onClick: () => dispatch({ t: "paid" }),
					children: isPaid ? "Paid" : "I paid"
				})] })
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					minHeight: 44
				},
				children: [/* @__PURE__ */ _jsx("small", {
					style: {
						...clip,
						flex: 1,
						minWidth: 0
					},
					children: `${back} of ${owers.length} paid`
				}), /* @__PURE__ */ _jsx(Button, {
					kind: "deemphasized",
					onClick: () => setLocal({ open: !local.open }),
					children: local.open ? "Hide" : "Everyone"
				})]
			}),
			local.open ? /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gridTemplateColumns: "1fr 1fr",
					gap: 4
				},
				children: members.map((m) => /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						minHeight: 44,
						minWidth: 0
					},
					children: [/* @__PURE__ */ _jsx(Avatar, {
						user: m,
						size: 24
					}), /* @__PURE__ */ _jsxs("div", {
						style: {
							flex: 1,
							minWidth: 0
						},
						children: [/* @__PURE__ */ _jsx("span", {
							style: {
								...clip,
								fontWeight: 600
							},
							children: m.id === me ? "You" : m.name
						}), /* @__PURE__ */ _jsx("small", {
							style: clip,
							children: m.id === state.payer ? `${money(owe[m.id] ?? 0)} · paid bill` : state.paid.includes(m.id) ? `${money(owe[m.id] ?? 0)} · paid` : money(owe[m.id] ?? 0)
						})]
					})]
				}, m.id))
			}), /* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 4,
					marginTop: 8
				},
				children: state.items.map((it) => /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						minHeight: 44
					},
					children: [/* @__PURE__ */ _jsx("span", {
						style: {
							...clip,
							flex: 1,
							minWidth: 0
						},
						children: it.label
					}), /* @__PURE__ */ _jsx(Button, {
						kind: "secondary",
						onClick: () => dispatch({
							t: "all",
							item: it.id
						}),
						children: everyoneIn(it) ? "Clear" : "All in"
					})]
				}, it.id))
			})] }) : null
		] });
	}
});
