import { defineApp, Avatar, Button, CardHeader, Facepile } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Rent split for the den apartment: each room's rent plus an equal share of utilities, in cents.
const CHAT = {
	title: "What each of us owes",
	rentCents: 19e4,
	utilsCents: 14e3,
	step: 5e3,
	rooms: [
		{
			name: "Big room",
			cents: 9e4,
			people: ["Noor", "Sam"]
		},
		{
			name: "Priya's room",
			cents: 6e4,
			people: ["Priya"]
		},
		{
			name: "The den",
			cents: 4e4,
			people: ["Rhea"]
		}
	],
	payers: [
		"Sam",
		"Noor",
		"Priya",
		"Rhea"
	]
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const rest = (xs, u) => xs.filter((x) => x !== u).join();
const money = (c) => {
	const a = Math.abs(c);
	const d = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	const r = a % 100;
	return `$${d}${r ? "." + String(r).padStart(2, "0") : ""}`;
};
/** Split cents across people; the first `cents % n` people pay one cent more. */
function split(cents, people) {
	const n = people.length;
	if (n === 0) return [];
	const base = Math.floor(cents / n);
	const extra = cents % n;
	return people.map((u, i) => [u, base + (i < extra ? 1 : 0)]);
}
function owed(s) {
	const out = {};
	const get = (u) => out[u] ??= {
		room: 0,
		util: 0
	};
	for (const r of s.rooms) for (const [u, c] of split(r.cents, r.people)) get(u).room += c;
	for (const [u, c] of split(s.utilsTotal, s.payers)) get(u).util += c;
	return out;
}
const totalOwed = (s) => Object.values(owed(s)).reduce((a, o) => a + o.room + o.util, 0);
const expectedOwed = (s) => s.rooms.reduce((a, r) => a + (r.people.length ? r.cents : 0), 0) + (s.payers.length ? s.utilsTotal : 0);
const peopleOf = (s) => [...new Set([...s.rooms.flatMap((r) => r.people), ...s.payers])];
const sameRooms = (p, n) => p.rooms.length === n.rooms.length && p.rooms.every((r, i) => n.rooms[i].id === r.id && n.rooms[i].cents === r.cents && n.rooms[i].people.join() === r.people.join());
export default defineApp({
	name: "Rent split",
	summary: (s) => `${CHAT.title}: ${peopleOf(s).length} people · ${money(totalOwed(s))}`,
	init: (ctx) => {
		const find = (name) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id ?? null;
		const used = new Set();
		const rooms = CHAT.rooms.map((r, i) => {
			const people = [];
			for (const name of r.people) {
				const id = find(name);
				if (id !== null && !used.has(id)) {
					used.add(id);
					people.push(id);
				}
			}
			return {
				id: `r${i}`,
				name: r.name,
				cents: r.cents,
				people
			};
		});
		const payers = [...new Set(CHAT.payers.map(find).filter((x) => x !== null))];
		return {
			rentTotal: CHAT.rentCents,
			utilsTotal: CHAT.utilsCents,
			rooms,
			payers,
			at: 0
		};
	},
	reduce: (s, a, m, ctx) => {
		if (!inChat(ctx, m.user)) return s;
		const u = m.user;
		switch (a.t) {
			case "shift": {
				const f = s.rooms.find((r) => r.id === a.from);
				const t = s.rooms.find((r) => r.id === a.to);
				if (!f || !t || f.id === t.id) return s;
				if (typeof a.cents !== "number" || !Number.isInteger(a.cents) || a.cents <= 0 || a.cents > f.cents) return s;
				const c = a.cents;
				return {
					...s,
					at: m.time,
					rooms: s.rooms.map((r) => r.id === f.id ? {
						...r,
						cents: r.cents - c
					} : r.id === t.id ? {
						...r,
						cents: r.cents + c
					} : r)
				};
			}
			case "join": {
				if (typeof a.room !== "string" || !s.rooms.some((r) => r.id === a.room)) return s;
				const already = s.rooms.every((r) => r.id === a.room === r.people.includes(u)) && s.payers.includes(u);
				if (already) return s;
				return {
					...s,
					at: m.time,
					rooms: s.rooms.map((r) => r.id === a.room ? r.people.includes(u) ? r : {
						...r,
						people: [...r.people, u]
					} : r.people.includes(u) ? {
						...r,
						people: r.people.filter((x) => x !== u)
					} : r),
					payers: s.payers.includes(u) ? s.payers : [...s.payers, u]
				};
			}
			case "leave": {
				if (typeof a.room !== "string") return s;
				const room = s.rooms.find((r) => r.id === a.room);
				if (!room || !room.people.includes(u)) return s;
				return {
					...s,
					at: m.time,
					rooms: s.rooms.map((r) => r.id === room.id ? {
						...r,
						people: r.people.filter((x) => x !== u)
					} : r)
				};
			}
			case "utils": return {
				...s,
				at: m.time,
				payers: s.payers.includes(u) ? s.payers.filter((x) => x !== u) : [...s.payers, u]
			};
		}
		return s;
	},
	// Someone left: they come out of their room and off the utilities split.
	onMembers: (s, ctx) => {
		const ok = (u) => inChat(ctx, u);
		if (s.rooms.every((r) => r.people.every(ok)) && s.payers.every(ok)) return s;
		return {
			...s,
			rooms: s.rooms.map((r) => r.people.every(ok) ? r : {
				...r,
				people: r.people.filter(ok)
			}),
			payers: s.payers.filter(ok)
		};
	},
	invariants: {
		"room rents are whole, not negative, and add up to the rent": (s) => s.rooms.every((r) => Number.isInteger(r.cents) && r.cents >= 0) && s.rooms.reduce((a, r) => a + r.cents, 0) === s.rentTotal,
		"rent and utilities are the amounts from the chat": (s) => s.rentTotal === CHAT.rentCents && s.utilsTotal === CHAT.utilsCents && s.rooms.length === CHAT.rooms.length,
		"everyone in a room or on utilities is in the chat": (s, ctx) => s.rooms.every((r) => r.people.every((u) => inChat(ctx, u))) && s.payers.every((u) => inChat(ctx, u)),
		"no one is in two rooms, twice in a room, or twice on utilities": (s) => {
			const flat = s.rooms.flatMap((r) => r.people);
			return new Set(flat).size === flat.length && new Set(s.payers).size === s.payers.length;
		},
		"what everyone owes adds up to the rent of rooms with people plus utilities": (s) => totalOwed(s) === expectedOwed(s)
	},
	transitions: {
		"a shift moves exactly the cents asked from one room to another": (p, n, a) => a.t !== "shift" || p === n || n.rooms.length === p.rooms.length && p.rooms.every((r, i) => n.rooms[i].id === r.id && n.rooms[i].people.join() === r.people.join() && n.rooms[i].cents === r.cents + (r.id === a.from ? -a.cents : r.id === a.to ? a.cents : 0)) && p.payers.join() === n.payers.join(),
		"a join puts the actor in that room only and on utilities, and moves no one else": (p, n, a, m) => a.t !== "join" || p === n || n.rooms.length === p.rooms.length && n.rooms.every((r, i) => {
			const q = p.rooms[i];
			return r.id === q.id && r.cents === q.cents && rest(r.people, m.user) === rest(q.people, m.user) && r.people.includes(m.user) === (r.id === a.room);
		}) && n.payers.includes(m.user) && rest(n.payers, m.user) === rest(p.payers, m.user),
		"a leave removes only the actor from only that room": (p, n, a, m) => a.t !== "leave" || p === n || n.rooms.length === p.rooms.length && n.rooms.every((r, i) => {
			const q = p.rooms[i];
			if (r.id !== q.id || r.cents !== q.cents) return false;
			return r.id === a.room ? q.people.includes(m.user) && r.people.join() === q.people.filter((x) => x !== m.user).join() : r.people.join() === q.people.join();
		}) && p.payers.join() === n.payers.join(),
		"a utilities toggle flips only the actor and changes no room": (p, n, a, m) => a.t !== "utils" || p === n || sameRooms(p, n) && p.payers.includes(m.user) !== n.payers.includes(m.user) && rest(p.payers, m.user) === rest(n.payers, m.user),
		"the rent and utilities totals never change": (p, n) => p.rentTotal === n.rentTotal && p.utilsTotal === n.utilsTotal,
		"a change records its time": (p, n, a, m) => p === n || n.at === m.time,
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		const k = r.next();
		if (k < .3) return {
			t: "shift",
			from: r.pick(s.rooms).id,
			to: r.pick(s.rooms).id,
			cents: (r.int(10) + 1) * 2500
		};
		if (k < .6) return {
			t: "join",
			room: r.pick(s.rooms).id
		};
		if (k < .8) return {
			t: "leave",
			room: (s.rooms.find((x) => x.people.includes(user)) ?? r.pick(s.rooms)).id
		};
		return { t: "utils" };
	},
	local: {
		open: false,
		from: ""
	},
	view: ({ state, me, members, dispatch, local, setLocal, theme }) => {
		const owe = owed(state);
		const nameOf = (id) => id === me ? "You" : members.find((m) => m.id === id)?.name ?? "Someone";
		const people = peopleOf(state);
		const total = totalOwed(state);
		const target = state.rentTotal + state.utilsTotal;
		const from = state.rooms.find((r) => r.id === local.from) ?? state.rooms[0];
		const mine = state.rooms.find((r) => r.people.includes(me));
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: CHAT.title,
				subtitle: `${people.length} people · ${money(total)} · tap a room to move in`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
					gap: 8
				},
				children: state.rooms.map((r) => {
					const here = r.people.includes(me);
					return /* @__PURE__ */ _jsxs("div", {
						onClick: () => dispatch({
							t: "join",
							room: r.id
						}),
						style: {
							minWidth: 0,
							minHeight: 96,
							padding: 8,
							display: "flex",
							flexDirection: "column",
							gap: 4,
							borderRadius: theme.radius.card,
							background: theme.color.input,
							border: `${here ? 2 : 1}px ${r.people.length ? "solid" : "dashed"} ${here ? theme.color.primary : theme.color.divider}`
						},
						children: [
							/* @__PURE__ */ _jsx("small", {
								style: { fontWeight: 600 },
								children: r.name
							}),
							/* @__PURE__ */ _jsx("div", {
								style: {
									fontWeight: 600,
									fontSize: theme.type.title
								},
								children: money(r.cents)
							}),
							r.people.length ? /* @__PURE__ */ _jsx(Facepile, {
								users: r.people,
								max: 3,
								size: 24
							}) : /* @__PURE__ */ _jsx("small", { children: "Empty" })
						]
					}, r.id);
				})
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 4,
					marginTop: 8
				},
				children: [people.length === 0 ? /* @__PURE__ */ _jsx("small", { children: "No one is in a room yet" }) : null, people.map((u) => {
					const o = owe[u] ?? {
						room: 0,
						util: 0
					};
					const parts = [o.room ? `room ${money(o.room)}` : "", o.util ? `utils ${money(o.util)}` : ""].filter(Boolean).join(" · ");
					return /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: 32
						},
						children: [
							/* @__PURE__ */ _jsx(Avatar, {
								user: u,
								size: 24
							}),
							/* @__PURE__ */ _jsx("div", {
								style: {
									flex: 1,
									minWidth: 0,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
									fontWeight: 600
								},
								children: nameOf(u)
							}),
							/* @__PURE__ */ _jsx("small", {
								style: { whiteSpace: "nowrap" },
								children: parts
							}),
							/* @__PURE__ */ _jsx("div", {
								style: {
									fontWeight: 600,
									whiteSpace: "nowrap"
								},
								children: money(o.room + o.util)
							})
						]
					}, u);
				})]
			}),
			/* @__PURE__ */ _jsx("small", {
				style: {
					display: "block",
					marginTop: 8,
					fontWeight: 600
				},
				children: total === target ? `Adds up · ${money(total)} = ${money(state.rentTotal)} + ${money(state.utilsTotal)}` : `Off by ${money(target - total)}`
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: { marginTop: 8 },
				children: [/* @__PURE__ */ _jsx(Button, {
					kind: "deemphasized",
					onClick: () => setLocal({ open: !local.open }),
					children: local.open ? "Hide" : "Adjust"
				}), local.open ? /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "grid",
						gap: 8,
						marginTop: 8
					},
					children: [
						/* @__PURE__ */ _jsx("small", { children: `Move ${money(CHAT.step)} of rent from` }),
						/* @__PURE__ */ _jsx("div", {
							style: {
								display: "flex",
								flexWrap: "wrap",
								gap: 8
							},
							children: state.rooms.map((r) => /* @__PURE__ */ _jsx(Button, {
								kind: r.id === from.id ? "primary" : "secondary",
								onClick: () => setLocal({ from: r.id }),
								children: r.name
							}, r.id))
						}),
						/* @__PURE__ */ _jsx("small", { children: "to" }),
						/* @__PURE__ */ _jsx("div", {
							style: {
								display: "flex",
								flexWrap: "wrap",
								gap: 8
							},
							children: state.rooms.filter((r) => r.id !== from.id).map((r) => /* @__PURE__ */ _jsx(Button, {
								kind: "secondary",
								disabled: from.cents < CHAT.step,
								onClick: () => dispatch({
									t: "shift",
									from: from.id,
									to: r.id,
									cents: CHAT.step
								}),
								children: r.name
							}, r.id))
						}),
						/* @__PURE__ */ _jsxs("div", {
							style: {
								display: "flex",
								flexWrap: "wrap",
								gap: 8
							},
							children: [/* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => dispatch({ t: "utils" }),
								children: state.payers.includes(me) ? "Skip utils" : "Split utils"
							}), mine ? /* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => dispatch({
									t: "leave",
									room: mine.id
								}),
								children: "Leave room"
							}) : null]
						})
					]
				}) : null]
			})
		] });
	}
});
