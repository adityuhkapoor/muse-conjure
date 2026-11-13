import { defineApp, Avatar, Button, CardHeader, SystemLine } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Sakura House bill, split by item. Tax and tip are shared in proportion to each person's items.
// Everyone pays the person who put their card down and marks when they have.
const BILL = {
	title: "Sakura House bill",
	payerName: "paige",
	totalCents: 14260,
	taxCents: 1140,
	tipPct: 20,
	items: [
		{
			label: "Spicy tuna roll",
			cents: 1400,
			owner: "dani",
			shared: false
		},
		{
			label: "Miso soup",
			cents: 400,
			owner: "dani",
			shared: false
		},
		{
			label: "Mochi",
			cents: 700,
			owner: "dani",
			shared: false
		},
		{
			label: "Matcha latte",
			cents: 500,
			owner: "dani",
			shared: false
		},
		{
			label: "Dragon roll",
			cents: 1700,
			owner: "june",
			shared: false
		},
		{
			label: "Chirashi bowl",
			cents: 2400,
			owner: "gabe",
			shared: false
		},
		{
			label: "Sapporo",
			cents: 800,
			owner: "gabe",
			shared: false
		},
		{
			label: "Katsu curry",
			cents: 1800,
			owner: "paige",
			shared: false
		},
		{
			label: "Sapporo",
			cents: 800,
			owner: "paige",
			shared: false
		},
		{
			label: "Edamame",
			cents: 600,
			owner: "",
			shared: true
		},
		{
			label: "Gyoza",
			cents: 1e3,
			owner: "",
			shared: true
		}
	]
};
const MAX_ITEMS = 12;
const MAX_LABEL = 40;
const MAX_CENTS = 1e5;
const MAX_TIP = 40;
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const clean = (s) => s.trim().replace(/\s+/g, " ");
const same = (a, b) => a.join("|") === b.join("|");
const money = (c) => `${c < 0 ? "-" : ""}$${Math.floor(Math.abs(c) / 100)}.${String(Math.abs(c) % 100).padStart(2, "0")}`;
const tipCents = (s) => Math.floor((s.totalCents - s.taxCents) * s.tipPct / 100);
const hasOwner = (s, item, user) => s.items.some((i) => i.id === item && i.owners.includes(user));
function parseCents(text) {
	const m = /^\$?\s*(\d{1,4})(?:\.(\d{1,2}))?$/.exec(text.trim());
	if (!m) return null;
	const c = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
	return c >= 1 && c <= MAX_CENTS ? c : null;
}
/** Item subtotals per person, and what each owes once tax and tip are shared in proportion. */
function split(s, ids) {
	const sub = {};
	for (const u of ids) sub[u] = 0;
	for (const it of s.items) {
		const who = it.shared ? ids : it.owners.filter((u) => ids.includes(u));
		const n = who.length;
		if (n === 0) continue;
		const base = Math.floor(it.cents / n);
		const extra = it.cents % n;
		who.forEach((u, i) => {
			sub[u] = (sub[u] ?? 0) + base + (i < extra ? 1 : 0);
		});
	}
	const people = ids.filter((u) => (sub[u] ?? 0) > 0);
	const totalSub = people.reduce((a, u) => a + (sub[u] ?? 0), 0);
	const owe = {};
	for (const u of ids) owe[u] = sub[u] ?? 0;
	if (totalSub === 0) return {
		sub,
		owe
	};
	const extraTotal = s.taxCents + tipCents(s);
	const parts = people.map((u) => Math.floor(extraTotal * (sub[u] ?? 0) / totalSub));
	const rem = extraTotal - parts.reduce((a, c) => a + c, 0);
	const order = people.map((_, i) => i).sort((x, y) => (sub[people[y]] ?? 0) - (sub[people[x]] ?? 0) || x - y);
	for (let k = 0; k < rem; k++) {
		const i = order[k % order.length];
		parts[i] = parts[i] + 1;
	}
	people.forEach((u, i) => {
		owe[u] = (sub[u] ?? 0) + parts[i];
	});
	return {
		sub,
		owe
	};
}
const idsOf = (ctx) => ctx.members.map((m) => m.id);
export default defineApp({
	name: "Bill split",
	summary: (s, ctx) => {
		const owers = idsOf(ctx).filter((u) => u !== s.payer);
		const back = owers.filter((u) => s.paid.includes(u)).length;
		return `${BILL.title} · ${money(s.totalCents)} · ${back} of ${owers.length} paid back`;
	},
	init: (ctx) => {
		const find = (name) => name ? ctx.members.find((m) => m.name.toLowerCase() === name)?.id : undefined;
		const payer = find(BILL.payerName) ?? ctx.members[0]?.id ?? "";
		const items = BILL.items.map((i, n) => {
			const owner = i.shared ? undefined : find(i.owner);
			return {
				id: `p${n}`,
				label: i.label,
				cents: i.cents,
				shared: i.shared,
				owners: owner ? [owner] : []
			};
		});
		return {
			payer,
			totalCents: BILL.totalCents,
			taxCents: BILL.taxCents,
			tipPct: BILL.tipPct,
			items,
			paid: []
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		switch (action.t) {
			case "claim": {
				if (typeof action.item !== "string") return state;
				const it = state.items.find((i) => i.id === action.item);
				if (!it || it.shared) return state;
				const owners = it.owners.includes(meta.user) ? it.owners.filter((u) => u !== meta.user) : [...it.owners, meta.user];
				return {
					...state,
					items: state.items.map((i) => i.id === it.id ? {
						...i,
						owners
					} : i)
				};
			}
			case "add": {
				if (typeof action.label !== "string" || typeof action.shared !== "boolean") return state;
				if (typeof action.cents !== "number" || !Number.isInteger(action.cents) || action.cents < 1 || action.cents > MAX_CENTS) return state;
				const label = clean(action.label);
				if (!label || label.length > MAX_LABEL || state.items.length >= MAX_ITEMS) return state;
				const item = {
					id: `i${meta.seq}`,
					label,
					cents: action.cents,
					shared: action.shared,
					owners: action.shared ? [] : [meta.user]
				};
				return {
					...state,
					items: [...state.items, item]
				};
			}
			case "remove": {
				if (typeof action.item !== "string" || meta.user !== state.payer) return state;
				if (!state.items.some((i) => i.id === action.item)) return state;
				return {
					...state,
					items: state.items.filter((i) => i.id !== action.item)
				};
			}
			case "tip": {
				if (meta.user !== state.payer || typeof action.pct !== "number" || !Number.isInteger(action.pct)) return state;
				if (action.pct < 0 || action.pct > MAX_TIP || action.pct === state.tipPct) return state;
				return {
					...state,
					tipPct: action.pct
				};
			}
			case "paid": {
				if (meta.user === state.payer) return state;
				const paid = state.paid.includes(meta.user) ? state.paid.filter((u) => u !== meta.user) : [...state.paid, meta.user];
				return {
					...state,
					paid
				};
			}
		}
		return state;
	},
	// Someone left: they come off items and the paid list. If the payer left, the first person in the chat is paid.
	onMembers: (state, ctx) => {
		const payer = inChat(ctx, state.payer) ? state.payer : idsOf(ctx)[0] ?? "";
		const itemsOk = state.items.every((i) => i.owners.every((u) => inChat(ctx, u)));
		const paid = state.paid.filter((u) => inChat(ctx, u) && u !== payer);
		if (payer === state.payer && itemsOk && paid.length === state.paid.length) return state;
		return {
			...state,
			payer,
			items: itemsOk ? state.items : state.items.map((i) => i.owners.every((u) => inChat(ctx, u)) ? i : {
				...i,
				owners: i.owners.filter((u) => inChat(ctx, u))
			}),
			paid
		};
	},
	invariants: {
		"owners and people who paid back are in the chat": (s, ctx) => s.paid.every((u) => inChat(ctx, u)) && s.items.every((i) => i.owners.every((u) => inChat(ctx, u))),
		"ids and owners are unique, and a shared item has no owners": (s) => new Set(s.items.map((i) => i.id)).size === s.items.length && new Set(s.paid).size === s.paid.length && s.items.every((i) => new Set(i.owners).size === i.owners.length && (!i.shared || i.owners.length === 0)),
		"at most 12 items, each with a label of 1 to 40 characters and whole cents": (s) => s.items.length <= MAX_ITEMS && s.items.every((i) => i.label.length > 0 && i.label.length <= MAX_LABEL && i.label === clean(i.label) && Number.isInteger(i.cents) && i.cents >= 1 && i.cents <= MAX_CENTS),
		"tip is a whole number from 0 to 40 and tax is within the total": (s) => Number.isInteger(s.tipPct) && s.tipPct >= 0 && s.tipPct <= MAX_TIP && Number.isInteger(s.taxCents) && s.taxCents >= 0 && s.taxCents <= s.totalCents,
		"the payer is in the chat and never in the paid list": (s, ctx) => (ctx.members.length === 0 || inChat(ctx, s.payer)) && !s.paid.includes(s.payer),
		"what people owe adds up to their items plus tax and tip": (s, ctx) => {
			const { sub, owe } = split(s, idsOf(ctx));
			const subTotal = Object.values(sub).reduce((a, c) => a + c, 0);
			const oweTotal = Object.values(owe).reduce((a, c) => a + c, 0);
			return oweTotal === subTotal + (subTotal > 0 ? s.taxCents + tipCents(s) : 0);
		}
	},
	transitions: {
		"a claim flips only the actor on that one item": (p, n, a, m) => a.t !== "claim" || p === n || hasOwner(p, a.item, m.user) !== hasOwner(n, a.item, m.user) && p.items.length === n.items.length && p.items.every((i, j) => {
			const k = n.items[j];
			const owners = i.id === a.item ? same(i.owners.filter((u) => u !== m.user), k.owners.filter((u) => u !== m.user)) : same(i.owners, k.owners);
			return k.id === i.id && k.cents === i.cents && k.shared === i.shared && k.label === i.label && owners;
		}) && same(p.paid, n.paid) && p.tipPct === n.tipPct && p.payer === n.payer,
		"an add appends one item with the label, price and owner given": (p, n, a, m) => {
			if (a.t !== "add" || p === n) return true;
			const last = n.items.at(-1);
			return typeof a.label === "string" && !!last && n.items.length === p.items.length + 1 && p.items.every((i, j) => n.items[j] === i) && last.id === `i${m.seq}` && last.label === clean(a.label) && last.cents === a.cents && last.shared === a.shared && same(last.owners, a.shared ? [] : [m.user]);
		},
		"only the payer removes an item, and exactly that one goes": (p, n, a, m) => {
			if (a.t !== "remove" || p === n) return true;
			const rest = p.items.filter((i) => i.id !== a.item);
			return m.user === p.payer && rest.length === p.items.length - 1 && n.items.length === rest.length && n.items.every((i, j) => i === rest[j]);
		},
		"only the payer sets the tip, and nothing else changes": (p, n, a, m) => a.t !== "tip" || p === n || m.user === p.payer && n.tipPct === a.pct && n.items === p.items && same(p.paid, n.paid) && n.payer === p.payer,
		"a paid mark flips only the actor, and never the payer": (p, n, a, m) => a.t !== "paid" || p === n || m.user !== p.payer && p.paid.includes(m.user) !== n.paid.includes(m.user) && same(p.paid.filter((u) => u !== m.user), n.paid.filter((u) => u !== m.user)) && n.items === p.items && n.tipPct === p.tipPct,
		"only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		const k = r.next();
		const open = s.items.filter((i) => !i.shared);
		if (k < .3 && open.length) return {
			t: "claim",
			item: r.pick(open).id
		};
		if (k < .5) return {
			t: "add",
			label: r.pick([
				"Tempura",
				"Udon",
				"Soda",
				"",
				"Ice cream"
			]),
			cents: r.pick([
				500,
				1200,
				0,
				350
			]),
			shared: r.next() < .3
		};
		if (k < .62) return {
			t: "tip",
			pct: r.pick([
				15,
				18,
				20,
				25,
				50
			])
		};
		if (k < .72 && s.items.length) return {
			t: "remove",
			item: r.pick(s.items).id
		};
		return { t: "paid" };
	},
	local: {
		open: false,
		label: "",
		price: "",
		shared: false
	},
	view: ({ state, me, members, dispatch, local, setLocal }) => {
		const ids = members.map((m) => m.id);
		const { owe } = split(state, ids);
		const payerName = members.find((m) => m.id === state.payer)?.name ?? "the payer";
		const isPayer = me === state.payer;
		const owers = ids.filter((u) => u !== state.payer);
		const back = owers.filter((u) => state.paid.includes(u)).length;
		const unclaimed = state.items.filter((i) => !i.shared && i.owners.length === 0).reduce((a, i) => a + i.cents, 0);
		const gap = state.totalCents - state.taxCents - state.items.reduce((a, i) => a + i.cents, 0);
		const ordered = [...members].sort((x, y) => (x.id === me ? -1 : 0) - (y.id === me ? -1 : 0));
		const cents = parseCents(local.price);
		const label = clean(local.label);
		const canAdd = cents !== null && label.length > 0 && label.length <= MAX_LABEL && state.items.length < MAX_ITEMS;
		const submit = () => {
			if (!canAdd || cents === null) return;
			dispatch({
				t: "add",
				label,
				cents,
				shared: local.shared
			});
			setLocal({
				label: "",
				price: ""
			});
		};
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: BILL.title,
				subtitle: `${back} of ${owers.length} paid back · to ${payerName}`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 4
				},
				children: ordered.map((m) => {
					const paid = state.paid.includes(m.id);
					const isMe = m.id === me;
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
								size: 32
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
									children: isMe ? "You" : m.name
								}), /* @__PURE__ */ _jsx("small", { children: m.id === state.payer ? "Paid the bill" : isMe ? `You owe ${payerName}` : `Owes ${payerName}` })]
							}),
							/* @__PURE__ */ _jsx("div", {
								style: { fontWeight: 600 },
								children: money(owe[m.id] ?? 0)
							}),
							m.id === state.payer ? null : isMe ? /* @__PURE__ */ _jsx(Button, {
								kind: paid ? "deemphasized" : "primary",
								onClick: () => dispatch({ t: "paid" }),
								children: paid ? "Undo" : "I paid"
							}) : /* @__PURE__ */ _jsx("small", {
								style: {
									minWidth: 44,
									textAlign: "right"
								},
								children: paid ? "Paid" : "Not yet"
							})
						]
					}, m.id);
				})
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: { marginTop: 8 },
				children: [
					/* @__PURE__ */ _jsx("small", { children: `Bill ${money(state.totalCents)} · tax ${money(state.taxCents)} · tip ${money(tipCents(state))}` }),
					unclaimed > 0 ? /* @__PURE__ */ _jsx("div", { children: /* @__PURE__ */ _jsx("small", { children: `Unclaimed ${money(unclaimed)}` }) }) : null,
					gap > 0 ? /* @__PURE__ */ _jsx("div", { children: /* @__PURE__ */ _jsx("small", { children: `${money(gap)} not on any item` }) }) : null,
					gap < 0 ? /* @__PURE__ */ _jsx("div", { children: /* @__PURE__ */ _jsx("small", { children: `Items are ${money(-gap)} over the bill` }) }) : null
				]
			}),
			/* @__PURE__ */ _jsx("div", {
				style: { marginTop: 8 },
				children: /* @__PURE__ */ _jsx(Button, {
					kind: "deemphasized",
					wide: true,
					onClick: () => setLocal({ open: !local.open }),
					children: local.open ? "Hide items" : "Items"
				})
			}),
			local.open ? /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 4,
					marginTop: 8
				},
				children: [
					state.items.map((i) => /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: 44
						},
						children: [
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
									children: i.label
								}), /* @__PURE__ */ _jsx("small", { children: i.shared ? `${money(i.cents)} · shared ${members.length} ways` : i.owners.length ? `${money(i.cents)} · ${i.owners.map((u) => u === me ? "you" : members.find((m) => m.id === u)?.name ?? "someone").join(", ")}` : `${money(i.cents)} · no one yet` })]
							}),
							i.shared ? null : /* @__PURE__ */ _jsx(Button, {
								kind: "secondary",
								onClick: () => dispatch({
									t: "claim",
									item: i.id
								}),
								children: i.owners.includes(me) ? "Mine" : "Had it"
							}),
							isPayer ? /* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => dispatch({
									t: "remove",
									item: i.id
								}),
								children: "Remove"
							}) : null
						]
					}, i.id)),
					isPayer ? /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							flexWrap: "wrap"
						},
						children: [/* @__PURE__ */ _jsx("small", { children: "Tip rate" }), [
							15,
							18,
							20,
							25
						].map((pct) => /* @__PURE__ */ _jsx(Button, {
							kind: state.tipPct === pct ? "secondary" : "deemphasized",
							onClick: () => dispatch({
								t: "tip",
								pct
							}),
							children: String(pct)
						}, pct))]
					}) : null,
					state.items.length < MAX_ITEMS ? /* @__PURE__ */ _jsxs("form", {
						style: {
							display: "flex",
							gap: 8,
							flexWrap: "wrap",
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
									minWidth: 120
								},
								value: local.label,
								maxLength: MAX_LABEL,
								placeholder: "Item",
								"aria-label": "Item name",
								onInput: (e) => setLocal({ label: e.currentTarget.value })
							}),
							/* @__PURE__ */ _jsx("input", {
								style: { width: 80 },
								value: local.price,
								inputMode: "decimal",
								placeholder: "Price",
								"aria-label": "Item price",
								onInput: (e) => setLocal({ price: e.currentTarget.value })
							}),
							/* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => setLocal({ shared: !local.shared }),
								children: local.shared ? "Shared" : "Just me"
							}),
							/* @__PURE__ */ _jsx(Button, {
								kind: "secondary",
								disabled: !canAdd,
								onClick: submit,
								children: "Add"
							})
						]
					}) : /* @__PURE__ */ _jsx(SystemLine, { children: "12 items is the limit" })
				]
			}) : null
		] });
	}
});
