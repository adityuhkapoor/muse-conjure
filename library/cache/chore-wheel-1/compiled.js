import { defineApp, Avatar, Button, CardHeader, SystemLine, clock, rng } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Chore spinner. One weighted random spin picks who mops the kitchen floor.
// Fewer chores so far means more chances, but anyone can come up.
const C = {
	title: "Who mops the kitchen floor?",
	task: "Mop the kitchen floor",
	due: "Thursday",
	// Chore totals since Sept 1, matched to chat members by lowercase name.
	totals: {
		ines: 8,
		ana: 5,
		kev: 5,
		luis: 3,
		marcus: 2
	}
};
const SPIN_MS = 3e3;
const COOLDOWN = 4e3;
const MAX_SPINS = 99;
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
/** Weight is (highest total + 1) minus own total, over people in the chat who have a count. */
function weightsOf(totals, ctx) {
	const ids = Object.keys(totals).filter((id) => inChat(ctx, id)).sort();
	const max = ids.length ? Math.max(...ids.map((id) => totals[id] ?? 0)) : 0;
	return {
		ids,
		ws: ids.map((id) => max + 1 - (totals[id] ?? 0))
	};
}
function pickWho(totals, seed, ctx) {
	const { ids, ws } = weightsOf(totals, ctx);
	if (ids.length === 0) return null;
	const sum = ws.reduce((a, b) => a + b, 0);
	const r = rng(seed).next() * sum;
	let acc = 0;
	for (let i = 0; i < ids.length; i++) {
		acc += ws[i];
		if (r < acc) return ids[i];
	}
	return ids[ids.length - 1];
}
const sameTotals = (a, b, skip) => {
	const ka = Object.keys(a);
	const kb = Object.keys(b);
	if (ka.length !== kb.length) return false;
	return ka.every((k) => k === skip || a[k] === b[k]);
};
export default defineApp({
	name: "Chore spinner",
	summary: (s, ctx) => {
		const who = s.picked ? ctx.members.find((m) => m.id === s.picked)?.name : undefined;
		if (!who) return `${C.title} No spin yet.`;
		return s.accepted ? `${C.title} ${who} took it.` : `${C.title} ${who} got it.`;
	},
	init: (ctx) => {
		const known = Object.values(C.totals);
		const avg = known.length ? Math.floor(known.reduce((a, b) => a + b, 0) / known.length) : 0;
		const totals = {};
		for (const m of ctx.members) {
			const v = C.totals[m.name.toLowerCase()];
			totals[m.id] = typeof v === "number" ? v : avg;
		}
		return {
			task: C.task,
			due: C.due,
			totals,
			picked: null,
			spinAt: 0,
			spins: 0,
			accepted: false
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "spin") {
			if (state.accepted || state.spins >= MAX_SPINS) return state;
			if (state.spinAt > 0 && meta.time - state.spinAt < COOLDOWN) return state;
			const who = pickWho(state.totals, meta.seed, ctx);
			if (who === null) return state;
			return {
				...state,
				picked: who,
				spinAt: meta.time,
				spins: state.spins + 1,
				accepted: false
			};
		}
		if (action.t === "accept") {
			if (state.picked === null || state.accepted || state.picked !== meta.user) return state;
			const cur = state.totals[meta.user] ?? 0;
			return {
				...state,
				accepted: true,
				totals: {
					...state.totals,
					[meta.user]: cur + 1
				}
			};
		}
		if (action.t === "reset") {
			if (state.picked === null) return state;
			return {
				...state,
				picked: null,
				spinAt: 0,
				accepted: false
			};
		}
		return state;
	},
	// Someone left: their count goes and so does their pick. Someone joined: they start at the lowest count.
	onMembers: (state, ctx) => {
		const keys = Object.keys(state.totals);
		const pickedOk = state.picked === null || inChat(ctx, state.picked);
		if (keys.every((k) => inChat(ctx, k)) && ctx.members.every((m) => typeof state.totals[m.id] === "number") && pickedOk) return state;
		const kept = keys.filter((k) => inChat(ctx, k)).map((k) => state.totals[k] ?? 0);
		const min = kept.length ? Math.min(...kept) : 0;
		const totals = {};
		for (const m of ctx.members) {
			const v = state.totals[m.id];
			totals[m.id] = typeof v === "number" ? v : min;
		}
		return pickedOk ? {
			...state,
			totals
		} : {
			...state,
			totals,
			picked: null,
			spinAt: 0,
			accepted: false
		};
	},
	invariants: {
		"every count belongs to someone in the chat and is a whole number from 0": (s, ctx) => Object.keys(s.totals).every((k) => inChat(ctx, k) && Number.isInteger(s.totals[k]) && (s.totals[k] ?? -1) >= 0),
		"everyone in the chat has a count": (s, ctx) => ctx.members.every((m) => typeof s.totals[m.id] === "number"),
		"the pick is nobody or someone in the chat": (s, ctx) => s.picked === null || inChat(ctx, s.picked) && typeof s.totals[s.picked] === "number",
		"a taken chore has a pick": (s) => !s.accepted || s.picked !== null,
		"no pick means no spin time and nothing taken": (s) => s.picked !== null || s.spinAt === 0 && !s.accepted,
		"spins is a whole number from 0 to 99": (s) => Number.isInteger(s.spins) && s.spins >= 0 && s.spins <= MAX_SPINS
	},
	transitions: {
		"a spin picks who the seed gives, by the old counts, and changes no count": (p, n, a, m, ctx) => a.t !== "spin" || p === n || n.picked === pickWho(p.totals, m.seed, ctx) && n.spinAt === m.time && n.spins === p.spins + 1 && !n.accepted && sameTotals(p.totals, n.totals),
		"a spin is refused once the chore is taken": (p, n, a) => a.t !== "spin" || p === n || !p.accepted,
		"a spin never starts within 4 seconds of the last one": (p, n, a, m) => a.t !== "spin" || p === n || p.spinAt === 0 || m.time - p.spinAt >= COOLDOWN,
		"accept is the picked person raising only their own count by 1": (p, n, a, m) => a.t !== "accept" || p === n || p.picked !== null && m.user === p.picked && !p.accepted && n.accepted && n.picked === p.picked && n.totals[p.picked] === (p.totals[p.picked] ?? 0) + 1 && sameTotals(p.totals, n.totals, p.picked),
		"a reset clears only the pick, the spin time and taken": (p, n, a) => a.t !== "reset" || p === n || n.picked === null && n.spinAt === 0 && !n.accepted && n.spins === p.spins && sameTotals(p.totals, n.totals),
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
		"the task and due day never change": (p, n) => p.task === n.task && p.due === n.due
	},
	arbitrary: (s, user, r) => {
		if (s.picked === user && !s.accepted && r.next() < .7) return { t: "accept" };
		const x = r.next();
		if (x < .6) return { t: "spin" };
		if (x < .8) return { t: "reset" };
		return { t: "accept" };
	},
	local: {},
	view: ({ state, confirmed, pending, me, members, dispatch, theme }) => {
		// Who was picked comes from the server's seed: read it from `confirmed`, and stay neutral
		// while my own spin is unconfirmed or the highlight is still cycling.
		const live = pending || confirmed.picked !== null;
		const now = live ? clock.value : 0;
		const waiting = pending && state.spins !== confirmed.spins;
		const turning = confirmed.picked !== null && now - confirmed.spinAt < SPIN_MS;
		const cool = confirmed.picked !== null && now - confirmed.spinAt < COOLDOWN;
		const spinning = waiting || turning;
		const result = spinning ? null : state.picked;
		const accepted = result !== null && state.accepted;
		const nameOf = (id) => members.find((m) => m.id === id)?.name ?? "Someone";
		const rows = members.filter((m) => typeof state.totals[m.id] === "number").sort((a, b) => state.totals[a.id] - state.totals[b.id] || (a.id < b.id ? -1 : 1));
		const max = rows.length ? Math.max(...rows.map((m) => state.totals[m.id])) : 0;
		const cycle = rows.length ? Math.floor(now / 150) % rows.length : 0;
		const subtitle = spinning ? `Due ${state.due} · Spinning` : result ? `Due ${state.due} · ${nameOf(result)} got it` : `Due ${state.due}`;
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: C.title,
				subtitle
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 2
				},
				children: rows.map((m, i) => {
					const c = state.totals[m.id];
					const w = max + 1 - c;
					const hl = spinning ? i === cycle : result === m.id;
					return /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: 36,
							padding: "0 8px",
							borderRadius: theme.radius.button,
							...hl ? { background: theme.color.selected } : {}
						},
						children: [
							/* @__PURE__ */ _jsx(Avatar, {
								user: m,
								size: 24
							}),
							/* @__PURE__ */ _jsx("div", {
								style: {
									flex: 1,
									minWidth: 0,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
									color: theme.color.text
								},
								children: m.name
							}),
							/* @__PURE__ */ _jsxs("small", {
								style: {
									whiteSpace: "nowrap",
									color: theme.color.secondaryText
								},
								children: [
									c,
									" ",
									c === 1 ? "chore" : "chores",
									" · ",
									w,
									" ",
									w === 1 ? "chance" : "chances"
								]
							})
						]
					}, m.id);
				})
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					minHeight: 24,
					margin: "8px 0"
				},
				children: spinning ? /* @__PURE__ */ _jsx(SystemLine, { children: "Spinning" }) : result && accepted ? /* @__PURE__ */ _jsx(SystemLine, { children: `Done · ${nameOf(result)} now at ${state.totals[result] ?? 0}` }) : result ? /* @__PURE__ */ _jsx(SystemLine, {
					actor: nameOf(result),
					children: "mops the floor"
				}) : /* @__PURE__ */ _jsx(SystemLine, { children: "Fewer chores means more chances" })
			}),
			accepted ? null : result === null ? /* @__PURE__ */ _jsx(Button, {
				kind: "primary",
				wide: true,
				disabled: spinning || rows.length === 0,
				onClick: () => dispatch({ t: "spin" }),
				children: "Spin"
			}) : result === me ? /* @__PURE__ */ _jsx("div", {
				style: {
					display: "flex",
					gap: 8
				},
				children: /* @__PURE__ */ _jsx("div", {
					style: {
						flex: 1,
						display: "flex"
					},
					children: /* @__PURE__ */ _jsx(Button, {
						kind: "primary",
						wide: true,
						onClick: () => dispatch({ t: "accept" }),
						children: "Accept"
					})
				})
			}) : /* @__PURE__ */ _jsx(Button, {
				wide: true,
				disabled: cool,
				onClick: () => dispatch({ t: "spin" }),
				children: "Spin again"
			})
		] });
	}
});
