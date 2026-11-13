import { defineApp, Avatar, Button, CardHeader, rng, running, userColor } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "@muse/app/jsx-runtime";
// Higher or lower on the house numbers. Everyone guesses whether the next number is higher or
// lower than the one on show. Right adds one to your streak, wrong resets it. First to 5 wins boba.
const CHAT = {
	title: "Higher or lower: house numbers",
	goal: 5,
	items: [
		{
			label: "Electric this month",
			cents: 14300
		},
		{
			label: "Electric last month",
			cents: 9600
		},
		{
			label: "Wifi",
			cents: 6e3
		},
		{
			label: "Water",
			cents: 3800
		},
		{
			label: "Trader Joe's groceries",
			cents: 8700
		},
		{
			label: "Costco run in Oct",
			cents: 21400
		},
		{
			label: "Rent, each",
			cents: 92500
		},
		{
			label: "Laundromat load now",
			cents: 450
		},
		{
			label: "Laundromat load in Sept",
			cents: 375
		}
	]
};
const SPIN_MS = 1200;
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const money = (c) => c % 100 === 0 ? `$${c / 100}` : `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
function only(o, ctx) {
	const out = {};
	for (const k of Object.keys(o)) {
		const v = o[k];
		if (v !== undefined && inChat(ctx, k)) out[k] = v;
	}
	return out;
}
const sameExcept = (a, b, user) => {
	const ka = Object.keys(a).filter((k) => k !== user);
	const kb = Object.keys(b).filter((k) => k !== user);
	return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
};
const bestStreak = (s) => Object.values(s.streaks).reduce((a, b) => Math.max(a, b), 0);
export default defineApp({
	name: "Higher or lower",
	summary: (s, ctx) => {
		if (s.winner !== null) return `${ctx.members.find((m) => m.id === s.winner)?.name ?? "Someone"} won the boba`;
		return `${s.title}: best streak ${bestStreak(s)} of ${s.goal}`;
	},
	init: () => {
		const items = CHAT.items.map((i, n) => ({
			id: `n${n}`,
			label: i.label,
			cents: i.cents
		}));
		return {
			title: CHAT.title,
			items,
			goal: CHAT.goal,
			current: items[0]?.id ?? "",
			guesses: {},
			streaks: {},
			round: 0,
			last: null,
			winner: null,
			at: 0
		};
	},
	reduce: (s, a, m, ctx) => {
		if (!inChat(ctx, m.user)) return s;
		if (a.t === "guess") {
			if (a.dir !== "higher" && a.dir !== "lower" || s.winner !== null || s.guesses[m.user] === a.dir) return s;
			return {
				...s,
				guesses: {
					...s.guesses,
					[m.user]: a.dir
				}
			};
		}
		if (a.t === "reveal") {
			const who = Object.keys(s.guesses);
			if (s.winner !== null || who.length === 0) return s;
			const cur = s.items.find((i) => i.id === s.current);
			const others = s.items.filter((i) => i.id !== s.current);
			if (!cur || others.length === 0) return s;
			const next = rng(m.seed).pick(others);
			const streaks = { ...s.streaks };
			const results = {};
			for (const u of who) {
				const g = s.guesses[u];
				const r = next.cents === cur.cents ? "tie" : next.cents > cur.cents === (g === "higher") ? "right" : "wrong";
				results[u] = r;
				const old = s.streaks[u] ?? 0;
				streaks[u] = r === "right" ? Math.min(s.goal, old + 1) : r === "wrong" ? 0 : old;
			}
			let winner = null;
			let best = 0;
			for (const u of who) {
				const v = streaks[u] ?? 0;
				if (v >= s.goal && v > best) {
					best = v;
					winner = u;
				}
			}
			return {
				...s,
				current: next.id,
				guesses: {},
				streaks,
				round: s.round + 1,
				last: {
					from: s.current,
					to: next.id,
					results
				},
				winner,
				at: m.time
			};
		}
		if (a.t === "again") {
			const first = s.items[0];
			if (s.winner === null || !first) return s;
			return {
				...s,
				current: first.id,
				guesses: {},
				streaks: {},
				round: 0,
				last: null,
				winner: null,
				at: 0
			};
		}
		return s;
	},
	// Someone left: their guess, streak and result go. If the winner left, the game restarts its streaks.
	onMembers: (s, ctx) => {
		const keep = (u) => inChat(ctx, u);
		const ok = Object.keys(s.guesses).every(keep) && Object.keys(s.streaks).every(keep) && (!s.last || Object.keys(s.last.results).every(keep)) && (s.winner === null || keep(s.winner));
		if (ok) return s;
		const winnerGone = s.winner !== null && !keep(s.winner);
		return {
			...s,
			guesses: only(s.guesses, ctx),
			streaks: winnerGone ? {} : only(s.streaks, ctx),
			last: s.last ? {
				...s.last,
				results: only(s.last.results, ctx)
			} : null,
			winner: winnerGone ? null : s.winner
		};
	},
	invariants: {
		"every streak is a whole number from 0 to the goal": (s) => Object.values(s.streaks).every((v) => Number.isInteger(v) && v >= 0 && v <= s.goal),
		"everyone in guesses, streaks and results is in the chat": (s, ctx) => [
			...Object.keys(s.guesses),
			...Object.keys(s.streaks),
			...Object.keys(s.last?.results ?? {})
		].every((u) => inChat(ctx, u)),
		"the current item exists and item ids are unique": (s) => s.items.some((i) => i.id === s.current) && new Set(s.items.map((i) => i.id)).size === s.items.length,
		"a winner has the goal streak and no open guesses": (s) => s.winner === null || s.streaks[s.winner] === s.goal && Object.keys(s.guesses).length === 0,
		"with no winner nobody has reached the goal": (s) => s.winner !== null || Object.values(s.streaks).every((v) => v < s.goal),
		"every guess is higher or lower, and the last reveal ends on the current item": (s) => Object.values(s.guesses).every((g) => g === "higher" || g === "lower") && (s.last === null ? s.round === 0 : s.round > 0 && s.last.to === s.current && s.last.from !== s.last.to)
	},
	transitions: {
		"a guess sets the actor's own guess and nothing else": (p, n, a, m) => a.t !== "guess" || p === n || n.guesses[m.user] === a.dir && sameExcept(p.guesses, n.guesses, m.user) && p.current === n.current && JSON.stringify(p.streaks) === JSON.stringify(n.streaks) && p.round === n.round,
		"a reveal moves to another item chosen by the seed and clears guesses": (p, n, a, m) => a.t !== "reveal" || p === n || n.current === rng(m.seed).pick(p.items.filter((i) => i.id !== p.current)).id && n.current !== p.current && Object.keys(n.guesses).length === 0 && n.round === p.round + 1 && n.at === m.time && n.last?.from === p.current && n.last.to === n.current,
		"after a reveal right adds one, wrong resets and others keep their streak": (p, n, a) => {
			if (a.t !== "reveal" || p === n) return true;
			const cur = p.items.find((i) => i.id === p.current);
			const nx = n.items.find((i) => i.id === n.current);
			if (!cur || !nx) return false;
			return Object.keys(p.guesses).every((u) => {
				const old = p.streaks[u] ?? 0;
				const want = nx.cents === cur.cents ? old : nx.cents > cur.cents === (p.guesses[u] === "higher") ? old + 1 : 0;
				return n.streaks[u] === want;
			}) && Object.keys(p.streaks).every((u) => u in p.guesses || n.streaks[u] === p.streaks[u]);
		},
		"after a win only a new game changes anything": (p, n, a) => p.winner === null || a.t === "again" || p === n,
		"a new game needs a winner and clears every streak": (p, n, a) => a.t !== "again" || p === n || p.winner !== null && n.winner === null && Object.keys(n.streaks).length === 0 && Object.keys(n.guesses).length === 0 && n.round === 0 && n.last === null && n.current === n.items[0]?.id,
		"only people in the chat change the game": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, _user, r) => {
		if (s.winner !== null) return r.next() < .8 ? { t: "again" } : {
			t: "guess",
			dir: "higher"
		};
		if (Object.keys(s.guesses).length > 0 && r.next() < .45) return { t: "reveal" };
		return {
			t: "guess",
			dir: r.next() < .5 ? "higher" : "lower"
		};
	},
	local: {},
	view: ({ state, confirmed, me, members, dispatch, theme }) => {
		const nameOf = (id) => id === me ? "You" : members.find((m) => m.id === id)?.name ?? "Someone";
		const itemOf = (id) => confirmed.items.find((i) => i.id === id);
		const e = running(confirmed.at, SPIN_MS);
		const revealing = state.round !== confirmed.round || e !== null;
		const done = confirmed.winner !== null && !revealing;
		const shown = itemOf(e !== null && confirmed.last ? confirmed.last.from : confirmed.current);
		const guessed = Object.keys(state.guesses).length;
		const mine = state.guesses[me];
		const last = confirmed.last;
		const lf = last ? itemOf(last.from) : undefined;
		const lt = last ? itemOf(last.to) : undefined;
		let recap = "";
		if (!revealing && last && lf && lt) {
			const dir = lt.cents > lf.cents ? "higher" : lt.cents < lf.cents ? "lower" : "same";
			const names = (want) => Object.keys(last.results).filter((u) => last.results[u] === want).map(nameOf).join(", ");
			const right = names("right");
			const wrong = names("wrong");
			recap = `${lf.label} ${money(lf.cents)} to ${lt.label} ${money(lt.cents)} · ${dir}`;
			const who = [right ? `Right: ${right}` : "", wrong ? `Wrong: ${wrong}` : ""].filter(Boolean).join(" · ");
			if (who) recap = `${recap}\n${who}`;
		}
		const winnerMember = members.find((m) => m.id === confirmed.winner);
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: confirmed.title,
				subtitle: done ? "Game over" : `${guessed} of ${members.length} guessed · ${state.goal} in a row wins`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					background: theme.color.wash,
					color: theme.color.text,
					borderRadius: theme.radius.card,
					padding: 12,
					display: "grid",
					gap: 2
				},
				children: done ? /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 12
					},
					children: [winnerMember ? /* @__PURE__ */ _jsx(Avatar, {
						user: winnerMember,
						size: 40
					}) : null, /* @__PURE__ */ _jsxs("div", {
						style: { minWidth: 0 },
						children: [/* @__PURE__ */ _jsx("h2", {
							style: { margin: 0 },
							children: confirmed.winner === me ? "You win the boba" : `${nameOf(confirmed.winner ?? "")} wins the boba`
						}), /* @__PURE__ */ _jsxs("small", { children: [confirmed.goal, " in a row"] })]
					})]
				}) : /* @__PURE__ */ _jsxs(_Fragment, { children: [
					/* @__PURE__ */ _jsx("small", { children: revealing ? "Spinning" : "Is the next number higher or lower?" }),
					/* @__PURE__ */ _jsx("div", {
						style: { fontWeight: 600 },
						children: shown ? shown.label : ""
					}),
					/* @__PURE__ */ _jsx("h2", {
						style: { margin: 0 },
						children: shown ? money(shown.cents) : ""
					})
				] })
			}),
			/* @__PURE__ */ _jsx("div", {
				style: { marginTop: 8 },
				children: done ? /* @__PURE__ */ _jsx(Button, {
					kind: "primary",
					wide: true,
					onClick: () => dispatch({ t: "again" }),
					children: "New game"
				}) : /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "grid",
						gridTemplateColumns: "1fr 1fr 1fr",
						gap: 8
					},
					children: [
						/* @__PURE__ */ _jsx(Button, {
							wide: true,
							kind: mine === "higher" ? "primary" : "secondary",
							disabled: revealing,
							onClick: () => dispatch({
								t: "guess",
								dir: "higher"
							}),
							children: "Higher"
						}),
						/* @__PURE__ */ _jsx(Button, {
							wide: true,
							kind: mine === "lower" ? "primary" : "secondary",
							disabled: revealing,
							onClick: () => dispatch({
								t: "guess",
								dir: "lower"
							}),
							children: "Lower"
						}),
						/* @__PURE__ */ _jsx(Button, {
							wide: true,
							kind: "secondary",
							disabled: revealing || guessed === 0,
							onClick: () => dispatch({ t: "reveal" }),
							children: "Reveal"
						})
					]
				})
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gridTemplateColumns: "1fr 1fr",
					gap: "4px 8px",
					marginTop: 8
				},
				children: members.map((m) => {
					const n = confirmed.streaks[m.id] ?? 0;
					return /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 6,
							minHeight: 28
						},
						children: [
							/* @__PURE__ */ _jsx(Avatar, {
								user: m,
								size: 20
							}),
							/* @__PURE__ */ _jsx("div", {
								style: {
									flex: 1,
									minWidth: 0,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
									fontSize: theme.type.meta,
									fontWeight: state.guesses[m.id] ? 600 : 400
								},
								children: m.id === me ? "You" : m.name
							}),
							/* @__PURE__ */ _jsx("div", {
								role: "img",
								"aria-label": `${n} of ${confirmed.goal}`,
								style: {
									display: "flex",
									gap: 3
								},
								children: Array.from({ length: confirmed.goal }, (_, i) => /* @__PURE__ */ _jsx("span", { style: {
									width: 8,
									height: 8,
									borderRadius: 999,
									background: i < n ? userColor(m, theme) : theme.color.track
								} }, i))
							})
						]
					}, m.id);
				})
			}),
			recap ? /* @__PURE__ */ _jsx("div", {
				style: { marginTop: 8 },
				children: recap.split("\n").map((line, i) => /* @__PURE__ */ _jsx("small", {
					style: { display: "block" },
					children: line
				}, i))
			}) : null
		] });
	}
});
