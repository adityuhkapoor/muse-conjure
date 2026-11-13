import { defineApp, Avatar, Button, CardHeader } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Who earns a Friendsgiving seat: attendance per event, ranked by events attended.
const CHAT = {
	title: "Who earns a Friendsgiving seat?",
	events: [
		{
			name: "Trivia Thursday",
			went: [
				"Noor",
				"Abby",
				"Omar",
				"Rhea",
				"Lena",
				"Mina"
			]
		},
		{
			name: "Halloween party",
			went: [
				"Abby",
				"Nora",
				"Noor",
				"Owen",
				"Lena",
				"Rhea"
			]
		},
		{
			name: "Pumpkin patch",
			went: [
				"Owen",
				"Nora",
				"Mina",
				"Abby",
				"Lena",
				"Omar"
			]
		},
		{
			name: "Movie night",
			went: [
				"Abby",
				"Lena",
				"Noor",
				"Omar",
				"Nora",
				"Rhea"
			]
		}
	],
	minEvents: 1,
	seats: 0
};
const MAX_SEATS = 20;
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const countOf = (s, id) => s.events.filter((e) => e.went.includes(id)).length;
const strip = (xs, id) => xs.filter((x) => x !== id).join();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function ranked(s, members) {
	const rows = members.map((m) => ({
		m,
		n: countOf(s, m.id)
	}));
	rows.sort((a, b) => b.n !== a.n ? b.n - a.n : a.m.name < b.m.name ? -1 : a.m.name > b.m.name ? 1 : 0);
	let given = 0;
	return rows.map((r) => {
		const ok = r.n >= s.minEvents;
		const seat = ok && (s.seats === 0 || given < s.seats);
		if (seat) given += 1;
		return {
			...r,
			ok,
			seat
		};
	});
}
export default defineApp({
	name: "Seat ranking",
	summary: (s, ctx) => {
		const q = ctx.members.filter((m) => countOf(s, m.id) >= s.minEvents).length;
		return `${s.title} ${q} of ${ctx.members.length} qualify.`;
	},
	init: (ctx) => {
		const events = CHAT.events.slice(0, 4).map((e, i) => {
			const ids = e.went.map((name) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id).filter((x) => x !== undefined);
			return {
				id: `e${i}`,
				name: e.name,
				went: ids.filter((x, j) => ids.indexOf(x) === j)
			};
		});
		return {
			title: CHAT.title,
			events,
			seats: CHAT.seats,
			minEvents: Math.max(1, Math.min(events.length, CHAT.minEvents))
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "toggle") {
			if (typeof action.event !== "string" || typeof action.person !== "string") return state;
			const id = action.event;
			const who = action.person;
			if (!inChat(ctx, who) || !state.events.some((e) => e.id === id)) return state;
			return {
				...state,
				events: state.events.map((e) => e.id !== id ? e : {
					...e,
					went: e.went.includes(who) ? e.went.filter((x) => x !== who) : [...e.went, who]
				})
			};
		}
		if (action.t === "setSeats") {
			if (typeof action.n !== "number" || !Number.isInteger(action.n) || action.n < 0 || action.n > MAX_SEATS || action.n === state.seats) return state;
			return {
				...state,
				seats: action.n
			};
		}
		if (action.t === "setMin") {
			if (typeof action.n !== "number" || !Number.isInteger(action.n) || action.n < 1 || action.n > state.events.length || action.n === state.minEvents) return state;
			return {
				...state,
				minEvents: action.n
			};
		}
		return state;
	},
	onMembers: (state, ctx) => {
		if (state.events.every((e) => e.went.every((x) => inChat(ctx, x)))) return state;
		return {
			...state,
			events: state.events.map((e) => ({
				...e,
				went: e.went.filter((x) => inChat(ctx, x))
			}))
		};
	},
	invariants: {
		"no one is listed twice for an event": (s) => s.events.every((e) => new Set(e.went).size === e.went.length),
		"everyone who went is in the chat": (s, ctx) => s.events.every((e) => e.went.every((x) => inChat(ctx, x))),
		"event ids are unique and there are at most 4 events": (s) => s.events.length <= 4 && new Set(s.events.map((e) => e.id)).size === s.events.length,
		"seats is a whole number from 0 to 20": (s) => Number.isInteger(s.seats) && s.seats >= 0 && s.seats <= MAX_SEATS,
		"the minimum is a whole number from 1 to the number of events": (s) => Number.isInteger(s.minEvents) && s.minEvents >= 1 && s.minEvents <= Math.max(1, s.events.length),
		"no seat goes to someone under the minimum": (s, ctx) => ranked(s, ctx.members).every((r) => !r.seat || r.n >= s.minEvents)
	},
	transitions: {
		"a toggle flips only that person on that event": (p, n, a) => {
			if (a.t !== "toggle" || p === n) return true;
			if (typeof a.event !== "string" || typeof a.person !== "string") return false;
			const pe = p.events.find((e) => e.id === a.event);
			const ne = n.events.find((e) => e.id === a.event);
			if (!pe || !ne) return false;
			return pe.went.includes(a.person) !== ne.went.includes(a.person) && strip(pe.went, a.person) === strip(ne.went, a.person) && p.events.every((e, i) => e.id === a.event || same(e, n.events[i])) && p.seats === n.seats && p.minEvents === n.minEvents;
		},
		"setSeats changes only the seats to the number asked": (p, n, a) => a.t !== "setSeats" || p === n || n.seats === a.n && n.minEvents === p.minEvents && same(p.events, n.events),
		"setMin changes only the minimum to the number asked": (p, n, a) => a.t !== "setMin" || p === n || n.minEvents === a.n && n.seats === p.seats && same(p.events, n.events),
		"event ids and names never change": (p, n) => p.events.length === n.events.length && p.events.every((e, i) => e.id === n.events[i].id && e.name === n.events[i].name),
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, _user, r, ctx) => {
		const x = r.next();
		if (x < .7 && ctx.members.length && s.events.length) {
			return {
				t: "toggle",
				event: r.pick(s.events).id,
				person: r.pick(ctx.members).id
			};
		}
		if (x < .8) return {
			t: "toggle",
			event: "nope",
			person: "nobody"
		};
		if (x < .9) return {
			t: "setSeats",
			n: r.int(MAX_SEATS + 3)
		};
		return {
			t: "setMin",
			n: 1 + r.int(5)
		};
	},
	local: { panel: "" },
	view: ({ state, me, members, dispatch, local, setLocal }) => {
		const rows = ranked(state, members);
		const q = rows.filter((r) => r.ok).length;
		const total = state.events.length;
		const open = state.events.find((e) => e.id === local.panel);
		const rules = local.panel === "rules";
		const sub = `${q} of ${members.length} qualify${state.seats > 0 ? ` · ${state.seats} seats` : ""}`;
		return /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx(CardHeader, {
			title: state.title,
			subtitle: rules ? "Rules" : open ? `${open.name} · ${open.went.length} went` : sub,
			onMore: () => setLocal({ panel: rules ? "" : "rules" })
		}), open ? /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx("small", { children: "Tap a name to mark who went" }),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "flex",
					flexWrap: "wrap",
					gap: 8,
					marginTop: 8
				},
				children: members.map((m) => {
					const went = open.went.includes(m.id);
					return /* @__PURE__ */ _jsx("div", {
						style: {
							flex: "1 1 130px",
							minWidth: 0,
							display: "flex"
						},
						children: /* @__PURE__ */ _jsx(Button, {
							wide: true,
							kind: went ? "secondary" : "deemphasized",
							onClick: () => dispatch({
								t: "toggle",
								event: open.id,
								person: m.id
							}),
							children: went ? `${m.id === me ? "You" : m.name} · went` : m.id === me ? "You" : m.name
						})
					}, m.id);
				})
			}),
			/* @__PURE__ */ _jsx("div", {
				style: { marginTop: 8 },
				children: /* @__PURE__ */ _jsx(Button, {
					kind: "primary",
					onClick: () => setLocal({ panel: "" }),
					children: "Done"
				})
			})
		] }) : rules ? /* @__PURE__ */ _jsxs("div", {
			style: {
				display: "grid",
				gap: 12
			},
			children: [
				/* @__PURE__ */ _jsxs("div", { children: [
					/* @__PURE__ */ _jsx("div", {
						style: { fontWeight: 600 },
						children: "Seats"
					}),
					/* @__PURE__ */ _jsx("small", { children: state.seats === 0 ? "No cap" : `${state.seats} seats` }),
					/* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							gap: 8,
							marginTop: 4
						},
						children: [/* @__PURE__ */ _jsx(Button, {
							kind: "secondary",
							disabled: state.seats <= 0,
							onClick: () => dispatch({
								t: "setSeats",
								n: state.seats - 1
							}),
							children: "Fewer"
						}), /* @__PURE__ */ _jsx(Button, {
							kind: "secondary",
							disabled: state.seats >= MAX_SEATS,
							onClick: () => dispatch({
								t: "setSeats",
								n: state.seats + 1
							}),
							children: "More"
						})]
					})
				] }),
				/* @__PURE__ */ _jsxs("div", { children: [
					/* @__PURE__ */ _jsx("div", {
						style: { fontWeight: 600 },
						children: "Events to qualify"
					}),
					/* @__PURE__ */ _jsx("small", { children: `${state.minEvents} of ${total}` }),
					/* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							gap: 8,
							marginTop: 4
						},
						children: [/* @__PURE__ */ _jsx(Button, {
							kind: "secondary",
							disabled: state.minEvents <= 1,
							onClick: () => dispatch({
								t: "setMin",
								n: state.minEvents - 1
							}),
							children: "Fewer"
						}), /* @__PURE__ */ _jsx(Button, {
							kind: "secondary",
							disabled: state.minEvents >= total,
							onClick: () => dispatch({
								t: "setMin",
								n: state.minEvents + 1
							}),
							children: "More"
						})]
					})
				] }),
				/* @__PURE__ */ _jsx("div", { children: /* @__PURE__ */ _jsx(Button, {
					kind: "primary",
					onClick: () => setLocal({ panel: "" }),
					children: "Done"
				}) })
			]
		}) : /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx("div", { children: rows.map((r) => /* @__PURE__ */ _jsxs("div", {
			style: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				minHeight: 26,
				padding: "0 4px",
				borderRadius: 6,
				background: r.m.id === me ? "var(--color-selected)" : "transparent"
			},
			children: [
				/* @__PURE__ */ _jsx(Avatar, {
					user: r.m,
					size: 20
				}),
				/* @__PURE__ */ _jsx("span", {
					style: {
						flex: 1,
						minWidth: 0,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap"
					},
					children: r.m.id === me ? `${r.m.name} · you` : r.m.name
				}),
				/* @__PURE__ */ _jsx("small", { children: `${r.n} of ${total}` }),
				/* @__PURE__ */ _jsx("small", {
					style: {
						width: 36,
						textAlign: "right",
						fontWeight: 600
					},
					children: r.seat ? "Seat" : ""
				})
			]
		}, r.m.id)) }), /* @__PURE__ */ _jsx("div", {
			style: {
				display: "flex",
				flexWrap: "wrap",
				gap: 8,
				marginTop: 8
			},
			children: state.events.map((e) => /* @__PURE__ */ _jsx("div", {
				style: {
					flex: "1 1 130px",
					minWidth: 0,
					display: "flex"
				},
				children: /* @__PURE__ */ _jsx(Button, {
					wide: true,
					kind: "deemphasized",
					onClick: () => setLocal({ panel: e.id }),
					children: e.name
				})
			}, e.id))
		})] })] });
	}
});
