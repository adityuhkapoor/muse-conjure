import { defineApp, CardHeader, OptionRow, Progress, SystemLine } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Headcount: everyone answers in, maybe or out. The cabin books at 4 people in.
const C = {
	title: "Who's in for the cabin?",
	detail: "Dec 6 weekend · about $140 each",
	min: 4
};
const ANSWERS = [
	"in",
	"maybe",
	"out"
];
const LABELS = {
	in: "In",
	maybe: "Maybe",
	out: "Out"
};
const isAnswer = (x) => x === "in" || x === "maybe" || x === "out";
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const count = (r, a) => Object.keys(r).filter((k) => r[k] === a).length;
const who = (r, a) => Object.keys(r).filter((k) => r[k] === a);
const rest = (r, u) => Object.keys(r).filter((k) => k !== u).sort().map((k) => k + "=" + r[k]).join();
function settle(s, replies, time) {
	const ins = count(replies, "in");
	const lockedAt = ins >= s.min ? s.lockedAt ?? time : null;
	return {
		...s,
		replies,
		lockedAt
	};
}
export default defineApp({
	name: "Headcount",
	summary: (s) => s.lockedAt !== null ? `${C.title} Cabin books · ${count(s.replies, "in")} in.` : `${C.title} ${count(s.replies, "in")} of ${s.min} in.`,
	init: () => ({
		min: C.min,
		replies: {},
		lockedAt: null
	}),
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "reply") {
			if (!isAnswer(action.answer) || state.replies[meta.user] === action.answer) return state;
			return settle(state, {
				...state.replies,
				[meta.user]: action.answer
			}, meta.time);
		}
		if (action.t === "clear") {
			if (state.replies[meta.user] === undefined) return state;
			const replies = {};
			for (const k of Object.keys(state.replies)) if (k !== meta.user) replies[k] = state.replies[k];
			return settle(state, replies, meta.time);
		}
		return state;
	},
	// Someone left: their answer goes, and the lock lifts if the ins drop below the minimum.
	onMembers: (state, ctx) => {
		const keys = Object.keys(state.replies);
		if (keys.every((k) => inChat(ctx, k))) return state;
		const replies = {};
		for (const k of keys) if (inChat(ctx, k)) replies[k] = state.replies[k];
		return {
			...state,
			replies,
			lockedAt: count(replies, "in") >= state.min ? state.lockedAt : null
		};
	},
	invariants: {
		"every answer belongs to someone in the chat": (s, ctx) => Object.keys(s.replies).every((k) => inChat(ctx, k)),
		"every answer is in, maybe or out": (s) => Object.keys(s.replies).every((k) => isAnswer(s.replies[k])),
		"the minimum is 4": (s) => s.min === C.min,
		"locked exactly when the ins reach the minimum": (s) => s.lockedAt !== null === count(s.replies, "in") >= s.min,
		"the ins never outnumber the chat": (s, ctx) => count(s.replies, "in") <= ctx.members.length
	},
	transitions: {
		"a reply sets the actor's answer and leaves everyone else's alone": (p, n, a, m) => a.t !== "reply" || p === n || n.replies[m.user] === a.answer && rest(p.replies, m.user) === rest(n.replies, m.user),
		"a clear removes only the actor's answer": (p, n, a, m) => a.t !== "clear" || p === n || p.replies[m.user] !== undefined && n.replies[m.user] === undefined && rest(p.replies, m.user) === rest(n.replies, m.user),
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
		"the minimum never changes": (p, n) => p.min === n.min,
		"the lock time is set when the minimum is reached and then kept": (p, n, a, m) => {
			if (p.lockedAt !== null && n.lockedAt !== null) return p.lockedAt === n.lockedAt;
			if (p.lockedAt === null && n.lockedAt !== null) return count(n.replies, "in") >= n.min && n.lockedAt === m.time;
			return true;
		}
	},
	arbitrary: (s, user, r) => {
		if (s.replies[user] !== undefined && r.next() < .15) return { t: "clear" };
		return {
			t: "reply",
			answer: r.pick(ANSWERS)
		};
	},
	local: {},
	view: ({ state, me, members, dispatch }) => {
		const ins = count(state.replies, "in");
		const left = Math.max(0, state.min - ins);
		const mine = state.replies[me] ?? null;
		const waiting = members.filter((m) => state.replies[m.id] === undefined);
		const locked = state.lockedAt !== null;
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: C.title,
				subtitle: locked ? `Cabin books · ${ins} in` : `${ins} of ${state.min} needed · ${left} more to book`
			}),
			/* @__PURE__ */ _jsx(Progress, {
				value: Math.min(ins, state.min),
				max: state.min,
				label: `${ins} of ${state.min} in`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 2,
					marginTop: 8
				},
				children: ANSWERS.map((k) => /* @__PURE__ */ _jsx(OptionRow, {
					label: LABELS[k],
					count: count(state.replies, k),
					total: Math.max(1, members.length),
					voters: who(state.replies, k),
					selected: mine === k,
					onClick: () => {
						if (mine === k) dispatch({ t: "clear" });
						else dispatch({
							t: "reply",
							answer: k
						});
					}
				}, k))
			}),
			/* @__PURE__ */ _jsx("div", {
				style: { marginTop: 8 },
				children: /* @__PURE__ */ _jsx("small", { children: C.detail })
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					minHeight: 24,
					marginTop: 4
				},
				children: locked ? /* @__PURE__ */ _jsx(SystemLine, { children: "Enough to book" }) : waiting.length ? /* @__PURE__ */ _jsx(SystemLine, { children: `Waiting on ${waiting.map((m) => m.name).slice(0, 3).join(", ")}${waiting.length > 3 ? ` and ${waiting.length - 3} more` : ""}` }) : null
			})
		] });
	}
});
