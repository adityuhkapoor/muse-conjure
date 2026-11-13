import { defineApp, Button, CardHeader, OptionRow, Facepile } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Study poll: each person picks the rooms and time slots they can do. Several picks are allowed,
// since two sessions are possible.
const C = {
	title: "Where and when do we study?",
	place: "Bird Library",
	rooms: [{
		label: "Room 304, 3rd floor",
		note: "304 has a whiteboard"
	}, {
		label: "Room 212, 2nd floor",
		note: "212 is quieter, no whiteboard"
	}],
	slots: [
		"Mon 4-6",
		"Tues 10-12",
		"Wed 2-4",
		"Fri 1-3"
	]
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const all = (s) => [...s.rooms, ...s.slots];
const mine = (s, u) => all(s).filter((o) => o.voters.includes(u)).map((o) => o.id);
const diff = (a, b) => [...a.filter((x) => !b.includes(x)), ...b.filter((x) => !a.includes(x))];
const rest = (o, u) => o.voters.filter((v) => v !== u).join();
const sameList = (xs, ys, u) => xs.length === ys.length && xs.every((o, i) => o.id === ys[i].id && o.label === ys[i].label && rest(o, u) === rest(ys[i], u));
const othersSame = (p, n, u) => sameList(p.rooms, n.rooms, u) && sameList(p.slots, n.slots, u);
const leader = (xs) => xs.reduce((b, o) => o.voters.length > 0 && (!b || o.voters.length > b.voters.length) ? o : b, null);
function toggle(s, key, user, option) {
	if (typeof option !== "string" || !s[key].some((o) => o.id === option)) return s;
	return {
		...s,
		[key]: s[key].map((o) => o.id !== option ? o : {
			...o,
			voters: o.voters.includes(user) ? o.voters.filter((v) => v !== user) : [...o.voters, user]
		})
	};
}
export default defineApp({
	name: "Study poll",
	summary: (s) => {
		const r = leader(s.rooms);
		const t = leader(s.slots);
		if (!r && !t) return `${s.title} No picks yet.`;
		return `${s.title} ${r ? `${r.label}: ${r.voters.length}.` : ""} ${t ? `${t.label}: ${t.voters.length}.` : ""}`.trim();
	},
	init: () => ({
		title: C.title,
		rooms: C.rooms.map((r, i) => ({
			id: `r${i}`,
			label: r.label,
			note: r.note,
			voters: []
		})),
		slots: C.slots.map((l, i) => ({
			id: `s${i}`,
			label: l,
			note: "",
			voters: []
		}))
	}),
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "room") return toggle(state, "rooms", meta.user, action.option);
		if (action.t === "slot") return toggle(state, "slots", meta.user, action.option);
		if (action.t === "clear") {
			if (mine(state, meta.user).length === 0) return state;
			const strip = (o) => o.voters.includes(meta.user) ? {
				...o,
				voters: o.voters.filter((v) => v !== meta.user)
			} : o;
			return {
				...state,
				rooms: state.rooms.map(strip),
				slots: state.slots.map(strip)
			};
		}
		return state;
	},
	onMembers: (state, ctx) => {
		if (all(state).every((o) => o.voters.every((v) => inChat(ctx, v)))) return state;
		const strip = (o) => ({
			...o,
			voters: o.voters.filter((v) => inChat(ctx, v))
		});
		return {
			...state,
			rooms: state.rooms.map(strip),
			slots: state.slots.map(strip)
		};
	},
	invariants: {
		"no one appears twice on a room or slot": (s) => all(s).every((o) => new Set(o.voters).size === o.voters.length),
		"every voter is in the chat": (s, ctx) => all(s).every((o) => o.voters.every((v) => inChat(ctx, v))),
		"there are two rooms and four slots with unique ids": (s) => s.rooms.length === 2 && s.slots.length === 4 && new Set(all(s).map((o) => o.id)).size === 6 && all(s).every((o) => o.label.length > 0),
		"rooms and slots keep the labels from the chat": (s) => s.rooms.map((o) => o.label).join("|") === C.rooms.map((r) => r.label).join("|") && s.slots.map((o) => o.label).join("|") === C.slots.join("|")
	},
	transitions: {
		"a room vote flips the actor on that one room and changes no one else": (p, n, a, m) => a.t !== "room" || p === n || othersSame(p, n, m.user) && diff(mine(p, m.user), mine(n, m.user)).join() === String(a.option) && p.rooms.some((o) => o.id === a.option),
		"a slot vote flips the actor on that one slot and changes no one else": (p, n, a, m) => a.t !== "slot" || p === n || othersSame(p, n, m.user) && diff(mine(p, m.user), mine(n, m.user)).join() === String(a.option) && p.slots.some((o) => o.id === a.option),
		"clear removes only the actor's votes": (p, n, a, m) => a.t !== "clear" || p === n || mine(p, m.user).length > 0 && mine(n, m.user).length === 0 && othersSame(p, n, m.user),
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
		"labels and notes never change": (p, n) => all(p).every((o, i) => o.label === all(n)[i].label && o.note === all(n)[i].note && o.id === all(n)[i].id)
	},
	arbitrary: (s, user, r) => {
		const k = r.next();
		if (k < .1) return { t: "clear" };
		if (k < .15) return {
			t: "room",
			option: "zz"
		};
		if (k < .2) return {
			t: "slot",
			option: "zz"
		};
		if (k < .55) return {
			t: "room",
			option: r.pick(s.rooms).id
		};
		return {
			t: "slot",
			option: r.pick(s.slots).id
		};
	},
	local: {},
	view: ({ state, me, members, dispatch }) => {
		const answered = members.filter((m) => mine(state, m.id).length > 0).length;
		const lr = leader(state.rooms);
		const ls = leader(state.slots);
		const total = Math.max(1, members.length);
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `${answered} of ${members.length} picked · ${C.place}`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 2
				},
				children: state.rooms.map((o) => /* @__PURE__ */ _jsx(OptionRow, {
					label: o.label,
					count: o.voters.length,
					total,
					voters: o.voters,
					selected: o.voters.includes(me),
					onClick: () => dispatch({
						t: "room",
						option: o.id
					})
				}, o.id))
			}),
			/* @__PURE__ */ _jsx("small", {
				style: {
					display: "block",
					margin: "4px 0 8px"
				},
				children: state.rooms.map((o) => o.note).join(" · ")
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gridTemplateColumns: "1fr 1fr",
					gap: 8
				},
				children: state.slots.map((o) => /* @__PURE__ */ _jsx(Button, {
					kind: o.voters.includes(me) ? "primary" : "secondary",
					wide: true,
					onClick: () => dispatch({
						t: "slot",
						option: o.id
					}),
					children: `${o.label} · ${o.voters.length}`
				}, o.id))
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginTop: 8,
					minHeight: 44
				},
				children: [
					/* @__PURE__ */ _jsx("div", {
						style: { flex: 1 },
						children: /* @__PURE__ */ _jsx("small", { children: lr || ls ? `Leading: ${ls ? `${ls.label} (${ls.voters.length})` : "no slot"} · ${lr ? `${lr.label.split(",")[0]} (${lr.voters.length})` : "no room"}` : "Pick every room and slot that works for you" })
					}),
					ls ? /* @__PURE__ */ _jsx(Facepile, {
						users: ls.voters,
						max: 3,
						size: 24
					}) : null,
					/* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						disabled: mine(state, me).length === 0,
						onClick: () => dispatch({ t: "clear" }),
						children: "Clear"
					})
				]
			})
		] });
	}
});
