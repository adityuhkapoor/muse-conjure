import { defineApp, CardHeader, OptionRow } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Date poll. Everyone marks every cabin weekend they can do; the top weekend shows how close it is to the needed yeses.
const D = {
	title: "Which weekend works?",
	need: 5,
	dates: [
		"Jan 16-18",
		"Jan 23-25",
		"Feb 6-8",
		"Feb 13-15"
	]
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const votedFor = (s, option, user) => s.options.some((o) => o.id === option && o.voters.includes(user));
const optionsOf = (s, user, skip) => s.options.filter((o) => o.id !== skip && o.voters.includes(user)).map((o) => o.id).join();
const without = (xs, user) => xs.filter((x) => x !== user).join();
const othersSame = (p, n, user) => p.options.length === n.options.length && p.options.every((o, i) => {
	const q = n.options[i];
	return !!q && q.id === o.id && q.label === o.label && without(o.voters, user) === without(q.voters, user);
});
const allVoters = (s) => new Set(s.options.flatMap((o) => o.voters));
const leader = (s) => s.options.reduce((best, o) => best === null || o.voters.length > best.voters.length ? o : best, null);
export default defineApp({
	name: "Date poll",
	summary: (s) => {
		const top = leader(s);
		if (!top || top.voters.length === 0) return `${s.title} No votes yet.`;
		return `${s.title} ${top.label} leads with ${top.voters.length} of ${s.need} needed.`;
	},
	init: () => ({
		title: D.title,
		need: D.need,
		options: D.dates.map((label, i) => ({
			id: `d${i}`,
			label,
			voters: []
		}))
	}),
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t !== "vote" || typeof action.option !== "string") return state;
		const target = state.options.find((o) => o.id === action.option);
		if (!target) return state;
		const had = target.voters.includes(meta.user);
		return {
			...state,
			options: state.options.map((o) => o.id !== target.id ? o : {
				...o,
				voters: had ? o.voters.filter((v) => v !== meta.user) : [...o.voters, meta.user]
			})
		};
	},
	onMembers: (state, ctx) => {
		if (state.options.every((o) => o.voters.every((v) => inChat(ctx, v)))) return state;
		return {
			...state,
			options: state.options.map((o) => ({
				...o,
				voters: o.voters.filter((v) => inChat(ctx, v))
			}))
		};
	},
	invariants: {
		"no one is listed twice on a weekend": (s) => s.options.every((o) => new Set(o.voters).size === o.voters.length),
		"voters are in the chat": (s, ctx) => s.options.every((o) => o.voters.every((v) => inChat(ctx, v))),
		"the four weekends keep their ids and labels": (s) => s.options.length === D.dates.length && s.options.every((o, i) => o.id === `d${i}` && o.label === D.dates[i]),
		"the needed count is fixed": (s) => s.need === D.need && s.title === D.title
	},
	transitions: {
		"a vote flips the actor on that weekend and no one else": (p, n, a, m) => a.t !== "vote" || p === n || votedFor(p, a.option, m.user) !== votedFor(n, a.option, m.user) && othersSame(p, n, m.user),
		"a vote leaves the actor's other weekends as they were": (p, n, a, m) => a.t !== "vote" || p === n || optionsOf(p, m.user, a.option) === optionsOf(n, m.user, a.option),
		"only people in the chat change the poll": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
		"title, need and labels never change": (p, n) => p.title === n.title && p.need === n.need && p.options.length === n.options.length && p.options.every((o, i) => n.options[i]?.label === o.label)
	},
	arbitrary: (s, _user, r) => {
		if (r.next() < .1) return {
			t: "vote",
			option: "none"
		};
		return {
			t: "vote",
			option: r.pick(s.options).id
		};
	},
	local: {},
	view: ({ state, me, members, dispatch }) => {
		const voted = [...allVoters(state)].filter((v) => members.some((m) => m.id === v)).length;
		const top = leader(state);
		const line = !top || top.voters.length === 0 ? "Tap every weekend you can do" : top.voters.length >= state.need ? `${top.label} has ${top.voters.length} yeses` : `${top.label} · ${top.voters.length} of ${state.need} needed`;
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `${voted} of ${members.length} voted`
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					display: "grid",
					gap: 2
				},
				children: state.options.map((o) => /* @__PURE__ */ _jsx(OptionRow, {
					label: o.label,
					count: o.voters.length,
					total: Math.max(1, members.length),
					voters: o.voters,
					selected: o.voters.includes(me),
					onClick: () => dispatch({
						t: "vote",
						option: o.id
					})
				}, o.id))
			}),
			/* @__PURE__ */ _jsx("div", {
				style: {
					marginTop: 8,
					textAlign: "center"
				},
				children: /* @__PURE__ */ _jsx("small", { children: line })
			})
		] });
	}
});
