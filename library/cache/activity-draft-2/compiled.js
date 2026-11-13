import { defineApp, Avatar, Button, CardHeader, SystemLine, rng, running } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Snake draft for Austin spring break. Start draws the order from the server's seed; the order
// snakes (1 2 3, 3 2 1, ...). One pick per turn until the limit is reached or the board is empty.
const C = {
	title: "Austin spring break draft",
	items: [
		"Barton Springs",
		"Franklin BBQ",
		"Bat bridge at sunset",
		"South Congress thrifting",
		"Kayaking on Lady Bird Lake"
	],
	limit: 5
};
const MAX_ITEMS = 8;
const MAX_LABEL = 40;
const clean = (x) => x.trim().replace(/\s+/g, " ");
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const picked = (s) => s.items.filter((o) => o.by !== null).length;
const isDone = (s) => s.started && (s.pos >= s.limit || s.items.every((o) => o.by !== null));
const turnOf = (s) => {
	if (!s.started || s.order.length === 0) return null;
	const n = s.order.length;
	const r = Math.floor(s.pos / n);
	const i = r % 2 === 0 ? s.pos % n : n - 1 - s.pos % n;
	return s.order[i] ?? null;
};
const blank = (s) => ({
	...s,
	items: s.items.map((o) => ({
		...o,
		by: null
	})),
	order: [],
	started: false,
	startedAt: 0,
	pos: 0
});
function add(s, raw, seq) {
	if (s.started || typeof raw !== "string") return s;
	const label = clean(raw);
	if (!label || label.length > MAX_LABEL || s.items.length >= MAX_ITEMS) return s;
	if (s.items.some((o) => o.label.toLowerCase() === label.toLowerCase())) return s;
	return {
		...s,
		items: [...s.items, {
			id: "i" + seq,
			label,
			by: null
		}]
	};
}
function pick(s, user, id) {
	if (!s.started || isDone(s) || typeof id !== "string") return s;
	const o = s.items.find((x) => x.id === id);
	if (!o || o.by !== null || turnOf(s) !== user) return s;
	return {
		...s,
		items: s.items.map((x) => x.id === o.id ? {
			...x,
			by: user
		} : x),
		pos: s.pos + 1
	};
}
export default defineApp({
	name: "Snake draft",
	summary: (s, ctx) => {
		if (!s.started) return `${s.title} · not started · ${s.items.length} things`;
		if (isDone(s)) return `${s.title} · done · ${s.pos} picks`;
		const up = ctx.members.find((m) => m.id === turnOf(s))?.name ?? "Someone";
		return `${s.title} · ${s.pos} of ${Math.min(s.limit, s.items.length)} picked · ${up} is up`;
	},
	init: (ctx) => {
		const seen = new Set();
		const items = [];
		for (const raw of C.items) {
			const label = clean(raw).slice(0, MAX_LABEL);
			if (!label || seen.has(label.toLowerCase()) || items.length >= MAX_ITEMS) continue;
			seen.add(label.toLowerCase());
			items.push({
				id: "p" + items.length,
				label,
				by: null
			});
		}
		return {
			title: C.title,
			limit: C.limit,
			items,
			order: [],
			started: false,
			startedAt: 0,
			pos: 0,
			host: ctx.members[0]?.id ?? ""
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "add") return add(state, action.label, meta.seq);
		if (action.t === "start") {
			if (state.started || state.items.length === 0 || ctx.members.length < 2) return state;
			return {
				...state,
				started: true,
				startedAt: meta.time,
				pos: 0,
				order: rng(meta.seed).shuffle(ctx.members.map((m) => m.id))
			};
		}
		if (action.t === "pick") return pick(state, meta.user, action.item);
		if (action.t === "reset") {
			if (meta.user !== state.host || !state.started && state.pos === 0) return state;
			return blank(state);
		}
		return state;
	},
	// Someone left: their picks go back on the board and they leave the order. The host passes on.
	onMembers: (state, ctx) => {
		let next = state;
		if (ctx.members.length > 0 && !inChat(ctx, next.host)) next = {
			...next,
			host: ctx.members[0].id
		};
		if (next.started && next.order.some((u) => !inChat(ctx, u))) {
			const order = next.order.filter((u) => inChat(ctx, u));
			const items = next.items.map((o) => o.by !== null && !inChat(ctx, o.by) ? {
				...o,
				by: null
			} : o);
			if (order.length < 2) return blank({
				...next,
				items
			});
			return {
				...next,
				items,
				order,
				pos: items.filter((o) => o.by !== null).length
			};
		}
		return next;
	},
	invariants: {
		"pos equals the number of picks and never passes the limit": (s) => s.pos === picked(s) && s.pos <= s.limit,
		"picks come only from people in the order, and none before the start": (s) => s.items.every((o) => o.by === null || s.started && s.order.includes(o.by)) && (s.started || s.pos === 0 && s.startedAt === 0),
		"the order has no repeats, is in the chat, and exists exactly when started": (s, ctx) => new Set(s.order).size === s.order.length && s.order.every((u) => inChat(ctx, u)) && s.started === s.order.length > 0,
		"while the draft runs, someone in the order is on turn": (s) => !s.started || isDone(s) || turnOf(s) !== null && s.order.includes(turnOf(s)),
		"ids and labels are unique, at most 8 items, labels 1 to 40 characters": (s) => s.items.length <= MAX_ITEMS && new Set(s.items.map((o) => o.id)).size === s.items.length && new Set(s.items.map((o) => o.label.toLowerCase())).size === s.items.length && s.items.every((o) => o.label.length > 0 && o.label.length <= MAX_LABEL),
		"the host is in the chat": (s, ctx) => ctx.members.length === 0 || inChat(ctx, s.host)
	},
	transitions: {
		"a pick is made by whoever is on turn, takes one free item and moves one step": (p, n, a, m) => {
			if (a.t !== "pick" || p === n) return true;
			const i = p.items.findIndex((o) => o.id === a.item);
			if (i < 0 || turnOf(p) !== m.user || p.items[i].by !== null || isDone(p)) return false;
			return n.items[i].by === m.user && p.items.every((o, j) => j === i || JSON.stringify(o) === JSON.stringify(n.items[j])) && n.pos === p.pos + 1 && n.order.join() === p.order.join();
		},
		"start draws the order once, from the seed, with two or more people and something to pick": (p, n, a, m, ctx) => a.t !== "start" || p === n || !p.started && p.items.length > 0 && ctx.members.length >= 2 && n.started && n.pos === 0 && n.startedAt === m.time && n.order.join() === rng(m.seed).shuffle(ctx.members.map((x) => x.id)).join(),
		"only the host can reset, and reset clears the board": (p, n, a, m) => a.t !== "reset" || p === n || m.user === p.host && !n.started && n.pos === 0 && n.order.length === 0 && n.items.every((o) => o.by === null),
		"a reset by the host on a started or picked board clears it": (p, n, a, m, ctx) => a.t !== "reset" || !inChat(ctx, m.user) || m.user !== p.host || !p.started && p.pos === 0 || !n.started && n.pos === 0 && n.order.length === 0,
		"add appends one free item, only before the start": (p, n, a, m) => {
			if (a.t !== "add" || p === n) return true;
			const last = n.items.at(-1);
			return !p.started && n.items.length === p.items.length + 1 && !!last && last.by === null && last.label === clean(a.label) && last.id === "i" + m.seq;
		},
		"the title and limit never change": (p, n) => p.title === n.title && p.limit === n.limit,
		"only people in the chat change the draft": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, user, r) => {
		if (!s.started) {
			if (r.next() < .3) return {
				t: "add",
				label: r.pick([
					"Zilker park",
					"  Torchy's tacos ",
					"",
					"Barton Springs",
					"Mozart's lights"
				])
			};
			return { t: "start" };
		}
		if (s.items.length === 0) return { t: "reset" };
		if (isDone(s)) return r.next() < .5 ? { t: "reset" } : {
			t: "pick",
			item: s.items[0].id
		};
		if (r.next() < .05) return { t: "reset" };
		const free = s.items.filter((o) => o.by === null);
		return {
			t: "pick",
			item: r.pick(free.length ? free : s.items).id
		};
	},
	local: { draft: "" },
	view: ({ state, confirmed, pending, me, members, dispatch, theme, local, setLocal }) => {
		const nameOf = (id) => id === me ? "You" : members.find((m) => m.id === id)?.name ?? "Someone";
		const spinning = state.started && (pending && !confirmed.started || running(confirmed.startedAt, 2e3) !== null);
		const up = turnOf(state);
		const done = isDone(state);
		const myTurn = up === me && !done && !spinning;
		const cap = Math.min(state.limit, state.items.length);
		const free = state.items.filter((o) => o.by === null);
		const taken = state.items.filter((o) => o.by !== null);
		const fit = Math.max(6, Math.floor(((theme.width - 30) / 2 - 24) / 8));
		const cut = (t) => t.length > fit ? `${t.slice(0, fit - 1).trimEnd()}…` : t;
		const canAdd = clean(local.draft).length > 0 && state.items.length < MAX_ITEMS;
		const submit = () => {
			if (!canAdd) return;
			dispatch({
				t: "add",
				label: local.draft.slice(0, MAX_LABEL)
			});
			setLocal({ draft: "" });
		};
		const chip = {
			display: "block",
			maxWidth: "100%",
			padding: "4px 10px",
			borderRadius: theme.radius.pill,
			background: theme.color.input,
			color: theme.color.text,
			overflow: "hidden",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap"
		};
		const subtitle = !state.started ? `${state.items.length} things · pick ${cap}` : spinning ? "Drawing the order" : done ? "Draft done" : `${state.pos} of ${cap} picked`;
		return /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx(CardHeader, {
			title: state.title,
			subtitle
		}), !state.started ? /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "flex",
					flexWrap: "wrap",
					gap: 6
				},
				children: state.items.map((o) => /* @__PURE__ */ _jsx("span", {
					style: chip,
					children: o.label
				}, o.id))
			}),
			state.items.length < MAX_ITEMS ? /* @__PURE__ */ _jsxs("form", {
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
					maxLength: MAX_LABEL,
					placeholder: "Add a thing",
					"aria-label": "Add a thing",
					onInput: (e) => setLocal({ draft: e.currentTarget.value })
				}), /* @__PURE__ */ _jsx(Button, {
					kind: "deemphasized",
					disabled: !canAdd,
					onClick: submit,
					children: "Add"
				})]
			}) : null,
			/* @__PURE__ */ _jsx("div", {
				style: {
					minHeight: 24,
					margin: "8px 0 4px"
				},
				children: /* @__PURE__ */ _jsx(SystemLine, { children: "Start draws the order at random" })
			}),
			/* @__PURE__ */ _jsx(Button, {
				kind: "primary",
				wide: true,
				disabled: members.length < 2 || state.items.length === 0,
				onClick: () => dispatch({ t: "start" }),
				children: "Start draft"
			})
		] }) : spinning ? /* @__PURE__ */ _jsx("div", {
			style: {
				minHeight: 60,
				display: "grid",
				alignItems: "center"
			},
			children: /* @__PURE__ */ _jsx(SystemLine, { children: "Spinning the order" })
		}) : /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "flex",
					flexWrap: "wrap",
					gap: 8
				},
				children: state.order.map((u) => {
					const isUp = u === up && !done;
					return /* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: 2,
							width: 56,
							minWidth: 0
						},
						children: [/* @__PURE__ */ _jsx("div", {
							style: {
								display: "flex",
								padding: 2,
								borderRadius: 99,
								boxShadow: isUp ? `0 0 0 2px ${theme.color.primary}` : "none"
							},
							children: /* @__PURE__ */ _jsx(Avatar, {
								user: u,
								size: 28
							})
						}), /* @__PURE__ */ _jsx("small", {
							style: {
								maxWidth: "100%",
								fontWeight: isUp ? 600 : 400,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap"
							},
							children: nameOf(u)
						})]
					}, u);
				})
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					minHeight: 24,
					margin: "8px 0 4px"
				},
				children: done ? /* @__PURE__ */ _jsx(SystemLine, { children: "Draft done" }) : myTurn ? /* @__PURE__ */ _jsx(SystemLine, { children: "Your pick · tap one below" }) : /* @__PURE__ */ _jsx(SystemLine, {
					actor: nameOf(up),
					children: "is picking"
				})
			}),
			done ? /* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 6
				},
				children: state.order.map((u) => /* @__PURE__ */ _jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						minWidth: 0
					},
					children: [/* @__PURE__ */ _jsx(Avatar, {
						user: u,
						size: 24
					}), /* @__PURE__ */ _jsxs("small", {
						style: {
							flex: 1,
							minWidth: 0
						},
						children: [
							nameOf(u),
							" · ",
							state.items.filter((o) => o.by === u).map((o) => o.label).join(", ") || "no picks"
						]
					})]
				}, u))
			}) : /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
					gap: 6
				},
				children: free.map((o) => myTurn ? /* @__PURE__ */ _jsx(Button, {
					kind: "deemphasized",
					wide: true,
					onClick: () => dispatch({
						t: "pick",
						item: o.id
					}),
					children: /* @__PURE__ */ _jsx("span", {
						style: {
							minWidth: 0,
							overflow: "hidden",
							textOverflow: "ellipsis"
						},
						children: cut(o.label)
					})
				}, o.id) : /* @__PURE__ */ _jsx("span", {
					style: {
						...chip,
						borderRadius: theme.radius.button,
						textAlign: "center",
						padding: "6px 10px"
					},
					children: cut(o.label)
				}, o.id))
			}), taken.length ? /* @__PURE__ */ _jsx("div", {
				style: {
					display: "flex",
					flexWrap: "wrap",
					gap: 6,
					marginTop: 8
				},
				children: taken.map((o) => /* @__PURE__ */ _jsxs("span", {
					style: {
						...chip,
						display: "flex",
						alignItems: "center",
						gap: 4,
						background: theme.color.selected
					},
					children: [/* @__PURE__ */ _jsx(Avatar, {
						user: o.by ?? "",
						size: 20
					}), /* @__PURE__ */ _jsx("span", {
						style: {
							minWidth: 0,
							overflow: "hidden",
							textOverflow: "ellipsis"
						},
						children: o.label
					})]
				}, o.id))
			}) : null] }),
			!state.order.includes(me) ? /* @__PURE__ */ _jsx("div", {
				style: { marginTop: 8 },
				children: /* @__PURE__ */ _jsx("small", { children: "You are not in this draft" })
			}) : null,
			me === state.host ? /* @__PURE__ */ _jsx("div", {
				style: {
					marginTop: 8,
					display: "flex",
					justifyContent: "flex-end"
				},
				children: /* @__PURE__ */ _jsx(Button, {
					kind: "secondary",
					onClick: () => dispatch({ t: "reset" }),
					children: "Redraw"
				})
			}) : null
		] })] });
	}
});
