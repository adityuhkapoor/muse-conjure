import { defineApp, Button, CardHeader, Facepile, Toast } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Bring list for the friendsgiving. Each item takes 1 or 2 people. Tap to join or leave.
const CHAT = {
	title: "Who's bringing what?",
	when: "Sat 7pm",
	cap: 2,
	items: [
		{
			label: "Cups",
			note: "Wren has 4 mugs and a mason jar"
		},
		{
			label: "Ice",
			note: "2 bags minimum"
		},
		{
			label: "Chips and dip",
			note: "Tostitos, spinach dip"
		},
		{
			label: "Speaker",
			note: "Jake's JBL, needs charger from car"
		},
		{
			label: "Plates and forks",
			note: "Paper plates, Costco 200 ct"
		},
		{
			label: "Chairs",
			note: "6 more needed, 8 people coming"
		},
		{
			label: "Power strip",
			note: "For speaker and crockpot"
		}
	]
};
const MAX_ITEMS = 12;
const MAX_LABEL = 40;
const clean = (label) => label.trim().replace(/\s+/g, " ");
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const itemOf = (s, id) => s.items.find((i) => i.id === id);
/** Same items in the same order; every item except `id` is exactly as it was. */
const othersSame = (p, n, id) => p.items.length === n.items.length && p.items.every((x, i) => x.id === id || JSON.stringify(n.items[i]) === JSON.stringify(x));
function join(s, user, id) {
	const item = itemOf(s, id);
	if (!item || item.people.includes(user) || item.people.length >= s.cap) return s;
	return {
		...s,
		items: s.items.map((i) => i.id === item.id ? {
			...i,
			people: [...i.people, user]
		} : i)
	};
}
function leave(s, user, id) {
	const item = itemOf(s, id);
	if (!item || !item.people.includes(user)) return s;
	return {
		...s,
		items: s.items.map((i) => i.id === item.id ? {
			...i,
			people: i.people.filter((u) => u !== user)
		} : i)
	};
}
function add(s, user, raw, seq) {
	if (typeof raw !== "string") return s;
	const label = clean(raw);
	if (!label || label.length > MAX_LABEL || s.items.length >= MAX_ITEMS) return s;
	if (s.items.some((i) => i.label.toLowerCase() === label.toLowerCase())) return s;
	return {
		...s,
		items: [...s.items, {
			id: `i${seq}`,
			label,
			note: "",
			people: [user]
		}]
	};
}
const covered = (s) => s.items.filter((i) => i.people.length > 0).length;
export default defineApp({
	name: "Bring list",
	summary: (s) => `${CHAT.title} ${covered(s)} of ${s.items.length} items covered.`,
	init: () => {
		const seen = new Set();
		const items = [];
		for (const raw of CHAT.items) {
			const label = clean(raw.label).slice(0, MAX_LABEL);
			if (!label || seen.has(label.toLowerCase()) || items.length >= MAX_ITEMS) continue;
			seen.add(label.toLowerCase());
			items.push({
				id: `p${items.length}`,
				label,
				note: clean(raw.note).slice(0, 60),
				people: []
			});
		}
		return {
			cap: CHAT.cap,
			items
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "join") return join(state, meta.user, action.item);
		if (action.t === "leave") return leave(state, meta.user, action.item);
		if (action.t === "add") return add(state, meta.user, action.label, meta.seq);
		return state;
	},
	// Someone left: their sign-ups open up again.
	onMembers: (state, ctx) => {
		if (state.items.every((i) => i.people.every((u) => inChat(ctx, u)))) return state;
		return {
			...state,
			items: state.items.map((i) => i.people.every((u) => inChat(ctx, u)) ? i : {
				...i,
				people: i.people.filter((u) => inChat(ctx, u))
			})
		};
	},
	invariants: {
		"no item has more people than the cap": (s) => s.items.every((i) => i.people.length <= s.cap),
		"no one is on the same item twice": (s) => s.items.every((i) => new Set(i.people).size === i.people.length),
		"everyone signed up is in the chat": (s, ctx) => s.items.every((i) => i.people.every((u) => inChat(ctx, u))),
		"ids are unique and labels are unique ignoring case": (s) => new Set(s.items.map((i) => i.id)).size === s.items.length && new Set(s.items.map((i) => i.label.toLowerCase())).size === s.items.length,
		"at most 12 items, each label 1 to 40 characters": (s) => s.items.length <= MAX_ITEMS && s.items.every((i) => i.label.length > 0 && i.label.length <= MAX_LABEL && i.label === clean(i.label))
	},
	transitions: {
		"a join adds the actor to that item and changes no other item": (p, n, a, m) => {
			if (a.t !== "join" || p === n) return true;
			const before = itemOf(p, a.item);
			const after = itemOf(n, a.item);
			return !!before && !!after && after.people.join() === [...before.people, m.user].join() && othersSame(p, n, before.id);
		},
		"a join only happens when the item has room": (p, n, a) => {
			if (a.t !== "join" || p === n) return true;
			const before = itemOf(p, a.item);
			return !!before && before.people.length < p.cap;
		},
		"a leave removes only the actor from that item and changes no other item": (p, n, a, m) => {
			if (a.t !== "leave" || p === n) return true;
			const before = itemOf(p, a.item);
			const after = itemOf(n, a.item);
			return !!before && !!after && before.people.includes(m.user) && after.people.join() === before.people.filter((u) => u !== m.user).join() && othersSame(p, n, before.id);
		},
		"an add appends one item last with the actor as its only person": (p, n, a, m) => {
			if (a.t !== "add" || p === n) return true;
			const last = n.items.at(-1);
			return n.items.length === p.items.length + 1 && !!last && last.label === clean(a.label) && last.id === `i${m.seq}` && last.people.length === 1 && last.people[0] === m.user && p.items.every((x, i) => JSON.stringify(n.items[i]) === JSON.stringify(x));
		},
		"existing labels, ids and the cap never change": (p, n) => p.cap === n.cap && n.items.length >= p.items.length && p.items.every((x, i) => n.items[i]?.id === x.id && n.items[i]?.label === x.label),
		"only people in the chat change the list": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		const k = r.next();
		if (s.items.length === 0 || k < .12) return {
			t: "add",
			label: r.pick([
				"Napkins",
				"Crockpot",
				"  Ice ",
				"",
				"Dessert",
				"Cups"
			])
		};
		const mine = s.items.filter((i) => i.people.includes(user));
		if (mine.length && k < .35) return {
			t: "leave",
			item: r.pick(mine).id
		};
		return {
			t: "join",
			item: r.pick(s.items).id
		};
	},
	local: {
		draft: "",
		open: false,
		toast: 0
	},
	view: ({ state, me, dispatch, local, setLocal }) => {
		const { draft, open, toast } = local;
		const submit = () => {
			if (!clean(draft)) return;
			dispatch({
				t: "add",
				label: draft.slice(0, MAX_LABEL)
			});
			setLocal({
				draft: "",
				open: false,
				toast: toast + 1
			});
		};
		return /* @__PURE__ */ _jsxs("div", {
			style: {
				maxWidth: "100%",
				minWidth: 0
			},
			children: [
				/* @__PURE__ */ _jsx(CardHeader, {
					title: CHAT.title,
					subtitle: `${CHAT.when} · ${covered(state)} of ${state.items.length} covered`
				}),
				/* @__PURE__ */ _jsx("div", {
					style: {
						display: "grid",
						gap: 0,
						gridTemplateColumns: "minmax(0, 1fr)",
						maxWidth: "100%",
						minWidth: 0
					},
					children: state.items.map((i) => {
						const mine = i.people.includes(me);
						const full = i.people.length >= state.cap;
						return /* @__PURE__ */ _jsxs("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 8,
								minHeight: 44,
								minWidth: 0,
								maxWidth: "100%"
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
									}), /* @__PURE__ */ _jsxs("small", {
										style: {
											display: "block",
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap"
										},
										children: [i.note ? `${i.note} · ` : "", i.people.length === 0 ? "Open" : `${i.people.length} of ${state.cap}`]
									})]
								}),
								i.people.length ? /* @__PURE__ */ _jsx(Facepile, {
									users: i.people,
									max: 2,
									size: 20
								}) : null,
								mine ? /* @__PURE__ */ _jsx(Button, {
									kind: "secondary",
									onClick: () => dispatch({
										t: "leave",
										item: i.id
									}),
									children: "Leave"
								}) : full ? /* @__PURE__ */ _jsx("small", {
									style: {
										minWidth: 40,
										textAlign: "center"
									},
									children: "Full"
								}) : /* @__PURE__ */ _jsx(Button, {
									kind: "deemphasized",
									onClick: () => dispatch({
										t: "join",
										item: i.id
									}),
									children: "Join"
								})
							]
						}, i.id);
					})
				}),
				state.items.length < MAX_ITEMS ? open ? /* @__PURE__ */ _jsxs("form", {
					style: {
						display: "flex",
						gap: 8,
						marginTop: 4
					},
					onSubmit: (e) => {
						e.preventDefault();
						submit();
					},
					children: [/* @__PURE__ */ _jsx("input", {
						value: draft,
						maxLength: MAX_LABEL,
						placeholder: "Item name",
						"aria-label": "Item name",
						onInput: (e) => setLocal({ draft: e.currentTarget.value })
					}), /* @__PURE__ */ _jsx(Button, {
						kind: "primary",
						disabled: !clean(draft),
						onClick: submit,
						children: "Add"
					})]
				}) : /* @__PURE__ */ _jsx("div", {
					style: { marginTop: 4 },
					children: /* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						onClick: () => setLocal({ open: true }),
						children: "Add item"
					})
				}) : null,
				toast ? /* @__PURE__ */ _jsx(Toast, { children: "Item added" }, toast) : null
			]
		});
	}
});
