import { defineApp, Button, CardHeader, OptionRow, Toast } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Semester recap: a shared list of memories with places and dates. Everyone can heart the ones
// they loved, add one, and remove the ones they added.
const CHAT = {
	title: "Fall semester recap",
	memories: [
		{
			label: "Apple picking at Barber Farm",
			date: "Sept 21"
		},
		{
			label: "Halloween at the co-op",
			date: ""
		},
		{
			label: "Road trip to Montreal",
			date: "Oct 18"
		},
		{
			label: "Cornell game",
			date: "Nov 2"
		},
		{
			label: "Secret Santa at Kofi's place",
			date: "Dec 6"
		},
		{
			label: "Pho 79 after the last final",
			date: "Dec 13"
		}
	]
};
const MAX_MEMORIES = 12;
const MAX_LABEL = 40;
const MAX_DATE = 12;
const PER_PAGE = 3;
const clean = (s) => s.trim().replace(/\s+/g, " ");
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const heartCount = (s) => s.memories.reduce((n, m) => n + m.hearts.length, 0);
const hearted = (s, id, u) => s.memories.some((m) => m.id === id && m.hearts.includes(u));
/** The whole state as text, minus one person's heart on one memory, so two states can be compared. */
const strip = (s, id, u) => JSON.stringify(s.memories.map((m) => m.id === id ? {
	...m,
	hearts: m.hearts.filter((h) => h !== u)
} : m)) + JSON.stringify(s.addedBy);
function heart(s, user, id) {
	if (typeof id !== "string") return s;
	const target = s.memories.find((m) => m.id === id);
	if (!target) return s;
	const had = target.hearts.includes(user);
	return {
		...s,
		memories: s.memories.map((m) => m.id === target.id ? {
			...m,
			hearts: had ? m.hearts.filter((h) => h !== user) : [...m.hearts, user]
		} : m)
	};
}
function add(s, user, rawLabel, rawDate, seq) {
	if (typeof rawLabel !== "string" || typeof rawDate !== "string") return s;
	const label = clean(rawLabel);
	const date = clean(rawDate);
	if (!label || label.length > MAX_LABEL || date.length > MAX_DATE) return s;
	if (s.memories.length >= MAX_MEMORIES) return s;
	if (s.memories.some((m) => m.label.toLowerCase() === label.toLowerCase())) return s;
	const id = `m${seq}`;
	if (s.memories.some((m) => m.id === id)) return s;
	return {
		...s,
		memories: [...s.memories, {
			id,
			label,
			date,
			hearts: []
		}],
		addedBy: {
			...s.addedBy,
			[id]: user
		}
	};
}
function remove(s, user, id) {
	if (typeof id !== "string") return s;
	if (!s.memories.some((m) => m.id === id)) return s;
	if (s.addedBy[id] !== user) return s;
	return {
		...s,
		memories: s.memories.filter((m) => m.id !== id),
		addedBy: Object.fromEntries(Object.entries(s.addedBy).filter(([k]) => k !== id))
	};
}
export default defineApp({
	name: "Semester recap",
	summary: (s) => `${s.title} · ${s.memories.length} memories · ${heartCount(s)} hearts`,
	init: () => {
		const seen = new Set();
		const memories = [];
		for (const raw of CHAT.memories) {
			const label = clean(raw.label).slice(0, MAX_LABEL);
			if (!label || seen.has(label.toLowerCase()) || memories.length >= MAX_MEMORIES) continue;
			seen.add(label.toLowerCase());
			memories.push({
				id: `p${memories.length}`,
				label,
				date: clean(raw.date).slice(0, MAX_DATE),
				hearts: []
			});
		}
		return {
			title: clean(CHAT.title).slice(0, 60) || "Semester recap",
			memories,
			addedBy: {}
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "heart") return heart(state, meta.user, action.memory);
		if (action.t === "add") return add(state, meta.user, action.label, action.date, meta.seq);
		if (action.t === "remove") return remove(state, meta.user, action.memory);
		return state;
	},
	// Someone left: their hearts go and they are no longer the adder. The memories stay.
	onMembers: (state, ctx) => {
		const heartsOk = state.memories.every((m) => m.hearts.every((h) => inChat(ctx, h)));
		const addersOk = Object.values(state.addedBy).every((u) => inChat(ctx, u));
		if (heartsOk && addersOk) return state;
		return {
			...state,
			memories: heartsOk ? state.memories : state.memories.map((m) => ({
				...m,
				hearts: m.hearts.filter((h) => inChat(ctx, h))
			})),
			addedBy: addersOk ? state.addedBy : Object.fromEntries(Object.entries(state.addedBy).filter(([, u]) => inChat(ctx, u)))
		};
	},
	invariants: {
		"no one hearts a memory twice": (s) => s.memories.every((m) => new Set(m.hearts).size === m.hearts.length),
		"everyone who hearted is in the chat": (s, ctx) => s.memories.every((m) => m.hearts.every((h) => inChat(ctx, h))),
		"memory ids are unique and labels are unique ignoring case": (s) => new Set(s.memories.map((m) => m.id)).size === s.memories.length && new Set(s.memories.map((m) => m.label.toLowerCase())).size === s.memories.length,
		"at most 12 memories, each label 1 to 40 characters and each date at most 12": (s) => s.memories.length <= MAX_MEMORIES && s.memories.every((m) => m.label.length > 0 && m.label.length <= MAX_LABEL && m.label === clean(m.label) && m.date.length <= MAX_DATE),
		"every adder entry points at an existing memory and an adder in the chat": (s, ctx) => Object.entries(s.addedBy).every(([id, u]) => s.memories.some((m) => m.id === id) && inChat(ctx, u))
	},
	transitions: {
		"a heart flips only the actor's heart on that memory": (p, n, a, m) => a.t !== "heart" || p === n || strip(p, a.memory, m.user) === strip(n, a.memory, m.user) && hearted(p, a.memory, m.user) !== hearted(n, a.memory, m.user),
		"an add appends one memory last, with no hearts, and records the actor as adder": (p, n, a, m) => {
			if (a.t !== "add" || p === n) return true;
			const last = n.memories.at(-1);
			return n.memories.length === p.memories.length + 1 && !!last && last.id === `m${m.seq}` && last.label === clean(String(a.label)) && last.date === clean(String(a.date)) && last.hearts.length === 0 && n.addedBy[last.id] === m.user && Object.keys(n.addedBy).length === Object.keys(p.addedBy).length + 1 && JSON.stringify(n.memories.slice(0, -1)) === JSON.stringify(p.memories);
		},
		"a remove deletes one memory, and only one the actor added": (p, n, a, m) => a.t !== "remove" || p === n || p.addedBy[String(a.memory)] === m.user && n.memories.length === p.memories.length - 1 && !n.memories.some((x) => x.id === a.memory) && n.addedBy[String(a.memory)] === undefined && JSON.stringify(n.memories) === JSON.stringify(p.memories.filter((x) => x.id !== a.memory)),
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
		"the title never changes": (p, n) => p.title === n.title
	},
	arbitrary: (s, user, r) => {
		const k = r.next();
		const mine = s.memories.filter((x) => s.addedBy[x.id] === user);
		if (k < .5 && s.memories.length) return {
			t: "heart",
			memory: r.pick(s.memories).id
		};
		if (k < .8 || !s.memories.length) return {
			t: "add",
			label: r.pick([
				"Study group at the library",
				"Late night diner run",
				"Snow day",
				"   ",
				"Cornell game",
				"Lake walk"
			]),
			date: r.pick([
				"Nov 20",
				"",
				"Dec 1",
				"Oct 5"
			])
		};
		if (mine.length && k < .95) return {
			t: "remove",
			memory: r.pick(mine).id
		};
		return {
			t: "remove",
			memory: r.pick(s.memories).id
		};
	},
	local: {
		page: 0,
		draft: "",
		date: "",
		toast: 0
	},
	view: ({ state, me, members, dispatch, local, setLocal }) => {
		const n = state.memories.length;
		const hearts = heartCount(state);
		const pages = Math.max(1, Math.ceil(n / PER_PAGE));
		const page = Math.min(local.page, pages - 1);
		const shown = state.memories.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
		const canAdd = clean(local.draft).length > 0 && n < MAX_MEMORIES;
		const submit = () => {
			if (!canAdd) return;
			dispatch({
				t: "add",
				label: local.draft.slice(0, MAX_LABEL),
				date: local.date.slice(0, MAX_DATE)
			});
			setLocal({
				draft: "",
				date: "",
				toast: local.toast + 1,
				page: Math.floor(n / PER_PAGE)
			});
		};
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `${n} ${n === 1 ? "memory" : "memories"} · ${hearts} ${hearts === 1 ? "heart" : "hearts"}`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 2
				},
				children: shown.map((mem) => /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 4
					},
					children: [/* @__PURE__ */ _jsxs("div", {
						style: {
							flex: 1,
							minWidth: 0
						},
						children: [/* @__PURE__ */ _jsx(OptionRow, {
							label: mem.label,
							count: mem.hearts.length,
							total: Math.max(1, members.length),
							voters: mem.hearts,
							selected: mem.hearts.includes(me),
							onClick: () => dispatch({
								t: "heart",
								memory: mem.id
							})
						}), mem.date ? /* @__PURE__ */ _jsx("small", {
							style: {
								display: "block",
								paddingLeft: 12
							},
							children: mem.date
						}) : null]
					}), state.addedBy[mem.id] === me ? /* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						onClick: () => dispatch({
							t: "remove",
							memory: mem.id
						}),
						children: "Remove"
					}) : null]
				}, mem.id))
			}),
			pages > 1 ? /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					marginTop: 4
				},
				children: [
					/* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						disabled: page === 0,
						onClick: () => setLocal({ page: page - 1 }),
						children: "Back"
					}),
					/* @__PURE__ */ _jsx("small", { children: `${page + 1} of ${pages}` }),
					/* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						disabled: page >= pages - 1,
						onClick: () => setLocal({ page: page + 1 }),
						children: "Next"
					})
				]
			}) : null,
			n < MAX_MEMORIES ? /* @__PURE__ */ _jsxs("form", {
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
					/* @__PURE__ */ _jsx("div", {
						style: {
							flex: 1,
							minWidth: 0
						},
						children: /* @__PURE__ */ _jsx("input", {
							value: local.draft,
							maxLength: MAX_LABEL,
							placeholder: "Add memory",
							"aria-label": "Add memory",
							onInput: (e) => setLocal({ draft: e.currentTarget.value })
						})
					}),
					/* @__PURE__ */ _jsx("div", {
						style: {
							width: 84,
							flex: "none"
						},
						children: /* @__PURE__ */ _jsx("input", {
							value: local.date,
							maxLength: MAX_DATE,
							placeholder: "Date",
							"aria-label": "Date",
							onInput: (e) => setLocal({ date: e.currentTarget.value })
						})
					}),
					/* @__PURE__ */ _jsx(Button, {
						kind: "primary",
						disabled: !canAdd,
						onClick: submit,
						children: "Add"
					})
				]
			}) : null,
			local.toast ? /* @__PURE__ */ _jsx(Toast, { children: "Memory added" }, local.toast) : null
		] });
	}
});
