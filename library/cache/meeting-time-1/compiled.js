import { defineApp, Button, CardHeader, Facepile, SystemLine } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Free time grid. Everyone taps the slots they are free; the card shows the slot with the most
// people free. Anyone can pin the best slot, and only the person who pinned it can unpin.
const C = {
	title: "When are we free?",
	goal: "Meet for the poster before Friday",
	days: [
		"Mon",
		"Tue",
		"Wed",
		"Thu",
		"Fri",
		"Sun"
	],
	slots: [
		"Morning",
		"Afternoon",
		"Evening"
	]
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const cellIds = (s) => s.days.flatMap((d) => s.slots.map((_, i) => `${d}:${i}`));
const validCell = (s, c) => typeof c === "string" && cellIds(s).includes(c);
const at = (s, c) => s.free[c] ?? [];
const without = (xs, u) => xs.filter((x) => x !== u).join(",");
function bestOf(s) {
	let top = null;
	for (const c of cellIds(s)) {
		const n = at(s, c).length;
		if (n > 0 && (top === null || n > top.count)) top = {
			cell: c,
			count: n
		};
	}
	return top;
}
const maxCount = (s) => Object.keys(s.free).reduce((m, k) => Math.max(m, at(s, k).length), 0);
function labelOf(s, cell) {
	const k = cell.lastIndexOf(":");
	const day = cell.slice(0, k);
	const slot = s.slots[Number(cell.slice(k + 1))] ?? "";
	return `${day} ${slot.toLowerCase()}`;
}
function toggle(s, user, cell) {
	if (!validCell(s, cell)) return s;
	const cur = at(s, cell);
	const next = cur.includes(user) ? cur.filter((u) => u !== user) : [...cur, user];
	return {
		...s,
		free: {
			...s.free,
			[cell]: next
		}
	};
}
function pin(s, user, cell) {
	if (!validCell(s, cell) || s.pinned === cell) return s;
	const n = at(s, cell).length;
	if (n === 0 || n < maxCount(s)) return s;
	return {
		...s,
		pinned: cell,
		pinnedBy: user
	};
}
export default defineApp({
	name: "Free time grid",
	summary: (s) => {
		if (s.pinned) return `${s.title} Meeting ${labelOf(s, s.pinned)}.`;
		const b = bestOf(s);
		return b ? `${s.title} Best so far: ${labelOf(s, b.cell)} · ${b.count} free.` : `${s.title} ${s.goal}. No one has tapped yet.`;
	},
	init: () => {
		const days = C.days.slice(0, 7);
		const slots = C.slots.slice(0, 4);
		const free = {};
		for (const d of days) slots.forEach((_, i) => free[`${d}:${i}`] = []);
		return {
			title: C.title,
			goal: C.goal,
			days,
			slots,
			free,
			pinned: null,
			pinnedBy: null
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "toggle") return toggle(state, meta.user, action.cell);
		if (action.t === "pin") return pin(state, meta.user, action.cell);
		if (action.t === "unpin") {
			if (state.pinned === null || state.pinnedBy !== meta.user) return state;
			return {
				...state,
				pinned: null,
				pinnedBy: null
			};
		}
		return state;
	},
	// Someone left: their taps go, and a pin they made is lifted.
	onMembers: (state, ctx) => {
		const clean = Object.keys(state.free).every((k) => at(state, k).every((u) => inChat(ctx, u)));
		const pinOk = state.pinnedBy === null || inChat(ctx, state.pinnedBy);
		if (clean && pinOk) return state;
		const free = {};
		for (const k of Object.keys(state.free)) free[k] = at(state, k).filter((u) => inChat(ctx, u));
		return pinOk ? {
			...state,
			free
		} : {
			...state,
			free,
			pinned: null,
			pinnedBy: null
		};
	},
	invariants: {
		"the grid has exactly one entry for each day and slot": (s) => Object.keys(s.free).sort().join("|") === cellIds(s).sort().join("|"),
		"no one is free twice in a slot": (s) => Object.keys(s.free).every((k) => new Set(at(s, k)).size === at(s, k).length),
		"everyone in the grid is in the chat": (s, ctx) => Object.keys(s.free).every((k) => at(s, k).every((u) => inChat(ctx, u))),
		"a pinned slot is a real slot": (s) => s.pinned === null || cellIds(s).includes(s.pinned),
		"pinned and pinnedBy are set together and the pinner is in the chat": (s, ctx) => s.pinned === null === (s.pinnedBy === null) && (s.pinnedBy === null || inChat(ctx, s.pinnedBy))
	},
	transitions: {
		"a tap flips the actor in that one slot and changes no one else": (p, n, a, m) => a.t !== "toggle" || p === n || typeof a.cell === "string" && at(p, a.cell).includes(m.user) !== at(n, a.cell).includes(m.user) && Object.keys(p.free).every((k) => without(at(p, k), m.user) === without(at(n, k), m.user)) && Object.keys(p.free).every((k) => k === a.cell || at(p, k).join(",") === at(n, k).join(",")),
		"a tap leaves the pin as it was": (p, n, a) => a.t !== "toggle" || p === n || n.pinned === p.pinned && n.pinnedBy === p.pinnedBy,
		"a pin names a slot with the most people and records the actor": (p, n, a, m) => a.t !== "pin" || p === n || typeof a.cell === "string" && p.pinned !== a.cell && n.pinned === a.cell && n.pinnedBy === m.user && at(p, a.cell).length > 0 && at(p, a.cell).length === maxCount(p) && n.free === p.free,
		"only the person who pinned can unpin, and it clears the pin": (p, n, a, m) => a.t !== "unpin" || p === n || p.pinnedBy === m.user && n.pinned === null && n.pinnedBy === null && n.free === p.free,
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		const k = r.next();
		if (s.pinned !== null && s.pinnedBy === user && k < .3) return { t: "unpin" };
		if (k < .1) return { t: "unpin" };
		if (k < .25) {
			const b = bestOf(s);
			if (b) return {
				t: "pin",
				cell: b.cell
			};
		}
		if (k < .3) return {
			t: "toggle",
			cell: "Mon:9"
		};
		return {
			t: "toggle",
			cell: r.pick(cellIds(s))
		};
	},
	local: {},
	view: ({ state, me, members, dispatch }) => {
		const nameOf = (id) => id === me ? "You" : members.find((m) => m.id === id)?.name ?? "Someone";
		const best = bestOf(state);
		const answered = members.filter((m) => Object.keys(state.free).some((k) => at(state, k).includes(m.id))).length;
		const shown = state.pinned ?? best?.cell ?? null;
		const shownFree = shown ? at(state, shown) : [];
		const notFree = shown ? members.filter((m) => !shownFree.includes(m.id)) : [];
		const notFreeText = notFree.length ? `Not free: ${notFree.slice(0, 3).map((m) => m.id === me ? "you" : m.name).join(", ")}${notFree.length > 3 ? ` +${notFree.length - 3}` : ""}` : "Everyone is free";
		const cols = `repeat(${state.days.length}, minmax(0, 1fr))`;
		const maxN = best?.count ?? 0;
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `${answered} of ${members.length} have tapped`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gridTemplateColumns: cols,
					gap: 4
				},
				children: state.days.map((d) => /* @__PURE__ */ _jsx("small", {
					style: {
						textAlign: "center",
						fontWeight: 600
					},
					children: d
				}, d))
			}),
			state.slots.map((slot, row) => /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx("small", { children: slot }), /* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gridTemplateColumns: cols,
					gap: 4
				},
				children: state.days.map((d) => {
					const id = `${d}:${row}`;
					const c = at(state, id);
					const mine = c.includes(me);
					return /* @__PURE__ */ _jsx("div", {
						style: { minWidth: 0 },
						children: /* @__PURE__ */ _jsx(Button, {
							wide: true,
							kind: mine ? "primary" : c.length === maxN && maxN > 0 ? "deemphasized" : "secondary",
							onClick: () => dispatch({
								t: "toggle",
								cell: id
							}),
							children: String(c.length)
						})
					}, id);
				})
			})] }, slot)),
			shown ? /* @__PURE__ */ _jsxs("div", {
				style: { marginTop: 8 },
				children: [/* @__PURE__ */ _jsxs("div", {
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
								children: state.pinned ? `Meeting ${labelOf(state, shown)}` : `Best: ${labelOf(state, shown)}`
							}), /* @__PURE__ */ _jsx("small", { children: state.pinned && state.pinnedBy ? `${shownFree.length} of ${members.length} free · pinned by ${nameOf(state.pinnedBy)}` : `${shownFree.length} of ${members.length} free` })]
						}),
						/* @__PURE__ */ _jsx(Facepile, {
							users: shownFree,
							max: 3,
							size: 24
						}),
						state.pinned ? state.pinnedBy === me ? /* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							onClick: () => dispatch({ t: "unpin" }),
							children: "Unpin"
						}) : null : /* @__PURE__ */ _jsx(Button, {
							kind: "secondary",
							onClick: () => dispatch({
								t: "pin",
								cell: shown
							}),
							children: "Pin it"
						})
					]
				}), /* @__PURE__ */ _jsx("small", { children: notFreeText })]
			}) : /* @__PURE__ */ _jsx("div", {
				style: { marginTop: 8 },
				children: /* @__PURE__ */ _jsx(SystemLine, { children: "Tap every slot that works for you" })
			})
		] });
	}
});
