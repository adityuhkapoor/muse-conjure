import { defineApp, Avatar, Button, CardHeader, Toast } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Bill split for the lake house weekend. Everyone pays an even share of the total; the app shows
// the fewest Venmo payments that settle it (biggest debtor pays the biggest creditor, repeat).
const CHAT = {
	title: "Lake house weekend",
	expenses: [
		{
			payer: "Maya",
			label: "Kayak rental",
			cents: 6e3
		},
		{
			payer: "Leo",
			label: "Lake house",
			cents: 24e3
		},
		{
			payer: "Sofia",
			label: "Groceries at Publix",
			cents: 8600
		},
		{
			payer: "Nora",
			label: "Gas",
			cents: 5400
		},
		{
			payer: "Felix",
			label: "Firewood and beer",
			cents: 3800
		},
		{
			payer: "Jess",
			label: "Pizza on Saturday night",
			cents: 4200
		}
	]
};
const MAX_EXPENSES = 12;
const MAX_LABEL = 40;
const MAX_CENTS = 1e6;
const MAX_ROWS = 7;
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const clean = (s) => s.trim().replace(/\s+/g, " ");
const key = (from, to) => `${from}>${to}`;
const money = (c) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
// ---- Reducer side ----
/** Paid minus even share, per member in order. Leftover cents go to the first members. */
function nets(expenses, members) {
	const n = members.length;
	if (n === 0) return [];
	const total = expenses.reduce((a, e) => a + e.cents, 0);
	const base = Math.floor(total / n);
	const extra = total % n;
	return members.map((m, i) => expenses.filter((e) => e.payer === m.id).reduce((a, e) => a + e.cents, 0) - base - (i < extra ? 1 : 0));
}
/** Greedy: biggest debtor pays biggest creditor; ties go to the earlier member. */
function settle(expenses, members) {
	const left = nets(expenses, members);
	const out = [];
	for (let guard = 0; guard < 64; guard++) {
		let d = -1;
		let c = -1;
		for (let i = 0; i < left.length; i++) {
			const v = left[i];
			if (v < 0 && (d < 0 || v < left[d])) d = i;
			if (v > 0 && (c < 0 || v > left[c])) c = i;
		}
		if (d < 0 || c < 0) break;
		const cents = Math.min(-left[d], left[c]);
		out.push({
			from: members[d].id,
			to: members[c].id,
			cents
		});
		left[d] = left[d] + cents;
		left[c] = left[c] - cents;
	}
	return out;
}
// ---- Check side (written separately from the reducer's helpers) ----
function owedCheck(s, ctx) {
	const n = ctx.members.length;
	if (n === 0) return [];
	const total = s.expenses.reduce((a, e) => a + e.cents, 0);
	const base = Math.floor(total / n);
	return ctx.members.map((m, i) => {
		let paid = 0;
		for (const e of s.expenses) if (e.payer === m.id) paid += e.cents;
		return paid - base - (i < total - base * n ? 1 : 0);
	});
}
const toggled = (p, n, k) => {
	const had = p.sent.includes(k);
	return had ? n.sent.length === p.sent.length - 1 && !n.sent.includes(k) && p.sent.every((x) => x === k || n.sent.includes(x)) : n.sent.length === p.sent.length + 1 && n.sent.includes(k) && p.sent.every((x) => n.sent.includes(x));
};
export default defineApp({
	name: "Bill split",
	summary: (s, ctx) => {
		const total = s.expenses.reduce((a, e) => a + e.cents, 0);
		const pays = settle(s.expenses, ctx.members);
		const done = pays.filter((p) => s.sent.includes(key(p.from, p.to))).length;
		if (!s.expenses.length) return `${s.title} · no expenses yet`;
		if (!pays.length) return `${s.title} · ${money(total)} · everyone is even`;
		return `${s.title} · ${money(total)} · ${done} of ${pays.length} sent`;
	},
	init: (ctx) => {
		const idOf = (name) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id ?? ctx.members[0]?.id;
		const expenses = [];
		CHAT.expenses.forEach((x, i) => {
			const payer = idOf(x.payer);
			if (!payer || expenses.length >= MAX_EXPENSES) return;
			expenses.push({
				id: `p${i}`,
				label: x.label.slice(0, MAX_LABEL),
				payer,
				cents: x.cents
			});
		});
		return {
			title: CHAT.title,
			expenses,
			sent: []
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "add") {
			if (typeof action.label !== "string" || typeof action.cents !== "number") return state;
			if (!Number.isInteger(action.cents) || action.cents < 1 || action.cents > MAX_CENTS) return state;
			const label = clean(action.label);
			if (!label || label.length > MAX_LABEL || state.expenses.length >= MAX_EXPENSES) return state;
			return {
				...state,
				expenses: [...state.expenses, {
					id: `e${meta.seq}`,
					label,
					payer: meta.user,
					cents: action.cents
				}],
				sent: []
			};
		}
		if (action.t === "remove") {
			if (typeof action.id !== "string") return state;
			const e = state.expenses.find((x) => x.id === action.id);
			if (!e || e.payer !== meta.user) return state;
			return {
				...state,
				expenses: state.expenses.filter((x) => x.id !== e.id),
				sent: []
			};
		}
		if (action.t === "sent") {
			if (typeof action.to !== "string" || !inChat(ctx, action.to)) return state;
			const k = key(meta.user, action.to);
			if (!settle(state.expenses, ctx.members).some((p) => key(p.from, p.to) === k)) return state;
			return {
				...state,
				sent: state.sent.includes(k) ? state.sent.filter((x) => x !== k) : [...state.sent, k]
			};
		}
		return state;
	},
	// Someone left: their expenses go and the marks are cleared. Someone joined: the shares change,
	// so marks that no longer match a payment are dropped.
	onMembers: (state, ctx) => {
		const expenses = state.expenses.filter((e) => inChat(ctx, e.payer));
		if (expenses.length !== state.expenses.length) return {
			...state,
			expenses,
			sent: []
		};
		const keys = settle(expenses, ctx.members).map((p) => key(p.from, p.to));
		const sent = state.sent.filter((k) => keys.includes(k));
		return sent.length === state.sent.length ? state : {
			...state,
			sent
		};
	},
	invariants: {
		"expenses are whole positive cents with unique ids, at most 12": (s) => s.expenses.length <= MAX_EXPENSES && new Set(s.expenses.map((e) => e.id)).size === s.expenses.length && s.expenses.every((e) => Number.isInteger(e.cents) && e.cents > 0 && e.label.length > 0 && e.label.length <= MAX_LABEL),
		"every expense payer is in the chat": (s, ctx) => s.expenses.every((e) => inChat(ctx, e.payer)),
		"everyone's balance adds up to zero": (s, ctx) => owedCheck(s, ctx).reduce((a, c) => a + c, 0) === 0,
		"the payments leave every person exactly even": (s, ctx) => {
			const net = owedCheck(s, ctx);
			const pays = settle(s.expenses, ctx.members);
			return ctx.members.every((m, i) => {
				const got = pays.filter((p) => p.to === m.id).reduce((a, p) => a + p.cents, 0);
				const gave = pays.filter((p) => p.from === m.id).reduce((a, p) => a + p.cents, 0);
				return got - gave === net[i];
			});
		},
		"no one both pays and receives, and there are at most members minus one payments": (s, ctx) => {
			const pays = settle(s.expenses, ctx.members);
			return pays.length <= Math.max(0, ctx.members.length - 1) && pays.every((p) => p.cents > 0 && p.from !== p.to && !pays.some((q) => q.to === p.from));
		},
		"sent marks are unique and match current payments between people in the chat": (s, ctx) => {
			const keys = settle(s.expenses, ctx.members).map((p) => key(p.from, p.to));
			return new Set(s.sent).size === s.sent.length && s.sent.every((k) => keys.includes(k));
		}
	},
	transitions: {
		"an add appends one expense paid by the actor and clears sent": (p, n, a, m) => {
			if (a.t !== "add" || p === n) return true;
			const last = n.expenses.at(-1);
			return n.expenses.length === p.expenses.length + 1 && p.expenses.every((e, i) => n.expenses[i] === e) && !!last && last.payer === m.user && last.cents === a.cents && last.label === clean(a.label) && last.id === `e${m.seq}` && n.sent.length === 0;
		},
		"a remove deletes exactly that expense and clears sent": (p, n, a) => {
			if (a.t !== "remove" || p === n) return true;
			return n.expenses.length === p.expenses.length - 1 && p.expenses.some((e) => e.id === a.id) && !n.expenses.some((e) => e.id === a.id) && n.expenses.every((e) => p.expenses.includes(e)) && n.sent.length === 0;
		},
		"only the payer can remove an expense": (p, n, a, m) => a.t !== "remove" || p === n || p.expenses.some((e) => e.id === a.id && e.payer === m.user),
		"a sent mark toggles only the actor's own payment and leaves expenses alone": (p, n, a, m) => a.t !== "sent" || p === n || toggled(p, n, key(m.user, String(a.to))) && JSON.stringify(p.expenses) === JSON.stringify(n.expenses),
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
		"the title never changes": (p, n) => p.title === n.title
	},
	arbitrary: (s, user, r, ctx) => {
		const k = r.next();
		const mine = settle(s.expenses, ctx.members).filter((p) => p.from === user);
		if (k < .3 && mine.length) return {
			t: "sent",
			to: r.pick(mine).to
		};
		if (k < .38 && ctx.members.length) return {
			t: "sent",
			to: r.pick(ctx.members).id
		};
		if (k < .53 && s.expenses.length) {
			const own = s.expenses.filter((e) => e.payer === user);
			return {
				t: "remove",
				id: (own.length ? r.pick(own) : r.pick(s.expenses)).id
			};
		}
		return {
			t: "add",
			label: r.pick([
				"Gas",
				"Parking",
				"Snacks",
				"Ice",
				"Boat fuel",
				"  ",
				""
			]),
			cents: r.next() < .1 ? 0 : r.int(9e3) + 1
		};
	},
	local: {
		adding: false,
		listing: false,
		label: "",
		amount: "",
		toast: 0
	},
	view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
		const nameOf = (id) => id === me ? "You" : members.find((m) => m.id === id)?.name ?? "Someone";
		const pays = settle(state.expenses, members);
		const total = state.expenses.reduce((a, e) => a + e.cents, 0);
		const each = members.length ? Math.floor(total / members.length) : 0;
		const isSent = (p) => state.sent.includes(key(p.from, p.to));
		const done = pays.filter(isSent).length;
		const myIndex = members.findIndex((m) => m.id === me);
		const net = myIndex >= 0 ? nets(state.expenses, members)[myIndex] ?? 0 : 0;
		const ordered = [...pays.filter((p) => p.from === me), ...pays.filter((p) => p.from !== me)];
		const rows = ordered.slice(0, MAX_ROWS);
		const firstMine = ordered.find((p) => p.from === me && !isSent(p));
		const cents = (() => {
			const m = /^\$?\s*(\d{1,4})(?:\.(\d{1,2}))?$/.exec(local.amount.trim().replace(/,/g, ""));
			return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")) : 0;
		})();
		const canSave = cents > 0 && cents <= MAX_CENTS && clean(local.label).length > 0 && state.expenses.length < MAX_EXPENSES;
		const save = () => {
			if (!canSave) return;
			dispatch({
				t: "add",
				label: clean(local.label).slice(0, MAX_LABEL),
				cents
			});
			setLocal({
				adding: false,
				label: "",
				amount: "",
				toast: local.toast + 1
			});
		};
		const subtitle = !state.expenses.length ? "No expenses yet" : !pays.length ? `${money(total)} · everyone is even` : `${money(total)} · ${money(each)} each · ${done} of ${pays.length} sent`;
		const mineLine = !state.expenses.length ? "Add what you paid" : net > 0 ? `You get ${money(net)}` : net < 0 ? `You owe ${money(-net)}` : "You're settled";
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle
			}),
			local.listing ? /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 0
				},
				children: [state.expenses.length === 0 ? /* @__PURE__ */ _jsx("small", { children: "No expenses yet" }) : null, state.expenses.map((e) => /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						minHeight: e.payer === me ? 44 : 32
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
							children: [
								/* @__PURE__ */ _jsx("span", { children: e.label }),
								" ",
								/* @__PURE__ */ _jsx("b", {
									style: { fontWeight: 600 },
									children: money(e.cents)
								})
							]
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
				}, e.id))]
			}) : /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx("div", {
				style: { padding: "2px 0 4px" },
				children: /* @__PURE__ */ _jsx("small", { children: mineLine })
			}), /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 0
				},
				children: [rows.map((p) => {
					const k = key(p.from, p.to);
					const mineRow = p.from === me;
					const sentAlready = isSent(p);
					return /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: mineRow ? 44 : 32
						},
						children: [
							/* @__PURE__ */ _jsx(Avatar, {
								user: p.from,
								size: 24
							}),
							/* @__PURE__ */ _jsxs("div", {
								style: {
									flex: 1,
									minWidth: 0
								},
								children: [
									/* @__PURE__ */ _jsx("span", { children: `${nameOf(p.from)} ${mineRow ? "pay" : "pays"} ${p.to === me ? "you" : nameOf(p.to)}` }),
									" ",
									/* @__PURE__ */ _jsx("b", {
										style: { fontWeight: 600 },
										children: money(p.cents)
									})
								]
							}),
							sentAlready ? /* @__PURE__ */ _jsx("small", {
								style: {
									color: theme.color.positive,
									fontWeight: 600
								},
								children: "Sent"
							}) : mineRow ? /* @__PURE__ */ _jsx(Button, {
								kind: firstMine && firstMine.to === p.to ? "primary" : "secondary",
								onClick: () => dispatch({
									t: "sent",
									to: p.to
								}),
								children: "Sent"
							}) : null
						]
					}, k);
				}), ordered.length > rows.length ? /* @__PURE__ */ _jsx("small", { children: `${ordered.length - rows.length} more` }) : null]
			})] }),
			local.adding ? /* @__PURE__ */ _jsxs("form", {
				style: {
					display: "grid",
					gridTemplateColumns: "1fr 88px auto",
					gap: 8,
					marginTop: 8
				},
				onSubmit: (e) => {
					e.preventDefault();
					save();
				},
				children: [
					/* @__PURE__ */ _jsx("input", {
						value: local.label,
						maxLength: MAX_LABEL,
						placeholder: "What for",
						"aria-label": "What you paid for",
						onInput: (e) => setLocal({ label: e.currentTarget.value })
					}),
					/* @__PURE__ */ _jsx("input", {
						value: local.amount,
						inputMode: "decimal",
						placeholder: "$0.00",
						"aria-label": "Amount",
						onInput: (e) => setLocal({ amount: e.currentTarget.value })
					}),
					/* @__PURE__ */ _jsx(Button, {
						kind: "secondary",
						disabled: !canSave,
						onClick: save,
						children: "Add"
					})
				]
			}) : null,
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					gap: 8,
					marginTop: 8
				},
				children: [/* @__PURE__ */ _jsx("div", {
					style: {
						flex: 1,
						display: "flex"
					},
					children: /* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						wide: true,
						onClick: () => setLocal({
							listing: !local.listing,
							adding: false
						}),
						children: local.listing ? "Back" : `${state.expenses.length} expenses`
					})
				}), /* @__PURE__ */ _jsx("div", {
					style: {
						flex: 1,
						display: "flex"
					},
					children: /* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						wide: true,
						onClick: () => setLocal({
							adding: !local.adding,
							listing: false
						}),
						children: local.adding ? "Cancel" : "Add expense"
					})
				})]
			}),
			local.toast ? /* @__PURE__ */ _jsx(Toast, { children: "Expense added" }, local.toast) : null
		] });
	}
});
