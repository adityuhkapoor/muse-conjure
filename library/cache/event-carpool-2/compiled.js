import { defineApp, Avatar, Button, CardHeader, SystemLine } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Ride sorter: two cars, tap an open seat to take it. Owen can reserve a guest seat for his roommate.
const CHAT = {
	title: "Who's riding with who?",
	cars: [{
		id: "c0",
		name: "Bryan's minivan",
		driverName: "Bryan",
		fallback: 0,
		seats: 5,
		leaves: "11:10",
		note: "dining hall, donuts on the way"
	}, {
		id: "c1",
		name: "Luis's Corolla",
		driverName: "Luis",
		fallback: 1,
		seats: 3,
		leaves: "12:30",
		note: ""
	}]
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const isGuest = (x) => typeof x === "string" && x.startsWith("g:");
const count = (s, v) => s.cars.reduce((n, c) => n + c.seats.filter((x) => x === v).length, 0);
const flat = (s) => s.cars.flatMap((c) => c.seats.map((who, i) => ({
	at: `${c.id}:${i}`,
	who
})));
const validSeat = (c, seat) => typeof seat === "number" && Number.isInteger(seat) && seat >= 0 && seat < c.seats.length;
const holders = (cars) => cars.flatMap((c) => c.seats).filter((x) => x !== null).sort().join(",");
const withRiders = (s) => ({
	...s,
	riders: s.cars.flatMap((c) => c.seats).filter((x) => x !== null)
});
function take(s, user, carId, seat) {
	const c = s.cars.find((x) => x.id === carId);
	if (!c || !validSeat(c, seat)) return s;
	if (c.seats[seat] !== null || c.driver === user) return s;
	return {
		...s,
		cars: s.cars.map((x) => ({
			...x,
			seats: x.seats.map((w, i) => x.id === c.id && i === seat ? user : w === user ? null : w)
		}))
	};
}
function setSeat(s, carId, seat, from, to) {
	const c = s.cars.find((x) => x.id === carId);
	if (!c || !validSeat(c, seat) || c.seats[seat] !== from) return s;
	return {
		...s,
		cars: s.cars.map((x) => x.id === c.id ? {
			...x,
			seats: x.seats.map((w, i) => i === seat ? to : w)
		} : x)
	};
}
const takenCount = (s) => s.cars.reduce((n, c) => n + c.seats.filter((x) => x !== null).length, 0);
const totalSeats = (s) => s.cars.reduce((n, c) => n + c.seats.length, 0);
export default defineApp({
	name: "Ride sorter",
	summary: (s) => `${s.title} ${takenCount(s)} of ${totalSeats(s)} seats taken.`,
	init: (ctx) => ({
		title: CHAT.title,
		riders: [],
		cars: CHAT.cars.map((c) => ({
			id: c.id,
			name: c.name,
			driver: ctx.members.find((m) => m.name.toLowerCase() === c.driverName.toLowerCase())?.id ?? ctx.members[c.fallback]?.id ?? ctx.members[0]?.id ?? "",
			leaves: c.leaves,
			note: c.note,
			seats: Array.from({ length: c.seats }, () => null)
		}))
	}),
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		let next = state;
		if (action.t === "take") next = take(state, meta.user, action.car, action.seat);
		else if (action.t === "leave") next = setSeat(state, action.car, action.seat, meta.user, null);
		else if (action.t === "guest") {
			if (count(state, `g:${meta.user}`) > 0) return state;
			next = setSeat(state, action.car, action.seat, null, `g:${meta.user}`);
		} else if (action.t === "dropGuest") next = setSeat(state, action.car, action.seat, `g:${meta.user}`, null);
		return next === state ? state : withRiders(next);
	},
	onMembers: (state, ctx) => {
		const ok = (x) => x === null || (isGuest(x) ? inChat(ctx, x.slice(2)) : inChat(ctx, x));
		const fine = state.cars.every((c) => (c.driver === "" || inChat(ctx, c.driver)) && c.seats.every(ok));
		if (fine) return state;
		return {
			...state,
			riders: state.riders.filter((r) => r.startsWith("g:") ? inChat(ctx, r.slice(2)) : inChat(ctx, r)),
			cars: state.cars.map((c) => ({
				...c,
				driver: c.driver === "" || inChat(ctx, c.driver) ? c.driver : "",
				seats: c.seats.map((x) => ok(x) ? x : null)
			}))
		};
	},
	invariants: {
		"each person holds at most one rider seat": (s, ctx) => ctx.members.every((m) => count(s, m.id) <= 1),
		"each person has at most one guest seat": (s, ctx) => ctx.members.every((m) => count(s, `g:${m.id}`) <= 1),
		"cars and seat counts match the plan": (s) => s.cars.length === CHAT.cars.length && s.cars.every((c, i) => c.id === CHAT.cars[i].id && c.seats.length === CHAT.cars[i].seats) && new Set(s.cars.map((c) => c.id)).size === s.cars.length,
		"seat holders and guest hosts are in the chat": (s, ctx) => s.cars.every((c) => c.seats.every((x) => x === null || (isGuest(x) ? inChat(ctx, x.slice(2)) : inChat(ctx, x)))),
		"a driver is in the chat and does not ride in their own car": (s, ctx) => s.cars.every((c) => (c.driver === "" || inChat(ctx, c.driver)) && !c.seats.includes(c.driver === "" ? "\0" : c.driver)),
		"the rider list matches who holds seats": (s) => [...s.riders].sort().join(",") === holders(s.cars)
	},
	transitions: {
		"a take puts the actor in that open seat, frees only their old seat, and moves no one else": (p, n, a, m) => {
			if (a.t !== "take" || p === n) return true;
			const before = flat(p);
			const after = flat(n);
			const key = `${a.car}:${a.seat}`;
			return before.find((x) => x.at === key)?.who === null && after.find((x) => x.at === key)?.who === m.user && p.cars.find((c) => c.id === a.car)?.driver !== m.user && before.every((x, i) => x.at === key || after[i].who === x.who || x.who === m.user && after[i].who === null);
		},
		"a leave empties only the actor's own seat": (p, n, a, m) => {
			if (a.t !== "leave" || p === n) return true;
			const before = flat(p);
			const after = flat(n);
			const key = `${a.car}:${a.seat}`;
			return before.find((x) => x.at === key)?.who === m.user && after.find((x) => x.at === key)?.who === null && before.every((x, i) => x.at === key || after[i].who === x.who);
		},
		"a guest fills one open seat with the actor's guest mark and moves no one else": (p, n, a, m) => {
			if (a.t !== "guest" || p === n) return true;
			const before = flat(p);
			const after = flat(n);
			const key = `${a.car}:${a.seat}`;
			return before.find((x) => x.at === key)?.who === null && after.find((x) => x.at === key)?.who === `g:${m.user}` && before.every((x, i) => x.at === key || after[i].who === x.who);
		},
		"a drop empties only a guest seat the actor added": (p, n, a, m) => {
			if (a.t !== "dropGuest" || p === n) return true;
			const before = flat(p);
			const after = flat(n);
			const key = `${a.car}:${a.seat}`;
			return before.find((x) => x.at === key)?.who === `g:${m.user}` && after.find((x) => x.at === key)?.who === null && before.every((x, i) => x.at === key || after[i].who === x.who);
		},
		"cars, drivers, times and seat counts never change in a step": (p, n) => p.title === n.title && p.cars.length === n.cars.length && p.cars.every((c, i) => {
			const d = n.cars[i];
			return c.id === d.id && c.name === d.name && c.driver === d.driver && c.leaves === d.leaves && c.note === d.note && c.seats.length === d.seats.length;
		}),
		"only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		const c = r.pick(s.cars);
		const mine = c.seats.indexOf(user);
		const guest = c.seats.indexOf(`g:${user}`);
		const x = r.next();
		if (mine >= 0 && x < .2) return {
			t: "leave",
			car: c.id,
			seat: mine
		};
		if (guest >= 0 && x < .35) return {
			t: "dropGuest",
			car: c.id,
			seat: guest
		};
		if (x < .5) return {
			t: "guest",
			car: c.id,
			seat: r.int(c.seats.length)
		};
		return {
			t: "take",
			car: c.id,
			seat: r.int(c.seats.length + 1)
		};
	},
	local: { guest: false },
	view: ({ state, me, members, dispatch, local, setLocal }) => {
		const nameOf = (id) => members.find((m) => m.id === id)?.name ?? "Someone";
		const taken = takenCount(state);
		const total = totalSeats(state);
		const myCar = state.cars.find((c) => c.seats.includes(me));
		const hasGuest = count(state, `g:${me}`) > 0;
		const anyOpen = taken < total;
		const drivers = state.cars.map((c) => c.driver);
		const unseated = members.filter((m) => count(state, m.id) === 0 && !drivers.includes(m.id));
		const sub = `${taken} of ${total} seats taken${myCar ? ` · you're in ${myCar.name}` : ""}`;
		const onSeat = (zone, i) => {
			const car = state.cars.find((c) => c.id === zone);
			if (!car) return;
			const v = car.seats[i] ?? null;
			if (v === null) {
				if (local.guest) dispatch({
					t: "guest",
					car: car.id,
					seat: i
				});
				else dispatch({
					t: "take",
					car: car.id,
					seat: i
				});
				setLocal({ guest: false });
			} else if (v === me) dispatch({
				t: "leave",
				car: car.id,
				seat: i
			});
			else if (v === `g:${me}`) dispatch({
				t: "dropGuest",
				car: car.id,
				seat: i
			});
		};
		const status = local.guest ? "Tap an open seat for your guest" : unseated.length ? `No seat yet: ${unseated.map((m) => m.id === me ? "you" : m.name).slice(0, 4).join(", ")}` : "Everyone has a seat";
		const guests = state.cars.flatMap((c) => c.seats.filter(isGuest).map((x) => nameOf(x.slice(2))));
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: sub
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 8
				},
				children: state.cars.map((c) => /* @__PURE__ */ _jsxs("div", { children: [
					/* @__PURE__ */ _jsx("div", {
						style: {
							fontWeight: 600,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap"
						},
						children: c.name
					}),
					/* @__PURE__ */ _jsx("small", {
						style: {
							display: "block",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap"
						},
						children: [`leaves ${c.leaves}`, c.note].filter(Boolean).join(" · ")
					}),
					/* @__PURE__ */ _jsx("div", {
						style: {
							display: "flex",
							flexWrap: "wrap",
							gap: 6,
							marginTop: 4
						},
						children: c.seats.map((x, i) => x === null ? /* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							onClick: () => onSeat(c.id, i),
							children: "Open"
						}, i) : x === me ? /* @__PURE__ */ _jsx(Button, {
							kind: "primary",
							onClick: () => onSeat(c.id, i),
							children: "You"
						}, i) : x === `g:${me}` ? /* @__PURE__ */ _jsx(Button, {
							kind: "secondary",
							onClick: () => onSeat(c.id, i),
							children: "Guest"
						}, i) : /* @__PURE__ */ _jsxs("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 4,
								minHeight: 44,
								padding: "0 4px",
								maxWidth: 140
							},
							children: [/* @__PURE__ */ _jsx(Avatar, {
								user: isGuest(x) ? x.slice(2) : x,
								size: 24
							}), /* @__PURE__ */ _jsx("small", {
								style: {
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap"
								},
								children: isGuest(x) ? `${nameOf(x.slice(2))}'s guest` : nameOf(x)
							})]
						}, i))
					})
				] }, c.id))
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginTop: 4
				},
				children: [/* @__PURE__ */ _jsx("div", {
					style: {
						flex: 1,
						minWidth: 0
					},
					children: /* @__PURE__ */ _jsx(SystemLine, { children: guests.length && !local.guest ? `${status} · guests: ${guests.map((g) => `${g}'s`).join(", ")}` : status })
				}), /* @__PURE__ */ _jsx(Button, {
					kind: "secondary",
					disabled: !local.guest && (hasGuest || !anyOpen),
					onClick: () => setLocal({ guest: !local.guest }),
					children: local.guest ? "Cancel" : "Add guest"
				})]
			})
		] });
	}
});
