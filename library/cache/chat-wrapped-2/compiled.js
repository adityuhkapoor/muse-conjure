import { defineApp, Avatar, Button, CardHeader, Facepile, SystemLine, userColor } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Chat wrapped: messages per person, most used word, busiest time.
// Everyone enters their own numbers; the card totals them up.
const CONTENT = {
	title: "Tuesday trivia team wrapped",
	// Busiest time from the chat: around 9pm during the trivia rounds.
	startHour: 21,
	hours: [
		19,
		20,
		21,
		22,
		23
	]
};
const MAX_COUNT = 1e5;
const MAX_WORD = 20;
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const norm = (w) => w.trim().replace(/\s+/g, " ").toLowerCase();
const isHour = (h) => typeof h === "number" && Number.isInteger(h) && h >= 0 && h <= 23;
const hourLabel = (h) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;
function put(xs, e) {
	return xs.some((x) => x.user === e.user) ? xs.map((x) => x.user === e.user ? e : x) : [...xs, e];
}
const others = (xs, u) => JSON.stringify(xs.filter((x) => x.user !== u));
const unique = (xs) => new Set(xs.map((x) => x.user)).size === xs.length;
const hasAny = (s, u) => s.msgs.some((x) => x.user === u) || s.words.some((x) => x.user === u) || s.busy.some((x) => x.user === u);
function topWord(s) {
	let best = null;
	const seen = [];
	for (const e of s.words) {
		if (seen.includes(e.word)) continue;
		seen.push(e.word);
		const users = s.words.filter((x) => x.word === e.word).map((x) => x.user);
		if (!best || users.length > best.users.length) best = {
			word: e.word,
			users
		};
	}
	return best;
}
function topHour(s) {
	let best = {
		hour: s.hourSuggest,
		votes: 0
	};
	for (let h = 0; h < 24; h++) {
		const votes = s.busy.filter((x) => x.hour === h).length;
		if (votes > best.votes) best = {
			hour: h,
			votes
		};
	}
	return best;
}
export default defineApp({
	name: "Chat wrapped",
	summary: (s) => {
		const total = s.msgs.reduce((n, x) => n + x.n, 0);
		const w = topWord(s);
		return `${s.title} ${total} messages counted · busiest ${hourLabel(topHour(s).hour)}${w ? ` · top word ${w.word}` : ""}.`;
	},
	init: () => ({
		title: CONTENT.title,
		msgs: [],
		words: [],
		busy: [],
		hourSuggest: CONTENT.startHour
	}),
	reduce: (state, a, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (a.t === "setCount") {
			if (typeof a.n !== "number" || !Number.isInteger(a.n) || a.n < 0 || a.n > MAX_COUNT) return state;
			if (state.msgs.some((x) => x.user === meta.user && x.n === a.n)) return state;
			return {
				...state,
				msgs: put(state.msgs, {
					user: meta.user,
					n: a.n
				})
			};
		}
		if (a.t === "setWord") {
			if (typeof a.word !== "string") return state;
			const word = norm(a.word);
			if (!word || word.length > MAX_WORD) return state;
			if (state.words.some((x) => x.user === meta.user && x.word === word)) return state;
			return {
				...state,
				words: put(state.words, {
					user: meta.user,
					word
				})
			};
		}
		if (a.t === "voteHour") {
			if (!isHour(a.hour)) return state;
			if (state.busy.some((x) => x.user === meta.user && x.hour === a.hour)) return state;
			return {
				...state,
				busy: put(state.busy, {
					user: meta.user,
					hour: a.hour
				})
			};
		}
		if (a.t === "clear") {
			if (!hasAny(state, meta.user)) return state;
			return {
				...state,
				msgs: state.msgs.filter((x) => x.user !== meta.user),
				words: state.words.filter((x) => x.user !== meta.user),
				busy: state.busy.filter((x) => x.user !== meta.user)
			};
		}
		return state;
	},
	onMembers: (state, ctx) => {
		const ok = (x) => inChat(ctx, x.user);
		if (state.msgs.every(ok) && state.words.every(ok) && state.busy.every(ok)) return state;
		return {
			...state,
			msgs: state.msgs.filter(ok),
			words: state.words.filter(ok),
			busy: state.busy.filter(ok)
		};
	},
	invariants: {
		"each person has at most one count, word and hour": (s) => unique(s.msgs) && unique(s.words) && unique(s.busy),
		"every entry belongs to someone in the chat": (s, ctx) => [
			...s.msgs,
			...s.words,
			...s.busy
		].every((x) => inChat(ctx, x.user)),
		"every count is a whole number from 0 to 100000": (s) => s.msgs.every((x) => Number.isInteger(x.n) && x.n >= 0 && x.n <= MAX_COUNT),
		"every hour is a whole number from 0 to 23": (s) => s.busy.every((x) => isHour(x.hour)) && isHour(s.hourSuggest),
		"every word is trimmed, lowercase and 1 to 20 characters": (s) => s.words.every((x) => x.word.length > 0 && x.word.length <= MAX_WORD && x.word === norm(x.word))
	},
	transitions: {
		"a count sets the actor's count and nothing else": (p, n, a, m) => a.t !== "setCount" || p === n || n.msgs.find((x) => x.user === m.user)?.n === a.n && others(p.msgs, m.user) === others(n.msgs, m.user) && p.words === n.words && p.busy === n.busy,
		"a word sets the actor's word and nothing else": (p, n, a, m) => a.t !== "setWord" || p === n || n.words.find((x) => x.user === m.user)?.word === norm(a.word) && others(p.words, m.user) === others(n.words, m.user) && p.msgs === n.msgs && p.busy === n.busy,
		"an hour vote sets the actor's hour and nothing else": (p, n, a, m) => a.t !== "voteHour" || p === n || n.busy.find((x) => x.user === m.user)?.hour === a.hour && others(p.busy, m.user) === others(n.busy, m.user) && p.msgs === n.msgs && p.words === n.words,
		"clear removes only the actor's entries": (p, n, a, m) => a.t !== "clear" || p === n || !hasAny(n, m.user) && others(p.msgs, m.user) === JSON.stringify(n.msgs) && others(p.words, m.user) === JSON.stringify(n.words) && others(p.busy, m.user) === JSON.stringify(n.busy),
		"only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
		"the title and the starting hour never change": (p, n) => p.title === n.title && p.hourSuggest === n.hourSuggest
	},
	arbitrary: (s, user, r) => {
		const k = r.next();
		if (k < .4) return {
			t: "setCount",
			n: r.next() < .1 ? -1 : r.int(300)
		};
		if (k < .65) return {
			t: "setWord",
			word: r.pick([
				"robbed",
				"pitcher",
				"trivia",
				"lol",
				"  Bs ",
				"",
				"semester"
			])
		};
		if (k < .9) return {
			t: "voteHour",
			hour: r.next() < .1 ? 24 : r.pick([
				19,
				20,
				21,
				21,
				22,
				r.int(24)
			])
		};
		return hasAny(s, user) ? { t: "clear" } : {
			t: "setCount",
			n: r.int(50)
		};
	},
	local: {
		open: false,
		n: "",
		word: ""
	},
	view: ({ state, me, members, theme, dispatch, local, setLocal }) => {
		const countOf = (id) => state.msgs.find((x) => x.user === id)?.n ?? 0;
		const rows = members.map((m) => ({
			m,
			n: countOf(m.id)
		})).sort((a, b) => b.n - a.n);
		const max = Math.max(1, ...rows.map((r) => r.n));
		const leader = rows[0] && rows[0].n > 0 ? rows[0].m.id : "";
		const entered = state.msgs.length;
		const word = topWord(state);
		const hour = topHour(state);
		const mine = hasAny(state, me);
		const myHour = state.busy.find((x) => x.user === me)?.hour;
		const cn = /^\d{1,6}$/.test(local.n.trim()) ? Number(local.n.trim()) : null;
		const validCount = cn !== null && cn <= MAX_COUNT;
		const w = norm(local.word);
		const validWord = w.length > 0 && w.length <= MAX_WORD;
		const save = () => {
			if (validCount) dispatch({
				t: "setCount",
				n: cn
			});
			if (validWord) dispatch({
				t: "setWord",
				word: w
			});
			setLocal({ open: false });
		};
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `${entered} of ${members.length} added a count`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 4
				},
				role: "list",
				"aria-label": "Messages per person",
				children: rows.map(({ m, n }) => /* @__PURE__ */ _jsxs("div", {
					role: "listitem",
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						minHeight: 28
					},
					children: [
						/* @__PURE__ */ _jsx(Avatar, {
							user: m,
							size: 24
						}),
						/* @__PURE__ */ _jsx("div", {
							style: {
								width: 60,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap"
							},
							children: m.id === me ? "You" : m.name
						}),
						/* @__PURE__ */ _jsx("div", {
							style: {
								flex: 1,
								height: 12,
								borderRadius: 6,
								background: theme.color.track,
								overflow: "hidden"
							},
							children: /* @__PURE__ */ _jsx("div", { style: {
								width: `${n / max * 100}%`,
								height: 12,
								borderRadius: 6,
								background: userColor(m, theme)
							} })
						}),
						/* @__PURE__ */ _jsx("div", {
							style: {
								width: 64,
								textAlign: "right"
							},
							children: /* @__PURE__ */ _jsx("small", { children: m.id === leader ? `${n} · top` : String(n) })
						})
					]
				}, m.id))
			}),
			entered === 0 ? /* @__PURE__ */ _jsx(SystemLine, { children: "Add your count to fill the bars" }) : null,
			/* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gridTemplateColumns: "1fr 1fr",
					gap: 12,
					marginTop: 12
				},
				children: [/* @__PURE__ */ _jsxs("div", {
					style: { minWidth: 0 },
					children: [
						/* @__PURE__ */ _jsx("small", { children: "Most used word" }),
						/* @__PURE__ */ _jsx("div", {
							style: {
								fontSize: theme.type.title,
								fontWeight: 600,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap"
							},
							children: word ? word.word : "None yet"
						}),
						word ? /* @__PURE__ */ _jsx(Facepile, {
							users: word.users,
							max: 3,
							size: 20
						}) : /* @__PURE__ */ _jsx("small", { children: "Nobody added one" })
					]
				}), /* @__PURE__ */ _jsxs("div", {
					style: { minWidth: 0 },
					children: [
						/* @__PURE__ */ _jsx("small", { children: "Busiest time" }),
						/* @__PURE__ */ _jsx("div", {
							style: {
								fontSize: theme.type.title,
								fontWeight: 600
							},
							children: hourLabel(hour.hour)
						}),
						/* @__PURE__ */ _jsx("small", { children: hour.votes > 0 ? hour.votes === 1 ? "1 vote" : `${hour.votes} votes` : "From the chat" })
					]
				})]
			}),
			local.open ? /* @__PURE__ */ _jsxs("div", {
				style: {
					display: "grid",
					gap: 8,
					marginTop: 12
				},
				children: [
					/* @__PURE__ */ _jsx("input", {
						value: local.n,
						inputMode: "numeric",
						maxLength: 6,
						placeholder: "Your message count",
						"aria-label": "Your message count",
						onInput: (e) => setLocal({ n: e.currentTarget.value })
					}),
					/* @__PURE__ */ _jsx("input", {
						value: local.word,
						maxLength: MAX_WORD,
						placeholder: "Your most used word",
						"aria-label": "Your most used word",
						onInput: (e) => setLocal({ word: e.currentTarget.value })
					}),
					/* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							flexWrap: "wrap",
							gap: 8,
							alignItems: "center"
						},
						children: [/* @__PURE__ */ _jsx("small", { children: "Busiest hour" }), CONTENT.hours.map((h) => /* @__PURE__ */ _jsx(Button, {
							kind: myHour === h ? "secondary" : "deemphasized",
							onClick: () => dispatch({
								t: "voteHour",
								hour: h
							}),
							children: hourLabel(h)
						}, h))]
					}),
					/* @__PURE__ */ _jsxs("div", {
						style: {
							display: "flex",
							flexWrap: "wrap",
							gap: 8
						},
						children: [
							/* @__PURE__ */ _jsx(Button, {
								kind: "primary",
								disabled: !validCount && !validWord,
								onClick: save,
								children: "Save"
							}),
							/* @__PURE__ */ _jsx(Button, {
								kind: "secondary",
								onClick: () => setLocal({ open: false }),
								children: "Cancel"
							}),
							mine ? /* @__PURE__ */ _jsx(Button, {
								kind: "deemphasized",
								onClick: () => {
									dispatch({ t: "clear" });
									setLocal({ open: false });
								},
								children: "Clear"
							}) : null
						]
					})
				]
			}) : /* @__PURE__ */ _jsxs("div", {
				style: {
					marginTop: 12,
					display: "flex",
					alignItems: "center",
					gap: 8
				},
				children: [/* @__PURE__ */ _jsx(Button, {
					kind: mine ? "secondary" : "primary",
					wide: true,
					onClick: () => setLocal({
						open: true,
						n: state.msgs.find((x) => x.user === me) ? String(countOf(me)) : "",
						word: state.words.find((x) => x.user === me)?.word ?? ""
					}),
					children: mine ? "Edit yours" : "Add yours"
				}), mine ? /* @__PURE__ */ _jsx("small", { children: "You're in" }) : null]
			})
		] });
	}
});
