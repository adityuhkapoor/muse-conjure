import { defineApp, Button, CardHeader, Facepile } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Score sheet and vote for the 3 sublets. Each person scores every sublet 1 to 5 on four
// criteria (only their own scores), then votes for one. Totals and votes show the leader.
const CONTENT = {
	title: "Which sublet should we pick?",
	sublets: [
		{
			id: "s0",
			name: "Astoria",
			facts: "$1,900/mo · balcony · AC · 25 min"
		},
		{
			id: "s1",
			name: "Bushwick",
			facts: "$1,650/mo · no outdoor · 50 min"
		},
		{
			id: "s2",
			name: "Jersey City",
			facts: "$1,500/mo · roof · 35 min"
		}
	],
	criteria: [
		{
			id: "c0",
			label: "Price"
		},
		{
			id: "c1",
			label: "Commute"
		},
		{
			id: "c2",
			label: "Outdoor space"
		},
		{
			id: "c3",
			label: "AC"
		}
	]
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const keyOf = (sublet, criterion) => `${sublet}:${criterion}`;
/** Entries of a map except one user's, as text, so two states can be compared. */
const others = (o, u) => JSON.stringify(Object.entries(o).filter(([k]) => k !== u).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
const ownExcept = (s, u, key) => JSON.stringify(Object.entries(s.scores[u] ?? {}).filter(([k]) => k !== key).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
const votesText = (s) => JSON.stringify(Object.entries(s.votes).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
const scoresText = (s) => JSON.stringify(Object.entries(s.scores).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
const voteCount = (s, id) => Object.values(s.votes).filter((v) => v === id).length;
const points = (s, id) => Object.values(s.scores).reduce((n, m) => n + Object.entries(m).reduce((k, [key, v]) => key.startsWith(id + ":") ? k + v : k, 0), 0);
const leaderOf = (s) => {
	const counts = s.sublets.map((x) => ({
		x,
		n: voteCount(s, x.id)
	}));
	const top = Math.max(0, ...counts.map((c) => c.n));
	const best = counts.filter((c) => c.n === top);
	return top > 0 && best.length === 1 ? best[0].x : null;
};
export default defineApp({
	name: "Sublet score sheet",
	summary: (s) => {
		const n = Object.keys(s.votes).length;
		const lead = leaderOf(s);
		if (!lead) return `${s.title} ${n} voted.`;
		const c = voteCount(s, lead.id);
		return `${s.title} ${lead.name} leads with ${c} ${c === 1 ? "vote" : "votes"}. ${n} voted.`;
	},
	init: () => ({
		title: CONTENT.title,
		sublets: CONTENT.sublets.map((x) => ({ ...x })),
		criteria: CONTENT.criteria.map((x) => ({ ...x })),
		scores: {},
		votes: {}
	}),
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "score") {
			if (typeof action.sublet !== "string" || typeof action.criterion !== "string" || typeof action.value !== "number") return state;
			const v = action.value;
			if (!Number.isInteger(v) || v < 1 || v > 5) return state;
			if (!state.sublets.some((x) => x.id === action.sublet) || !state.criteria.some((c) => c.id === action.criterion)) return state;
			const key = keyOf(action.sublet, action.criterion);
			const mine = state.scores[meta.user] ?? {};
			if (mine[key] === v) return state;
			return {
				...state,
				scores: {
					...state.scores,
					[meta.user]: {
						...mine,
						[key]: v
					}
				}
			};
		}
		if (action.t === "vote") {
			if (typeof action.sublet !== "string" || !state.sublets.some((x) => x.id === action.sublet)) return state;
			if (state.votes[meta.user] === action.sublet) {
				return {
					...state,
					votes: Object.fromEntries(Object.entries(state.votes).filter(([u]) => u !== meta.user))
				};
			}
			return {
				...state,
				votes: {
					...state.votes,
					[meta.user]: action.sublet
				}
			};
		}
		if (action.t === "clear") {
			if (!state.scores[meta.user]) return state;
			return {
				...state,
				scores: Object.fromEntries(Object.entries(state.scores).filter(([u]) => u !== meta.user))
			};
		}
		return state;
	},
	// Someone left: their scores and vote go with them. Someone joined: they can score and vote at once.
	onMembers: (state, ctx) => {
		const scoresOk = Object.keys(state.scores).every((u) => inChat(ctx, u));
		const votesOk = Object.keys(state.votes).every((u) => inChat(ctx, u));
		if (scoresOk && votesOk) return state;
		return {
			...state,
			scores: scoresOk ? state.scores : Object.fromEntries(Object.entries(state.scores).filter(([u]) => inChat(ctx, u))),
			votes: votesOk ? state.votes : Object.fromEntries(Object.entries(state.votes).filter(([u]) => inChat(ctx, u)))
		};
	},
	invariants: {
		"every score is a whole number from 1 to 5 on a real sublet and criterion": (s) => {
			const valid = new Set(s.sublets.flatMap((x) => s.criteria.map((c) => keyOf(x.id, c.id))));
			return Object.values(s.scores).every((m) => Object.entries(m).every(([k, v]) => valid.has(k) && Number.isInteger(v) && v >= 1 && v <= 5));
		},
		"no one keeps an empty score entry": (s) => Object.values(s.scores).every((m) => Object.keys(m).length > 0),
		"everyone with scores or a vote is in the chat": (s, ctx) => Object.keys(s.scores).every((u) => inChat(ctx, u)) && Object.keys(s.votes).every((u) => inChat(ctx, u)),
		"every vote names a real sublet": (s) => Object.values(s.votes).every((v) => s.sublets.some((x) => x.id === v)),
		"vote counts add up to the number of voters": (s) => s.sublets.reduce((n, x) => n + voteCount(s, x.id), 0) === Object.keys(s.votes).length,
		"there are always 3 sublets and 4 criteria with unique ids": (s) => s.sublets.length === CONTENT.sublets.length && s.criteria.length === CONTENT.criteria.length && new Set(s.sublets.map((x) => x.id)).size === s.sublets.length && new Set(s.criteria.map((c) => c.id)).size === s.criteria.length
	},
	transitions: {
		"a score sets the actor's own entry and changes no one else's score or any vote": (p, n, a, m) => a.t !== "score" || p === n || n.scores[m.user]?.[keyOf(String(a.sublet), String(a.criterion))] === a.value && others(p.scores, m.user) === others(n.scores, m.user) && ownExcept(p, m.user, keyOf(String(a.sublet), String(a.criterion))) === ownExcept(n, m.user, keyOf(String(a.sublet), String(a.criterion))) && votesText(p) === votesText(n),
		"a vote sets or removes only the actor's own vote and changes no score": (p, n, a, m) => a.t !== "vote" || p === n || (p.votes[m.user] === a.sublet ? n.votes[m.user] === undefined : n.votes[m.user] === a.sublet) && others(p.votes, m.user) === others(n.votes, m.user) && scoresText(p) === scoresText(n),
		"a clear removes only the actor's scores and leaves votes alone": (p, n, a, m) => a.t !== "clear" || p === n || p.scores[m.user] !== undefined && n.scores[m.user] === undefined && others(p.scores, m.user) === others(n.scores, m.user) && votesText(p) === votesText(n),
		"only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
		"the sublets and criteria never change": (p, n) => JSON.stringify([
			p.title,
			p.sublets,
			p.criteria
		]) === JSON.stringify([
			n.title,
			n.sublets,
			n.criteria
		])
	},
	arbitrary: (s, _user, r) => {
		const k = r.next();
		if (k < .55) {
			return {
				t: "score",
				sublet: r.next() < .05 ? "zz" : r.pick(s.sublets).id,
				criterion: r.pick(s.criteria).id,
				value: r.next() < .1 ? 7 : 1 + r.int(5)
			};
		}
		if (k < .88) return {
			t: "vote",
			sublet: r.next() < .05 ? "zz" : r.pick(s.sublets).id
		};
		return { t: "clear" };
	},
	local: { sub: "" },
	view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
		const viewing = state.sublets.some((x) => x.id === local.sub) ? local.sub : state.sublets[0]?.id ?? "";
		const mine = state.scores[me] ?? {};
		const myVote = state.votes[me];
		const voted = members.filter((m) => state.votes[m.id] !== undefined).length;
		const scored = members.filter((m) => state.scores[m.id] !== undefined).length;
		const lead = leaderOf(state);
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `${voted} of ${members.length} voted · ${scored} scored`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 0
				},
				children: state.sublets.map((x) => {
					const on = x.id === viewing;
					const voters = Object.entries(state.votes).filter(([, v]) => v === x.id).map(([u]) => u);
					return /* @__PURE__ */ _jsxs("button", {
						type: "button",
						"aria-pressed": on,
						onClick: () => setLocal({ sub: x.id }),
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							width: "100%",
							minHeight: 44,
							padding: "0 8px",
							textAlign: "left",
							borderRadius: theme.radius.button,
							background: on ? theme.color.selected : theme.color.card,
							color: theme.color.text
						},
						children: [/* @__PURE__ */ _jsxs("div", {
							style: {
								flex: 1,
								minWidth: 0
							},
							children: [/* @__PURE__ */ _jsxs("div", {
								style: {
									fontWeight: 600,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap"
								},
								children: [x.name, lead && lead.id === x.id ? /* @__PURE__ */ _jsx("small", { children: " · Leading" }) : null]
							}), /* @__PURE__ */ _jsx("div", {
								style: {
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap"
								},
								children: /* @__PURE__ */ _jsx("small", { children: x.facts })
							})]
						}), /* @__PURE__ */ _jsxs("div", {
							style: {
								flex: "none",
								display: "flex",
								flexDirection: "column",
								alignItems: "flex-end"
							},
							children: [voters.length ? /* @__PURE__ */ _jsx(Facepile, {
								users: voters,
								max: 3,
								size: 20
							}) : null, /* @__PURE__ */ _jsx("small", {
								style: { whiteSpace: "nowrap" },
								children: `${points(state, x.id)} pts · ${voters.length} ${voters.length === 1 ? "vote" : "votes"}`
							})]
						})]
					}, x.id);
				})
			}),
			/* @__PURE__ */ _jsx("div", { children: state.criteria.map((c) => {
				const mineHere = mine[keyOf(viewing, c.id)];
				return /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: 4,
						minHeight: 44
					},
					children: [/* @__PURE__ */ _jsx("small", {
						style: {
							flex: 1,
							minWidth: 0
						},
						children: c.label
					}), /* @__PURE__ */ _jsx("div", {
						role: "group",
						"aria-label": c.label,
						style: {
							display: "flex",
							gap: 2,
							flex: "none"
						},
						children: [
							1,
							2,
							3,
							4,
							5
						].map((v) => {
							const on = mineHere === v;
							return /* @__PURE__ */ _jsx("button", {
								type: "button",
								"aria-pressed": on,
								onClick: () => dispatch({
									t: "score",
									sublet: viewing,
									criterion: c.id,
									value: v
								}),
								style: {
									width: 44,
									height: 44,
									borderRadius: theme.radius.button,
									fontWeight: 600,
									background: on ? theme.color.primary : theme.color.secondaryButton,
									color: on ? theme.color.onPrimary : theme.color.secondaryButtonText
								},
								children: v
							}, v);
						})
					})]
				}, c.id);
			}) }),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					gap: 8
				},
				children: [/* @__PURE__ */ _jsx(Button, {
					kind: myVote === viewing ? "deemphasized" : "primary",
					wide: true,
					onClick: () => dispatch({
						t: "vote",
						sublet: viewing
					}),
					children: myVote === viewing ? "Voted" : "Vote"
				}), /* @__PURE__ */ _jsx(Button, {
					kind: "secondary",
					disabled: Object.keys(mine).length === 0,
					onClick: () => dispatch({ t: "clear" }),
					children: "Clear"
				})]
			})
		] });
	}
});
