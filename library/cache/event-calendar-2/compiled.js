import { defineApp, Button, CardHeader, Facepile, Toast } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Shared calendar for the dates in the chat. Anyone can mark going, add or remove a date.
// Year 2026: Nov 1 is a Sunday, Dec 1 is a Tuesday.
const CHAT = {
	title: "Upcoming dates",
	events: [
		{
			label: "Dre's 21st birthday",
			month: 11,
			day: 20,
			time: "7 PM",
			note: "Thai place, bar at 9"
		},
		{
			label: "Hockey vs Cornell",
			month: 11,
			day: 21,
			time: "7 PM",
			note: "Felix has tickets for 4"
		},
		{
			label: "Eli's econ paper due",
			month: 11,
			day: 22,
			time: "Midnight",
			note: ""
		},
		{
			label: "Lease walkthrough",
			month: 11,
			day: 30,
			time: "4 PM",
			note: "With the landlord"
		},
		{
			label: "Deposit due",
			month: 12,
			day: 1,
			time: "",
			note: "$400 each, venmo Maya"
		},
		{
			label: "Secret santa",
			month: 12,
			day: 11,
			time: "",
			note: "At Jalen's place, $20 limit"
		},
		{
			label: "Finals start",
			month: 12,
			day: 14,
			time: "",
			note: ""
		}
	]
};
const MAX_EVENTS = 12;
const MAX_LABEL = 40;
const MAX_TIME = 12;
const DOW = [
	"Sun",
	"Mon",
	"Tue",
	"Wed",
	"Thu",
	"Fri",
	"Sat"
];
const clean = (s) => s.trim().replace(/\s+/g, " ");
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const validDay = (m, d) => Number.isInteger(d) && d >= 1 && d <= (m === 11 ? 30 : m === 12 ? 31 : 0);
const key = (e) => e.month * 100 + e.day;
const dowOf = (m, d) => DOW[(d - 1 + (m === 12 ? 2 : 0)) % 7] ?? "";
const monthName = (m) => m === 11 ? "November" : "December";
const bare = (e) => JSON.stringify([
	e.id,
	e.label,
	e.month,
	e.day,
	e.time,
	e.note
]);
const others = (e, u) => e.going.filter((x) => x !== u).join();
export default defineApp({
	name: "Shared calendar",
	summary: (s) => {
		const first = s.events[0];
		return first ? `${s.events.length} dates · first is ${first.label}, ${monthName(first.month)} ${first.day}` : "No dates yet";
	},
	init: () => ({
		events: CHAT.events.slice(0, MAX_EVENTS).map((e, i) => ({
			id: `e${i}`,
			label: clean(e.label).slice(0, MAX_LABEL),
			month: e.month,
			day: e.day,
			time: clean(e.time).slice(0, MAX_TIME),
			note: clean(e.note).slice(0, 60),
			going: []
		})),
		selected: null
	}),
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "go") {
			const ev = state.events.find((e) => e.id === action.event);
			if (!ev) return state;
			const going = ev.going.includes(meta.user) ? ev.going.filter((u) => u !== meta.user) : [...ev.going, meta.user];
			return {
				...state,
				events: state.events.map((e) => e.id === ev.id ? {
					...e,
					going
				} : e)
			};
		}
		if (action.t === "add") {
			if (typeof action.label !== "string" || typeof action.time !== "string") return state;
			if (typeof action.month !== "number" || typeof action.day !== "number") return state;
			const label = clean(action.label);
			const time = clean(action.time);
			if (!label || label.length > MAX_LABEL || time.length > MAX_TIME) return state;
			if (action.month !== 11 && action.month !== 12) return state;
			if (!validDay(action.month, action.day)) return state;
			if (state.events.length >= MAX_EVENTS) return state;
			if (state.events.some((e) => e.label.toLowerCase() === label.toLowerCase() && e.month === action.month && e.day === action.day)) return state;
			const ev = {
				id: `e${meta.seq}`,
				label,
				month: action.month,
				day: action.day,
				time,
				note: "",
				going: [meta.user]
			};
			if (state.events.some((e) => e.id === ev.id)) return state;
			const idx = state.events.findIndex((e) => key(e) > key(ev));
			const events = idx < 0 ? [...state.events, ev] : [
				...state.events.slice(0, idx),
				ev,
				...state.events.slice(idx)
			];
			return {
				...state,
				events
			};
		}
		if (action.t === "remove") {
			if (!state.events.some((e) => e.id === action.event)) return state;
			return {
				events: state.events.filter((e) => e.id !== action.event),
				selected: state.selected === action.event ? null : state.selected
			};
		}
		if (action.t === "select") {
			if (action.event === state.selected) return state;
			if (action.event !== null && !state.events.some((e) => e.id === action.event)) return state;
			return {
				...state,
				selected: action.event
			};
		}
		return state;
	},
	// Someone left: they come off every going list.
	onMembers: (state, ctx) => {
		if (state.events.every((e) => e.going.every((u) => inChat(ctx, u)))) return state;
		return {
			...state,
			events: state.events.map((e) => e.going.every((u) => inChat(ctx, u)) ? e : {
				...e,
				going: e.going.filter((u) => inChat(ctx, u))
			})
		};
	},
	invariants: {
		"event ids are unique": (s) => new Set(s.events.map((e) => e.id)).size === s.events.length,
		"events are sorted by month then day": (s) => s.events.every((e, i) => i === 0 || key(s.events[i - 1]) <= key(e)),
		"every event has a label of 1 to 40 characters and a valid date": (s) => s.events.every((e) => e.label.length > 0 && e.label.length <= MAX_LABEL && e.label === clean(e.label) && (e.month === 11 || e.month === 12) && validDay(e.month, e.day)),
		"times are at most 12 characters": (s) => s.events.every((e) => e.time.length <= MAX_TIME && e.time === clean(e.time)),
		"no one is going twice": (s) => s.events.every((e) => new Set(e.going).size === e.going.length),
		"everyone going is in the chat": (s, ctx) => s.events.every((e) => e.going.every((u) => inChat(ctx, u))),
		"at most 12 events": (s) => s.events.length <= MAX_EVENTS,
		"selected is none or an existing event": (s) => s.selected === null || s.events.some((e) => e.id === s.selected)
	},
	transitions: {
		"going toggles only the actor on that event": (p, n, a, m) => a.t !== "go" || p === n || p.selected === n.selected && p.events.length === n.events.length && p.events.some((e) => e.id === a.event) && p.events.every((e, i) => {
			const f = n.events[i];
			const hit = e.id === a.event;
			return bare(e) === bare(f) && others(e, m.user) === others(f, m.user) && (hit ? e.going.includes(m.user) !== f.going.includes(m.user) : e.going.join() === f.going.join());
		}),
		"an add puts one new event in with the actor as its only going member": (p, n, a, m) => a.t !== "add" || p === n || n.events.length === p.events.length + 1 && n.selected === p.selected && p.events.every((e) => n.events.includes(e)) && n.events.some((e) => e.id === `e${m.seq}` && e.label === clean(a.label) && e.month === a.month && e.day === a.day && e.time === clean(a.time) && e.going.length === 1 && e.going[0] === m.user),
		"a remove drops exactly the named event": (p, n, a) => a.t !== "remove" || p === n || n.events.length === p.events.length - 1 && !n.events.some((e) => e.id === a.event) && p.events.filter((e) => e.id !== a.event).every((e, i) => n.events[i] === e) && n.selected === (p.selected === a.event ? null : p.selected),
		"a select changes only the selected field": (p, n, a) => a.t !== "select" || p === n || n.selected === a.event && n.events === p.events,
		"only people in the chat change the calendar": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, _user, r) => {
		const k = r.next();
		if (s.events.length === 0 || k < .15) {
			return {
				t: "add",
				label: r.pick([
					"Pizza night",
					"Movie night",
					"Rent due",
					"  Game night ",
					"",
					"Deposit due"
				]),
				month: r.pick([
					11,
					12,
					12,
					10
				]),
				day: r.pick([
					1,
					5,
					14,
					20,
					28,
					31,
					0
				]),
				time: r.pick([
					"",
					"7 PM",
					"noon"
				])
			};
		}
		if (k < .2) return {
			t: "remove",
			event: r.pick(s.events).id
		};
		if (k < .35) return {
			t: "select",
			event: r.next() < .2 ? null : r.pick(s.events).id
		};
		return {
			t: "go",
			event: r.next() < .05 ? "nope" : r.pick(s.events).id
		};
	},
	local: {
		month: 11,
		adding: false,
		label: "",
		day: "",
		time: "",
		toast: 0
	},
	view: ({ state, me, dispatch, local, setLocal, theme }) => {
		const month = local.month;
		const monthEvents = state.events.filter((e) => e.month === month);
		const mine = state.events.filter((e) => e.going.includes(me)).length;
		const firstOpen = state.events.find((e) => !e.going.includes(me))?.id ?? "";
		const offset = month === 11 ? 0 : 2;
		const days = month === 11 ? 30 : 31;
		const cells = Array.from({ length: 35 }, (_, i) => {
			const d = i - offset + 1;
			return d >= 1 && d <= days ? d : 0;
		});
		const dayNum = Number(local.day.trim());
		const labelOk = clean(local.label).length > 0 && clean(local.label).length <= MAX_LABEL;
		const canAdd = labelOk && local.day.trim() !== "" && validDay(month, dayNum) && state.events.length < MAX_EVENTS;
		const submit = () => {
			if (!canAdd) return;
			dispatch({
				t: "add",
				label: clean(local.label),
				month,
				day: dayNum,
				time: clean(local.time).slice(0, MAX_TIME)
			});
			setLocal({
				adding: false,
				label: "",
				day: "",
				time: "",
				toast: local.toast + 1
			});
		};
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: CHAT.title,
				subtitle: `${state.events.length} dates · you're in ${mine}`
			}),
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8
				},
				children: [
					/* @__PURE__ */ _jsx(Button, {
						kind: month === 11 ? "secondary" : "deemphasized",
						onClick: () => setLocal({ month: 11 }),
						children: "Nov"
					}),
					/* @__PURE__ */ _jsx(Button, {
						kind: month === 12 ? "secondary" : "deemphasized",
						onClick: () => setLocal({ month: 12 }),
						children: "Dec"
					}),
					/* @__PURE__ */ _jsx("div", { style: { flex: 1 } }),
					local.adding ? null : /* @__PURE__ */ _jsx(Button, {
						kind: "secondary",
						disabled: state.events.length >= MAX_EVENTS,
						onClick: () => setLocal({ adding: true }),
						children: "Add"
					})
				]
			}),
			local.adding ? /* @__PURE__ */ _jsxs("form", {
				style: {
					display: "grid",
					gap: 8,
					marginTop: 8
				},
				onSubmit: (e) => {
					e.preventDefault();
					submit();
				},
				children: [
					/* @__PURE__ */ _jsx("small", { children: `New date in ${monthName(month)}` }),
					/* @__PURE__ */ _jsx("input", {
						value: local.label,
						maxLength: MAX_LABEL,
						placeholder: "What is it",
						"aria-label": "Event name",
						onInput: (e) => setLocal({ label: e.currentTarget.value })
					}),
					/* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							gap: 8
						},
						children: [/* @__PURE__ */ _jsx("input", {
							value: local.day,
							inputMode: "numeric",
							maxLength: 2,
							placeholder: "Day",
							"aria-label": "Day of month",
							onInput: (e) => setLocal({ day: e.currentTarget.value })
						}), /* @__PURE__ */ _jsx("input", {
							value: local.time,
							maxLength: MAX_TIME,
							placeholder: "Time",
							"aria-label": "Time",
							onInput: (e) => setLocal({ time: e.currentTarget.value })
						})]
					}),
					/* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							gap: 8
						},
						children: [/* @__PURE__ */ _jsx(Button, {
							kind: "primary",
							disabled: !canAdd,
							onClick: submit,
							children: "Add"
						}), /* @__PURE__ */ _jsx(Button, {
							kind: "deemphasized",
							onClick: () => setLocal({
								adding: false,
								label: "",
								day: "",
								time: ""
							}),
							children: "Cancel"
						})]
					})
				]
			}) : /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsxs("div", {
				role: "img",
				"aria-label": `${monthName(month)} calendar with ${monthEvents.length} dates`,
				style: {
					display: "grid",
					gridTemplateColumns: "repeat(7, 1fr)",
					gap: 2,
					marginTop: 8
				},
				children: [[
					"S",
					"M",
					"T",
					"W",
					"T",
					"F",
					"S"
				].map((d, i) => /* @__PURE__ */ _jsx("div", {
					style: {
						textAlign: "center",
						fontSize: 12,
						lineHeight: "14px",
						color: theme.color.secondaryText
					},
					children: d
				}, `h${i}`)), cells.map((d, i) => {
					if (d === 0) return /* @__PURE__ */ _jsx("div", { style: { height: 16 } }, i);
					const evs = monthEvents.filter((e) => e.day === d);
					const isMine = evs.some((e) => e.going.includes(me));
					const sel = evs.some((e) => e.id === state.selected);
					return /* @__PURE__ */ _jsx("div", {
						style: {
							height: 16,
							lineHeight: "16px",
							fontSize: 13,
							textAlign: "center",
							borderRadius: 6,
							fontWeight: evs.length ? 600 : 400,
							color: isMine ? theme.color.onPrimary : evs.length ? theme.color.secondaryButtonText : theme.color.secondaryText,
							...isMine ? { background: theme.color.primary } : evs.length ? { background: theme.color.secondaryButton } : {},
							...sel ? { boxShadow: `inset 0 0 0 2px ${theme.color.text}` } : {}
						},
						children: d
					}, i);
				})]
			}), /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 0,
					marginTop: 8
				},
				children: [monthEvents.length === 0 ? /* @__PURE__ */ _jsx("small", { children: `Nothing in ${monthName(month)} yet. Tap Add.` }) : null, monthEvents.map((e) => {
					const going = e.going.includes(me);
					const sel = state.selected === e.id;
					const meta = [
						e.time,
						e.note,
						e.going.length ? `${e.going.length} going` : ""
					].filter(Boolean).join(" · ");
					return /* @__PURE__ */ _jsxs("div", {
						style: {
							borderRadius: theme.radius.button,
							...sel ? { background: theme.color.selected } : {}
						},
						children: [/* @__PURE__ */ _jsxs("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 8,
								minHeight: 44
							},
							children: [/* @__PURE__ */ _jsxs("div", {
								role: "button",
								"aria-label": `Details for ${e.label}`,
								style: {
									flex: 1,
									minWidth: 0,
									minHeight: 44,
									display: "flex",
									flexDirection: "column",
									justifyContent: "center"
								},
								onClick: () => dispatch({
									t: "select",
									event: sel ? null : e.id
								}),
								children: [/* @__PURE__ */ _jsx("div", {
									style: {
										fontWeight: 600,
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap"
									},
									children: `${dowOf(e.month, e.day)} ${e.day} · ${e.label}`
								}), /* @__PURE__ */ _jsx("small", {
									style: {
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap"
									},
									children: meta || "No time set"
								})]
							}), /* @__PURE__ */ _jsx(Button, {
								kind: going ? "deemphasized" : e.id === firstOpen ? "primary" : "secondary",
								onClick: () => dispatch({
									t: "go",
									event: e.id
								}),
								children: going ? "Undo" : "Going"
							})]
						}), sel ? /* @__PURE__ */ _jsxs("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 8,
								minHeight: 44
							},
							children: [/* @__PURE__ */ _jsx("div", {
								style: {
									flex: 1,
									minWidth: 0
								},
								children: e.going.length ? /* @__PURE__ */ _jsx(Facepile, {
									users: e.going,
									max: 5,
									size: 24
								}) : /* @__PURE__ */ _jsx("small", { children: "No one yet" })
							}), /* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => dispatch({
									t: "remove",
									event: e.id
								}),
								children: "Remove"
							})]
						}) : null]
					}, e.id);
				})]
			})] }),
			local.toast ? /* @__PURE__ */ _jsx(Toast, { children: "Date added" }, local.toast) : null
		] });
	}
});
