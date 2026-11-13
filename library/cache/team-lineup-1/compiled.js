import { defineApp, Button, CardHeader, Facepile } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Everyone claims one position per Thursday night. 8 spots a night, 2 QBs and 2 rushers at most.
const CHAT = {
	title: "Pick your spot",
	note: "closes Friday",
	cap: 8,
	nights: [{
		id: "n7",
		label: "Thu 7pm · turf"
	}, {
		id: "n9",
		label: "Thu 9pm · rec field"
	}],
	positions: [
		{
			id: "qb",
			label: "QB",
			max: 2
		},
		{
			id: "rush",
			label: "Rusher",
			max: 2
		},
		{
			id: "rec",
			label: "Receiver",
			max: 8
		},
		{
			id: "db",
			label: "DB",
			max: 8
		}
	]
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const spotOf = (s, user, night) => s.claims.find((c) => c.user === user && c.night === night)?.pos;
const countAt = (s, night, pos) => s.claims.filter((c) => c.night === night && (pos === undefined || c.pos === pos)).length;
const rest = (s, user, night) => s.claims.filter((c) => !(c.user === user && c.night === night)).map((c) => `${c.user}|${c.night}|${c.pos}`).join(",");
function claim(s, user, night, pos) {
	if (typeof night !== "string" || typeof pos !== "string") return s;
	if (!s.nights.some((n) => n.id === night)) return s;
	const p = s.positions.find((x) => x.id === pos);
	if (!p) return s;
	if (spotOf(s, user, night) === pos) return s;
	const others = s.claims.filter((c) => c.night === night && c.user !== user);
	if (others.length >= s.cap) return s;
	if (others.filter((c) => c.pos === pos).length >= p.max) return s;
	return {
		...s,
		claims: [...s.claims.filter((c) => !(c.user === user && c.night === night)), {
			user,
			night,
			pos
		}]
	};
}
function release(s, user, night) {
	if (typeof night !== "string" || spotOf(s, user, night) === undefined) return s;
	return {
		...s,
		claims: s.claims.filter((c) => !(c.user === user && c.night === night))
	};
}
export default defineApp({
	name: "Spot claim",
	summary: (s) => `${s.title} ${s.claims.length} of ${s.cap * s.nights.length} spots taken.`,
	init: () => ({
		title: CHAT.title,
		cap: CHAT.cap,
		nights: CHAT.nights.map((n) => ({ ...n })),
		positions: CHAT.positions.map((p) => ({ ...p })),
		claims: []
	}),
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "claim") return claim(state, meta.user, action.night, action.pos);
		if (action.t === "release") return release(state, meta.user, action.night);
		return state;
	},
	onMembers: (state, ctx) => state.claims.every((c) => inChat(ctx, c.user)) ? state : {
		...state,
		claims: state.claims.filter((c) => inChat(ctx, c.user))
	},
	invariants: {
		"no one has two claims on the same night": (s) => new Set(s.claims.map((c) => `${c.user}|${c.night}`)).size === s.claims.length,
		"each night has at most 8 claims": (s) => s.nights.every((n) => countAt(s, n.id) <= s.cap),
		"each night stays within the QB and rusher limits": (s) => s.nights.every((n) => s.positions.every((p) => countAt(s, n.id, p.id) <= p.max)),
		"every claim names a known night and position": (s) => s.claims.every((c) => s.nights.some((n) => n.id === c.night) && s.positions.some((p) => p.id === c.pos)),
		"everyone with a claim is in the chat": (s, ctx) => s.claims.every((c) => inChat(ctx, c.user))
	},
	transitions: {
		"a claim sets the actor's spot on that night and no other claim": (p, n, a, m) => a.t !== "claim" || p === n || spotOf(n, m.user, a.night) === a.pos && rest(p, m.user, a.night) === rest(n, m.user, a.night),
		"a release removes only the actor's claim on that night": (p, n, a, m) => a.t !== "release" || p === n || spotOf(p, m.user, a.night) !== undefined && spotOf(n, m.user, a.night) === undefined && rest(p, m.user, a.night) === rest(n, m.user, a.night),
		"a claim never pushes a night past its limits": (p, n, a) => a.t !== "claim" || p === n || countAt(n, a.night) <= n.cap && n.positions.every((x) => countAt(n, a.night, x.id) <= x.max),
		"the nights, positions and size never change": (p, n) => p.cap === n.cap && JSON.stringify(p.nights) === JSON.stringify(n.nights) && JSON.stringify(p.positions) === JSON.stringify(n.positions),
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		const night = r.pick(s.nights).id;
		if (spotOf(s, user, night) !== undefined && r.next() < .2) return {
			t: "release",
			night
		};
		if (r.next() < .05) return {
			t: "claim",
			night,
			pos: "coach"
		};
		return {
			t: "claim",
			night,
			pos: r.pick(s.positions).id
		};
	},
	local: {},
	view: ({ state, me, members, dispatch }) => {
		const total = state.cap * state.nights.length;
		const without = members.filter((m) => !state.claims.some((c) => c.user === m.id));
		const names = without.slice(0, 3).map((m) => m.id === me ? "you" : m.name);
		const more = without.length - names.length;
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `${state.claims.length} of ${total} spots taken · ${CHAT.note}`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 10
				},
				children: state.nights.map((night) => {
					const mine = spotOf(state, me, night.id);
					const full = countAt(state, night.id) >= state.cap;
					return /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: 8,
							minHeight: 24,
							marginBottom: 4
						},
						children: [/* @__PURE__ */ _jsxs("div", {
							style: {
								minWidth: 0,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap"
							},
							children: [
								/* @__PURE__ */ _jsx("span", {
									style: { fontWeight: 600 },
									children: night.label
								}),
								" ",
								/* @__PURE__ */ _jsxs("small", { children: [
									"· ",
									countAt(state, night.id),
									" of ",
									state.cap
								] })
							]
						}), /* @__PURE__ */ _jsx(Facepile, {
							users: state.claims.filter((c) => c.night === night.id).map((c) => c.user),
							max: 4,
							size: 20
						})]
					}), /* @__PURE__ */ _jsx("div", {
						style: {
							display: "grid",
							gridTemplateColumns: "1fr 1fr",
							gap: 6
						},
						children: state.positions.map((p) => {
							const n = countAt(state, night.id, p.id);
							const isMine = mine === p.id;
							const blocked = !isMine && (n >= p.max || mine === undefined && full);
							const label = isMine ? `${p.label} · you` : p.max < state.cap ? `${p.label} · ${n} of ${p.max}` : `${p.label} · ${n}`;
							return /* @__PURE__ */ _jsx(Button, {
								wide: true,
								kind: isMine ? "secondary" : "deemphasized",
								disabled: blocked,
								onClick: () => {
									if (isMine) dispatch({
										t: "release",
										night: night.id
									});
									else dispatch({
										t: "claim",
										night: night.id,
										pos: p.id
									});
								},
								children: label
							}, p.id);
						})
					})] }, night.id);
				})
			}),
			/* @__PURE__ */ _jsx("div", {
				style: { marginTop: 8 },
				children: /* @__PURE__ */ _jsx("small", { children: without.length === 0 ? "Everyone has a spot · tap yours to release it" : `No spot yet · ${names.join(", ")}${more > 0 ? ` and ${more} more` : ""}` })
			})
		] });
	}
});
