import { defineApp, Avatar, Button, CardHeader, rng, running } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Weekend picker. Friday night is fixed; each open slot is drawn at random from its two options.
const C = {
	title: "What are we doing this weekend?",
	locked: "Pizza and Mario Kart",
	slots: [
		{
			name: "Saturday morning",
			options: ["Kayaking (20 each for rentals)", "Hiking the ridge trail (free)"]
		},
		{
			name: "Saturday night",
			options: ["Card games + bonfire", "Karaoke bar in town (closes at 11)"]
		},
		{
			name: "Sunday",
			options: ["Brunch at the diner", "Pancakes at the house"]
		}
	]
};
const SPIN_MS = 1500;
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const without = (d, keys) => Object.fromEntries(Object.entries(d).filter(([k]) => !keys.includes(k)));
export default defineApp({
	name: "Weekend picker",
	summary: (s) => {
		const done = s.slots.filter((x) => x.pick !== null);
		return `${C.title} ${done.length} of ${s.slots.length} picked` + (done.length ? ` · ${done.map((x) => x.options[x.pick]).join(" · ")}` : "");
	},
	init: () => ({
		locked: C.locked,
		slots: C.slots.map((x, i) => ({
			id: `s${i}`,
			name: x.name,
			options: [x.options[0], x.options[1]],
			pick: null,
			at: 0
		})),
		drawnBy: {}
	}),
	reduce: (s, a, m, ctx) => {
		if (!inChat(ctx, m.user)) return s;
		if (a.t === "draw") {
			if (typeof a.slot !== "string") return s;
			const i = s.slots.findIndex((x) => x.id === a.slot);
			if (i < 0 || s.slots[i].pick !== null) return s;
			const pick = rng(m.seed).int(2);
			return {
				...s,
				slots: s.slots.map((x, j) => j === i ? {
					...x,
					pick,
					at: m.time
				} : x),
				drawnBy: {
					...s.drawnBy,
					[a.slot]: m.user
				}
			};
		}
		if (a.t === "drawAll") {
			if (s.slots.every((x) => x.pick !== null)) return s;
			const r = rng(m.seed);
			const added = {};
			const slots = s.slots.map((x) => {
				if (x.pick !== null) return x;
				added[x.id] = m.user;
				return {
					...x,
					pick: r.int(2),
					at: m.time
				};
			});
			return {
				...s,
				slots,
				drawnBy: {
					...s.drawnBy,
					...added
				}
			};
		}
		if (a.t === "reset") {
			if (typeof a.slot !== "string") return s;
			const i = s.slots.findIndex((x) => x.id === a.slot);
			if (i < 0 || s.slots[i].pick === null || s.drawnBy[a.slot] !== m.user) return s;
			return {
				...s,
				slots: s.slots.map((x, j) => j === i ? {
					...x,
					pick: null,
					at: 0
				} : x),
				drawnBy: without(s.drawnBy, [a.slot])
			};
		}
		return s;
	},
	// Someone left: their draw credit goes, the pick stays.
	onMembers: (s, ctx) => {
		const gone = Object.keys(s.drawnBy).filter((k) => !inChat(ctx, s.drawnBy[k]));
		return gone.length ? {
			...s,
			drawnBy: without(s.drawnBy, gone)
		} : s;
	},
	invariants: {
		"three slots with unique ids, each with two non-empty options": (s) => s.slots.length === C.slots.length && new Set(s.slots.map((x) => x.id)).size === s.slots.length && s.slots.every((x) => x.options.length === 2 && x.options.every((o) => o.length > 0)),
		"every pick is open, 0 or 1": (s) => s.slots.every((x) => x.pick === null || x.pick === 0 || x.pick === 1),
		"an open slot has no draw time": (s) => s.slots.every((x) => x.pick !== null || x.at === 0),
		"draw credits belong to picked slots and to people in the chat": (s, ctx) => Object.keys(s.drawnBy).every((k) => s.slots.some((x) => x.id === k && x.pick !== null) && inChat(ctx, s.drawnBy[k])),
		"the Friday text and option labels match the chat": (s) => s.locked === C.locked && s.slots.every((x, i) => x.name === C.slots[i].name && x.options[0] === C.slots[i].options[0] && x.options[1] === C.slots[i].options[1])
	},
	transitions: {
		"a draw fills only that open slot with the seed's pick, the time and the actor": (p, n, a, m) => {
			if (a.t !== "draw" || p === n) return true;
			const i = p.slots.findIndex((x) => x.id === a.slot);
			if (i < 0) return false;
			return p.slots[i].pick === null && n.slots[i].pick === rng(m.seed).int(2) && n.slots[i].at === m.time && n.drawnBy[a.slot] === m.user && p.slots.every((x, j) => j === i || same(x, n.slots[j]));
		},
		"a draw all fills exactly the open slots in order from one seed": (p, n, a, m) => {
			if (a.t !== "drawAll" || p === n) return true;
			const r = rng(m.seed);
			return p.slots.every((x, j) => {
				if (x.pick !== null) return same(x, n.slots[j]);
				return n.slots[j].pick === r.int(2) && n.slots[j].at === m.time && n.drawnBy[x.id] === m.user;
			});
		},
		"a reset clears only that slot and only for the person who drew it": (p, n, a, m) => {
			if (a.t !== "reset" || p === n) return true;
			const i = p.slots.findIndex((x) => x.id === a.slot);
			if (i < 0) return false;
			return p.drawnBy[a.slot] === m.user && n.slots[i].pick === null && n.slots[i].at === 0 && !(a.slot in n.drawnBy) && p.slots.every((x, j) => j === i || same(x, n.slots[j]));
		},
		"a draw never changes a slot that already has a pick": (p, n, a) => a.t !== "draw" && a.t !== "drawAll" || p.slots.every((x, j) => x.pick === null || same(x, n.slots[j])),
		"names, options and the Friday text never change": (p, n) => p.locked === n.locked && p.slots.length === n.slots.length && p.slots.every((x, j) => x.id === n.slots[j].id && x.name === n.slots[j].name && same(x.options, n.slots[j].options)),
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		const open = s.slots.filter((x) => x.pick === null);
		const mine = s.slots.filter((x) => x.pick !== null && s.drawnBy[x.id] === user);
		const x = r.next();
		if (x < .1) return {
			t: "draw",
			slot: "zz"
		};
		if (x < .2) return {
			t: "reset",
			slot: r.pick(s.slots).id
		};
		if (open.length === 0) return mine.length ? {
			t: "reset",
			slot: r.pick(mine).id
		} : {
			t: "draw",
			slot: r.pick(s.slots).id
		};
		if (x < .3) return { t: "drawAll" };
		if (x < .4 && mine.length) return {
			t: "reset",
			slot: r.pick(mine).id
		};
		return {
			t: "draw",
			slot: r.pick(open).id
		};
	},
	local: {},
	view: ({ state, confirmed, pending, me, members, dispatch }) => {
		const rows = state.slots.map((st, i) => {
			const c = confirmed.slots[i];
			const spinning = pending && st.pick !== c.pick || c.pick !== null && c.at > 0 && running(c.at, SPIN_MS) !== null;
			const kind = spinning ? "spin" : c.pick !== null && st.pick !== null ? "done" : "open";
			return {
				c,
				kind
			};
		});
		const doneCount = rows.filter((r) => r.kind === "done").length;
		const anyOpen = rows.some((r) => r.kind === "open");
		const nameOf = (id) => members.find((m) => m.id === id)?.name ?? "Someone";
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: C.title,
				subtitle: `${doneCount} of ${state.slots.length} picked`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 8
				},
				children: rows.map(({ c, kind }) => {
					const who = confirmed.drawnBy[c.id];
					return /* @__PURE__ */ _jsxs("div", {
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
									/* @__PURE__ */ _jsx("div", {
										style: { fontWeight: 600 },
										children: c.name
									}),
									kind === "spin" ? /* @__PURE__ */ _jsx("small", { children: "Spinning" }) : kind === "done" ? /* @__PURE__ */ _jsxs("div", {
										style: {
											display: "flex",
											alignItems: "center",
											gap: 6
										},
										children: [who ? /* @__PURE__ */ _jsx(Avatar, {
											user: who,
											size: 20
										}) : null, /* @__PURE__ */ _jsx("span", {
											style: { overflowWrap: "anywhere" },
											children: c.options[c.pick]
										})]
									}) : /* @__PURE__ */ _jsxs("div", {
										style: {
											display: "grid",
											gap: 0
										},
										children: [/* @__PURE__ */ _jsx("small", {
											style: { overflowWrap: "anywhere" },
											children: c.options[0]
										}), /* @__PURE__ */ _jsx("small", {
											style: { overflowWrap: "anywhere" },
											children: c.options[1]
										})]
									}),
									kind === "done" && who ? /* @__PURE__ */ _jsx("small", { children: `Drawn by ${who === me ? "you" : nameOf(who)}` }) : null
								]
							}),
							kind === "open" ? /* @__PURE__ */ _jsx(Button, {
								kind: "secondary",
								onClick: () => dispatch({
									t: "draw",
									slot: c.id
								}),
								children: "Draw"
							}) : null,
							kind === "done" && who === me ? /* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => dispatch({
									t: "reset",
									slot: c.id
								}),
								children: "Redo"
							}) : null
						]
					}, c.id);
				})
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginTop: 8,
					minHeight: 44
				},
				children: [/* @__PURE__ */ _jsx("small", {
					style: {
						flex: 1,
						minWidth: 0
					},
					children: `Friday night · ${state.locked}`
				}), anyOpen ? /* @__PURE__ */ _jsx(Button, {
					kind: "primary",
					onClick: () => dispatch({ t: "drawAll" }),
					children: "Draw all"
				}) : null]
			})
		] });
	}
});
