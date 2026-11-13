import { defineApp, Avatar, Button, CardHeader, Facepile, Toast } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Bill split. Expenses with a payer and the people sharing them; the card works out the fewest
// payments, and the person being paid taps "Got it" when the money arrives.
const CHAT = {
	title: "Who owes who",
	expenses: [
		{
			label: "Uber 1",
			cents: 4160,
			payer: "Noor",
			people: [
				"Noor",
				"Priya",
				"Owen",
				"Hana"
			]
		},
		{
			label: "Uber 2",
			cents: 2700,
			payer: "Jess",
			people: [
				"Jess",
				"Sam",
				"Eli"
			]
		},
		{
			label: "2am pizza",
			cents: 1400,
			payer: "Noor",
			people: [
				"Jess",
				"Priya",
				"Owen",
				"Sam",
				"Noor",
				"Hana",
				"Eli"
			]
		}
	]
};
const MAX_EXPENSES = 8;
const MAX_PAID = 12;
const MAX_LABEL = 40;
const MAX_CENTS = 1e7;
const clean = (s) => s.trim().replace(/\s+/g, " ");
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fmt = (c) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
function parseCents(raw) {
	const t = raw.trim().replace(/^\$/, "");
	const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(t);
	if (!m) return 0;
	return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}
/** floor(cents / n) each, leftover cents one each to the first people in list order. */
function shares(e) {
	const n = e.people.length;
	if (n === 0) return [];
	const base = Math.floor(e.cents / n);
	const rem = e.cents - base * n;
	return e.people.map((_, i) => base + (i < rem ? 1 : 0));
}
/** Positive: is owed. Negative: owes. */
function nets(s) {
	const n = {};
	const bump = (id, d) => {
		n[id] = (n[id] ?? 0) + d;
	};
	for (const e of s.expenses) {
		bump(e.payer, e.cents);
		const sh = shares(e);
		e.people.forEach((p, i) => bump(p, -(sh[i] ?? 0)));
	}
	for (const x of s.paid) {
		bump(x.from, x.cents);
		bump(x.to, -x.cents);
	}
	return n;
}
function settle(s) {
	const n = nets(s);
	const ids = Object.keys(n).sort();
	const debt = ids.filter((i) => (n[i] ?? 0) < 0).map((id) => ({
		id,
		c: -(n[id] ?? 0)
	}));
	const cred = ids.filter((i) => (n[i] ?? 0) > 0).map((id) => ({
		id,
		c: n[id] ?? 0
	}));
	const out = [];
	while (debt.length && cred.length) {
		debt.sort((a, b) => b.c - a.c || (a.id < b.id ? -1 : 1));
		cred.sort((a, b) => b.c - a.c || (a.id < b.id ? -1 : 1));
		const d = debt[0];
		const c = cred[0];
		const amt = Math.min(d.c, c.c);
		out.push({
			from: d.id,
			to: c.id,
			cents: amt
		});
		d.c -= amt;
		c.c -= amt;
		if (d.c === 0) debt.shift();
		if (c.c === 0) cred.shift();
	}
	return out;
}
const pairTotal = (s, from, to) => s.paid.filter((x) => x.from === from && x.to === to).reduce((n, x) => n + x.cents, 0);
const paidTotal = (s) => s.paid.reduce((n, x) => n + x.cents, 0);
function toggle(s, user, id) {
	if (typeof id !== "string") return s;
	const e = s.expenses.find((x) => x.id === id);
	if (!e) return s;
	const has = e.people.includes(user);
	if (has && e.people.length === 1) return s;
	const people = has ? e.people.filter((p) => p !== user) : [...e.people, user];
	return {
		...s,
		expenses: s.expenses.map((x) => x.id === e.id ? {
			...x,
			people
		} : x)
	};
}
function add(s, user, label, cents, seq, everyone) {
	if (typeof label !== "string" || typeof cents !== "number") return s;
	const l = clean(label);
	if (!l || l.length > MAX_LABEL) return s;
	if (!Number.isInteger(cents) || cents < 1 || cents > MAX_CENTS) return s;
	if (s.expenses.length >= MAX_EXPENSES) return s;
	return {
		...s,
		expenses: [...s.expenses, {
			id: `e${seq}`,
			label: l,
			cents,
			payer: user,
			people: everyone
		}]
	};
}
function received(s, user, from, cents, ctx) {
	if (typeof from !== "string" || typeof cents !== "number") return s;
	if (!inChat(ctx, from) || from === user) return s;
	if (!Number.isInteger(cents) || cents < 1) return s;
	const n = nets(s);
	if (-(n[from] ?? 0) < cents || (n[user] ?? 0) < cents) return s;
	const i = s.paid.findIndex((x) => x.from === from && x.to === user);
	if (i < 0 && s.paid.length >= MAX_PAID) return s;
	const paid = i >= 0 ? s.paid.map((x, j) => j === i ? {
		...x,
		cents: x.cents + cents
	} : x) : [...s.paid, {
		from,
		to: user,
		cents
	}];
	return {
		...s,
		paid
	};
}
export default defineApp({
	name: "Bill split",
	summary: (s) => {
		if (s.expenses.length === 0) return `${CHAT.title}. No expenses yet.`;
		const n = settle(s).length;
		if (n === 0) return `${CHAT.title}. All settled.`;
		return `${CHAT.title}. ${n} ${n === 1 ? "payment" : "payments"} left.`;
	},
	init: (ctx) => {
		const find = (name) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id;
		const expenses = [];
		for (const e of CHAT.expenses) {
			const payer = find(e.payer);
			if (!payer) continue;
			const people = [];
			for (const name of e.people) {
				const id = find(name);
				if (id && !people.includes(id)) people.push(id);
			}
			if (people.length === 0 || expenses.length >= MAX_EXPENSES) continue;
			expenses.push({
				id: `x${expenses.length}`,
				label: e.label.slice(0, MAX_LABEL),
				cents: e.cents,
				payer,
				people
			});
		}
		return {
			expenses,
			paid: []
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		switch (action.t) {
			case "toggle": return toggle(state, meta.user, action.expense);
			case "add": return add(state, meta.user, action.label, action.cents, meta.seq, ctx.members.map((m) => m.id));
			case "received": return received(state, meta.user, action.from, action.cents, ctx);
		}
		return state;
	},
	onMembers: (s, ctx) => {
		let changed = false;
		const expenses = [];
		for (const e of s.expenses) {
			if (!inChat(ctx, e.payer)) {
				changed = true;
				continue;
			}
			const people = e.people.filter((p) => inChat(ctx, p));
			if (people.length === 0) {
				changed = true;
				continue;
			}
			if (people.length !== e.people.length) {
				changed = true;
				expenses.push({
					...e,
					people
				});
			} else expenses.push(e);
		}
		const paid = s.paid.filter((x) => inChat(ctx, x.from) && inChat(ctx, x.to));
		if (paid.length !== s.paid.length) changed = true;
		return changed ? {
			expenses,
			paid
		} : s;
	},
	invariants: {
		"every expense has a positive amount, a payer in the chat, people, and no repeats": (s, ctx) => s.expenses.every((e) => Number.isInteger(e.cents) && e.cents >= 1 && inChat(ctx, e.payer) && e.people.length > 0 && new Set(e.people).size === e.people.length),
		"everyone sharing an expense is in the chat": (s, ctx) => s.expenses.every((e) => e.people.every((p) => inChat(ctx, p))),
		"shares of each expense add up to its amount": (s) => s.expenses.every((e) => shares(e).reduce((n, x) => n + x, 0) === e.cents),
		"balances add up to zero": (s) => Object.values(nets(s)).reduce((n, x) => n + x, 0) === 0,
		"each confirmed payment is positive, between two people in the chat, one entry per pair": (s, ctx) => s.paid.length <= MAX_PAID && s.paid.every((x) => Number.isInteger(x.cents) && x.cents >= 1 && x.from !== x.to && inChat(ctx, x.from) && inChat(ctx, x.to)) && new Set(s.paid.map((x) => `${x.from}|${x.to}`)).size === s.paid.length,
		"at most 8 expenses, unique ids, labels of 1 to 40 characters": (s) => s.expenses.length <= MAX_EXPENSES && new Set(s.expenses.map((e) => e.id)).size === s.expenses.length && s.expenses.every((e) => e.label.length >= 1 && e.label.length <= MAX_LABEL && e.label === clean(e.label))
	},
	transitions: {
		"a toggle flips only the actor in that expense and changes nothing else": (p, n, a, m) => {
			if (a.t !== "toggle" || p === n) return true;
			if (!same(p.paid, n.paid) || p.expenses.length !== n.expenses.length) return false;
			return p.expenses.every((e, i) => {
				const x = n.expenses[i];
				if (e.id !== a.expense) return same(e, x);
				const others = (xs) => xs.filter((u) => u !== m.user).join();
				return x.id === e.id && x.label === e.label && x.cents === e.cents && x.payer === e.payer && others(e.people) === others(x.people) && e.people.includes(m.user) !== x.people.includes(m.user);
			});
		},
		"an add appends one expense paid by the actor, shared by everyone, and changes nothing else": (p, n, a, m, ctx) => {
			if (a.t !== "add" || p === n) return true;
			const last = n.expenses[n.expenses.length - 1];
			return !!last && n.expenses.length === p.expenses.length + 1 && same(n.expenses.slice(0, -1), p.expenses) && last.id === `e${m.seq}` && last.payer === m.user && last.cents === a.cents && typeof a.label === "string" && last.label === clean(a.label) && same(last.people, ctx.members.map((x) => x.id)) && n.paid.length >= p.paid.length - 0 && same(n.paid, p.paid);
		},
		"a received step adds exactly that amount from the payer to the actor, only the receiver records it": (p, n, a, m) => {
			if (a.t !== "received" || p === n) return true;
			if (typeof a.from !== "string" || typeof a.cents !== "number" || a.from === m.user) return false;
			return n.expenses === p.expenses && paidTotal(n) === paidTotal(p) + a.cents && pairTotal(n, a.from, m.user) === pairTotal(p, a.from, m.user) + a.cents;
		},
		"existing expenses keep their label, amount and payer": (p, n) => p.expenses.every((e) => {
			const x = n.expenses.find((y) => y.id === e.id);
			return !x || x.label === e.label && x.cents === e.cents && x.payer === e.payer;
		}),
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r, ctx) => {
		const net = nets(s);
		const k = r.next();
		if (k < .3 && (net[user] ?? 0) > 0) {
			const debtors = Object.keys(net).sort().filter((i) => (net[i] ?? 0) < 0);
			if (debtors.length) {
				const d = r.pick(debtors);
				return {
					t: "received",
					from: d,
					cents: Math.min(-(net[d] ?? 0), net[user] ?? 0)
				};
			}
		}
		if (k < .6 && s.expenses.length) return {
			t: "toggle",
			expense: r.pick(s.expenses).id
		};
		if (k < .85 || s.expenses.length === 0) return {
			t: "add",
			label: r.pick([
				"Tickets",
				"Drinks",
				" snacks ",
				"",
				"Parking",
				"Coffee"
			]),
			cents: r.pick([
				1250,
				4e3,
				999,
				0,
				8500,
				300
			])
		};
		const other = ctx.members.length ? r.pick(ctx.members).id : user;
		return {
			t: "received",
			from: other,
			cents: r.int(5e3) + 1
		};
	},
	local: {
		open: false,
		label: "",
		amount: "",
		toast: 0
	},
	view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
		const nameOf = (id) => members.find((m) => m.id === id)?.name ?? "Someone";
		const lines = settle(state);
		const isMine = (l) => l.from === me || l.to === me;
		const ordered = [...lines.filter(isMine), ...lines.filter((l) => !isMine(l))];
		const shown = ordered.slice(0, 4);
		const hidden = lines.length - shown.length;
		const cents = parseCents(local.amount);
		const canAdd = clean(local.label).length > 0 && cents >= 1 && cents <= MAX_CENTS && state.expenses.length < MAX_EXPENSES;
		const subtitle = state.expenses.length === 0 ? "No expenses yet" : lines.length === 0 ? "All settled" : `${lines.length} ${lines.length === 1 ? "payment" : "payments"} left`;
		const submit = () => {
			if (!canAdd) return;
			dispatch({
				t: "add",
				label: local.label.slice(0, MAX_LABEL),
				cents
			});
			setLocal({
				open: false,
				label: "",
				amount: "",
				toast: local.toast + 1
			});
		};
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: CHAT.title,
				subtitle
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 0
				},
				children: state.expenses.map((e) => {
					const mine = e.people.includes(me);
					return /* @__PURE__ */ _jsxs("div", {
						role: "button",
						"aria-label": `${e.label}, ${fmt(e.cents)}. ${mine ? "Tap to leave" : "Tap to join"}`,
						onClick: () => dispatch({
							t: "toggle",
							expense: e.id
						}),
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: 44,
							padding: "0 8px",
							borderRadius: theme.radius.button,
							cursor: "pointer",
							...mine ? { background: theme.color.selected } : {}
						},
						children: [/* @__PURE__ */ _jsxs("div", {
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
							}), /* @__PURE__ */ _jsx("small", {
								style: {
									display: "block",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap"
								},
								children: `${fmt(e.cents)} · paid by ${e.payer === me ? "you" : nameOf(e.payer)}`
							})]
						}), /* @__PURE__ */ _jsx(Facepile, {
							users: e.people,
							max: 3,
							size: 20
						})]
					}, e.id);
				})
			}),
			lines.length ? /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 0,
					marginTop: 8
				},
				children: [shown.map((l) => /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						minHeight: 38,
						padding: "0 8px",
						borderRadius: theme.radius.button,
						...isMine(l) ? { background: theme.color.selected } : {}
					},
					children: [
						/* @__PURE__ */ _jsx(Avatar, {
							user: l.from,
							size: 20
						}),
						/* @__PURE__ */ _jsx("div", {
							style: {
								flex: 1,
								minWidth: 0
							},
							children: `${l.from === me ? "You pay" : `${nameOf(l.from)} pays`} ${l.to === me ? "you" : nameOf(l.to)} · ${fmt(l.cents)}`
						}),
						l.to === me ? /* @__PURE__ */ _jsx(Button, {
							kind: "secondary",
							onClick: () => dispatch({
								t: "received",
								from: l.from,
								cents: l.cents
							}),
							children: "Got it"
						}) : null
					]
				}, `${l.from}-${l.to}`)), hidden > 0 ? /* @__PURE__ */ _jsx("small", {
					style: { padding: "0 8px" },
					children: `${hidden} more`
				}) : null]
			}) : null,
			/* @__PURE__ */ _jsx("div", {
				style: { marginTop: 8 },
				children: local.open ? /* @__PURE__ */ _jsxs("form", {
					onSubmit: (e) => {
						e.preventDefault();
						submit();
					},
					style: {
						display: "grid",
						gap: 8
					},
					children: [/* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							gap: 8
						},
						children: [/* @__PURE__ */ _jsx("input", {
							value: local.label,
							maxLength: MAX_LABEL,
							placeholder: "What for",
							"aria-label": "What for",
							onInput: (e) => setLocal({ label: e.currentTarget.value })
						}), /* @__PURE__ */ _jsx("input", {
							value: local.amount,
							maxLength: 10,
							placeholder: "Amount",
							"aria-label": "Amount",
							inputMode: "decimal",
							onInput: (e) => setLocal({ amount: e.currentTarget.value })
						})]
					}), /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							gap: 8
						},
						children: [/* @__PURE__ */ _jsx("div", {
							style: {
								flex: 1,
								display: "flex"
							},
							children: /* @__PURE__ */ _jsx(Button, {
								kind: "primary",
								wide: true,
								disabled: !canAdd,
								onClick: submit,
								children: "Add"
							})
						}), /* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							onClick: () => setLocal({
								open: false,
								label: "",
								amount: ""
							}),
							children: "Cancel"
						})]
					})]
				}) : /* @__PURE__ */ _jsx(Button, {
					kind: "primary",
					wide: true,
					disabled: state.expenses.length >= MAX_EXPENSES,
					onClick: () => setLocal({ open: true }),
					children: "Add expense"
				})
			}),
			local.toast ? /* @__PURE__ */ _jsx(Toast, { children: "Expense added" }, local.toast) : null
		] });
	}
});
