import { defineApp, Avatar, Button, CardHeader, rng, running } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
const C = {
	title: "Repeat the pattern",
	first: "Abby",
	shapeMs: 700,
	litMs: 500,
	maxRows: 8
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const unique = (xs) => xs.filter((x, i) => xs.indexOf(x) === i);
const nextUp = (s) => s.order.find((id) => !s.done.includes(id)) ?? null;
const showMs = (len) => len * C.shapeMs;
const sameScores = (p, n) => Object.keys(p.scores).length === Object.keys(n.scores).length && Object.keys(p.scores).every((k) => n.scores[k] === p.scores[k]);
const sameDone = (p, n) => p.done.join() === n.done.join();
const nameIn = (members, id) => members.find((m) => m.id === id)?.name ?? "Someone";
const idle = (s) => ({
	...s,
	current: null,
	pattern: [],
	phase: "idle",
	progress: 0
});
function finish(s, user, score) {
	return {
		...idle(s),
		scores: {
			...s.scores,
			[user]: score
		},
		done: [...s.done, user]
	};
}
function winners(s) {
	const best = s.done.reduce((m, id) => Math.max(m, s.scores[id] ?? 0), 0);
	return {
		ids: s.done.filter((id) => (s.scores[id] ?? 0) === best),
		best
	};
}
function winnerText(s, members) {
	const w = winners(s);
	if (w.best === 0) return "No one repeated a round";
	const names = w.ids.map((id) => nameIn(members, id));
	return w.ids.length === 1 ? `${names[0]} wins · best streak ${w.best}` : `Tie · ${names.join(", ")} · best streak ${w.best}`;
}
const isFinished = (s) => s.order.length > 0 && nextUp(s) === null;
export default defineApp({
	name: "Pattern memory",
	summary: (s, ctx) => {
		if (s.current) return `${nameIn(ctx.members, s.current)}'s turn · round ${s.pattern.length}`;
		if (isFinished(s)) return winnerText(s, ctx.members);
		const next = nextUp(s);
		return next ? `${C.title} · next up ${nameIn(ctx.members, next)}` : C.title;
	},
	init: (ctx) => {
		const ids = unique(ctx.members.map((m) => m.id));
		const lead = ctx.members.find((m) => m.name.toLowerCase() === C.first.toLowerCase())?.id ?? ids[0];
		const order = lead === undefined ? [] : [lead, ...ids.filter((i) => i !== lead)];
		return {
			order,
			scores: {},
			current: null,
			pattern: [],
			phase: "idle",
			progress: 0,
			shownAt: 0,
			done: []
		};
	},
	reduce: (s, a, m, ctx) => {
		if (!inChat(ctx, m.user)) return s;
		if (a.t === "start") {
			if (s.phase !== "idle" || s.current !== null || nextUp(s) !== m.user) return s;
			return {
				...s,
				current: m.user,
				pattern: [rng(m.seed).int(4)],
				phase: "show",
				shownAt: m.time,
				progress: 0
			};
		}
		if (a.t === "tap") {
			if (s.current !== m.user || s.phase === "idle") return s;
			const shape = a.shape;
			if (typeof shape !== "number" || !Number.isInteger(shape) || shape < 0 || shape > 3) return s;
			let cur = s;
			if (s.phase === "show") {
				if (m.time < s.shownAt + showMs(s.pattern.length)) return s;
				cur = {
					...s,
					phase: "input"
				};
			}
			if (shape !== cur.pattern[cur.progress]) return finish(cur, m.user, cur.pattern.length - 1);
			const progress = cur.progress + 1;
			if (progress < cur.pattern.length) return {
				...cur,
				progress
			};
			return {
				...cur,
				pattern: [...cur.pattern, rng(m.seed).int(4)],
				phase: "show",
				shownAt: m.time,
				progress: 0
			};
		}
		if (a.t === "skip") {
			const target = s.current ?? nextUp(s);
			if (target === null) return s;
			return finish(s, target, s.current !== null ? s.pattern.length - 1 : 0);
		}
		if (a.t === "reset") {
			if (s.done.length === 0 && s.current === null) return s;
			return {
				...idle(s),
				scores: {},
				done: [],
				shownAt: 0
			};
		}
		return s;
	},
	onMembers: (s, ctx) => {
		const ids = unique(ctx.members.map((x) => x.id));
		const order = [...s.order.filter((id) => ids.includes(id)), ...ids.filter((id) => !s.order.includes(id))];
		if (order.join() === s.order.join()) return s;
		const done = s.done.filter((id) => ids.includes(id));
		const scores = {};
		for (const id of done) scores[id] = s.scores[id] ?? 0;
		const gone = s.current !== null && !ids.includes(s.current);
		const next = {
			...s,
			order,
			done,
			scores
		};
		return gone ? idle(next) : next;
	},
	invariants: {
		"everyone in the game is in the chat": (s, ctx) => s.order.every((id) => inChat(ctx, id)) && s.done.every((id) => inChat(ctx, id)) && Object.keys(s.scores).every((id) => inChat(ctx, id)) && (s.current === null || inChat(ctx, s.current)),
		"the order and the played list have no repeats, played is in the order, and everyone in the chat has a place": (s, ctx) => new Set(s.order).size === s.order.length && new Set(s.done).size === s.done.length && s.done.every((id) => s.order.includes(id)) && ctx.members.every((m) => s.order.includes(m.id)),
		"scores are whole numbers and exist exactly for people who played": (s) => Object.keys(s.scores).length === s.done.length && s.done.every((id) => Number.isInteger(s.scores[id]) && s.scores[id] >= 0),
		"with no turn running there is no player, pattern or progress": (s) => s.phase !== "idle" || s.current === null && s.pattern.length === 0 && s.progress === 0,
		"a running turn belongs to the next unplayed person and has a valid pattern": (s) => s.phase === "idle" || s.current !== null && s.current === nextUp(s) && s.pattern.length > 0 && s.pattern.every((x) => Number.isInteger(x) && x >= 0 && x <= 3) && s.progress >= 0 && s.progress < s.pattern.length && (s.phase === "show" ? s.progress === 0 : s.progress >= 1)
	},
	transitions: {
		"a start puts the next person on a one-shape pattern": (p, n, a, m) => a.t !== "start" || p === n || p.phase === "idle" && nextUp(p) === m.user && n.current === m.user && n.phase === "show" && n.pattern.length === 1 && n.progress === 0 && n.shownAt === m.time && sameDone(p, n) && sameScores(p, n),
		"the next person in the chat can always start when no turn is running": (p, n, a, m, ctx) => a.t !== "start" || !inChat(ctx, m.user) || p.phase !== "idle" || p.current !== null || nextUp(p) !== m.user || p !== n,
		"a tap is the current player's: a hit moves on or grows the pattern by one, a miss ends the turn": (p, n, a, m) => {
			if (a.t !== "tap" || p === n) return true;
			if (m.user !== p.current || typeof a.shape !== "number") return false;
			if (!Number.isInteger(a.shape) || a.shape < 0 || a.shape > 3) return false;
			const want = p.pattern[p.progress];
			if (n.current === null) {
				return a.shape !== want && n.scores[m.user] === p.pattern.length - 1 && n.done.join() === [...p.done, m.user].join() && n.pattern.length === 0 && n.phase === "idle";
			}
			if (n.current !== p.current || a.shape !== want || !sameDone(p, n) || !sameScores(p, n)) return false;
			if (n.pattern.length === p.pattern.length + 1) {
				return p.pattern.every((x, i) => n.pattern[i] === x) && p.progress + 1 === p.pattern.length && n.progress === 0 && n.phase === "show" && n.shownAt === m.time;
			}
			return n.pattern.join() === p.pattern.join() && n.progress === p.progress + 1 && n.phase === "input";
		},
		"a valid tap by the current player, once the pattern is shown, always counts": (p, n, a, m, ctx) => a.t !== "tap" || !inChat(ctx, m.user) || p.current !== m.user || typeof a.shape !== "number" || !Number.isInteger(a.shape) || a.shape < 0 || a.shape > 3 || !(p.phase === "input" || p.phase === "show" && m.time >= p.shownAt + showMs(p.pattern.length)) || p !== n,
		"a skip ends the turn with the rounds finished so far, or passes the next person with 0": (p, n, a) => {
			if (a.t !== "skip" || p === n) return true;
			const t = p.current ?? nextUp(p);
			return t !== null && n.done.join() === [...p.done, t].join() && n.scores[t] === (p.current !== null ? p.pattern.length - 1 : 0) && n.current === null && n.phase === "idle";
		},
		"a reset clears every score and turn and keeps the order": (p, n, a) => a.t !== "reset" || p === n || n.done.length === 0 && Object.keys(n.scores).length === 0 && n.current === null && n.phase === "idle" && n.pattern.length === 0,
		"recorded scores and the turn order only change on a reset": (p, n, a) => p.order.join() === n.order.join() && (a.t === "reset" || p === n || Object.keys(p.scores).every((k) => n.scores[k] === p.scores[k])),
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		const x = r.next();
		if (s.current === null) {
			if (nextUp(s) === user && x < .8) return { t: "start" };
			if (x < .5) return { t: "skip" };
			return x < .7 ? { t: "reset" } : { t: "start" };
		}
		if (s.current === user) {
			if (x < .1) return { t: "skip" };
			if (x < .15) return {
				t: "tap",
				shape: 4
			};
			const want = s.pattern[s.progress] ?? 0;
			return {
				t: "tap",
				shape: x < .8 ? want : (want + 1) % 4
			};
		}
		if (x < .2) return { t: "skip" };
		if (x < .3) return { t: "reset" };
		return {
			t: "tap",
			shape: r.int(4)
		};
	},
	local: {},
	view: ({ state, confirmed, pending, me, members, dispatch, theme }) => {
		const colors = [
			theme.color.series1,
			theme.color.series2,
			theme.color.series3,
			theme.color.series4
		];
		const glyphs = [
			"●",
			"■",
			"▲",
			"◆"
		];
		const name = (id) => id === me ? "You" : nameIn(members, id);
		const cur = state.current;
		const next = nextUp(state);
		const finished = isFinished(state);
		let lit = -1;
		let watching = false;
		if (!pending && confirmed.phase === "show") {
			const e = running(confirmed.shownAt, showMs(confirmed.pattern.length));
			if (e !== null) {
				watching = true;
				if (e % C.shapeMs < C.litMs) lit = confirmed.pattern[Math.floor(e / C.shapeMs)] ?? -1;
			}
		}
		const canTap = cur === me && !watching && state.phase !== "idle" && !(pending && state.phase === "show");
		let status;
		if (finished) status = winnerText(state, members);
		else if (cur === null) status = next ? `Next up · ${name(next)}` : "No one here yet";
		else if (pending && state.phase === "show") status = "Getting ready";
		else if (watching) status = `Watch the pattern · round ${confirmed.pattern.length}`;
		else if (cur === me) status = `Your turn · ${state.progress} of ${state.pattern.length}`;
		else status = `${name(cur)} is repeating it · ${state.progress} of ${state.pattern.length}`;
		const subtitle = cur ? `${cur === me ? "Your" : `${nameIn(members, cur)}'s`} turn · round ${state.pattern.length}` : `${state.done.length} of ${state.order.length} played`;
		const w = finished ? winners(state).ids : [];
		const rows = state.order.filter((id) => members.some((m) => m.id === id));
		const shown = rows.slice(0, C.maxRows);
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: C.title,
				subtitle
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gridTemplateColumns: "1fr 1fr",
					gap: 8
				},
				children: [
					0,
					1,
					2,
					3
				].map((i) => {
					const on = canTap || lit === i;
					return /* @__PURE__ */ _jsx("button", {
						"aria-label": `Shape ${i + 1}`,
						onClick: () => {
							if (canTap) dispatch({
								t: "tap",
								shape: i
							});
						},
						style: {
							height: 64,
							border: "none",
							borderRadius: theme.radius.button,
							fontSize: 24,
							background: on ? colors[i] : theme.color.secondaryButton,
							color: on ? theme.color.onPrimary : theme.color.secondaryButtonText
						},
						children: glyphs[i]
					}, i);
				})
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					minHeight: 24,
					marginTop: 8,
					fontWeight: 600,
					overflow: "hidden"
				},
				children: status
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					gap: 8,
					marginTop: 4,
					minHeight: 44,
					alignItems: "center"
				},
				children: [
					finished ? /* @__PURE__ */ _jsx(Button, {
						kind: "primary",
						onClick: () => dispatch({ t: "reset" }),
						children: "Play again"
					}) : null,
					!finished && cur === null && next === me ? /* @__PURE__ */ _jsx(Button, {
						kind: "primary",
						onClick: () => dispatch({ t: "start" }),
						children: "Start"
					}) : null,
					!finished ? /* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						onClick: () => dispatch({ t: "skip" }),
						children: cur === me ? "End turn" : "Skip turn"
					}) : null
				]
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gridTemplateColumns: "1fr 1fr",
					gap: "4px 12px",
					marginTop: 8
				},
				children: shown.map((id) => {
					const played = state.done.includes(id);
					const label = played ? String(state.scores[id] ?? 0) : id === cur ? "playing" : "waiting";
					return /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 6,
							minHeight: 28,
							minWidth: 0
						},
						children: [
							/* @__PURE__ */ _jsx(Avatar, {
								user: id,
								size: 20
							}),
							/* @__PURE__ */ _jsx("span", {
								style: {
									flex: 1,
									minWidth: 0,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
									fontWeight: w.includes(id) ? 600 : 400
								},
								children: nameIn(members, id)
							}),
							/* @__PURE__ */ _jsx("small", { children: label })
						]
					}, id);
				})
			}),
			rows.length > C.maxRows ? /* @__PURE__ */ _jsx("small", { children: `+${rows.length - C.maxRows} more` }) : null
		] });
	}
});
