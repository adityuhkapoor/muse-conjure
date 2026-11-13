import { defineApp, Avatar, Button, CardHeader, SystemLine } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Ride map: who drives and who rides in each car. Anyone can take an open seat, take an
// empty driver spot, or leave. Taking a new spot frees your old one.
const CHAT = {
	title: "Who's riding with who?",
	when: "Saturday · leaving the dorm lot at 4",
	cars: [
		{
			name: "RAV4",
			driver: "Ana",
			seats: 4,
			note: "",
			riders: ["Zoe", "Sam"]
		},
		{
			name: "Civic",
			driver: "Bryan",
			seats: 3,
			note: "Stop at Trader Joe's first",
			riders: ["Jake"]
		},
		{
			name: "Truck",
			driver: "Luis",
			seats: 1,
			note: "",
			riders: ["Sofia"]
		}
	]
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const spotOf = (s, u) => {
	for (const c of s.cars) {
		if (c.driver === u) return `${c.id}:d`;
		const i = c.seats.indexOf(u);
		if (i >= 0) return `${c.id}:${i}`;
	}
	return "";
};
const allIds = (s) => s.cars.flatMap((c) => [...c.driver === null ? [] : [c.driver], ...c.seats.filter((x) => x !== null)]);
const clear = (cars, u) => cars.map((c) => ({
	...c,
	driver: c.driver === u ? null : c.driver,
	seats: c.seats.map((x) => x === u ? null : x)
}));
const othersSame = (p, n, user) => [...new Set([...allIds(p), ...allIds(n)])].every((id) => id === user || spotOf(p, id) === spotOf(n, id));
export default defineApp({
	name: "Ride map",
	summary: (s, ctx) => {
		const placed = ctx.members.filter((m) => spotOf(s, m.id) !== "").length;
		return `${s.title} ${placed} of ${ctx.members.length} have a ride.`;
	},
	init: (ctx) => {
		const used = new Set();
		const find = (name) => {
			const m = ctx.members.find((x) => x.name.toLowerCase() === name.toLowerCase() && !used.has(x.id));
			if (!m) return null;
			used.add(m.id);
			return m.id;
		};
		const drivers = CHAT.cars.map((c) => find(c.driver));
		const cars = CHAT.cars.map((c, i) => {
			const seats = Array.from({ length: c.seats }, () => null);
			for (const r of c.riders) {
				const slot = seats.indexOf(null);
				if (slot < 0) break;
				const id = find(r);
				if (id) seats[slot] = id;
			}
			return {
				id: `c${i}`,
				name: c.name,
				note: c.note,
				cap: c.seats,
				driver: drivers[i] ?? null,
				seats
			};
		});
		return {
			title: CHAT.title,
			when: CHAT.when,
			cars
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		const user = meta.user;
		if (action.t === "ride") {
			const seat = action.seat;
			if (typeof action.car !== "string" || typeof seat !== "number" || !Number.isInteger(seat)) return state;
			const car = state.cars.find((c) => c.id === action.car);
			if (!car || seat < 0 || seat >= car.seats.length || car.seats[seat] !== null || car.driver === user) return state;
			return {
				...state,
				cars: clear(state.cars, user).map((c) => c.id === car.id ? {
					...c,
					seats: c.seats.map((x, i) => i === seat ? user : x)
				} : c)
			};
		}
		if (action.t === "drive") {
			if (typeof action.car !== "string") return state;
			const car = state.cars.find((c) => c.id === action.car);
			if (!car || car.driver !== null) return state;
			return {
				...state,
				cars: clear(state.cars, user).map((c) => c.id === car.id ? {
					...c,
					driver: user
				} : c)
			};
		}
		if (action.t === "leave") {
			if (spotOf(state, user) === "") return state;
			return {
				...state,
				cars: clear(state.cars, user)
			};
		}
		return state;
	},
	// Someone left: their driver spot or seat opens up.
	onMembers: (state, ctx) => {
		if (allIds(state).every((id) => inChat(ctx, id))) return state;
		return {
			...state,
			cars: state.cars.map((c) => ({
				...c,
				driver: c.driver !== null && !inChat(ctx, c.driver) ? null : c.driver,
				seats: c.seats.map((x) => x !== null && !inChat(ctx, x) ? null : x)
			}))
		};
	},
	invariants: {
		"each person holds at most one spot": (s) => new Set(allIds(s)).size === allIds(s).length,
		"drivers and riders are in the chat": (s, ctx) => allIds(s).every((id) => inChat(ctx, id)),
		"every car keeps its seat count": (s) => s.cars.every((c) => c.seats.length === c.cap && c.cap >= 1),
		"car ids are unique and in order": (s) => s.cars.every((c, i) => c.id === `c${i}`)
	},
	transitions: {
		"a ride puts the actor in the asked open seat and moves no one else": (p, n, a, m) => {
			if (a.t !== "ride" || p === n) return true;
			return p.cars.find((c) => c.id === a.car)?.seats[a.seat] === null && spotOf(n, m.user) === `${a.car}:${a.seat}` && othersSame(p, n, m.user);
		},
		"a drive makes the actor driver of a car that had none and moves no one else": (p, n, a, m) => {
			if (a.t !== "drive" || p === n) return true;
			return p.cars.find((c) => c.id === a.car)?.driver === null && spotOf(n, m.user) === `${a.car}:d` && othersSame(p, n, m.user);
		},
		"a leave empties only the actor's own spot": (p, n, a, m) => {
			if (a.t !== "leave" || p === n) return true;
			return spotOf(p, m.user) !== "" && spotOf(n, m.user) === "" && othersSame(p, n, m.user);
		},
		"no one but the actor changes spot": (p, n, a, m) => p === n || othersSame(p, n, m.user),
		"car names, notes and sizes never change": (p, n) => p.cars.length === n.cars.length && p.cars.every((c, i) => c.id === n.cars[i].id && c.name === n.cars[i].name && c.note === n.cars[i].note && c.cap === n.cars[i].cap),
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		const car = r.pick(s.cars);
		const x = r.next();
		if (x < .12) return { t: "leave" };
		if (x < .3) return {
			t: "drive",
			car: car.id
		};
		if (x < .34) return {
			t: "ride",
			car: car.id,
			seat: car.cap + 2
		};
		const open = car.seats.map((who, i) => who === null ? i : -1).filter((i) => i >= 0);
		const seat = open.length && r.next() < .8 ? open[r.int(open.length)] : r.int(car.cap);
		return user ? {
			t: "ride",
			car: car.id,
			seat
		} : { t: "leave" };
	},
	local: {},
	view: ({ state, me, members, dispatch }) => {
		const nameOf = (id) => members.find((m) => m.id === id)?.name ?? "Someone";
		const placed = members.filter((m) => spotOf(state, m.id) !== "").length;
		const mine = spotOf(state, me) !== "";
		const without = members.filter((m) => spotOf(state, m.id) === "");
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `${placed} of ${members.length} have a ride`
			}),
			/* @__PURE__ */ _jsx("small", { children: state.when }),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 10,
					marginTop: 6
				},
				children: state.cars.map((c) => /* @__PURE__ */ _jsxs("div", { children: [
					/* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							flexWrap: "wrap",
							gap: 8,
							minHeight: 36
						},
						children: [
							/* @__PURE__ */ _jsx("span", {
								style: { fontWeight: 600 },
								children: c.name
							}),
							c.driver === null ? /* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => dispatch({
									t: "drive",
									car: c.id
								}),
								children: "Drive"
							}) : c.driver === me ? /* @__PURE__ */ _jsx(Button, {
								kind: "secondary",
								onClick: () => dispatch({ t: "leave" }),
								children: "You drive"
							}) : /* @__PURE__ */ _jsxs("span", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: 4
								},
								children: [/* @__PURE__ */ _jsx(Avatar, {
									user: c.driver,
									size: 20
								}), /* @__PURE__ */ _jsxs("small", { children: [nameOf(c.driver), " drives"] })]
							}),
							/* @__PURE__ */ _jsxs("small", { children: [
								"· ",
								c.seats.filter((x) => x === null).length,
								" open"
							] })
						]
					}),
					c.note ? /* @__PURE__ */ _jsx("small", { children: c.note }) : null,
					/* @__PURE__ */ _jsx("div", {
						style: {
							display: "flex",
							flexWrap: "wrap",
							alignItems: "center",
							gap: 8
						},
						children: c.seats.map((who, i) => who === null ? /* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							onClick: () => dispatch({
								t: "ride",
								car: c.id,
								seat: i
							}),
							children: "Open"
						}, i) : who === me ? /* @__PURE__ */ _jsx(Button, {
							kind: "secondary",
							onClick: () => dispatch({ t: "leave" }),
							children: "You"
						}, i) : /* @__PURE__ */ _jsxs("span", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 4,
								padding: "0 4px"
							},
							children: [/* @__PURE__ */ _jsx(Avatar, {
								user: who,
								size: 20
							}), /* @__PURE__ */ _jsx("small", { children: nameOf(who) })]
						}, i))
					})
				] }, c.id))
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: { marginTop: 8 },
				children: [without.length ? /* @__PURE__ */ _jsx(SystemLine, { children: `No ride yet: ${without.map((m) => m.id === me ? "you" : m.name).slice(0, 4).join(", ")}` }) : /* @__PURE__ */ _jsx(SystemLine, { children: "Everyone has a ride" }), !mine ? /* @__PURE__ */ _jsx("small", { children: "Tap an open seat to ride" }) : null]
			})
		] });
	}
});
