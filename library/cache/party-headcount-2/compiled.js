import { defineApp, Avatar, Button, CardHeader } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Headcount for the friendsgiving turkey: who is coming, plus ones included.
const CHAT = {
	title: "Who's coming to friendsgiving?",
	host: "Lena",
	maxPlus: 3,
	plusLocked: true,
	people: [
		{
			name: "Lena",
			plus: []
		},
		{
			name: "Kofi",
			plus: ["Tara"]
		},
		{
			name: "Maya",
			plus: ["Sam"]
		},
		{
			name: "Rhea",
			plus: []
		}
	]
};
const MAX_NAME = 30;
const clean = (x) => x.trim().replace(/\s+/g, " ");
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const entry = (s, id) => s.guests.find((g) => g.id === id);
const plusCount = (s) => s.guests.reduce((n, g) => n + g.plus.length, 0);
const goingCount = (s) => s.guests.filter((g) => g.status === "going").length;
const headcount = (s) => goingCount(s) + plusCount(s);
const othersSame = (p, n, user) => JSON.stringify(p.guests.filter((g) => g.id !== user)) === JSON.stringify(n.guests.filter((g) => g.id !== user));
const allPlusIds = (s) => s.guests.flatMap((g) => g.plus.map((x) => x.id));
const plusWord = (n) => n === 1 ? "plus one" : "plus ones";
export default defineApp({
	name: "Headcount",
	summary: (s) => `${headcount(s)} coming · ${goingCount(s)} people, ${plusCount(s)} ${plusWord(plusCount(s))}`,
	init: (ctx) => {
		const host = ctx.members.find((m) => m.name.toLowerCase() === CHAT.host.toLowerCase())?.id ?? ctx.members[0]?.id ?? "";
		let k = 0;
		const guests = [];
		for (const p of CHAT.people) {
			const mem = ctx.members.find((m) => m.name.toLowerCase() === p.name.toLowerCase());
			if (!mem || guests.some((g) => g.id === mem.id)) continue;
			guests.push({
				id: mem.id,
				status: "going",
				plus: p.plus.map((name) => ({
					id: `c${k++}`,
					name
				}))
			});
		}
		return {
			host,
			plusLocked: CHAT.plusLocked,
			maxPlus: CHAT.maxPlus,
			guests
		};
	},
	reduce: (s, a, m, ctx) => {
		if (!inChat(ctx, m.user)) return s;
		const me = m.user;
		const cur = entry(s, me);
		if (a.t === "rsvp") {
			if (a.status !== "going" && a.status !== "no") return s;
			if (cur && cur.status === a.status) return s;
			if (!cur) return {
				...s,
				guests: [...s.guests, {
					id: me,
					status: a.status,
					plus: []
				}]
			};
			return {
				...s,
				guests: s.guests.map((g) => g.id === me ? {
					...g,
					status: a.status,
					plus: a.status === "no" ? [] : g.plus
				} : g)
			};
		}
		if (a.t === "addPlus") {
			if (!cur || cur.status !== "going") return s;
			if (s.plusLocked && me !== s.host) return s;
			if (typeof a.name !== "string") return s;
			const name = clean(a.name);
			if (!name || name.length > MAX_NAME || cur.plus.length >= s.maxPlus) return s;
			if (cur.plus.some((p) => p.name.toLowerCase() === name.toLowerCase())) return s;
			return {
				...s,
				guests: s.guests.map((g) => g.id === me ? {
					...g,
					plus: [...g.plus, {
						id: `p${m.seq}`,
						name
					}]
				} : g)
			};
		}
		if (a.t === "removePlus") {
			if (!cur || typeof a.plus !== "string") return s;
			if (!cur.plus.some((p) => p.id === a.plus)) return s;
			return {
				...s,
				guests: s.guests.map((g) => g.id === me ? {
					...g,
					plus: g.plus.filter((p) => p.id !== a.plus)
				} : g)
			};
		}
		if (a.t === "lock") {
			if (me !== s.host || typeof a.locked !== "boolean" || a.locked === s.plusLocked) return s;
			return {
				...s,
				plusLocked: a.locked
			};
		}
		return s;
	},
	onMembers: (s, ctx) => {
		const guests = s.guests.filter((g) => inChat(ctx, g.id));
		const host = ctx.members.length === 0 || inChat(ctx, s.host) ? s.host : ctx.members[0].id;
		if (guests.length === s.guests.length && host === s.host) return s;
		return {
			...s,
			guests,
			host
		};
	},
	invariants: {
		"each guest appears once and is in the chat": (s, ctx) => new Set(s.guests.map((g) => g.id)).size === s.guests.length && s.guests.every((g) => inChat(ctx, g.id)),
		"anyone who can't go has no plus ones": (s) => s.guests.every((g) => g.status === "going" || g.plus.length === 0),
		"no one has more plus ones than the limit": (s) => s.guests.every((g) => g.plus.length <= s.maxPlus),
		"plus one ids are unique and names are 1 to 30 clean characters": (s) => new Set(allPlusIds(s)).size === allPlusIds(s).length && s.guests.every((g) => g.plus.every((p) => p.name.length >= 1 && p.name.length <= MAX_NAME && p.name === clean(p.name))),
		"the host is in the chat": (s, ctx) => ctx.members.length === 0 || inChat(ctx, s.host),
		"headcount is the people going plus all plus ones, within the limit": (s, ctx) => headcount(s) === s.guests.filter((g) => g.status === "going").length + s.guests.reduce((n, g) => n + g.plus.length, 0) && headcount(s) <= Math.max(1, ctx.members.length) * (1 + s.maxPlus)
	},
	transitions: {
		"an rsvp sets the actor's own status and no one else's": (p, n, a, m) => {
			if (a.t !== "rsvp" || p === n) return true;
			const mine = entry(n, m.user);
			const before = entry(p, m.user);
			return !!mine && mine.status === a.status && othersSame(p, n, m.user) && p.plusLocked === n.plusLocked && (a.status === "no" ? mine.plus.length === 0 : (before?.plus.length ?? 0) === mine.plus.length);
		},
		"an added plus one is named as asked, goes to the actor, and no one else changes": (p, n, a, m) => {
			if (a.t !== "addPlus" || p === n) return true;
			const before = entry(p, m.user);
			const after = entry(n, m.user);
			if (!before || !after || typeof a.name !== "string") return false;
			const last = after.plus.at(-1);
			return after.plus.length === before.plus.length + 1 && !!last && last.name === clean(a.name) && last.id === `p${m.seq}` && othersSame(p, n, m.user);
		},
		"a removed plus one leaves the actor's own list and nothing else changes": (p, n, a, m) => {
			if (a.t !== "removePlus" || p === n) return true;
			const before = entry(p, m.user);
			const after = entry(n, m.user);
			return !!before && !!after && before.plus.some((x) => x.id === a.plus) && after.plus.length === before.plus.length - 1 && !after.plus.some((x) => x.id === a.plus) && othersSame(p, n, m.user);
		},
		"only the host changes whether plus ones are open, and nothing else changes with it": (p, n, a, m) => {
			if (p.plusLocked === n.plusLocked) return a.t !== "lock" || p === n || false;
			return a.t === "lock" && m.user === p.host && n.plusLocked === a.locked && p.guests === n.guests;
		},
		"while plus ones are closed, only the host adds one": (p, n, a, m) => a.t !== "addPlus" || p === n || !p.plusLocked || m.user === p.host,
		"the host and the limit never change from an action": (p, n) => p.host === n.host && p.maxPlus === n.maxPlus,
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		const mine = entry(s, user);
		const x = r.next();
		if (!mine || x < .1) return {
			t: "rsvp",
			status: !mine ? "going" : r.pick(["going", "no"])
		};
		if (mine.status === "going" && x < .5) return {
			t: "addPlus",
			name: r.pick([
				"Tara",
				"Sam",
				"Jo",
				"",
				"  Priya ",
				"Alex"
			])
		};
		if (x < .65 && mine.plus.length) return {
			t: "removePlus",
			plus: r.next() < .8 ? r.pick(mine.plus).id : "zz"
		};
		if (x < .85) return {
			t: "lock",
			locked: r.next() < .5
		};
		return {
			t: "rsvp",
			status: r.pick([
				"going",
				"going",
				"no"
			])
		};
	},
	local: { draft: "" },
	view: ({ state, me, members, dispatch, local, setLocal }) => {
		const total = headcount(state);
		const plusN = plusCount(state);
		const goingN = goingCount(state);
		const mine = entry(state, me);
		const isHost = me === state.host;
		const going = mine?.status === "going";
		const canAdd = going && (!state.plusLocked || isHost) && (mine?.plus.length ?? 0) < state.maxPlus;
		const draft = clean(local.draft);
		const answered = state.guests.length;
		const ordered = [...members.filter((m) => m.id === me), ...members.filter((m) => m.id !== me)];
		const submit = () => {
			if (!canAdd || !draft) return;
			dispatch({
				t: "addPlus",
				name: local.draft.slice(0, MAX_NAME)
			});
			setLocal({ draft: "" });
		};
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: CHAT.title,
				subtitle: `${answered} of ${members.length} answered`
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: { marginTop: 4 },
				children: [/* @__PURE__ */ _jsx("h2", {
					style: { margin: 0 },
					children: `${total} coming`
				}), /* @__PURE__ */ _jsx("small", { children: `${goingN} people + ${plusN} ${plusWord(plusN)} · ${state.plusLocked ? "plus ones closed" : "plus ones open"}` })]
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 4,
					marginTop: 8
				},
				children: ordered.map((m) => {
					const g = entry(state, m.id);
					return /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: 34
						},
						children: [
							/* @__PURE__ */ _jsx(Avatar, {
								user: m,
								size: 24
							}),
							/* @__PURE__ */ _jsxs("div", {
								style: {
									flex: 1,
									minWidth: 0,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap"
								},
								children: [m.id === me ? "You" : m.name, m.id === state.host ? /* @__PURE__ */ _jsx("small", { children: " · host" }) : null]
							}),
							g && g.status === "going" && g.plus.length ? /* @__PURE__ */ _jsx("div", {
								style: {
									display: "flex",
									flexWrap: "wrap",
									gap: 4,
									justifyContent: "flex-end",
									maxWidth: "55%"
								},
								children: g.plus.map((p) => /* @__PURE__ */ _jsx("span", {
									style: {
										background: "var(--color-input)",
										color: "var(--color-text)",
										borderRadius: 999,
										padding: "2px 8px",
										maxWidth: 90,
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
										fontSize: 13
									},
									children: p.name
								}, p.id))
							}) : /* @__PURE__ */ _jsx("small", { children: !g ? "No answer" : g.status === "going" ? "Going" : "Can't go" })
						]
					}, m.id);
				})
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 4,
					marginTop: 8
				},
				children: [
					!going ? /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							gap: 8
						},
						children: [/* @__PURE__ */ _jsx(Button, {
							kind: "primary",
							onClick: () => dispatch({
								t: "rsvp",
								status: "going"
							}),
							children: "Going"
						}), !mine ? /* @__PURE__ */ _jsx(Button, {
							kind: "secondary",
							onClick: () => dispatch({
								t: "rsvp",
								status: "no"
							}),
							children: "Can't go"
						}) : null]
					}) : null,
					canAdd ? /* @__PURE__ */ _jsxs("form", {
						style: {
							display: "flex",
							gap: 8
						},
						onSubmit: (e) => {
							e.preventDefault();
							submit();
						},
						children: [/* @__PURE__ */ _jsx("input", {
							value: local.draft,
							maxLength: MAX_NAME,
							placeholder: "Plus one's name",
							"aria-label": "Plus one's name",
							onInput: (e) => setLocal({ draft: e.currentTarget.value })
						}), /* @__PURE__ */ _jsx(Button, {
							kind: "secondary",
							disabled: !draft,
							onClick: submit,
							children: "Add"
						})]
					}) : null,
					going || isHost ? /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							flexWrap: "wrap",
							gap: 8
						},
						children: [
							going && mine ? mine.plus.map((p) => /* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => dispatch({
									t: "removePlus",
									plus: p.id
								}),
								children: `Remove ${p.name.slice(0, 10)}`
							}, p.id)) : null,
							going ? /* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => dispatch({
									t: "rsvp",
									status: "no"
								}),
								children: "Can't go"
							}) : null,
							isHost ? /* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => dispatch({
									t: "lock",
									locked: !state.plusLocked
								}),
								children: state.plusLocked ? "Reopen" : "Close"
							}) : null
						]
					}) : null
				]
			})
		] });
	}
});
