import { defineApp, Avatar, Button, CardHeader, SystemLine } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Ride signup: one driver per airport trip. First claim wins; only the driver can release.
const CHAT = {
	title: "Who's driving each airport trip?",
	trips: [
		{
			who: "Sam",
			place: "ORD",
			when: "Tuesday 4:40 PM",
			kind: "pickup",
			note: "Moved from 6"
		},
		{
			who: "Priya",
			place: "Midway",
			when: "Wednesday around 9 AM",
			kind: "pickup",
			note: ""
		},
		{
			who: "Priya",
			place: "Midway",
			when: "Sunday 7 PM",
			kind: "dropoff",
			note: ""
		}
	]
};
const MAX_TRIPS = 12;
const MAX_NOTE = 40;
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const covered = (s) => s.trips.filter((t) => t.driver !== null).length;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Every trip other than `id` is unchanged. */
const othersSame = (p, n, id) => p.trips.length === n.trips.length && p.trips.every((t, i) => t.id === id || same(t, n.trips[i]));
const label = (t) => `${t.who} ${t.kind === "pickup" ? "pickup" : "drop-off"}`;
function update(s, id, f) {
	return {
		...s,
		trips: s.trips.map((t) => t.id === id ? f(t) : t)
	};
}
export default defineApp({
	name: "Ride signup",
	summary: (s) => `${s.title} ${covered(s)} of ${s.trips.length} covered.`,
	init: () => ({
		title: CHAT.title,
		trips: CHAT.trips.slice(0, MAX_TRIPS).map((t, i) => ({
			id: `t${i}`,
			who: t.who,
			place: t.place,
			when: t.when,
			kind: t.kind,
			driver: null,
			note: t.note.trim().slice(0, MAX_NOTE)
		}))
	}),
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "claim") {
			if (typeof action.trip !== "string") return state;
			const t = state.trips.find((x) => x.id === action.trip);
			if (!t || t.driver !== null) return state;
			return update(state, t.id, (x) => ({
				...x,
				driver: meta.user
			}));
		}
		if (action.t === "release") {
			if (typeof action.trip !== "string") return state;
			const t = state.trips.find((x) => x.id === action.trip);
			if (!t || t.driver !== meta.user) return state;
			return update(state, t.id, (x) => ({
				...x,
				driver: null
			}));
		}
		if (action.t === "note") {
			if (typeof action.trip !== "string" || typeof action.text !== "string") return state;
			const t = state.trips.find((x) => x.id === action.trip);
			const text = action.text.trim();
			if (!t || text.length > MAX_NOTE || text === t.note) return state;
			return update(state, t.id, (x) => ({
				...x,
				note: text
			}));
		}
		return state;
	},
	// Someone left: their trips are open again.
	onMembers: (state, ctx) => {
		if (state.trips.every((t) => t.driver === null || inChat(ctx, t.driver))) return state;
		return {
			...state,
			trips: state.trips.map((t) => t.driver !== null && !inChat(ctx, t.driver) ? {
				...t,
				driver: null
			} : t)
		};
	},
	invariants: {
		"trip ids are unique": (s) => new Set(s.trips.map((t) => t.id)).size === s.trips.length,
		"every driver is open or in the chat": (s, ctx) => s.trips.every((t) => t.driver === null || inChat(ctx, t.driver)),
		"notes are trimmed and at most 40 characters": (s) => s.trips.every((t) => t.note.length <= MAX_NOTE && t.note === t.note.trim()),
		"trips are never added or removed": (s) => s.trips.length === Math.min(MAX_TRIPS, CHAT.trips.length)
	},
	transitions: {
		"a claim gives an open trip to the actor and changes no other trip": (p, n, a, m) => {
			if (a.t !== "claim" || p === n) return true;
			const before = p.trips.find((t) => t.id === a.trip);
			const after = n.trips.find((t) => t.id === a.trip);
			return !!before && !!after && before.driver === null && after.driver === m.user && same({
				...after,
				driver: null
			}, before) && othersSame(p, n, a.trip);
		},
		"a release clears only the actor's own trip": (p, n, a, m) => {
			if (a.t !== "release" || p === n) return true;
			const before = p.trips.find((t) => t.id === a.trip);
			const after = n.trips.find((t) => t.id === a.trip);
			return !!before && !!after && before.driver === m.user && after.driver === null && same({
				...after,
				driver: before.driver
			}, before) && othersSame(p, n, a.trip);
		},
		"a note changes only that trip's note": (p, n, a) => {
			if (a.t !== "note" || p === n) return true;
			const before = p.trips.find((t) => t.id === a.trip);
			const after = n.trips.find((t) => t.id === a.trip);
			return !!before && !!after && typeof a.text === "string" && after.note === a.text.trim() && same({
				...after,
				note: ""
			}, {
				...before,
				note: ""
			}) && othersSame(p, n, a.trip);
		},
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
		"a driver is never swapped for another driver in one step": (p, n) => p.trips.every((t, i) => t.driver === null || n.trips[i]?.driver === t.driver || n.trips[i]?.driver === null)
	},
	arbitrary: (s, user, r) => {
		const t = r.pick(s.trips);
		const k = r.next();
		if (k < .15) {
			return {
				t: "note",
				trip: t.id,
				text: r.pick([
					"Leaves at 3",
					"No Loop traffic",
					"  Call on arrival ",
					"",
					"This note is far too long to be accepted by the trip"
				])
			};
		}
		if (k < .2) return {
			t: "claim",
			trip: "missing"
		};
		if (t.driver === user && k < .55) return {
			t: "release",
			trip: t.id
		};
		if (t.driver === null) return {
			t: "claim",
			trip: t.id
		};
		return k < .8 ? {
			t: "release",
			trip: t.id
		} : {
			t: "claim",
			trip: t.id
		};
	},
	local: {
		editing: "",
		draft: ""
	},
	view: ({ state, me, members, dispatch, local, setLocal }) => {
		const nameOf = (id) => id === me ? "You" : members.find((m) => m.id === id)?.name ?? "Someone";
		const open = state.trips.filter((t) => t.driver === null);
		const save = () => {
			if (!local.editing) return;
			dispatch({
				t: "note",
				trip: local.editing,
				text: local.draft.slice(0, MAX_NOTE)
			});
			setLocal({
				editing: "",
				draft: ""
			});
		};
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `${covered(state)} of ${state.trips.length} covered`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 8
				},
				children: state.trips.map((t) => /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsxs("div", {
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
							children: [
								/* @__PURE__ */ _jsxs("div", {
									style: { fontWeight: 600 },
									children: [
										t.who,
										" · ",
										t.place
									]
								}),
								/* @__PURE__ */ _jsxs("small", { children: [
									t.when,
									" · ",
									t.kind === "pickup" ? "pickup" : "drop-off"
								] }),
								t.note ? /* @__PURE__ */ _jsx("div", { children: /* @__PURE__ */ _jsx("small", { children: t.note }) }) : null,
								t.driver !== null ? /* @__PURE__ */ _jsxs("div", {
									style: {
										display: "flex",
										alignItems: "center",
										gap: 4,
										marginTop: 2
									},
									children: [/* @__PURE__ */ _jsx(Avatar, {
										user: t.driver,
										size: 20
									}), /* @__PURE__ */ _jsxs("small", { children: [nameOf(t.driver), " driving"] })]
								}) : /* @__PURE__ */ _jsx("div", { children: /* @__PURE__ */ _jsx("small", { children: "Needs a driver" }) })
							]
						}),
						/* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							onClick: () => setLocal(local.editing === t.id ? {
								editing: "",
								draft: ""
							} : {
								editing: t.id,
								draft: t.note
							}),
							children: "Note"
						}),
						t.driver === null ? /* @__PURE__ */ _jsx(Button, {
							kind: "primary",
							onClick: () => dispatch({
								t: "claim",
								trip: t.id
							}),
							children: "Take"
						}) : t.driver === me ? /* @__PURE__ */ _jsx(Button, {
							kind: "secondary",
							onClick: () => dispatch({
								t: "release",
								trip: t.id
							}),
							children: "Release"
						}) : null
					]
				}), local.editing === t.id ? /* @__PURE__ */ _jsxs("form", {
					style: {
						display: "flex",
						gap: 8,
						marginTop: 4
					},
					onSubmit: (e) => {
						e.preventDefault();
						save();
					},
					children: [/* @__PURE__ */ _jsx("input", {
						value: local.draft,
						maxLength: MAX_NOTE,
						placeholder: "Time change or detail",
						"aria-label": "Note",
						onInput: (e) => setLocal({ draft: e.currentTarget.value })
					}), /* @__PURE__ */ _jsx(Button, {
						kind: "secondary",
						onClick: save,
						children: "Save"
					})]
				}) : null] }, t.id))
			}),
			/* @__PURE__ */ _jsx("div", {
				style: { marginTop: 8 },
				children: /* @__PURE__ */ _jsx(SystemLine, { children: open.length ? `Still open: ${open.map(label).join(", ")}` : "All trips covered" })
			})
		] });
	}
});
