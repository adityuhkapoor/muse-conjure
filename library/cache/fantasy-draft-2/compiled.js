import { defineApp, Avatar, Button, CardHeader, SystemLine, rng, running } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "@muse/app/jsx-runtime";
// Snake draft for game night snacks. The host starts it, the order is drawn once from the
// server's seed, then people pick in turn and the order reverses every round.
const C = {
	title: "Game night snack draft",
	host: "jake",
	perPerson: 4,
	snacks: [
		"Hot Cheetos",
		"Takis",
		"Hummus",
		"Pita chips",
		"Oreos",
		"Clementines",
		"Trader Joe's dumplings",
		"Mochi",
		"Popcorn",
		"Sour Patch",
		"Pigs in a blanket",
		"Guac",
		"Tortilla chips",
		"Cheez-Its",
		"Rice Krispie treats",
		"KitKats",
		"Pretzels",
		"Grapes",
		"Cold brew",
		"Gummy worms"
	]
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
/** Who holds turn number i: even rounds go forward, odd rounds go back. */
const turnAt = (order, i) => {
	const n = order.length;
	if (n === 0) return "";
	const pos = i % n;
	return (Math.floor(i / n) % 2 === 0 ? order[pos] : order[n - 1 - pos]) ?? "";
};
const realPicks = (s) => s.picks.filter((p) => p.snack !== "");
const isDone = (s) => s.started && (s.picks.length >= s.order.length * s.perPerson || realPicks(s).length >= s.snacks.length);
const currentUser = (s) => s.started && !isDone(s) ? turnAt(s.order, s.picks.length) : "";
const mine = (s, u) => realPicks(s).filter((p) => p.user === u);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export default defineApp({
	name: "Snack draft",
	summary: (s, ctx) => {
		if (!s.started) return `${s.title} · not started · ${s.snacks.length} snacks`;
		if (isDone(s)) return `${s.title} · done · ${realPicks(s).length} snacks picked`;
		const up = ctx.members.find((m) => m.id === currentUser(s))?.name ?? "Someone";
		return `${s.title} · ${realPicks(s).length} of ${s.snacks.length} picked · ${up} is up`;
	},
	init: (ctx) => ({
		title: C.title,
		perPerson: C.perPerson,
		snacks: C.snacks.map((label, i) => ({
			id: `s${i}`,
			label
		})),
		started: false,
		order: [],
		startedAt: 0,
		picks: [],
		host: ctx.members.find((m) => m.name.trim().toLowerCase() === C.host)?.id ?? ctx.members[0]?.id ?? ""
	}),
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "start") {
			if (state.started || meta.user !== state.host || ctx.members.length < 2) return state;
			return {
				...state,
				started: true,
				order: rng(meta.seed).shuffle(ctx.members.map((m) => m.id)),
				startedAt: meta.time
			};
		}
		if (action.t === "pick") {
			if (typeof action.snack !== "string" || !state.started || isDone(state)) return state;
			if (currentUser(state) !== meta.user) return state;
			if (!state.snacks.some((x) => x.id === action.snack)) return state;
			if (state.picks.some((p) => p.snack === action.snack)) return state;
			return {
				...state,
				picks: [...state.picks, {
					snack: action.snack,
					user: meta.user
				}]
			};
		}
		if (action.t === "skip") {
			if (!state.started || isDone(state)) return state;
			const cur = currentUser(state);
			if (cur === "" || inChat(ctx, cur)) return state;
			return {
				...state,
				picks: [...state.picks, {
					snack: "",
					user: cur
				}]
			};
		}
		return state;
	},
	// The host left: the first person still in the chat hosts. Order and picks stay as history.
	onMembers: (state, ctx) => {
		if (inChat(ctx, state.host)) return state;
		const next = ctx.members[0]?.id ?? "";
		return next === state.host ? state : {
			...state,
			host: next
		};
	},
	invariants: {
		"every picked snack exists and is picked once": (s) => {
			const real = realPicks(s);
			return new Set(real.map((p) => p.snack)).size === real.length && real.every((p) => s.snacks.some((x) => x.id === p.snack));
		},
		"no one has more than their share of picks": (s) => s.order.every((u) => mine(s, u).length <= s.perPerson),
		"turn slots are never exceeded": (s) => s.picks.length <= s.order.length * s.perPerson,
		"before the start nothing is drawn, after it the order has each person once": (s) => s.started ? s.order.length >= 2 && new Set(s.order).size === s.order.length : s.order.length === 0 && s.picks.length === 0 && s.startedAt === 0,
		"the host is in the chat": (s, ctx) => ctx.members.length === 0 || inChat(ctx, s.host),
		"each entry was made by the person whose turn it was": (s) => s.picks.every((p, i) => p.user === turnAt(s.order, i))
	},
	transitions: {
		"a start by the host draws the order from the seed and changes nothing else": (p, n, a, m, ctx) => a.t !== "start" || p === n || m.user === p.host && !p.started && n.started && n.startedAt === m.time && n.picks.length === 0 && n.order.join() === rng(m.seed).shuffle(ctx.members.map((x) => x.id)).join() && n.host === p.host && same(n.snacks, p.snacks),
		"a pick adds one entry for the actor and the named snack": (p, n, a, m) => a.t !== "pick" || p === n || n.picks.length === p.picks.length + 1 && n.picks[p.picks.length]?.user === m.user && n.picks[p.picks.length]?.snack === a.snack && same(n.picks.slice(0, p.picks.length), p.picks) && same(n.order, p.order),
		"a pick only happens on the actor's own turn": (p, n, a, m) => a.t !== "pick" || p === n || turnAt(p.order, p.picks.length) === m.user,
		"a skip adds one empty entry for a picker who left": (p, n, a, _m, ctx) => a.t !== "skip" || p === n || n.picks.length === p.picks.length + 1 && n.picks[p.picks.length]?.snack === "" && n.picks[p.picks.length]?.user === turnAt(p.order, p.picks.length) && !inChat(ctx, n.picks[p.picks.length]?.user ?? "") && same(n.picks.slice(0, p.picks.length), p.picks),
		"the host, the snacks and the order never change after the start": (p, n) => p === n || p.host === n.host && same(p.snacks, n.snacks) && (!p.started || same(p.order, n.order)),
		"only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r, ctx) => {
		if (!s.started) return { t: "start" };
		const cur = currentUser(s);
		if (cur !== "" && !inChat(ctx, cur) && r.next() < .6) return { t: "skip" };
		const free = s.snacks.filter((x) => !s.picks.some((p) => p.snack === x.id));
		if (r.next() < .1) return {
			t: "pick",
			snack: "nope"
		};
		if (r.next() < .05) return { t: "skip" };
		if (free.length === 0 || user !== cur && r.next() < .1) return {
			t: "pick",
			snack: r.pick(s.snacks).id
		};
		return {
			t: "pick",
			snack: r.pick(free).id
		};
	},
	local: {},
	view: ({ state, confirmed, pending, me, members, dispatch, theme }) => {
		// The order comes from the server's seed: show it only from confirmed.
		const s = confirmed.started ? state : confirmed;
		const waiting = pending && !confirmed.started && state.started;
		const revealing = confirmed.started && running(confirmed.startedAt, 2e3) !== null;
		const nameOf = (id) => id === me ? "You" : members.find((m) => m.id === id)?.name ?? "Someone";
		const labelOf = (id) => s.snacks.find((x) => x.id === id)?.label ?? "";
		const done = isDone(s);
		const cur = currentUser(s);
		const myTurn = cur === me && !waiting && !revealing;
		const n = s.order.length;
		const round = n ? Math.min(s.perPerson, Math.floor(s.picks.length / n) + 1) : 1;
		const lineup = s.started ? s.order : members.map((m) => m.id);
		const row = s.started && round % 2 === 0 ? [...lineup].reverse() : lineup;
		const free = s.snacks.filter((x) => !s.picks.some((p) => p.snack === x.id));
		const fit = Math.max(8, Math.floor(((theme.width - 30) / 2 - 22) / 7));
		const cut = (t) => t.length > fit ? `${t.slice(0, fit - 1).trimEnd()}…` : t;
		const hostName = members.find((m) => m.id === s.host)?.name ?? "The host";
		const mySnacks = mine(s, me).map((p) => labelOf(p.snack));
		const gone = s.started && !done && cur !== "" && !members.some((m) => m.id === cur);
		const subtitle = !s.started ? `${s.snacks.length} snacks · ${s.perPerson} each` : done ? `Done · ${realPicks(s).length} snacks picked` : `Round ${round} of ${s.perPerson}${round % 2 === 0 ? " · order reversed" : ""} · ${realPicks(s).length} of ${s.snacks.length} picked`;
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: s.title,
				subtitle
			}),
			done ? /* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 6,
					margin: "4px 0"
				},
				children: s.order.map((u) => /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						gap: 8,
						alignItems: "flex-start"
					},
					children: [/* @__PURE__ */ _jsx(Avatar, {
						user: u,
						size: 24
					}), /* @__PURE__ */ _jsxs("div", {
						style: {
							minWidth: 0,
							flex: 1
						},
						children: [/* @__PURE__ */ _jsx("div", {
							style: { fontWeight: 600 },
							children: nameOf(u)
						}), /* @__PURE__ */ _jsx("small", { children: mine(s, u).map((p) => labelOf(p.snack)).join(" · ") || "No picks" })]
					})]
				}, u))
			}) : /* @__PURE__ */ _jsx("div", {
				style: {
					display: "flex",
					gap: 6,
					alignItems: "flex-start",
					margin: "4px 0"
				},
				children: row.map((u) => {
					const isUp = u === cur && !waiting && !revealing;
					return /* @__PURE__ */ _jsxs("div", {
						style: {
							flex: 1,
							minWidth: 0,
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: 2,
							textAlign: "center"
						},
						children: [
							/* @__PURE__ */ _jsx("div", {
								style: {
									display: "flex",
									padding: 2,
									borderRadius: 99,
									boxShadow: isUp ? `0 0 0 2px ${theme.color.primary}` : "none"
								},
								children: /* @__PURE__ */ _jsx(Avatar, {
									user: u,
									size: 28
								})
							}),
							/* @__PURE__ */ _jsx("small", {
								style: {
									maxWidth: "100%",
									fontWeight: isUp ? 600 : 400,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap"
								},
								children: nameOf(u)
							}),
							s.started ? /* @__PURE__ */ _jsx("small", {
								style: {
									color: theme.color.secondaryText,
									whiteSpace: "nowrap"
								},
								children: `${mine(s, u).length} of ${s.perPerson}`
							}) : null
						]
					}, u);
				})
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					minHeight: 28,
					margin: "6px 0",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					gap: 8
				},
				children: waiting || revealing ? /* @__PURE__ */ _jsx(SystemLine, { children: "Spinning the order" }) : !s.started ? /* @__PURE__ */ _jsx(SystemLine, { children: me === s.host ? "Start draws the order at random" : `${hostName} starts the draft` }) : done ? /* @__PURE__ */ _jsx(SystemLine, { children: "Every pick is in" }) : gone ? /* @__PURE__ */ _jsxs(_Fragment, { children: [/* @__PURE__ */ _jsx(SystemLine, { children: `${nameOf(cur)} left` }), /* @__PURE__ */ _jsx(Button, {
					kind: "secondary",
					onClick: () => dispatch({ t: "skip" }),
					children: "Skip"
				})] }) : myTurn ? /* @__PURE__ */ _jsx(SystemLine, {
					actor: "Your pick",
					children: "· tap a snack"
				}) : /* @__PURE__ */ _jsx(SystemLine, {
					actor: nameOf(cur),
					children: "is picking"
				})
			}),
			done || revealing || waiting ? null : /* @__PURE__ */ _jsx("div", {
				style: {
					maxHeight: 170,
					overflowY: "auto",
					display: "grid",
					gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
					gap: 6
				},
				children: (s.started ? free : s.snacks).map((x) => myTurn ? /* @__PURE__ */ _jsx(Button, {
					kind: "deemphasized",
					wide: true,
					onClick: () => dispatch({
						t: "pick",
						snack: x.id
					}),
					children: cut(x.label)
				}, x.id) : /* @__PURE__ */ _jsx("span", {
					title: x.label,
					style: {
						display: "block",
						height: 36,
						lineHeight: "36px",
						minWidth: 0,
						padding: "0 8px",
						borderRadius: theme.radius.button,
						background: theme.color.input,
						color: theme.color.text,
						fontSize: 13,
						textAlign: "center",
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap"
					},
					children: cut(x.label)
				}, x.id))
			}),
			s.started && !done && mySnacks.length ? /* @__PURE__ */ _jsx("div", {
				style: { marginTop: 6 },
				children: /* @__PURE__ */ _jsx("small", { children: `Your picks · ${mySnacks.join(" · ")}` })
			}) : null,
			!s.started && me === s.host ? /* @__PURE__ */ _jsx("div", {
				style: { marginTop: 8 },
				children: /* @__PURE__ */ _jsx(Button, {
					kind: "primary",
					wide: true,
					disabled: members.length < 2 || waiting,
					onClick: () => dispatch({ t: "start" }),
					children: "Start"
				})
			}) : null,
			s.started && !s.order.includes(me) ? /* @__PURE__ */ _jsx("div", {
				style: { marginTop: 6 },
				children: /* @__PURE__ */ _jsx("small", { children: "Not in this draft" })
			}) : null
		] });
	}
});
