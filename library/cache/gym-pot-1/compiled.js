import { defineApp, Avatar, Button, CardHeader, Facepile, Progress } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Streak pot: everyone puts in a buy-in, checks in on gym days, and misses add to the pot.
// At the end, people who never missed split it.
const C = {
	title: "6am gym streak pot",
	days: 28,
	buyIn: 1e3,
	fee: 200,
	grace: 2,
	restDays: [2, 6],
	dayNames: [
		"Mon",
		"Tue",
		"Wed",
		"Thu",
		"Fri",
		"Sat",
		"Sun"
	],
	spot: "Chipotle"
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const money = (c) => {
	const d = Math.floor(c / 100);
	const r = c % 100;
	return r ? `$${d}.${r < 10 ? "0" : ""}${r}` : `$${d}`;
};
const missesOf = (s, id) => {
	const mine = s.checkins[id] ?? [];
	let n = 0;
	for (let d = 0; d < Math.min(s.today, s.days); d++) {
		if (!s.restDays.includes(d % 7) && !mine.includes(d)) n++;
	}
	return n;
};
const potOf = (s, members) => s.paid.length * s.buyIn + members.reduce((n, m) => n + missesOf(s, m.id), 0) * s.fee;
const othersSame = (p, n, user) => {
	const pk = Object.keys(p.checkins).filter((k) => k !== user);
	const nk = Object.keys(n.checkins).filter((k) => k !== user);
	return pk.length === nk.length && pk.every((k) => k in n.checkins && (n.checkins[k] ?? []).join() === (p.checkins[k] ?? []).join());
};
function checkin(s, user, day) {
	if (typeof day !== "number" || !Number.isInteger(day)) return s;
	if (day < 0 || day > s.today || day >= s.days || day < s.today - C.grace) return s;
	if (s.restDays.includes(day % 7)) return s;
	const mine = s.checkins[user] ?? [];
	if (mine.includes(day)) return s;
	return {
		...s,
		checkins: {
			...s.checkins,
			[user]: [...mine, day].sort((x, y) => x - y)
		}
	};
}
export default defineApp({
	name: "Streak pot",
	summary: (s, ctx) => {
		const pot = money(potOf(s, ctx.members));
		return s.closed ? `${s.title} · finished · ${pot} pot` : `${s.title} · day ${s.today + 1} of ${s.days} · ${pot} in the pot`;
	},
	init: (ctx) => ({
		title: C.title,
		days: C.days,
		today: 0,
		buyIn: C.buyIn,
		fee: C.fee,
		restDays: [...C.restDays],
		checkins: {},
		paid: [],
		closed: false,
		host: ctx.members[0]?.id ?? ""
	}),
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user) || state.closed) return state;
		if (action.t === "checkin") return checkin(state, meta.user, action.day);
		if (action.t === "paid") {
			return {
				...state,
				paid: state.paid.includes(meta.user) ? state.paid.filter((x) => x !== meta.user) : [...state.paid, meta.user]
			};
		}
		if (action.t === "advance") {
			return meta.user === state.host && state.today < state.days - 1 ? {
				...state,
				today: state.today + 1
			} : state;
		}
		if (action.t === "end") {
			return meta.user === state.host && state.today === state.days - 1 ? {
				...state,
				today: state.days,
				closed: true
			} : state;
		}
		return state;
	},
	// Someone left: their check-ins and buy-in mark go, and the host role passes on.
	onMembers: (s, ctx) => {
		const all = Object.keys(s.checkins);
		const keep = all.filter((k) => inChat(ctx, k));
		const host = ctx.members.length === 0 || inChat(ctx, s.host) ? s.host : ctx.members[0]?.id ?? "";
		if (keep.length === all.length && s.paid.every((x) => inChat(ctx, x)) && host === s.host) return s;
		return {
			...s,
			host,
			paid: s.paid.filter((x) => inChat(ctx, x)),
			checkins: Object.fromEntries(keep.map((k) => [k, s.checkins[k] ?? []]))
		};
	},
	invariants: {
		"check-in days are sorted, unique, on gym days, and not in the future": (s) => Object.values(s.checkins).every((list) => new Set(list).size === list.length && list.every((d, i) => Number.isInteger(d) && d >= 0 && d < s.days && d <= s.today && !s.restDays.includes(d % 7) && (i === 0 || list[i - 1] < d))),
		"check-ins and buy-ins belong to people in the chat, once each": (s, ctx) => Object.keys(s.checkins).every((k) => inChat(ctx, k)) && s.paid.every((x) => inChat(ctx, x)) && new Set(s.paid).size === s.paid.length,
		"today is inside the challenge and closed means finished": (s) => s.today >= 0 && s.today <= s.days && s.closed === (s.today === s.days),
		"the host is in the chat while anyone is": (s, ctx) => ctx.members.length === 0 || inChat(ctx, s.host)
	},
	transitions: {
		"a check-in adds that day to the actor's own list and nothing else": (p, n, a, m) => a.t !== "checkin" || p === n || !(p.checkins[m.user] ?? []).includes(a.day) && (n.checkins[m.user] ?? []).includes(a.day) && (n.checkins[m.user] ?? []).length === (p.checkins[m.user] ?? []).length + 1 && othersSame(p, n, m.user) && n.paid === p.paid && n.today === p.today && a.day <= p.today && a.day >= p.today - C.grace && !p.restDays.includes(a.day % 7),
		"an I paid tap flips only the actor in the paid list": (p, n, a, m) => a.t !== "paid" || p === n || p.paid.includes(m.user) !== n.paid.includes(m.user) && p.paid.filter((x) => x !== m.user).join() === n.paid.filter((x) => x !== m.user).join() && n.checkins === p.checkins && n.today === p.today,
		"only the host moves to the next day, by exactly one": (p, n, a, m) => a.t !== "advance" || p === n || m.user === p.host && !p.closed && n.today === p.today + 1 && n.checkins === p.checkins && n.paid === p.paid && !n.closed,
		"only the host ends the challenge, on the last day": (p, n, a, m) => a.t !== "end" || p === n || m.user === p.host && p.today === p.days - 1 && n.closed && n.today === n.days && n.checkins === p.checkins && n.paid === p.paid,
		"the rules never change": (p, n) => p.days === n.days && p.buyIn === n.buyIn && p.fee === n.fee && p.title === n.title && p.restDays.join() === n.restDays.join(),
		"only people in the chat change anything, and nothing changes once closed": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user) && !p.closed
	},
	arbitrary: (s, user, r) => {
		const k = r.next();
		if (user === s.host && k < .2) return s.today === s.days - 1 ? { t: "end" } : { t: "advance" };
		if (k < .7) return {
			t: "checkin",
			day: s.today - r.int(5) + 1
		};
		if (k < .85) return { t: "paid" };
		return r.next() < .5 ? { t: "advance" } : { t: "end" };
	},
	local: {},
	view: ({ state, me, members, dispatch }) => {
		const d = state.today;
		const pot = potOf(state, members);
		const fees = pot - state.paid.length * state.buyIn;
		const rest = state.restDays.includes(d % 7);
		const mine = state.checkins[me] ?? [];
		const doneToday = mine.includes(d);
		const y = d - 1;
		const canYesterday = !state.closed && y >= 0 && y >= d - C.grace && !state.restDays.includes(y % 7) && !mine.includes(y);
		const isHost = me === state.host;
		const last = d === state.days - 1;
		const iPaid = state.paid.includes(me);
		const shown = members.slice(0, 8);
		const hidden = members.length - shown.length;
		const clean = members.filter((m) => missesOf(state, m.id) === 0);
		const share = clean.length ? Math.floor(pot / clean.length) : 0;
		const extra = clean.length ? pot - share * clean.length : 0;
		const max = Math.max(1, members.length);
		const note = rest ? "Rest day today" : doneToday ? "You checked in today" : `Today is ${C.dayNames[d % 7] ?? ""}`;
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: state.closed ? "Finished · 4 weeks" : `Week ${Math.floor(d / 7) + 1} · day ${d + 1} of ${state.days}`
			}),
			state.closed ? null : /* @__PURE__ */ _jsx(Progress, {
				value: Math.min(state.paid.length, max),
				max,
				label: `${money(state.paid.length * state.buyIn)} in · ${money(fees)} fees`
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 4,
					marginTop: 8
				},
				children: [shown.map((m) => {
					const misses = missesOf(state, m.id);
					const n = (state.checkins[m.id] ?? []).length;
					return /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: 28
						},
						children: [
							/* @__PURE__ */ _jsx(Avatar, {
								user: m,
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
								children: m.id === me ? "You" : m.name
							}),
							/* @__PURE__ */ _jsx("small", {
								style: {
									flexShrink: 0,
									whiteSpace: "nowrap"
								},
								children: misses === 0 ? `${n} in · clean` : `${n} in · owes ${money(misses * state.fee)}`
							})
						]
					}, m.id);
				}), hidden > 0 ? /* @__PURE__ */ _jsx("small", { children: `+${hidden} more` }) : null]
			}),
			state.closed ? /* @__PURE__ */ _jsx("div", {
				style: {
					marginTop: 12,
					display: "grid",
					gap: 4
				},
				children: clean.length === 0 ? /* @__PURE__ */ _jsx("div", {
					style: { fontWeight: 600 },
					children: `Everyone missed · pot goes to ${C.spot}`
				}) : /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8
					},
					children: [/* @__PURE__ */ _jsx(Facepile, {
						users: clean,
						max: 4,
						size: 24
					}), /* @__PURE__ */ _jsxs("div", {
						style: {
							flex: 1,
							minWidth: 0
						},
						children: [/* @__PURE__ */ _jsx("div", {
							style: { fontWeight: 600 },
							children: `${clean.length} split ${money(pot)} · ${money(share)} each`
						}), extra > 0 ? /* @__PURE__ */ _jsx("small", { children: `${money(extra)} extra to ${clean[0]?.name ?? "the first"}` }) : null]
					})]
				})
			}) : /* @__PURE__ */ _jsxs("div", {
				style: { marginTop: 8 },
				children: [/* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						flexWrap: "wrap",
						gap: 8
					},
					children: [
						/* @__PURE__ */ _jsx(Button, {
							kind: "primary",
							disabled: rest || doneToday,
							onClick: () => dispatch({
								t: "checkin",
								day: d
							}),
							children: "Check in"
						}),
						canYesterday ? /* @__PURE__ */ _jsx(Button, {
							kind: "secondary",
							onClick: () => dispatch({
								t: "checkin",
								day: y
							}),
							children: "Yesterday"
						}) : null,
						/* @__PURE__ */ _jsx(Button, {
							kind: "secondary",
							onClick: () => dispatch({ t: "paid" }),
							children: iPaid ? "Undo paid" : "I paid"
						}),
						isHost ? /* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							onClick: () => dispatch(last ? { t: "end" } : { t: "advance" }),
							children: last ? "End challenge" : "Next day"
						}) : null
					]
				}), /* @__PURE__ */ _jsx("small", { children: note })]
			})
		] });
	}
});
