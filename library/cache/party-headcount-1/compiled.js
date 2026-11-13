import { defineApp, Avatar, Button, CardHeader } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Chat content: what people already said.
const C = {
	title: "Who's coming to Diwali at Dev's?",
	when: "Sat the 14th · 7 PM",
	maxGuests: 5,
	start: [
		{
			name: "Dev",
			status: "going",
			guests: 0
		},
		{
			name: "Rohan",
			status: "going",
			guests: 2
		},
		{
			name: "Kofi",
			status: "going",
			guests: 0
		},
		{
			name: "Ana",
			status: "going",
			guests: 1
		},
		{
			name: "Bea",
			status: "going",
			guests: 0
		},
		{
			name: "Priya",
			status: "going",
			guests: 1
		},
		{
			name: "Ty",
			status: "going",
			guests: 0
		}
	]
};
const isStatus = (x) => x === "going" || x === "maybe" || x === "no";
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const mine = (s, user) => s.rsvps.find((r) => r.user === user);
const others = (s, user) => JSON.stringify(s.rsvps.filter((r) => r.user !== user));
const goingPeople = (s) => s.rsvps.filter((r) => r.status === "going").length;
const guestTotal = (s) => s.rsvps.reduce((n, r) => n + (r.status === "going" ? r.guests : 0), 0);
const total = (s) => goingPeople(s) + guestTotal(s);
const maybeCount = (s) => s.rsvps.filter((r) => r.status === "maybe").length;
function setStatus(s, user, status) {
	if (!isStatus(status)) return s;
	const e = mine(s, user);
	if (e && e.status === status) return s;
	if (!e) return {
		...s,
		rsvps: [...s.rsvps, {
			user,
			status,
			guests: 0
		}]
	};
	return {
		...s,
		rsvps: s.rsvps.map((r) => r.user === user ? {
			...r,
			status,
			guests: status === "no" ? 0 : r.guests
		} : r)
	};
}
function setGuests(s, user, count) {
	if (typeof count !== "number" || !Number.isInteger(count) || count < 0 || count > C.maxGuests) return s;
	const e = mine(s, user);
	if (!e) return {
		...s,
		rsvps: [...s.rsvps, {
			user,
			status: "going",
			guests: count
		}]
	};
	if (e.status === "no" || e.guests === count) return s;
	return {
		...s,
		rsvps: s.rsvps.map((r) => r.user === user ? {
			...r,
			guests: count
		} : r)
	};
}
const STATUS_LABEL = {
	going: "Going",
	maybe: "Maybe",
	no: "No"
};
export default defineApp({
	name: "Headcount",
	summary: (s) => `${s.title} ${total(s)} coming · ${maybeCount(s)} maybe`,
	init: (ctx) => {
		const rsvps = [];
		for (const p of C.start) {
			const m = ctx.members.find((x) => x.name.toLowerCase() === p.name.toLowerCase());
			if (!m || rsvps.some((r) => r.user === m.id)) continue;
			rsvps.push({
				user: m.id,
				status: p.status,
				guests: p.status === "no" ? 0 : p.guests
			});
		}
		return {
			title: C.title,
			when: C.when,
			rsvps
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "rsvp") return setStatus(state, meta.user, action.status);
		if (action.t === "guests") return setGuests(state, meta.user, action.count);
		return state;
	},
	onMembers: (state, ctx) => state.rsvps.every((r) => inChat(ctx, r.user)) ? state : {
		...state,
		rsvps: state.rsvps.filter((r) => inChat(ctx, r.user))
	},
	invariants: {
		"each person appears at most once": (s) => new Set(s.rsvps.map((r) => r.user)).size === s.rsvps.length,
		"everyone answering is in the chat": (s, ctx) => s.rsvps.every((r) => inChat(ctx, r.user)),
		"guests are whole numbers from 0 to the limit": (s) => s.rsvps.every((r) => Number.isInteger(r.guests) && r.guests >= 0 && r.guests <= C.maxGuests),
		"no one who said no has guests": (s) => s.rsvps.every((r) => r.status !== "no" || r.guests === 0),
		"the total is people going plus their guests only": (s) => total(s) === s.rsvps.filter((r) => r.status === "going").reduce((n, r) => n + 1 + r.guests, 0) && s.rsvps.every((r) => isStatus(r.status))
	},
	transitions: {
		"an rsvp sets the actor's status and keeps their guests unless it is no": (p, n, a, m) => a.t !== "rsvp" || p === n || mine(n, m.user)?.status === a.status && mine(n, m.user)?.guests === (a.status === "no" ? 0 : mine(p, m.user)?.guests ?? 0),
		"a guests action sets the actor's own guests to the count asked": (p, n, a, m) => a.t !== "guests" || p === n || mine(n, m.user)?.guests === a.count && mine(n, m.user)?.status !== "no",
		"a guests action never changes an existing status": (p, n, a, m) => {
			if (a.t !== "guests" || p === n) return true;
			const before = mine(p, m.user);
			return !before || before.status === mine(n, m.user)?.status;
		},
		"nobody changes another person's entry": (p, n, _a, m) => p === n || others(p, m.user) === others(n, m.user),
		"only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
		"the title and time never change": (p, n) => p.title === n.title && p.when === n.when
	},
	arbitrary: (s, user, r) => {
		const x = r.next();
		if (x < .4) return {
			t: "rsvp",
			status: r.pick([
				"going",
				"maybe",
				"no",
				"going"
			])
		};
		if (x < .9) return {
			t: "guests",
			count: r.int(C.maxGuests + 1)
		};
		return {
			t: "guests",
			count: r.pick([
				-1,
				6,
				2
			])
		};
	},
	local: {},
	view: ({ state, me, members, dispatch }) => {
		const my = mine(state, me);
		const going = goingPeople(state);
		const guests = guestTotal(state);
		const t = total(state);
		const maybe = maybeCount(state);
		const shown = state.rsvps.filter((r) => r.user !== me && members.some((m) => m.id === r.user));
		const rows = shown.slice(0, 6);
		const noReply = members.filter((m) => m.id !== me && !state.rsvps.some((r) => r.user === m.id));
		const nameOf = (id) => members.find((m) => m.id === id)?.name ?? "Someone";
		const myGuests = my ? my.guests : 0;
		const canStep = !my || my.status !== "no";
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `${t} coming · ${maybe} maybe`
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: { marginTop: 4 },
				children: [/* @__PURE__ */ _jsx("h2", {
					style: { margin: 0 },
					children: t === 1 ? "1 person" : `${t} people`
				}), /* @__PURE__ */ _jsx("small", { children: `${going} going + ${guests} ${guests === 1 ? "guest" : "guests"} · ${state.when}` })]
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 2,
					marginTop: 8
				},
				children: [
					rows.map((r) => /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: 28
						},
						children: [
							/* @__PURE__ */ _jsx(Avatar, {
								user: r.user,
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
								children: nameOf(r.user)
							}),
							/* @__PURE__ */ _jsx("small", { children: STATUS_LABEL[r.status] }),
							r.guests > 0 ? /* @__PURE__ */ _jsx("small", { children: `+${r.guests}` }) : null
						]
					}, r.user)),
					shown.length > rows.length ? /* @__PURE__ */ _jsx("small", { children: `and ${shown.length - rows.length} more` }) : null,
					noReply.length ? /* @__PURE__ */ _jsx("small", { children: `No reply: ${noReply.slice(0, 3).map((m) => m.name).join(", ")}${noReply.length > 3 ? ` and ${noReply.length - 3} more` : ""}` }) : null
				]
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "flex",
					gap: 8,
					marginTop: 8
				},
				children: [
					"going",
					"maybe",
					"no"
				].map((k) => /* @__PURE__ */ _jsx("div", {
					style: {
						flex: 1,
						display: "flex"
					},
					children: /* @__PURE__ */ _jsx(Button, {
						kind: my?.status === k || !my && k === "going" ? "primary" : "secondary",
						wide: true,
						onClick: () => dispatch({
							t: "rsvp",
							status: k
						}),
						children: STATUS_LABEL[k]
					})
				}, k))
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginTop: 8
				},
				children: [
					/* @__PURE__ */ _jsx("small", {
						style: { flex: 1 },
						children: "Your guests"
					}),
					/* @__PURE__ */ _jsx(Button, {
						kind: "secondary",
						"aria-label": "Fewer guests",
						disabled: !canStep || myGuests <= 0,
						onClick: () => dispatch({
							t: "guests",
							count: myGuests - 1
						}),
						children: "−"
					}),
					/* @__PURE__ */ _jsx("span", {
						style: {
							minWidth: 20,
							textAlign: "center"
						},
						children: myGuests
					}),
					/* @__PURE__ */ _jsx(Button, {
						kind: "secondary",
						"aria-label": "More guests",
						disabled: !canStep || myGuests >= C.maxGuests,
						onClick: () => dispatch({
							t: "guests",
							count: myGuests + 1
						}),
						children: "+"
					})
				]
			})
		] });
	}
});
