import { defineApp, Avatar, Button, CardHeader, Progress } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Dues toward the van deposit. Money counts once the collector holds it. Cash sitting with
// someone else shows as "not handed over". The collector can mark a shortfall as waived.
const C = {
	title: "Van deposit dues",
	due: 3500,
	goal: 14e3,
	deadline: "Monday",
	collector: "Ana",
	payments: [
		{
			who: "Paige",
			cents: 3500,
			holder: "Ana"
		},
		{
			who: "Luis",
			cents: 3500,
			holder: "Omar"
		},
		{
			who: "Ana",
			cents: 2500,
			holder: "Ana"
		}
	]
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const money = (c) => c % 100 === 0 ? `$${c / 100}` : `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
const key = (p) => `${p.id}|${p.who}|${p.cents}|${p.holder}|${p.handed}`;
const pk = (s) => s.pays.map(key).join(";");
const others = (s, user) => s.pays.filter((x) => x.who !== user).map(key).join(";");
/** Dues counted as collected: waived people count in full, others count once the collector holds it. */
function collected(s, ctx) {
	return ctx.members.reduce((n, m) => {
		if (s.waived.includes(m.id)) return n + s.due;
		const p = s.pays.find((x) => x.who === m.id);
		return n + (p && p.handed ? Math.min(p.cents, s.due) : 0);
	}, 0);
}
export default defineApp({
	name: "Dues tracker",
	summary: (s, ctx) => {
		const got = collected(s, ctx);
		const short = Math.max(0, s.goal - got);
		return `${C.title}: ${money(got)} of ${money(s.goal)} collected · ${short > 0 ? `short by ${money(short)}` : "covered"}`;
	},
	init: (ctx) => {
		const find = (name) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id;
		const collector = find(C.collector) ?? ctx.members[0]?.id ?? "";
		const pays = [];
		C.payments.forEach((p, i) => {
			const who = find(p.who);
			const holder = find(p.holder);
			if (!who || !holder || pays.some((x) => x.who === who)) return;
			pays.push({
				id: `s${i}`,
				who,
				cents: p.cents,
				holder,
				handed: holder === collector
			});
		});
		return {
			due: C.due,
			goal: C.goal,
			deadline: C.deadline,
			collector,
			pays,
			waived: []
		};
	},
	reduce: (s, a, m, ctx) => {
		if (!inChat(ctx, m.user)) return s;
		switch (a.t) {
			case "pay": {
				const cents = a.cents;
				const to = a.to;
				if (typeof cents !== "number" || !Number.isInteger(cents) || cents < 1 || cents > s.due) return s;
				if (typeof to !== "string" || !inChat(ctx, to)) return s;
				if (to === m.user && m.user !== s.collector) return s;
				const mine = s.pays.find((p) => p.who === m.user);
				if (mine && mine.cents === cents && mine.holder === to) return s;
				const np = {
					id: `p${m.seq}`,
					who: m.user,
					cents,
					holder: to,
					handed: to === s.collector
				};
				return {
					...s,
					pays: mine ? s.pays.map((p) => p.who === m.user ? np : p) : [...s.pays, np]
				};
			}
			case "handoff": {
				const id = a.id;
				if (typeof id !== "string") return s;
				const p = s.pays.find((x) => x.id === id);
				if (!p || p.holder !== m.user || p.handed) return s;
				return {
					...s,
					pays: s.pays.map((x) => x.id === id ? {
						...x,
						holder: s.collector,
						handed: true
					} : x)
				};
			}
			case "waive": {
				const who = a.who;
				if (typeof who !== "string" || m.user !== s.collector || !inChat(ctx, who)) return s;
				return {
					...s,
					waived: s.waived.includes(who) ? s.waived.filter((w) => w !== who) : [...s.waived, who]
				};
			}
			case "unpay": {
				const id = a.id;
				if (typeof id !== "string") return s;
				const p = s.pays.find((x) => x.id === id);
				if (!p || m.user !== p.who && m.user !== s.collector) return s;
				return {
					...s,
					pays: s.pays.filter((x) => x.id !== id)
				};
			}
		}
		return s;
	},
	// Someone left: their payment and waiver go. A holder who left hands cash to the collector.
	// A collector who left passes the role to the first person still in the chat.
	onMembers: (s, ctx) => {
		const collector = inChat(ctx, s.collector) ? s.collector : ctx.members[0]?.id ?? "";
		const pays = s.pays.filter((p) => inChat(ctx, p.who)).map((p) => {
			const holder = inChat(ctx, p.holder) ? p.holder : collector;
			const handed = holder === collector;
			return holder === p.holder && handed === p.handed ? p : {
				...p,
				holder,
				handed
			};
		});
		const waived = s.waived.filter((w) => inChat(ctx, w));
		if (collector === s.collector && pays.length === s.pays.length && pays.every((p, i) => p === s.pays[i]) && waived.length === s.waived.length) return s;
		return {
			...s,
			collector,
			pays,
			waived
		};
	},
	invariants: {
		"every payment is a whole amount from 1 cent up to the dues": (s) => s.pays.every((p) => Number.isInteger(p.cents) && p.cents >= 1 && p.cents <= s.due),
		"each person has at most one payment and ids are unique": (s) => new Set(s.pays.map((p) => p.who)).size === s.pays.length && new Set(s.pays.map((p) => p.id)).size === s.pays.length,
		"payers and holders are in the chat": (s, ctx) => s.pays.every((p) => inChat(ctx, p.who) && inChat(ctx, p.holder)),
		"the collector is in the chat": (s, ctx) => ctx.members.length === 0 || inChat(ctx, s.collector),
		"a payment is handed over exactly when the collector holds it": (s) => s.pays.every((p) => p.handed === (p.holder === s.collector)),
		"waived people are unique and in the chat": (s, ctx) => new Set(s.waived).size === s.waived.length && s.waived.every((w) => inChat(ctx, w))
	},
	transitions: {
		"a payment sets the actor's own payment and leaves everyone else's alone": (p, n, a, m) => {
			if (a.t !== "pay" || p === n) return true;
			const mine = n.pays.find((x) => x.who === m.user);
			return !!mine && mine.cents === a.cents && mine.holder === a.to && mine.handed === (a.to === n.collector) && others(p, m.user) === others(n, m.user) && p.waived.join() === n.waived.join();
		},
		"a handoff moves only that payment to the collector, and only from its holder": (p, n, a, m) => {
			if (a.t !== "handoff" || p === n) return true;
			const id = a.id;
			const before = p.pays.find((x) => x.id === id);
			const after = n.pays.find((x) => x.id === id);
			return !!before && !!after && before.holder === m.user && !before.handed && after.holder === n.collector && after.handed && after.cents === before.cents && after.who === before.who && p.pays.length === n.pays.length && p.pays.every((x, i) => x.id === id || key(x) === key(n.pays[i]));
		},
		"only the collector waives, and it flips that one person": (p, n, a, m) => {
			if (a.t !== "waive" || p === n) return true;
			const who = a.who;
			const rest = (s) => s.waived.filter((w) => w !== who).join();
			return m.user === p.collector && p.waived.includes(who) !== n.waived.includes(who) && rest(p) === rest(n);
		},
		"an unpay removes only that payment, for its payer or the collector": (p, n, a, m) => {
			if (a.t !== "unpay" || p === n) return true;
			const id = a.id;
			const before = p.pays.find((x) => x.id === id);
			return !!before && (m.user === before.who || m.user === p.collector) && pk(n) === p.pays.filter((x) => x.id !== id).map(key).join(";");
		},
		"waiving never touches payments and other actions never touch the waived list": (p, n, a) => a.t === "waive" ? pk(p) === pk(n) : p.waived.join() === n.waived.join(),
		"dues, goal, deadline and collector never change in an action": (p, n) => p.due === n.due && p.goal === n.goal && p.deadline === n.deadline && p.collector === n.collector,
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r, ctx) => {
		const ids = ctx.members.map((m) => m.id);
		if (!ids.length) return null;
		const k = r.next();
		if (k < .4) return {
			t: "pay",
			cents: r.next() < .7 ? s.due : r.int(s.due + 200),
			to: r.pick(ids)
		};
		if (k < .6) {
			const mine = s.pays.find((p) => p.holder === user && !p.handed);
			return {
				t: "handoff",
				id: mine ? mine.id : s.pays.length ? r.pick(s.pays).id : "none"
			};
		}
		if (k < .8) return {
			t: "waive",
			who: r.pick(ids)
		};
		return {
			t: "unpay",
			id: s.pays.length ? r.pick(s.pays).id : "none"
		};
	},
	local: { open: false },
	view: ({ state, me, members, dispatch, local, setLocal }) => {
		const nm = (id) => members.find((m) => m.id === id)?.name ?? "Someone";
		const who = (id) => id === me ? "You" : nm(id);
		const got = collected(state, { members });
		const short = Math.max(0, state.goal - got);
		const isCollector = me === state.collector;
		const myPay = state.pays.find((p) => p.who === me);
		const holding = state.pays.filter((p) => p.holder === me && !p.handed);
		const order = [...members.filter((m) => m.id === me), ...members.filter((m) => m.id !== me)];
		const status = (id) => {
			const p = state.pays.find((x) => x.who === id);
			if (state.waived.includes(id)) return p ? `Waived · paid ${money(p.cents)}` : "Waived · counted as paid";
			if (!p) return `Owes ${money(state.due)}`;
			if (!p.handed) return p.holder === me ? "You hold the cash" : `With ${nm(p.holder)} · not handed over`;
			return p.cents >= state.due ? `Paid ${money(p.cents)}` : `Paid ${money(p.cents)} · ${money(state.due - p.cents)} short`;
		};
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: C.title,
				subtitle: `${short > 0 ? `Short by ${money(short)}` : "Covered"} · due ${state.deadline}`
			}),
			/* @__PURE__ */ _jsx(Progress, {
				value: Math.min(got, state.goal),
				max: Math.max(1, state.goal),
				label: `${money(got)} of ${money(state.goal)} collected`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 2,
					marginTop: 8
				},
				children: order.map((m) => {
					const p = state.pays.find((x) => x.who === m.id);
					const waived = state.waived.includes(m.id);
					const full = !!p && p.handed && p.cents >= state.due;
					let action = null;
					if (isCollector && (waived || !full)) {
						action = /* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							onClick: () => dispatch({
								t: "waive",
								who: m.id
							}),
							children: waived ? "Unwaive" : "Waive"
						});
					} else if (!isCollector && m.id === me && p) {
						action = /* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							onClick: () => dispatch({
								t: "unpay",
								id: p.id
							}),
							children: "Undo"
						});
					}
					return /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: 44
						},
						children: [
							/* @__PURE__ */ _jsx(Avatar, {
								user: m.id,
								size: 24
							}),
							/* @__PURE__ */ _jsxs("div", {
								style: {
									flex: 1,
									minWidth: 0
								},
								children: [/* @__PURE__ */ _jsx("div", {
									style: { fontWeight: 600 },
									children: who(m.id)
								}), /* @__PURE__ */ _jsx("small", { children: status(m.id) })]
							}),
							action
						]
					}, m.id);
				})
			}),
			local.open ? /* @__PURE__ */ _jsxs("div", {
				style: { marginTop: 8 },
				children: [/* @__PURE__ */ _jsx("small", { children: "Who has your cash?" }), /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						flexWrap: "wrap",
						gap: 8,
						marginTop: 4
					},
					children: [members.filter((m) => m.id !== me).map((m) => /* @__PURE__ */ _jsx(Button, {
						kind: "secondary",
						onClick: () => {
							dispatch({
								t: "pay",
								cents: state.due,
								to: m.id
							});
							setLocal({ open: false });
						},
						children: m.name
					}, m.id)), /* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						onClick: () => setLocal({ open: false }),
						children: "Cancel"
					})]
				})]
			}) : /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					flexWrap: "wrap",
					gap: 8,
					marginTop: 8
				},
				children: [
					holding.length ? /* @__PURE__ */ _jsx(Button, {
						kind: "primary",
						onClick: () => {
							holding.forEach((p) => dispatch({
								t: "handoff",
								id: p.id
							}));
						},
						children: "Hand over"
					}) : null,
					!myPay ? /* @__PURE__ */ _jsx(Button, {
						kind: holding.length ? "secondary" : "primary",
						onClick: () => dispatch({
							t: "pay",
							cents: state.due,
							to: state.collector
						}),
						children: "I paid"
					}) : null,
					!myPay && !isCollector ? /* @__PURE__ */ _jsx(Button, {
						kind: "secondary",
						onClick: () => setLocal({ open: true }),
						children: "Paid cash"
					}) : null
				]
			})
		] });
	}
});
