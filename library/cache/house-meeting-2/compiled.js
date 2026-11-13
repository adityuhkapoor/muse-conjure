import { defineApp, CardHeader, OptionRow } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
const CONTENT = {
	title: "Which night for the roommate meeting?",
	deadline: "Landlord wants an answer by the 20th",
	nights: [
		"Thurs the 14th",
		"Fri the 15th",
		"Sun the 17th"
	]
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const voterCount = (s) => new Set(s.options.flatMap((o) => o.voters)).size;
const optionOf = (s, user) => s.options.find((o) => o.voters.includes(user))?.id ?? null;
const without = (xs, user) => xs.filter((x) => x !== user).join();
const othersSame = (p, n, user) => p.options.length === n.options.length && p.options.every((o, i) => n.options[i].id === o.id && without(o.voters, user) === without(n.options[i].voters, user));
export default defineApp({
	name: "Meeting night poll",
	summary: (s) => {
		const top = [...s.options].sort((a, b) => b.voters.length - a.voters.length)[0];
		if (!top || top.voters.length === 0) return `${s.title} No votes yet.`;
		return `${s.title} ${top.label} leads with ${top.voters.length}. ${voterCount(s)} voted.`;
	},
	init: () => ({
		title: CONTENT.title,
		deadline: CONTENT.deadline,
		options: CONTENT.nights.map((label, i) => ({
			id: `n${i}`,
			label,
			voters: []
		}))
	}),
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t !== "vote") return state;
		const id = action.option;
		if (typeof id !== "string") return state;
		const target = state.options.find((o) => o.id === id);
		if (!target) return state;
		const had = target.voters.includes(meta.user);
		return {
			...state,
			options: state.options.map((o) => {
				if (o.id === target.id) {
					return {
						...o,
						voters: had ? o.voters.filter((v) => v !== meta.user) : [...o.voters, meta.user]
					};
				}
				return o.voters.includes(meta.user) ? {
					...o,
					voters: o.voters.filter((v) => v !== meta.user)
				} : o;
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
		"no one appears twice in an option": (s) => s.options.every((o) => new Set(o.voters).size === o.voters.length),
		"each person votes for at most one night": (s) => s.options.flatMap((o) => o.voters).length === voterCount(s),
		"voters are in the chat": (s, ctx) => s.options.every((o) => o.voters.every((v) => inChat(ctx, v))),
		"three nights with unique ids and labels": (s) => s.options.length === CONTENT.nights.length && new Set(s.options.map((o) => o.id)).size === s.options.length && s.options.every((o, i) => o.label.length > 0 && o.label === CONTENT.nights[i])
	},
	transitions: {
		"a vote changes only the actor's vote": (p, n, a, m) => a.t !== "vote" || p === n || othersSame(p, n, m.user),
		"a vote puts the actor on that night only, or on none if they held it": (p, n, a, m) => a.t !== "vote" || p === n || optionOf(n, m.user) === (optionOf(p, m.user) === a.option ? null : a.option),
		"only people in the chat change the poll": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
		"the nights and title never change": (p, n) => p.title === n.title && p.deadline === n.deadline && p.options.length === n.options.length && p.options.every((o, i) => o.id === n.options[i].id && o.label === n.options[i].label)
	},
	arbitrary: (s, _user, r) => {
		if (r.next() < .08) return {
			t: "vote",
			option: "zzz"
		};
		return {
			t: "vote",
			option: r.pick(s.options).id
		};
	},
	local: {},
	view: ({ state, me, members, dispatch }) => {
		const n = voterCount(state);
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `${n} of ${members.length} voted`
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
				style: { marginTop: 8 },
				children: /* @__PURE__ */ _jsxs("small", { children: [state.deadline, " · tap a night to vote, tap again to remove it"] })
			})
		] });
	}
});
