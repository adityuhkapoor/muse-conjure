import { defineApp, Avatar, Button, CardHeader, SystemLine, rng, running } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Liar's dice deal: everyone gets hidden dice, rolled from the server seed. Each person sees
// only their own until everyone has said ready, then all dice are shown so the group can check
// who was lying.
const G = {
	title: "Liar's dice at Leo's",
	dice: 5,
	rule: "Each bid must raise · loser of the round loses a die"
};
const ROLL_MS = 800;
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const handIds = (s) => Object.keys(s.hands);
const allReady = (s) => handIds(s).length > 0 && handIds(s).every((id) => s.ready.includes(id));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** After a member change: an empty table goes back to waiting; a table where everyone left is ready shows. */
function settle(s) {
	if (s.phase === "waiting") return s;
	if (handIds(s).length === 0) return {
		...s,
		phase: "waiting",
		hands: {},
		ready: [],
		dealtAt: 0
	};
	if (s.phase === "dealt" && allReady(s)) return {
		...s,
		phase: "revealed"
	};
	return s;
}
export default defineApp({
	name: "Liar's dice",
	summary: (s) => {
		if (s.phase === "waiting") return `${s.title} Not dealt yet.`;
		if (s.phase === "dealt") return `${s.title} ${s.ready.length} of ${handIds(s).length} ready.`;
		return `${s.title} Dice shown.`;
	},
	init: () => ({
		title: G.title,
		dicePerPerson: Math.max(1, Math.min(6, Math.floor(G.dice) || 5)),
		phase: "waiting",
		hands: {},
		ready: [],
		dealtAt: 0,
		round: 0
	}),
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "deal") {
			if (state.phase === "dealt" || ctx.members.length === 0) return state;
			const r = rng(meta.seed);
			const hands = {};
			for (const mem of ctx.members) hands[mem.id] = Array.from({ length: state.dicePerPerson }, () => r.int(6) + 1);
			return {
				...state,
				phase: "dealt",
				hands,
				ready: [],
				dealtAt: meta.time,
				round: state.round + 1
			};
		}
		if (action.t === "ready") {
			if (state.phase !== "dealt" || !handIds(state).includes(meta.user) || state.ready.includes(meta.user)) return state;
			const ready = [...state.ready, meta.user];
			const done = handIds(state).every((id) => ready.includes(id));
			return {
				...state,
				ready,
				phase: done ? "revealed" : "dealt"
			};
		}
		if (action.t === "again") {
			if (state.phase !== "revealed") return state;
			return {
				...state,
				phase: "waiting",
				hands: {},
				ready: [],
				dealtAt: 0
			};
		}
		return state;
	},
	// Someone left: their dice and ready mark go. If everyone still here is ready, the dice show.
	onMembers: (state, ctx) => {
		const keep = handIds(state).filter((id) => inChat(ctx, id));
		const readyKeep = state.ready.filter((id) => inChat(ctx, id));
		if (keep.length === handIds(state).length && readyKeep.length === state.ready.length) return state;
		const hands = {};
		for (const id of keep) hands[id] = state.hands[id] ?? [];
		return settle({
			...state,
			hands,
			ready: readyKeep
		});
	},
	invariants: {
		"every die is a whole number from 1 to 6": (s) => handIds(s).every((id) => (s.hands[id] ?? []).every((d) => Number.isInteger(d) && d >= 1 && d <= 6)),
		"a waiting table is empty and a dealt table has full hands": (s) => s.phase === "waiting" ? handIds(s).length === 0 && s.ready.length === 0 && s.dealtAt === 0 : handIds(s).length > 0 && handIds(s).every((id) => (s.hands[id] ?? []).length === s.dicePerPerson),
		"ready has no repeats and only people with dice": (s) => new Set(s.ready).size === s.ready.length && s.ready.every((id) => handIds(s).includes(id)),
		"dice and ready marks belong to people in the chat": (s, ctx) => handIds(s).every((id) => inChat(ctx, id)) && s.ready.every((id) => inChat(ctx, id)),
		"dice are shown only when everyone with dice is ready": (s) => s.phase !== "revealed" || allReady(s),
		"dice stay hidden while someone with dice is not ready": (s) => s.phase !== "dealt" || handIds(s).length > 0 && !allReady(s)
	},
	transitions: {
		"a deal gives every member the dice rng(seed) draws and clears ready": (p, n, a, m, ctx) => {
			if (a.t !== "deal" || p === n) return true;
			const r = rng(m.seed);
			const want = {};
			for (const mem of ctx.members) want[mem.id] = Array.from({ length: p.dicePerPerson }, () => r.int(6) + 1);
			return p.phase !== "dealt" && n.phase === "dealt" && same(n.hands, want) && n.ready.length === 0 && n.round === p.round + 1 && n.dealtAt === m.time;
		},
		"a ready adds only the actor and changes no dice": (p, n, a, m) => a.t !== "ready" || p === n || n.ready.length === p.ready.length + 1 && n.ready.includes(m.user) && p.ready.every((x) => n.ready.includes(x)) && same(p.hands, n.hands),
		"only someone with dice who is not ready can mark ready": (p, n, a, m) => a.t !== "ready" || p === n || p.phase === "dealt" && Object.keys(p.hands).includes(m.user) && !p.ready.includes(m.user),
		"the last ready shows the dice and nothing shows them earlier": (p, n, a) => a.t !== "ready" || p === n || n.phase === "revealed" === allReady(n),
		"dice change only on a deal": (p, n, a) => a.t === "deal" || a.t === "again" || same(p.hands, n.hands),
		"again works only from shown dice and empties the table": (p, n, a) => a.t !== "again" || p === n || p.phase === "revealed" && n.phase === "waiting" && Object.keys(n.hands).length === 0 && n.ready.length === 0 && n.round === p.round,
		"the title and dice count never change": (p, n) => p.title === n.title && p.dicePerPerson === n.dicePerPerson,
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, _user, r) => {
		const k = r.next();
		if (s.phase === "waiting") return { t: "deal" };
		if (s.phase === "dealt") return k < .85 ? { t: "ready" } : { t: "deal" };
		return k < .7 ? { t: "deal" } : k < .9 ? { t: "again" } : { t: "ready" };
	},
	local: {},
	view: ({ state, confirmed, pending, me, members, dispatch, theme }) => {
		const c = confirmed;
		const dealing = pending && c.phase === "waiting" && state.phase === "dealt";
		const holders = members.filter((m) => c.hands[m.id]);
		const mine = c.hands[me];
		const iAmReady = c.ready.includes(me);
		const e = c.phase === "dealt" ? running(c.dealtAt, ROLL_MS) : null;
		const face = (v, i) => e === null ? String(v) : String((Math.floor(e / 80) + i * 2) % 6 + 1);
		const die = (v, i, size, key) => /* @__PURE__ */ _jsx("div", {
			style: {
				width: size,
				height: size,
				borderRadius: theme.radius.button,
				background: theme.color.input,
				color: theme.color.text,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				fontWeight: 700,
				fontSize: size > 30 ? 20 : 13,
				flex: "none"
			},
			children: face(v, i)
		}, key);
		const subtitle = c.phase === "waiting" ? `Not dealt yet · ${c.dicePerPerson} dice each` : c.phase === "dealt" ? `${c.ready.length} of ${holders.length} ready` : `Round ${c.round} · dice shown`;
		const tally = [
			1,
			2,
			3,
			4,
			5,
			6
		].map((f) => `${f}s ${Object.values(c.hands).reduce((n, h) => n + h.filter((d) => d === f).length, 0)}`).join(" · ");
		return /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx(CardHeader, {
			title: c.title,
			subtitle
		}), dealing ? /* @__PURE__ */ _jsx("div", {
			style: {
				minHeight: 120,
				display: "flex",
				alignItems: "center",
				justifyContent: "center"
			},
			children: /* @__PURE__ */ _jsx(SystemLine, { children: "Dealing" })
		}) : c.phase === "waiting" ? /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx("small", { children: G.rule }), /* @__PURE__ */ _jsx("div", {
			style: { marginTop: 12 },
			children: /* @__PURE__ */ _jsx(Button, {
				kind: "primary",
				wide: true,
				disabled: pending,
				onClick: () => dispatch({ t: "deal" }),
				children: "Deal"
			})
		})] }) : c.phase === "dealt" ? /* @__PURE__ */ _jsxs("div", { children: [
			mine ? /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx("small", { children: "Your dice · only you see them" }), /* @__PURE__ */ _jsx("div", {
				style: {
					display: "flex",
					flexWrap: "wrap",
					gap: 6,
					marginTop: 4
				},
				children: mine.map((v, i) => die(v, i, 40, `m${i}`))
			})] }) : /* @__PURE__ */ _jsx(SystemLine, { children: "You join the next round" }),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 4,
					flexWrap: "wrap",
					marginTop: 12
				},
				children: holders.map((m) => c.ready.includes(m.id) ? /* @__PURE__ */ _jsx(Avatar, {
					user: m,
					size: 28
				}, m.id) : /* @__PURE__ */ _jsx("span", {
					"aria-hidden": "true",
					style: {
						width: 28,
						height: 28,
						borderRadius: 14,
						boxShadow: `inset 0 0 0 2px ${theme.color.divider}`
					}
				}, m.id))
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					marginTop: 12,
					minHeight: 44,
					display: "flex",
					alignItems: "center",
					justifyContent: "center"
				},
				children: mine && !iAmReady ? /* @__PURE__ */ _jsx(Button, {
					kind: "primary",
					wide: true,
					disabled: pending,
					onClick: () => dispatch({ t: "ready" }),
					children: "Ready"
				}) : /* @__PURE__ */ _jsx(SystemLine, { children: mine ? "Ready · waiting for the rest" : "Waiting for the rest" })
			})
		] }) : /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 2
				},
				children: holders.map((m) => /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 6,
						height: 26
					},
					children: [
						/* @__PURE__ */ _jsx(Avatar, {
							user: m,
							size: 22
						}),
						/* @__PURE__ */ _jsx("span", {
							style: {
								flex: 1,
								minWidth: 0,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap"
							},
							children: m.id === me ? "You" : m.name
						}),
						/* @__PURE__ */ _jsx("div", {
							style: {
								display: "flex",
								gap: 3
							},
							children: (c.hands[m.id] ?? []).map((v, i) => die(v, i, 22, `${m.id}${i}`))
						})
					]
				}, m.id))
			}),
			/* @__PURE__ */ _jsx("div", {
				style: { marginTop: 8 },
				children: /* @__PURE__ */ _jsx("small", { children: tally })
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					gap: 8,
					marginTop: 8
				},
				children: [/* @__PURE__ */ _jsx(Button, {
					kind: "primary",
					disabled: pending,
					onClick: () => dispatch({ t: "deal" }),
					children: "Deal again"
				}), /* @__PURE__ */ _jsx(Button, {
					kind: "deemphasized",
					disabled: pending,
					onClick: () => dispatch({ t: "again" }),
					children: "Clear"
				})]
			})
		] })] });
	}
});
