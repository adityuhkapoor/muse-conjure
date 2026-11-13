import { defineApp, Avatar, Button, CardHeader, Facepile, SystemLine, clock, rng } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Random 2v2 teams for 3 rounds. The 3 ways to split 4 people are the 3 rounds, in a random
// order, so nobody repeats a partner. With 2 or 3 people in the chat it is one 1v1 round.
const CHAT = {
	title: "2v2 teams",
	players: 4,
	shuffleMs: 2e3
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const countFor = (n) => n >= CHAT.players ? CHAT.players : n >= 2 ? 2 : 0;
const roundsFor = (players) => players === CHAT.players ? 3 : 1;
/** Pure: the same ids and seed always give the same rounds. */
function deal(ids, seed) {
	const r = rng(seed);
	const o = r.shuffle([...ids]);
	if (ids.length !== CHAT.players) {
		return [{
			a: [o[0]],
			b: [o[1]]
		}];
	}
	const splits = r.shuffle([
		[
			0,
			1,
			2,
			3
		],
		[
			0,
			2,
			1,
			3
		],
		[
			0,
			3,
			1,
			2
		]
	]);
	return splits.map((s) => {
		const x = [o[s[0]], o[s[1]]];
		const y = [o[s[2]], o[s[3]]];
		return r.next() < .5 ? {
			a: x,
			b: y
		} : {
			a: y,
			b: x
		};
	});
}
const key = (t) => [...t].sort().join("|");
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const drawn = (s) => s.rounds.length > 0;
function validRound(r, roster) {
	const all = [...r.a, ...r.b];
	const half = roster.length / 2;
	return r.a.length === half && r.b.length === half && new Set(all).size === roster.length && all.every((x) => roster.includes(x));
}
export default defineApp({
	name: "Team pairing",
	summary: (s) => drawn(s) ? `${s.title} drawn · ${s.rounds.length} ${s.rounds.length === 1 ? "round" : "rounds"}` : `${s.title} · not drawn yet`,
	init: () => ({
		title: CHAT.title,
		roster: [],
		rounds: [],
		at: 0,
		drawnBy: ""
	}),
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		const count = countFor(ctx.members.length);
		if (count === 0) return state;
		if (action.t === "draw") {
			if (drawn(state)) return state;
			const ids = ctx.members.slice(0, count).map((m) => m.id);
			if (new Set(ids).size !== count) return state;
			return {
				...state,
				roster: ids,
				rounds: deal(ids, meta.seed),
				at: meta.time,
				drawnBy: meta.user
			};
		}
		if (action.t === "redo") {
			if (!drawn(state) || state.roster.length !== 2 && state.roster.length !== CHAT.players) return state;
			if (!state.roster.every((id) => inChat(ctx, id))) return state;
			return {
				...state,
				rounds: deal(state.roster, meta.seed),
				at: meta.time,
				drawnBy: meta.user
			};
		}
		return state;
	},
	// Someone in the draw left: the teams no longer work, so the draw is cleared and can be redone.
	onMembers: (state, ctx) => {
		if (state.roster.every((id) => inChat(ctx, id))) return state;
		return {
			...state,
			roster: [],
			rounds: [],
			at: 0,
			drawnBy: ""
		};
	},
	invariants: {
		"there are no rounds or the full set for the roster size": (s) => s.rounds.length === 0 || s.rounds.length === roundsFor(s.roster.length),
		"each round is two equal teams using every player once": (s) => s.rounds.every((r) => validRound(r, s.roster)),
		"no pair of partners repeats across rounds": (s) => {
			const pairs = s.rounds.flatMap((r) => [key(r.a), key(r.b)]);
			return new Set(pairs).size === pairs.length;
		},
		"the roster is empty exactly when there are no rounds, else 2 or 4 different people": (s) => s.rounds.length === 0 ? s.roster.length === 0 : (s.roster.length === 2 || s.roster.length === CHAT.players) && new Set(s.roster).size === s.roster.length,
		"everyone in the draw is in the chat": (s, ctx) => s.roster.every((id) => inChat(ctx, id)),
		"drawnBy is set exactly when teams are drawn": (s) => s.rounds.length === 0 ? s.drawnBy === "" && s.at === 0 : s.drawnBy !== ""
	},
	transitions: {
		"a draw happens only from an empty state and records the actor and time": (p, n, a, m, ctx) => a.t !== "draw" || p === n || p.rounds.length === 0 && n.rounds.length === roundsFor(n.roster.length) && n.drawnBy === m.user && n.at === m.time && countFor(ctx.members.length) > 0 && n.roster.join() === ctx.members.slice(0, countFor(ctx.members.length)).map((x) => x.id).join(),
		"a redo happens only after a draw, keeps the roster and records the actor and time": (p, n, a, m) => a.t !== "redo" || p === n || p.rounds.length > 0 && n.rounds.length === p.rounds.length && n.roster.join() === p.roster.join() && n.drawnBy === m.user && n.at === m.time,
		"the teams are exactly what the seed gives": (p, n, a, m) => a.t !== "draw" && a.t !== "redo" || p === n || same(n.rounds, deal(n.roster, m.seed)),
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
		"only a draw or a redo ever changes the rounds": (p, n, a) => a.t === "draw" || a.t === "redo" || p === n || same(p.rounds, n.rounds)
	},
	arbitrary: (s, _user, r, ctx) => {
		if (ctx.members.length < 2) return r.next() < .5 ? { t: "draw" } : { t: "redo" };
		if (!drawn(s)) return { t: "draw" };
		if (!s.roster.every((id) => inChat(ctx, id))) return { t: "redo" };
		return r.next() < .9 ? { t: "redo" } : { t: "draw" };
	},
	local: {},
	view: ({ confirmed, pending, me, members, dispatch, theme }) => {
		// Teams come from the server's seed, so they are read from `confirmed`.
		const s = confirmed;
		const has = drawn(s);
		const now = has ? clock.value : 0;
		const shuffling = pending || has && now - s.at < CHAT.shuffleMs;
		const nameOf = (id) => id === me ? "You" : members.find((m) => m.id === id)?.name ?? "Someone";
		const ready = members.length >= 2;
		const names = members.slice(0, countFor(members.length)).map((m) => m.name).join(", ");
		const cell = (t, mine) => /* @__PURE__ */ _jsx("div", {
			style: {
				minWidth: 0,
				display: "grid",
				gap: 2,
				padding: 6,
				borderRadius: theme.radius.button,
				background: mine ? theme.color.selected : theme.color.wash,
				border: `2px solid ${mine ? theme.color.primary : theme.color.divider}`,
				color: theme.color.text
			},
			children: t.map((id) => /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 6,
					minWidth: 0
				},
				children: [/* @__PURE__ */ _jsx(Avatar, {
					user: members.find((m) => m.id === id) ?? id,
					size: 20
				}), /* @__PURE__ */ _jsx("span", {
					style: {
						minWidth: 0,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap"
					},
					children: nameOf(id)
				})]
			}, id))
		});
		const partnerLine = (r) => {
			const mine = r.a.includes(me) ? r.a : r.b.includes(me) ? r.b : null;
			if (!mine) return "";
			const other = mine.find((x) => x !== me);
			return other ? ` · You + ${nameOf(other)}` : "";
		};
		if (!has) {
			return /* @__PURE__ */ _jsxs("div", { children: [
				/* @__PURE__ */ _jsx(CardHeader, {
					title: s.title,
					subtitle: ready ? "Not drawn yet" : "Needs 2 players"
				}),
				/* @__PURE__ */ _jsx("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						margin: "8px 0"
					},
					children: /* @__PURE__ */ _jsx(Facepile, {
						users: members,
						max: 4,
						size: 28
					})
				}),
				/* @__PURE__ */ _jsx("div", {
					style: { marginBottom: 12 },
					children: /* @__PURE__ */ _jsx("small", { children: ready ? `${names} · new partners each round` : `${members.length} in the chat now` })
				}),
				/* @__PURE__ */ _jsx(Button, {
					kind: "primary",
					wide: true,
					disabled: !ready || pending,
					onClick: () => dispatch({ t: "draw" }),
					children: "Draw teams"
				})
			] });
		}
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: s.title,
				subtitle: shuffling ? "Shuffling" : `Drawn by ${nameOf(s.drawnBy)}`
			}),
			shuffling ? /* @__PURE__ */ _jsx("div", {
				style: {
					minHeight: 200,
					display: "grid",
					placeItems: "center"
				},
				children: /* @__PURE__ */ _jsx(SystemLine, { children: "Shuffling" })
			}) : /* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 8,
					marginTop: 4
				},
				children: s.rounds.map((r, i) => /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx("div", {
					style: { marginBottom: 2 },
					children: /* @__PURE__ */ _jsx("small", { children: `Round ${i + 1}${partnerLine(r)}` })
				}), /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "grid",
						gridTemplateColumns: "1fr 1fr",
						gap: 8
					},
					children: [cell(r.a, r.a.includes(me)), cell(r.b, r.b.includes(me))]
				})] }, i))
			}),
			/* @__PURE__ */ _jsx("div", {
				style: { marginTop: 12 },
				children: /* @__PURE__ */ _jsx(Button, {
					kind: "deemphasized",
					wide: true,
					disabled: shuffling || !ready,
					onClick: () => dispatch({ t: "redo" }),
					children: "Redo"
				})
			})
		] });
	}
});
