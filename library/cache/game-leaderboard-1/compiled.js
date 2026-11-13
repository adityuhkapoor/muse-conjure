import { defineApp, Avatar, Button, CardHeader } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Leaderboard of Mario Kart totals across rounds. Everyone enters or fixes only their own score.
const CHAT = {
	title: "Mario Kart scores",
	// Points per round, by first name. Names are matched to members in init.
	rounds: [{
		Noor: 47,
		Jalen: 52,
		Ana: 61,
		Kev: 58,
		Sofia: 44,
		Rohan: 39
	}, {
		Jalen: 49,
		Ana: 55,
		Kev: 63,
		Sofia: 46,
		Rohan: 57,
		Noor: 50
	}]
};
const MAX_ROUNDS = 6;
const MAX_POINTS = 999;
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const has = (scores, id) => Object.keys(scores).includes(id);
const pts = (scores, id) => has(scores, id) ? scores[id] ?? 0 : 0;
const totalOf = (s, id) => s.rounds.reduce((n, r) => n + pts(r.scores, id), 0);
const hasAny = (s, id) => s.rounds.some((r) => has(r.scores, id));
const sig = (scores, skip) => Object.keys(scores).filter((k) => k !== skip).sort().map((k) => `${k}:${scores[k]}`).join("|");
/** Same rounds, and every entry the same except `user`'s entry in round `rid`. */
const othersSame = (p, n, user, rid) => p.rounds.length === n.rounds.length && p.rounds.every((r, i) => {
	const q = n.rounds[i];
	const skip = r.id === rid ? user : "";
	return !!q && q.id === r.id && q.name === r.name && sig(r.scores, skip) === sig(q.scores, skip);
});
const canAdd = (s) => {
	const last = s.rounds[s.rounds.length - 1];
	return s.rounds.length < MAX_ROUNDS && !!last && Object.keys(last.scores).length > 0;
};
const ranked = (s, members) => members.map((m, i) => ({
	m,
	i,
	total: totalOf(s, m.id)
})).filter((x) => hasAny(s, x.m.id)).sort((a, b) => b.total - a.total || a.i - b.i);
export default defineApp({
	name: "Leaderboard",
	summary: (s, ctx) => {
		const top = ranked(s, ctx.members)[0];
		return top ? `${s.title} · ${top.m.name} leads with ${top.total}` : `${s.title} · No scores yet`;
	},
	init: (ctx) => {
		const rounds = CHAT.rounds.slice(0, MAX_ROUNDS).map((r, i) => {
			const scores = {};
			for (const name of Object.keys(r)) {
				const m = ctx.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
				const v = r[name];
				if (m && typeof v === "number") scores[m.id] = v;
			}
			return {
				id: `s${i}`,
				name: `Round ${i + 1}`,
				scores
			};
		});
		return {
			title: CHAT.title,
			rounds: rounds.length ? rounds : [{
				id: "s0",
				name: "Round 1",
				scores: {}
			}]
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "set_score") {
			const p = action.points;
			if (typeof action.round !== "string" || typeof p !== "number" || !Number.isInteger(p) || p < 0 || p > MAX_POINTS) return state;
			const r = state.rounds.find((x) => x.id === action.round);
			if (!r || has(r.scores, meta.user) && r.scores[meta.user] === p) return state;
			return {
				...state,
				rounds: state.rounds.map((x) => x.id === r.id ? {
					...x,
					scores: {
						...x.scores,
						[meta.user]: p
					}
				} : x)
			};
		}
		if (action.t === "clear_score") {
			if (typeof action.round !== "string") return state;
			const r = state.rounds.find((x) => x.id === action.round);
			if (!r || !has(r.scores, meta.user)) return state;
			const scores = {};
			for (const k of Object.keys(r.scores)) if (k !== meta.user) scores[k] = r.scores[k] ?? 0;
			return {
				...state,
				rounds: state.rounds.map((x) => x.id === r.id ? {
					...x,
					scores
				} : x)
			};
		}
		if (action.t === "add_round") {
			if (!canAdd(state)) return state;
			const id = `r${meta.seq}`;
			if (state.rounds.some((x) => x.id === id)) return state;
			return {
				...state,
				rounds: [...state.rounds, {
					id,
					name: `Round ${state.rounds.length + 1}`,
					scores: {}
				}]
			};
		}
		return state;
	},
	// Someone left: their scores leave every round.
	onMembers: (state, ctx) => {
		if (state.rounds.every((r) => Object.keys(r.scores).every((k) => inChat(ctx, k)))) return state;
		return {
			...state,
			rounds: state.rounds.map((r) => {
				if (Object.keys(r.scores).every((k) => inChat(ctx, k))) return r;
				const scores = {};
				for (const k of Object.keys(r.scores)) if (inChat(ctx, k)) scores[k] = r.scores[k] ?? 0;
				return {
					...r,
					scores
				};
			})
		};
	},
	invariants: {
		"round ids are unique and there are 1 to 6 rounds": (s) => s.rounds.length >= 1 && s.rounds.length <= MAX_ROUNDS && new Set(s.rounds.map((r) => r.id)).size === s.rounds.length,
		"every score is a whole number from 0 to 999": (s) => s.rounds.every((r) => Object.keys(r.scores).every((k) => Number.isInteger(r.scores[k]) && (r.scores[k] ?? -1) >= 0 && (r.scores[k] ?? 1e3) <= MAX_POINTS)),
		"everyone with a score is in the chat": (s, ctx) => s.rounds.every((r) => Object.keys(r.scores).every((k) => inChat(ctx, k))),
		"each round is named for its position": (s) => s.rounds.every((r, i) => r.name === `Round ${i + 1}`)
	},
	transitions: {
		"set score changes only the actor's own entry in that round": (p, n, a, m) => {
			if (a.t !== "set_score" || p === n) return true;
			const r = n.rounds.find((x) => x.id === a.round);
			return !!r && has(r.scores, m.user) && r.scores[m.user] === a.points && othersSame(p, n, m.user, a.round);
		},
		"a valid score from someone in the chat always lands": (p, n, a, m, ctx) => {
			if (a.t !== "set_score" || !inChat(ctx, m.user)) return true;
			const r = n.rounds.find((x) => x.id === a.round);
			if (!r || !Number.isInteger(a.points) || a.points < 0 || a.points > MAX_POINTS) return true;
			return has(r.scores, m.user) && r.scores[m.user] === a.points;
		},
		"clear score removes only the actor's entry in that round": (p, n, a, m) => {
			if (a.t !== "clear_score" || p === n) return true;
			const before = p.rounds.find((x) => x.id === a.round);
			const after = n.rounds.find((x) => x.id === a.round);
			return !!before && !!after && has(before.scores, m.user) && !has(after.scores, m.user) && othersSame(p, n, m.user, a.round);
		},
		"add round appends one empty round, only when the last has scores": (p, n, a, m, ctx) => {
			if (a.t !== "add_round") return true;
			if (p === n) return !inChat(ctx, m.user) || !canAdd(p) || p.rounds.some((x) => x.id === `r${m.seq}`);
			const last = n.rounds[n.rounds.length - 1];
			return canAdd(p) && n.rounds.length === p.rounds.length + 1 && !!last && last.id === `r${m.seq}` && Object.keys(last.scores).length === 0 && JSON.stringify(n.rounds.slice(0, -1)) === JSON.stringify(p.rounds);
		},
		"no action changes the title or reorders or deletes rounds": (p, n) => p === n || p.title === n.title && p.rounds.length <= n.rounds.length && p.rounds.every((r, i) => n.rounds[i]?.id === r.id),
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		const k = r.next();
		const round = r.pick(s.rounds).id;
		if (k < .1) return { t: "add_round" };
		if (k < .22) return {
			t: "clear_score",
			round
		};
		if (k < .3) return {
			t: "set_score",
			round,
			points: r.pick([
				-1,
				1e3,
				5e3
			])
		};
		return {
			t: "set_score",
			round,
			points: 30 + r.int(70)
		};
	},
	local: {
		open: false,
		round: "",
		draft: ""
	},
	view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
		const list = ranked(state, members);
		const unscored = members.filter((m) => !hasAny(state, m.id));
		const lastId = state.rounds[state.rounds.length - 1]?.id ?? "";
		const rid = state.rounds.some((r) => r.id === local.round) ? local.round : lastId;
		const current = state.rounds.find((r) => r.id === rid);
		const mineNow = current && has(current.scores, me) ? String(current.scores[me]) : "";
		const valid = /^\d{1,3}$/.test(local.draft.trim());
		const save = () => {
			if (!valid) return;
			dispatch({
				t: "set_score",
				round: rid,
				points: Number(local.draft.trim())
			});
			setLocal({
				open: false,
				draft: ""
			});
		};
		const pick = (id) => {
			const r = state.rounds.find((x) => x.id === id);
			setLocal({
				round: id,
				draft: r && has(r.scores, me) ? String(r.scores[me]) : ""
			});
		};
		const n = list.length;
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `${n} ${n === 1 ? "player" : "players"} · ${state.rounds.length} ${state.rounds.length === 1 ? "round" : "rounds"}`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 2
				},
				children: list.map((x, idx) => /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						minHeight: 38,
						padding: "2px 6px",
						borderRadius: theme.radius.button,
						background: x.m.id === me ? theme.color.selected : "transparent"
					},
					children: [
						/* @__PURE__ */ _jsx("span", {
							style: {
								width: 18,
								flexShrink: 0,
								textAlign: "center",
								fontWeight: 600
							},
							children: idx + 1
						}),
						/* @__PURE__ */ _jsx(Avatar, {
							user: x.m,
							size: 24
						}),
						/* @__PURE__ */ _jsx("span", {
							style: {
								flex: 1,
								minWidth: 0,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap"
							},
							children: x.m.name
						}),
						/* @__PURE__ */ _jsx("small", {
							style: {
								flex: "0 1 auto",
								minWidth: 0,
								maxWidth: 90,
								textAlign: "right",
								whiteSpace: "normal",
								overflowWrap: "anywhere"
							},
							children: state.rounds.map((r) => has(r.scores, x.m.id) ? String(r.scores[x.m.id]) : "–").join(" + ")
						}),
						/* @__PURE__ */ _jsx("span", {
							style: {
								flexShrink: 0,
								minWidth: 36,
								textAlign: "right",
								fontWeight: 700,
								color: idx === 0 ? theme.color.link : theme.color.text
							},
							children: x.total
						})
					]
				}, x.m.id))
			}),
			local.open ? /* @__PURE__ */ _jsxs("div", {
				style: {
					marginTop: 8,
					display: "grid",
					gap: 8
				},
				children: [/* @__PURE__ */ _jsxs("div", {
					role: "group",
					"aria-label": "Round",
					style: {
						display: "flex",
						alignItems: "center",
						flexWrap: "wrap",
						gap: 6
					},
					children: [/* @__PURE__ */ _jsx("small", { children: "Round" }), state.rounds.map((r, i) => {
						const on = r.id === rid;
						return /* @__PURE__ */ _jsx("button", {
							type: "button",
							"aria-pressed": on,
							"aria-label": r.name,
							onClick: () => pick(r.id),
							style: {
								width: 44,
								height: 44,
								borderRadius: theme.radius.button,
								fontWeight: 600,
								background: on ? theme.color.selected : theme.color.secondaryButton,
								color: on ? theme.color.link : theme.color.secondaryButtonText
							},
							children: i + 1
						}, r.id);
					})]
				}), /* @__PURE__ */ _jsxs("form", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 6
					},
					onSubmit: (e) => {
						e.preventDefault();
						save();
					},
					children: [
						/* @__PURE__ */ _jsx("input", {
							style: {
								flex: 1,
								minWidth: 0
							},
							value: local.draft,
							maxLength: 3,
							placeholder: "Points",
							"aria-label": "Your points",
							onInput: (e) => setLocal({ draft: e.currentTarget.value })
						}),
						/* @__PURE__ */ _jsx(Button, {
							kind: "primary",
							disabled: !valid,
							onClick: save,
							children: "Save"
						}),
						mineNow !== "" ? /* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							onClick: () => {
								dispatch({
									t: "clear_score",
									round: rid
								});
								setLocal({ draft: "" });
							},
							children: "Clear"
						}) : null,
						/* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							onClick: () => setLocal({ open: false }),
							children: "×"
						})
					]
				})]
			}) : /* @__PURE__ */ _jsxs("div", { children: [unscored.length ? /* @__PURE__ */ _jsx("div", {
				style: { marginTop: 6 },
				children: /* @__PURE__ */ _jsx("small", { children: `No score yet: ${unscored.map((m) => m.name).join(", ")}` })
			}) : null, /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginTop: 8
				},
				children: [/* @__PURE__ */ _jsx(Button, {
					kind: "primary",
					onClick: () => {
						setLocal({
							open: true,
							round: rid,
							draft: mineNow
						});
					},
					children: "Edit mine"
				}), /* @__PURE__ */ _jsx(Button, {
					kind: "deemphasized",
					disabled: !canAdd(state),
					onClick: () => dispatch({ t: "add_round" }),
					children: "Add round"
				})]
			})] })
		] });
	}
});
