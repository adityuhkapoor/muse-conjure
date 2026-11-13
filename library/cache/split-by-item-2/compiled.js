import { defineApp, Avatar, Button, CardHeader } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Diner bill split. Items belong to one person or are shared by everyone in the chat.
// Tax and tip are spread in proportion to each person's items, in whole cents.
const CONTENT = {
	title: "Split the diner bill",
	payer: "Sam",
	taxCents: 935,
	tipPct: 18,
	note: "Felix took 2 bacon strips · not charged",
	items: [
		{
			label: "Chicken and waffles",
			cents: 1500,
			owner: "Kev"
		},
		{
			label: "Coke",
			cents: 300,
			owner: "Kev"
		},
		{
			label: "Pancake stack",
			cents: 1200,
			owner: "Ana"
		},
		{
			label: "Side bacon",
			cents: 500,
			owner: "Ana"
		},
		{
			label: "Veggie omelette",
			cents: 1300,
			owner: "Nora"
		},
		{
			label: "OJ",
			cents: 400,
			owner: "Nora"
		},
		{
			label: "Double cheeseburger",
			cents: 1600,
			owner: "Felix"
		},
		{
			label: "Patty melt",
			cents: 1400,
			owner: "Sam"
		},
		{
			label: "Chocolate shake",
			cents: 700,
			owner: "Sam"
		},
		{
			label: "Greek salad",
			cents: 1100,
			owner: "Maya"
		},
		{
			label: "Two coffees",
			cents: 600,
			owner: "Maya"
		},
		{
			label: "Fries for the table",
			cents: 800,
			owner: null
		},
		{
			label: "Mozz sticks for the table",
			cents: 900,
			owner: null
		}
	]
};
const MAX_ITEMS = 16;
const MAX_LABEL = 40;
const MAX_CENTS = 1e5;
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const clean = (s) => s.trim().replace(/\s+/g, " ");
const money = (c) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
const itemsTotal = (s) => s.items.reduce((a, i) => a + i.cents, 0);
const tipOf = (s) => Math.floor(itemsTotal(s) * s.tipPct / 100);
const grand = (s) => itemsTotal(s) + s.taxCents + tipOf(s);
function parseCents(text) {
	const m = /^\$?\s*(\d{1,4})(?:\.(\d{1,2}))?$/.exec(text.trim());
	return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")) : null;
}
/** Each person's items and total, in cents. Tax and tip follow item subtotals; leftover cents go to the first people. */
function shares(s, ids) {
	const n = ids.length;
	const out = {};
	if (n === 0) return out;
	const sub = {};
	ids.forEach((u) => sub[u] = 0);
	for (const it of s.items) {
		if (it.owner !== null && ids.includes(it.owner)) {
			sub[it.owner] = (sub[it.owner] ?? 0) + it.cents;
		} else {
			const base = Math.floor(it.cents / n);
			const extra = it.cents % n;
			ids.forEach((u, i) => {
				sub[u] = (sub[u] ?? 0) + base + (i < extra ? 1 : 0);
			});
		}
	}
	const base = itemsTotal(s);
	const extra = s.taxCents + tipOf(s);
	const add = ids.map((u) => base > 0 ? Math.floor((sub[u] ?? 0) * extra / base) : Math.floor(extra / n));
	let left = extra - add.reduce((a, c) => a + c, 0);
	for (let i = 0; left > 0; i = (i + 1) % n) {
		add[i] = (add[i] ?? 0) + 1;
		left--;
	}
	ids.forEach((u, i) => {
		out[u] = {
			items: sub[u] ?? 0,
			total: (sub[u] ?? 0) + (add[i] ?? 0)
		};
	});
	return out;
}
const hasPaid = (s, u) => s.paid.includes(u);
const restPaid = (s, u) => s.paid.filter((x) => x !== u).join();
const itemOf = (s, id) => s.items.find((i) => i.id === id);
const othersSame = (p, n, id) => p.items.length === n.items.length && p.items.every((it, i) => it.id === id || n.items[i] === it);
export default defineApp({
	name: "Bill split",
	summary: (s, ctx) => {
		const owers = ctx.members.filter((m) => m.id !== s.payer);
		const sent = owers.filter((m) => s.paid.includes(m.id)).length;
		const name = ctx.members.find((m) => m.id === s.payer)?.name ?? "someone";
		return `${CONTENT.title} · ${money(grand(s))} · ${sent} of ${owers.length} sent to ${name}`;
	},
	init: (ctx) => {
		const byName = (name) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id ?? null;
		const payer = byName(CONTENT.payer) ?? ctx.members[0]?.id ?? "";
		const items = CONTENT.items.map((i, n) => {
			const owner = i.owner === null ? null : byName(i.owner);
			return {
				id: `p${n}`,
				label: i.label.slice(0, MAX_LABEL),
				cents: i.cents,
				owner,
				shared: owner === null
			};
		});
		return {
			payer,
			taxCents: CONTENT.taxCents,
			tipPct: CONTENT.tipPct,
			items,
			paid: []
		};
	},
	reduce: (s, a, m, ctx) => {
		if (!inChat(ctx, m.user)) return s;
		switch (a.t) {
			case "paid": {
				if (m.user === s.payer) return s;
				return {
					...s,
					paid: hasPaid(s, m.user) ? s.paid.filter((u) => u !== m.user) : [...s.paid, m.user]
				};
			}
			case "share": {
				const it = itemOf(s, a.item);
				if (typeof a.item !== "string" || !it || it.owner !== m.user) return s;
				return {
					...s,
					items: s.items.map((i) => i.id === it.id ? {
						...i,
						owner: null,
						shared: true
					} : i)
				};
			}
			case "claim": {
				const it = itemOf(s, a.item);
				if (typeof a.item !== "string" || !it || !it.shared) return s;
				return {
					...s,
					items: s.items.map((i) => i.id === it.id ? {
						...i,
						owner: m.user,
						shared: false
					} : i)
				};
			}
			case "add": {
				if (typeof a.label !== "string" || typeof a.cents !== "number" || !Number.isInteger(a.cents)) return s;
				const label = clean(a.label);
				if (!label || label.length > MAX_LABEL || a.cents < 1 || a.cents > MAX_CENTS || s.items.length >= MAX_ITEMS) return s;
				return {
					...s,
					items: [...s.items, {
						id: `i${m.seq}`,
						label,
						cents: a.cents,
						owner: m.user,
						shared: false
					}]
				};
			}
			case "remove": {
				const it = itemOf(s, a.item);
				if (typeof a.item !== "string" || !it || it.owner !== m.user && m.user !== s.payer) return s;
				return {
					...s,
					items: s.items.filter((i) => i.id !== it.id)
				};
			}
		}
		return s;
	},
	// Someone left: their items become shared, their sent mark goes, and the payer role passes on if needed.
	onMembers: (s, ctx) => {
		const payer = inChat(ctx, s.payer) ? s.payer : ctx.members[0]?.id ?? "";
		const paid = s.paid.filter((u) => inChat(ctx, u) && u !== payer);
		const stale = s.items.some((i) => i.owner !== null && !inChat(ctx, i.owner));
		if (payer === s.payer && paid.length === s.paid.length && !stale) return s;
		return {
			...s,
			payer,
			paid,
			items: stale ? s.items.map((i) => i.owner !== null && !inChat(ctx, i.owner) ? {
				...i,
				owner: null,
				shared: true
			} : i) : s.items
		};
	},
	invariants: {
		"item ids are unique and prices are whole positive cents": (s) => new Set(s.items.map((i) => i.id)).size === s.items.length && s.items.every((i) => Number.isInteger(i.cents) && i.cents > 0 && i.cents <= MAX_CENTS),
		"a shared item has no owner and an owned item is not shared": (s) => s.items.every((i) => i.shared ? i.owner === null : i.owner !== null),
		"owners and people who sent are in the chat": (s, ctx) => s.items.every((i) => i.owner === null || inChat(ctx, i.owner)) && s.paid.every((u) => inChat(ctx, u)),
		"the payer is in the chat and never marks sent": (s, ctx) => (s.payer === "" ? ctx.members.length === 0 : inChat(ctx, s.payer)) && !s.paid.includes(s.payer) && new Set(s.paid).size === s.paid.length,
		"shares add up to items plus tax plus tip": (s, ctx) => {
			const sh = shares(s, ctx.members.map((m) => m.id));
			const vals = Object.values(sh);
			return vals.every((v) => v.total >= v.items && Number.isInteger(v.total)) && vals.reduce((a, v) => a + v.total, 0) === (ctx.members.length ? grand(s) : 0);
		},
		"at most 16 items, labels 1 to 40 characters, tax and tip sane": (s) => s.items.length <= MAX_ITEMS && s.items.every((i) => i.label.length > 0 && i.label.length <= MAX_LABEL && i.label === clean(i.label)) && Number.isInteger(s.taxCents) && s.taxCents >= 0 && Number.isInteger(s.tipPct) && s.tipPct >= 0 && s.tipPct <= 100
	},
	transitions: {
		"sent flips only the actor, never the payer": (p, n, a, m) => a.t !== "paid" || p === n || m.user !== p.payer && hasPaid(p, m.user) !== hasPaid(n, m.user) && restPaid(p, m.user) === restPaid(n, m.user) && p.items === n.items,
		"share is by the owner and moves one item to everyone": (p, n, a, m) => {
			if (a.t !== "share" || p === n) return true;
			const before = itemOf(p, a.item);
			const after = itemOf(n, a.item);
			return !!before && !!after && before.owner === m.user && after.owner === null && after.shared && after.cents === before.cents && othersSame(p, n, a.item);
		},
		"claim gives one shared item to the actor": (p, n, a, m) => {
			if (a.t !== "claim" || p === n) return true;
			const before = itemOf(p, a.item);
			const after = itemOf(n, a.item);
			return !!before && !!after && before.shared && after.owner === m.user && !after.shared && after.cents === before.cents && othersSame(p, n, a.item);
		},
		"add appends one item owned by the actor at the price asked": (p, n, a, m) => {
			if (a.t !== "add" || p === n) return true;
			const last = n.items.at(-1);
			return n.items.length === p.items.length + 1 && p.items.every((x, i) => n.items[i] === x) && !!last && last.id === `i${m.seq}` && last.owner === m.user && !last.shared && last.cents === a.cents && last.label === clean(a.label);
		},
		"remove drops one item, by its owner or the payer": (p, n, a, m) => {
			if (a.t !== "remove" || p === n) return true;
			const before = itemOf(p, a.item);
			const rest = p.items.filter((i) => i.id !== a.item);
			return !!before && (before.owner === m.user || m.user === p.payer) && !itemOf(n, a.item) && n.items.length === rest.length && rest.every((x, i) => n.items[i] === x);
		},
		"only people in the chat change anything, and payer, tax and tip stay": (p, n, _a, m, ctx) => p.payer === n.payer && p.taxCents === n.taxCents && p.tipPct === n.tipPct && (p === n || inChat(ctx, m.user))
	},
	arbitrary: (s, _user, r) => {
		const k = r.next();
		if (k < .3) return { t: "paid" };
		if (k < .45 && s.items.length) return {
			t: "claim",
			item: r.pick(s.items).id
		};
		if (k < .6 && s.items.length) return {
			t: "share",
			item: r.pick(s.items).id
		};
		if (k < .85) return {
			t: "add",
			label: r.pick([
				"Pie",
				"Wings",
				"Toast",
				"",
				"  Milkshake "
			]),
			cents: r.pick([
				0,
				450,
				725,
				1200,
				2999
			])
		};
		if (s.items.length) return {
			t: "remove",
			item: r.pick(s.items).id
		};
		return { t: "paid" };
	},
	local: {
		open: false,
		label: "",
		amount: ""
	},
	view: ({ state, me, members, dispatch, local, setLocal }) => {
		const ids = members.map((m) => m.id);
		const sh = shares(state, ids);
		const nameOf = (id) => id === null ? "Shared" : id === me ? "You" : members.find((m) => m.id === id)?.name ?? "Someone";
		const owers = ids.filter((u) => u !== state.payer);
		const sent = owers.filter((u) => state.paid.includes(u)).length;
		const owed = owers.filter((u) => !state.paid.includes(u)).reduce((a, u) => a + (sh[u]?.total ?? 0), 0);
		const payerName = members.find((m) => m.id === state.payer)?.name ?? "someone";
		const order = [...ids.filter((u) => u === me), ...ids.filter((u) => u !== me)];
		const mine = sh[me];
		const iPaid = state.paid.includes(me);
		const isPayer = me === state.payer;
		const cents = parseCents(local.amount);
		const label = clean(local.label);
		const canAdd = label.length > 0 && label.length <= MAX_LABEL && cents !== null && cents > 0 && state.items.length < MAX_ITEMS;
		const submit = () => {
			if (!canAdd || cents === null) return;
			dispatch({
				t: "add",
				label,
				cents
			});
			setLocal({
				label: "",
				amount: ""
			});
		};
		if (local.open) {
			const rows = state.items.filter((i) => i.shared || i.owner === me);
			return /* @__PURE__ */ _jsxs("div", { children: [
				/* @__PURE__ */ _jsx(CardHeader, {
					title: "Items",
					subtitle: `Yours and shared · ${money(itemsTotal(state))} before tax`
				}),
				/* @__PURE__ */ _jsx("div", {
					style: {
						display: "grid",
						gap: 2
					},
					children: rows.map((i) => /* @__PURE__ */ _jsxs("div", {
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
									style: { fontWeight: 600 },
									children: i.label
								}), /* @__PURE__ */ _jsx("small", { children: `${money(i.cents)} · ${i.shared ? "split 6 ways" : "yours"}`.replace("6", String(Math.max(1, members.length))) })]
							}),
							i.shared ? /* @__PURE__ */ _jsx(Button, {
								kind: "secondary",
								onClick: () => dispatch({
									t: "claim",
									item: i.id
								}),
								children: "Take"
							}) : /* @__PURE__ */ _jsx(Button, {
								kind: "secondary",
								onClick: () => dispatch({
									t: "share",
									item: i.id
								}),
								children: "Share"
							}),
							/* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => dispatch({
									t: "remove",
									item: i.id
								}),
								children: "Remove"
							})
						]
					}, i.id))
				}),
				/* @__PURE__ */ _jsx("small", {
					style: {
						display: "block",
						marginTop: 4
					},
					children: CONTENT.note
				}),
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
							value: local.label,
							maxLength: MAX_LABEL,
							placeholder: "Item",
							"aria-label": "Item name",
							onInput: (e) => setLocal({ label: e.currentTarget.value })
						}),
						/* @__PURE__ */ _jsx("input", {
							style: { width: 84 },
							value: local.amount,
							inputMode: "decimal",
							placeholder: "0.00",
							"aria-label": "Item price",
							onInput: (e) => setLocal({ amount: e.currentTarget.value })
						}),
						/* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							disabled: !canAdd,
							onClick: submit,
							children: "Add"
						})
					]
				}),
				/* @__PURE__ */ _jsx("div", {
					style: { marginTop: 8 },
					children: /* @__PURE__ */ _jsx(Button, {
						kind: "secondary",
						wide: true,
						onClick: () => setLocal({ open: false }),
						children: "Done"
					})
				})
			] });
		}
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: CONTENT.title,
				subtitle: `${money(grand(state))} · ${sent} of ${owers.length} sent to ${payerName}`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 2
				},
				children: order.map((u) => /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						minHeight: 34
					},
					children: [
						/* @__PURE__ */ _jsx(Avatar, {
							user: u,
							size: 28
						}),
						/* @__PURE__ */ _jsx("div", {
							style: {
								flex: 1,
								minWidth: 0,
								fontWeight: 600,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap"
							},
							children: nameOf(u)
						}),
						/* @__PURE__ */ _jsx("small", {
							style: {
								minWidth: 48,
								textAlign: "right"
							},
							children: u === state.payer ? "Paid" : state.paid.includes(u) ? "Sent" : "Waiting"
						}),
						/* @__PURE__ */ _jsx("div", {
							style: {
								minWidth: 60,
								textAlign: "right",
								fontWeight: 600
							},
							children: money(sh[u]?.total ?? 0)
						})
					]
				}, u))
			}),
			/* @__PURE__ */ _jsx("small", {
				style: {
					display: "block",
					marginTop: 6
				},
				children: mine ? `Your items ${money(mine.items)} · tax and tip ${money(mine.total - mine.items)}` : "Waiting for people"
			}),
			/* @__PURE__ */ _jsx("small", {
				style: { display: "block" },
				children: `Tip ${money(tipOf(state))} on pre-tax · tax ${money(state.taxCents)}`
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginTop: 8
				},
				children: [
					isPayer ? /* @__PURE__ */ _jsx("div", {
						style: {
							flex: 1,
							minWidth: 0,
							fontWeight: 600
						},
						children: owed > 0 ? `You are owed ${money(owed)}` : "Everyone has sent"
					}) : iPaid ? /* @__PURE__ */ _jsx(Button, {
						kind: "secondary",
						onClick: () => dispatch({ t: "paid" }),
						children: "Undo"
					}) : /* @__PURE__ */ _jsx(Button, {
						kind: "primary",
						onClick: () => dispatch({ t: "paid" }),
						children: "Sent it"
					}),
					isPayer ? null : /* @__PURE__ */ _jsx("div", { style: { flex: 1 } }),
					/* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						onClick: () => setLocal({ open: true }),
						children: "Items"
					})
				]
			})
		] });
	}
});
