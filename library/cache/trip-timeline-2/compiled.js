import { defineApp, Button, CardHeader, Facepile, Toast } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Nashville weekend timeline. Anyone can add a stop, tap a stop to confirm it,
// and the person who added a stop can move or remove it.
const PLAN = {
	title: "Nashville weekend plan",
	days: [
		"Fri · Oct 3",
		"Sat · Oct 4",
		"Sun · Oct 5"
	],
	deadline: {
		day: 2,
		slot: 90,
		label: "Leave by 3 PM"
	},
	deadlineNote: "Jess has a 7pm shift",
	items: [
		{
			day: 0,
			slot: 10,
			when: "Oct 3",
			title: "Drive up after Lily's 1pm lab",
			note: ""
		},
		{
			day: 0,
			slot: 20,
			when: "About 4 PM",
			title: "Paige leaves, meet at hotel",
			note: ""
		},
		{
			day: 0,
			slot: 30,
			when: "",
			title: "Hotel by Vandy",
			note: "Check in anytime"
		},
		{
			day: 0,
			slot: 50,
			when: "Night",
			title: "Hattie B's, then Broadway",
			note: ""
		},
		{
			day: 1,
			slot: 10,
			when: "10ish",
			title: "Brunch at Loveless Cafe",
			note: ""
		},
		{
			day: 1,
			slot: 20,
			when: "2 PM",
			title: "Parthenon",
			note: ""
		},
		{
			day: 1,
			slot: 30,
			when: "After",
			title: "Thrift stores in East Nash",
			note: ""
		},
		{
			day: 1,
			slot: 40,
			when: "9 PM",
			title: "Bluebird reservation",
			note: "Maya's res"
		},
		{
			day: 2,
			slot: 10,
			when: "",
			title: "5 Points coffee",
			note: ""
		}
	]
};
const MAX_ITEMS = 16;
const MAX_TITLE = 40;
const MAX_WHEN = 12;
const SLOTS = [
	{
		label: "AM",
		slot: 10
	},
	{
		label: "Day",
		slot: 30
	},
	{
		label: "Eve",
		slot: 40
	},
	{
		label: "Night",
		slot: 50
	}
];
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const clean = (x) => x.trim().replace(/\s+/g, " ");
const validDay = (d) => d === 0 || d === 1 || d === 2;
const validSlot = (v) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 99;
const cmp = (a, b) => a.day - b.day || a.slot - b.slot || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const sortItems = (xs) => [...xs].sort(cmp);
const canEdit = (it, user) => it.by === "" || it.by === user;
const dupTitle = (s, title, day, exceptId) => s.items.some((o) => o.id !== exceptId && o.day === day && o.title.toLowerCase() === title.toLowerCase());
const without = (xs, u) => xs.filter((x) => x !== u).join();
const othersSame = (p, n, id) => p.items.every((o) => o.id === id || n.items.includes(o));
function add(s, user, day, slot, when, title, seq, time) {
	if (!validDay(day) || !validSlot(slot) || typeof title !== "string" || typeof when !== "string") return s;
	const t = clean(title);
	const w = clean(when);
	if (!t || t.length > MAX_TITLE || w.length > MAX_WHEN || s.items.length >= MAX_ITEMS || dupTitle(s, t, day, "")) return s;
	const it = {
		id: `i${seq}`,
		day,
		slot,
		when: w,
		title: t,
		note: "",
		by: user,
		ins: [user]
	};
	return {
		...s,
		items: sortItems([...s.items, it]),
		at: time
	};
}
function confirm(s, user, id, time) {
	if (typeof id !== "string" || !s.items.some((o) => o.id === id)) return s;
	return {
		...s,
		at: time,
		items: s.items.map((o) => o.id !== id ? o : {
			...o,
			ins: o.ins.includes(user) ? o.ins.filter((u) => u !== user) : [...o.ins, user]
		})
	};
}
function move(s, user, id, day, slot, time) {
	if (typeof id !== "string" || !validDay(day) || !validSlot(slot)) return s;
	const it = s.items.find((o) => o.id === id);
	if (!it || !canEdit(it, user)) return s;
	if (it.day === day && it.slot === slot) return s;
	if (dupTitle(s, it.title, day, it.id)) return s;
	return {
		...s,
		at: time,
		items: sortItems(s.items.map((o) => o.id !== id ? o : {
			...o,
			day,
			slot,
			ins: [user]
		}))
	};
}
function remove(s, user, id, time) {
	if (typeof id !== "string") return s;
	const it = s.items.find((o) => o.id === id);
	if (!it || !canEdit(it, user)) return s;
	return {
		...s,
		at: time,
		items: s.items.filter((o) => o.id !== id)
	};
}
export default defineApp({
	name: "Trip timeline",
	summary: (s) => `${s.title} · ${s.items.length} stops · Fri to Sun · ${s.deadline.label}`,
	init: () => ({
		title: PLAN.title,
		items: sortItems(PLAN.items.map((o, i) => ({
			id: `s${i}`,
			day: o.day,
			slot: o.slot,
			when: o.when,
			title: o.title,
			note: o.note,
			by: "",
			ins: []
		}))),
		deadline: { ...PLAN.deadline },
		at: 0
	}),
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "add") return add(state, meta.user, action.day, action.slot, action.when, action.title, meta.seq, meta.time);
		if (action.t === "confirm") return confirm(state, meta.user, action.id, meta.time);
		if (action.t === "move") return move(state, meta.user, action.id, action.day, action.slot, meta.time);
		if (action.t === "remove") return remove(state, meta.user, action.id, meta.time);
		return state;
	},
	onMembers: (state, ctx) => {
		if (state.items.every((o) => (o.by === "" || inChat(ctx, o.by)) && o.ins.every((u) => inChat(ctx, u)))) return state;
		return {
			...state,
			items: state.items.map((o) => (o.by === "" || inChat(ctx, o.by)) && o.ins.every((u) => inChat(ctx, u)) ? o : {
				...o,
				by: o.by !== "" && !inChat(ctx, o.by) ? "" : o.by,
				ins: o.ins.filter((u) => inChat(ctx, u))
			})
		};
	},
	invariants: {
		"items are sorted by day, then slot, then id": (s) => s.items.every((o, i) => i === 0 || cmp(s.items[i - 1], o) <= 0),
		"ids are unique and there are at most 16 items": (s) => s.items.length <= MAX_ITEMS && new Set(s.items.map((o) => o.id)).size === s.items.length,
		"every item has a valid day, slot, title and time text": (s) => s.items.every((o) => validDay(o.day) && validSlot(o.slot) && o.title.length >= 1 && o.title.length <= MAX_TITLE && o.title === clean(o.title) && o.when.length <= MAX_WHEN),
		"no title appears twice on the same day": (s) => new Set(s.items.map((o) => `${o.day}|${o.title.toLowerCase()}`)).size === s.items.length,
		"no one confirms twice and confirmers are in the chat": (s, ctx) => s.items.every((o) => new Set(o.ins).size === o.ins.length && o.ins.every((u) => inChat(ctx, u))),
		"the adder is empty or in the chat": (s, ctx) => s.items.every((o) => o.by === "" || inChat(ctx, o.by)),
		"the Sunday deadline is fixed": (s) => s.deadline.day === PLAN.deadline.day && s.deadline.slot === PLAN.deadline.slot && s.deadline.label === PLAN.deadline.label
	},
	transitions: {
		"an add puts one new item in with the actor as adder and only confirmer": (p, n, a, m) => {
			if (a.t !== "add" || p === n) return true;
			const it = n.items.find((o) => o.id === `i${m.seq}`);
			return n.items.length === p.items.length + 1 && !!it && it.by === m.user && it.ins.join() === m.user && it.day === a.day && it.slot === a.slot && it.title === clean(a.title) && othersSame(p, n, it.id);
		},
		"a confirm flips the actor on that one item and changes nothing else": (p, n, a, m) => {
			if (a.t !== "confirm" || p === n) return true;
			const pt = p.items.find((o) => o.id === a.id);
			const nt = n.items.find((o) => o.id === a.id);
			return !!pt && !!nt && n.items.length === p.items.length && pt.ins.includes(m.user) !== nt.ins.includes(m.user) && without(pt.ins, m.user) === without(nt.ins, m.user) && pt.day === nt.day && pt.slot === nt.slot && pt.title === nt.title && pt.by === nt.by && othersSame(p, n, a.id);
		},
		"a move changes only that item's day and slot, resets its confirmers, and only its adder can do it": (p, n, a, m) => {
			if (a.t !== "move" || p === n) return true;
			const pt = p.items.find((o) => o.id === a.id);
			const nt = n.items.find((o) => o.id === a.id);
			return !!pt && !!nt && canEdit(pt, m.user) && n.items.length === p.items.length && nt.day === a.day && nt.slot === a.slot && nt.ins.join() === m.user && nt.title === pt.title && nt.by === pt.by && othersSame(p, n, a.id);
		},
		"a remove drops exactly that item, and only its adder can do it": (p, n, a, m) => {
			if (a.t !== "remove" || p === n) return true;
			const pt = p.items.find((o) => o.id === a.id);
			return !!pt && canEdit(pt, m.user) && n.items.length === p.items.length - 1 && !n.items.some((o) => o.id === a.id) && othersSame(p, n, a.id);
		},
		"only people in the chat change the plan": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
		"the deadline and title never change, and a change records its time": (p, n, a, m) => p.title === n.title && p.deadline.day === n.deadline.day && p.deadline.slot === n.deadline.slot && p.deadline.label === n.deadline.label && (p === n || n.at === m.time)
	},
	arbitrary: (s, user, r) => {
		const k = r.next();
		const mine = s.items.filter((o) => canEdit(o, user));
		if (s.items.length === 0 || k < .3) return {
			t: "add",
			day: r.int(3),
			slot: r.pick([
				10,
				20,
				30,
				40,
				50
			]),
			when: r.pick([
				"",
				"7 PM",
				"late"
			]),
			title: r.pick([
				"Pie",
				"Honky tonk",
				"Walk",
				"Museum",
				"Karaoke",
				"",
				" Brunch "
			])
		};
		if (k < .7) return {
			t: "confirm",
			id: r.pick(s.items).id
		};
		if (k < .9 && mine.length) return {
			t: "move",
			id: r.pick(mine).id,
			day: r.int(3),
			slot: r.pick([
				10,
				20,
				30,
				40,
				50
			])
		};
		if (mine.length) return {
			t: "remove",
			id: r.pick(mine).id
		};
		return {
			t: "confirm",
			id: r.pick(s.items).id
		};
	},
	local: {
		open: false,
		edit: false,
		tab: 0,
		day: 1,
		slot: 30,
		title: "",
		when: "",
		toast: 0
	},
	view: ({ state, me, dispatch, local, setLocal, theme }) => {
		const canAdd = clean(local.title).length > 0 && state.items.length < MAX_ITEMS;
		const submit = () => {
			if (!canAdd) return;
			dispatch({
				t: "add",
				day: local.day,
				slot: local.slot,
				when: local.when,
				title: local.title
			});
			setLocal({
				open: false,
				title: "",
				when: "",
				toast: local.toast + 1
			});
		};
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `${state.items.length} stops · Fri to Sun`
			}),
			local.open ? null : /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx("div", {
				style: {
					display: "flex",
					gap: 8
				},
				children: [
					"Fri",
					"Sat",
					"Sun"
				].map((label, d) => /* @__PURE__ */ _jsx(Button, {
					kind: local.tab === d ? "secondary" : "deemphasized",
					onClick: () => setLocal({ tab: d }),
					children: label
				}, label))
			}), PLAN.days.map((dayLabel, d) => {
				if (d !== local.tab) return null;
				const rows = state.items.filter((o) => o.day === d);
				return /* @__PURE__ */ _jsxs("div", { children: [
					/* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: 24
						},
						children: [/* @__PURE__ */ _jsx("small", {
							style: {
								fontWeight: 600,
								color: theme.color.secondaryText,
								whiteSpace: "nowrap",
								flexShrink: 0
							},
							children: dayLabel
						}), /* @__PURE__ */ _jsx("span", { style: {
							flex: 1,
							height: 1,
							background: theme.color.divider
						} })]
					}),
					rows.length === 0 ? /* @__PURE__ */ _jsx("small", {
						style: { color: theme.color.secondaryText },
						children: "Nothing yet"
					}) : null,
					rows.map((it) => {
						const mine = it.ins.includes(me);
						const sub = [it.when, it.note].filter(Boolean).join(" · ");
						return /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsxs("div", {
							role: "button",
							"aria-pressed": mine,
							onClick: () => {
								if (!local.edit) dispatch({
									t: "confirm",
									id: it.id
								});
							},
							style: {
								display: "flex",
								alignItems: "flex-start",
								gap: 8,
								minHeight: 44,
								padding: "6px 0",
								cursor: "pointer"
							},
							children: [
								/* @__PURE__ */ _jsx("span", { style: {
									width: 12,
									height: 12,
									borderRadius: 999,
									marginTop: 4,
									flexShrink: 0,
									background: mine ? theme.color.primary : theme.color.track
								} }),
								/* @__PURE__ */ _jsxs("div", {
									style: {
										flex: 1,
										minWidth: 0
									},
									children: [/* @__PURE__ */ _jsx("div", {
										style: {
											fontWeight: 600,
											overflowWrap: "anywhere"
										},
										children: it.title
									}), sub ? /* @__PURE__ */ _jsx("small", {
										style: { color: theme.color.secondaryText },
										children: sub
									}) : null]
								}),
								it.ins.length ? /* @__PURE__ */ _jsx(Facepile, {
									users: it.ins,
									max: 3,
									size: 20
								}) : null
							]
						}), local.edit && canEdit(it, me) ? /* @__PURE__ */ _jsxs("div", {
							style: {
								display: "flex",
								gap: 8,
								paddingLeft: 20
							},
							children: [/* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => dispatch({
									t: "move",
									id: it.id,
									day: (it.day + 1) % 3,
									slot: it.slot
								}),
								children: "Next day"
							}), /* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => dispatch({
									t: "remove",
									id: it.id
								}),
								children: "Remove"
							})]
						}) : null] }, it.id);
					})
				] }, d);
			})] }),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					borderTop: `1px solid ${theme.color.divider}`,
					marginTop: 4,
					padding: "6px 0",
					display: "flex",
					gap: 8,
					alignItems: "baseline",
					flexWrap: "wrap"
				},
				children: [/* @__PURE__ */ _jsxs("span", {
					style: { fontWeight: 600 },
					children: ["Sun · ", state.deadline.label]
				}), /* @__PURE__ */ _jsx("small", {
					style: { color: theme.color.secondaryText },
					children: PLAN.deadlineNote
				})]
			}),
			local.open ? /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 8
				},
				children: [
					/* @__PURE__ */ _jsx("div", {
						style: {
							display: "flex",
							gap: 8
						},
						children: [
							"Fri",
							"Sat",
							"Sun"
						].map((label, d) => /* @__PURE__ */ _jsx(Button, {
							kind: local.day === d ? "secondary" : "deemphasized",
							onClick: () => setLocal({ day: d }),
							children: label
						}, label))
					}),
					/* @__PURE__ */ _jsx("div", {
						style: {
							display: "flex",
							gap: 8
						},
						children: SLOTS.map((o) => /* @__PURE__ */ _jsx(Button, {
							kind: local.slot === o.slot ? "secondary" : "deemphasized",
							onClick: () => setLocal({ slot: o.slot }),
							children: o.label
						}, o.label))
					}),
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
							value: local.title,
							maxLength: MAX_TITLE,
							placeholder: "Stop",
							"aria-label": "Stop title",
							onInput: (e) => setLocal({ title: e.currentTarget.value })
						}), /* @__PURE__ */ _jsx("input", {
							style: { width: 84 },
							value: local.when,
							maxLength: MAX_WHEN,
							placeholder: "Time",
							"aria-label": "Time",
							onInput: (e) => setLocal({ when: e.currentTarget.value })
						})]
					}),
					/* @__PURE__ */ _jsxs("div", {
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
							kind: "deemphasized",
							onClick: () => setLocal({ open: false }),
							children: "Cancel"
						})]
					})
				]
			}) : /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					gap: 8,
					alignItems: "center"
				},
				children: [/* @__PURE__ */ _jsx(Button, {
					kind: "primary",
					disabled: state.items.length >= MAX_ITEMS,
					onClick: () => setLocal({
						open: true,
						edit: false
					}),
					children: "Add stop"
				}), /* @__PURE__ */ _jsx(Button, {
					kind: "deemphasized",
					onClick: () => setLocal({ edit: !local.edit }),
					children: local.edit ? "Done" : "Edit"
				})]
			}),
			local.toast ? /* @__PURE__ */ _jsx(Toast, { children: "Stop added" }, local.toast) : null
		] });
	}
});
