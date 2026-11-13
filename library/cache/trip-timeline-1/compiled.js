import { defineApp, Avatar, Button, CardHeader, Facepile } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "@muse/app/jsx-runtime";
// Trip timeline. Anyone can add, fix, move or remove items; "Looks right" shows who has checked
// the plan, and any change to the plan clears those checks.
const CHAT = {
	title: "Austin trip, March 13 to 20",
	month: "Mar",
	firstDay: 13,
	lastDay: 20,
	items: [
		{
			day: 13,
			text: "Marcus lands at night, Uber to Airbnb"
		},
		{
			day: 14,
			text: "Group lands at AUS around 2pm"
		},
		{
			day: 14,
			text: "Airbnb check-in at 4pm, South Congress"
		},
		{
			day: 14,
			text: "Tacos and a walk around the Capitol"
		},
		{
			day: 15,
			text: "Franklin BBQ, in line by 8am"
		},
		{
			day: 16,
			text: "Barton Springs, then Zilker"
		},
		{
			day: 17,
			text: "Rainey St bars night"
		},
		{
			day: 18,
			text: "Lockhart day trip, Kreuz Market"
		},
		{
			day: 19,
			text: "Pack up, fly out at 6pm"
		},
		{
			day: 20,
			text: "Marcus flies out, early morning"
		}
	]
};
const MAX_ITEMS = 24;
const MAX_TEXT = 60;
const clean = (x) => x.trim().replace(/\s+/g, " ");
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const okDay = (s, d) => typeof d === "number" && Number.isInteger(d) && d >= s.firstDay && d <= s.lastDay;
const okText = (t) => typeof t === "string" && clean(t).length > 0 && clean(t).length <= MAX_TEXT;
const taken = (s, day, text, except) => s.items.some((i) => i.day === day && i.id !== except && i.text.toLowerCase() === text.toLowerCase());
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Insert after the last item whose day is the same or earlier. */
function place(items, it) {
	let at = items.length;
	while (at > 0 && items[at - 1].day > it.day) at--;
	return [
		...items.slice(0, at),
		it,
		...items.slice(at)
	];
}
export default defineApp({
	name: "Trip timeline",
	summary: (s, ctx) => `${s.title}: ${s.items.length} items · ${s.confirmedBy.length} of ${ctx.members.length} say it looks right`,
	init: () => ({
		title: clean(CHAT.title).slice(0, 60),
		firstDay: CHAT.firstDay,
		lastDay: CHAT.lastDay,
		items: CHAT.items.slice(0, MAX_ITEMS).map((x, i) => ({
			id: `p${i}`,
			day: x.day,
			text: clean(x.text).slice(0, MAX_TEXT),
			by: null
		})).sort((a, b) => a.day - b.day),
		confirmedBy: []
	}),
	reduce: (s, a, m, ctx) => {
		if (!inChat(ctx, m.user)) return s;
		if (a.t === "add") {
			if (!okDay(s, a.day) || !okText(a.text) || s.items.length >= MAX_ITEMS) return s;
			const text = clean(a.text);
			if (taken(s, a.day, text, null)) return s;
			return {
				...s,
				items: place(s.items, {
					id: "i" + m.seq,
					day: a.day,
					text,
					by: m.user
				}),
				confirmedBy: []
			};
		}
		if (a.t === "edit") {
			const it = s.items.find((i) => i.id === a.id);
			if (!it || !okText(a.text)) return s;
			const text = clean(a.text);
			if (text === it.text || taken(s, it.day, text, it.id)) return s;
			return {
				...s,
				items: s.items.map((i) => i.id === it.id ? {
					...i,
					text
				} : i),
				confirmedBy: []
			};
		}
		if (a.t === "move") {
			const it = s.items.find((i) => i.id === a.id);
			if (!it || !okDay(s, a.day) || a.day === it.day || taken(s, a.day, it.text, it.id)) return s;
			return {
				...s,
				items: place(s.items.filter((i) => i.id !== it.id), {
					...it,
					day: a.day
				}),
				confirmedBy: []
			};
		}
		if (a.t === "remove") {
			if (!s.items.some((i) => i.id === a.id)) return s;
			return {
				...s,
				items: s.items.filter((i) => i.id !== a.id),
				confirmedBy: []
			};
		}
		if (a.t === "confirm") {
			return {
				...s,
				confirmedBy: s.confirmedBy.includes(m.user) ? s.confirmedBy.filter((u) => u !== m.user) : [...s.confirmedBy, m.user]
			};
		}
		return s;
	},
	// Someone left: their items stay but lose the author, and their check goes.
	onMembers: (s, ctx) => {
		const byOk = s.items.every((i) => i.by === null || inChat(ctx, i.by));
		const confOk = s.confirmedBy.every((u) => inChat(ctx, u));
		if (byOk && confOk) return s;
		return {
			...s,
			items: s.items.map((i) => i.by !== null && !inChat(ctx, i.by) ? {
				...i,
				by: null
			} : i),
			confirmedBy: s.confirmedBy.filter((u) => inChat(ctx, u))
		};
	},
	invariants: {
		"every item is on a trip day": (s) => s.firstDay <= s.lastDay && s.items.every((i) => Number.isInteger(i.day) && i.day >= s.firstDay && i.day <= s.lastDay),
		"ids are unique and there are at most 24 items": (s) => s.items.length <= MAX_ITEMS && new Set(s.items.map((i) => i.id)).size === s.items.length,
		"item text is trimmed, 1 to 60 characters, and not repeated on a day": (s) => s.items.every((i) => i.text === clean(i.text) && i.text.length >= 1 && i.text.length <= MAX_TEXT) && new Set(s.items.map((i) => `${i.day}|${i.text.toLowerCase()}`)).size === s.items.length,
		"items are in day order": (s) => s.items.every((i, k) => k === 0 || s.items[k - 1].day <= i.day),
		"each person has checked the plan at most once, and is in the chat": (s, ctx) => new Set(s.confirmedBy).size === s.confirmedBy.length && s.confirmedBy.every((u) => inChat(ctx, u)),
		"item authors are in the chat": (s, ctx) => s.items.every((i) => i.by === null || inChat(ctx, i.by))
	},
	transitions: {
		"an add puts one new item on the asked day with the actor as author": (p, n, a, m) => {
			if (a.t !== "add" || p === n) return true;
			const id = "i" + m.seq;
			const added = n.items.find((i) => i.id === id);
			return !!added && n.items.length === p.items.length + 1 && added.day === a.day && added.text === clean(a.text) && added.by === m.user && same(n.items.filter((i) => i.id !== id), p.items) && n.confirmedBy.length === 0;
		},
		"an edit changes only the text of the named item": (p, n, a) => {
			if (a.t !== "edit" || p === n) return true;
			return n.items.length === p.items.length && p.items.every((it, k) => {
				const x = n.items[k];
				if (!x) return false;
				return it.id === a.id ? x.id === it.id && x.day === it.day && x.by === it.by && x.text === clean(a.text) && x.text !== it.text : same(x, it);
			}) && n.confirmedBy.length === 0;
		},
		"a move changes only the day of the named item": (p, n, a) => {
			if (a.t !== "move" || p === n) return true;
			return n.items.length === p.items.length && p.items.every((it) => {
				const x = n.items.find((y) => y.id === it.id);
				if (!x) return false;
				return it.id === a.id ? x.day === a.day && x.day !== it.day && x.text === it.text && x.by === it.by : same(x, it);
			}) && n.confirmedBy.length === 0;
		},
		"a remove drops exactly the named item": (p, n, a) => a.t !== "remove" || p === n || p.items.some((i) => i.id === a.id) && same(n.items, p.items.filter((i) => i.id !== a.id)) && n.confirmedBy.length === 0,
		"a check flips only the actor and leaves the items alone": (p, n, a, m) => a.t !== "confirm" || p === n || same(p.items, n.items) && p.confirmedBy.includes(m.user) !== n.confirmedBy.includes(m.user) && p.confirmedBy.filter((u) => u !== m.user).join() === n.confirmedBy.filter((u) => u !== m.user).join(),
		"only people in the chat change the timeline, and the trip days stay fixed": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user) && p.firstDay === n.firstDay && p.lastDay === n.lastDay && p.title === n.title
	},
	arbitrary: (s, _user, r) => {
		const it = s.items.length ? r.pick(s.items) : null;
		const x = r.next();
		const span = s.lastDay - s.firstDay + 1;
		const text = r.pick([
			"Coffee stop",
			"Thrift shopping",
			"Brunch",
			"Pool day",
			"  Live  music ",
			"",
			it?.text ?? "Walk"
		]);
		if (!it || x < .3) {
			return {
				t: "add",
				day: r.next() < .1 ? s.lastDay + 5 : s.firstDay + r.int(span),
				text
			};
		}
		if (x < .5) return {
			t: "edit",
			id: it.id,
			text
		};
		if (x < .65) return {
			t: "move",
			id: it.id,
			day: s.firstDay + r.int(span)
		};
		if (x < .75) return {
			t: "remove",
			id: it.id
		};
		return { t: "confirm" };
	},
	local: {
		editing: false,
		day: CHAT.firstDay,
		draft: "",
		item: null
	},
	view: ({ state, me, members, dispatch, local, setLocal, theme }) => {
		const days = Array.from({ length: state.lastDay - state.firstDay + 1 }, (_, i) => state.firstDay + i);
		const day = Math.min(state.lastDay, Math.max(state.firstDay, local.day));
		const n = state.items.length;
		const c = state.confirmedBy.length;
		const mine = state.confirmedBy.includes(me);
		const label = (d) => `${CHAT.month} ${d}`;
		if (!local.editing) {
			const busy = days.filter((d) => state.items.some((i) => i.day === d));
			const empty = days.filter((d) => !busy.includes(d));
			return /* @__PURE__ */ _jsxs("div", { children: [
				/* @__PURE__ */ _jsx(CardHeader, {
					title: state.title,
					subtitle: `${n} ${n === 1 ? "item" : "items"} · ${c} of ${members.length} say it looks right`
				}),
				/* @__PURE__ */ _jsxs("div", {
					style: {
						display: "grid",
						gap: 6
					},
					children: [busy.map((d) => /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							gap: 8,
							alignItems: "flex-start"
						},
						children: [/* @__PURE__ */ _jsx("div", {
							style: {
								width: 52,
								flexShrink: 0,
								fontWeight: 600
							},
							children: /* @__PURE__ */ _jsx("small", {
								style: { color: theme.color.text },
								children: label(d)
							})
						}), /* @__PURE__ */ _jsx("div", {
							style: {
								flex: 1,
								minWidth: 0,
								borderLeft: `2px solid ${theme.color.divider}`,
								paddingLeft: 8,
								display: "grid",
								gap: 2
							},
							children: state.items.filter((i) => i.day === d).map((i) => /* @__PURE__ */ _jsxs("div", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: 4
								},
								children: [/* @__PURE__ */ _jsx("small", {
									style: { color: theme.color.text },
									children: i.text
								}), i.by !== null ? /* @__PURE__ */ _jsx(Avatar, {
									user: i.by,
									size: 16
								}) : null]
							}, i.id))
						})]
					}, d)), busy.length === 0 ? /* @__PURE__ */ _jsx("small", { children: "No plans yet" }) : empty.length ? /* @__PURE__ */ _jsx("small", { children: `No plans: ${empty.map(label).join(", ")}` }) : null]
				}),
				/* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						marginTop: 8
					},
					children: [
						/* @__PURE__ */ _jsx(Button, {
							kind: mine ? "secondary" : "primary",
							onClick: () => dispatch({ t: "confirm" }),
							children: mine ? "Undo" : "Looks right"
						}),
						/* @__PURE__ */ _jsx("div", {
							style: {
								flex: 1,
								minWidth: 0
							},
							children: c ? /* @__PURE__ */ _jsx(Facepile, {
								users: state.confirmedBy,
								max: 3,
								size: 20
							}) : null
						}),
						/* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							onClick: () => setLocal({ editing: true }),
							children: "Edit"
						})
					]
				})
			] });
		}
		const here = state.items.filter((i) => i.day === day);
		const editing = local.item !== null ? state.items.find((i) => i.id === local.item) ?? null : null;
		const text = clean(local.draft);
		const canSave = text.length > 0 && text.length <= MAX_TEXT && (editing !== null || n < MAX_ITEMS);
		const save = () => {
			if (!canSave) return;
			if (editing) dispatch({
				t: "edit",
				id: editing.id,
				text: local.draft
			});
			else dispatch({
				t: "add",
				day,
				text: local.draft
			});
			setLocal({
				draft: "",
				item: null
			});
		};
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: "Pick a day, then add or edit"
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gridTemplateColumns: "repeat(4, 1fr)",
					gap: 4
				},
				children: days.map((d) => /* @__PURE__ */ _jsx(Button, {
					kind: d === day ? "secondary" : "deemphasized",
					wide: true,
					onClick: () => setLocal({
						day: d,
						item: null,
						draft: ""
					}),
					children: String(d)
				}, d))
			}),
			/* @__PURE__ */ _jsx("div", {
				style: { marginTop: 8 },
				children: here.length === 0 ? /* @__PURE__ */ _jsx("small", { children: `Nothing yet on ${label(day)}` }) : here.map((i) => /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 4,
						minHeight: 44
					},
					children: [
						/* @__PURE__ */ _jsx("div", {
							style: {
								flex: 1,
								minWidth: 0
							},
							children: /* @__PURE__ */ _jsx("small", {
								style: { color: theme.color.text },
								children: i.text
							})
						}),
						/* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							onClick: () => setLocal({
								item: i.id,
								draft: i.text
							}),
							children: "Edit"
						}),
						/* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							onClick: () => {
								dispatch({
									t: "remove",
									id: i.id
								});
								if (local.item === i.id) setLocal({
									item: null,
									draft: ""
								});
							},
							children: "Remove"
						})
					]
				}, i.id))
			}),
			/* @__PURE__ */ _jsxs("form", {
				style: {
					display: "flex",
					gap: 8,
					marginTop: 8
				},
				onSubmit: (e) => {
					e.preventDefault();
					save();
				},
				children: [/* @__PURE__ */ _jsx("input", {
					value: local.draft,
					maxLength: MAX_TEXT,
					placeholder: editing ? "Edit item" : `Add to ${label(day)}`,
					"aria-label": editing ? "Edit item" : "Add item",
					onInput: (e) => setLocal({ draft: e.currentTarget.value })
				}), /* @__PURE__ */ _jsx(Button, {
					kind: "secondary",
					disabled: !canSave,
					onClick: save,
					children: editing ? "Save" : "Add"
				})]
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "flex",
					gap: 8,
					marginTop: 8
				},
				children: editing ? /* @__PURE__ */ _jsxs(_Fragment, { children: [
					/* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						disabled: editing.day <= state.firstDay,
						onClick: () => {
							dispatch({
								t: "move",
								id: editing.id,
								day: editing.day - 1
							});
							setLocal({ day: editing.day - 1 });
						},
						children: "Earlier"
					}),
					/* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						disabled: editing.day >= state.lastDay,
						onClick: () => {
							dispatch({
								t: "move",
								id: editing.id,
								day: editing.day + 1
							});
							setLocal({ day: editing.day + 1 });
						},
						children: "Later"
					}),
					/* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						onClick: () => setLocal({
							item: null,
							draft: ""
						}),
						children: "Cancel"
					})
				] }) : /* @__PURE__ */ _jsx(Button, {
					kind: "secondary",
					onClick: () => setLocal({
						editing: false,
						item: null,
						draft: ""
					}),
					children: "Done"
				})
			})
		] });
	}
});
