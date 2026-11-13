import { defineApp, Avatar, Button, CardHeader } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
const CHAT = {
	title: "Who's riding to Columbus?",
	leaving: "8am from the quad",
	cars: [
		{
			name: "Rhea's Subaru",
			driver: "rhea",
			seats: 4
		},
		{
			name: "Sam's Civic",
			driver: "sam",
			seats: 3
		},
		{
			name: "Jake's minivan",
			driver: "jake",
			seats: 6
		}
	]
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const flat = (s) => s.cars.flatMap((c) => c.seats.map((who, i) => ({
	at: `${c.id}:${i}`,
	who
})));
const holders = (s) => flat(s).filter((x) => x.who !== null).map((x) => x.who);
const drivers = (s) => s.cars.map((c) => c.id + "=" + (c.driver ?? "")).join("|");
const fixed = (s) => s.title + "|" + s.total + "|" + s.cars.map((c) => c.id + c.name + c.seats.length).join("|") + "|" + drivers(s);
const isDriver = (s, user) => s.cars.some((c) => c.driver === user);
function take(s, user, cid, seat) {
	if (isDriver(s, user)) return s;
	const car = s.cars.find((c) => c.id === cid);
	if (!car || typeof seat !== "number" || !Number.isInteger(seat) || seat < 0 || seat >= car.seats.length) return s;
	if (car.seats[seat] !== null) return s;
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
	if (seat === 0 && car.driver !== null) return s;
	return {
		...s,
		cars: s.cars.map((c) => c.id === car.id ? {
			...c,
			seats: c.seats.map((who, i) => i === seat ? null : who)
		} : c)
	};
}
export default defineApp({
	name: "Car seats",
	summary: (s) => `${s.title} ${holders(s).length} of ${s.total} seats taken.`,
	init: (ctx) => {
		const cars = CHAT.cars.map((c, i) => {
			const driver = ctx.members.find((m) => m.name.trim().toLowerCase().split(" ")[0] === c.driver)?.id ?? null;
			const n = Math.max(1, Math.min(8, Math.floor(c.seats)));
			return {
				id: `c${i}`,
				name: c.name,
				driver,
				seats: Array.from({ length: n }, (_, k) => k === 0 ? driver : null)
			};
		});
		return {
			title: CHAT.title,
			total: cars.reduce((n, c) => n + c.seats.length, 0),
			cars
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "take") return take(state, meta.user, action.car, action.seat);
		if (action.t === "leave") return leave(state, meta.user, action.car, action.seat);
		return state;
	},
	onMembers: (state, ctx) => {
		const ok = state.cars.every((c) => (c.driver === null || inChat(ctx, c.driver)) && c.seats.every((x) => x === null || inChat(ctx, x)));
		if (ok) return state;
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
		"each person holds at most one seat": (s) => new Set(holders(s)).size === holders(s).length,
		"the number of seats never changes": (s) => s.cars.reduce((n, c) => n + c.seats.length, 0) === s.total,
		"seat holders are in the chat": (s, ctx) => s.cars.every((c) => c.seats.every((x) => x === null || inChat(ctx, x))),
		"a driver is in the chat and holds seat 0 of their car": (s, ctx) => s.cars.every((c) => c.driver === null || inChat(ctx, c.driver) && c.seats[0] === c.driver),
		"car ids are unique and each car has 1 to 8 seats": (s) => new Set(s.cars.map((c) => c.id)).size === s.cars.length && s.cars.every((c) => c.seats.length >= 1 && c.seats.length <= 8)
	},
	transitions: {
		"a take fills the chosen open seat with the actor and frees only the actor's old seat": (p, n, a, m) => {
			if (a.t !== "take" || p === n) return true;
			const before = flat(p);
			const after = flat(n);
			const key = `${a.car}:${a.seat}`;
			return !isDriver(p, m.user) && before.find((x) => x.at === key)?.who === null && after.find((x) => x.at === key)?.who === m.user && before.every((x, i) => x.at === key || after[i].who === x.who || x.who === m.user && after[i].who === null);
		},
		"a leave empties only the actor's own seat": (p, n, a, m) => {
			if (a.t !== "leave" || p === n) return true;
			const before = flat(p);
			const after = flat(n);
			const key = `${a.car}:${a.seat}`;
			return before.find((x) => x.at === key)?.who === m.user && after.find((x) => x.at === key)?.who === null && before.every((x, i) => x.at === key || after[i].who === x.who);
		},
		"a driver never loses their own seat": (p, n, a) => a.t !== "take" && a.t !== "leave" || n.cars.every((c) => c.driver === null || c.seats[0] === c.driver),
		"take and leave never change cars, drivers, title or total": (p, n, a) => a.t !== "take" && a.t !== "leave" || fixed(p) === fixed(n),
		"only people in the chat change a seat": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		const c = r.pick(s.cars);
		const mine = c.seats.indexOf(user);
		if (mine >= 0 && r.next() < .3) return {
			t: "leave",
			car: c.id,
			seat: mine
		};
		if (r.next() < .05) return {
			t: "take",
			car: c.id,
			seat: c.seats.length + 2
		};
		return {
			t: "take",
			car: c.id,
			seat: r.int(c.seats.length)
		};
	},
	local: {},
	view: ({ state, me, members, dispatch }) => {
		const nameOf = (id) => id === me ? "You" : (members.find((x) => x.id === id)?.name ?? "Someone").split(" ")[0];
		const open = state.cars.reduce((n, c) => n + c.seats.filter((x) => x === null).length, 0);
		const unseated = members.filter((x) => !state.cars.some((c) => c.seats.includes(x.id)));
		const shown = unseated.slice(0, 3).map((x) => x.id === me ? "you" : x.name.split(" ")[0]);
		const more = unseated.length - shown.length;
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `${open} open · ${CHAT.leaving}`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 8
				},
				children: state.cars.map((c) => /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsxs("div", {
					style: {
						fontWeight: 600,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap"
					},
					children: [
						c.name,
						" ",
						/* @__PURE__ */ _jsxs("small", { children: [
							"· ",
							c.seats.filter((x) => x === null).length,
							" open"
						] })
					]
				}), /* @__PURE__ */ _jsx("div", {
					style: {
						display: "grid",
						gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
						gap: 4
					},
					children: c.seats.map((who, i) => who === null ? /* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						wide: true,
						onClick: () => dispatch({
							t: "take",
							car: c.id,
							seat: i
						}),
						children: "Open"
					}, i) : who === me && !(i === 0 && c.driver !== null) ? /* @__PURE__ */ _jsx(Button, {
						kind: "primary",
						wide: true,
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
							minWidth: 0,
							overflow: "hidden"
						},
						children: [/* @__PURE__ */ _jsx(Avatar, {
							user: who,
							size: 24
						}), /* @__PURE__ */ _jsx("small", {
							style: {
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
								minWidth: 0
							},
							children: nameOf(who)
						})]
					}, i))
				})] }, c.id))
			}),
			/* @__PURE__ */ _jsx("div", {
				style: { marginTop: 4 },
				children: /* @__PURE__ */ _jsx("small", { children: unseated.length === 0 ? "Everyone has a seat" : `No seat yet: ${shown.join(", ")}${more > 0 ? ` +${more}` : ""}` })
			})
		] });
	}
});
