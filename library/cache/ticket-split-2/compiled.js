import { defineApp, Avatar, Button, CardHeader, SystemLine, Progress } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
const P = {
	host: "Jake",
	totalCents: 16800,
	shareCents: 2800,
	owers: [
		"Rhea",
		"Zoe",
		"Dani",
		"Mia"
	],
	paid: [{
		name: "Zoe",
		how: "cash"
	}, {
		name: "Rhea",
		how: "other"
	}],
	notes: [{
		name: "Dani",
		text: "Venmo tomorrow"
	}, {
		name: "Mia",
		text: "Pays at the show"
	}]
};
const HOWS = [
	"cash",
	"venmo",
	"other"
];
const HOW_LABEL = {
	cash: "Cash",
	venmo: "Venmo",
	other: "Other"
};
const MAX_OWERS = 8;
const MAX_NOTE = 30;
const isHow = (x) => x === "cash" || x === "venmo" || x === "other";
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const isPaid = (s, id) => s.paid.some((x) => x.id === id);
const usd = (c) => `$${Math.floor(c / 100)}${c % 100 ? "." + String(c % 100).padStart(2, "0") : ""}`;
const sansPaid = (s) => JSON.stringify({
	...s,
	paid: null
});
const sansNotes = (s) => JSON.stringify({
	...s,
	notes: null
});
const sansOwers = (s) => JSON.stringify({
	...s,
	owers: null
});
const owed = (s) => s.shareCents * (s.owers.length - s.paid.length);
export default defineApp({
	name: "Pay back tracker",
	summary: (s) => `${s.paid.length} of ${s.owers.length} paid back · ${usd(owed(s))} still owed`,
	init: (ctx) => {
		const byName = (n) => ctx.members.find((m) => m.name.toLowerCase() === n.toLowerCase())?.id;
		const host = byName(P.host) ?? ctx.members[0]?.id ?? "";
		const owers = P.owers.map(byName).filter((x) => !!x && x !== host).filter((x, i, a) => a.indexOf(x) === i).slice(0, MAX_OWERS);
		const paid = [];
		for (const p of P.paid) {
			const id = byName(p.name);
			if (id && owers.includes(id) && !paid.some((x) => x.id === id)) paid.push({
				id,
				how: p.how,
				at: 0
			});
		}
		const notes = [];
		for (const n of P.notes) {
			const id = byName(n.name);
			if (id && owers.includes(id) && !notes.some((x) => x.id === id)) notes.push({
				id,
				text: n.text.slice(0, MAX_NOTE)
			});
		}
		return {
			host,
			shareCents: P.shareCents,
			totalCents: P.totalCents,
			owers,
			paid,
			notes
		};
	},
	reduce: (s, a, m, ctx) => {
		if (!inChat(ctx, m.user)) return s;
		if (a.t === "markPaid") {
			if (m.user !== s.host || typeof a.who !== "string" || !s.owers.includes(a.who) || isPaid(s, a.who) || !isHow(a.how)) return s;
			return {
				...s,
				paid: [...s.paid, {
					id: a.who,
					how: a.how,
					at: m.time
				}]
			};
		}
		if (a.t === "iPaid") {
			if (!s.owers.includes(m.user) || isPaid(s, m.user) || !isHow(a.how)) return s;
			return {
				...s,
				paid: [...s.paid, {
					id: m.user,
					how: a.how,
					at: m.time
				}]
			};
		}
		if (a.t === "undo") {
			if (typeof a.who !== "string" || !isPaid(s, a.who)) return s;
			if (m.user !== s.host && m.user !== a.who) return s;
			return {
				...s,
				paid: s.paid.filter((x) => x.id !== a.who)
			};
		}
		if (a.t === "note") {
			if (!s.owers.includes(m.user) || typeof a.text !== "string") return s;
			const text = a.text.trim();
			if (text.length > MAX_NOTE) return s;
			const cur = s.notes.find((x) => x.id === m.user);
			if (text === "") return cur ? {
				...s,
				notes: s.notes.filter((x) => x.id !== m.user)
			} : s;
			if (cur && cur.text === text) return s;
			return {
				...s,
				notes: [...s.notes.filter((x) => x.id !== m.user), {
					id: m.user,
					text
				}]
			};
		}
		if (a.t === "join") {
			if (m.user === s.host || s.owers.includes(m.user) || s.owers.length >= MAX_OWERS) return s;
			return {
				...s,
				owers: [...s.owers, m.user]
			};
		}
		return s;
	},
	onMembers: (s, ctx) => {
		const host = inChat(ctx, s.host) ? s.host : ctx.members[0]?.id ?? "";
		const owers = s.owers.filter((u) => u !== host && inChat(ctx, u));
		const paid = s.paid.filter((x) => owers.includes(x.id));
		const notes = s.notes.filter((x) => owers.includes(x.id));
		if (host === s.host && owers.length === s.owers.length && paid.length === s.paid.length && notes.length === s.notes.length) return s;
		return {
			...s,
			host,
			owers,
			paid,
			notes
		};
	},
	invariants: {
		"everyone paid is an ower, and no one is paid twice": (s) => new Set(s.paid.map((x) => x.id)).size === s.paid.length && s.paid.every((x) => s.owers.includes(x.id) && isHow(x.how)),
		"owers are unique, never the host, at most 8": (s) => new Set(s.owers).size === s.owers.length && !s.owers.includes(s.host) && s.owers.length <= MAX_OWERS,
		"host, owers, paid and notes are all in the chat": (s, ctx) => (s.host === "" ? ctx.members.length === 0 : inChat(ctx, s.host)) && s.owers.every((u) => inChat(ctx, u)) && s.paid.every((x) => inChat(ctx, x.id)) && s.notes.every((x) => inChat(ctx, x.id)),
		"each note belongs to one ower and is 1 to 30 characters": (s) => new Set(s.notes.map((x) => x.id)).size === s.notes.length && s.notes.every((x) => s.owers.includes(x.id) && x.text.length >= 1 && x.text.length <= MAX_NOTE),
		"the share is a positive whole number of cents and what is owed is never negative": (s) => Number.isInteger(s.shareCents) && s.shareCents > 0 && owed(s) >= 0 && owed(s) === s.shareCents * (s.owers.length - s.paid.length)
	},
	transitions: {
		"only the host marks someone paid, adding exactly that person": (p, n, a, m) => a.t !== "markPaid" || p === n || m.user === p.host && !isPaid(p, a.who) && n.paid.length === p.paid.length + 1 && n.paid.some((x) => x.id === a.who && x.how === a.how && x.at === m.time) && sansPaid(p) === sansPaid(n),
		"I paid adds exactly the actor, who is an ower": (p, n, a, m) => a.t !== "iPaid" || p === n || p.owers.includes(m.user) && !isPaid(p, m.user) && n.paid.length === p.paid.length + 1 && n.paid.some((x) => x.id === m.user && x.how === a.how && x.at === m.time) && sansPaid(p) === sansPaid(n),
		"undo removes one entry, only by the host or that person": (p, n, a, m) => a.t !== "undo" || p === n || (m.user === p.host || m.user === a.who) && isPaid(p, a.who) && n.paid.length === p.paid.length - 1 && !isPaid(n, a.who) && sansPaid(p) === sansPaid(n),
		"a note changes only the actor's own note, and only for an ower": (p, n, a, m) => a.t !== "note" || p === n || p.owers.includes(m.user) && sansNotes(p) === sansNotes(n) && JSON.stringify(p.notes.filter((x) => x.id !== m.user)) === JSON.stringify(n.notes.filter((x) => x.id !== m.user)) && n.notes.filter((x) => x.id === m.user).length === (a.text.trim() === "" ? 0 : 1) && (a.text.trim() === "" || n.notes.find((x) => x.id === m.user)?.text === a.text.trim()),
		"joining appends only the actor to owers": (p, n, a, m) => a.t !== "join" || p === n || m.user !== p.host && n.owers.join() === [...p.owers, m.user].join() && sansOwers(p) === sansOwers(n),
		"host, share and total never change by an action": (p, n) => p.host === n.host && p.shareCents === n.shareCents && p.totalCents === n.totalCents,
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, _user, r) => {
		const x = r.next();
		if (x < .3) return {
			t: "iPaid",
			how: r.pick(HOWS)
		};
		if (x < .5 && s.owers.length) return {
			t: "markPaid",
			who: r.pick(s.owers),
			how: r.pick(HOWS)
		};
		if (x < .65 && s.paid.length) return {
			t: "undo",
			who: r.pick(s.paid).id
		};
		if (x < .8) return {
			t: "note",
			text: r.pick([
				"Venmo tomorrow",
				"At the show",
				"",
				"x".repeat(31)
			])
		};
		return { t: "join" };
	},
	local: {
		how: "venmo",
		noting: false,
		draft: ""
	},
	view: ({ state, me, members, dispatch, local, setLocal }) => {
		const nameOf = (id) => members.find((m) => m.id === id)?.name ?? "Someone";
		const hostName = nameOf(state.host);
		const isHost = me === state.host;
		const iAmOwer = state.owers.includes(me);
		const myPaid = isPaid(state, me);
		const myNote = state.notes.find((x) => x.id === me)?.text ?? "";
		const back = state.shareCents * state.paid.length;
		const due = state.shareCents * state.owers.length;
		const done = state.owers.length > 0 && state.paid.length === state.owers.length;
		const nextHow = () => setLocal({ how: HOWS[(HOWS.indexOf(local.how) + 1) % HOWS.length] });
		const saveNote = () => {
			dispatch({
				t: "note",
				text: local.draft.trim().slice(0, MAX_NOTE)
			});
			setLocal({
				noting: false,
				draft: ""
			});
		};
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: `Who has paid ${hostName} back?`,
				subtitle: `${hostName} paid ${usd(state.totalCents)} · ${usd(state.shareCents)} each`
			}),
			/* @__PURE__ */ _jsx(Progress, {
				value: back,
				max: Math.max(1, due),
				label: `${usd(back)} of ${usd(due)} back · ${state.paid.length} of ${state.owers.length} paid`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: { marginTop: 4 },
				children: state.owers.map((id) => {
					const p = state.paid.find((x) => x.id === id);
					const note = state.notes.find((x) => x.id === id)?.text ?? "";
					const line = p ? p.how === "other" ? "" : `by ${p.how}` : note;
					return /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							minHeight: 44
						},
						children: [
							/* @__PURE__ */ _jsx(Avatar, {
								user: id,
								size: 24
							}),
							/* @__PURE__ */ _jsxs("div", {
								style: {
									flex: 1,
									minWidth: 0
								},
								children: [/* @__PURE__ */ _jsx("div", {
									style: { fontWeight: 600 },
									children: id === me ? "You" : nameOf(id)
								}), line ? /* @__PURE__ */ _jsx("small", { children: line }) : null]
							}),
							isHost ? p ? /* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => dispatch({
									t: "undo",
									who: id
								}),
								children: "Undo"
							}) : /* @__PURE__ */ _jsx(Button, {
								kind: "secondary",
								onClick: () => dispatch({
									t: "markPaid",
									who: id,
									how: local.how
								}),
								children: "Mark paid"
							}) : id === me && p ? /* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => dispatch({
									t: "undo",
									who: id
								}),
								children: "Undo"
							}) : /* @__PURE__ */ _jsx("small", { children: p ? "Paid" : `Owes ${usd(state.shareCents)}` })
						]
					}, id);
				})
			}),
			done ? /* @__PURE__ */ _jsx(SystemLine, { children: `Everyone paid ${hostName} back` }) : null,
			/* @__PURE__ */ _jsx("div", {
				style: { marginTop: 8 },
				children: local.noting && iAmOwer ? /* @__PURE__ */ _jsxs("form", {
					style: {
						display: "flex",
						gap: 8
					},
					onSubmit: (e) => {
						e.preventDefault();
						saveNote();
					},
					children: [/* @__PURE__ */ _jsx("div", {
						style: { flex: 1 },
						children: /* @__PURE__ */ _jsx("input", {
							value: local.draft,
							maxLength: MAX_NOTE,
							placeholder: "Note, like Venmo tomorrow",
							"aria-label": "Note",
							onInput: (e) => setLocal({ draft: e.currentTarget.value })
						})
					}), /* @__PURE__ */ _jsx(Button, {
						kind: "secondary",
						onClick: saveNote,
						children: "Save"
					})]
				}) : isHost ? /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8
					},
					children: [/* @__PURE__ */ _jsx("small", { children: "Mark as" }), /* @__PURE__ */ _jsx(Button, {
						kind: "deemphasized",
						onClick: nextHow,
						children: HOW_LABEL[local.how]
					})]
				}) : iAmOwer ? /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						gap: 8
					},
					children: [
						!myPaid ? /* @__PURE__ */ _jsx("div", {
							style: {
								flex: 1,
								display: "flex"
							},
							children: /* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								wide: true,
								onClick: nextHow,
								children: HOW_LABEL[local.how]
							})
						}) : null,
						/* @__PURE__ */ _jsx("div", {
							style: {
								flex: 1,
								display: "flex"
							},
							children: /* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								wide: true,
								onClick: () => setLocal({
									noting: true,
									draft: myNote
								}),
								children: "Note"
							})
						}),
						!myPaid ? /* @__PURE__ */ _jsx("div", {
							style: {
								flex: 1,
								display: "flex"
							},
							children: /* @__PURE__ */ _jsx(Button, {
								kind: "primary",
								wide: true,
								onClick: () => dispatch({
									t: "iPaid",
									how: local.how
								}),
								children: "I paid"
							})
						}) : null
					]
				}) : /* @__PURE__ */ _jsx(Button, {
					kind: "secondary",
					onClick: () => dispatch({ t: "join" }),
					children: "Add me"
				})
			})
		] });
	}
});
