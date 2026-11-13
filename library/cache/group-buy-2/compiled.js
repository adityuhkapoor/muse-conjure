import { defineApp, Avatar, Button, CardHeader, Progress, Toast } from "@muse/app";
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Shirt order tracker: sizes and colors against the minimum, with a running total.
const SHIRTS = {
	title: "Shirt order: 15 minimum",
	minimum: 15,
	prices: {
		dark: 1400,
		light: 1200
	},
	// Seed lines from the chat, matched to members by name and skipped if not found.
	seed: [
		{
			who: "Bryan",
			label: "",
			size: "L",
			color: "dark",
			qty: 1,
			sure: true
		},
		{
			who: "Bryan",
			label: "girlfriend",
			size: "S",
			color: "dark",
			qty: 1,
			sure: true
		},
		{
			who: "Hana",
			label: "",
			size: "S",
			color: "dark",
			qty: 1,
			sure: true
		},
		{
			who: "Tyler",
			label: "",
			size: "M",
			color: "dark",
			qty: 1,
			sure: true
		},
		{
			who: "Eli",
			label: "dorm",
			size: "M",
			color: "dark",
			qty: 2,
			sure: true
		},
		{
			who: "Eli",
			label: "dorm",
			size: "L",
			color: "dark",
			qty: 1,
			sure: true
		}
	]
};
const SIZES = [
	"S",
	"M",
	"L",
	"XL"
];
const COLORS = ["dark", "light"];
const MAX_LINES = 12;
const MAX_LABEL = 20;
const clean = (s) => s.trim().replace(/\s+/g, " ");
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const isSize = (x) => typeof x === "string" && SIZES.includes(x);
const isColor = (x) => typeof x === "string" && COLORS.includes(x);
const isQty = (x) => typeof x === "number" && Number.isInteger(x) && x >= 1 && x <= 9;
const money = (c) => `$${Math.floor(c / 100)}`;
const count = (s, f) => s.lines.filter(f).reduce((n, l) => n + l.qty, 0);
const cost = (s) => s.lines.reduce((n, l) => n + l.qty * s.prices[l.color], 0);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ownerOf = (s, id) => s.lines.find((l) => l.id === id)?.owner;
function reduceShirts(s, a, user, seq) {
	switch (a.t) {
		case "add": {
			if (typeof a.label !== "string" || !isSize(a.size) || !isColor(a.color) || !isQty(a.qty) || typeof a.sure !== "boolean") return s;
			const label = clean(a.label);
			if (label.length > MAX_LABEL || s.lines.length >= MAX_LINES) return s;
			const line = {
				id: `l${seq}`,
				owner: user,
				label,
				size: a.size,
				color: a.color,
				qty: a.qty,
				sure: a.sure
			};
			return {
				...s,
				lines: [...s.lines, line]
			};
		}
		case "remove": {
			if (typeof a.id !== "string" || ownerOf(s, a.id) !== user) return s;
			return {
				...s,
				lines: s.lines.filter((l) => l.id !== a.id)
			};
		}
		case "setQty": {
			if (typeof a.id !== "string" || !isQty(a.qty) || ownerOf(s, a.id) !== user) return s;
			const cur = s.lines.find((l) => l.id === a.id);
			if (!cur || cur.qty === a.qty) return s;
			const qty = a.qty;
			return {
				...s,
				lines: s.lines.map((l) => l.id === a.id ? {
					...l,
					qty
				} : l)
			};
		}
		case "toggleSure": {
			if (typeof a.id !== "string" || ownerOf(s, a.id) !== user) return s;
			return {
				...s,
				lines: s.lines.map((l) => l.id === a.id ? {
					...l,
					sure: !l.sure
				} : l)
			};
		}
	}
	return s;
}
export default defineApp({
	name: "Shirt order",
	summary: (s) => `${count(s, () => true)} of ${s.minimum} shirts · ${money(cost(s))}`,
	init: (ctx) => {
		const lines = [];
		for (const x of SHIRTS.seed) {
			const owner = ctx.members.find((m) => m.name.toLowerCase() === x.who.toLowerCase())?.id;
			if (!owner || lines.length >= MAX_LINES) continue;
			lines.push({
				id: `s${lines.length}`,
				owner,
				label: x.label,
				size: x.size,
				color: x.color,
				qty: x.qty,
				sure: x.sure
			});
		}
		return {
			minimum: SHIRTS.minimum,
			prices: { ...SHIRTS.prices },
			lines
		};
	},
	reduce: (state, action, meta, ctx) => inChat(ctx, meta.user) ? reduceShirts(state, action, meta.user, meta.seq) : state,
	onMembers: (state, ctx) => state.lines.every((l) => inChat(ctx, l.owner)) ? state : {
		...state,
		lines: state.lines.filter((l) => inChat(ctx, l.owner))
	},
	invariants: {
		"every line has a real size, color and a quantity from 1 to 9": (s) => s.lines.every((l) => isSize(l.size) && isColor(l.color) && isQty(l.qty) && typeof l.sure === "boolean"),
		"line ids are unique and there are at most 12 lines": (s) => new Set(s.lines.map((l) => l.id)).size === s.lines.length && s.lines.length <= MAX_LINES,
		"every line's owner is in the chat": (s, ctx) => s.lines.every((l) => inChat(ctx, l.owner)),
		"the minimum is 15 and the prices are 1400 and 1200": (s) => s.minimum === 15 && s.prices.dark === 1400 && s.prices.light === 1200,
		"labels are trimmed and at most 20 characters": (s) => s.lines.every((l) => l.label === clean(l.label) && l.label.length <= MAX_LABEL)
	},
	transitions: {
		"an add appends one line, last, owned by the actor, and leaves the rest alone": (p, n, a, m) => {
			if (a.t !== "add" || p === n) return true;
			const last = n.lines.at(-1);
			return n.lines.length === p.lines.length + 1 && !!last && last.id === `l${m.seq}` && last.owner === m.user && last.label === clean(a.label) && last.size === a.size && last.color === a.color && last.qty === a.qty && last.sure === a.sure && same(n.lines.slice(0, -1), p.lines);
		},
		"a remove deletes only the named line, and only its owner can": (p, n, a, m) => a.t !== "remove" || p === n || ownerOf(p, a.id) === m.user && same(n.lines, p.lines.filter((l) => l.id !== a.id)),
		"a quantity change touches only that line's quantity, and only its owner can": (p, n, a, m) => a.t !== "setQty" || p === n || ownerOf(p, a.id) === m.user && same(n.lines, p.lines.map((l) => l.id === a.id ? {
			...l,
			qty: a.qty
		} : l)),
		"a sure or maybe flip touches only that line's flag, and only its owner can": (p, n, a, m) => a.t !== "toggleSure" || p === n || ownerOf(p, a.id) === m.user && same(n.lines, p.lines.map((l) => l.id === a.id ? {
			...l,
			sure: !l.sure
		} : l)),
		"only people in the chat change the order": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
		"the minimum and prices never change": (p, n) => p.minimum === n.minimum && p.prices.dark === n.prices.dark && p.prices.light === n.prices.light
	},
	arbitrary: (s, user, r) => {
		const mine = s.lines.filter((l) => l.owner === user);
		const k = r.next();
		if (mine.length === 0 || k < .35) {
			return {
				t: "add",
				label: r.pick([
					"",
					"dorm",
					"girlfriend",
					"  roommate "
				]),
				size: r.pick([
					"S",
					"M",
					"L",
					"XL"
				]),
				color: r.pick(["dark", "light"]),
				qty: 1 + r.int(3),
				sure: r.next() < .7
			};
		}
		const l = k < .9 ? r.pick(mine) : r.pick(s.lines);
		if (k < .55) return {
			t: "setQty",
			id: l.id,
			qty: 1 + r.int(9)
		};
		if (k < .8) return {
			t: "toggleSure",
			id: l.id
		};
		return {
			t: "remove",
			id: l.id
		};
	},
	local: {
		open: false,
		adding: false,
		size: "M",
		color: "dark",
		qty: 1,
		label: "",
		maybe: false,
		toast: 0
	},
	view: ({ state, me, members, dispatch, local, setLocal, theme }) => {
		const nameOf = (id) => id === me ? "You" : members.find((m) => m.id === id)?.name ?? "Someone";
		const total = count(state, () => true);
		const sure = count(state, (l) => l.sure);
		const maybe = total - sure;
		const status = total < state.minimum ? `${state.minimum - total} more needed` : sure >= state.minimum ? "Minimum reached" : "Minimum reached if maybes come through";
		const darkN = count(state, (l) => l.color === "dark");
		const lightN = count(state, (l) => l.color === "light");
		const cell = (color, size) => count(state, (l) => l.color === color && l.size === size);
		const grid = {
			display: "grid",
			gridTemplateColumns: "56px repeat(4, 1fr)",
			gap: 4,
			alignItems: "center"
		};
		const full = state.lines.length >= MAX_LINES;
		const submit = () => {
			dispatch({
				t: "add",
				label: local.label.slice(0, MAX_LABEL),
				size: local.size,
				color: local.color,
				qty: local.qty,
				sure: !local.maybe
			});
			setLocal({
				adding: false,
				label: "",
				maybe: false,
				qty: 1,
				toast: local.toast + 1
			});
		};
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: SHIRTS.title,
				subtitle: status
			}),
			/* @__PURE__ */ _jsx(Progress, {
				value: Math.min(total, state.minimum),
				max: state.minimum,
				label: `${total} of ${state.minimum} shirts`
			}),
			/* @__PURE__ */ _jsx("small", {
				style: {
					display: "block",
					marginTop: 4
				},
				children: `${sure} sure · ${maybe} maybe`
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					marginTop: 8,
					display: "grid",
					gap: 2
				},
				"aria-label": "Shirts by size and color",
				children: [/* @__PURE__ */ _jsxs("div", {
					style: grid,
					children: [/* @__PURE__ */ _jsx("small", {}), SIZES.map((z) => /* @__PURE__ */ _jsx("small", {
						style: {
							textAlign: "center",
							fontWeight: 600
						},
						children: z
					}, z))]
				}), COLORS.map((c) => /* @__PURE__ */ _jsxs("div", {
					style: grid,
					children: [/* @__PURE__ */ _jsx("small", {
						style: { fontWeight: 600 },
						children: c === "dark" ? /* @__PURE__ */ _jsx(_Fragment, { children: "Black" }) : /* @__PURE__ */ _jsx(_Fragment, { children: "Gray" })
					}), SIZES.map((z) => {
						const n = cell(c, z);
						return /* @__PURE__ */ _jsx("div", {
							style: {
								textAlign: "center",
								fontWeight: n ? 600 : 400,
								color: n ? theme.color.text : theme.color.secondaryText
							},
							children: n
						}, z);
					})]
				}, c))]
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					marginTop: 8,
					fontWeight: 600
				},
				children: `${money(cost(state))} · ${darkN} black · ${lightN} gray`
			}),
			local.adding ? /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 8,
					marginTop: 8
				},
				children: [
					/* @__PURE__ */ _jsx("div", {
						style: {
							display: "flex",
							flexWrap: "wrap",
							gap: 8
						},
						children: SIZES.map((z) => /* @__PURE__ */ _jsx(Button, {
							kind: local.size === z ? "secondary" : "deemphasized",
							onClick: () => setLocal({ size: z }),
							children: z
						}, z))
					}),
					/* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							flexWrap: "wrap",
							gap: 8
						},
						children: [COLORS.map((c) => /* @__PURE__ */ _jsx(Button, {
							kind: local.color === c ? "secondary" : "deemphasized",
							onClick: () => setLocal({ color: c }),
							children: c === "dark" ? /* @__PURE__ */ _jsx(_Fragment, { children: "Black" }) : /* @__PURE__ */ _jsx(_Fragment, { children: "Gray" })
						}, c)), /* @__PURE__ */ _jsx(Button, {
							kind: local.maybe ? "secondary" : "deemphasized",
							onClick: () => setLocal({ maybe: !local.maybe }),
							children: "Maybe"
						})]
					}),
					/* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8
						},
						children: [
							/* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								disabled: local.qty <= 1,
								"aria-label": "Fewer",
								onClick: () => setLocal({ qty: Math.max(1, local.qty - 1) }),
								children: "−"
							}),
							/* @__PURE__ */ _jsx("span", {
								style: {
									minWidth: 24,
									textAlign: "center",
									fontWeight: 600
								},
								children: local.qty
							}),
							/* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								disabled: local.qty >= 9,
								"aria-label": "More",
								onClick: () => setLocal({ qty: Math.min(9, local.qty + 1) }),
								children: "+"
							}),
							/* @__PURE__ */ _jsx("input", {
								value: local.label,
								maxLength: MAX_LABEL,
								placeholder: "Who for, optional",
								"aria-label": "Who the shirt is for",
								onInput: (e) => setLocal({ label: e.currentTarget.value })
							})
						]
					}),
					/* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							gap: 8
						},
						children: [/* @__PURE__ */ _jsx(Button, {
							kind: "primary",
							onClick: submit,
							children: "Add"
						}), /* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							onClick: () => setLocal({ adding: false }),
							children: "Cancel"
						})]
					})
				]
			}) : /* @__PURE__ */ _jsxs("div", {
				style: {
					marginTop: 8,
					display: "grid",
					gap: 8
				},
				children: [
					/* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						wide: true,
						onClick: () => setLocal({ open: !local.open }),
						children: local.open ? "Hide lines" : "Show lines"
					}),
					local.open ? /* @__PURE__ */ _jsx("div", {
						style: {
							display: "grid",
							gap: 4
						},
						children: state.lines.map((l) => /* @__PURE__ */ _jsxs("div", {
							style: {
								display: "grid",
								gap: 4
							},
							children: [/* @__PURE__ */ _jsxs("div", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: 8,
									minHeight: 44
								},
								children: [/* @__PURE__ */ _jsx(Avatar, {
									user: l.owner,
									size: 24
								}), /* @__PURE__ */ _jsxs("div", {
									style: {
										flex: 1,
										minWidth: 0
									},
									children: [/* @__PURE__ */ _jsxs("div", {
										style: { fontWeight: 600 },
										children: [
											l.qty,
											" × ",
											l.size,
											" ",
											l.color === "dark" ? /* @__PURE__ */ _jsx(_Fragment, { children: "black" }) : /* @__PURE__ */ _jsx(_Fragment, { children: "gray" })
										]
									}), /* @__PURE__ */ _jsx("small", {
										style: {
											display: "block",
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap"
										},
										children: `${l.label || nameOf(l.owner)}${l.sure ? "" : " · maybe"}`
									})]
								})]
							}), l.owner === me ? /* @__PURE__ */ _jsxs("div", {
								style: {
									display: "flex",
									flexWrap: "wrap",
									gap: 8
								},
								children: [
									/* @__PURE__ */ _jsx(Button, {
										kind: "deemphasized",
										disabled: l.qty <= 1,
										"aria-label": "Fewer",
										onClick: () => dispatch({
											t: "setQty",
											id: l.id,
											qty: l.qty - 1
										}),
										children: "−"
									}),
									/* @__PURE__ */ _jsx(Button, {
										kind: "deemphasized",
										disabled: l.qty >= 9,
										"aria-label": "More",
										onClick: () => dispatch({
											t: "setQty",
											id: l.id,
											qty: l.qty + 1
										}),
										children: "+"
									}),
									/* @__PURE__ */ _jsx(Button, {
										kind: "deemphasized",
										onClick: () => dispatch({
											t: "toggleSure",
											id: l.id
										}),
										children: l.sure ? "Maybe" : "Sure"
									}),
									/* @__PURE__ */ _jsx(Button, {
										kind: "deemphasized",
										onClick: () => dispatch({
											t: "remove",
											id: l.id
										}),
										children: "Remove"
									})
								]
							}) : null]
						}, l.id))
					}) : null,
					/* @__PURE__ */ _jsx(Button, {
						kind: "primary",
						wide: true,
						disabled: full,
						onClick: () => setLocal({ adding: true }),
						children: "Add shirts"
					})
				]
			}),
			local.toast ? /* @__PURE__ */ _jsx(Toast, { children: "Added" }, local.toast) : null
		] });
	}
});
