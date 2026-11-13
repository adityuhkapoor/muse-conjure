import { defineApp, Avatar, Button, CardHeader, clock } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Phoebe Bridgers drop: a countdown to the Saturday noon ET sale, who buys for whom, a status
// for each buyer, the backup plan, and the $68 Ravi sends Maya.
const CHAT = {
	title: "Phoebe Bridgers drop",
	// Saturday noon Eastern (17:00 UTC), Nov 14 2026. The chat gave no date, so someone taps "Set time".
	dropAt: 17946756e5,
	buyers: [{
		name: "maya",
		tickets: ["maya", "ravi"]
	}, {
		name: "kofi",
		tickets: ["kofi", "cam"]
	}],
	payer: "ravi",
	payee: "maya",
	payCents: 6800
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const json = (x) => JSON.stringify(x);
const pad2 = (n) => n < 10 ? `0${n}` : `${n}`;
const money = (cents) => `$${Math.floor(cents / 100)}${cents % 100 ? `.${pad2(cents % 100)}` : ""}`;
const restOf = (s) => json([
	s.dropAt,
	s.paid,
	s.payer,
	s.payee
]);
const buyersExcept = (s, id) => json(s.buyers.filter((b) => b.id !== id));
const chip = (tone, text) => /* @__PURE__ */ _jsx("span", {
	style: {
		border: `1px solid var(--color-${tone === "neutral" ? "divider" : tone})`,
		borderRadius: 999,
		padding: "2px 8px",
		fontSize: 13,
		whiteSpace: "nowrap"
	},
	children: text
});
function setStatus(s, user, id, status) {
	const b = s.buyers.find((x) => x.id === id);
	if (!b || b.user !== user || b.status === status) return s;
	return {
		...s,
		buyers: s.buyers.map((x) => x.id === id ? {
			...x,
			status
		} : x)
	};
}
export default defineApp({
	name: "Drop plan",
	summary: (s) => {
		if (s.dropAt === null) return `${CHAT.title}. Drop time not set.`;
		const got = s.buyers.filter((b) => b.status === "got").length;
		return `${CHAT.title}. ${got} of ${s.buyers.length} buyers have tickets.`;
	},
	init: (ctx) => {
		const ms = ctx.members;
		const byName = (name) => ms.find((m) => m.name.toLowerCase() === name)?.id ?? null;
		const maya = byName("maya") ?? ms[0]?.id ?? null;
		let kofi = byName("kofi") ?? ms.find((m) => m.id !== maya)?.id ?? null;
		if (kofi === maya) kofi = null;
		const ravi = byName("ravi");
		const cam = byName("cam");
		const used = [];
		const claim = (id) => {
			if (id === null || used.includes(id)) return null;
			used.push(id);
			return id;
		};
		const mayaTickets = [claim(maya), claim(ravi)].filter((x) => x !== null);
		const kofiTickets = [claim(kofi), claim(cam)].filter((x) => x !== null);
		const buyers = [];
		if (maya !== null) buyers.push({
			id: "b0",
			user: maya,
			tickets: mayaTickets,
			status: "waiting"
		});
		if (kofi !== null) buyers.push({
			id: "b1",
			user: kofi,
			tickets: kofiTickets,
			status: "waiting"
		});
		const ok = ravi !== null && maya !== null && ravi !== maya;
		return {
			dropAt: null,
			buyers,
			paid: false,
			payer: ok ? ravi : "",
			payee: ok ? maya : ""
		};
	},
	reduce: (state, a, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (a.t === "setDrop") {
			if (state.dropAt !== null || typeof a.at !== "number" || !Number.isInteger(a.at) || a.at <= 0) return state;
			return {
				...state,
				dropAt: a.at
			};
		}
		if (a.t === "mark") {
			if (state.dropAt === null || typeof a.buyer !== "string" || a.status !== "got" && a.status !== "failed") return state;
			return setStatus(state, meta.user, a.buyer, a.status);
		}
		if (a.t === "reset") {
			if (typeof a.buyer !== "string") return state;
			return setStatus(state, meta.user, a.buyer, "waiting");
		}
		if (a.t === "paid") {
			if (typeof a.paid !== "boolean" || state.payer === "" || state.payee === "" || meta.user !== state.payer || state.paid === a.paid) return state;
			return {
				...state,
				paid: a.paid
			};
		}
		return state;
	},
	// Someone left: their buyer card goes, their ticket goes, and a payment they were part of is cleared.
	onMembers: (state, ctx) => {
		const keep = (id) => inChat(ctx, id);
		const buyers = state.buyers.filter((b) => keep(b.user)).map((b) => b.tickets.every(keep) ? b : {
			...b,
			tickets: b.tickets.filter(keep)
		});
		const payer = state.payer !== "" && keep(state.payer) ? state.payer : "";
		const payee = state.payee !== "" && keep(state.payee) ? state.payee : "";
		const paid = state.paid && payer !== "" && payee !== "";
		const same = buyers.length === state.buyers.length && buyers.every((b, i) => b === state.buyers[i]) && payer === state.payer && payee === state.payee && paid === state.paid;
		return same ? state : {
			...state,
			buyers,
			payer,
			payee,
			paid
		};
	},
	invariants: {
		"buyers, ticket holders, payer and payee are in the chat": (s, ctx) => s.buyers.every((b) => inChat(ctx, b.user) && b.tickets.every((t) => inChat(ctx, t))) && (s.payer === "" || inChat(ctx, s.payer)) && (s.payee === "" || inChat(ctx, s.payee)),
		"buyer ids are unique and no one is a buyer twice": (s) => new Set(s.buyers.map((b) => b.id)).size === s.buyers.length && new Set(s.buyers.map((b) => b.user)).size === s.buyers.length,
		"each person has at most one ticket": (s) => {
			const all = s.buyers.flatMap((b) => b.tickets);
			return new Set(all).size === all.length;
		},
		"statuses are valid and the drop time is a positive whole number or unset": (s) => s.buyers.every((b) => b.status === "waiting" || b.status === "got" || b.status === "failed") && (s.dropAt === null || Number.isInteger(s.dropAt) && s.dropAt > 0),
		"paid is true only when payer and payee are set": (s) => !s.paid || s.payer !== "" && s.payee !== "",
		"the payer is never the payee": (s) => s.payer === "" || s.payer !== s.payee
	},
	transitions: {
		"setting the drop time works once and changes nothing else": (p, n, a) => a.t !== "setDrop" || p === n || p.dropAt === null && n.dropAt === a.at && json([
			p.buyers,
			p.paid,
			p.payer,
			p.payee
		]) === json([
			n.buyers,
			n.paid,
			n.payer,
			n.payee
		]),
		"a buyer marks or resets only their own status, and only that status changes": (p, n, a, m) => {
			if (a.t !== "mark" && a.t !== "reset" || p === n) return true;
			const want = a.t === "mark" ? a.status : "waiting";
			const b = p.buyers.find((x) => x.id === a.buyer);
			const nb = n.buyers.find((x) => x.id === a.buyer);
			return !!b && !!nb && b.user === m.user && (a.t === "reset" || p.dropAt !== null) && b.status !== want && nb.status === want && nb.user === b.user && json(nb.tickets) === json(b.tickets) && p.buyers.length === n.buyers.length && buyersExcept(p, b.id) === buyersExcept(n, b.id) && restOf(p) === restOf(n);
		},
		"only the payer changes the paid flag, and nothing else changes": (p, n, a, m) => a.t !== "paid" || p === n || p.payer !== "" && m.user === p.payer && n.paid === a.paid && json(p.buyers) === json(n.buyers) && p.dropAt === n.dropAt && p.payer === n.payer && p.payee === n.payee,
		"the drop time never changes once it is set": (p, n) => p.dropAt === null || n.dropAt === p.dropAt,
		"no action changes who buys for whom": (p, n) => p.buyers.length === n.buyers.length && p.buyers.every((b, i) => n.buyers[i].user === b.user && json(n.buyers[i].tickets) === json(b.tickets)),
		"only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		const k = r.next();
		if (s.dropAt === null && k < .4) return {
			t: "setDrop",
			at: r.pick([
				CHAT.dropAt,
				CHAT.dropAt,
				0,
				-1
			])
		};
		if (k < .5) return {
			t: "paid",
			paid: r.next() < .6
		};
		const b = s.buyers.find((x) => x.user === user) ?? (s.buyers.length ? r.pick(s.buyers) : null);
		if (!b) return {
			t: "paid",
			paid: true
		};
		const j = r.next();
		if (j < .6) return {
			t: "mark",
			buyer: b.id,
			status: r.next() < .6 ? "got" : "failed"
		};
		if (j < .85) return {
			t: "reset",
			buyer: b.id
		};
		return {
			t: "mark",
			buyer: "zz",
			status: "got"
		};
	},
	local: {},
	view: ({ state, me, members, dispatch }) => {
		const nameOf = (id) => members.find((m) => m.id === id)?.name ?? "Someone";
		const now = clock.value;
		let big = "Saturday, noon ET";
		let lead = "Drop time not set";
		if (state.dropAt !== null) {
			const rem = state.dropAt - now;
			if (rem > 0) {
				const sec = Math.floor(rem / 1e3);
				const d = Math.floor(sec / 86400);
				const h = Math.floor(sec % 86400 / 3600);
				const mi = Math.floor(sec % 3600 / 60);
				const ss = sec % 60;
				lead = "Drops in";
				big = d > 0 ? `${d}d ${h}h ${pad2(mi)}m` : `${h}h ${pad2(mi)}m ${pad2(ss)}s`;
			} else {
				lead = "Sale is open";
				big = "Live now";
			}
		}
		const total = state.buyers.reduce((n, b) => n + b.tickets.length, 0);
		const failed = state.buyers.filter((b) => b.status === "failed");
		let backup = "";
		if (state.buyers.length >= 2) {
			const other = state.buyers.find((b) => b.status !== "failed");
			if (failed.length === state.buyers.length) backup = "Both buyers failed";
			else if (failed.length >= 1 && other) backup = `${nameOf(other.user)} now grabs all ${total}`;
			else backup = `If one buyer fails, the other grabs all ${total}`;
		}
		const tone = (s) => s === "got" ? "positive" : s === "failed" ? "negative" : "neutral";
		const label = (s) => s === "got" ? "Got them" : s === "failed" ? "Failed" : "Waiting";
		const showPay = state.payer !== "" && state.payee !== "";
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: CHAT.title,
				subtitle: "General sale · Saturday noon ET"
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					padding: "4px 0 8px"
				},
				children: [/* @__PURE__ */ _jsxs("div", {
					style: {
						flex: 1,
						minWidth: 0
					},
					children: [
						/* @__PURE__ */ _jsx("small", { children: lead }),
						/* @__PURE__ */ _jsx("h2", {
							style: { margin: 0 },
							children: big
						}),
						/* @__PURE__ */ _jsx("small", { children: "Could sell out in about 4 minutes" })
					]
				}), state.dropAt === null ? /* @__PURE__ */ _jsx(Button, {
					kind: "primary",
					onClick: () => dispatch({
						t: "setDrop",
						at: CHAT.dropAt
					}),
					children: "Set time"
				}) : null]
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 4
				},
				children: state.buyers.map((b) => {
					const mine = b.user === me && state.dropAt !== null;
					return /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: 48
						},
						children: [
							/* @__PURE__ */ _jsx(Avatar, {
								user: b.user,
								size: 28
							}),
							/* @__PURE__ */ _jsxs("div", {
								style: {
									flex: 1,
									minWidth: 0
								},
								children: [/* @__PURE__ */ _jsx("div", {
									style: { fontWeight: 600 },
									children: nameOf(b.user)
								}), /* @__PURE__ */ _jsxs("small", { children: ["Buys for ", b.tickets.length ? b.tickets.map(nameOf).join(", ") : "no one"] })]
							}),
							chip(tone(b.status), label(b.status))
						]
					}), mine ? /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							flexWrap: "wrap",
							gap: 8
						},
						children: [
							b.status !== "got" ? /* @__PURE__ */ _jsx(Button, {
								kind: b.status === "waiting" ? "primary" : "secondary",
								onClick: () => dispatch({
									t: "mark",
									buyer: b.id,
									status: "got"
								}),
								children: "Got them"
							}) : null,
							b.status !== "failed" ? /* @__PURE__ */ _jsx(Button, {
								kind: "secondary",
								onClick: () => dispatch({
									t: "mark",
									buyer: b.id,
									status: "failed"
								}),
								children: "Failed"
							}) : null,
							b.status !== "waiting" ? /* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => dispatch({
									t: "reset",
									buyer: b.id
								}),
								children: "Reset"
							}) : null
						]
					}) : null] }, b.id);
				})
			}),
			backup ? /* @__PURE__ */ _jsx("div", {
				style: { marginTop: 6 },
				children: /* @__PURE__ */ _jsx("small", { children: backup })
			}) : null,
			showPay ? /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					minHeight: 48,
					marginTop: 4
				},
				children: [
					/* @__PURE__ */ _jsxs("div", {
						style: {
							flex: 1,
							minWidth: 0
						},
						children: [/* @__PURE__ */ _jsxs("div", {
							style: { fontWeight: 600 },
							children: [
								nameOf(state.payer),
								" owes ",
								nameOf(state.payee),
								" ",
								money(CHAT.payCents)
							]
						}), /* @__PURE__ */ _jsxs("small", { children: [
							"For ",
							nameOf(state.payer),
							"'s ticket"
						] })]
					}),
					state.paid ? chip("positive", "Paid") : chip("neutral", "Not paid"),
					me === state.payer ? /* @__PURE__ */ _jsx(Button, {
						kind: "secondary",
						onClick: () => dispatch({
							t: "paid",
							paid: !state.paid
						}),
						children: state.paid ? "Undo" : "I paid"
					}) : null
				]
			}) : null
		] });
	}
});
