import { defineApp, Avatar, Button, CardHeader, Facepile, SystemLine } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "@muse/app/jsx-runtime";
const CHAT = {
	title: "Where should we eat?",
	places: [
		"Joe's Pizza",
		"Pho 79",
		"Chengdu Taste",
		"Shake Shack",
		"Taco Bell Cantina"
	]
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const openCount = (s) => s.options.filter((o) => o.vetoedBy === null).length;
const hasVeto = (s, u) => s.options.some((o) => o.vetoedBy === u);
const sameExcept = (p, n, i) => p.options.length === n.options.length && p.options.every((o, j) => j === i || n.options[j].id === o.id && n.options[j].label === o.label && n.options[j].vetoedBy === o.vetoedBy);
export default defineApp({
	name: "Veto round",
	summary: (s) => {
		const left = s.options.filter((o) => o.vetoedBy === null);
		if (left.length === 1) return `${CHAT.title} ${left[0].label} wins.`;
		return `${CHAT.title} ${s.options.length - left.length} of ${s.options.length} places struck.`;
	},
	init: () => ({ options: CHAT.places.map((label, i) => ({
		id: `p${i}`,
		label,
		vetoedBy: null
	})) }),
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (openCount(state) < 2) return state;
		if (action.t === "veto") {
			if (typeof action.option !== "string") return state;
			const o = state.options.find((x) => x.id === action.option);
			if (!o || o.vetoedBy !== null || hasVeto(state, meta.user)) return state;
			return { options: state.options.map((x) => x.id === o.id ? {
				...x,
				vetoedBy: meta.user
			} : x) };
		}
		if (action.t === "undo") {
			if (typeof action.option !== "string") return state;
			const o = state.options.find((x) => x.id === action.option);
			if (!o || o.vetoedBy !== meta.user) return state;
			return { options: state.options.map((x) => x.id === o.id ? {
				...x,
				vetoedBy: null
			} : x) };
		}
		return state;
	},
	// Someone left: their veto is lifted and the place is back in.
	onMembers: (state, ctx) => {
		if (state.options.every((o) => o.vetoedBy === null || inChat(ctx, o.vetoedBy))) return state;
		return { options: state.options.map((o) => o.vetoedBy !== null && !inChat(ctx, o.vetoedBy) ? {
			...o,
			vetoedBy: null
		} : o) };
	},
	invariants: {
		"nobody has more than one veto": (s) => {
			const by = s.options.map((o) => o.vetoedBy).filter((v) => v !== null);
			return new Set(by).size === by.length;
		},
		"everyone who vetoed is in the chat": (s, ctx) => s.options.every((o) => o.vetoedBy === null || inChat(ctx, o.vetoedBy)),
		"at least one place is never struck": (s) => openCount(s) >= 1,
		"the five places and their ids never change": (s) => s.options.length === CHAT.places.length && s.options.every((o, i) => o.label === CHAT.places[i] && o.id === `p${i}`)
	},
	transitions: {
		"a veto strikes one open place for the actor and changes no other": (p, n, a, m) => {
			if (a.t !== "veto" || p === n) return true;
			const i = p.options.findIndex((o) => o.id === a.option);
			return i >= 0 && p.options[i].vetoedBy === null && !hasVeto(p, m.user) && n.options[i]?.vetoedBy === m.user && sameExcept(p, n, i);
		},
		"a veto never happens when one place is left and never strikes the last open one": (p, n, a) => a.t !== "veto" || p === n || openCount(p) >= 2 && openCount(n) >= 1,
		"an undo clears the actor's own veto and changes no other place": (p, n, a, m) => {
			if (a.t !== "undo" || p === n) return true;
			const i = p.options.findIndex((o) => o.id === a.option);
			return i >= 0 && p.options[i].vetoedBy === m.user && n.options[i]?.vetoedBy === null && openCount(p) >= 2 && sameExcept(p, n, i);
		},
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
		"a veto or undo never changes labels or ids": (p, n) => p.options.length === n.options.length && p.options.every((o, i) => n.options[i].id === o.id && n.options[i].label === o.label)
	},
	arbitrary: (s, user, r) => {
		const mine = s.options.filter((o) => o.vetoedBy === user);
		if (mine.length && r.next() < .3) return {
			t: "undo",
			option: r.pick(mine).id
		};
		const open = s.options.filter((o) => o.vetoedBy === null);
		if (open.length && r.next() < .9) return {
			t: "veto",
			option: r.pick(open).id
		};
		return {
			t: "veto",
			option: r.pick(s.options).id
		};
	},
	local: {},
	view: ({ state, me, members, dispatch, theme }) => {
		const left = state.options.filter((o) => o.vetoedBy === null);
		const struck = state.options.length - left.length;
		const winner = left.length === 1 ? left[0] : null;
		const iVetoed = hasVeto(state, me);
		const waiting = members.filter((m) => !hasVeto(state, m.id)).map((m) => m.id);
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: CHAT.title,
				subtitle: winner ? `${winner.label} wins` : `${struck} of ${state.options.length} places struck`
			}),
			winner ? /* @__PURE__ */ _jsxs("div", {
				style: { marginBottom: 8 },
				children: [/* @__PURE__ */ _jsx("small", { children: "Winner" }), /* @__PURE__ */ _jsx("h2", {
					style: { margin: 0 },
					children: winner.label
				})]
			}) : null,
			/* @__PURE__ */ _jsx("div", {
				style: { display: "grid" },
				children: state.options.map((o) => {
					const out = o.vetoedBy !== null;
					const isWin = winner !== null && winner.id === o.id;
					return /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: 44,
							padding: "0 8px",
							borderRadius: theme.radius.button,
							background: isWin ? theme.color.selected : "transparent"
						},
						children: [/* @__PURE__ */ _jsx("div", {
							style: {
								flex: 1,
								minWidth: 0,
								color: out ? theme.color.secondaryText : theme.color.text,
								textDecoration: out ? "line-through" : "none",
								fontWeight: isWin ? 600 : 400
							},
							children: o.label
						}), out ? /* @__PURE__ */ _jsxs("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 6,
								flex: "none"
							},
							children: [/* @__PURE__ */ _jsx(Avatar, {
								user: o.vetoedBy,
								size: 24
							}), o.vetoedBy === me && !winner ? /* @__PURE__ */ _jsx(Button, {
								kind: "secondary",
								onClick: () => dispatch({
									t: "undo",
									option: o.id
								}),
								children: "Undo"
							}) : null]
						}) : !winner && !iVetoed ? /* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							onClick: () => dispatch({
								t: "veto",
								option: o.id
							}),
							children: "Veto"
						}) : null]
					}, o.id);
				})
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					minHeight: 44,
					marginTop: 4
				},
				children: winner ? /* @__PURE__ */ _jsx(SystemLine, { children: "Last place standing" }) : /* @__PURE__ */ _jsxs(_Fragment, { children: [waiting.length ? /* @__PURE__ */ _jsx(Facepile, {
					users: waiting,
					max: 4,
					size: 20
				}) : null, /* @__PURE__ */ _jsx("small", {
					style: {
						flex: 1,
						minWidth: 0
					},
					children: waiting.length === 0 ? "Everyone has vetoed" : `${waiting.length} ${waiting.length === 1 ? "person hasn't" : "people haven't"} vetoed yet`
				})] })
			})
		] });
	}
});
