import { defineApp, rng, clock, Avatar, Button, CardHeader, Facepile } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Secret santa draw. One shuffled cycle, so nobody gets themselves. Each person sees only their own match.
const C = {
	title: "Secret santa draw",
	budget: "$20 max",
	party: "Dec 12 at Hugo's place"
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
export default defineApp({
	name: "Secret santa",
	summary: (s) => s.pairs.length ? `Secret santa: ${s.pairs.length} matched.` : "Secret santa: not drawn yet.",
	init: () => ({
		pairs: [],
		drawnAt: 0,
		drawer: "",
		budget: C.budget,
		party: C.party
	}),
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "draw") {
			if (state.pairs.length > 0 || ctx.members.length < 2) return state;
			const order = rng(meta.seed).shuffle(ctx.members.map((m) => m.id));
			const pairs = order.map((id, i) => ({
				giver: id,
				receiver: order[(i + 1) % order.length]
			}));
			return {
				...state,
				pairs,
				drawnAt: meta.time,
				drawer: meta.user
			};
		}
		if (action.t === "reset") {
			if (state.pairs.length === 0 || state.drawer !== meta.user) return state;
			return {
				...state,
				pairs: [],
				drawnAt: 0,
				drawer: ""
			};
		}
		return state;
	},
	// Someone left: the cycle is broken, so the draw is cleared and a new one is needed.
	onMembers: (state, ctx) => {
		if (state.pairs.every((p) => inChat(ctx, p.giver) && inChat(ctx, p.receiver))) return state;
		return {
			...state,
			pairs: [],
			drawnAt: 0,
			drawer: ""
		};
	},
	invariants: {
		"nobody is matched with themselves": (s) => s.pairs.every((p) => p.giver !== p.receiver),
		"each person gives once and receives once": (s) => {
			const g = new Set(s.pairs.map((p) => p.giver));
			const r = new Set(s.pairs.map((p) => p.receiver));
			return g.size === s.pairs.length && r.size === s.pairs.length && s.pairs.every((p) => g.has(p.receiver));
		},
		"everyone in the draw is in the chat": (s, ctx) => s.pairs.every((p) => inChat(ctx, p.giver) && inChat(ctx, p.receiver)),
		"a draw has at least 2 pairs and a drawer who is in it": (s) => s.pairs.length === 0 ? s.drawer === "" : s.pairs.length >= 2 && s.pairs.some((p) => p.giver === s.drawer),
		"budget and party stay as written": (s) => s.budget === C.budget && s.party === C.party
	},
	transitions: {
		"a draw matches every current member and records who drew": (p, n, a, m, ctx) => a.t !== "draw" || p === n || p.pairs.length === 0 && n.pairs.length === ctx.members.length && ctx.members.every((x) => n.pairs.some((q) => q.giver === x.id)) && n.drawnAt === m.time && n.drawer === m.user,
		"a draw follows the shuffle the seed gives": (p, n, a, m, ctx) => {
			if (a.t !== "draw" || p === n) return true;
			const order = rng(m.seed).shuffle(ctx.members.map((x) => x.id));
			return n.pairs.length === order.length && order.every((id, i) => n.pairs[i]?.giver === id && n.pairs[i]?.receiver === order[(i + 1) % order.length]);
		},
		"a draw never changes an existing draw": (p, n, a) => a.t !== "draw" || p.pairs.length === 0 || n === p,
		"only the drawer can reset, and reset empties the draw": (p, n, a, m) => a.t !== "reset" || p === n || m.user === p.drawer && n.pairs.length === 0 && n.drawnAt === 0 && n.drawer === "",
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, _user, r) => {
		if (s.pairs.length === 0) return r.next() < .85 ? { t: "draw" } : { t: "reset" };
		return r.next() < .5 ? { t: "reset" } : { t: "draw" };
	},
	local: { shown: 0 },
	view: ({ state, confirmed, pending, me, members, dispatch, local, setLocal }) => {
		const nameOf = (id) => members.find((m) => m.id === id)?.name ?? "Someone";
		const drawn = confirmed.pairs.length > 0;
		const live = drawn && clock.value - confirmed.drawnAt < 1500;
		const drawing = state.pairs.length > 0 && (pending || live);
		const mine = confirmed.pairs.find((p) => p.giver === me);
		const revealed = local.shown !== 0 && local.shown === confirmed.drawnAt;
		const sub = drawing ? "Drawing" : drawn ? `${confirmed.pairs.length} matched · only you can see yours` : "Not drawn yet";
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: C.title,
				subtitle: sub
			}),
			/* @__PURE__ */ _jsx("small", {
				style: {
					display: "block",
					marginBottom: 8
				},
				children: `${state.budget} · ${state.party}`
			}),
			drawing ? /* @__PURE__ */ _jsx("div", {
				style: {
					minHeight: 60,
					display: "flex",
					alignItems: "center"
				},
				children: /* @__PURE__ */ _jsx("span", { children: "Drawing" })
			}) : !drawn ? /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 12
				},
				children: [/* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8
					},
					children: [/* @__PURE__ */ _jsx(Facepile, {
						users: members,
						max: 6,
						size: 24
					}), /* @__PURE__ */ _jsx("small", { children: `${members.length} people in` })]
				}), /* @__PURE__ */ _jsx(Button, {
					kind: "primary",
					wide: true,
					disabled: members.length < 2,
					onClick: () => dispatch({ t: "draw" }),
					children: "Draw"
				})]
			}) : !mine ? /* @__PURE__ */ _jsx("div", {
				style: {
					minHeight: 60,
					display: "flex",
					alignItems: "center"
				},
				children: /* @__PURE__ */ _jsx("span", { children: "Not in this draw" })
			}) : revealed ? /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 8
				},
				children: [
					/* @__PURE__ */ _jsx("small", { children: "You give to" }),
					/* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: 44
						},
						children: [/* @__PURE__ */ _jsx(Avatar, {
							user: mine.receiver,
							size: 32
						}), /* @__PURE__ */ _jsx("h2", {
							style: { margin: 0 },
							children: nameOf(mine.receiver)
						})]
					}),
					/* @__PURE__ */ _jsx(Button, {
						kind: "secondary",
						onClick: () => setLocal({ shown: 0 }),
						children: "Hide"
					})
				]
			}) : /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 8
				},
				children: [/* @__PURE__ */ _jsx("small", { children: "Your match is ready" }), /* @__PURE__ */ _jsx(Button, {
					kind: "primary",
					wide: true,
					onClick: () => setLocal({ shown: confirmed.drawnAt }),
					children: "Reveal"
				})]
			}),
			drawn && !drawing && confirmed.drawer === me ? /* @__PURE__ */ _jsx("div", {
				style: { marginTop: 8 },
				children: /* @__PURE__ */ _jsx(Button, {
					kind: "deemphasized",
					onClick: () => {
						setLocal({ shown: 0 });
						dispatch({ t: "reset" });
					},
					children: "Reset"
				})
			}) : null
		] });
	}
});
