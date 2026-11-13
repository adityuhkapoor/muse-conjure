import { defineApp, Avatar, Button, CardHeader } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Ride board for lantern fest. Each car has a driver, a departure time and open seats.
// Tap an open seat to take it; taking a new seat frees your old one.
const CHAT = {
	title: "Who's riding to lantern fest?",
	cars: [
		{
			driver: "Lily",
			name: "Lily's Civic",
			leaves: "5:30",
			from: "campus lot B",
			seats: 3,
			riders: ["Mia", "Mina"]
		},
		{
			driver: "Theo",
			name: "Theo's Jeep",
			leaves: "6:15",
			from: "lab until 5:45",
			seats: 4,
			riders: ["Hana"]
		},
		{
			driver: "Nora",
			name: "Nora's car",
			leaves: "6:00",
			from: "the quad",
			seats: 2,
			riders: []
		}
	]
};
const MAX_CARS = 6;
const MAX_SEATS = 8;
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const totalOf = (cars) => cars.reduce((n, c) => n + c.seats.length, 0);
const takenOf = (s) => s.cars.reduce((n, c) => n + c.seats.filter((x) => x !== null).length, 0);
const seatsOf = (s, user) => s.cars.reduce((n, c) => n + c.seats.filter((x) => x === user).length, 0);
const flat = (s) => s.cars.flatMap((c) => c.seats.map((who, i) => ({
	at: `${c.id}:${i}`,
	who
})));
function take(s, user, cid, seat) {
	const car = s.cars.find((c) => c.id === cid);
	if (!car || typeof seat !== "number" || !Number.isInteger(seat) || seat < 0 || seat >= car.seats.length) return s;
	if (car.seats[seat] !== null || car.driver === user) return s;
	return {
		...s,
		cars: s.cars.map((c) => ({
			...c,
			seats: c.seats.map((who, i) => c.id === car.id && i === seat ? user : who === user ? null : who)
		}))
	};
}
function leave(s, user, cid, seat) {
	const car = s.cars.find((c) => c.id === cid);
	if (!car || typeof seat !== "number" || !Number.isInteger(seat) || seat < 0 || seat >= car.seats.length) return s;
	if (car.seats[seat] !== user) return s;
	return {
		...s,
		cars: s.cars.map((c) => c.id === car.id ? {
			...c,
			seats: c.seats.map((who, i) => i === seat ? null : who)
		} : c)
	};
}
const sameShape = (p, n) => p.title === n.title && p.total === n.total && p.cars.length === n.cars.length && p.cars.every((c, i) => {
	const d = n.cars[i];
	return !!d && d.id === c.id && d.driver === c.driver && d.name === c.name && d.leaves === c.leaves && d.from === c.from && d.seats.length === c.seats.length;
});
export default defineApp({
	name: "Ride board",
	summary: (s) => `${s.title} ${takenOf(s)} of ${s.total} seats taken.`,
	init: (ctx) => {
		const list = CHAT.cars.slice(0, MAX_CARS);
		const byName = (name, skip) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase() && !skip.has(m.id))?.id ?? "";
		const matched = list.map((c) => byName(c.driver, new Set()));
		const used = new Set(matched.filter((x) => x !== ""));
		const drivers = matched.map((id) => {
			if (id !== "") return id;
			const spare = ctx.members.find((m) => !used.has(m.id))?.id ?? "";
			if (spare !== "") used.add(spare);
			return spare;
		});
		const seated = new Set();
		const cars = list.map((c, i) => {
			const seats = Array.from({ length: Math.max(1, Math.min(MAX_SEATS, Math.floor(c.seats) || 1)) }, () => null);
			for (const rider of c.riders) {
				const id = byName(rider, new Set());
				const slot = seats.indexOf(null);
				if (id === "" || id === drivers[i] || seated.has(id) || slot < 0) continue;
				seats[slot] = id;
				seated.add(id);
			}
			return {
				id: `g${i}`,
				driver: drivers[i] ?? "",
				name: c.name.trim().slice(0, 30) || "Car",
				leaves: c.leaves.trim().slice(0, 20) || "Time to be set",
				from: c.from.trim().slice(0, 30),
				seats
			};
		});
		return {
			title: CHAT.title.trim().slice(0, 60) || "Ride board",
			total: totalOf(cars),
			cars
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "take") return take(state, meta.user, action.car, action.seat);
		if (action.t === "leave") return leave(state, meta.user, action.car, action.seat);
		return state;
	},
	// A passenger who left frees their seat. A driver who left takes the car off the board.
	onMembers: (state, ctx) => {
		const ok = (id) => inChat(ctx, id);
		const dirty = state.cars.some((c) => c.driver !== "" && !ok(c.driver) || c.seats.some((x) => x !== null && !ok(x)));
		if (!dirty) return state;
		const cars = state.cars.filter((c) => c.driver === "" || ok(c.driver)).map((c) => ({
			...c,
			seats: c.seats.map((x) => x !== null && !ok(x) ? null : x)
		}));
		return {
			...state,
			cars,
			total: totalOf(cars)
		};
	},
	invariants: {
		"each person holds at most one seat": (s) => {
			const held = s.cars.flatMap((c) => c.seats).filter((x) => x !== null);
			return new Set(held).size === held.length;
		},
		"passengers and drivers are in the chat": (s, ctx) => s.cars.every((c) => (c.driver === "" || inChat(ctx, c.driver)) && c.seats.every((x) => x === null || inChat(ctx, x))),
		"no driver sits in their own car": (s) => s.cars.every((c) => c.driver === "" || !c.seats.includes(c.driver)),
		"total equals the seats across all cars": (s) => s.total === totalOf(s.cars),
		"car ids are unique and each car has a departure time": (s) => new Set(s.cars.map((c) => c.id)).size === s.cars.length && s.cars.every((c) => c.leaves.length > 0 && c.seats.length >= 1)
	},
	transitions: {
		"a take puts the actor in that empty seat, frees only their old seat, and never seats a driver in their own car": (p, n, a, m) => {
			if (a.t !== "take" || p === n) return true;
			const before = flat(p);
			const after = flat(n);
			const key = `${a.car}:${a.seat}`;
			const car = p.cars.find((c) => c.id === a.car);
			return !!car && car.driver !== m.user && before.length === after.length && before.find((x) => x.at === key)?.who === null && after.find((x) => x.at === key)?.who === m.user && before.every((x, i) => x.at === key || after[i]?.who === x.who || x.who === m.user && after[i]?.who === null);
		},
		"a leave empties the actor's own seat and nothing else": (p, n, a, m) => {
			if (a.t !== "leave" || p === n) return true;
			const before = flat(p);
			const after = flat(n);
			const key = `${a.car}:${a.seat}`;
			return before.length === after.length && before.find((x) => x.at === key)?.who === m.user && after.find((x) => x.at === key)?.who === null && before.every((x, i) => x.at === key || after[i]?.who === x.who);
		},
		"cars, drivers, times and seat counts never change from an action": (p, n) => p === n || sameShape(p, n),
		"an action changes at most one person's seat": (p, n, _a, m) => {
			if (p === n) return true;
			const before = flat(p);
			const after = flat(n);
			return before.every((x, i) => after[i]?.who === x.who || x.who === m.user || x.who === null || after[i]?.who === null);
		},
		"only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		if (s.cars.length === 0) return null;
		const c = r.pick(s.cars);
		const mine = c.seats.indexOf(user);
		if (mine >= 0 && r.next() < .3) return {
			t: "leave",
			car: c.id,
			seat: mine
		};
		if (r.next() < .1) return {
			t: "leave",
			car: c.id,
			seat: r.int(c.seats.length + 1)
		};
		return {
			t: "take",
			car: c.id,
			seat: r.int(c.seats.length + 1)
		};
	},
	local: {},
	view: ({ state, me, members, dispatch }) => {
		const nameOf = (id) => id === me ? "You" : members.find((m) => m.id === id)?.name ?? "Someone";
		const driverIds = new Set(state.cars.map((c) => c.driver));
		const unseated = members.filter((m) => !driverIds.has(m.id) && seatsOf(state, m.id) === 0);
		const names = unseated.slice(0, 4).map((m) => m.id === me ? "you" : m.name);
		const more = unseated.length > 4 ? ` +${unseated.length - 4}` : "";
		const clip = {
			overflow: "hidden",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap"
		};
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: seatsOf(state, me) ? "Tap your seat to leave it" : `${takenOf(state)} of ${state.total} seats taken`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 8
				},
				children: state.cars.map((c) => {
					const open = c.seats.filter((x) => x === null).length;
					const line = [
						`Leaves ${c.leaves}`,
						c.from,
						`${open} open`
					].filter((x) => x.length > 0).join(" · ");
					return /* @__PURE__ */ _jsxs("div", { children: [
						/* @__PURE__ */ _jsxs("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 6,
								fontWeight: 600
							},
							children: [c.driver ? /* @__PURE__ */ _jsx(Avatar, {
								user: c.driver,
								size: 20
							}) : null, /* @__PURE__ */ _jsx("span", {
								style: clip,
								children: c.name
							})]
						}),
						/* @__PURE__ */ _jsx("small", {
							style: {
								display: "block",
								...clip
							},
							children: line
						}),
						/* @__PURE__ */ _jsx("div", {
							style: {
								display: "flex",
								flexWrap: "wrap",
								gap: 4
							},
							children: c.seats.map((who, i) => who === null ? c.driver === me ? /* @__PURE__ */ _jsx("div", {
								style: {
									display: "flex",
									alignItems: "center",
									minHeight: 44,
									padding: "0 8px"
								},
								children: /* @__PURE__ */ _jsx("small", { children: "Open" })
							}, i) : /* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => dispatch({
									t: "take",
									car: c.id,
									seat: i
								}),
								children: "Take"
							}, i) : who === me ? /* @__PURE__ */ _jsx(Button, {
								kind: "primary",
								onClick: () => dispatch({
									t: "leave",
									car: c.id,
									seat: i
								}),
								children: "You"
							}, i) : /* @__PURE__ */ _jsxs("div", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: 4,
									minHeight: 44,
									padding: "0 8px"
								},
								children: [/* @__PURE__ */ _jsx(Avatar, {
									user: who,
									size: 24
								}), /* @__PURE__ */ _jsx("small", {
									style: {
										maxWidth: 72,
										...clip
									},
									children: nameOf(who)
								})]
							}, i))
						})
					] }, c.id);
				})
			}),
			/* @__PURE__ */ _jsx("small", {
				style: {
					display: "block",
					marginTop: 8,
					...clip
				},
				children: unseated.length ? `No seat yet: ${names.join(", ")}${more}` : "Everyone has a seat"
			})
		] });
	}
});
