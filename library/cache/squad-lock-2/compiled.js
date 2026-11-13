import { defineApp, Avatar, Button, CardHeader, Progress } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Who's in: everyone answers in, maybe or out. When enough are in, the game locks and stays locked.
const EVENT = {
	title: "Who's in for Thursday?",
	detail: "Pickup 5v5 · Thursday 6pm · Lot B field",
	lockedDetail: "Thursday 6pm · Lot B field",
	need: 4
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
const MAX_NOTE = 40;
const isAnswer = (x) => x === "in" || x === "maybe" || x === "out";
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const countIn = (answers) => Object.values(answers).filter((v) => v === "in").length;
const rest = (o, user) => JSON.stringify(Object.entries(o).filter(([k]) => k !== user).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
const without = (o, user) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== user));
export default defineApp({
	name: "Who's in",
	summary: (s) => {
		const n = countIn(s.answers);
		return s.lockedAt !== null ? `${s.title} Locked · ${n} going` : `${s.title} ${n} of ${s.need} in`;
	},
	init: () => ({
		title: EVENT.title,
		need: EVENT.need,
		answers: {},
		notes: {},
		lockedAt: null
	}),
	reduce: (s, a, m, ctx) => {
		if (!inChat(ctx, m.user)) return s;
		if (a.t === "answer") {
			if (!isAnswer(a.value) || s.answers[m.user] === a.value) return s;
			const answers = {
				...s.answers,
				[m.user]: a.value
			};
			const lockedAt = s.lockedAt === null && countIn(answers) >= s.need ? m.time : s.lockedAt;
			return {
				...s,
				answers,
				lockedAt
			};
		}
		if (a.t === "note") {
			if (typeof a.text !== "string") return s;
			const t = a.text.trim();
			if (t.length > MAX_NOTE) return s;
			if (t === "") {
				if (s.notes[m.user] === undefined) return s;
				return {
					...s,
					notes: without(s.notes, m.user)
				};
			}
			if (s.notes[m.user] === t) return s;
			return {
				...s,
				notes: {
					...s.notes,
					[m.user]: t
				}
			};
		}
		if (a.t === "clear") {
			if (s.answers[m.user] === undefined && s.notes[m.user] === undefined) return s;
			return {
				...s,
				answers: without(s.answers, m.user),
				notes: without(s.notes, m.user)
			};
		}
		return s;
	},
	onMembers: (s, ctx) => {
		const okA = Object.keys(s.answers).every((k) => inChat(ctx, k));
		const okN = Object.keys(s.notes).every((k) => inChat(ctx, k));
		if (okA && okN) return s;
		return {
			...s,
			answers: Object.fromEntries(Object.entries(s.answers).filter(([k]) => inChat(ctx, k))),
			notes: Object.fromEntries(Object.entries(s.notes).filter(([k]) => inChat(ctx, k)))
		};
	},
	invariants: {
		"answers and notes belong to people in the chat": (s, ctx) => Object.keys(s.answers).every((k) => inChat(ctx, k)) && Object.keys(s.notes).every((k) => inChat(ctx, k)),
		"every answer is in, maybe or out": (s) => Object.values(s.answers).every(isAnswer),
		"every note is trimmed, not empty, at most 40 characters": (s) => Object.values(s.notes).every((t) => typeof t === "string" && t.length > 0 && t.length <= MAX_NOTE && t === t.trim()),
		"the bar to lock is always 4": (s) => s.need === EVENT.need,
		"not locked means fewer than 4 are in": (s) => s.lockedAt !== null || countIn(s.answers) < s.need,
		"a lock has a time": (s) => s.lockedAt === null || Number.isFinite(s.lockedAt)
	},
	transitions: {
		"an answer sets only the actor's own answer": (p, n, a, m) => a.t !== "answer" || p === n || n.answers[m.user] === a.value && rest(p.answers, m.user) === rest(n.answers, m.user) && JSON.stringify(p.notes) === JSON.stringify(n.notes),
		"a note sets only the actor's own note": (p, n, a, m) => {
			if (a.t !== "note" || p === n) return true;
			const t = String(a.text).trim();
			return n.notes[m.user] === (t === "" ? undefined : t) && rest(p.notes, m.user) === rest(n.notes, m.user) && JSON.stringify(p.answers) === JSON.stringify(n.answers);
		},
		"clear removes only the actor's answer and note": (p, n, a, m) => a.t !== "clear" || p === n || n.answers[m.user] === undefined && n.notes[m.user] === undefined && rest(p.answers, m.user) === rest(n.answers, m.user) && rest(p.notes, m.user) === rest(n.notes, m.user),
		"a lock never changes or lifts": (p, n) => p.lockedAt === null || n.lockedAt === p.lockedAt,
		"a lock is set only by an answer that reaches the bar": (p, n, a, m) => p.lockedAt !== null || n.lockedAt === null || a.t === "answer" && n.lockedAt === m.time && countIn(n.answers) >= n.need,
		"the title and the bar never change": (p, n) => p.title === n.title && p.need === n.need,
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		const x = r.next();
		if (x < .6) return {
			t: "answer",
			value: r.pick(ANSWERS)
		};
		if (x < .85) return {
			t: "note",
			text: r.pick([
				"ankle",
				"late 7:15",
				"  bringing cones ",
				"",
				"x".repeat(50)
			])
		};
		return s.answers[user] !== undefined || s.notes[user] !== undefined ? { t: "clear" } : {
			t: "answer",
			value: "in"
		};
	},
	local: { draft: "" },
	view: ({ state, me, members, dispatch, local, setLocal }) => {
		const n = countIn(state.answers);
		const locked = state.lockedAt !== null;
		const mine = state.answers[me] ?? null;
		const left = Math.max(0, state.need - n);
		const rank = (id) => {
			const v = state.answers[id];
			return v === "in" ? 0 : v === "maybe" ? 1 : v === "out" ? 2 : 3;
		};
		const sorted = [...members].sort((a, b) => rank(a.id) - rank(b.id));
		const draft = local.draft.trim();
		const save = () => {
			if (!draft || draft.length > MAX_NOTE) return;
			dispatch({
				t: "note",
				text: draft
			});
			setLocal({ draft: "" });
		};
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: EVENT.detail
			}),
			locked ? /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx("div", {
				style: { fontWeight: 600 },
				children: `Locked · ${n} going`
			}), /* @__PURE__ */ _jsx("small", { children: EVENT.lockedDetail })] }) : /* @__PURE__ */ _jsx(Progress, {
				value: Math.min(n, state.need),
				max: state.need,
				label: `${n} of ${state.need} in · ${left} more to lock`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 2,
					marginTop: 8
				},
				children: sorted.map((m) => {
					const v = state.answers[m.id];
					const note = state.notes[m.id];
					return /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: 28
						},
						children: [
							/* @__PURE__ */ _jsx(Avatar, {
								user: m,
								size: 24
							}),
							/* @__PURE__ */ _jsxs("div", {
								style: {
									flex: 1,
									minWidth: 0,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap"
								},
								children: [m.id === me ? "You" : m.name, note ? /* @__PURE__ */ _jsx("small", { children: ` · ${note}` }) : null]
							}),
							v ? /* @__PURE__ */ _jsx("small", {
								style: { fontWeight: 600 },
								children: LABELS[v]
							}) : /* @__PURE__ */ _jsx("small", { children: "No answer" })
						]
					}, m.id);
				})
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "flex",
					gap: 8,
					marginTop: 8
				},
				children: ANSWERS.map((k) => /* @__PURE__ */ _jsx("div", {
					style: {
						flex: 1,
						display: "flex"
					},
					children: /* @__PURE__ */ _jsx(Button, {
						kind: mine === k || mine === null && k === "in" ? "primary" : "secondary",
						wide: true,
						onClick: () => mine === k ? dispatch({ t: "clear" }) : dispatch({
							t: "answer",
							value: k
						}),
						children: LABELS[k]
					})
				}, k))
			}),
			mine ? /* @__PURE__ */ _jsxs("form", {
				style: {
					display: "flex",
					gap: 8,
					marginTop: 8
				},
				onSubmit: (e) => {
					e.preventDefault();
					save();
				},
				children: [/* @__PURE__ */ _jsx("input", {
					value: local.draft,
					maxLength: MAX_NOTE,
					placeholder: "Add a note",
					"aria-label": "Add a note",
					onInput: (e) => setLocal({ draft: e.currentTarget.value })
				}), /* @__PURE__ */ _jsx(Button, {
					kind: "deemphasized",
					disabled: !draft,
					onClick: save,
					children: "Save"
				})]
			}) : null
		] });
	}
});
