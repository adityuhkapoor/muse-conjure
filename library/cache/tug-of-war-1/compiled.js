import { defineApp, Button, CardHeader, Facepile, clock } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
const CONTENT = {
	title: "Lounge tug of war",
	teamA: [
		"Tess",
		"Wren",
		"Ines",
		"Omar"
	],
	teamB: [
		"Cam",
		"Theo",
		"Sam"
	],
	duration: 2e4,
	prize: "Winner picks the next show"
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const onTeam = (s, id) => s.teams.a.includes(id) || s.teams.b.includes(id);
const total = (s, ids) => ids.reduce((n, id) => n + (s.taps[id] ?? 0), 0);
const winnerOf = (s) => {
	const a = total(s, s.teams.a);
	const b = total(s, s.teams.b);
	return a > b ? "a" : b > a ? "b" : "tie";
};
const lower = (x) => x.trim().toLowerCase();
function place(t, m) {
	const n = lower(m.name);
	if (CONTENT.teamA.some((x) => lower(x) === n)) return {
		...t,
		a: [...t.a, m.id]
	};
	if (CONTENT.teamB.some((x) => lower(x) === n)) return {
		...t,
		b: [...t.b, m.id]
	};
	return t.a.length <= t.b.length ? {
		...t,
		a: [...t.a, m.id]
	} : {
		...t,
		b: [...t.b, m.id]
	};
}
function build(members) {
	// Named people first so unmatched members balance the teams afterwards.
	const named = members.filter((m) => [...CONTENT.teamA, ...CONTENT.teamB].some((x) => lower(x) === lower(m.name)));
	const rest = members.filter((m) => !named.includes(m));
	let teams = {
		a: [],
		b: []
	};
	for (const m of [...named, ...rest]) teams = place(teams, m);
	const taps = {};
	for (const id of [...teams.a, ...teams.b]) taps[id] = 0;
	return {
		teams,
		taps
	};
}
const sameTaps = (p, n) => JSON.stringify(p.taps) === JSON.stringify(n.taps);
const allZero = (s) => Object.values(s.taps).every((v) => v === 0);
const endAt = (s) => (s.startedAt ?? 0) + s.duration;
export default defineApp({
	name: "Tug of war",
	summary: (s) => {
		const a = total(s, s.teams.a);
		const b = total(s, s.teams.b);
		if (s.phase === "ready") return `${s.title} · ${s.teams.a.length} v ${s.teams.b.length} · ready`;
		if (s.phase === "running") return `${s.title} · Team A ${a} · Team B ${b}`;
		return s.winner === "tie" ? `${s.title} · tie at ${a}` : `${s.title} · Team ${s.winner === "a" ? "A" : "B"} won, ${a} to ${b}`;
	},
	init: (ctx) => {
		const { teams, taps } = build(ctx.members);
		return {
			title: CONTENT.title,
			duration: CONTENT.duration,
			teams,
			taps,
			phase: "ready",
			startedAt: null,
			winner: null
		};
	},
	reduce: (s, a, m, ctx) => {
		if (!inChat(ctx, m.user) || !onTeam(s, m.user)) return s;
		if (a.t === "start") {
			if (s.phase !== "ready") return s;
			const taps = {};
			for (const id of [...s.teams.a, ...s.teams.b]) taps[id] = 0;
			return {
				...s,
				phase: "running",
				startedAt: m.time,
				taps,
				winner: null
			};
		}
		if (a.t === "tap") {
			if (s.phase !== "running" || s.startedAt === null || m.time >= s.startedAt + s.duration) return s;
			return {
				...s,
				taps: {
					...s.taps,
					[m.user]: (s.taps[m.user] ?? 0) + 1
				}
			};
		}
		if (a.t === "finish") {
			if (s.phase !== "running" || s.startedAt === null || m.time < s.startedAt + s.duration) return s;
			return {
				...s,
				phase: "done",
				winner: winnerOf(s)
			};
		}
		if (a.t === "reset") {
			if (s.phase !== "done") return s;
			const taps = {};
			for (const id of [...s.teams.a, ...s.teams.b]) taps[id] = 0;
			return {
				...s,
				phase: "ready",
				startedAt: null,
				winner: null,
				taps
			};
		}
		return s;
	},
	// Someone left: off the team, tap count gone. Someone joined: placed on a team at once.
	onMembers: (s, ctx) => {
		let teams = {
			a: s.teams.a.filter((id) => inChat(ctx, id)),
			b: s.teams.b.filter((id) => inChat(ctx, id))
		};
		for (const m of ctx.members) if (!teams.a.includes(m.id) && !teams.b.includes(m.id)) teams = place(teams, m);
		const taps = {};
		for (const id of [...teams.a, ...teams.b]) taps[id] = s.taps[id] ?? 0;
		const next = {
			...s,
			teams,
			taps
		};
		const out = next.phase === "done" ? {
			...next,
			winner: winnerOf(next)
		} : next;
		return JSON.stringify(out) === JSON.stringify(s) ? s : out;
	},
	invariants: {
		"nobody is on both teams or twice": (s) => new Set([...s.teams.a, ...s.teams.b]).size === s.teams.a.length + s.teams.b.length,
		"the two teams are exactly the people in the chat": (s, ctx) => [...s.teams.a, ...s.teams.b].sort().join() === ctx.members.map((m) => m.id).sort().join(),
		"taps are kept for team members only, as whole numbers from 0": (s) => Object.keys(s.taps).sort().join() === [...s.teams.a, ...s.teams.b].sort().join() && Object.values(s.taps).every((v) => Number.isInteger(v) && v >= 0),
		"the winner is set only when done and matches the totals": (s) => s.phase === "done" ? s.winner === winnerOf(s) : s.winner === null,
		"a start time is set exactly when the round has begun": (s) => s.phase === "ready" === (s.startedAt === null)
	},
	transitions: {
		"a tap adds one to the actor's own count, while running and before time is up": (p, n, a, m) => a.t !== "tap" || p === n || p.phase === "running" && m.time < endAt(p) && n.phase === "running" && n.taps[m.user] === (p.taps[m.user] ?? 0) + 1 && Object.keys(p.taps).every((id) => id === m.user || p.taps[id] === n.taps[id]),
		"a start needs a ready card, stamps the time and begins at zero": (p, n, a, m) => a.t !== "start" || p === n || p.phase === "ready" && n.phase === "running" && n.startedAt === m.time && allZero(n) && n.winner === null,
		"a finish happens only after time is up and keeps every tap": (p, n, a, m) => a.t !== "finish" || p === n || p.phase === "running" && m.time >= endAt(p) && n.phase === "done" && sameTaps(p, n) && n.startedAt === p.startedAt,
		"a reset happens only from done and zeroes the taps": (p, n, a) => a.t !== "reset" || p === n || p.phase === "done" && n.phase === "ready" && allZero(n) && n.startedAt === null && n.winner === null,
		"actions never change the teams or the length of the round": (p, n) => p.duration === n.duration && JSON.stringify(p.teams) === JSON.stringify(n.teams),
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, _user, r) => {
		if (s.phase === "ready") return r.next() < .8 ? { t: "start" } : { t: "tap" };
		if (s.phase === "running") {
			const x = r.next();
			return x < .75 ? { t: "tap" } : x < .9 ? { t: "finish" } : { t: "start" };
		}
		return r.next() < .6 ? { t: "reset" } : { t: "finish" };
	},
	local: {},
	view: ({ state, confirmed, me, members, dispatch, theme }) => {
		const nameOf = (id) => members.find((m) => m.id === id)?.name ?? "Someone";
		const a = total(state, state.teams.a);
		const b = total(state, state.teams.b);
		const label = (side) => side === "a" ? "Team A" : "Team B";
		const teamRow = (side) => {
			const ids = state.teams[side];
			return /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					padding: "6px 0"
				},
				children: [/* @__PURE__ */ _jsx(Facepile, {
					users: ids,
					max: 4,
					size: 24
				}), /* @__PURE__ */ _jsxs("div", {
					style: {
						minWidth: 0,
						flex: 1
					},
					children: [/* @__PURE__ */ _jsxs("div", {
						style: { fontWeight: 600 },
						children: [
							label(side),
							" ",
							/* @__PURE__ */ _jsxs("small", { children: ["· ", ids.length] })
						]
					}), /* @__PURE__ */ _jsx("small", { children: ids.map((id) => id === me ? "You" : nameOf(id)).join(", ") })]
				})]
			});
		};
		if (state.phase === "ready") {
			return /* @__PURE__ */ _jsxs("div", { children: [
				/* @__PURE__ */ _jsx(CardHeader, {
					title: state.title,
					subtitle: `${state.teams.a.length} v ${state.teams.b.length} · ${Math.floor(state.duration / 1e3)} seconds`
				}),
				teamRow("a"),
				teamRow("b"),
				/* @__PURE__ */ _jsx("div", {
					style: { marginTop: 8 },
					children: /* @__PURE__ */ _jsx(Button, {
						kind: "primary",
						wide: true,
						onClick: () => dispatch({ t: "start" }),
						children: "Start"
					})
				})
			] });
		}
		if (state.phase === "running") {
			const live = confirmed.phase === "running" && confirmed.startedAt !== null;
			const left = live ? Math.max(0, endAt(confirmed) - clock.value) : state.duration;
			const secs = Math.ceil(left / 1e3);
			const over = live && left === 0;
			const mine = state.taps[me] ?? 0;
			return /* @__PURE__ */ _jsxs("div", { children: [
				/* @__PURE__ */ _jsx(CardHeader, {
					title: state.title,
					subtitle: !live ? "Starting" : over ? "Time is up" : `${secs} seconds left`
				}),
				/* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						height: 16,
						borderRadius: theme.radius.pill,
						overflow: "hidden",
						background: theme.color.track,
						margin: "12px 0 8px"
					},
					children: [/* @__PURE__ */ _jsx("div", { style: {
						flexGrow: a + 1,
						flexBasis: 0,
						background: theme.color.series1,
						transition: "flex-grow 200ms"
					} }), /* @__PURE__ */ _jsx("div", { style: {
						flexGrow: b + 1,
						flexBasis: 0,
						background: theme.color.series2,
						transition: "flex-grow 200ms"
					} })]
				}),
				/* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						justifyContent: "space-between",
						alignItems: "baseline",
						marginBottom: 12
					},
					children: [/* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx("small", { children: "Team A" }), /* @__PURE__ */ _jsx("h2", { children: a })] }), /* @__PURE__ */ _jsxs("div", {
						style: { textAlign: "right" },
						children: [/* @__PURE__ */ _jsx("small", { children: "Team B" }), /* @__PURE__ */ _jsx("h2", { children: b })]
					})]
				}),
				over ? /* @__PURE__ */ _jsx(Button, {
					kind: "primary",
					wide: true,
					onClick: () => dispatch({ t: "finish" }),
					children: "Finish"
				}) : /* @__PURE__ */ _jsx(Button, {
					kind: "primary",
					wide: true,
					disabled: !live,
					onClick: () => dispatch({ t: "tap" }),
					children: "Tap"
				}),
				/* @__PURE__ */ _jsx("div", {
					style: { marginTop: 8 },
					children: /* @__PURE__ */ _jsx("small", { children: mine === 1 ? "You tapped 1 time" : `You tapped ${mine} times` })
				})
			] });
		}
		const w = state.winner;
		const mine = state.taps[me] ?? 0;
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: "Round over"
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					padding: "12px 0",
					textAlign: "center"
				},
				children: [
					/* @__PURE__ */ _jsx("h2", { children: w === "a" ? "Team A wins" : w === "b" ? "Team B wins" : "Tie" }),
					/* @__PURE__ */ _jsx("div", { children: `Team A ${a} · Team B ${b}` }),
					w === "a" || w === "b" ? /* @__PURE__ */ _jsx("small", { children: CONTENT.prize }) : null
				]
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8
				},
				children: [/* @__PURE__ */ _jsx("small", {
					style: { flex: 1 },
					children: mine === 1 ? "You tapped 1 time" : `You tapped ${mine} times`
				}), /* @__PURE__ */ _jsx(Button, {
					kind: "secondary",
					onClick: () => dispatch({ t: "reset" }),
					children: "Again"
				})]
			})
		] });
	}
});
