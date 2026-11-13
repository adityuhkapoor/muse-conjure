import { defineApp, Avatar, Button, CardHeader, Toast } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Task board for the apartment warming. Anyone can take an open task, mark their own done,
// drop it, or add a new one.
const C = {
	title: "Apartment warming tasks",
	when: "Sat at 7",
	tasks: [
		{
			label: "Cups, plates, napkins",
			note: "Plates bought, in Jess's trunk",
			owner: "Jess",
			done: true
		},
		{
			label: "Drinks: beer + cheap seltzer",
			note: "Buying Friday after class",
			owner: "Hugo",
			done: false
		},
		{
			label: "Playlist and speaker",
			note: "Needs requests",
			owner: "Ines",
			done: false
		},
		{
			label: "Ice",
			note: "Sat at 5",
			owner: "Felix",
			done: false
		},
		{
			label: "Snacks: chips, salsa, dumplings",
			note: "Dumplings from Trader Joe's to buy",
			owner: "Wren",
			done: false
		},
		{
			label: "Come at 4 to help clean and set up",
			note: "Sat at 4",
			owner: "Abby",
			done: false
		},
		{
			label: "Bathroom cleaning + trash bags",
			note: "",
			owner: "Naomi",
			done: false
		},
		{
			label: "Extension cords for the speaker",
			note: "",
			owner: null,
			done: false
		}
	]
};
const MAX_TASKS = 12;
const MAX_LABEL = 40;
const PAGE = 4;
const clean = (label) => label.trim().replace(/\s+/g, " ");
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const taskOf = (s, id) => s.tasks.find((t) => t.id === id);
/** Same tasks in the same order, and every task except `id` exactly as it was. */
const othersSame = (p, n, id) => p.tasks.length === n.tasks.length && p.tasks.every((t, i) => t.id === id || JSON.stringify(t) === JSON.stringify(n.tasks[i]));
function claim(s, user, id) {
	const t = taskOf(s, id);
	if (!t || t.owner !== null) return s;
	return {
		...s,
		tasks: s.tasks.map((x) => x.id === t.id ? {
			...x,
			owner: user
		} : x)
	};
}
function release(s, user, id) {
	const t = taskOf(s, id);
	if (!t || t.owner !== user) return s;
	return {
		...s,
		tasks: s.tasks.map((x) => x.id === t.id ? {
			...x,
			owner: null,
			done: false
		} : x)
	};
}
function toggleDone(s, user, id) {
	const t = taskOf(s, id);
	if (!t || t.owner !== user) return s;
	return {
		...s,
		tasks: s.tasks.map((x) => x.id === t.id ? {
			...x,
			done: !x.done
		} : x)
	};
}
function add(s, raw, seq) {
	if (typeof raw !== "string") return s;
	const label = clean(raw);
	if (!label || label.length > MAX_LABEL || s.tasks.length >= MAX_TASKS) return s;
	if (s.tasks.some((t) => t.label.toLowerCase() === label.toLowerCase())) return s;
	return {
		...s,
		tasks: [...s.tasks, {
			id: `t${seq}`,
			label,
			note: "",
			owner: null,
			done: false
		}]
	};
}
export default defineApp({
	name: "Task board",
	summary: (s) => {
		const open = s.tasks.filter((t) => t.owner === null).length;
		return open ? `${s.title} · ${open} of ${s.tasks.length} still open` : `${s.title} · everything is claimed`;
	},
	init: (ctx) => {
		const tasks = C.tasks.slice(0, MAX_TASKS).map((t, i) => {
			const owner = t.owner ? ctx.members.find((m) => m.name.toLowerCase() === t.owner.toLowerCase())?.id ?? null : null;
			return {
				id: `p${i}`,
				label: t.label.slice(0, MAX_LABEL),
				note: t.note,
				owner,
				done: owner !== null && t.done
			};
		});
		return {
			title: C.title,
			tasks
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "claim") return claim(state, meta.user, action.task);
		if (action.t === "release") return release(state, meta.user, action.task);
		if (action.t === "done") return toggleDone(state, meta.user, action.task);
		if (action.t === "add") return add(state, action.label, meta.seq);
		return state;
	},
	// Someone left: their tasks open up again and are no longer done.
	onMembers: (state, ctx) => {
		if (state.tasks.every((t) => t.owner === null || inChat(ctx, t.owner))) return state;
		return {
			...state,
			tasks: state.tasks.map((t) => t.owner === null || inChat(ctx, t.owner) ? t : {
				...t,
				owner: null,
				done: false
			})
		};
	},
	invariants: {
		"task ids are unique and there are at most 12 tasks": (s) => s.tasks.length <= MAX_TASKS && new Set(s.tasks.map((t) => t.id)).size === s.tasks.length,
		"every owner is in the chat": (s, ctx) => s.tasks.every((t) => t.owner === null || inChat(ctx, t.owner)),
		"a task with no owner is not done": (s) => s.tasks.every((t) => t.owner !== null || !t.done),
		"labels are 1 to 40 characters and unique ignoring case": (s) => new Set(s.tasks.map((t) => t.label.toLowerCase())).size === s.tasks.length && s.tasks.every((t) => t.label.length > 0 && t.label.length <= MAX_LABEL)
	},
	transitions: {
		"a claim gives only that open task to the actor": (p, n, a, m) => {
			if (a.t !== "claim" || p === n) return true;
			const before = taskOf(p, a.task);
			const after = taskOf(n, a.task);
			return !!before && !!after && before.owner === null && after.owner === m.user && after.done === before.done && othersSame(p, n, a.task);
		},
		"a release is made by the owner and empties owner and done": (p, n, a, m) => {
			if (a.t !== "release" || p === n) return true;
			const before = taskOf(p, a.task);
			const after = taskOf(n, a.task);
			return !!before && !!after && before.owner === m.user && after.owner === null && !after.done && othersSame(p, n, a.task);
		},
		"done is made by the owner and flips done on that task only": (p, n, a, m) => {
			if (a.t !== "done" || p === n) return true;
			const before = taskOf(p, a.task);
			const after = taskOf(n, a.task);
			return !!before && !!after && before.owner === m.user && after.owner === before.owner && after.done !== before.done && othersSame(p, n, a.task);
		},
		"an add appends one open task with the trimmed label": (p, n, a, m) => {
			if (a.t !== "add" || p === n) return true;
			const last = n.tasks.at(-1);
			return n.tasks.length === p.tasks.length + 1 && !!last && last.label === clean(a.label) && last.id === `t${m.seq}` && last.owner === null && !last.done && JSON.stringify(n.tasks.slice(0, -1)) === JSON.stringify(p.tasks);
		},
		"only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		const k = r.next();
		if (s.tasks.length === 0 || k < .12) {
			return {
				t: "add",
				label: r.pick([
					"Cooler",
					"Candles",
					" string lights ",
					"",
					"Ice",
					"Trash bags and gloves"
				])
			};
		}
		const open = s.tasks.filter((t) => t.owner === null);
		const mine = s.tasks.filter((t) => t.owner === user);
		if (open.length && k < .5) return {
			t: "claim",
			task: r.pick(open).id
		};
		if (mine.length) return k < .8 ? {
			t: "done",
			task: r.pick(mine).id
		} : {
			t: "release",
			task: r.pick(mine).id
		};
		return {
			t: "claim",
			task: r.pick(s.tasks).id
		};
	},
	local: {
		draft: "",
		toast: 0,
		page: 0
	},
	view: ({ state, me, members, dispatch, local, setLocal }) => {
		const nameOf = (id) => id === me ? "You" : members.find((m) => m.id === id)?.name ?? "Someone";
		const claimed = state.tasks.filter((t) => t.owner !== null).length;
		const doneCount = state.tasks.filter((t) => t.done).length;
		const firstOpen = state.tasks.find((t) => t.owner === null);
		const canAdd = clean(local.draft).length > 0 && state.tasks.length < MAX_TASKS;
		const pages = Math.max(1, Math.ceil(state.tasks.length / PAGE));
		const page = Math.max(0, Math.min(local.page, pages - 1));
		const shown = state.tasks.slice(page * PAGE, page * PAGE + PAGE);
		const submit = () => {
			if (!canAdd) return;
			dispatch({
				t: "add",
				label: local.draft.slice(0, MAX_LABEL)
			});
			setLocal({
				draft: "",
				toast: local.toast + 1
			});
		};
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `${claimed} of ${state.tasks.length} claimed · ${doneCount} done · ${C.when}`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 2
				},
				children: shown.map((t) => {
					const mine = t.owner === me;
					const line = [t.owner === null ? "Open" : nameOf(t.owner), t.note].filter((x) => x).join(" · ");
					return /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: 44
						},
						children: [/* @__PURE__ */ _jsxs("div", {
							style: {
								flex: 1,
								minWidth: 0
							},
							children: [/* @__PURE__ */ _jsx("div", {
								style: {
									fontWeight: 600,
									textDecoration: t.done ? "line-through" : "none",
									overflowWrap: "anywhere"
								},
								children: t.label
							}), /* @__PURE__ */ _jsx("small", {
								style: {
									display: "block",
									overflowWrap: "anywhere",
									whiteSpace: "normal"
								},
								children: line
							})]
						}), mine ? /* @__PURE__ */ _jsxs("div", {
							style: {
								display: "flex",
								gap: 4
							},
							children: [/* @__PURE__ */ _jsx(Button, {
								kind: "secondary",
								onClick: () => dispatch({
									t: "done",
									task: t.id
								}),
								children: t.done ? "Undo" : "Done"
							}), /* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => dispatch({
									t: "release",
									task: t.id
								}),
								children: "Drop"
							})]
						}) : t.owner === null ? /* @__PURE__ */ _jsx(Button, {
							kind: firstOpen && firstOpen.id === t.id ? "primary" : "deemphasized",
							onClick: () => dispatch({
								t: "claim",
								task: t.id
							}),
							children: "Take"
						}) : /* @__PURE__ */ _jsx(Avatar, {
							user: t.owner,
							size: 24
						})]
					}, t.id);
				})
			}),
			pages > 1 ? /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 8
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
			state.tasks.length < MAX_TASKS ? /* @__PURE__ */ _jsxs("form", {
				style: {
					display: "flex",
					gap: 8,
					marginTop: 8
				},
				onSubmit: (e) => {
					e.preventDefault();
					submit();
				},
				children: [/* @__PURE__ */ _jsx("input", {
					value: local.draft,
					maxLength: MAX_LABEL,
					placeholder: "Add task",
					"aria-label": "Add task",
					onInput: (e) => setLocal({ draft: e.currentTarget.value })
				}), /* @__PURE__ */ _jsx(Button, {
					kind: "deemphasized",
					disabled: !canAdd,
					onClick: submit,
					children: "Add"
				})]
			}) : null,
			local.toast ? /* @__PURE__ */ _jsx(Toast, { children: "Task added" }, local.toast) : null
		] });
	}
});
