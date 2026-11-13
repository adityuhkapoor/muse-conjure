import { defineApp, Button, CardHeader, Facepile, SystemLine } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Shift signup for the salsa club fall social. Everyone can take open spots and leave their own.
const C = {
	title: "Fall social shifts",
	shifts: [
		{
			role: "Door",
			time: "8-9:30",
			cap: 2
		},
		{
			role: "Door",
			time: "9:30-11",
			cap: 2
		},
		{
			role: "Door",
			time: "11-12",
			cap: 2
		},
		{
			role: "Music",
			time: "9-10:30",
			cap: 1
		},
		{
			role: "Music",
			time: "10:30-12",
			cap: 1
		},
		{
			role: "Cleanup",
			time: "12-12:45",
			cap: 3
		}
	]
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const rowOf = (s, id) => s.shifts.find((x) => x.id === id);
const restText = (s, id) => s.shifts.filter((x) => x.id !== id).map((x) => JSON.stringify(x)).join("|");
const fixedText = (s) => s.title + "|" + s.shifts.map((x) => `${x.id}/${x.role}/${x.time}/${x.cap}`).join("|");
const filled = (s) => s.shifts.reduce((n, x) => n + x.people.length, 0);
const total = (s) => s.shifts.reduce((n, x) => n + x.cap, 0);
function join(s, user, id) {
	if (typeof id !== "string") return s;
	const row = rowOf(s, id);
	if (!row || row.people.includes(user) || row.people.length >= row.cap) return s;
	return {
		...s,
		shifts: s.shifts.map((x) => x.id === row.id ? {
			...x,
			people: [...x.people, user]
		} : x)
	};
}
function leave(s, user, id) {
	if (typeof id !== "string") return s;
	const row = rowOf(s, id);
	if (!row || !row.people.includes(user)) return s;
	return {
		...s,
		shifts: s.shifts.map((x) => x.id === row.id ? {
			...x,
			people: x.people.filter((u) => u !== user)
		} : x)
	};
}
export default defineApp({
	name: "Shift signup",
	summary: (s) => `${s.title}: ${filled(s)} of ${total(s)} spots filled.`,
	init: () => ({
		title: C.title,
		shifts: C.shifts.map((x, i) => ({
			id: `s${i}`,
			role: x.role,
			time: x.time,
			cap: x.cap,
			people: []
		}))
	}),
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "join") return join(state, meta.user, action.shift);
		if (action.t === "leave") return leave(state, meta.user, action.shift);
		return state;
	},
	onMembers: (state, ctx) => {
		if (state.shifts.every((x) => x.people.every((u) => inChat(ctx, u)))) return state;
		return {
			...state,
			shifts: state.shifts.map((x) => x.people.every((u) => inChat(ctx, u)) ? x : {
				...x,
				people: x.people.filter((u) => inChat(ctx, u))
			})
		};
	},
	invariants: {
		"no shift has more people than its spots": (s) => s.shifts.every((x) => x.people.length <= x.cap),
		"no one is on the same shift twice": (s) => s.shifts.every((x) => new Set(x.people).size === x.people.length),
		"everyone on a shift is in the chat": (s, ctx) => s.shifts.every((x) => x.people.every((u) => inChat(ctx, u))),
		"the six shifts keep their roles, times and spots": (s) => s.title === C.title && s.shifts.length === C.shifts.length && s.shifts.every((x, i) => x.id === `s${i}` && x.role === C.shifts[i].role && x.time === C.shifts[i].time && x.cap === C.shifts[i].cap)
	},
	transitions: {
		"a join adds the actor to the end of that shift and changes no other shift": (p, n, a, m) => {
			if (a.t !== "join" || p === n) return true;
			const b = rowOf(p, a.shift), c = rowOf(n, a.shift);
			return !!b && !!c && !b.people.includes(m.user) && c.people.join() === [...b.people, m.user].join() && restText(p, a.shift) === restText(n, a.shift);
		},
		"a leave removes only the actor from that shift and changes no other shift": (p, n, a, m) => {
			if (a.t !== "leave" || p === n) return true;
			const b = rowOf(p, a.shift), c = rowOf(n, a.shift);
			return !!b && !!c && b.people.includes(m.user) && c.people.join() === b.people.filter((u) => u !== m.user).join() && restText(p, a.shift) === restText(n, a.shift);
		},
		"a join that fits always lands": (p, n, a, m, ctx) => {
			if (a.t !== "join" || !inChat(ctx, m.user)) return true;
			const b = rowOf(p, a.shift);
			if (!b || b.people.includes(m.user) || b.people.length >= b.cap) return true;
			return !!rowOf(n, a.shift)?.people.includes(m.user);
		},
		"title, roles, times and spots never change": (p, n) => fixedText(p) === fixedText(n),
		"only people in the chat change a shift": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		const mine = s.shifts.filter((x) => x.people.includes(user));
		if (mine.length && r.next() < .3) return {
			t: "leave",
			shift: r.pick(mine).id
		};
		const open = s.shifts.filter((x) => x.people.length < x.cap && !x.people.includes(user));
		if (open.length && r.next() < .8) return {
			t: "join",
			shift: r.pick(open).id
		};
		return {
			t: "join",
			shift: r.pick(s.shifts).id
		};
	},
	local: {},
	view: ({ state, me, members, dispatch, theme }) => {
		const idle = members.filter((m) => !state.shifts.some((x) => x.people.includes(m.id)));
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `${filled(state)} of ${total(state)} spots filled · Sat Nov 22`
			}),
			/* @__PURE__ */ _jsx("div", { children: state.shifts.map((x) => {
				const mine = x.people.includes(me);
				const gap = x.cap - x.people.length;
				return /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						minHeight: 46,
						borderBottom: `1px solid ${theme.color.divider}`
					},
					children: [
						/* @__PURE__ */ _jsxs("div", {
							style: {
								flex: 1,
								minWidth: 0
							},
							children: [/* @__PURE__ */ _jsxs("div", {
								style: {
									fontWeight: 600,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap"
								},
								children: [
									x.role,
									" · ",
									x.time
								]
							}), /* @__PURE__ */ _jsx("small", { children: gap === 0 ? "Full" : `${gap} open` })]
						}),
						x.people.length ? /* @__PURE__ */ _jsx(Facepile, {
							users: x.people,
							max: 3,
							size: 20
						}) : null,
						/* @__PURE__ */ _jsx("div", {
							style: {
								width: 72,
								flex: "none",
								display: "flex",
								justifyContent: "flex-end"
							},
							children: mine ? /* @__PURE__ */ _jsx(Button, {
								kind: "secondary",
								onClick: () => dispatch({
									t: "leave",
									shift: x.id
								}),
								children: "Leave"
							}) : gap > 0 ? /* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => dispatch({
									t: "join",
									shift: x.id
								}),
								children: "Join"
							}) : null
						})
					]
				}, x.id);
			}) }),
			/* @__PURE__ */ _jsx("div", {
				style: { marginTop: 6 },
				children: idle.length ? /* @__PURE__ */ _jsx(SystemLine, { children: `No shift yet: ${idle.map((m) => m.id === me ? "you" : m.name).slice(0, 4).join(", ")}` }) : /* @__PURE__ */ _jsx(SystemLine, { children: "Everyone has a shift" })
			})
		] });
	}
});
