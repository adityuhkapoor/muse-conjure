import { defineApp, Avatar, Button, CardHeader, SystemLine, clock, rng } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Chat content for this game.
const CHAT = {
	title: "20 questions",
	max: 20,
	reader: "Naomi",
	rules: "Only people in this chat · yes or no only"
};
const MAX = CHAT.max;
const MAX_TEXT = 60;
const SPIN_MS = 1500;
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const nameIn = (ctx, id) => ctx.members.find((m) => m.id === id)?.name ?? "Someone";
const idle = (rounds) => ({
	phase: "idle",
	holder: null,
	secret: null,
	asked: [],
	winner: null,
	at: 0,
	rounds
});
const openQ = (s) => s.asked.length > 0 && s.asked[s.asked.length - 1].answer === null;
const allAnswered = (s) => s.asked.every((q) => q.answer !== null);
const settle = (s) => s.phase === "playing" && s.asked.length >= MAX && allAnswered(s) ? {
	...s,
	phase: "over"
} : s;
export default defineApp({
	name: "20 questions",
	summary: (s, ctx) => {
		if (s.phase === "idle") return "20 questions. Ready to start.";
		if (s.phase === "playing") return `20 questions · ${s.asked.length} of ${MAX} used`;
		return s.winner !== null ? `20 questions · ${nameIn(ctx, s.winner)} guessed it` : "20 questions · out of questions";
	},
	init: () => idle(0),
	reduce: (s, a, m, ctx) => {
		if (!inChat(ctx, m.user)) return s;
		switch (a.t) {
			case "start": {
				if (s.phase === "playing" || ctx.members.length < 2) return s;
				const holder = rng(m.seed).pick(ctx.members.map((x) => x.id));
				return {
					phase: "playing",
					holder,
					secret: null,
					asked: [],
					winner: null,
					at: m.time,
					rounds: s.rounds + 1
				};
			}
			case "choose": {
				if (s.phase !== "playing" || m.user !== s.holder || s.secret !== null) return s;
				if (typeof a.person !== "string" || a.person === s.holder || !inChat(ctx, a.person)) return s;
				return {
					...s,
					secret: a.person
				};
			}
			case "ask": {
				if (s.phase !== "playing" || s.secret === null || m.user === s.holder) return s;
				if (typeof a.text !== "string" || s.asked.length >= MAX || openQ(s)) return s;
				const text = a.text.trim();
				if (!text || text.length > MAX_TEXT) return s;
				return {
					...s,
					asked: [...s.asked, {
						id: "q" + m.seq,
						by: m.user,
						text,
						answer: null
					}]
				};
			}
			case "answer": {
				if (s.phase !== "playing" || m.user !== s.holder) return s;
				if (typeof a.id !== "string" || a.answer !== "yes" && a.answer !== "no") return s;
				const ans = a.answer;
				const q = s.asked.find((x) => x.id === a.id);
				if (!q || q.answer !== null) return s;
				return settle({
					...s,
					asked: s.asked.map((x) => x.id === q.id ? {
						...x,
						answer: ans
					} : x)
				});
			}
			case "guess": {
				if (s.phase !== "playing" || s.secret === null || m.user === s.holder) return s;
				if (typeof a.person !== "string" || a.person === s.holder || !inChat(ctx, a.person)) return s;
				if (s.asked.length >= MAX || openQ(s)) return s;
				if (a.person === s.secret) return {
					...s,
					phase: "over",
					winner: m.user
				};
				const text = `Is it ${nameIn(ctx, a.person)}?`.slice(0, MAX_TEXT);
				return settle({
					...s,
					asked: [...s.asked, {
						id: "q" + m.seq,
						by: m.user,
						text,
						answer: "no"
					}]
				});
			}
			case "reset": return s.phase === "idle" ? s : idle(s.rounds);
		}
		return s;
	},
	// If the holder, the secret person or the winner leaves, the round ends.
	onMembers: (s, ctx) => {
		if (s.phase === "idle") return s;
		const gone = (id) => id !== null && !inChat(ctx, id);
		if (gone(s.holder) || gone(s.secret) || gone(s.winner)) return idle(s.rounds);
		return s;
	},
	invariants: {
		"at most 20 questions, unique ids, answers are yes, no or open, and only the last is open": (s) => s.asked.length <= MAX && new Set(s.asked.map((q) => q.id)).size === s.asked.length && s.asked.every((q, i) => q.answer === "yes" || q.answer === "no" || q.answer === null && i === s.asked.length - 1),
		"idle means nothing is set": (s) => s.phase !== "idle" || s.holder === null && s.secret === null && s.winner === null && s.asked.length === 0,
		"a round has a holder who is never the secret and never asks, and questions need a secret": (s) => s.phase === "idle" || typeof s.holder === "string" && s.secret !== s.holder && s.asked.every((q) => q.by !== s.holder) && (s.asked.length === 0 || s.secret !== null),
		"a round ends with a winner or 20 answered questions, and only then": (s) => (s.phase !== "over" || s.winner !== null || s.asked.length === MAX && allAnswered(s)) && (s.winner === null || s.phase === "over" && s.winner !== s.holder) && (s.phase !== "playing" || !(s.asked.length === MAX && allAnswered(s))),
		"holder, secret and winner are in the chat": (s, ctx) => [
			s.holder,
			s.secret,
			s.winner
		].every((id) => id === null || inChat(ctx, id))
	},
	transitions: {
		"start makes the seed's pick the holder, with a clean round": (p, n, a, m, ctx) => a.t !== "start" || p === n || p.phase !== "playing" && n.phase === "playing" && n.holder === rng(m.seed).pick(ctx.members.map((x) => x.id)) && n.secret === null && n.winner === null && n.asked.length === 0 && n.at === m.time && n.rounds === p.rounds + 1,
		"only the holder chooses the secret, and it is the person given": (p, n, a, m) => a.t !== "choose" || p === n || m.user === p.holder && p.secret === null && n.secret === a.person && n.asked === p.asked && n.holder === p.holder,
		"an ask adds one open question by the actor, never the holder": (p, n, a, m) => {
			if (a.t !== "ask" || p === n) return true;
			const last = n.asked[n.asked.length - 1];
			return n.asked.length === p.asked.length + 1 && !!last && last.id === "q" + m.seq && last.by === m.user && m.user !== p.holder && last.answer === null && last.text === a.text.trim();
		},
		"only the holder answers, and only that question changes": (p, n, a, m) => {
			if (a.t !== "answer" || p === n) return true;
			const before = p.asked.find((q) => q.id === a.id);
			const after = n.asked.find((q) => q.id === a.id);
			return m.user === p.holder && !!before && before.answer === null && after?.answer === a.answer && n.asked.length === p.asked.length && p.asked.filter((q, i) => q.answer !== n.asked[i].answer).length === 1;
		},
		"a right guess wins for the actor, a wrong guess costs one question": (p, n, a, m) => {
			if (a.t !== "guess" || p === n) return true;
			if (m.user === p.holder) return false;
			if (a.person === p.secret) return n.phase === "over" && n.winner === m.user;
			const last = n.asked[n.asked.length - 1];
			return n.winner === null && n.asked.length === p.asked.length + 1 && last?.by === m.user && last.answer === "no";
		},
		"a reset goes back to idle keeping the round count, and only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user) && n.rounds >= p.rounds && (a.t !== "reset" || n.phase === "idle" && n.rounds === p.rounds && p.phase !== "idle")
	},
	arbitrary: (s, user, r, ctx) => {
		const ids = ctx.members.map((x) => x.id);
		if (ids.length === 0) return null;
		if (s.phase !== "playing") return r.next() < .85 ? { t: "start" } : { t: "reset" };
		if (user === s.holder) {
			const others = ids.filter((i) => i !== user);
			if (s.secret === null) return others.length ? {
				t: "choose",
				person: r.pick(others)
			} : { t: "reset" };
			const last = s.asked[s.asked.length - 1];
			if (last && last.answer === null) return {
				t: "answer",
				id: last.id,
				answer: r.next() < .5 ? "yes" : "no"
			};
			return r.next() < .2 ? { t: "reset" } : {
				t: "answer",
				id: "q0",
				answer: "yes"
			};
		}
		const k = r.next();
		if (k < .55) return {
			t: "ask",
			text: r.pick([
				"Are they tall?",
				"Do they drive?",
				"Are they in this car?",
				"",
				"Do they like takis?",
				"Is it a girl?"
			])
		};
		if (k < .88) {
			const pool = ids.filter((i) => i !== s.holder);
			return pool.length ? {
				t: "guess",
				person: r.pick(pool)
			} : null;
		}
		return r.next() < .5 ? { t: "start" } : { t: "reset" };
	},
	local: {
		draft: "",
		open: false
	},
	view: ({ state, confirmed, pending, me, members, dispatch, theme, local, setLocal }) => {
		const nameOf = (id) => id === null ? "" : members.find((m) => m.id === id)?.name ?? "Someone";
		const used = state.asked.length;
		const waiting = pending && state.rounds !== confirmed.rounds;
		const animating = !waiting && confirmed.phase === "playing" && confirmed.at > 0 && clock.value - confirmed.at < SPIN_MS;
		const spinning = waiting || animating;
		const iAmHolder = state.holder === me;
		const open = openQ(state);
		const hasReader = members.some((m) => m.name === CHAT.reader);
		const bars = Array.from({ length: MAX }, (_, i) => {
			const q = state.asked[i];
			if (!q) return theme.color.track;
			return q.answer === "yes" ? theme.color.positive : q.answer === "no" ? theme.color.secondaryText : theme.color.warning;
		});
		const subtitle = state.phase === "idle" ? "Pick a holder" : state.phase === "over" ? state.winner !== null ? `${nameOf(state.winner)} guessed it` : "Out of questions" : spinning ? "Picking a holder" : `Question ${Math.min(used + 1, MAX)} of ${MAX}`;
		const submit = () => {
			const text = local.draft.trim();
			if (!text || open || used >= MAX) return;
			dispatch({
				t: "ask",
				text: text.slice(0, MAX_TEXT)
			});
			setLocal({ draft: "" });
		};
		const recent = state.asked.slice(-2);
		const firstIdx = used - recent.length;
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: CHAT.title,
				subtitle
			}),
			/* @__PURE__ */ _jsx("div", {
				role: "img",
				"aria-label": `${used} of ${MAX} questions used`,
				style: {
					display: "flex",
					gap: 3,
					height: 12,
					margin: "4px 0 8px"
				},
				children: bars.map((c, i) => /* @__PURE__ */ _jsx("div", { style: {
					flex: 1,
					borderRadius: 6,
					background: c
				} }, i))
			}),
			state.phase === "idle" ? /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 8
				},
				children: [
					/* @__PURE__ */ _jsx("small", { children: CHAT.rules }),
					hasReader ? /* @__PURE__ */ _jsxs("small", { children: [CHAT.reader, " reads the questions aloud"] }) : null,
					/* @__PURE__ */ _jsx(Button, {
						kind: "primary",
						wide: true,
						disabled: members.length < 2,
						onClick: () => dispatch({ t: "start" }),
						children: "Start"
					})
				]
			}) : null,
			state.phase === "over" ? /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 8
				},
				children: [
					state.winner !== null ? /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx("h2", {
						style: { color: theme.color.positive },
						children: `${nameOf(state.winner)} got it`
					}), /* @__PURE__ */ _jsx("small", { children: `It was ${nameOf(state.secret)} · ${used} of ${MAX} questions` })] }) : /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx("h2", { children: "Out of questions" }), /* @__PURE__ */ _jsx("small", { children: `It was ${nameOf(state.secret)} · ${used} of ${MAX} questions` })] }),
					/* @__PURE__ */ _jsxs("small", { children: ["Held by ", nameOf(state.holder)] }),
					/* @__PURE__ */ _jsx(Button, {
						kind: "primary",
						wide: true,
						onClick: () => dispatch({ t: "start" }),
						children: "Play again"
					})
				]
			}) : null,
			state.phase === "playing" && spinning ? /* @__PURE__ */ _jsx(SystemLine, { children: "Spinning" }) : null,
			state.phase === "playing" && !spinning && state.holder !== null ? /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 8
				},
				children: [/* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						minHeight: 44
					},
					children: [/* @__PURE__ */ _jsx(Avatar, {
						user: state.holder,
						size: 32
					}), /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx("div", {
						style: { fontWeight: 600 },
						children: iAmHolder ? "You hold it" : `${nameOf(state.holder)} holds it`
					}), /* @__PURE__ */ _jsx("small", { children: iAmHolder && state.secret !== null ? `Your person · ${nameOf(state.secret)}` : CHAT.rules })] })]
				}), state.secret === null ? iAmHolder ? /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx("small", { children: "Pick someone from the chat" }), /* @__PURE__ */ _jsx("div", {
					style: {
						display: "flex",
						flexWrap: "wrap",
						gap: 8,
						marginTop: 4
					},
					children: members.filter((m) => m.id !== me).map((m) => /* @__PURE__ */ _jsx(Button, {
						kind: "secondary",
						onClick: () => dispatch({
							t: "choose",
							person: m.id
						}),
						children: m.name
					}, m.id))
				})] }) : /* @__PURE__ */ _jsx(SystemLine, { children: `Waiting for ${nameOf(state.holder)} to pick` }) : /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "grid",
						gap: 8
					},
					children: [recent.length ? /* @__PURE__ */ _jsx("div", {
						style: {
							display: "grid",
							gap: 2
						},
						children: recent.map((q, i) => /* @__PURE__ */ _jsxs("div", {
							style: {
								display: "flex",
								gap: 8,
								alignItems: "baseline",
								minHeight: 24
							},
							children: [
								/* @__PURE__ */ _jsx("small", { children: `Q${firstIdx + i + 1}` }),
								/* @__PURE__ */ _jsx("span", {
									style: {
										flex: 1,
										minWidth: 0
									},
									children: q.text
								}),
								/* @__PURE__ */ _jsx("b", { children: q.answer === "yes" ? "Yes" : q.answer === "no" ? "No" : "…" })
							]
						}, q.id))
					}) : /* @__PURE__ */ _jsx("small", { children: "No questions yet" }), iAmHolder ? open ? /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							gap: 8
						},
						children: [/* @__PURE__ */ _jsx(Button, {
							kind: "primary",
							wide: true,
							onClick: () => dispatch({
								t: "answer",
								id: state.asked[used - 1].id,
								answer: "yes"
							}),
							children: "Yes"
						}), /* @__PURE__ */ _jsx(Button, {
							wide: true,
							onClick: () => dispatch({
								t: "answer",
								id: state.asked[used - 1].id,
								answer: "no"
							}),
							children: "No"
						})]
					}) : /* @__PURE__ */ _jsx(SystemLine, { children: "Waiting for the next question" }) : /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "grid",
							gap: 8
						},
						children: [
							/* @__PURE__ */ _jsxs("form", {
								style: {
									display: "flex",
									gap: 8
								},
								onSubmit: (e) => {
									e.preventDefault();
									submit();
								},
								children: [/* @__PURE__ */ _jsx("input", {
									value: local.draft,
									maxLength: MAX_TEXT,
									placeholder: "Yes or no question",
									"aria-label": "Question",
									onInput: (e) => setLocal({ draft: e.currentTarget.value })
								}), /* @__PURE__ */ _jsx(Button, {
									kind: "primary",
									disabled: open || !local.draft.trim(),
									onClick: submit,
									children: "Ask"
								})]
							}),
							open ? /* @__PURE__ */ _jsx("small", { children: "Waiting for the answer" }) : null,
							/* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								wide: true,
								onClick: () => setLocal({ open: !local.open }),
								children: "Guess who"
							}),
							local.open ? /* @__PURE__ */ _jsx("div", {
								style: {
									display: "flex",
									flexWrap: "wrap",
									gap: 8
								},
								children: members.filter((m) => m.id !== state.holder).map((m) => /* @__PURE__ */ _jsx(Button, {
									kind: "secondary",
									disabled: open,
									onClick: () => {
										dispatch({
											t: "guess",
											person: m.id
										});
										setLocal({ open: false });
									},
									children: m.name
								}, m.id))
							}) : null
						]
					})]
				})]
			}) : null
		] });
	}
});
