import { defineApp, Button, CardHeader, Facepile, SystemLine, Toast } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Semester recap: one shared timeline of memories and upcoming dates. Anyone can add an entry
// and tap "I was there" or "I'm in". Only the person who added an entry can remove it.
const C = {
	title: "Semester recap",
	today: {
		m: 11,
		d: 12
	},
	entries: [
		{
			title: "Lake Lanier trip",
			m: 9,
			d: 13,
			note: "The canoe incident"
		},
		{
			title: "Tate concert",
			m: 10,
			d: 4,
			note: "Saturday, Waffle House at 3am after"
		},
		{
			title: "Dollar cinema",
			m: 10,
			d: 22,
			note: "Every Wed, saw the shark movie"
		},
		{
			title: "Hugo's birthday at Chipotle",
			m: 10,
			d: 29,
			note: ""
		},
		{
			title: "Library all nighter",
			m: 12,
			d: 8,
			note: "Bring snacks"
		},
		{
			title: "Winter formal",
			m: 12,
			d: 12,
			note: "At the Marriott"
		}
	]
};
const MAX_ENTRIES = 12;
const MAX_TEXT = 40;
const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec"
];
const clean = (s) => s.trim().replace(/\s+/g, " ");
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const isInt = (x) => typeof x === "number" && Number.isInteger(x);
const byDate = (a, b) => a.m - b.m || a.d - b.d;
const fmt = (m, d) => `${MONTHS[m - 1] ?? "?"} ${d}`;
const isPast = (e, t) => e.m < t.m || e.m === t.m && e.d < t.d;
const without = (xs, u) => xs.filter((x) => x !== u).join();
const othersSame = (p, n, id) => JSON.stringify(p.entries.filter((e) => e.id !== id)) === JSON.stringify(n.entries.filter((e) => e.id !== id));
const validDate = (m, d) => isInt(m) && isInt(d) && m >= 1 && m <= 12 && d >= 1 && d <= 31;
function add(s, user, seq, title, m, d, note) {
	if (typeof title !== "string" || typeof note !== "string") return s;
	if (!isInt(m) || !isInt(d) || !validDate(m, d)) return s;
	const t = clean(title);
	const n = clean(note);
	if (!t || t.length > MAX_TEXT || n.length > MAX_TEXT) return s;
	if (s.entries.length >= MAX_ENTRIES) return s;
	if (s.entries.some((e) => e.title.toLowerCase() === t.toLowerCase() && e.m === m && e.d === d)) return s;
	const entry = {
		id: `e${seq}`,
		title: t,
		m,
		d,
		note: n,
		by: user,
		likes: [user]
	};
	return {
		...s,
		entries: [...s.entries, entry].sort(byDate)
	};
}
function join(s, user, id) {
	const e = s.entries.find((x) => x.id === id);
	if (!e) return s;
	const likes = e.likes.includes(user) ? e.likes.filter((u) => u !== user) : [...e.likes, user];
	return {
		...s,
		entries: s.entries.map((x) => x.id === e.id ? {
			...x,
			likes
		} : x)
	};
}
function remove(s, user, id) {
	const e = s.entries.find((x) => x.id === id);
	if (!e || e.by === null || e.by !== user) return s;
	return {
		...s,
		entries: s.entries.filter((x) => x.id !== e.id)
	};
}
export default defineApp({
	name: "Semester recap",
	summary: (s) => {
		const past = s.entries.filter((e) => isPast(e, s.today)).length;
		const up = s.entries.length - past;
		return `${C.title}. ${up} coming up, ${past} behind us.`;
	},
	init: () => {
		const entries = C.entries.map((e, i) => ({
			id: `p${i}`,
			title: clean(e.title).slice(0, MAX_TEXT),
			m: e.m,
			d: e.d,
			note: clean(e.note).slice(0, MAX_TEXT),
			by: null,
			likes: []
		})).sort(byDate);
		return {
			today: {
				m: C.today.m,
				d: C.today.d
			},
			entries
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "add") return add(state, meta.user, meta.seq, action.title, action.m, action.d, action.note);
		if (action.t === "join") return join(state, meta.user, action.id);
		if (action.t === "remove") return remove(state, meta.user, action.id);
		return state;
	},
	// Someone left: their "I was there" goes with them, and their entries stay with no owner.
	onMembers: (state, ctx) => {
		if (state.entries.every((e) => e.likes.every((u) => inChat(ctx, u)) && (e.by === null || inChat(ctx, e.by)))) return state;
		return {
			...state,
			entries: state.entries.map((e) => ({
				...e,
				likes: e.likes.filter((u) => inChat(ctx, u)),
				by: e.by !== null && inChat(ctx, e.by) ? e.by : null
			}))
		};
	},
	invariants: {
		"entries are sorted by month then day": (s) => s.entries.every((e, i) => i === 0 || byDate(s.entries[i - 1], e) <= 0),
		"ids are unique and there are at most 12 entries": (s) => s.entries.length <= MAX_ENTRIES && new Set(s.entries.map((e) => e.id)).size === s.entries.length,
		"every entry has a short title and a real date": (s) => s.entries.every((e) => e.title.length > 0 && e.title.length <= MAX_TEXT && e.title === clean(e.title) && e.note.length <= MAX_TEXT && validDate(e.m, e.d)),
		"no one is listed twice on an entry": (s) => s.entries.every((e) => new Set(e.likes).size === e.likes.length),
		"people on entries are in the chat": (s, ctx) => s.entries.every((e) => e.likes.every((u) => inChat(ctx, u)) && (e.by === null || inChat(ctx, e.by))),
		"today is always Nov 12": (s) => s.today.m === 11 && s.today.d === 12
	},
	transitions: {
		"an add puts one new entry in with the actor on it and leaves the rest alone": (p, n, a, m) => {
			if (a.t !== "add" || p === n) return true;
			if (typeof a.title !== "string" || typeof a.note !== "string") return false;
			const id = `e${m.seq}`;
			const e = n.entries.find((x) => x.id === id);
			return n.entries.length === p.entries.length + 1 && !!e && e.by === m.user && e.likes.length === 1 && e.likes[0] === m.user && e.title === clean(a.title) && e.note === clean(a.note) && e.m === a.m && e.d === a.d && othersSame(p, n, id);
		},
		"a join flips the actor on that one entry and changes nothing else": (p, n, a, m) => {
			if (a.t !== "join" || p === n) return true;
			const b = p.entries.find((e) => e.id === a.id);
			const x = n.entries.find((e) => e.id === a.id);
			return !!b && !!x && p.entries.length === n.entries.length && othersSame(p, n, b.id) && b.likes.includes(m.user) !== x.likes.includes(m.user) && without(b.likes, m.user) === without(x.likes, m.user) && JSON.stringify({
				...b,
				likes: []
			}) === JSON.stringify({
				...x,
				likes: []
			});
		},
		"a remove deletes one entry and only the one the actor added": (p, n, a, m) => {
			if (a.t !== "remove" || p === n) return true;
			const b = p.entries.find((e) => e.id === a.id);
			return !!b && b.by === m.user && n.entries.length === p.entries.length - 1 && !n.entries.some((e) => e.id === b.id) && othersSame(p, n, b.id);
		},
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
		"only add, join and remove change entries, and today never moves": (p, n, a) => p.today.m === n.today.m && p.today.d === n.today.d && (p === n || a.t === "add" || a.t === "join" || a.t === "remove")
	},
	arbitrary: (s, user, r) => {
		const k = r.next();
		const mine = s.entries.filter((e) => e.by === user);
		if (k < .12 && mine.length) return {
			t: "remove",
			id: r.pick(mine).id
		};
		if (k < .45 || s.entries.length === 0) return {
			t: "add",
			title: r.pick([
				"Study session",
				"Brunch",
				"Game night",
				"Road trip",
				"Movie night",
				""
			]),
			m: r.pick([
				9,
				10,
				11,
				12,
				12,
				13
			]),
			d: r.int(31) + 1,
			note: r.pick([
				"",
				"Bring snacks",
				"Saturday"
			])
		};
		return {
			t: "join",
			id: r.pick(s.entries).id
		};
	},
	local: {
		open: false,
		adding: false,
		title: "",
		m: "",
		d: "",
		note: "",
		toast: 0
	},
	view: ({ state, me, dispatch, local, setLocal }) => {
		const past = state.entries.filter((e) => isPast(e, state.today));
		const upcoming = state.entries.filter((e) => !isPast(e, state.today));
		const m = Number(local.m);
		const d = Number(local.d);
		const canSave = clean(local.title).length > 0 && local.m.trim() !== "" && local.d.trim() !== "" && validDate(m, d);
		const save = () => {
			if (!canSave) return;
			dispatch({
				t: "add",
				title: local.title,
				m,
				d,
				note: local.note
			});
			setLocal({
				adding: false,
				title: "",
				m: "",
				d: "",
				note: "",
				toast: local.toast + 1
			});
		};
		const row = (e, wasPast) => {
			const mine = e.likes.includes(me);
			const label = wasPast ? mine ? "Was there" : "I was there" : mine ? "In" : "I'm in";
			return /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					minHeight: 52,
					padding: "4px 0"
				},
				children: [/* @__PURE__ */ _jsxs("div", {
					style: {
						flex: 1,
						minWidth: 0
					},
					children: [
						/* @__PURE__ */ _jsx("div", {
							style: { fontWeight: 600 },
							children: e.title
						}),
						/* @__PURE__ */ _jsx("small", { children: e.note ? `${fmt(e.m, e.d)} · ${e.note}` : fmt(e.m, e.d) }),
						e.likes.length ? /* @__PURE__ */ _jsx("div", {
							style: { marginTop: 2 },
							children: /* @__PURE__ */ _jsx(Facepile, {
								users: e.likes,
								max: 4,
								size: 20
							})
						}) : null
					]
				}), /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "grid",
						gap: 0
					},
					children: [/* @__PURE__ */ _jsx(Button, {
						kind: mine ? "secondary" : "deemphasized",
						onClick: () => dispatch({
							t: "join",
							id: e.id
						}),
						children: label
					}), e.by === me ? /* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						onClick: () => dispatch({
							t: "remove",
							id: e.id
						}),
						children: "Remove"
					}) : null]
				})]
			}, e.id);
		};
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: C.title,
				subtitle: `${upcoming.length} coming up · ${past.length} behind us`
			}),
			past.length ? /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx(Button, {
				kind: "deemphasized",
				wide: true,
				onClick: () => setLocal({ open: !local.open }),
				children: local.open ? "Hide earlier" : `Show earlier · ${past.length}`
			}), local.open ? past.map((e) => row(e, true)) : null] }) : null,
			/* @__PURE__ */ _jsx(SystemLine, { children: `Today · ${fmt(state.today.m, state.today.d)}` }),
			upcoming.length ? upcoming.map((e) => row(e, false)) : /* @__PURE__ */ _jsx("small", { children: "Nothing coming up yet" }),
			local.adding ? /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 8,
					marginTop: 8
				},
				children: [
					/* @__PURE__ */ _jsx("input", {
						value: local.title,
						maxLength: MAX_TEXT,
						placeholder: "Title",
						"aria-label": "Title",
						onInput: (e) => setLocal({ title: e.currentTarget.value })
					}),
					/* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							gap: 8
						},
						children: [/* @__PURE__ */ _jsx("input", {
							style: { minWidth: 0 },
							value: local.m,
							maxLength: 2,
							placeholder: "Month (1-12)",
							"aria-label": "Month",
							onInput: (e) => setLocal({ m: e.currentTarget.value })
						}), /* @__PURE__ */ _jsx("input", {
							style: { minWidth: 0 },
							value: local.d,
							maxLength: 2,
							placeholder: "Day",
							"aria-label": "Day",
							onInput: (e) => setLocal({ d: e.currentTarget.value })
						})]
					}),
					/* @__PURE__ */ _jsx("input", {
						value: local.note,
						maxLength: MAX_TEXT,
						placeholder: "Note (optional)",
						"aria-label": "Note",
						onInput: (e) => setLocal({ note: e.currentTarget.value })
					}),
					/* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							gap: 8
						},
						children: [/* @__PURE__ */ _jsx(Button, {
							kind: "primary",
							disabled: !canSave,
							onClick: save,
							children: "Save"
						}), /* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							onClick: () => setLocal({ adding: false }),
							children: "Cancel"
						})]
					})
				]
			}) : state.entries.length < MAX_ENTRIES ? /* @__PURE__ */ _jsx("div", {
				style: { marginTop: 8 },
				children: /* @__PURE__ */ _jsx(Button, {
					kind: "primary",
					wide: true,
					onClick: () => setLocal({ adding: true }),
					children: "Add memory"
				})
			}) : null,
			local.toast ? /* @__PURE__ */ _jsx(Toast, { children: "Memory added" }, local.toast) : null
		] });
	}
});
