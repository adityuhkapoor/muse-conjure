import { defineApp, Avatar, Button, CardHeader, Toast } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Tahoe trip: everything spent, split equally, settled with the fewest payments.
const CHAT = {
	title: "Tahoe trip costs",
	expenses: [
		{
			payer: "Owen",
			label: "Lift tickets",
			cents: 64500
		},
		{
			payer: "Theo",
			label: "Cabin",
			cents: 9e4
		},
		{
			payer: "Priya",
			label: "Groceries",
			cents: 11200
		},
		{
			payer: "Paige",
			label: "Gas",
			cents: 7e3
		},
		{
			payer: "Paige",
			label: "Chains",
			cents: 3500
		},
		{
			payer: "Rohan",
			label: "Friday dinner",
			cents: 8800
		},
		{
			payer: "Owen",
			label: "Saturday burgers",
			cents: 7400
		},
		{
			payer: "Theo",
			label: "Ski rental",
			cents: 12e3
		},
		{
			payer: "Paige",
			label: "Resort parking",
			cents: 2500
		},
		{
			payer: "Rohan",
			label: "Beers",
			cents: 4600
		},
		{
			payer: "Theo",
			label: "Hot tub",
			cents: 4e3
		}
	]
};
const MAX_EXPENSES = 30;
const MAX_LABEL = 40;
const MAX_CENTS = 1e7;
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const clean = (s) => s.trim().replace(/\s+/g, " ");
const keyOf = (p) => `${p.from}>${p.to}:${p.cents}`;
const totalOf = (s) => s.expenses.reduce((n, e) => n + e.cents, 0);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const money = (c) => {
	const d = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	const r = c % 100;
	return `$${d}${r ? "." + String(r).padStart(2, "0") : ""}`;
};
const parseCents = (raw) => {
	const m = /^\$?(\d{1,6})(?:\.(\d{1,2}))?$/.exec(raw.trim());
	if (!m) return 0;
	return Number(m[1]) * 100 + (m[2] ? Number(m[2].padEnd(2, "0")) : 0);
};
/** Paid minus fair share. Leftover cents go to the first members in order, so nets sum to 0. */
function nets(s, members) {
	const n = members.length;
	if (!n) return [];
	const total = totalOf(s);
	const share = Math.floor(total / n);
	const extra = total - share * n;
	return members.map((mb, i) => ({
		id: mb.id,
		net: s.expenses.filter((e) => e.payer === mb.id).reduce((a, e) => a + e.cents, 0) - share - (i < extra ? 1 : 0)
	}));
}
/** Greedy: the biggest debtor pays the biggest creditor. */
function payments(s, members) {
	const ns = nets(s, members);
	const debt = ns.map((x, i) => ({
		id: x.id,
		left: -x.net,
		i
	})).filter((x) => x.left > 0);
	const cred = ns.map((x, i) => ({
		id: x.id,
		left: x.net,
		i
	})).filter((x) => x.left > 0);
	const out = [];
	while (debt.length && cred.length) {
		debt.sort((a, b) => b.left - a.left || a.i - b.i);
		cred.sort((a, b) => b.left - a.left || a.i - b.i);
		const d = debt[0];
		const c = cred[0];
		const amt = Math.min(d.left, c.left);
		out.push({
			from: d.id,
			to: c.id,
			cents: amt
		});
		d.left -= amt;
		c.left -= amt;
		if (d.left === 0) debt.shift();
		if (c.left === 0) cred.shift();
	}
	return out;
}
export default defineApp({
	name: "Trip split",
	summary: (s, ctx) => {
		const total = totalOf(s);
		if (!s.expenses.length) return `${CHAT.title}: nothing added yet.`;
		const share = ctx.members.length ? Math.floor(total / ctx.members.length) : 0;
		return `${CHAT.title}: ${money(total)} total · ${money(share)} each`;
	},
	init: (ctx) => {
		const expenses = [];
		CHAT.expenses.forEach((x, i) => {
			const who = ctx.members.find((m) => m.name.toLowerCase() === x.payer.toLowerCase());
			if (who) expenses.push({
				id: `p${i}`,
				label: x.label,
				payer: who.id,
				cents: x.cents
			});
		});
		return {
			expenses,
			paid: []
		};
	},
	reduce: (s, a, m, ctx) => {
		if (!inChat(ctx, m.user)) return s;
		switch (a.t) {
			case "add": {
				if (typeof a.label !== "string" || typeof a.cents !== "number" || !Number.isInteger(a.cents)) return s;
				const label = clean(a.label);
				if (!label || label.length > MAX_LABEL) return s;
				if (a.cents < 1 || a.cents > MAX_CENTS || s.expenses.length >= MAX_EXPENSES) return s;
				return {
					expenses: [...s.expenses, {
						id: `e${m.seq}`,
						label,
						payer: m.user,
						cents: a.cents
					}],
					paid: []
				};
			}
			case "remove": {
				if (typeof a.id !== "string") return s;
				const e = s.expenses.find((x) => x.id === a.id);
				if (!e || e.payer !== m.user) return s;
				return {
					expenses: s.expenses.filter((x) => x.id !== e.id),
					paid: []
				};
			}
			case "paid": {
				if (typeof a.key !== "string") return s;
				const pay = payments(s, ctx.members).find((p) => keyOf(p) === a.key);
				if (!pay || pay.from !== m.user) return s;
				return {
					...s,
					paid: s.paid.includes(a.key) ? s.paid.filter((k) => k !== a.key) : [...s.paid, a.key]
				};
			}
		}
		return s;
	},
	// Someone left: their expenses go, and marks that no longer match a payment go too.
	onMembers: (s, ctx) => {
		const kept = s.expenses.filter((e) => inChat(ctx, e.payer));
		const base = kept.length === s.expenses.length ? s : {
			...s,
			expenses: kept
		};
		const keys = new Set(payments(base, ctx.members).map(keyOf));
		const paid = base.paid.filter((k) => keys.has(k));
		return paid.length === base.paid.length ? base : {
			...base,
			paid
		};
	},
	invariants: {
		"every expense was paid by someone in the chat": (s, ctx) => s.expenses.every((e) => inChat(ctx, e.payer)),
		"expense ids are unique, amounts are positive whole cents, labels are 1 to 40 characters": (s) => new Set(s.expenses.map((e) => e.id)).size === s.expenses.length && s.expenses.every((e) => Number.isInteger(e.cents) && e.cents > 0 && e.label.length >= 1 && e.label.length <= MAX_LABEL),
		"there are at most 30 expenses": (s) => s.expenses.length <= MAX_EXPENSES,
		"balances sum to exactly zero": (s, ctx) => nets(s, ctx.members).reduce((n, x) => n + x.net, 0) === 0,
		"payments settle every balance with no self payments": (s, ctx) => {
			const ns = nets(s, ctx.members);
			const pays = payments(s, ctx.members);
			const owed = ns.reduce((n, x) => n + (x.net < 0 ? -x.net : 0), 0);
			return pays.every((p) => p.from !== p.to && Number.isInteger(p.cents) && p.cents > 0) && pays.reduce((n, p) => n + p.cents, 0) === owed && ns.every((x) => pays.filter((p) => p.to === x.id).reduce((n, p) => n + p.cents, 0) - pays.filter((p) => p.from === x.id).reduce((n, p) => n + p.cents, 0) === x.net);
		},
		"paid marks match a current payment and none repeat": (s, ctx) => {
			const keys = payments(s, ctx.members).map(keyOf);
			return new Set(s.paid).size === s.paid.length && s.paid.every((k) => keys.includes(k));
		}
	},
	transitions: {
		"an add puts one expense last, paid by the actor, and clears the marks": (p, n, a, m) => {
			if (a.t !== "add" || p === n) return true;
			const last = n.expenses.at(-1);
			return typeof a.label === "string" && n.expenses.length === p.expenses.length + 1 && !!last && last.id === `e${m.seq}` && last.payer === m.user && last.label === clean(a.label) && last.cents === a.cents && same(p.expenses, n.expenses.slice(0, -1)) && n.paid.length === 0;
		},
		"a remove deletes only that expense, only for its payer, and clears the marks": (p, n, a, m) => a.t !== "remove" || p === n || p.expenses.find((e) => e.id === a.id)?.payer === m.user && same(n.expenses, p.expenses.filter((e) => e.id !== a.id)) && n.paid.length === 0,
		"a paid tap toggles one mark, only for the person who pays it": (p, n, a, m, ctx) => {
			if (a.t !== "paid" || p === n) return true;
			const pay = payments(p, ctx.members).find((x) => keyOf(x) === a.key);
			const others = (xs) => xs.filter((k) => k !== a.key).join("|");
			return !!pay && pay.from === m.user && p.paid.includes(a.key) !== n.paid.includes(a.key) && others(p.paid) === others(n.paid) && same(p.expenses, n.expenses);
		},
		"expenses change only by an add or a remove": (p, n, a) => p === n || p.expenses === n.expenses || a.t === "add" || a.t === "remove",
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r, ctx) => {
		const k = r.next();
		const pays = payments(s, ctx.members);
		if (k < .4) {
			return {
				t: "add",
				label: r.pick([
					"Snacks",
					"Ski wax",
					"Tolls",
					"Coffee",
					"  ",
					""
				]),
				cents: r.pick([
					1250,
					4800,
					9900,
					2e4,
					0,
					-5
				])
			};
		}
		if (k < .55 && s.expenses.length) {
			const own = s.expenses.filter((e) => e.payer === user);
			return {
				t: "remove",
				id: (own.length && r.next() < .7 ? r.pick(own) : r.pick(s.expenses)).id
			};
		}
		if (pays.length) {
			const mine = pays.filter((x) => x.from === user);
			return {
				t: "paid",
				key: keyOf(mine.length && r.next() < .8 ? r.pick(mine) : r.pick(pays))
			};
		}
		return {
			t: "add",
			label: r.pick([
				"Snacks",
				"Tolls",
				"Coffee"
			]),
			cents: r.pick([
				1250,
				4800,
				9900
			])
		};
	},
	local: {
		label: "",
		amount: "",
		open: false,
		toast: 0
	},
	view: ({ state, me, members, dispatch, local, setLocal }) => {
		const pays = payments(state, members);
		const ns = nets(state, members);
		const total = totalOf(state);
		const share = members.length ? Math.floor(total / members.length) : 0;
		const nameOf = (id) => id === me ? "You" : members.find((x) => x.id === id)?.name ?? "Someone";
		const netOf = (id) => ns.find((x) => x.id === id)?.net ?? 0;
		const myNet = netOf(me);
		const owe = pays.filter((p) => p.from === me);
		const incoming = pays.filter((p) => p.to === me);
		const top = [...state.expenses].sort((a, b) => b.cents - a.cents).slice(0, 2);
		const cents = parseCents(local.amount);
		const valid = clean(local.label).length > 0 && cents > 0 && state.expenses.length < MAX_EXPENSES;
		const submit = () => {
			if (!valid) return;
			dispatch({
				t: "add",
				label: clean(local.label).slice(0, MAX_LABEL),
				cents
			});
			setLocal({
				label: "",
				amount: "",
				toast: local.toast + 1
			});
		};
		const clip = {
			overflow: "hidden",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap"
		};
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: CHAT.title,
				subtitle: state.expenses.length ? `Total ${money(total)} · ${money(share)} each` : "No expenses yet"
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 2
				},
				"aria-label": `${pays.length} payments settle it`,
				children: pays.map((p) => {
					const done = state.paid.includes(keyOf(p));
					return /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 6,
							minHeight: 28
						},
						children: [
							/* @__PURE__ */ _jsx(Avatar, {
								user: p.from,
								size: 20
							}),
							/* @__PURE__ */ _jsx("small", {
								style: {
									flex: 1,
									minWidth: 0,
									...clip
								},
								children: `${nameOf(p.from)} → ${nameOf(p.to)}`
							}),
							/* @__PURE__ */ _jsx(Avatar, {
								user: p.to,
								size: 20
							}),
							/* @__PURE__ */ _jsx("small", {
								style: { fontWeight: 600 },
								children: done ? `${money(p.cents)} · paid` : money(p.cents)
							})
						]
					}, keyOf(p));
				})
			}),
			top.length ? /* @__PURE__ */ _jsx("small", {
				style: {
					display: "block",
					...clip
				},
				children: `Most: ${top.map((e) => `${e.label} ${money(e.cents)}`).join(" · ")}`
			}) : null,
			/* @__PURE__ */ _jsx("div", {
				style: { marginTop: 4 },
				children: !state.expenses.length ? /* @__PURE__ */ _jsx("small", { children: "Add what you paid and it splits equally" }) : owe.length ? owe.map((p) => {
					const done = state.paid.includes(keyOf(p));
					return /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: 44
						},
						children: [/* @__PURE__ */ _jsx("div", {
							style: {
								flex: 1,
								minWidth: 0,
								fontWeight: 600
							},
							children: `You owe ${nameOf(p.to)} ${money(p.cents)}`
						}), /* @__PURE__ */ _jsx(Button, {
							kind: done ? "deemphasized" : "secondary",
							onClick: () => dispatch({
								t: "paid",
								key: keyOf(p)
							}),
							children: done ? "Paid" : "I paid"
						})]
					}, keyOf(p));
				}) : incoming.length ? /* @__PURE__ */ _jsx("div", {
					style: {
						minHeight: 28,
						fontWeight: 600
					},
					children: `You get ${money(myNet)} · ${incoming.filter((p) => state.paid.includes(keyOf(p))).length} of ${incoming.length} paid`
				}) : /* @__PURE__ */ _jsx("div", {
					style: {
						minHeight: 28,
						fontWeight: 600
					},
					children: "You're even"
				})
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					minHeight: 44
				},
				children: [/* @__PURE__ */ _jsxs("div", {
					style: {
						flex: 1,
						minWidth: 0
					},
					children: [/* @__PURE__ */ _jsx("div", {
						style: { fontWeight: 600 },
						children: "All expenses"
					}), /* @__PURE__ */ _jsx("small", { children: `${state.expenses.length} items` })]
				}), /* @__PURE__ */ _jsx(Button, {
					kind: "deemphasized",
					onClick: () => setLocal({ open: !local.open }),
					children: local.open ? "Hide" : "Show"
				})]
			}),
			local.open ? state.expenses.map((e) => /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					minHeight: 44
				},
				children: [
					/* @__PURE__ */ _jsx(Avatar, {
						user: e.payer,
						size: 24
					}),
					/* @__PURE__ */ _jsxs("div", {
						style: {
							flex: 1,
							minWidth: 0
						},
						children: [/* @__PURE__ */ _jsx("div", {
							style: clip,
							children: e.label
						}), /* @__PURE__ */ _jsx("small", { children: nameOf(e.payer) })]
					}),
					/* @__PURE__ */ _jsx("div", {
						style: { fontWeight: 600 },
						children: money(e.cents)
					}),
					e.payer === me ? /* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						onClick: () => dispatch({
							t: "remove",
							id: e.id
						}),
						children: "Remove"
					}) : null
				]
			}, e.id)) : null,
			/* @__PURE__ */ _jsxs("form", {
				style: {
					display: "flex",
					gap: 8,
					marginTop: 8,
					alignItems: "center"
				},
				onSubmit: (e) => {
					e.preventDefault();
					submit();
				},
				children: [
					/* @__PURE__ */ _jsx("input", {
						style: {
							flex: 1,
							minWidth: 0
						},
						value: local.label,
						maxLength: MAX_LABEL,
						placeholder: "What you paid",
						"aria-label": "What you paid",
						onInput: (e) => setLocal({ label: e.currentTarget.value })
					}),
					/* @__PURE__ */ _jsx("input", {
						style: { width: 76 },
						value: local.amount,
						maxLength: 9,
						placeholder: "Amount",
						"aria-label": "Amount in dollars",
						onInput: (e) => setLocal({ amount: e.currentTarget.value })
					}),
					/* @__PURE__ */ _jsx(Button, {
						kind: "primary",
						disabled: !valid,
						onClick: submit,
						children: "Add"
					})
				]
			}),
			local.toast ? /* @__PURE__ */ _jsx(Toast, { children: "Expense added" }, local.toast) : null
		] });
	}
});
