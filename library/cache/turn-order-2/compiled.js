import { defineApp, Avatar, Button, CardHeader, Facepile, SystemLine, rng, running } from "@muse/app";
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Shotgun rotation: 4 front seats across two legs (there and back). Anyone can join the draw,
// anyone in it can run it once. Nobody gets a seat in a car they drive, and nobody gets two.
const CHAT = {
	title: "Who gets shotgun?",
	seats: [
		{
			id: "civic-there",
			leg: "there",
			car: "Civic",
			driver: "jake"
		},
		{
			id: "rav4-there",
			leg: "there",
			car: "Rav4",
			driver: "priya"
		},
		{
			id: "civic-back",
			leg: "back",
			car: "Civic",
			driver: "felix"
		},
		{
			id: "rav4-back",
			leg: "back",
			car: "Rav4",
			driver: "omar"
		}
	],
	pool: [
		"jake",
		"priya",
		"felix",
		"omar",
		"noor",
		"wren",
		"ravi"
	]
};
const SPIN_MS = 2e3;
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
function drawSeats(seats, pool, seed, ctx) {
	const r = rng(seed);
	const live = pool.filter((id) => inChat(ctx, id));
	const taken = [];
	return seats.map((s) => {
		const candidates = live.filter((id) => id !== s.driver && !taken.includes(id));
		if (candidates.length === 0) return {
			...s,
			holder: null
		};
		const who = r.shuffle([...candidates])[0] ?? null;
		if (who !== null) taken.push(who);
		return {
			...s,
			holder: who
		};
	});
}
const holds = (s, id) => s.seats.filter((x) => x.holder === id).length;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const driversOf = (s) => s.seats.map((x) => x.driver).join();
export default defineApp({
	name: "Shotgun rotation",
	summary: (s) => {
		const filled = s.seats.filter((x) => x.holder !== null).length;
		return s.drawnAt === null ? `${s.title} ${s.pool.length} in the draw.` : `${s.title} ${filled} of ${s.seats.length} seats assigned.`;
	},
	init: (ctx) => {
		const find = (name) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id ?? null;
		const pool = [];
		for (const name of CHAT.pool) {
			const id = find(name);
			if (id !== null && !pool.includes(id)) pool.push(id);
		}
		return {
			title: CHAT.title,
			seats: CHAT.seats.map((s) => ({
				id: s.id,
				leg: s.leg,
				car: s.car,
				driver: find(s.driver),
				holder: null
			})),
			pool,
			drawnAt: null,
			round: 0
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "join") {
			if (state.drawnAt !== null) return state;
			return {
				...state,
				pool: state.pool.includes(meta.user) ? state.pool.filter((x) => x !== meta.user) : [...state.pool, meta.user]
			};
		}
		if (action.t === "draw") {
			if (state.drawnAt !== null || !state.pool.includes(meta.user)) return state;
			const seats = drawSeats(state.seats, state.pool, meta.seed, ctx);
			if (seats.every((s) => s.holder === null)) return state;
			return {
				...state,
				seats,
				drawnAt: meta.time,
				round: 1
			};
		}
		if (action.t === "reset") {
			if (state.drawnAt === null) return state;
			return {
				...state,
				seats: state.seats.map((s) => ({
					...s,
					holder: null
				})),
				drawnAt: null,
				round: 0
			};
		}
		return state;
	},
	// Someone left: they drop out of the pool, lose any seat, and stop being a driver.
	onMembers: (state, ctx) => {
		const poolOk = state.pool.every((id) => inChat(ctx, id));
		const seatsOk = state.seats.every((s) => (s.driver === null || inChat(ctx, s.driver)) && (s.holder === null || inChat(ctx, s.holder)));
		if (poolOk && seatsOk) return state;
		return {
			...state,
			pool: state.pool.filter((id) => inChat(ctx, id)),
			seats: state.seats.map((s) => ({
				...s,
				driver: s.driver !== null && inChat(ctx, s.driver) ? s.driver : null,
				holder: s.holder !== null && inChat(ctx, s.holder) ? s.holder : null
			}))
		};
	},
	invariants: {
		"each person holds at most one front seat": (s) => s.seats.every((x) => x.holder === null || holds(s, x.holder) === 1),
		"no one holds a seat in a car they drive": (s) => s.seats.every((x) => x.holder === null || x.holder !== x.driver),
		"holders, drivers and the pool are in the chat": (s, ctx) => s.pool.every((id) => inChat(ctx, id)) && s.seats.every((x) => (x.holder === null || inChat(ctx, x.holder)) && (x.driver === null || inChat(ctx, x.driver))),
		"every holder is in the pool": (s) => s.seats.every((x) => x.holder === null || s.pool.includes(x.holder)),
		"there are 4 seats with unique ids and the pool has no duplicates": (s) => s.seats.length === 4 && new Set(s.seats.map((x) => x.id)).size === 4 && new Set(s.pool).size === s.pool.length,
		"drawn time and round agree, and nothing is held before the draw": (s) => s.drawnAt === null === (s.round === 0) && (s.drawnAt !== null || s.seats.every((x) => x.holder === null))
	},
	transitions: {
		"a join toggles only the actor in the pool and changes nothing else": (p, n, a, m) => a.t !== "join" || p === n || p.pool.includes(m.user) !== n.pool.includes(m.user) && same(p.pool.filter((x) => x !== m.user), n.pool.filter((x) => x !== m.user)) && same(p.seats, n.seats) && p.drawnAt === n.drawnAt && p.round === n.round,
		"a join changes nothing once the draw has happened": (p, n, a) => a.t !== "join" || p === n || p.drawnAt === null,
		"a draw gives seats in the order the seed gives and stamps the time": (p, n, a, m, ctx) => a.t !== "draw" || p === n || p.drawnAt === null && same(n.seats, drawSeats(p.seats, p.pool, m.seed, ctx)) && n.drawnAt === m.time && n.round === 1 && same(p.pool, n.pool),
		"only a person in the pool can draw": (p, n, a, m) => a.t !== "draw" || p === n || p.pool.includes(m.user),
		"a reset clears every holder and the draw time and keeps the pool and drivers": (p, n, a) => a.t !== "reset" || p === n || p.drawnAt !== null && n.drawnAt === null && n.round === 0 && n.seats.every((x) => x.holder === null) && same(p.pool, n.pool) && driversOf(p) === driversOf(n),
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, _user, r) => {
		const k = r.next();
		if (s.drawnAt === null) return k < .35 ? { t: "join" } : { t: "draw" };
		return k < .5 ? { t: "reset" } : { t: "join" };
	},
	local: {},
	view: ({ state, confirmed, pending, me, members, dispatch, theme }) => {
		const nameOf = (id) => id === me ? "You" : members.find((m) => m.id === id)?.name ?? "Someone";
		const drawn = confirmed.drawnAt !== null;
		const spinning = pending && confirmed.drawnAt === null && state.drawnAt !== null || confirmed.drawnAt !== null && running(confirmed.drawnAt, SPIN_MS) !== null;
		const inPool = state.pool.includes(me);
		const mine = confirmed.seats.find((x) => x.holder === me);
		const filled = confirmed.seats.filter((x) => x.holder !== null).length;
		const subtitle = spinning ? "Spinning" : drawn ? `Drawn · ${filled} of ${confirmed.seats.length} seats` : `${state.pool.length} in the draw`;
		const status = spinning ? "Spinning" : drawn ? mine ? `You got the ${mine.car} ${mine.leg}` : "No seat yet" : inPool ? "You are in the draw" : "Join to be in the draw";
		const leg = (which, label) => /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx("small", {
			style: {
				display: "block",
				marginTop: 4
			},
			children: label
		}), confirmed.seats.filter((x) => x.leg === which).map((x) => /* @__PURE__ */ _jsxs("div", {
			style: {
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: 8,
				minHeight: 44,
				borderTop: `1px solid ${theme.color.divider}`
			},
			children: [/* @__PURE__ */ _jsxs("div", {
				style: { minWidth: 0 },
				children: [/* @__PURE__ */ _jsx("div", {
					style: { fontWeight: 600 },
					children: x.car
				}), /* @__PURE__ */ _jsx("small", {
					style: {
						display: "block",
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap"
					},
					children: x.driver ? `${nameOf(x.driver)} drives` : "Front seat"
				})]
			}), /* @__PURE__ */ _jsx("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 6,
					minWidth: 0,
					justifyContent: "flex-end"
				},
				children: spinning ? /* @__PURE__ */ _jsx("small", { children: "Spinning" }) : x.holder ? /* @__PURE__ */ _jsxs(_Fragment, { children: [/* @__PURE__ */ _jsx(Avatar, {
					user: x.holder,
					size: 24
				}), /* @__PURE__ */ _jsx("span", {
					style: {
						fontWeight: 600,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
						maxWidth: 110
					},
					children: nameOf(x.holder)
				})] }) : /* @__PURE__ */ _jsx("small", { children: "Open" })
			})]
		}, x.id))] }, which);
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle
			}),
			/* @__PURE__ */ _jsxs("div", { children: [leg("there", "There"), leg("back", "Back")] }),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 8,
					marginTop: 8,
					minHeight: 44
				},
				children: [/* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 6,
						minWidth: 0
					},
					children: [state.pool.length ? /* @__PURE__ */ _jsx(Facepile, {
						users: state.pool,
						max: 3,
						size: 20
					}) : null, /* @__PURE__ */ _jsx("small", { children: `${state.pool.length} in` })]
				}), /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						gap: 8
					},
					children: [!drawn && !spinning ? /* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						onClick: () => dispatch({ t: "join" }),
						children: inPool ? "Leave" : "Join"
					}) : null, !drawn && !(pending && state.drawnAt !== null) ? /* @__PURE__ */ _jsx(Button, {
						kind: "primary",
						disabled: !inPool,
						onClick: () => dispatch({ t: "draw" }),
						children: "Draw"
					}) : /* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						disabled: spinning,
						onClick: () => dispatch({ t: "reset" }),
						children: "Redo"
					})]
				})]
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					minHeight: 24,
					marginTop: 4
				},
				children: /* @__PURE__ */ _jsx(SystemLine, { children: status })
			})
		] });
	}
});
