import { defineApp, Avatar, Button, CardHeader, Toast } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Running tab for the trip. Anyone adds what they paid; everything is split evenly among the
// people in the chat. The picture shows who sends money to whom to settle up.
const TAB = {
	title: "Trip tab",
	seeds: [
		{
			payer: "Theo",
			label: "In-N-Out",
			cents: 4100
		},
		{
			payer: "Cam",
			label: "Airbnb in Joshua Tree",
			cents: 32e3
		},
		{
			payer: "Cam",
			label: "Gas",
			cents: 5800
		},
		{
			payer: "Kev",
			label: "Beers at the gas station",
			cents: 2300
		},
		{
			payer: "Hugo",
			label: "Park entry",
			cents: 3e3
		}
	]
};
const MAX_EXPENSES = 40;
const MAX_PAID = 30;
const MAX_LABEL = 40;
const MAX_CENTS = 1e7;
const clean = (label) => label.trim().replace(/\s+/g, " ");
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const money = (c) => {
	const w = Math.floor(c / 100);
	const f = c % 100;
	return "$" + w + (f ? "." + (f < 10 ? "0" : "") + f : "");
};
const parseCents = (s) => {
	const t = s.trim().replace(/^\$/, "");
	if (!/^\d{1,5}(\.\d{1,2})?$/.test(t)) return null;
	const parts = t.split(".");
	const whole = Number(parts[0] ?? "0");
	const frac = Number(((parts[1] ?? "") + "00").slice(0, 2));
	return whole * 100 + frac;
};
/** Net balance per member: positive means owed money, negative means owes money. */
function balances(s, members) {
	const net = {};
	const n = members.length;
	if (n === 0) return net;
	for (const m of members) net[m.id] = 0;
	for (const e of s.expenses) {
		if (!(e.payer in net)) continue;
		const base = Math.floor(e.cents / n);
		const rem = e.cents % n;
		net[e.payer] = (net[e.payer] ?? 0) + e.cents;
		members.forEach((m, i) => {
			net[m.id] = (net[m.id] ?? 0) - (base + (i < rem ? 1 : 0));
		});
	}
	for (const p of s.paid) {
		if (!(p.from in net) || !(p.to in net)) continue;
		net[p.from] = (net[p.from] ?? 0) + p.cents;
		net[p.to] = (net[p.to] ?? 0) - p.cents;
	}
	return net;
}
/** Fewest-ish payments that bring everyone to even. */
function plan(net, members) {
	const debtors = members.filter((m) => (net[m.id] ?? 0) < 0).map((m) => ({
		id: m.id,
		amt: -(net[m.id] ?? 0)
	})).sort((a, b) => b.amt - a.amt || (a.id < b.id ? -1 : 1));
	const creditors = members.filter((m) => (net[m.id] ?? 0) > 0).map((m) => ({
		id: m.id,
		amt: net[m.id] ?? 0
	})).sort((a, b) => b.amt - a.amt || (a.id < b.id ? -1 : 1));
	const out = [];
	let i = 0;
	let j = 0;
	while (i < debtors.length && j < creditors.length) {
		const d = debtors[i];
		const c = creditors[j];
		const cents = Math.min(d.amt, c.amt);
		if (cents > 0) out.push({
			from: d.id,
			to: c.id,
			cents
		});
		d.amt -= cents;
		c.amt -= cents;
		if (d.amt === 0) i++;
		if (c.amt === 0) j++;
	}
	return out;
}
const sameE = (a, b) => a.id === b.id && a.payer === b.payer && a.label === b.label && a.cents === b.cents;
function add(s, user, label, cents, seq) {
	if (typeof label !== "string" || typeof cents !== "number") return s;
	const l = clean(label);
	if (!l || l.length > MAX_LABEL) return s;
	if (!Number.isInteger(cents) || cents < 1 || cents > MAX_CENTS) return s;
	if (s.expenses.length >= MAX_EXPENSES) return s;
	return {
		...s,
		expenses: [...s.expenses, {
			id: `e${seq}`,
			payer: user,
			label: l,
			cents
		}]
	};
}
function remove(s, user, id) {
	if (typeof id !== "string") return s;
	const e = s.expenses.find((x) => x.id === id);
	if (!e || e.payer !== user) return s;
	return {
		...s,
		expenses: s.expenses.filter((x) => x.id !== id)
	};
}
function settle(s, members, user, to, cents) {
	if (typeof to !== "string" || to === user || !members.some((m) => m.id === to)) return s;
	if (typeof cents !== "number" || !Number.isInteger(cents) || cents < 1 || s.paid.length >= MAX_PAID) return s;
	const net = balances(s, members);
	const mine = net[user] ?? 0;
	const theirs = net[to] ?? 0;
	if (mine >= 0 || theirs <= 0 || cents > -mine || cents > theirs) return s;
	return {
		...s,
		paid: [...s.paid, {
			from: user,
			to,
			cents
		}]
	};
}
export default defineApp({
	name: "Trip tab",
	summary: (s) => {
		const total = s.expenses.reduce((n, e) => n + e.cents, 0);
		return `${TAB.title} ${money(total)} total · ${s.expenses.length} expenses`;
	},
	init: (ctx) => {
		const expenses = [];
		TAB.seeds.forEach((seed, i) => {
			const who = ctx.members.find((m) => m.name.toLowerCase() === seed.payer.toLowerCase());
			if (!who) return;
			expenses.push({
				id: `s${i}`,
				payer: who.id,
				label: seed.label,
				cents: seed.cents
			});
		});
		return {
			expenses,
			paid: []
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		switch (action.t) {
			case "add": return add(state, meta.user, action.label, action.cents, meta.seq);
			case "remove": return remove(state, meta.user, action.id);
			case "settle": return settle(state, ctx.members, meta.user, action.to, action.cents);
		}
		return state;
	},
	onMembers: (state, ctx) => {
		if (state.expenses.every((e) => inChat(ctx, e.payer)) && state.paid.every((p) => inChat(ctx, p.from) && inChat(ctx, p.to))) return state;
		return {
			...state,
			expenses: state.expenses.filter((e) => inChat(ctx, e.payer)),
			paid: state.paid.filter((p) => inChat(ctx, p.from) && inChat(ctx, p.to))
		};
	},
	invariants: {
		"every expense has whole positive cents, a short clean label and a unique id": (s) => new Set(s.expenses.map((e) => e.id)).size === s.expenses.length && s.expenses.every((e) => Number.isInteger(e.cents) && e.cents >= 1 && e.cents <= MAX_CENTS && e.label.length > 0 && e.label.length <= MAX_LABEL && e.label === clean(e.label)),
		"at most 40 expenses and 30 payments": (s) => s.expenses.length <= MAX_EXPENSES && s.paid.length <= MAX_PAID,
		"payers are in the chat": (s, ctx) => s.expenses.every((e) => inChat(ctx, e.payer)),
		"balances add up to zero": (s, ctx) => Object.values(balances(s, ctx.members)).reduce((n, v) => n + v, 0) === 0,
		"every payment has whole positive cents between two different people in the chat": (s, ctx) => s.paid.every((p) => Number.isInteger(p.cents) && p.cents >= 1 && p.from !== p.to && inChat(ctx, p.from) && inChat(ctx, p.to))
	},
	transitions: {
		"an add appends one expense paid by the actor and changes nothing else": (p, n, a, m) => {
			if (a.t !== "add" || p === n) return true;
			const last = n.expenses.at(-1);
			return n.expenses.length === p.expenses.length + 1 && !!last && last.payer === m.user && last.cents === a.cents && last.label === clean(a.label) && p.expenses.every((e, i) => sameE(e, n.expenses[i])) && n.paid.length === p.paid.length;
		},
		"a remove drops one expense, and only the payer can do it": (p, n, a, m) => {
			if (a.t !== "remove" || p === n) return true;
			const gone = p.expenses.filter((e) => !n.expenses.some((x) => x.id === e.id));
			return gone.length === 1 && gone[0].id === a.id && gone[0].payer === m.user && n.expenses.length === p.expenses.length - 1 && n.expenses.every((e) => p.expenses.some((x) => sameE(x, e))) && n.paid.length === p.paid.length;
		},
		"a settle records one payment from the actor, no more than they owed": (p, n, a, m, ctx) => {
			if (a.t !== "settle" || p === n) return true;
			const last = n.paid.at(-1);
			const net = balances(p, ctx.members);
			return n.paid.length === p.paid.length + 1 && !!last && last.from === m.user && last.to === a.to && last.cents === a.cents && (net[m.user] ?? 0) < 0 && a.cents <= -(net[m.user] ?? 0) && n.expenses.length === p.expenses.length;
		},
		"expenses are never edited in place": (p, n) => n.expenses.every((e) => {
			const o = p.expenses.find((x) => x.id === e.id);
			return !o || sameE(o, e);
		}),
		"only people in the chat change the tab": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r, ctx) => {
		const k = r.next();
		if (k < .2) {
			const mine = s.expenses.filter((e) => e.payer === user);
			if (mine.length) return {
				t: "remove",
				id: r.pick(mine).id
			};
		}
		if (k < .45) {
			const net = balances(s, ctx.members);
			const owe = net[user] ?? 0;
			const to = ctx.members.find((m) => (net[m.id] ?? 0) > 0);
			if (owe < 0 && to) return {
				t: "settle",
				to: to.id,
				cents: Math.min(-owe, net[to.id] ?? 0)
			};
		}
		return {
			t: "add",
			label: r.pick([
				"Snacks",
				"Coffee",
				"Tolls",
				"Dinner",
				"  Ice  ",
				""
			]),
			cents: r.pick([
				850,
				1200,
				4500,
				2599,
				1500,
				0
			])
		};
	},
	local: {
		open: false,
		label: "",
		amount: "",
		toast: 0
	},
	view: ({ state, me, members, dispatch, local, setLocal }) => {
		const n = members.length;
		const net = balances(state, members);
		const edges = plan(net, members);
		const total = state.expenses.reduce((sum, e) => members.some((m) => m.id === e.payer) ? sum + e.cents : sum, 0);
		const each = n ? Math.floor(total / n) : 0;
		const nameOf = (id) => id === me ? "You" : members.find((m) => m.id === id)?.name ?? "Someone";
		const mine = net[me] ?? 0;
		const owedTo = edges.filter((e) => e.from === me).map((e) => `${nameOf(e.to)} ${money(e.cents)}`);
		const sortedEdges = [...edges.filter((e) => e.from === me), ...edges.filter((e) => e.from !== me)];
		const shownEdges = sortedEdges.slice(0, 2);
		const moreEdges = sortedEdges.length - shownEdges.length;
		const recent = state.expenses.slice(-2).reverse();
		const hidden = state.expenses.length - recent.length;
		const cents = parseCents(local.amount);
		const canAdd = clean(local.label).length > 0 && cents !== null && cents >= 1 && state.expenses.length < MAX_EXPENSES;
		const submit = () => {
			if (!canAdd || cents === null) return;
			dispatch({
				t: "add",
				label: clean(local.label).slice(0, MAX_LABEL),
				cents
			});
			setLocal({
				label: "",
				amount: "",
				open: false,
				toast: local.toast + 1
			});
		};
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: TAB.title,
				subtitle: `${money(total)} total · ${money(each)} each`
			}),
			n > 0 ? /* @__PURE__ */ _jsxs("div", { children: [
				shownEdges.length === 0 ? /* @__PURE__ */ _jsx("small", { children: "Everyone is even" }) : null,
				shownEdges.map((e) => /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						minHeight: 44
					},
					children: [
						/* @__PURE__ */ _jsx(Avatar, {
							user: e.from,
							size: 24
						}),
						/* @__PURE__ */ _jsx("div", {
							style: {
								flex: 1,
								minWidth: 0,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap"
							},
							children: `${nameOf(e.from)} ${e.from === me ? "owe" : "owes"} ${nameOf(e.to)}`
						}),
						/* @__PURE__ */ _jsx("div", {
							style: {
								whiteSpace: "nowrap",
								fontWeight: 600
							},
							children: money(e.cents)
						}),
						e.from === me ? /* @__PURE__ */ _jsx(Button, {
							kind: "secondary",
							onClick: () => dispatch({
								t: "settle",
								to: e.to,
								cents: e.cents
							}),
							children: "Paid"
						}) : null
					]
				}, `${e.from}-${e.to}`)),
				moreEdges > 0 ? /* @__PURE__ */ _jsxs("small", { children: [moreEdges, " more payments"] }) : null
			] }) : null,
			/* @__PURE__ */ _jsxs("div", {
				style: {
					margin: "6px 0",
					fontWeight: 600
				},
				children: [mine < 0 ? `You owe ${owedTo.join(" · ")}` : mine > 0 ? `You are owed ${money(mine)}` : "You are even", mine < 0 ? /* @__PURE__ */ _jsx("small", {
					style: { fontWeight: 400 },
					children: " · tap Paid when done"
				}) : null]
			}),
			local.open ? /* @__PURE__ */ _jsxs("form", {
				style: {
					display: "grid",
					gap: 8
				},
				onSubmit: (e) => {
					e.preventDefault();
					submit();
				},
				children: [/* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						gap: 8
					},
					children: [/* @__PURE__ */ _jsx("input", {
						style: {
							flex: 1,
							minWidth: 0
						},
						value: local.label,
						maxLength: MAX_LABEL,
						placeholder: "What was it",
						"aria-label": "What was it",
						onInput: (e) => setLocal({ label: e.currentTarget.value })
					}), /* @__PURE__ */ _jsx("input", {
						style: { width: 96 },
						value: local.amount,
						maxLength: 9,
						placeholder: "$ amount",
						"aria-label": "Amount in dollars",
						onInput: (e) => setLocal({ amount: e.currentTarget.value })
					})]
				}), /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						gap: 8
					},
					children: [/* @__PURE__ */ _jsx(Button, {
						kind: "primary",
						disabled: !canAdd,
						onClick: submit,
						children: "Add"
					}), /* @__PURE__ */ _jsx(Button, {
						onClick: () => setLocal({ open: false }),
						children: "Cancel"
					})]
				})]
			}) : /* @__PURE__ */ _jsxs("div", { children: [
				recent.length === 0 ? /* @__PURE__ */ _jsx("small", { children: "No expenses yet · add the first one" }) : null,
				recent.map((e) => /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						minHeight: 36
					},
					children: [
						/* @__PURE__ */ _jsx(Avatar, {
							user: e.payer,
							size: 20
						}),
						/* @__PURE__ */ _jsx("div", {
							style: {
								flex: 1,
								minWidth: 0,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap"
							},
							children: e.label
						}),
						/* @__PURE__ */ _jsx("div", {
							style: {
								whiteSpace: "nowrap",
								fontWeight: 600
							},
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
				}, e.id)),
				hidden > 0 ? /* @__PURE__ */ _jsxs("small", { children: [hidden, " more"] }) : null,
				/* @__PURE__ */ _jsx("div", {
					style: { marginTop: 6 },
					children: /* @__PURE__ */ _jsx(Button, {
						kind: "primary",
						wide: true,
						onClick: () => setLocal({ open: true }),
						children: "Add expense"
					})
				})
			] }),
			local.toast ? /* @__PURE__ */ _jsx(Toast, { children: "Expense added" }, local.toast) : null
		] });
	}
});
