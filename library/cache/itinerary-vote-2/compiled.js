import { defineApp, Button, CardHeader, Facepile, clock, rng } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Trip picker: four slots, two plans each. Anyone can lean one way, anyone can spin a slot.
const TRIP = {
	title: "What are we doing in NYC?",
	subtitle: "Nov 21-23",
	slots: [
		{
			label: "Saturday day",
			options: [{
				label: "The Met",
				note: "Pay what you want for students"
			}, {
				label: "High Line + Chelsea Market",
				note: "Lobster roll"
			}]
		},
		{
			label: "Saturday night",
			options: [{
				label: "Comedy Cellar",
				note: "2 drink minimum"
			}, {
				label: "Broadway rush ticket",
				note: "About $40, line up at 10am"
			}]
		},
		{
			label: "Sunday morning",
			options: [{
				label: "Russ & Daughters",
				note: "About an hour line"
			}, {
				label: "Bagels near the hostel",
				note: "No line"
			}]
		},
		{
			label: "Sunday afternoon",
			options: [{
				label: "Central Park",
				note: "Free, freezing"
			}, {
				label: "The Strand bookstore",
				note: "Books"
			}]
		}
	]
};
const REVEAL_MS = 1500;
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const strip = (v, slot, user) => JSON.stringify(Object.fromEntries(Object.entries(v).map(([k, r]) => [k, k === slot ? Object.fromEntries(Object.entries(r).filter(([u]) => u !== user)) : r])));
function lean(s, user, slot, option) {
	if (typeof slot !== "string" || typeof option !== "string") return s;
	const sl = s.slots.find((x) => x.id === slot);
	if (!sl || sl.picked !== null || !sl.options.some((o) => o.id === option)) return s;
	const cur = s.votes[slot] ?? {};
	if (cur[user] === option) return s;
	return {
		...s,
		votes: {
			...s.votes,
			[slot]: {
				...cur,
				[user]: option
			}
		}
	};
}
function spin(s, user, slot, seed, time) {
	if (typeof slot !== "string") return s;
	const sl = s.slots.find((x) => x.id === slot);
	if (!sl || sl.picked !== null) return s;
	const pick = rng(seed).pick(sl.options);
	return {
		...s,
		slots: s.slots.map((x) => x.id === sl.id ? {
			...x,
			picked: pick.id,
			at: Math.max(1, time),
			by: user
		} : x)
	};
}
function reset(s, user, slot) {
	if (typeof slot !== "string") return s;
	const sl = s.slots.find((x) => x.id === slot);
	if (!sl || sl.picked === null || sl.by !== user) return s;
	return {
		...s,
		slots: s.slots.map((x) => x.id === sl.id ? {
			...x,
			picked: null,
			at: 0,
			by: null
		} : x)
	};
}
export default defineApp({
	name: "Trip picker",
	summary: (s) => `${s.title} ${s.slots.filter((x) => x.picked !== null).length} of ${s.slots.length} picked.`,
	init: () => {
		const slots = TRIP.slots.map((sl, i) => ({
			id: `s${i}`,
			label: sl.label,
			options: sl.options.map((o, j) => ({
				id: `s${i}${j === 0 ? "a" : "b"}`,
				label: o.label,
				note: o.note
			})),
			picked: null,
			at: 0,
			by: null
		}));
		const votes = {};
		for (const sl of slots) votes[sl.id] = {};
		return {
			title: TRIP.title,
			subtitle: TRIP.subtitle,
			slots,
			votes
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "lean") return lean(state, meta.user, action.slot, action.option);
		if (action.t === "spin") return spin(state, meta.user, action.slot, meta.seed, meta.time);
		if (action.t === "reset") return reset(state, meta.user, action.slot);
		return state;
	},
	// Someone left: their leans go; a pick they made stays, with nobody credited.
	onMembers: (state, ctx) => {
		const bad = state.slots.some((x) => x.by !== null && !inChat(ctx, x.by)) || Object.values(state.votes).some((v) => Object.keys(v).some((u) => !inChat(ctx, u)));
		if (!bad) return state;
		return {
			...state,
			slots: state.slots.map((x) => x.by !== null && !inChat(ctx, x.by) ? {
				...x,
				by: null
			} : x),
			votes: Object.fromEntries(Object.entries(state.votes).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([u]) => inChat(ctx, u)))]))
		};
	},
	invariants: {
		"four slots with unique ids, each with two options with unique ids": (s) => s.slots.length === 4 && new Set(s.slots.map((x) => x.id)).size === 4 && s.slots.every((x) => x.options.length === 2 && x.options[0].id !== x.options[1].id),
		"a picked value is one of the slot's own options": (s) => s.slots.every((x) => x.picked === null || x.options.some((o) => o.id === x.picked)),
		"an unpicked slot has no spinner and no time, a picked slot has a time": (s) => s.slots.every((x) => x.picked === null ? x.by === null && x.at === 0 : x.at > 0),
		"every lean is for an existing slot and one of its options": (s) => Object.entries(s.votes).every(([k, v]) => {
			const sl = s.slots.find((x) => x.id === k);
			return !!sl && Object.values(v).every((o) => sl.options.some((x) => x.id === o));
		}),
		"leans and spinners are in the chat": (s, ctx) => s.slots.every((x) => x.by === null || inChat(ctx, x.by)) && Object.values(s.votes).every((v) => Object.keys(v).every((u) => inChat(ctx, u)))
	},
	transitions: {
		"a lean changes only the actor's entry for that unpicked slot": (p, n, a, m) => a.t !== "lean" || p === n || p.slots.find((x) => x.id === a.slot)?.picked === null && same(p.slots, n.slots) && n.votes[a.slot]?.[m.user] === a.option && p.votes[a.slot]?.[m.user] !== a.option && strip(p.votes, a.slot, m.user) === strip(n.votes, a.slot, m.user),
		"a spin changes only that slot, to the seeded pick, by the actor, at the action time": (p, n, a, m) => {
			if (a.t !== "spin" || p === n) return true;
			const i = p.slots.findIndex((x) => x.id === a.slot);
			if (i < 0) return false;
			const b = p.slots[i];
			const c = n.slots[i];
			return b.picked === null && c.picked === rng(m.seed).pick(b.options).id && c.by === m.user && c.at === Math.max(1, m.time) && same(c.options, b.options) && p.slots.every((x, j) => j === i || same(x, n.slots[j])) && same(p.votes, n.votes);
		},
		"a reset clears only a picked slot, and only for the one who spun it": (p, n, a, m) => {
			if (a.t !== "reset" || p === n) return true;
			const i = p.slots.findIndex((x) => x.id === a.slot);
			if (i < 0) return false;
			const b = p.slots[i];
			const c = n.slots[i];
			return b.picked !== null && b.by === m.user && c.picked === null && c.by === null && c.at === 0 && same(c.options, b.options) && p.slots.every((x, j) => j === i || same(x, n.slots[j])) && same(p.votes, n.votes);
		},
		"once picked, a slot changes only through a reset": (p, n, a) => p === n || a.t === "reset" || p.slots.every((x, i) => x.picked === null || same(x, n.slots[i])),
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		const sl = r.pick(s.slots);
		const k = r.next();
		if (k < .45) {
			const open = s.slots.filter((x) => x.picked === null);
			const t = open.length ? r.pick(open) : sl;
			return {
				t: "lean",
				slot: t.id,
				option: r.pick(t.options).id
			};
		}
		if (k < .8) return {
			t: "spin",
			slot: sl.id
		};
		const mine = s.slots.filter((x) => x.by === user);
		if (mine.length) return {
			t: "reset",
			slot: r.pick(mine).id
		};
		return {
			t: "spin",
			slot: sl.id
		};
	},
	local: {},
	view: ({ state, confirmed, me, members, dispatch, theme }) => {
		const now = clock.value;
		const nameOf = (id) => id === null ? "" : id === me ? "you" : members.find((m) => m.id === id)?.name ?? "someone";
		const revealed = (c) => c.picked !== null && now - c.at >= REVEAL_MS;
		const doneCount = confirmed.slots.filter(revealed).length;
		const firstOpen = state.slots.find((x) => x.picked === null);
		const picks = confirmed.slots.map((c) => c.options.find((o) => o.id === c.picked)?.label ?? "");
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `${state.subtitle} · ${doneCount} of ${state.slots.length} picked`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 4
				},
				children: state.slots.map((ps, i) => {
					const cs = confirmed.slots[i];
					if (ps.picked === null) {
						const votes = state.votes[ps.id] ?? {};
						return /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsxs("div", {
							style: {
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								minHeight: 36
							},
							children: [/* @__PURE__ */ _jsx("div", {
								style: { fontWeight: 600 },
								children: ps.label
							}), /* @__PURE__ */ _jsx(Button, {
								kind: firstOpen && firstOpen.id === ps.id ? "primary" : "deemphasized",
								onClick: () => dispatch({
									t: "spin",
									slot: ps.id
								}),
								children: "Spin"
							})]
						}), /* @__PURE__ */ _jsx("div", {
							style: {
								display: "flex",
								gap: 8
							},
							children: ps.options.map((o) => {
								const voters = Object.keys(votes).filter((u) => votes[u] === o.id);
								const mine = votes[me] === o.id;
								return /* @__PURE__ */ _jsxs("div", {
									role: "button",
									tabIndex: 0,
									"aria-label": `${o.label}, ${voters.length} leaning`,
									onClick: () => dispatch({
										t: "lean",
										slot: ps.id,
										option: o.id
									}),
									style: {
										flex: 1,
										minWidth: 0,
										minHeight: 44,
										display: "flex",
										alignItems: "center",
										gap: 4,
										padding: "0 8px",
										borderRadius: theme.radius.button,
										border: `1px solid ${mine ? theme.color.primary : theme.color.divider}`,
										background: mine ? theme.color.selected : theme.color.card,
										color: theme.color.text,
										cursor: "pointer"
									},
									children: [/* @__PURE__ */ _jsx("div", {
										style: {
											flex: 1,
											minWidth: 0,
											fontSize: 13,
											lineHeight: "16px"
										},
										children: o.label
									}), voters.length ? /* @__PURE__ */ _jsx(Facepile, {
										users: voters,
										max: 2,
										size: 16
									}) : null]
								}, o.id);
							})
						})] }, ps.id);
					}
					if (!revealed(cs)) {
						return /* @__PURE__ */ _jsxs("div", {
							style: { minHeight: 44 },
							children: [/* @__PURE__ */ _jsx("small", { children: ps.label }), /* @__PURE__ */ _jsx("div", {
								style: { fontWeight: 600 },
								children: "Spinning"
							})]
						}, ps.id);
					}
					const win = cs.options.find((o) => o.id === cs.picked);
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
							children: [
								/* @__PURE__ */ _jsx("small", { children: cs.label }),
								/* @__PURE__ */ _jsx("div", {
									style: { fontWeight: 600 },
									children: win?.label ?? ""
								}),
								/* @__PURE__ */ _jsx("small", { children: `${win?.note ?? ""}${cs.by ? ` · Picked by ${nameOf(cs.by)}` : " · Picked"}` })
							]
						}), cs.by === me ? /* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							onClick: () => dispatch({
								t: "reset",
								slot: cs.id
							}),
							children: "Redo"
						}) : null]
					}, ps.id);
				})
			}),
			doneCount === state.slots.length ? /* @__PURE__ */ _jsxs("div", {
				style: { marginTop: 8 },
				children: [/* @__PURE__ */ _jsx("h2", { children: "All four picked" }), /* @__PURE__ */ _jsx("small", { children: picks.join(" · ") })]
			}) : null
		] });
	}
});
