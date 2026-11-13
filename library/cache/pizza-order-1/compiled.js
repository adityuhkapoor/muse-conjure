import { defineApp, Avatar, Button, CardHeader, Progress } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Even split of the pizza budget across everyone in the chat. Each person marks their own
// share paid; the collector can change the total.
const CHAT = {
	title: "Pizza budget split",
	totalCents: 4e3,
	collectorName: "Dre",
	pieCents: 1400,
	slices: 8
};
const MIN_CENTS = 100;
const MAX_CENTS = 1e5;
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const money = (c) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
/** Equal shares in cents; the first people in the list take the leftover cents. */
function shares(total, ctx) {
	const out = {};
	const n = ctx.members.length;
	if (n === 0) return out;
	const base = Math.floor(total / n);
	const extra = total % n;
	ctx.members.forEach((m, i) => {
		out[m.id] = base + (i < extra ? 1 : 0);
	});
	return out;
}
const others = (xs, user) => xs.filter((x) => x !== user).join();
function parseCents(text) {
	const m = /^\$?\s*(\d{1,6})(?:\.(\d{1,2}))?$/.exec(text.trim().replace(/,/g, ""));
	if (!m) return null;
	const c = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
	return c >= MIN_CENTS && c <= MAX_CENTS ? c : null;
}
export default defineApp({
	name: "Pizza split",
	summary: (s, ctx) => `${CHAT.title}: ${s.paid.filter((u) => inChat(ctx, u)).length} of ${ctx.members.length} paid · ${money(s.total)}`,
	init: (ctx) => {
		const want = CHAT.collectorName.toLowerCase();
		const collector = ctx.members.find((m) => m.name.toLowerCase() === want)?.id ?? ctx.members[0]?.id ?? "";
		const total = Math.min(MAX_CENTS, Math.max(MIN_CENTS, Math.floor(CHAT.totalCents)));
		return {
			total,
			paid: [],
			collector
		};
	},
	reduce: (s, a, m, ctx) => {
		if (!inChat(ctx, m.user)) return s;
		if (a.t === "pay") {
			return {
				...s,
				paid: s.paid.includes(m.user) ? s.paid.filter((u) => u !== m.user) : [...s.paid, m.user]
			};
		}
		if (a.t === "setTotal") {
			const c = a.cents;
			if (m.user !== s.collector || typeof c !== "number" || !Number.isInteger(c) || c < MIN_CENTS || c > MAX_CENTS || c === s.total) return s;
			return {
				...s,
				total: c,
				paid: []
			};
		}
		if (a.t === "collect") {
			if (s.collector === m.user) return s;
			return {
				...s,
				collector: m.user
			};
		}
		return s;
	},
	onMembers: (s, ctx) => {
		const paid = s.paid.filter((u) => inChat(ctx, u));
		const collector = inChat(ctx, s.collector) ? s.collector : ctx.members[0]?.id ?? "";
		if (paid.length === s.paid.length && collector === s.collector) return s;
		return {
			...s,
			paid,
			collector
		};
	},
	invariants: {
		"shares add up to the total": (s, ctx) => ctx.members.length === 0 || Object.values(shares(s.total, ctx)).reduce((a, c) => a + c, 0) === s.total,
		"shares differ by at most one cent": (s, ctx) => {
			const v = Object.values(shares(s.total, ctx));
			return v.length === 0 || Math.max(...v) - Math.min(...v) <= 1;
		},
		"the total is whole cents from $1 to $1000": (s) => Number.isInteger(s.total) && s.total >= MIN_CENTS && s.total <= MAX_CENTS,
		"everyone who paid is in the chat once": (s, ctx) => new Set(s.paid).size === s.paid.length && s.paid.every((u) => inChat(ctx, u)),
		"the collector is in the chat": (s, ctx) => ctx.members.length === 0 || inChat(ctx, s.collector)
	},
	transitions: {
		"a pay flips only the actor in the paid list": (p, n, a, m) => a.t !== "pay" || p === n || p.paid.includes(m.user) !== n.paid.includes(m.user) && others(p.paid, m.user) === others(n.paid, m.user) && p.total === n.total && p.collector === n.collector,
		"only the collector sets the total, to the amount asked, and paid is cleared": (p, n, a, m) => a.t !== "setTotal" || p === n || m.user === p.collector && n.total === a.cents && n.paid.length === 0 && n.collector === p.collector,
		"a collect makes the actor the collector and changes nothing else": (p, n, a, m) => a.t !== "collect" || p === n || n.collector === m.user && p.collector !== m.user && n.total === p.total && n.paid.join() === p.paid.join(),
		"the total changes only through setTotal": (p, n, a) => p.total === n.total || a.t === "setTotal",
		"the collector changes only through collect": (p, n, a) => p.collector === n.collector || a.t === "collect",
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, _user, r) => {
		const k = r.next();
		if (k < .5) return { t: "pay" };
		if (k < .7) return { t: "collect" };
		return {
			t: "setTotal",
			cents: r.pick([
				4e3,
				4500,
				5e3,
				3e3,
				50,
				12345,
				2e5,
				s.total
			])
		};
	},
	local: {
		draft: "",
		open: false
	},
	view: ({ state, me, members, dispatch, local, setLocal }) => {
		const ctx = { members };
		const sh = shares(state.total, ctx);
		const mine = sh[me] ?? 0;
		const n = members.length;
		const extra = n > 0 ? state.total % n : 0;
		const paidIds = state.paid.filter((u) => inChat(ctx, u));
		const paidCents = paidIds.reduce((a, u) => a + (sh[u] ?? 0), 0);
		const iPaid = state.paid.includes(me);
		const isCollector = me === state.collector;
		const collectorMember = members.find((x) => x.id === state.collector);
		const cents = parseCents(local.draft);
		const submit = () => {
			if (cents === null) return;
			dispatch({
				t: "setTotal",
				cents
			});
			setLocal({
				draft: "",
				open: false
			});
		};
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: CHAT.title,
				subtitle: `${paidIds.length} of ${n} paid · ${money(state.total)}`
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "baseline",
					gap: 8,
					flexWrap: "wrap"
				},
				children: [/* @__PURE__ */ _jsx("h2", {
					style: { margin: 0 },
					children: money(mine)
				}), /* @__PURE__ */ _jsx("small", { children: extra > 0 ? "your share · some pay 1 cent more" : "your share" })]
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 6,
					minHeight: 28
				},
				children: [collectorMember ? /* @__PURE__ */ _jsx(Avatar, {
					user: collectorMember,
					size: 20
				}) : null, /* @__PURE__ */ _jsx("small", { children: collectorMember ? `${isCollector ? "You collect" : `${collectorMember.name} collects`}` : "No collector" })]
			}),
			/* @__PURE__ */ _jsx(Progress, {
				value: paidCents,
				max: Math.max(1, state.total),
				label: `${money(paidCents)} of ${money(state.total)} · ${paidIds.length} paid`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gridTemplateColumns: "1fr 1fr",
					gap: "2px 8px",
					marginTop: 8
				},
				children: members.map((m) => /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 6,
						minHeight: 28,
						minWidth: 0
					},
					children: [
						/* @__PURE__ */ _jsx(Avatar, {
							user: m,
							size: 20
						}),
						/* @__PURE__ */ _jsx("div", {
							style: {
								flex: 1,
								minWidth: 0,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap"
							},
							children: m.id === me ? "You" : m.name
						}),
						/* @__PURE__ */ _jsx("small", {
							style: {
								flexShrink: 0,
								fontWeight: state.paid.includes(m.id) ? 600 : 400
							},
							children: state.paid.includes(m.id) ? "Paid" : money(sh[m.id] ?? 0)
						})
					]
				}, m.id))
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					gap: 8,
					marginTop: 8
				},
				children: [/* @__PURE__ */ _jsx(Button, {
					kind: "primary",
					onClick: () => dispatch({ t: "pay" }),
					children: iPaid ? "Undo" : "I paid"
				}), isCollector ? /* @__PURE__ */ _jsx(Button, {
					kind: "deemphasized",
					onClick: () => setLocal({ open: !local.open }),
					children: "Edit total"
				}) : /* @__PURE__ */ _jsx(Button, {
					kind: "secondary",
					onClick: () => dispatch({ t: "collect" }),
					children: "Collect"
				})]
			}),
			isCollector && local.open ? /* @__PURE__ */ _jsxs("form", {
				style: {
					display: "flex",
					gap: 8,
					marginTop: 8
				},
				onSubmit: (e) => {
					e.preventDefault();
					submit();
				},
				children: [/* @__PURE__ */ _jsx("input", {
					value: local.draft,
					inputMode: "decimal",
					placeholder: "Total, e.g. 45",
					"aria-label": "Total",
					onInput: (e) => setLocal({ draft: e.currentTarget.value })
				}), /* @__PURE__ */ _jsx(Button, {
					disabled: cents === null,
					onClick: submit,
					children: "Update"
				})]
			}) : null,
			/* @__PURE__ */ _jsx("div", {
				style: { marginTop: 4 },
				children: /* @__PURE__ */ _jsx("small", { children: `About ${money(CHAT.pieCents)} a pie · large is ${CHAT.slices} slices` })
			})
		] });
	}
});
