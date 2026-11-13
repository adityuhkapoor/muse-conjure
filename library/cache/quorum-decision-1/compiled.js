import { defineApp, Button, CardHeader, OptionRow, Progress, SystemLine } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Yes or no on booking the cabin. Once enough say yes, the vote locks and the booker books.
const CABIN = {
	title: "Book the cabin?",
	need: 4,
	bookerName: "Naomi",
	facts: "Tahoe · $840 · Dec 6-8 · about $120 each if all 7 go · hot tub · listing holds till Friday"
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const rest = (s, user) => `${s.yes.filter((u) => u !== user).join()}|${s.no.filter((u) => u !== user).join()}`;
function vote(s, user, choice, time) {
	if (s.lockedAt !== null || choice !== "yes" && choice !== "no" || typeof time !== "number") return s;
	if ((choice === "yes" ? s.yes : s.no).includes(user)) return s;
	const yes = choice === "yes" ? [...s.yes, user] : s.yes.filter((u) => u !== user);
	const no = choice === "no" ? [...s.no, user] : s.no.filter((u) => u !== user);
	return {
		...s,
		yes,
		no,
		lockedAt: yes.length >= s.need ? time : null
	};
}
function clear(s, user) {
	if (s.lockedAt !== null || !s.yes.includes(user) && !s.no.includes(user)) return s;
	return {
		...s,
		yes: s.yes.filter((u) => u !== user),
		no: s.no.filter((u) => u !== user)
	};
}
export default defineApp({
	name: "Cabin vote",
	summary: (s) => s.lockedAt !== null ? `${CABIN.title} Locked · ${s.yes.length} yes.` : `${CABIN.title} ${s.yes.length} of ${s.need} yes · ${s.no.length} no.`,
	init: (ctx) => {
		const named = ctx.members.find((m) => m.name.toLowerCase() === CABIN.bookerName.toLowerCase())?.id;
		return {
			need: CABIN.need,
			yes: [],
			no: [],
			booker: named ?? ctx.members[0]?.id ?? "",
			lockedAt: null
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "vote") return vote(state, meta.user, action.choice, meta.time);
		if (action.t === "clear") return clear(state, meta.user);
		return state;
	},
	onMembers: (state, ctx) => {
		const yes = state.yes.filter((u) => inChat(ctx, u));
		const no = state.no.filter((u) => inChat(ctx, u));
		const booker = state.booker !== "" && inChat(ctx, state.booker) ? state.booker : ctx.members[0]?.id ?? "";
		if (yes.length === state.yes.length && no.length === state.no.length && booker === state.booker) return state;
		return {
			...state,
			yes,
			no,
			booker
		};
	},
	invariants: {
		"no one is in both lists or twice in one": (s) => new Set(s.yes).size === s.yes.length && new Set(s.no).size === s.no.length && s.yes.every((u) => !s.no.includes(u)),
		"everyone who voted is in the chat": (s, ctx) => s.yes.every((u) => inChat(ctx, u)) && s.no.every((u) => inChat(ctx, u)),
		"not locked means fewer yes than needed": (s) => s.lockedAt !== null || s.yes.length < s.need,
		"the bar is 4 and the booker is empty or in the chat": (s, ctx) => s.need === CABIN.need && (s.booker === "" || inChat(ctx, s.booker))
	},
	transitions: {
		"a vote puts the voter on the chosen side only and leaves everyone else as they were": (p, n, a, m) => a.t !== "vote" || p === n || (a.choice === "yes" ? n.yes : n.no).includes(m.user) && !(a.choice === "yes" ? n.no : n.yes).includes(m.user) && rest(p, m.user) === rest(n, m.user),
		"a clear removes only the actor from both lists": (p, n, a, m) => a.t !== "clear" || p === n || !n.yes.includes(m.user) && !n.no.includes(m.user) && rest(p, m.user) === rest(n, m.user) && (p.yes.includes(m.user) || p.no.includes(m.user)),
		"once locked, votes and clears change nothing": (p, n) => p.lockedAt === null || p === n,
		"the lock is set only by a vote that brings yes to the bar, at that time": (p, n, a, m) => p.lockedAt === n.lockedAt || a.t === "vote" && p.lockedAt === null && n.yes.length >= n.need && n.lockedAt === m.time,
		"the bar and the booker never change by an action": (p, n) => p.need === n.need && p.booker === n.booker,
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		if ((s.yes.includes(user) || s.no.includes(user)) && r.next() < .15) return { t: "clear" };
		return {
			t: "vote",
			choice: r.pick(["yes", "no"])
		};
	},
	local: {},
	view: ({ state, me, members, dispatch }) => {
		const locked = state.lockedAt !== null;
		const bookerName = members.find((m) => m.id === state.booker)?.name ?? "Someone";
		const total = Math.max(1, members.length);
		const voted = state.yes.includes(me) || state.no.includes(me);
		const left = Math.max(0, state.need - state.yes.length);
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: CABIN.title,
				subtitle: locked ? `Locked · ${bookerName} books` : `${state.yes.length} of ${state.need} yes needed`
			}),
			/* @__PURE__ */ _jsx("small", {
				style: {
					display: "block",
					marginBottom: 8
				},
				children: CABIN.facts
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 2
				},
				children: [/* @__PURE__ */ _jsx(OptionRow, {
					label: "Yes",
					count: state.yes.length,
					total,
					voters: state.yes,
					selected: state.yes.includes(me),
					onClick: () => {
						if (!locked) dispatch({
							t: "vote",
							choice: "yes"
						});
					}
				}), /* @__PURE__ */ _jsx(OptionRow, {
					label: "No",
					count: state.no.length,
					total,
					voters: state.no,
					selected: state.no.includes(me),
					onClick: () => {
						if (!locked) dispatch({
							t: "vote",
							choice: "no"
						});
					}
				})]
			}),
			/* @__PURE__ */ _jsx("div", {
				style: { marginTop: 8 },
				children: /* @__PURE__ */ _jsx(Progress, {
					value: Math.min(state.yes.length, state.need),
					max: state.need,
					label: locked ? `Locked · ${state.yes.length} yes` : `${state.yes.length} of ${state.need} yes · ${left} more to lock`
				})
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					minHeight: 24,
					marginTop: 8
				},
				children: locked ? /* @__PURE__ */ _jsx(SystemLine, { children: `Locked · ${bookerName} books it` }) : /* @__PURE__ */ _jsx(SystemLine, { children: `Nobody pays until ${state.need} say yes` })
			}),
			voted && !locked ? /* @__PURE__ */ _jsx(Button, {
				kind: "deemphasized",
				onClick: () => dispatch({ t: "clear" }),
				children: "Clear vote"
			}) : null
		] });
	}
});
