import { defineApp, Avatar, Button, CardHeader, Facepile, OptionRow, SystemLine, rng, running, tween } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Imposter: everyone but one person is dealt the secret show, one clue per round, then a vote.
const P = {
	title: "Imposter: Netflix shows",
	theme: "Netflix shows",
	shows: [
		"Stranger Things",
		"Love Is Blind",
		"Squid Game",
		"The Bear",
		"Wednesday",
		"Bridgerton"
	],
	rounds: 2
};
const ROUNDS = P.rounds;
const MAX_PLAYERS = 12;
const MAX_CLUE = 40;
const DEAL_MS = 1200;
const fade = tween({
	duration: DEAL_MS,
	easing: "decelerate"
});
const RANK = {
	lobby: 0,
	clues: 1,
	vote: 2,
	done: 3
};
const clean = (t) => t.trim().replace(/\s+/g, " ");
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const gave = (s, u, round) => s.clues.some((c) => c.user === u && c.round === round);
const allClued = (s) => s.players.length > 0 && s.players.every((u) => gave(s, u, s.round));
const countsOf = (s) => {
	const out = {};
	for (const u of s.players) out[u] = 0;
	for (const k of Object.keys(s.votes)) {
		const t = s.votes[k];
		if (t !== undefined && out[t] !== undefined) out[t] = (out[t] ?? 0) + 1;
	}
	return out;
};
const topOf = (s) => {
	const c = countsOf(s);
	const max = Math.max(0, ...s.players.map((u) => c[u] ?? 0));
	return max > 0 ? s.players.filter((u) => (c[u] ?? 0) === max) : [];
};
const outcome = (s) => {
	const t = topOf(s);
	return t.length === 1 && t[0] === s.imposter ? "caught" : "escaped";
};
const blank = (shows) => ({
	phase: "lobby",
	shows,
	players: [],
	show: "",
	imposter: "",
	round: 0,
	clues: [],
	seen: [],
	votes: {},
	host: "",
	at: 0,
	verdict: ""
});
const voteCount = (s) => s.players.filter((u) => s.votes[u] !== undefined).length;
export default defineApp({
	name: "Imposter",
	summary: (s, ctx) => {
		if (s.phase === "lobby") return `${P.title}. ${ctx.members.length} players ready.`;
		if (s.phase === "clues") return `${P.title}. Round ${s.round} of ${ROUNDS} · ${s.clues.filter((c) => c.round === s.round).length} of ${s.players.length} clues in.`;
		if (s.phase === "vote") return `${P.title}. ${voteCount(s)} of ${s.players.length} voted.`;
		return `${P.title}. Imposter ${s.verdict}.`;
	},
	init: () => blank(P.shows.slice()),
	reduce: (s, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return s;
		const user = meta.user;
		switch (action.t) {
			case "start": {
				if (s.phase !== "lobby" || ctx.members.length < 3 || s.shows.length === 0) return s;
				const players = ctx.members.slice(0, MAX_PLAYERS).map((m) => m.id);
				if (!players.includes(user)) return s;
				const r = rng(meta.seed);
				const imposter = r.pick(players);
				const show = r.pick(s.shows);
				return {
					...s,
					phase: "clues",
					players,
					show,
					imposter,
					round: 1,
					clues: [],
					seen: [],
					votes: {},
					host: user,
					at: meta.time,
					verdict: ""
				};
			}
			case "seen": {
				if (s.phase === "lobby" || !s.players.includes(user) || s.seen.includes(user)) return s;
				return {
					...s,
					seen: [...s.seen, user]
				};
			}
			case "clue": {
				if (s.phase !== "clues" || !s.players.includes(user) || typeof action.text !== "string") return s;
				const text = clean(action.text);
				if (!text || text.length > MAX_CLUE || gave(s, user, s.round)) return s;
				return {
					...s,
					clues: [...s.clues, {
						user,
						round: s.round,
						text
					}]
				};
			}
			case "next": {
				if (s.phase !== "clues" || !s.players.includes(user) || !allClued(s)) return s;
				if (s.round < ROUNDS) return {
					...s,
					round: s.round + 1
				};
				return {
					...s,
					phase: "vote"
				};
			}
			case "vote": {
				if (s.phase !== "vote" || !s.players.includes(user) || typeof action.target !== "string") return s;
				if (!s.players.includes(action.target) || action.target === user || s.votes[user] === action.target) return s;
				const votes = {
					...s.votes,
					[user]: action.target
				};
				const next = {
					...s,
					votes
				};
				if (s.players.every((u) => votes[u] !== undefined)) return {
					...next,
					phase: "done",
					verdict: outcome(next)
				};
				return next;
			}
			case "reset": {
				if (s.phase === "lobby" || user !== s.host) return s;
				return blank(s.shows);
			}
			default: return s;
		}
	},
	onMembers: (s, ctx) => {
		if (s.phase === "lobby") return s;
		const here = (u) => inChat(ctx, u);
		if (s.players.every(here)) return s;
		const players = s.players.filter(here);
		if (s.phase === "done" || players.length < 3 || !players.includes(s.imposter)) return blank(s.shows);
		const votes = {};
		for (const k of Object.keys(s.votes)) {
			const t = s.votes[k];
			if (t !== undefined && players.includes(k) && players.includes(t)) votes[k] = t;
		}
		const next = {
			...s,
			players,
			host: players.includes(s.host) ? s.host : players[0],
			clues: s.clues.filter((c) => players.includes(c.user)),
			seen: s.seen.filter((u) => players.includes(u)),
			votes
		};
		if (s.phase === "vote" && players.every((u) => votes[u] !== undefined)) return {
			...next,
			phase: "done",
			verdict: outcome(next)
		};
		return next;
	},
	invariants: {
		"every player is in the chat": (s, ctx) => s.players.every((u) => inChat(ctx, u)) && new Set(s.players).size === s.players.length,
		"the lobby holds no game": (s) => s.phase !== "lobby" || s.players.length === 0 && s.clues.length === 0 && Object.keys(s.votes).length === 0 && s.seen.length === 0 && s.show === "" && s.imposter === "" && s.round === 0 && s.host === "" && s.verdict === "",
		"a game has 3 or more players, an imposter, a show from the list and a host": (s) => s.phase === "lobby" || s.players.length >= 3 && s.players.includes(s.imposter) && s.shows.includes(s.show) && s.players.includes(s.host) && s.round >= 1 && s.round <= ROUNDS,
		"one clue per player per round, from players, no later than this round": (s) => s.clues.every((c) => s.players.includes(c.user) && c.round >= 1 && c.round <= s.round && c.text.length > 0 && c.text.length <= MAX_CLUE && c.text === clean(c.text)) && new Set(s.clues.map((c) => `${c.user}:${c.round}`)).size === s.clues.length,
		"round 2 and the vote begin only after every clue is in": (s) => (s.round <= 1 || s.players.every((u) => gave(s, u, 1))) && (s.phase !== "vote" && s.phase !== "done" || s.players.every((u) => gave(s, u, ROUNDS))),
		"votes go from a player to a different player, one each": (s) => Object.keys(s.votes).every((k) => s.players.includes(k) && s.players.includes(s.votes[k] ?? "") && s.votes[k] !== k) && (s.phase === "vote" || s.phase === "done" || Object.keys(s.votes).length === 0),
		"the vote stays open until everyone has voted": (s) => s.phase !== "vote" || s.round === ROUNDS && s.players.some((u) => s.votes[u] === undefined),
		"the verdict matches the votes": (s) => s.phase === "done" ? s.players.every((u) => s.votes[u] !== undefined) && s.verdict === outcome(s) : s.verdict === "",
		"seen has each player once": (s) => new Set(s.seen).size === s.seen.length && s.seen.every((u) => s.players.includes(u))
	},
	transitions: {
		"a start deals the members in with the imposter and show the seed gives": (p, n, a, m, ctx) => {
			if (a.t !== "start" || p === n) return true;
			const r = rng(m.seed);
			return p.phase === "lobby" && n.phase === "clues" && n.round === 1 && n.players.join() === ctx.members.slice(0, MAX_PLAYERS).map((x) => x.id).join() && n.imposter === r.pick(n.players) && n.show === r.pick(n.shows) && n.host === m.user && n.at === m.time;
		},
		"a clue adds one entry for the actor in this round and changes nothing else": (p, n, a, m) => {
			if (a.t !== "clue" || p === n) return true;
			const last = n.clues.at(-1);
			return p.phase === "clues" && n.phase === "clues" && n.round === p.round && n.clues.length === p.clues.length + 1 && !!last && last.user === m.user && last.round === p.round && last.text === clean(String(a.text)) && JSON.stringify(n.clues.slice(0, -1)) === JSON.stringify(p.clues);
		},
		"next moves forward only when every player has a clue": (p, n, a) => {
			if (a.t !== "next" || p === n) return true;
			return p.phase === "clues" && allClued(p) && JSON.stringify(n.clues) === JSON.stringify(p.clues) && (p.round < ROUNDS ? n.phase === "clues" && n.round === p.round + 1 : n.phase === "vote" && n.round === p.round);
		},
		"a vote changes only the actor's entry": (p, n, a, m) => {
			if (a.t !== "vote" || p === n) return true;
			return p.phase === "vote" && n.votes[m.user] === a.target && Object.keys(n.votes).every((k) => k === m.user || p.votes[k] === n.votes[k]) && Object.keys(p.votes).every((k) => k === m.user || n.votes[k] === p.votes[k]) && n.imposter === p.imposter;
		},
		"seen adds only the actor": (p, n, a, m) => {
			if (a.t !== "seen" || p === n) return true;
			return n.seen.length === p.seen.length + 1 && n.seen.at(-1) === m.user && p.seen.every((u, i) => n.seen[i] === u) && n.phase === p.phase && n.show === p.show;
		},
		"only the host can reset": (p, n, a, m) => a.t !== "reset" || p === n || m.user === p.host && n.phase === "lobby",
		"the phase only moves forward or back to the lobby": (p, n) => p === n || n.phase === "lobby" || RANK[n.phase] === RANK[p.phase] || RANK[n.phase] === (RANK[p.phase] ?? 0) + 1,
		"the show list never changes": (p, n) => p.shows.join("|") === n.shows.join("|"),
		"only people in the chat change the game": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		if (s.phase === "lobby") return { t: "start" };
		if (r.next() < .1) return { t: "seen" };
		const isPlayer = s.players.includes(user);
		if (s.phase === "clues") {
			if (isPlayer && !gave(s, user, s.round)) return {
				t: "clue",
				text: r.pick([
					"tentacles",
					"  a game  ",
					"",
					"x".repeat(45),
					"upside down",
					"school"
				])
			};
			if (allClued(s)) return { t: "next" };
			return {
				t: "clue",
				text: "again"
			};
		}
		if (s.phase === "vote") return {
			t: "vote",
			target: r.pick(s.players)
		};
		return { t: "reset" };
	},
	local: {
		shown: 0,
		draft: ""
	},
	view: ({ state, confirmed, pending, me, members, dispatch, theme, local, setLocal }) => {
		const plain = (id) => members.find((m) => m.id === id)?.name ?? "Someone";
		const nowrap = {
			overflow: "hidden",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap"
		};
		if (state.phase === "lobby") {
			return /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx(CardHeader, {
				title: P.title,
				subtitle: `${members.length} players · ${ROUNDS} rounds, then a vote`
			}), /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 10,
					justifyItems: "start",
					padding: "8px 0"
				},
				children: [
					/* @__PURE__ */ _jsx(Facepile, {
						users: members,
						max: 7,
						size: 28
					}),
					/* @__PURE__ */ _jsx("small", { children: `Theme: ${P.theme} · ${P.shows.length} shows in play. One of you is dealt no show.` }),
					/* @__PURE__ */ _jsx(Button, {
						kind: "primary",
						wide: true,
						disabled: members.length < 3,
						onClick: () => dispatch({ t: "start" }),
						children: "Start"
					}),
					members.length < 3 ? /* @__PURE__ */ _jsx("small", { children: "Needs at least 3 players" }) : null
				]
			})] });
		}
		if (pending && confirmed.phase === "lobby") {
			return /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx(CardHeader, {
				title: P.title,
				subtitle: "Dealing"
			}), /* @__PURE__ */ _jsx(SystemLine, { children: "Dealing" })] });
		}
		const inGame = state.players.includes(me);
		const cInGame = confirmed.players.includes(me) && confirmed.phase !== "lobby";
		const visible = confirmed.at > 0 && local.shown === confirmed.at;
		const e = running(confirmed.at, DEAL_MS);
		const opacity = e === null ? 1 : fade(e);
		const roleText = me === confirmed.imposter ? "You're the imposter" : `Your show: ${confirmed.show}`;
		const toggle = () => {
			setLocal({ shown: visible ? 0 : confirmed.at });
			if (!visible && cInGame && !confirmed.seen.includes(me)) dispatch({ t: "seen" });
		};
		const card = cInGame && (state.phase === "clues" || state.phase === "vote") ? /* @__PURE__ */ _jsxs("div", {
			style: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				minHeight: 44,
				opacity
			},
			children: [/* @__PURE__ */ _jsxs("div", {
				style: {
					flex: 1,
					minWidth: 0
				},
				children: [visible ? /* @__PURE__ */ _jsx("b", { children: roleText }) : /* @__PURE__ */ _jsx("span", { children: "Your card" }), /* @__PURE__ */ _jsx("small", {
					style: { display: "block" },
					children: `${confirmed.seen.length} of ${confirmed.players.length} have looked`
				})]
			}), /* @__PURE__ */ _jsx(Button, {
				kind: "secondary",
				onClick: toggle,
				children: visible ? "Hide" : "Show card"
			})]
		}) : null;
		const watching = !inGame ? /* @__PURE__ */ _jsx("small", { children: "You join the next game." }) : null;
		if (state.phase === "clues") {
			const inCount = state.clues.filter((c) => c.round === state.round).length;
			const mineDone = gave(state, me, state.round);
			const submit = () => {
				const t = clean(local.draft);
				if (!t) return;
				dispatch({
					t: "clue",
					text: t.slice(0, MAX_CLUE)
				});
				setLocal({ draft: "" });
			};
			return /* @__PURE__ */ _jsxs("div", { children: [
				/* @__PURE__ */ _jsx(CardHeader, {
					title: P.title,
					subtitle: `Round ${state.round} of ${ROUNDS} · ${inCount} of ${state.players.length} clues in`
				}),
				card,
				/* @__PURE__ */ _jsx("div", {
					style: {
						display: "grid",
						gap: 2,
						margin: "4px 0 8px"
					},
					children: state.players.map((u) => {
						const mine = state.clues.filter((c) => c.user === u);
						const done = gave(state, u, state.round);
						const text = mine.length ? mine.map((c) => c.text).join(" · ") + (done ? "" : " · …") : "…";
						return /* @__PURE__ */ _jsxs("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 8,
								minHeight: 28
							},
							children: [
								/* @__PURE__ */ _jsx(Avatar, {
									user: u,
									size: 22
								}),
								/* @__PURE__ */ _jsx("span", {
									style: {
										fontWeight: 600,
										flexShrink: 0,
										maxWidth: 96,
										...nowrap
									},
									children: plain(u)
								}),
								/* @__PURE__ */ _jsx("small", {
									style: {
										flex: 1,
										minWidth: 0,
										color: done ? theme.color.text : theme.color.secondaryText,
										...nowrap
									},
									children: text
								})
							]
						}, u);
					})
				}),
				inGame && !mineDone ? /* @__PURE__ */ _jsxs("form", {
					style: {
						display: "flex",
						gap: 8
					},
					onSubmit: (ev) => {
						ev.preventDefault();
						submit();
					},
					children: [/* @__PURE__ */ _jsx("input", {
						value: local.draft,
						maxLength: MAX_CLUE,
						placeholder: "Your clue",
						"aria-label": "Your clue",
						onInput: (ev) => setLocal({ draft: ev.currentTarget.value })
					}), /* @__PURE__ */ _jsx(Button, {
						kind: "primary",
						disabled: !clean(local.draft),
						onClick: submit,
						children: "Send"
					})]
				}) : inGame && allClued(state) ? /* @__PURE__ */ _jsx(Button, {
					kind: "primary",
					wide: true,
					onClick: () => dispatch({ t: "next" }),
					children: state.round < ROUNDS ? "Next round" : "Start vote"
				}) : inGame ? /* @__PURE__ */ _jsx("small", { children: `Waiting for ${state.players.length - inCount} more` }) : watching
			] });
		}
		if (state.phase === "vote") {
			const counts = countsOf(state);
			return /* @__PURE__ */ _jsxs("div", { children: [
				/* @__PURE__ */ _jsx(CardHeader, {
					title: "Who is the imposter?",
					subtitle: `${voteCount(state)} of ${state.players.length} voted`
				}),
				card,
				/* @__PURE__ */ _jsx("div", {
					style: {
						display: "grid",
						gap: 2
					},
					children: state.players.filter((u) => u !== me).map((u) => /* @__PURE__ */ _jsx(OptionRow, {
						label: plain(u),
						count: counts[u] ?? 0,
						total: state.players.length,
						voters: state.players.filter((v) => state.votes[v] === u),
						selected: state.votes[me] === u,
						onClick: () => {
							if (inGame) dispatch({
								t: "vote",
								target: u
							});
						}
					}, u))
				}),
				watching
			] });
		}
		const counts = countsOf(state);
		const tops = topOf(state);
		const caught = state.verdict === "caught";
		const tally = state.players.filter((u) => (counts[u] ?? 0) > 0).map((u) => `${plain(u)} ${counts[u]}`).join(" · ");
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: P.title,
				subtitle: "Result"
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 2
				},
				children: [
					/* @__PURE__ */ _jsx("h2", { children: tops.length === 1 ? `${plain(tops[0])} got the most votes` : "Votes tied" }),
					/* @__PURE__ */ _jsx("b", {
						style: { color: caught ? theme.color.positive : theme.color.text },
						children: caught ? "Imposter caught" : "Imposter escaped"
					}),
					/* @__PURE__ */ _jsx("small", { children: `${plain(state.imposter)} was the imposter · the show was ${state.show}` })
				]
			}),
			/* @__PURE__ */ _jsx("small", {
				style: {
					display: "block",
					margin: "6px 0"
				},
				children: tally ? `Votes · ${tally}` : "No votes"
			}),
			me === state.host ? /* @__PURE__ */ _jsx(Button, {
				kind: "primary",
				wide: true,
				onClick: () => dispatch({ t: "reset" }),
				children: "Play again"
			}) : /* @__PURE__ */ _jsx("small", { children: `${plain(state.host)} can start a new game` })
		] });
	}
});
