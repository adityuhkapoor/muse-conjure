import { defineApp, Button, CardHeader, Facepile, rng, running } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Pick order for the beach house rooms. Anyone draws the order once; then each group in turn
// claims one open room. No switching or trading after a pick.
const CHAT = {
	title: "Room pick order",
	rooms: [
		{
			label: "Master",
			detail: "Oceanfront · king bed · own bathroom"
		},
		{
			label: "Queen room 1",
			detail: "Queen bed"
		},
		{
			label: "Queen room 2",
			detail: "Queen bed"
		},
		{
			label: "Bunk room",
			detail: "Bunk beds"
		},
		{
			label: "Downstairs room",
			detail: "Full bed · quiet"
		}
	],
	// These two share a room and count as one pick.
	together: ["amir", "june"]
};
const REVEAL_MS = 1500;
const gid = (id) => `g:${id}`;
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const turnId = (s) => s.order[s.picks.length];
const owned = (s) => s.rooms.filter((r) => r.owner !== null);
function build(members) {
	const pair = members.filter((m) => CHAT.together.includes(m.name.toLowerCase()));
	const joint = pair.length === 2;
	const groups = [];
	let placed = false;
	for (const m of members) {
		if (joint && pair.some((p) => p.id === m.id)) {
			if (!placed) {
				groups.push({
					id: gid(pair[0].id),
					members: pair.map((p) => p.id)
				});
				placed = true;
			}
			continue;
		}
		groups.push({
			id: gid(m.id),
			members: [m.id]
		});
	}
	return groups;
}
export default defineApp({
	name: "Pick order",
	summary: (s) => {
		if (s.order.length === 0) return `${CHAT.title} Order not drawn.`;
		return `${CHAT.title} ${s.picks.length} of ${s.rooms.length} rooms picked.`;
	},
	init: (ctx) => ({
		rooms: CHAT.rooms.map((r, i) => ({
			id: `r${i}`,
			label: r.label,
			detail: r.detail,
			owner: null
		})),
		groups: build(ctx.members),
		order: [],
		at: 0,
		picks: []
	}),
	reduce: (s, a, m, ctx) => {
		if (!inChat(ctx, m.user)) return s;
		if (a.t === "draw") {
			if (s.order.length > 0 || s.groups.length === 0) return s;
			return {
				...s,
				order: rng(m.seed).shuffle(s.groups.map((g) => g.id)),
				at: m.time
			};
		}
		if (a.t === "pick") {
			if (typeof a.room !== "string") return s;
			const cur = turnId(s);
			if (cur === undefined) return s;
			const g = s.groups.find((x) => x.id === cur);
			if (!g || !g.members.includes(m.user)) return s;
			const room = s.rooms.find((r) => r.id === a.room);
			if (!room || room.owner !== null) return s;
			return {
				...s,
				rooms: s.rooms.map((r) => r.id === room.id ? {
					...r,
					owner: cur
				} : r),
				picks: [...s.picks, {
					group: cur,
					room: room.id
				}]
			};
		}
		return s;
	},
	// Someone left: they leave their group; an empty group drops out of the order and frees its room.
	// Before the draw, new people get a group of their own.
	onMembers: (s, ctx) => {
		const kept = s.groups.map((g) => g.members.every((x) => inChat(ctx, x)) ? g : {
			...g,
			members: g.members.filter((x) => inChat(ctx, x))
		});
		let groups = kept.filter((g) => g.members.length > 0);
		if (s.order.length === 0) {
			const have = new Set(groups.flatMap((g) => g.members));
			const used = new Set(groups.map((g) => g.id));
			const extra = ctx.members.filter((m) => !have.has(m.id) && !used.has(gid(m.id))).map((m) => ({
				id: gid(m.id),
				members: [m.id]
			}));
			if (extra.length) groups = [...groups, ...extra];
		}
		if (groups.length === s.groups.length && groups.every((g, i) => g === s.groups[i])) return s;
		const live = new Set(groups.map((g) => g.id));
		return {
			...s,
			groups,
			order: s.order.filter((id) => live.has(id)),
			picks: s.picks.filter((p) => live.has(p.group)),
			rooms: s.rooms.map((r) => r.owner !== null && !live.has(r.owner) ? {
				...r,
				owner: null
			} : r)
		};
	},
	invariants: {
		"each room has one owner at most, and each group owns one room at most": (s) => s.rooms.every((r) => r.owner === null || s.groups.some((g) => g.id === r.owner)) && new Set(owned(s).map((r) => r.owner)).size === owned(s).length,
		"the order lists every group exactly once, or is empty": (s) => s.order.length === 0 || s.order.length === s.groups.length && new Set(s.order).size === s.order.length && s.order.every((id) => s.groups.some((g) => g.id === id)),
		"picks follow the order and match the room owners": (s) => s.picks.length <= s.order.length && s.picks.every((p, i) => p.group === s.order[i] && s.rooms.find((r) => r.id === p.room)?.owner === p.group) && owned(s).length === s.picks.length,
		"nothing is picked before the order is drawn": (s) => s.order.length > 0 || s.picks.length === 0,
		"everyone in a group is in the chat and in one group only": (s, ctx) => {
			const all = s.groups.flatMap((g) => g.members);
			return new Set(all).size === all.length && all.every((id) => inChat(ctx, id)) && s.groups.every((g) => g.members.length > 0);
		}
	},
	transitions: {
		"a draw sets the order the seed gives and the time, and changes nothing else": (p, n, a, m) => a.t !== "draw" || p === n || n.at === m.time && n.order.join() === rng(m.seed).shuffle(p.groups.map((g) => g.id)).join() && n.groups === p.groups && n.rooms === p.rooms && n.picks === p.picks,
		"a draw changes nothing once the order exists": (p, n, a) => a.t !== "draw" || p.order.length === 0 || p === n,
		"a pick gives the named room to the group on turn and changes no other room": (p, n, a) => a.t !== "pick" || p === n || n.picks.length === p.picks.length + 1 && n.picks[p.picks.length]?.group === p.order[p.picks.length] && n.picks[p.picks.length]?.room === a.room && n.rooms.every((r, i) => r.id === a.room ? r.owner === p.order[p.picks.length] && p.rooms[i]?.owner === null : r.owner === p.rooms[i]?.owner),
		"only a member of the group on turn can pick": (p, n, a, m) => a.t !== "pick" || p === n || (p.groups.find((g) => g.id === p.order[p.picks.length])?.members.includes(m.user) ?? false),
		"a room that has an owner keeps it": (p, n) => p === n || p.rooms.every((r, i) => r.owner === null || n.rooms[i]?.owner === r.owner),
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		if (s.order.length === 0) return r.next() < .9 ? { t: "draw" } : {
			t: "pick",
			room: "r0"
		};
		const cur = s.groups.find((g) => g.id === turnId(s));
		const free = s.rooms.filter((x) => x.owner === null);
		if (cur && cur.members.includes(user) && free.length && r.next() < .85) return {
			t: "pick",
			room: r.pick(free).id
		};
		return r.next() < .6 ? {
			t: "pick",
			room: r.pick(s.rooms).id
		} : { t: "draw" };
	},
	local: {},
	view: ({ state, confirmed, pending, me, members, dispatch, theme }) => {
		const nameOf = (id) => id === me ? "You" : members.find((m) => m.id === id)?.name ?? "Someone";
		const groupLabel = (g) => g.members.map(nameOf).join(" and ");
		const groupById = (id) => state.groups.find((g) => g.id === id);
		const reveal = confirmed.at ? running(confirmed.at, REVEAL_MS) : null;
		const waiting = pending && confirmed.order.length === 0 && state.order.length > 0;
		const spinning = waiting || reveal !== null;
		const drawn = state.order.length > 0 && !spinning;
		const cur = drawn ? groupById(turnId(state)) : undefined;
		const free = state.rooms.filter((r) => r.owner === null);
		const done = drawn && (state.picks.length >= state.order.length || free.length === 0);
		const myTurn = !!cur && !done && cur.members.includes(me);
		let subtitle = "Order not drawn";
		if (spinning) subtitle = "Spinning";
		else if (done) subtitle = "All rooms picked";
		else if (cur) subtitle = myTurn ? "Your turn" : `${groupLabel(cur)} ${cur.members.length > 1 && !cur.members.includes(me) ? "are" : cur.members.includes(me) ? "are" : "is"} up`;
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: CHAT.title,
				subtitle
			}),
			drawn ? /* @__PURE__ */ _jsx("div", {
				role: "list",
				"aria-label": `Pick order: ${state.order.map((id) => {
					const g = groupById(id);
					return g ? groupLabel(g) : "";
				}).join(", ")}`,
				style: {
					display: "flex",
					flexWrap: "wrap",
					gap: 6,
					marginBottom: 8
				},
				children: state.order.map((id, i) => {
					const g = groupById(id);
					if (!g) return null;
					const isCur = !done && cur?.id === id;
					return /* @__PURE__ */ _jsxs("div", {
						role: "listitem",
						style: {
							display: "flex",
							alignItems: "center",
							gap: 4,
							padding: "4px 8px",
							borderRadius: theme.radius.pill,
							background: isCur ? theme.color.selected : theme.color.wash,
							color: theme.color.text,
							opacity: i < state.picks.length ? .6 : 1
						},
						children: [/* @__PURE__ */ _jsx("small", { children: i + 1 }), /* @__PURE__ */ _jsx(Facepile, {
							users: g.members,
							max: 2,
							size: 20
						})]
					}, id);
				})
			}) : null,
			/* @__PURE__ */ _jsx("div", { children: state.rooms.map((r, i) => {
				const g = groupById(r.owner);
				return /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						minHeight: 44,
						padding: "4px 0",
						borderTop: i === 0 ? "none" : `1px solid ${theme.color.divider}`
					},
					children: [/* @__PURE__ */ _jsxs("div", {
						style: {
							flex: 1,
							minWidth: 0
						},
						children: [/* @__PURE__ */ _jsx("div", {
							style: { fontWeight: 600 },
							children: r.label
						}), /* @__PURE__ */ _jsx("small", { children: r.detail })]
					}), g ? /* @__PURE__ */ _jsx(Facepile, {
						users: g.members,
						max: 2,
						size: 24
					}) : myTurn ? /* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						onClick: () => dispatch({
							t: "pick",
							room: r.id
						}),
						children: "Take"
					}) : null]
				}, r.id);
			}) }),
			/* @__PURE__ */ _jsx("div", {
				style: {
					minHeight: 24,
					marginTop: 8
				},
				children: spinning ? /* @__PURE__ */ _jsx("small", { children: "Spinning the order" }) : /* @__PURE__ */ _jsx("small", { children: "No switching or trading after a pick" })
			}),
			state.order.length === 0 && !spinning ? /* @__PURE__ */ _jsx("div", {
				style: {
					display: "flex",
					marginTop: 4
				},
				children: /* @__PURE__ */ _jsx(Button, {
					kind: "primary",
					wide: true,
					disabled: state.groups.length === 0,
					onClick: () => dispatch({ t: "draw" }),
					children: "Draw order"
				})
			}) : null
		] });
	}
});
