import { defineApp, Avatar, Button, CardHeader, Facepile, Progress } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Subscription split. Each sub has one payer and the people who use it. Everyone else owes an even
// share (floor of the total over users; the payer keeps the leftover cents) and marks when they have
// paid the payer back. The payer can also mark someone as paid.
const CHAT = {
	title: "Who owes who for the subs",
	note: "About 3 months owed to Jake",
	noteFor: "Wifi (Spectrum)",
	subs: [
		{
			label: "Disney+ (bundle with Hulu)",
			cents: 1399,
			payer: "Theo",
			users: [
				"Theo",
				"Noor",
				"Maya"
			]
		},
		{
			label: "Crunchyroll",
			cents: 799,
			payer: "Nora",
			users: ["Nora", "Bryan"]
		},
		{
			label: "Wifi (Spectrum)",
			cents: 5e3,
			payer: "Jake",
			users: "all"
		}
	]
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const money = (c) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
const base = (s) => Math.floor(s.cents / Math.max(1, s.users.length));
const rest = (s) => s.cents - base(s) * Math.max(1, s.users.length);
const shareOf = (s, u) => base(s) + (u === s.payer ? rest(s) : 0);
const findSub = (s, id) => s.subs.find((x) => x.id === id);
const othersSame = (p, n, id) => p.subs.length === n.subs.length && p.note === n.note && p.subs.every((x, i) => x.id === id || same(x, n.subs[i]));
const unpaidUsers = (s) => s.users.filter((u) => u !== s.payer && !s.paid.includes(u));
function reduceSubs(s, a, user) {
	const sub = findSub(s, a.sub);
	if (!sub) return s;
	const put = (next) => ({
		...s,
		subs: s.subs.map((x) => x.id === sub.id ? next : x)
	});
	switch (a.t) {
		case "paid":
			if (!sub.users.includes(user) || user === sub.payer || sub.paid.includes(user)) return s;
			return put({
				...sub,
				paid: [...sub.paid, user]
			});
		case "unpaid":
			if (!sub.paid.includes(user)) return s;
			return put({
				...sub,
				paid: sub.paid.filter((u) => u !== user)
			});
		case "confirm": {
			const who = a.user;
			if (user !== sub.payer || typeof who !== "string" || !sub.users.includes(who) || who === sub.payer || sub.paid.includes(who)) return s;
			return put({
				...sub,
				paid: [...sub.paid, who]
			});
		}
		case "join": {
			if (user === sub.payer) return s;
			if (sub.users.includes(user)) {
				if (sub.users.length <= 1) return s;
				return put({
					...sub,
					users: sub.users.filter((u) => u !== user),
					paid: sub.paid.filter((u) => u !== user)
				});
			}
			return put({
				...sub,
				users: [...sub.users, user]
			});
		}
	}
	return s;
}
export default defineApp({
	name: "Subscription split",
	summary: (s) => {
		const total = s.subs.reduce((n, x) => n + x.users.length - 1, 0);
		const back = s.subs.reduce((n, x) => n + x.paid.length, 0);
		return `${CHAT.title}: ${back} of ${total} paid back.`;
	},
	init: (ctx) => {
		const ids = ctx.members.map((m) => m.id);
		if (ids.length === 0) return {
			subs: [],
			note: CHAT.note
		};
		const byName = (name) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id;
		const subs = CHAT.subs.map((c, i) => {
			const payer = byName(c.payer) ?? ids[0];
			const named = c.users === "all" ? ids : c.users.map(byName).filter((x) => typeof x === "string");
			const users = [...new Set([payer, ...named])];
			return {
				id: `s${i}`,
				label: c.label,
				cents: c.cents,
				payer,
				users,
				paid: []
			};
		});
		return {
			subs,
			note: CHAT.note
		};
	},
	reduce: (state, action, meta, ctx) => inChat(ctx, meta.user) ? reduceSubs(state, action, meta.user) : state,
	// Someone left: they come off every sub; a payer who left hands over to the first user left.
	// Someone joined: they can join any sub at once.
	onMembers: (state, ctx) => {
		const subs = state.subs.flatMap((sub) => {
			const users = sub.users.filter((u) => inChat(ctx, u));
			if (users.length === 0) return [];
			const payer = users.includes(sub.payer) ? sub.payer : users[0];
			const paid = sub.paid.filter((u) => users.includes(u) && u !== payer);
			return [{
				...sub,
				payer,
				users,
				paid
			}];
		});
		return same(subs, state.subs) ? state : {
			...state,
			subs
		};
	},
	invariants: {
		"every payer, user and paid entry is in the chat": (s, ctx) => s.subs.every((x) => inChat(ctx, x.payer) && x.users.every((u) => inChat(ctx, u)) && x.paid.every((u) => inChat(ctx, u))),
		"paid is a subset of users, without repeats, and never has the payer": (s) => s.subs.every((x) => new Set(x.paid).size === x.paid.length && x.paid.every((u) => x.users.includes(u) && u !== x.payer)),
		"the payer is one of the users": (s) => s.subs.every((x) => x.users.includes(x.payer)),
		"users have no repeats and are never empty": (s) => s.subs.every((x) => x.users.length > 0 && new Set(x.users).size === x.users.length),
		"cents are whole and above zero, ids are unique": (s) => s.subs.every((x) => Number.isInteger(x.cents) && x.cents > 0) && new Set(s.subs.map((x) => x.id)).size === s.subs.length,
		"shares add up to the bill exactly": (s) => s.subs.every((x) => x.users.reduce((n, u) => n + shareOf(x, u), 0) === x.cents)
	},
	transitions: {
		"a paid adds only the actor, a user who is not the payer, to that sub's paid list": (p, n, a, m) => {
			if (a.t !== "paid" || p === n) return true;
			const sp = findSub(p, a.sub), sn = findSub(n, a.sub);
			return !!sp && !!sn && sp.users.includes(m.user) && m.user !== sp.payer && same(sn.paid, [...sp.paid, m.user]) && same(sn.users, sp.users) && othersSame(p, n, a.sub);
		},
		"an unpaid removes only the actor from that sub's paid list": (p, n, a, m) => {
			if (a.t !== "unpaid" || p === n) return true;
			const sp = findSub(p, a.sub), sn = findSub(n, a.sub);
			return !!sp && !!sn && sp.paid.includes(m.user) && same(sn.paid, sp.paid.filter((u) => u !== m.user)) && same(sn.users, sp.users) && othersSame(p, n, a.sub);
		},
		"a confirm adds exactly the named user, and only the payer can do it": (p, n, a, m) => {
			if (a.t !== "confirm" || p === n) return true;
			const sp = findSub(p, a.sub), sn = findSub(n, a.sub);
			return !!sp && !!sn && m.user === sp.payer && same(sn.paid, [...sp.paid, a.user]) && same(sn.users, sp.users) && othersSame(p, n, a.sub);
		},
		"a join flips only the actor in users, and a leaver comes off paid": (p, n, a, m) => {
			if (a.t !== "join" || p === n) return true;
			const sp = findSub(p, a.sub), sn = findSub(n, a.sub);
			if (!sp || !sn || m.user === sp.payer) return false;
			const had = sp.users.includes(m.user);
			return same(sn.users, had ? sp.users.filter((u) => u !== m.user) : [...sp.users, m.user]) && same(sn.paid, had ? sp.paid.filter((u) => u !== m.user) : sp.paid) && othersSame(p, n, a.sub);
		},
		"no action changes a payer, a total or a label": (p, n) => p.subs.length === n.subs.length && p.subs.every((x, i) => x.id === n.subs[i].id && x.payer === n.subs[i].payer && x.cents === n.subs[i].cents && x.label === n.subs[i].label),
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		if (s.subs.length === 0) return null;
		const sub = r.pick(s.subs);
		const k = r.next();
		if (user === sub.payer) {
			const owing = unpaidUsers(sub);
			if (owing.length && k < .7) return {
				t: "confirm",
				sub: sub.id,
				user: r.pick(owing)
			};
			if (k < .85) return {
				t: "confirm",
				sub: sub.id,
				user
			};
			return {
				t: "paid",
				sub: sub.id
			};
		}
		if (!sub.users.includes(user)) return k < .8 ? {
			t: "join",
			sub: sub.id
		} : {
			t: "paid",
			sub: sub.id
		};
		if (sub.paid.includes(user)) return k < .6 ? {
			t: "unpaid",
			sub: sub.id
		} : {
			t: "join",
			sub: sub.id
		};
		return k < .75 ? {
			t: "paid",
			sub: sub.id
		} : k < .9 ? {
			t: "join",
			sub: sub.id
		} : {
			t: "unpaid",
			sub: sub.id
		};
	},
	local: { edit: false },
	view: ({ state, me, members, dispatch, local, setLocal }) => {
		const nameOf = (id) => id === me ? "You" : members.find((m) => m.id === id)?.name ?? "Someone";
		const total = state.subs.reduce((n, x) => n + x.users.length - 1, 0);
		const back = state.subs.reduce((n, x) => n + x.paid.length, 0);
		const owing = state.subs.filter((x) => x.users.includes(me) && x.payer !== me && !x.paid.includes(me));
		const firstOwing = owing[0]?.id ?? "";
		const byPayer = [];
		for (const x of owing) {
			const e = byPayer.find((b) => b.payer === x.payer);
			if (e) e.cents += base(x);
			else byPayer.push({
				payer: x.payer,
				cents: base(x)
			});
		}
		const receivable = state.subs.filter((x) => x.payer === me).reduce((n, x) => n + unpaidUsers(x).reduce((k, u) => k + shareOf(x, u), 0), 0);
		const parts = [];
		if (byPayer.length) parts.push(`You owe ${byPayer.map((b) => `${money(b.cents)} to ${nameOf(b.payer)}`).join(" · ")}`);
		if (receivable > 0) parts.push(`Owed to you ${money(receivable)}`);
		const line = parts.length ? parts.join(" · ") : "You are all paid up";
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: CHAT.title,
				subtitle: `${back} of ${total} paid back`
			}),
			total > 0 ? /* @__PURE__ */ _jsx(Progress, {
				value: back,
				max: total,
				label: `${back} of ${total} paid back`
			}) : null,
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 6,
					marginTop: 8
				},
				children: state.subs.map((x) => {
					const isUser = x.users.includes(me);
					const isPayer = x.payer === me;
					const mine = isUser && !isPayer;
					const owingUsers = unpaidUsers(x);
					return /* @__PURE__ */ _jsxs("div", { children: [
						/* @__PURE__ */ _jsxs("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 8,
								minHeight: 44
							},
							children: [
								/* @__PURE__ */ _jsx(Avatar, {
									user: x.payer,
									size: 28
								}),
								/* @__PURE__ */ _jsxs("div", {
									style: {
										flex: 1,
										minWidth: 0
									},
									children: [
										/* @__PURE__ */ _jsxs("div", {
											style: {
												fontWeight: 600,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap"
											},
											children: [
												x.label,
												" · ",
												money(x.cents)
											]
										}),
										/* @__PURE__ */ _jsxs("small", { children: [
											isPayer ? "You pay" : `${nameOf(x.payer)} pays`,
											" · ",
											money(base(x)),
											" each"
										] }),
										/* @__PURE__ */ _jsxs("div", {
											style: {
												display: "flex",
												alignItems: "center",
												gap: 6,
												flexWrap: "wrap"
											},
											children: [x.paid.length ? /* @__PURE__ */ _jsx(Facepile, {
												users: x.paid,
												max: 4,
												size: 20
											}) : null, /* @__PURE__ */ _jsxs("small", { children: [
												x.paid.length,
												" of ",
												x.users.length - 1,
												" paid back"
											] })]
										})
									]
								}),
								mine && !x.paid.includes(me) ? /* @__PURE__ */ _jsx(Button, {
									kind: x.id === firstOwing ? "primary" : "secondary",
									onClick: () => dispatch({
										t: "paid",
										sub: x.id
									}),
									children: "I paid"
								}) : mine ? /* @__PURE__ */ _jsx(Button, {
									kind: "deemphasized",
									onClick: () => dispatch({
										t: "unpaid",
										sub: x.id
									}),
									children: "Undo"
								}) : !isUser ? /* @__PURE__ */ _jsx(Button, {
									kind: "secondary",
									onClick: () => dispatch({
										t: "join",
										sub: x.id
									}),
									children: "Join"
								}) : null
							]
						}),
						x.label === CHAT.noteFor ? /* @__PURE__ */ _jsx("small", { children: state.note }) : null,
						local.edit ? /* @__PURE__ */ _jsxs("div", {
							style: {
								display: "flex",
								flexWrap: "wrap",
								gap: 8,
								marginTop: 4
							},
							children: [mine ? /* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => dispatch({
									t: "join",
									sub: x.id
								}),
								children: "Leave"
							}) : null, isPayer ? owingUsers.map((u) => /* @__PURE__ */ _jsx(Button, {
								kind: "secondary",
								onClick: () => dispatch({
									t: "confirm",
									sub: x.id,
									user: u
								}),
								children: `${nameOf(u)} paid`
							}, u)) : null]
						}) : null
					] }, x.id);
				})
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginTop: 8
				},
				children: [/* @__PURE__ */ _jsx("div", {
					style: {
						flex: 1,
						minWidth: 0,
						fontWeight: 600
					},
					children: line
				}), /* @__PURE__ */ _jsx(Button, {
					kind: "deemphasized",
					onClick: () => setLocal({ edit: !local.edit }),
					children: local.edit ? "Done" : "Edit"
				})]
			})
		] });
	}
});
