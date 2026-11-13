import { defineApp, Button, CardHeader, SystemLine } from "@muse/app";
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "@muse/app/jsx-runtime";
const C = {
	title: "Lily's birthday dinner",
	place: "Gen BBQ",
	when: "Sat 7:30 pm",
	priceCents: 3200,
	deadline: "Thursday 5 pm",
	host: "Maya",
	membersIn: [
		"Maya",
		"Theo",
		"Ravi",
		"Lily"
	],
	memberDiets: { Ravi: "no pork" },
	guests: [
		{
			name: "Dani",
			status: "in",
			diet: "shellfish allergy",
			note: "Said yes",
			by: "Maya"
		},
		{
			name: "Jess",
			status: "waiting",
			diet: "vegetarian",
			note: "Theo will text her",
			by: "Theo"
		},
		{
			name: "Priya",
			status: "maybe",
			diet: "",
			note: "Ravi will ask her",
			by: "Ravi"
		}
	]
};
const MAX_GUESTS = 10;
const MAX_TEXT = 30;
const STATUSES = [
	"in",
	"maybe",
	"no"
];
const GSTATUSES = [
	"in",
	"maybe",
	"waiting",
	"no"
];
const LABEL = {
	in: "In",
	maybe: "Maybe",
	waiting: "Waiting",
	no: "Out"
};
const NEXT = {
	waiting: "in",
	in: "maybe",
	maybe: "no",
	no: "waiting"
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const clean = (x) => x.trim().replace(/\s+/g, " ");
const isStatus = (x) => x === "in" || x === "maybe" || x === "no";
const isGStatus = (x) => x === "waiting" || isStatus(x);
const j = (x) => JSON.stringify(x);
const rest = (rec, user) => j(Object.entries(rec).filter(([k]) => k !== user).sort());
function keep(r, ctx) {
	return Object.keys(r).every((k) => inChat(ctx, k)) ? r : Object.fromEntries(Object.entries(r).filter(([k]) => inChat(ctx, k)));
}
function tally(s, members) {
	const out = {
		in: 0,
		maybe: 0,
		no: 0,
		waiting: 0
	};
	for (const m of members) {
		const r = s.replies[m.id];
		if (r === undefined) out.waiting += 1;
		else out[r] += 1;
	}
	for (const g of s.guests) out[g.status] += 1;
	return out;
}
const canEdit = (s, g, user) => user === g.by || user === s.host;
export default defineApp({
	name: "Headcount",
	summary: (s, ctx) => {
		const t = tally(s, ctx.members);
		if (s.locked) return `${C.title}: final count sent · ${t.in} people.`;
		return `${C.title}: ${t.in} in · ${t.maybe} maybe · ${t.waiting} waiting. Names due ${C.deadline}.`;
	},
	init: (ctx) => {
		const idOf = (name) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id;
		const host = idOf(C.host) ?? ctx.members[0]?.id ?? "";
		const replies = {};
		for (const n of C.membersIn) {
			const id = idOf(n);
			if (id) replies[id] = "in";
		}
		const memberDiets = {};
		for (const [n, d] of Object.entries(C.memberDiets)) {
			const id = idOf(n);
			if (id) memberDiets[id] = d;
		}
		const guests = C.guests.map((g, i) => ({
			id: `s${i}`,
			name: g.name,
			status: g.status,
			diet: g.diet,
			note: g.note,
			by: idOf(g.by) ?? host
		}));
		return {
			host,
			replies,
			memberDiets,
			guests,
			locked: false
		};
	},
	reduce: (s, a, m, ctx) => {
		if (s.locked || !inChat(ctx, m.user)) return s;
		if (a.t === "reply") {
			if (!isStatus(a.status) || s.replies[m.user] === a.status) return s;
			return {
				...s,
				replies: {
					...s.replies,
					[m.user]: a.status
				}
			};
		}
		if (a.t === "setDiet") {
			if (typeof a.diet !== "string") return s;
			const d = clean(a.diet);
			if (d.length > MAX_TEXT || (s.memberDiets[m.user] ?? "") === d) return s;
			const others = Object.fromEntries(Object.entries(s.memberDiets).filter(([k]) => k !== m.user));
			return {
				...s,
				memberDiets: d ? {
					...others,
					[m.user]: d
				} : others
			};
		}
		if (a.t === "addGuest") {
			if (typeof a.name !== "string" || typeof a.diet !== "string") return s;
			const name = clean(a.name);
			const diet = clean(a.diet);
			if (!name || name.length > MAX_TEXT || diet.length > MAX_TEXT || s.guests.length >= MAX_GUESTS) return s;
			if (s.guests.some((g) => g.name.toLowerCase() === name.toLowerCase())) return s;
			return {
				...s,
				guests: [...s.guests, {
					id: `g${m.seq}`,
					name,
					status: "waiting",
					diet,
					note: "",
					by: m.user
				}]
			};
		}
		if (a.t === "setGuest") {
			if (typeof a.guest !== "string" || !isGStatus(a.status)) return s;
			const g = s.guests.find((x) => x.id === a.guest);
			if (!g || !canEdit(s, g, m.user) || g.status === a.status) return s;
			const status = a.status;
			return {
				...s,
				guests: s.guests.map((x) => x.id === g.id ? {
					...x,
					status
				} : x)
			};
		}
		if (a.t === "removeGuest") {
			if (typeof a.guest !== "string") return s;
			const g = s.guests.find((x) => x.id === a.guest);
			if (!g || !canEdit(s, g, m.user)) return s;
			return {
				...s,
				guests: s.guests.filter((x) => x.id !== g.id)
			};
		}
		if (a.t === "lock") return m.user === s.host ? {
			...s,
			locked: true
		} : s;
		return s;
	},
	// Someone left: their reply and diet go, and guests they followed up on pass to the host.
	onMembers: (s, ctx) => {
		if (ctx.members.length === 0) return s;
		const host = inChat(ctx, s.host) ? s.host : ctx.members[0].id;
		const replies = keep(s.replies, ctx);
		const memberDiets = keep(s.memberDiets, ctx);
		const guests = s.guests.every((g) => inChat(ctx, g.by)) ? s.guests : s.guests.map((g) => inChat(ctx, g.by) ? g : {
			...g,
			by: host
		});
		if (host === s.host && replies === s.replies && memberDiets === s.memberDiets && guests === s.guests) return s;
		return {
			...s,
			host,
			replies,
			memberDiets,
			guests
		};
	},
	invariants: {
		"replies and diets belong to people in the chat": (s, ctx) => ctx.members.length === 0 || Object.keys(s.replies).every((k) => inChat(ctx, k)) && Object.keys(s.memberDiets).every((k) => inChat(ctx, k)),
		"every reply is in, maybe or no": (s) => Object.values(s.replies).every(isStatus),
		"guest ids and names are unique and statuses are valid": (s) => new Set(s.guests.map((g) => g.id)).size === s.guests.length && new Set(s.guests.map((g) => g.name.toLowerCase())).size === s.guests.length && s.guests.every((g) => isGStatus(g.status) && g.name.length > 0),
		"at most 10 guests and every diet is at most 30 characters": (s) => s.guests.length <= MAX_GUESTS && s.guests.every((g) => g.diet.length <= MAX_TEXT && g.name.length <= MAX_TEXT) && Object.values(s.memberDiets).every((d) => d.length > 0 && d.length <= MAX_TEXT),
		"the host is in the chat": (s, ctx) => ctx.members.length === 0 || inChat(ctx, s.host),
		"every guest is followed up by someone in the chat": (s, ctx) => ctx.members.length === 0 || s.guests.every((g) => inChat(ctx, g.by))
	},
	transitions: {
		"a reply changes only the actor's own reply": (p, n, a, m) => a.t !== "reply" || p === n || n.replies[m.user] === a.status && rest(p.replies, m.user) === rest(n.replies, m.user) && j(p.memberDiets) === j(n.memberDiets) && j(p.guests) === j(n.guests) && p.host === n.host && p.locked === n.locked,
		"a diet change sets only the actor's own diet": (p, n, a, m) => a.t !== "setDiet" || p === n || (n.memberDiets[m.user] ?? "") === clean(a.diet) && rest(p.memberDiets, m.user) === rest(n.memberDiets, m.user) && j(p.replies) === j(n.replies) && j(p.guests) === j(n.guests),
		"adding a guest appends one waiting guest owned by the actor": (p, n, a, m) => {
			if (a.t !== "addGuest" || p === n) return true;
			const last = n.guests.at(-1);
			return n.guests.length === p.guests.length + 1 && !!last && last.id === `g${m.seq}` && last.status === "waiting" && last.by === m.user && last.name === clean(a.name) && last.diet === clean(a.diet) && j(n.guests.slice(0, -1)) === j(p.guests) && j(p.replies) === j(n.replies) && j(p.memberDiets) === j(n.memberDiets);
		},
		"a guest status change touches only that guest, by its owner or the host": (p, n, a, m) => {
			if (a.t !== "setGuest" || p === n) return true;
			const pg = p.guests.find((g) => g.id === a.guest);
			const ng = n.guests.find((g) => g.id === a.guest);
			return !!pg && !!ng && (m.user === pg.by || m.user === p.host) && ng.status === a.status && j({
				...ng,
				status: pg.status
			}) === j(pg) && n.guests.length === p.guests.length && j(p.guests.filter((g) => g.id !== a.guest)) === j(n.guests.filter((g) => g.id !== a.guest)) && j(p.replies) === j(n.replies);
		},
		"removing a guest removes exactly that guest, by its owner or the host": (p, n, a, m) => {
			if (a.t !== "removeGuest" || p === n) return true;
			const pg = p.guests.find((g) => g.id === a.guest);
			return !!pg && (m.user === pg.by || m.user === p.host) && n.guests.length === p.guests.length - 1 && j(n.guests) === j(p.guests.filter((g) => g.id !== a.guest)) && j(p.replies) === j(n.replies);
		},
		"only the host locks, and nothing changes once it is locked": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user) && !p.locked && (a.t !== "lock" || m.user === p.host && n.locked && j({
			...n,
			locked: false
		}) === j(p))
	},
	arbitrary: (s, user, r) => {
		const x = r.next();
		if (x < .3) return {
			t: "reply",
			status: r.pick(STATUSES)
		};
		if (x < .4) return {
			t: "setDiet",
			diet: r.pick([
				"vegan",
				"no nuts",
				"halal",
				""
			])
		};
		if (x < .55) return {
			t: "addGuest",
			name: r.pick([
				"Kai",
				"Noor",
				"Dani",
				"Sam's friend",
				""
			]),
			diet: r.pick(["", "halal"])
		};
		if (x < .85 && s.guests.length) return {
			t: "setGuest",
			guest: r.pick(s.guests).id,
			status: r.pick(GSTATUSES)
		};
		if (x < .93 && s.guests.length) return {
			t: "removeGuest",
			guest: r.pick(s.guests).id
		};
		if (x < .96 && user === s.host) return { t: "lock" };
		return {
			t: "reply",
			status: r.pick(STATUSES)
		};
	},
	local: {
		draft: "",
		mode: "guest"
	},
	view: ({ state, me, members, dispatch, local, setLocal }) => {
		const t = tally(state, members);
		const mine = state.replies[me] ?? null;
		const isHost = state.host === me;
		const nameOf = (id) => id === me ? "you" : members.find((m) => m.id === id)?.name ?? "someone";
		const waiting = members.filter((m) => state.replies[m.id] === undefined).map((m) => m.id === me ? "you" : m.name);
		const dietBits = members.filter((m) => state.memberDiets[m.id]).map((m) => `${m.id === me ? "You" : m.name} ${state.memberDiets[m.id]}`);
		const bits = [...waiting.length && !state.locked ? [`Waiting on ${waiting.slice(0, 3).join(", ")}`] : [], ...dietBits];
		const price = `$${Math.floor(C.priceCents / 100)} each`;
		const dietMode = local.mode === "diet";
		const draftName = clean(local.draft.split(",")[0] ?? "");
		const canSubmit = dietMode ? clean(local.draft).length <= MAX_TEXT : draftName.length > 0;
		const submit = () => {
			if (!canSubmit) return;
			if (dietMode) {
				dispatch({
					t: "setDiet",
					diet: clean(local.draft)
				});
				setLocal({
					draft: "",
					mode: "guest"
				});
				return;
			}
			const [, ...more] = local.draft.split(",");
			dispatch({
				t: "addGuest",
				name: draftName.slice(0, MAX_TEXT),
				diet: clean(more.join(" ")).slice(0, MAX_TEXT)
			});
			setLocal({ draft: "" });
		};
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: C.title,
				subtitle: `${t.in} in · ${t.maybe} maybe · ${t.waiting} waiting`
			}),
			/* @__PURE__ */ _jsx("small", {
				style: {
					display: "block",
					marginBottom: 6
				},
				children: `${C.place} · ${C.when} · ${price} · names due ${C.deadline}`
			}),
			state.locked ? null : /* @__PURE__ */ _jsx("div", {
				style: {
					display: "flex",
					gap: 8,
					marginBottom: 6
				},
				children: STATUSES.map((k) => /* @__PURE__ */ _jsx("div", {
					style: {
						flex: 1,
						display: "flex"
					},
					children: /* @__PURE__ */ _jsx(Button, {
						kind: mine === k ? "primary" : "secondary",
						wide: true,
						onClick: () => dispatch({
							t: "reply",
							status: k
						}),
						children: LABEL[k]
					})
				}, k))
			}),
			bits.length ? /* @__PURE__ */ _jsx("small", {
				style: {
					display: "block",
					marginBottom: 6
				},
				children: bits.join(" · ")
			}) : null,
			/* @__PURE__ */ _jsx("div", {
				style: {
					maxHeight: 132,
					overflow: "auto"
				},
				children: state.guests.map((g) => {
					const allowed = !state.locked && canEdit(state, g, me);
					const detail = [g.diet, g.note].filter(Boolean).join(" · ") || `Added by ${nameOf(g.by)}`;
					return /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: 44
						},
						children: [/* @__PURE__ */ _jsxs("div", {
							style: {
								flex: 1,
								minWidth: 0
							},
							children: [/* @__PURE__ */ _jsx("div", {
								style: {
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap"
								},
								children: g.name
							}), /* @__PURE__ */ _jsx("small", {
								style: {
									display: "block",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap"
								},
								children: detail
							})]
						}), allowed ? /* @__PURE__ */ _jsxs(_Fragment, { children: [/* @__PURE__ */ _jsx(Button, {
							kind: "secondary",
							onClick: () => dispatch({
								t: "setGuest",
								guest: g.id,
								status: NEXT[g.status]
							}),
							children: LABEL[g.status]
						}), /* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							"aria-label": "Remove guest",
							onClick: () => dispatch({
								t: "removeGuest",
								guest: g.id
							}),
							children: "×"
						})] }) : /* @__PURE__ */ _jsx("small", { children: LABEL[g.status] })]
					}, g.id);
				})
			}),
			state.locked ? /* @__PURE__ */ _jsx("div", {
				style: { marginTop: 6 },
				children: /* @__PURE__ */ _jsx(SystemLine, { children: `Final count sent · ${t.in} people` })
			}) : /* @__PURE__ */ _jsxs("div", {
				style: { marginTop: 6 },
				children: [/* @__PURE__ */ _jsxs("form", {
					style: {
						display: "flex",
						gap: 8,
						alignItems: "center"
					},
					onSubmit: (e) => {
						e.preventDefault();
						submit();
					},
					children: [/* @__PURE__ */ _jsx("input", {
						value: local.draft,
						maxLength: 61,
						placeholder: dietMode ? "Your diet" : "Add guest, diet",
						"aria-label": dietMode ? "Your diet" : "Add guest",
						onInput: (e) => setLocal({ draft: e.currentTarget.value })
					}), /* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						disabled: !canSubmit,
						onClick: submit,
						children: dietMode ? "Save" : "Add"
					})]
				}), /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						gap: 8,
						marginTop: 4
					},
					children: [/* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						onClick: () => dietMode ? setLocal({
							mode: "guest",
							draft: ""
						}) : setLocal({
							mode: "diet",
							draft: state.memberDiets[me] ?? ""
						}),
						children: dietMode ? "Add guest" : "My diet"
					}), isHost ? /* @__PURE__ */ _jsx(Button, {
						kind: "secondary",
						onClick: () => dispatch({ t: "lock" }),
						children: "Send count"
					}) : null]
				})]
			})
		] });
	}
});
