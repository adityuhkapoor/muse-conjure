import { defineApp, Avatar, Button, CardHeader, Toast } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Rent split: each room has a rent in cents that must add up to the rent total.
// Utilities are split evenly. Everyone sees one monthly total per person.
const C = {
	title: "Unit 4b monthly rent",
	rentTotal: 24e4,
	utilsTotal: 18e3,
	rooms: [
		{
			name: "Tyler",
			label: "Attached bathroom",
			rent: 8e4
		},
		{
			name: "Mina",
			label: "Middle room",
			rent: 65e3
		},
		{
			name: "Maya",
			label: "",
			rent: 47500
		},
		{
			name: "Abby",
			label: "",
			rent: 47500
		}
	]
};
const MAX_UTILS = 1e5;
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const ownerFor = (ctx, name) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id ?? null;
const fmt = (cents) => {
	const d = Math.floor(cents / 100);
	const r = cents % 100;
	const head = String(d).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	return "$" + head + (r ? "." + (r < 10 ? "0" : "") + r : "");
};
/** Utilities share per room, leftover cents go to the first rooms. */
const utilShares = (s) => {
	const n = Math.max(1, s.rooms.length);
	const base = Math.floor(s.utilsTotal / n);
	const rem = s.utilsTotal - base * n;
	return s.rooms.map((_, i) => base + (i < rem ? 1 : 0));
};
const totals = (s) => {
	const u = utilShares(s);
	return s.rooms.map((r, i) => r.rent + u[i]);
};
function swap(s, from, to, amount) {
	if (typeof from !== "string" || typeof to !== "string" || typeof amount !== "number") return s;
	if (from === to || !Number.isInteger(amount) || amount <= 0) return s;
	const a = s.rooms.find((r) => r.id === from);
	const b = s.rooms.find((r) => r.id === to);
	if (!a || !b || amount > a.rent) return s;
	return {
		...s,
		rooms: s.rooms.map((r) => r.id === a.id ? {
			...r,
			rent: r.rent - amount
		} : r.id === b.id ? {
			...r,
			rent: r.rent + amount
		} : r)
	};
}
function setUtils(s, total) {
	if (typeof total !== "number" || !Number.isInteger(total) || total < 0 || total > MAX_UTILS || total === s.utilsTotal) return s;
	return {
		...s,
		utilsTotal: total
	};
}
export default defineApp({
	name: "Rent split",
	summary: (s) => `${s.title} · ${fmt(s.rentTotal)} rent + ${fmt(s.utilsTotal)} utilities`,
	init: (ctx) => ({
		title: C.title,
		rentTotal: C.rentTotal,
		utilsTotal: C.utilsTotal,
		rooms: C.rooms.map((r, i) => ({
			id: `r${i}`,
			label: r.label,
			name: r.name,
			rent: r.rent,
			owner: ownerFor(ctx, r.name)
		}))
	}),
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "swap") return swap(state, action.from, action.to, action.amount);
		if (action.t === "setUtils") return setUtils(state, action.total);
		return state;
	},
	onMembers: (state, ctx) => {
		const rooms = state.rooms.map((r) => {
			const o = ownerFor(ctx, r.name);
			return o === r.owner ? r : {
				...r,
				owner: o
			};
		});
		return rooms.some((r, i) => r !== state.rooms[i]) ? {
			...state,
			rooms
		} : state;
	},
	invariants: {
		"room rents add up to the rent total": (s) => s.rooms.reduce((n, r) => n + r.rent, 0) === s.rentTotal,
		"every rent is a whole number of cents, zero or more": (s) => s.rooms.every((r) => Number.isInteger(r.rent) && r.rent >= 0),
		"room ids are unique": (s) => new Set(s.rooms.map((r) => r.id)).size === s.rooms.length,
		"owners are in the chat and own one room each": (s, ctx) => {
			const owners = s.rooms.map((r) => r.owner).filter((o) => o !== null);
			return owners.every((o) => inChat(ctx, o)) && new Set(owners).size === owners.length;
		},
		"utilities are a whole number from 0 to 100000": (s) => Number.isInteger(s.utilsTotal) && s.utilsTotal >= 0 && s.utilsTotal <= MAX_UTILS,
		"monthly totals add up to rent plus utilities": (s) => totals(s).reduce((n, x) => n + x, 0) === s.rentTotal + s.utilsTotal
	},
	transitions: {
		"a swap lowers one room and raises another by the same amount": (p, n, a) => a.t !== "swap" || p === n || p.rooms.length === n.rooms.length && p.utilsTotal === n.utilsTotal && p.rooms.every((r, i) => {
			const x = n.rooms[i];
			return !!x && x.id === r.id && x.owner === r.owner && x.name === r.name && x.label === r.label && x.rent === r.rent + (r.id === a.to ? a.amount : 0) - (r.id === a.from ? a.amount : 0);
		}),
		"a swap never takes more than the room's rent": (p, n, a) => a.t !== "swap" || p === n || p.rooms.some((r) => r.id === a.from && a.amount > 0 && a.amount <= r.rent && a.from !== a.to),
		"setting utilities changes only the utilities total": (p, n, a) => a.t !== "setUtils" || p === n || n.utilsTotal === a.total && JSON.stringify(p.rooms) === JSON.stringify(n.rooms) && p.rentTotal === n.rentTotal,
		"the rent total, names and labels never change": (p, n) => p.rentTotal === n.rentTotal && p.title === n.title && p.rooms.length === n.rooms.length && p.rooms.every((r, i) => n.rooms[i].name === r.name && n.rooms[i].label === r.label && n.rooms[i].id === r.id),
		"only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, _user, r) => {
		const k = r.next();
		if (k < .25) return {
			t: "setUtils",
			total: r.pick([
				18e3,
				2e4,
				15e3,
				0,
				18001,
				2e5
			])
		};
		const from = r.pick(s.rooms);
		const to = r.pick(s.rooms);
		return {
			t: "swap",
			from: from.id,
			to: to.id,
			amount: r.pick([
				5e3,
				2500,
				100,
				1,
				1e4,
				5e5,
				0
			])
		};
	},
	local: {
		open: false,
		from: "",
		to: "",
		amount: "",
		utils: "",
		toast: 0
	},
	view: ({ state, me, dispatch, local, setLocal }) => {
		const sums = totals(state);
		const shares = utilShares(state);
		const idx = state.rooms.map((_, i) => i).sort((a, b) => Number(state.rooms[b].owner === me) - Number(state.rooms[a].owner === me));
		const dollars = Number(local.amount);
		const amountOk = local.amount.trim() !== "" && Number.isInteger(dollars) && dollars > 0;
		const canMove = amountOk && local.from !== "" && local.to !== "" && local.from !== local.to;
		const utilsNum = Number(local.utils);
		const canUtils = local.utils.trim() !== "" && Number.isInteger(utilsNum) && utilsNum >= 0 && utilsNum * 100 <= MAX_UTILS && utilsNum * 100 !== state.utilsTotal;
		const move = () => {
			if (!canMove) return;
			dispatch({
				t: "swap",
				from: local.from,
				to: local.to,
				amount: dollars * 100
			});
			setLocal({
				amount: "",
				toast: local.toast + 1
			});
		};
		const setU = () => {
			if (!canUtils) return;
			dispatch({
				t: "setUtils",
				total: utilsNum * 100
			});
			setLocal({
				utils: "",
				toast: local.toast + 1
			});
		};
		const chips = (value, pick) => /* @__PURE__ */ _jsx("div", {
			style: {
				display: "flex",
				flexWrap: "wrap",
				gap: 4
			},
			children: state.rooms.map((r) => /* @__PURE__ */ _jsx(Button, {
				kind: value === r.id ? "secondary" : "deemphasized",
				onClick: () => pick(r.id),
				children: r.name
			}, r.id))
		});
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `Rent ${fmt(state.rentTotal)} · utilities ${fmt(state.utilsTotal)}`
			}),
			local.open ? /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 6
				},
				children: [
					/* @__PURE__ */ _jsx("small", { children: "Move rent from" }),
					chips(local.from, (id) => setLocal({ from: id })),
					/* @__PURE__ */ _jsx("small", { children: "to" }),
					chips(local.to, (id) => setLocal({ to: id })),
					/* @__PURE__ */ _jsxs("form", {
						style: {
							display: "flex",
							gap: 8
						},
						onSubmit: (e) => {
							e.preventDefault();
							move();
						},
						children: [/* @__PURE__ */ _jsx("input", {
							value: local.amount,
							inputMode: "numeric",
							placeholder: "Dollars",
							"aria-label": "Dollars to move",
							onInput: (e) => setLocal({ amount: e.currentTarget.value })
						}), /* @__PURE__ */ _jsx(Button, {
							kind: "primary",
							disabled: !canMove,
							onClick: move,
							children: "Move"
						})]
					}),
					/* @__PURE__ */ _jsxs("form", {
						style: {
							display: "flex",
							gap: 8
						},
						onSubmit: (e) => {
							e.preventDefault();
							setU();
						},
						children: [/* @__PURE__ */ _jsx("input", {
							value: local.utils,
							inputMode: "numeric",
							placeholder: "Utilities in dollars",
							"aria-label": "Utilities in dollars",
							onInput: (e) => setLocal({ utils: e.currentTarget.value })
						}), /* @__PURE__ */ _jsx(Button, {
							kind: "secondary",
							disabled: !canUtils,
							onClick: setU,
							children: "Set"
						})]
					}),
					/* @__PURE__ */ _jsx("div", { children: /* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						onClick: () => setLocal({ open: false }),
						children: "Close"
					}) })
				]
			}) : /* @__PURE__ */ _jsxs("div", { children: [
				/* @__PURE__ */ _jsx("div", {
					style: {
						display: "grid",
						gap: 2
					},
					children: idx.map((i) => {
						const r = state.rooms[i];
						const mine = r.owner === me;
						const detail = [
							r.label,
							`rent ${fmt(r.rent)}`,
							`utils ${fmt(shares[i])}`
						].filter((x) => x).join(" · ");
						return /* @__PURE__ */ _jsxs("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 8,
								minHeight: 44
							},
							children: [
								r.owner ? /* @__PURE__ */ _jsx(Avatar, {
									user: r.owner,
									size: 24
								}) : null,
								/* @__PURE__ */ _jsxs("div", {
									style: {
										flex: 1,
										minWidth: 0
									},
									children: [/* @__PURE__ */ _jsx("div", {
										style: { fontWeight: 600 },
										children: mine ? `${r.name} · you` : r.name
									}), /* @__PURE__ */ _jsx("small", { children: detail })]
								}),
								/* @__PURE__ */ _jsx("div", {
									style: {
										fontWeight: 700,
										flexShrink: 0
									},
									children: fmt(sums[i])
								})
							]
						}, r.id);
					})
				}),
				/* @__PURE__ */ _jsx("div", {
					style: { marginTop: 8 },
					children: /* @__PURE__ */ _jsx("small", { children: `${fmt(state.rentTotal)} rent + ${fmt(state.utilsTotal)} utilities = ${fmt(state.rentTotal + state.utilsTotal)}` })
				}),
				/* @__PURE__ */ _jsx("div", {
					style: { marginTop: 8 },
					children: /* @__PURE__ */ _jsx(Button, {
						kind: "secondary",
						onClick: () => setLocal({ open: true }),
						children: "Adjust"
					})
				})
			] }),
			local.toast ? /* @__PURE__ */ _jsx(Toast, { children: "Split updated" }, local.toast) : null
		] });
	}
});
