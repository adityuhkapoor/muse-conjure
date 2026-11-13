import { defineApp, Button, CardHeader, Facepile } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "@muse/app/jsx-runtime";
const C = {
	title: "Which mountain in January?",
	note: "Stowe is about $40 more a night",
	options: [
		"Killington",
		"Stowe",
		"Sugarbush"
	],
	// Votes so far, by first name, as the chat stated them. Everyone said their vote is locked.
	votes: {
		jess: "Stowe",
		ines: "Stowe",
		jake: "Killington",
		amir: "Sugarbush"
	}
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const voteOf = (s, u) => s.options.find((o) => o.voters.includes(u))?.id ?? null;
const allVoters = (s) => s.options.flatMap((o) => o.voters);
const sameOptions = (p, n) => JSON.stringify(p.options) === JSON.stringify(n.options);
export default defineApp({
	name: "Mountain vote",
	summary: (s) => {
		const max = Math.max(0, ...s.options.map((o) => o.voters.length));
		const lead = s.options.filter((o) => o.voters.length === max);
		if (max === 0) return `${s.title} No votes yet.`;
		if (lead.length > 1) return `${s.title} Tied at ${max} ${max === 1 ? "vote" : "votes"} each. ${s.locked.length} locked.`;
		return `${s.title} ${lead[0].label} leads with ${max}. ${s.locked.length} locked.`;
	},
	init: (ctx) => {
		const options = C.options.map((label, i) => ({
			id: `m${i}`,
			label,
			voters: []
		}));
		const locked = [];
		for (const m of ctx.members) {
			const pick = C.votes[m.name.trim().toLowerCase()];
			const o = options.find((x) => x.label === pick);
			if (o) {
				o.voters.push(m.id);
				locked.push(m.id);
			}
		}
		return {
			title: C.title,
			note: C.note,
			options,
			locked
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "vote") {
			if (typeof action.option !== "string") return state;
			const target = state.options.find((o) => o.id === action.option);
			if (!target || state.locked.includes(meta.user) || target.voters.includes(meta.user)) return state;
			return {
				...state,
				options: state.options.map((o) => o.id === target.id ? {
					...o,
					voters: [...o.voters, meta.user]
				} : {
					...o,
					voters: o.voters.filter((v) => v !== meta.user)
				})
			};
		}
		if (action.t === "lock") {
			if (voteOf(state, meta.user) === null || state.locked.includes(meta.user)) return state;
			return {
				...state,
				locked: [...state.locked, meta.user]
			};
		}
		return state;
	},
	onMembers: (state, ctx) => {
		const ok = (v) => inChat(ctx, v);
		if (state.locked.every(ok) && state.options.every((o) => o.voters.every(ok))) return state;
		return {
			...state,
			options: state.options.map((o) => ({
				...o,
				voters: o.voters.filter(ok)
			})),
			locked: state.locked.filter(ok)
		};
	},
	invariants: {
		"no one votes for more than one option or twice": (s) => {
			const all = allVoters(s);
			return new Set(all).size === all.length;
		},
		"voters and locked people are in the chat": (s, ctx) => allVoters(s).every((v) => inChat(ctx, v)) && s.locked.every((v) => inChat(ctx, v)),
		"everyone locked has a vote": (s) => s.locked.every((u) => voteOf(s, u) !== null),
		"no one is locked twice": (s) => new Set(s.locked).size === s.locked.length,
		"there are three options with unique ids and labels": (s) => s.options.length === 3 && new Set(s.options.map((o) => o.id)).size === 3 && s.options.every((o) => o.label.length > 0)
	},
	transitions: {
		"a vote puts the actor on that option and moves no one else": (p, n, a, m) => a.t !== "vote" || p === n || voteOf(n, m.user) === a.option && n.locked.join() === p.locked.join() && [...allVoters(p), ...allVoters(n)].every((u) => u === m.user || voteOf(p, u) === voteOf(n, u)),
		"a locked person's vote never changes": (p, n, a, m) => a.t !== "vote" || p === n || !p.locked.includes(m.user),
		"a lock adds only the actor, who has a vote, and leaves votes as they were": (p, n, a, m) => a.t !== "lock" || p === n || voteOf(p, m.user) !== null && !p.locked.includes(m.user) && n.locked.length === p.locked.length + 1 && n.locked.includes(m.user) && sameOptions(p, n),
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
		"the title, note and mountains never change": (p, n) => p.title === n.title && p.note === n.note && p.options.every((o, i) => n.options[i]?.id === o.id && n.options[i]?.label === o.label)
	},
	arbitrary: (s, user, r) => {
		const x = r.next();
		if (x < .1) return {
			t: "vote",
			option: "zz"
		};
		if (x < .35 && voteOf(s, user) !== null) return { t: "lock" };
		return {
			t: "vote",
			option: r.pick(s.options).id
		};
	},
	local: {},
	view: ({ state, me, members, dispatch, theme }) => {
		const voted = new Set(allVoters(state)).size;
		const max = Math.max(0, ...state.options.map((o) => o.voters.length));
		const leaders = state.options.filter((o) => max > 0 && o.voters.length === max);
		const mine = voteOf(state, me);
		const iLocked = state.locked.includes(me);
		const status = max === 0 ? "No votes yet" : leaders.length > 1 ? `Tied · ${leaders.map((o) => o.label).join(", ")} · ${max} ${max === 1 ? "vote" : "votes"} each` : `${leaders[0].label} leads · ${max} ${max === 1 ? "vote" : "votes"}`;
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `${voted} of ${members.length} voted · ${state.locked.length} locked`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "flex",
					gap: 8,
					height: 176,
					alignItems: "flex-end"
				},
				children: state.options.map((o) => {
					const n = o.voters.length;
					const isMine = mine === o.id;
					const lead = leaders.some((l) => l.id === o.id);
					const h = n === 0 ? 24 : 16 + Math.round(n / Math.max(1, max) * 70);
					return /* @__PURE__ */ _jsxs("div", {
						role: "button",
						tabIndex: 0,
						"aria-label": `${o.label}, ${n} ${n === 1 ? "vote" : "votes"}`,
						onClick: () => {
							if (!iLocked) dispatch({
								t: "vote",
								option: o.id
							});
						},
						style: {
							flex: 1,
							minWidth: 0,
							height: "100%",
							display: "flex",
							flexDirection: "column",
							justifyContent: "flex-end",
							alignItems: "center",
							gap: 4,
							padding: 4,
							borderRadius: theme.radius.button,
							boxShadow: isMine ? `inset 0 0 0 2px ${theme.color.primary}` : "none"
						},
						children: [
							/* @__PURE__ */ _jsx("span", {
								style: {
									fontWeight: 600,
									color: theme.color.text
								},
								children: n
							}),
							/* @__PURE__ */ _jsx("div", {
								style: {
									minHeight: 20,
									display: "flex",
									justifyContent: "center"
								},
								children: n > 0 ? /* @__PURE__ */ _jsx(Facepile, {
									users: o.voters,
									max: 3,
									size: 20
								}) : null
							}),
							/* @__PURE__ */ _jsx("div", { style: {
								width: "100%",
								height: h,
								borderRadius: 6,
								background: n === 0 ? "transparent" : lead ? theme.color.primary : theme.color.track,
								border: n === 0 ? `1px dashed ${theme.color.divider}` : "none",
								boxSizing: "border-box"
							} }),
							/* @__PURE__ */ _jsx("div", {
								style: {
									width: "100%",
									textAlign: "center",
									fontWeight: isMine ? 600 : 400,
									color: theme.color.text,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap"
								},
								children: o.label
							})
						]
					}, o.id);
				})
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					marginTop: 8,
					color: theme.color.text,
					fontWeight: 600
				},
				children: status
			}),
			/* @__PURE__ */ _jsx("small", { children: state.note }),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginTop: 8,
					minHeight: 44
				},
				children: iLocked ? /* @__PURE__ */ _jsx("small", { children: "Locked · your vote is final" }) : mine ? /* @__PURE__ */ _jsxs(_Fragment, { children: [/* @__PURE__ */ _jsx("small", {
					style: {
						flex: 1,
						minWidth: 0
					},
					children: "Tap another mountain to switch"
				}), /* @__PURE__ */ _jsx(Button, {
					kind: "primary",
					onClick: () => dispatch({ t: "lock" }),
					children: "Lock vote"
				})] }) : /* @__PURE__ */ _jsx("small", { children: "Tap a mountain to vote" })
			})
		] });
	}
});
