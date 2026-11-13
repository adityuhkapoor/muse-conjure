import { defineApp, Avatar, Button, CardHeader, Toast } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Tahoe cabin weekend: who paid what, who owes who, and the fewest payments to settle up.
const CHAT = {
	title: "Tahoe cabin weekend",
	// split: null means everyone in the chat; a list of names means only those people.
	expenses: [
		{
			label: "Cabin deposit",
			cents: 24e3,
			payer: "Zoe",
			split: null
		},
		{
			label: "Safeway groceries",
			cents: 8600,
			payer: "Lily",
			split: null
		},
		{
			label: "Gas",
			cents: 6200,
			payer: "Noor",
			split: null
		},
		{
			label: "Firewood and s'mores",
			cents: 2700,
			payer: "Wren",
			split: null
		},
		{
			label: "Pizza night at the lodge",
			cents: 5400,
			payer: "Lily",
			split: null
		},
		{
			label: "Lift passes",
			cents: 18e3,
			payer: "Noor",
			split: ["Noor", "June"]
		}
	]
};
const MAX_ITEMS = 12;
const MAX_LABEL = 40;
const MAX_CENTS = 1e7;
const inChat = (ctx, id) => typeof id === "string" && ctx.members.some((m) => m.id === id);
const isCents = (n) => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MAX_CENTS;
const clean = (s) => s.trim().replace(/\s+/g, " ");
const money = (c) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
function parseCents(text) {
	const m = /^\$?\s*(\d{1,5})(?:\.(\d{1,2}))?$/.exec(text.trim().replace(/,/g, ""));
	if (!m) return null;
	const c = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
	return c >= 1 ? c : null;
}
function validSplit(split, ctx) {
	if (split === null) return true;
	if (!Array.isArray(split) || split.length < 1 || split.length > 50) return false;
	return split.every((u) => inChat(ctx, u)) && new Set(split).size === split.length;
}
/** Net balance per member in cents: positive is owed to them, negative is what they owe. */
function balances(s, ctx) {
	const ids = ctx.members.map((m) => m.id);
	const out = {};
	ids.forEach((id) => out[id] = 0);
	for (const e of s.expenses) {
		const group = (e.split ?? ids).filter((u) => ids.includes(u));
		if (group.length === 0 || !ids.includes(e.payer)) continue;
		const base = Math.floor(e.cents / group.length);
		const extra = e.cents % group.length;
		group.forEach((u, i) => {
			out[u] = (out[u] ?? 0) - (base + (i < extra ? 1 : 0));
		});
		out[e.payer] = (out[e.payer] ?? 0) + e.cents;
	}
	for (const p of s.payments) {
		if (!ids.includes(p.from) || !ids.includes(p.to)) continue;
		out[p.from] = (out[p.from] ?? 0) + p.cents;
		out[p.to] = (out[p.to] ?? 0) - p.cents;
	}
	return out;
}
/** Greedy: the largest debtor pays the largest creditor, until all balances are zero. */
function settle(bal, ids) {
	const cred = ids.filter((u) => (bal[u] ?? 0) > 0).map((u) => ({
		id: u,
		c: bal[u] ?? 0
	}));
	const debt = ids.filter((u) => (bal[u] ?? 0) < 0).map((u) => ({
		id: u,
		c: -(bal[u] ?? 0)
	}));
	cred.sort((a, b) => b.c - a.c);
	debt.sort((a, b) => b.c - a.c);
	const out = [];
	let i = 0;
	let j = 0;
	while (i < cred.length && j < debt.length) {
		const c = cred[i];
		const d = debt[j];
		const t = Math.min(c.c, d.c);
		if (t > 0) out.push({
			from: d.id,
			to: c.id,
			cents: t
		});
		c.c -= t;
		d.c -= t;
		if (c.c === 0) i++;
		if (d.c === 0) j++;
	}
	return out;
}
const totalSpent = (s) => s.expenses.reduce((n, e) => n + e.cents, 0);
const sameRefs = (a, b) => a.length === b.length && a.every((x, i) => b[i] === x);
export default defineApp({
	name: "Bill split",
	summary: (s, ctx) => {
		const t = settle(balances(s, ctx), ctx.members.map((m) => m.id));
		return `${CHAT.title}: ${money(totalSpent(s))} spent · ${t.length === 0 ? "all settled" : t.length === 1 ? "1 payment to settle" : `${t.length} payments to settle`}`;
	},
	init: (ctx) => {
		if (ctx.members.length === 0) return {
			expenses: [],
			payments: []
		};
		const find = (name) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id;
		const expenses = CHAT.expenses.map((e, i) => {
			let split = null;
			if (e.split) {
				const ids = [...new Set(e.split.map((n) => find(n)).filter((x) => typeof x === "string"))];
				split = ids.length ? ids : null;
			}
			return {
				id: `x${i}`,
				label: e.label,
				cents: e.cents,
				payer: find(e.payer) ?? ctx.members[0].id,
				split
			};
		});
		return {
			expenses,
			payments: []
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		switch (action.t) {
			case "addExpense": {
				if (typeof action.label !== "string" || !isCents(action.cents)) return state;
				const label = clean(action.label);
				if (!label || label.length > MAX_LABEL || state.expenses.length >= MAX_ITEMS) return state;
				if (!validSplit(action.split, ctx)) return state;
				const split = action.split === null ? null : [...action.split];
				return {
					...state,
					expenses: [...state.expenses, {
						id: "e" + meta.seq,
						label,
						cents: action.cents,
						payer: meta.user,
						split
					}]
				};
			}
			case "removeExpense": {
				if (typeof action.id !== "string") return state;
				const e = state.expenses.find((x) => x.id === action.id);
				if (!e || e.payer !== meta.user) return state;
				return {
					...state,
					expenses: state.expenses.filter((x) => x.id !== e.id)
				};
			}
			case "pay": {
				if (typeof action.to !== "string" || !inChat(ctx, action.to) || action.to === meta.user) return state;
				if (!isCents(action.cents) || state.payments.length >= MAX_ITEMS) return state;
				return {
					...state,
					payments: [...state.payments, {
						id: "p" + meta.seq,
						from: meta.user,
						to: action.to,
						cents: action.cents
					}]
				};
			}
			case "undoPay": {
				if (typeof action.id !== "string") return state;
				const p = state.payments.find((x) => x.id === action.id);
				if (!p || p.from !== meta.user) return state;
				return {
					...state,
					payments: state.payments.filter((x) => x.id !== p.id)
				};
			}
		}
		return state;
	},
	// Someone left: their expenses and payments go, and they come off every split.
	onMembers: (state, ctx) => {
		let changed = false;
		const expenses = [];
		for (const e of state.expenses) {
			if (!inChat(ctx, e.payer)) {
				changed = true;
				continue;
			}
			if (e.split === null) {
				expenses.push(e);
				continue;
			}
			const sp = e.split.filter((u) => inChat(ctx, u));
			if (sp.length === e.split.length) expenses.push(e);
			else {
				changed = true;
				if (sp.length > 0) expenses.push({
					...e,
					split: sp
				});
			}
		}
		const payments = state.payments.filter((p) => inChat(ctx, p.from) && inChat(ctx, p.to));
		if (payments.length !== state.payments.length) changed = true;
		return changed ? {
			expenses,
			payments
		} : state;
	},
	invariants: {
		"every expense has whole cents, a trimmed label of 1 to 40 characters and its own id": (s) => s.expenses.every((e) => isCents(e.cents) && e.label.length > 0 && e.label.length <= MAX_LABEL && e.label === clean(e.label)) && new Set(s.expenses.map((e) => e.id)).size === s.expenses.length,
		"payers and split members are in the chat, once each, and a split is never empty": (s, ctx) => s.expenses.every((e) => inChat(ctx, e.payer) && (e.split === null || e.split.length > 0 && new Set(e.split).size === e.split.length && e.split.every((u) => inChat(ctx, u)))),
		"every payment has whole cents, two different people in the chat and its own id": (s, ctx) => s.payments.every((p) => isCents(p.cents) && p.from !== p.to && inChat(ctx, p.from) && inChat(ctx, p.to)) && new Set(s.payments.map((p) => p.id)).size === s.payments.length,
		"at most 12 expenses and 12 payments": (s) => s.expenses.length <= MAX_ITEMS && s.payments.length <= MAX_ITEMS,
		"balances add up to zero": (s, ctx) => Object.values(balances(s, ctx)).reduce((a, c) => a + c, 0) === 0
	},
	transitions: {
		"an added expense comes last, paid by the actor, as asked, and no payment changes": (p, n, a, m) => {
			if (a.t !== "addExpense" || p === n) return true;
			const last = n.expenses[n.expenses.length - 1];
			return n.expenses.length === p.expenses.length + 1 && sameRefs(p.expenses, n.expenses.slice(0, -1)) && !!last && last.payer === m.user && last.id === "e" + m.seq && last.cents === a.cents && last.label === clean(a.label) && JSON.stringify(last.split) === JSON.stringify(a.split) && n.payments === p.payments;
		},
		"only the payer removes an expense, and exactly that one goes": (p, n, a, m) => {
			if (a.t !== "removeExpense" || p === n) return true;
			return p.expenses.some((e) => e.id === a.id && e.payer === m.user) && n.expenses.every((e) => e.id !== a.id) && sameRefs(p.expenses.filter((e) => e.id !== a.id), n.expenses) && n.payments === p.payments;
		},
		"a payment is added last, from the actor, to the person and amount asked, and no expense changes": (p, n, a, m) => {
			if (a.t !== "pay" || p === n) return true;
			const last = n.payments[n.payments.length - 1];
			return n.payments.length === p.payments.length + 1 && sameRefs(p.payments, n.payments.slice(0, -1)) && !!last && last.from === m.user && last.to === a.to && last.cents === a.cents && last.id === "p" + m.seq && n.expenses === p.expenses;
		},
		"only the person who made a payment undoes it, and exactly that one goes": (p, n, a, m) => {
			if (a.t !== "undoPay" || p === n) return true;
			return p.payments.some((x) => x.id === a.id && x.from === m.user) && n.payments.every((x) => x.id !== a.id) && sameRefs(p.payments.filter((x) => x.id !== a.id), n.payments) && n.expenses === p.expenses;
		},
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r, ctx) => {
		const k = r.next();
		const others = ctx.members.filter((m) => m.id !== user);
		const addOne = () => ({
			t: "addExpense",
			label: r.pick([
				"Snacks",
				"Parking",
				"Coffee",
				"Ice",
				"  Beer run ",
				"Tolls",
				""
			]),
			cents: r.next() < .1 ? 0 : r.int(2e4) + 1,
			split: ctx.members.length === 0 || r.next() < .5 ? null : [r.pick(ctx.members).id]
		});
		const removeOne = () => {
			const mine = s.expenses.filter((e) => e.payer === user);
			const pool = mine.length ? mine : s.expenses;
			return pool.length ? {
				t: "removeExpense",
				id: r.pick(pool).id
			} : addOne();
		};
		const payOne = () => ({
			t: "pay",
			to: others.length ? r.pick(others).id : user,
			cents: r.int(8e3) + 1
		});
		const undoOne = () => {
			const mine = s.payments.filter((p) => p.from === user);
			const pool = mine.length ? mine : s.payments;
			return pool.length ? {
				t: "undoPay",
				id: r.pick(pool).id
			} : payOne();
		};
		if (k < .35) return s.expenses.length >= 10 ? removeOne() : addOne();
		if (k < .5) return removeOne();
		if (k < .85) return s.payments.length >= 10 ? undoOne() : payOne();
		return undoOne();
	},
	local: {
		panel: "settle",
		label: "",
		amount: "",
		pick: false,
		chosen: [],
		toast: 0,
		toastMsg: ""
	},
	view: ({ state, me, members, dispatch, local, setLocal }) => {
		const ctx = { members };
		const ids = members.map((m) => m.id);
		const nameOf = (id) => id === me ? "You" : members.find((m) => m.id === id)?.name ?? "Someone";
		const bal = balances(state, ctx);
		const transfers = settle(bal, ids);
		const mine = transfers.filter((t) => t.from === me);
		const ordered = [...mine, ...transfers.filter((t) => t.from !== me)];
		const shown = ordered.slice(0, 4);
		const hidden = ordered.length - shown.length;
		const note = (msg) => setLocal({
			toast: local.toast + 1,
			toastMsg: msg
		});
		const cents = parseCents(local.amount);
		const chosen = local.chosen.filter((u) => ids.includes(u));
		const label = clean(local.label);
		const canAdd = label.length > 0 && label.length <= MAX_LABEL && cents !== null && (!local.pick || chosen.length > 0) && state.expenses.length < MAX_ITEMS;
		const submit = () => {
			if (!canAdd || cents === null) return;
			dispatch({
				t: "addExpense",
				label,
				cents,
				split: local.pick ? chosen : null
			});
			setLocal({
				panel: "list",
				label: "",
				amount: "",
				pick: false,
				chosen: [],
				toast: local.toast + 1,
				toastMsg: "Expense added"
			});
		};
		const lastExpenses = state.expenses.slice(-3);
		const earlier = state.expenses.length - lastExpenses.length;
		const myPayments = state.payments.filter((p) => p.from === me);
		const myLast = myPayments[myPayments.length - 1];
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: CHAT.title,
				subtitle: `${members.length} people · ${money(totalSpent(state))} spent`
			}),
			local.panel === "settle" ? /* @__PURE__ */ _jsxs("div", { children: [
				/* @__PURE__ */ _jsx("div", {
					style: {
						minHeight: 24,
						display: "flex",
						alignItems: "center"
					},
					children: /* @__PURE__ */ _jsx("small", { children: state.expenses.length === 0 ? "No expenses yet" : transfers.length === 0 ? "All settled" : mine.length === 0 ? "You're settled" : mine.length === 1 ? "You have 1 payment to make" : `You have ${mine.length} payments to make` })
				}),
				/* @__PURE__ */ _jsx("div", {
					style: {
						display: "grid",
						gap: 0
					},
					children: shown.map((t, i) => /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: 44
						},
						children: [
							/* @__PURE__ */ _jsx(Avatar, {
								user: t.from,
								size: 28
							}),
							/* @__PURE__ */ _jsxs("div", {
								style: {
									flex: 1,
									minWidth: 0
								},
								children: [
									t.from === me ? `You pay ${nameOf(t.to)}` : `${nameOf(t.from)} pays ${t.to === me ? "you" : nameOf(t.to)}`,
									" · ",
									money(t.cents)
								]
							}),
							t.from === me ? /* @__PURE__ */ _jsx(Button, {
								kind: i === 0 ? "primary" : "secondary",
								onClick: () => {
									dispatch({
										t: "pay",
										to: t.to,
										cents: t.cents
									});
									note("Payment noted");
								},
								children: "I paid"
							}) : null
						]
					}, `${t.from}-${t.to}`))
				}),
				hidden > 0 ? /* @__PURE__ */ _jsxs("small", { children: [hidden, " more"] }) : null
			] }) : null,
			local.panel === "list" ? /* @__PURE__ */ _jsxs("div", { children: [
				/* @__PURE__ */ _jsx("div", {
					style: {
						display: "grid",
						gap: 0,
						marginTop: 4
					},
					children: lastExpenses.map((e) => /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: 44
						},
						children: [
							/* @__PURE__ */ _jsx(Avatar, {
								user: e.payer,
								size: 28
							}),
							/* @__PURE__ */ _jsxs("div", {
								style: {
									flex: 1,
									minWidth: 0
								},
								children: [/* @__PURE__ */ _jsx("div", {
									style: {
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
										fontWeight: 600
									},
									children: e.label
								}), /* @__PURE__ */ _jsxs("small", {
									style: {
										display: "block",
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap"
									},
									children: [
										money(e.cents),
										" · ",
										e.payer === me ? "you paid" : `${nameOf(e.payer)} paid`,
										" · ",
										e.split === null ? "split all" : `split ${e.split.length}`
									]
								})]
							}),
							e.payer === me ? /* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => dispatch({
									t: "removeExpense",
									id: e.id
								}),
								children: "Remove"
							}) : null
						]
					}, e.id))
				}),
				earlier > 0 ? /* @__PURE__ */ _jsxs("small", { children: [earlier, " earlier"] }) : null,
				myLast ? /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						minHeight: 44
					},
					children: [/* @__PURE__ */ _jsx("div", {
						style: {
							flex: 1,
							minWidth: 0
						},
						children: /* @__PURE__ */ _jsxs("small", { children: [
							"Your last payment · ",
							money(myLast.cents),
							" to ",
							nameOf(myLast.to)
						] })
					}), /* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						onClick: () => dispatch({
							t: "undoPay",
							id: myLast.id
						}),
						children: "Undo"
					})]
				}) : null
			] }) : null,
			local.panel === "add" ? /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 8,
					marginTop: 4
				},
				children: [
					/* @__PURE__ */ _jsxs("div", {
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
							placeholder: "What for",
							"aria-label": "What for",
							onInput: (e) => setLocal({ label: e.currentTarget.value })
						}), /* @__PURE__ */ _jsx("input", {
							style: { width: 96 },
							value: local.amount,
							inputMode: "decimal",
							placeholder: "Amount",
							"aria-label": "Amount",
							onInput: (e) => setLocal({ amount: e.currentTarget.value })
						})]
					}),
					/* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							gap: 8
						},
						children: [/* @__PURE__ */ _jsx(Button, {
							kind: local.pick ? "deemphasized" : "secondary",
							onClick: () => setLocal({ pick: false }),
							children: "Everyone"
						}), /* @__PURE__ */ _jsx(Button, {
							kind: local.pick ? "secondary" : "deemphasized",
							onClick: () => setLocal({ pick: true }),
							children: "Pick people"
						})]
					}),
					local.pick ? /* @__PURE__ */ _jsx("div", {
						style: {
							display: "flex",
							flexWrap: "wrap",
							gap: 8
						},
						children: members.map((m) => /* @__PURE__ */ _jsx(Button, {
							kind: chosen.includes(m.id) ? "secondary" : "deemphasized",
							onClick: () => setLocal({ chosen: chosen.includes(m.id) ? chosen.filter((u) => u !== m.id) : [...chosen, m.id] }),
							children: chosen.includes(m.id) ? `${m.name} ✓` : m.name
						}, m.id))
					}) : null,
					/* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							gap: 8
						},
						children: [/* @__PURE__ */ _jsx(Button, {
							kind: "secondary",
							disabled: !canAdd,
							onClick: submit,
							children: "Add"
						}), /* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							onClick: () => setLocal({ panel: "settle" }),
							children: "Cancel"
						})]
					})
				]
			}) : null,
			local.panel !== "add" ? /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					flexWrap: "wrap",
					gap: 8,
					marginTop: 8
				},
				children: [local.panel === "list" ? /* @__PURE__ */ _jsx(Button, {
					kind: "secondary",
					onClick: () => setLocal({ panel: "settle" }),
					children: "Settle up"
				}) : /* @__PURE__ */ _jsx(Button, {
					kind: "deemphasized",
					onClick: () => setLocal({ panel: "list" }),
					children: "Expenses"
				}), /* @__PURE__ */ _jsx(Button, {
					kind: "deemphasized",
					onClick: () => setLocal({ panel: "add" }),
					children: "Add expense"
				})]
			}) : null,
			local.toast > 0 ? /* @__PURE__ */ _jsx(Toast, { children: local.toastMsg }, local.toast) : null
		] });
	}
});
