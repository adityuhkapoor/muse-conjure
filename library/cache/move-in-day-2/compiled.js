import { defineApp, CardHeader, OptionRow, Progress, Toast } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
const C = {
	title: "Move-out day sign-up",
	keys: "keys by 6pm",
	slots: [
		{
			label: "Morning",
			tasks: [{
				label: "Pack books and desk stuff",
				cap: 2
			}]
		},
		{
			label: "1-3",
			tasks: [{
				label: "Truck loads",
				cap: 3
			}, {
				label: "Drive the pickup",
				cap: 1
			}]
		},
		{
			label: "After 3",
			tasks: [{
				label: "Move bed frame and futon",
				cap: 3
			}]
		},
		{
			label: "Around 5",
			tasks: [{
				label: "Pick up food from Siam Garden",
				cap: 1
			}]
		},
		{
			label: "4-7",
			tasks: [{
				label: "Unload at new place on Maple",
				cap: 4
			}]
		},
		{
			label: "Bring",
			tasks: [{
				label: "Milk crates and tote bins",
				cap: 1
			}, {
				label: "Tape and dolly",
				cap: 1
			}]
		}
	]
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const taskOf = (s, id) => s.tasks.find((t) => t.id === id);
const sameTask = (a, b) => a.id === b.id && a.slot === b.slot && a.label === b.label && a.cap === b.cap;
/** Same tasks in the same order; every task other than `id` is exactly as it was. */
const onlyTask = (p, n, id) => p.tasks.length === n.tasks.length && p.tasks.every((t, i) => sameTask(t, n.tasks[i]) && (t.id === id || t.people.join() === n.tasks[i].people.join()));
export default defineApp({
	name: "Move-out sheet",
	summary: (s) => {
		const filled = s.tasks.reduce((n, t) => n + t.people.length, 0);
		const total = s.tasks.reduce((n, t) => n + t.cap, 0);
		return `${s.title} ${filled} of ${total} spots filled.`;
	},
	init: () => {
		const slots = [];
		const tasks = [];
		C.slots.forEach((s, i) => {
			slots.push({
				id: `s${i}`,
				label: s.label
			});
			s.tasks.forEach((t) => {
				tasks.push({
					id: `t${tasks.length}`,
					slot: `s${i}`,
					label: t.label,
					cap: Math.max(1, Math.min(6, Math.floor(t.cap) || 1)),
					people: []
				});
			});
		});
		return {
			title: C.title,
			slots,
			tasks,
			at: 0
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t !== "join" && action.t !== "drop") return state;
		if (typeof action.task !== "string") return state;
		const task = taskOf(state, action.task);
		if (!task) return state;
		const on = task.people.includes(meta.user);
		if (action.t === "join") {
			if (on || task.people.length >= task.cap) return state;
			return {
				...state,
				at: meta.time,
				tasks: state.tasks.map((t) => t.id === task.id ? {
					...t,
					people: [...t.people, meta.user]
				} : t)
			};
		}
		if (!on) return state;
		return {
			...state,
			at: meta.time,
			tasks: state.tasks.map((t) => t.id === task.id ? {
				...t,
				people: t.people.filter((u) => u !== meta.user)
			} : t)
		};
	},
	// Someone left: their spots open up again.
	onMembers: (state, ctx) => {
		if (state.tasks.every((t) => t.people.every((u) => inChat(ctx, u)))) return state;
		return {
			...state,
			tasks: state.tasks.map((t) => t.people.every((u) => inChat(ctx, u)) ? t : {
				...t,
				people: t.people.filter((u) => inChat(ctx, u))
			})
		};
	},
	invariants: {
		"no task has more people than its cap": (s) => s.tasks.every((t) => t.people.length <= t.cap),
		"no person appears twice on a task": (s) => s.tasks.every((t) => new Set(t.people).size === t.people.length),
		"everyone on a task is in the chat": (s, ctx) => s.tasks.every((t) => t.people.every((u) => inChat(ctx, u))),
		"every task belongs to a real slot and task ids are unique": (s) => s.tasks.every((t) => s.slots.some((x) => x.id === t.slot)) && new Set(s.tasks.map((t) => t.id)).size === s.tasks.length,
		"every cap is a whole number from 1 to 6": (s) => s.tasks.every((t) => Number.isInteger(t.cap) && t.cap >= 1 && t.cap <= 6)
	},
	transitions: {
		"a join adds the actor to that task only, within its cap": (p, n, a, m) => {
			if (a.t !== "join" || p === n) return true;
			const before = taskOf(p, a.task);
			const after = taskOf(n, a.task);
			return !!before && !!after && !before.people.includes(m.user) && after.people.join() === [...before.people, m.user].join() && after.people.length <= after.cap && onlyTask(p, n, before.id) && n.at === m.time;
		},
		"a drop removes only the actor from that task": (p, n, a, m) => {
			if (a.t !== "drop" || p === n) return true;
			const before = taskOf(p, a.task);
			const after = taskOf(n, a.task);
			return !!before && !!after && before.people.includes(m.user) && after.people.join() === before.people.filter((u) => u !== m.user).join() && onlyTask(p, n, before.id) && n.at === m.time;
		},
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
		"title, slots, tasks and caps never change": (p, n) => p.title === n.title && JSON.stringify(p.slots) === JSON.stringify(n.slots) && p.tasks.length === n.tasks.length && p.tasks.every((t, i) => sameTask(t, n.tasks[i]))
	},
	arbitrary: (s, user, r) => {
		if (!s.tasks.length) return null;
		const mine = s.tasks.filter((t) => t.people.includes(user));
		if (mine.length && r.next() < .3) return {
			t: "drop",
			task: r.pick(mine).id
		};
		if (r.next() < .05) return {
			t: "drop",
			task: r.pick(s.tasks).id
		};
		return {
			t: "join",
			task: r.pick(s.tasks).id
		};
	},
	local: {
		open: "",
		toast: 0,
		msg: ""
	},
	view: ({ state, me, dispatch, local, setLocal }) => {
		const filled = state.tasks.reduce((n, t) => n + t.people.length, 0);
		const total = state.tasks.reduce((n, t) => n + t.cap, 0);
		const empty = state.tasks.filter((t) => t.people.length === 0).length;
		const mineCount = state.tasks.filter((t) => t.people.includes(me)).length;
		const tap = (t) => {
			const on = t.people.includes(me);
			if (on) {
				dispatch({
					t: "drop",
					task: t.id
				});
				setLocal({
					toast: local.toast + 1,
					msg: "Dropped"
				});
			} else if (t.people.length < t.cap) {
				dispatch({
					t: "join",
					task: t.id
				});
				setLocal({
					toast: local.toast + 1,
					msg: "Signed up"
				});
			}
		};
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `${filled} of ${total} spots filled · ${C.keys}`
			}),
			/* @__PURE__ */ _jsx(Progress, {
				value: filled,
				max: Math.max(1, total)
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 2,
					marginTop: 4
				},
				children: state.slots.map((s) => {
					const ts = state.tasks.filter((t) => t.slot === s.id);
					const f = ts.reduce((n, t) => n + t.people.length, 0);
					const c = ts.reduce((n, t) => n + t.cap, 0);
					const mine = ts.some((t) => t.people.includes(me));
					const open = local.open === s.id;
					return /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsxs("div", {
						role: "button",
						"aria-expanded": open,
						onClick: () => setLocal({ open: open ? "" : s.id }),
						style: {
							minHeight: 44,
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: 8,
							cursor: "pointer"
						},
						children: [/* @__PURE__ */ _jsx("span", {
							style: { fontWeight: 600 },
							children: s.label
						}), /* @__PURE__ */ _jsx("small", { children: `${f} of ${c} spots${mine ? " · you're in" : ""}` })]
					}), open ? /* @__PURE__ */ _jsx("div", {
						style: {
							display: "grid",
							gap: 2
						},
						children: ts.map((t) => /* @__PURE__ */ _jsx(OptionRow, {
							label: t.people.length >= t.cap && !t.people.includes(me) ? `${t.label} · full` : t.label,
							count: t.people.length,
							total: t.cap,
							voters: t.people,
							selected: t.people.includes(me),
							onClick: () => tap(t)
						}, t.id))
					}) : null] }, s.id);
				})
			}),
			/* @__PURE__ */ _jsxs("small", {
				style: {
					display: "block",
					marginTop: 6
				},
				children: [
					empty ? `${empty} ${empty === 1 ? "task" : "tasks"} still empty` : "Every task has someone",
					" · you're on ",
					mineCount
				]
			}),
			local.toast ? /* @__PURE__ */ _jsx(Toast, { children: local.msg }, local.toast) : null
		] });
	}
});
