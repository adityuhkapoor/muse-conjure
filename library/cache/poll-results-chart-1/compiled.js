import { defineApp, CardHeader, OptionRow } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
const CONTENT = {
	title: "Friday movie night",
	options: [
		"Barbie rewatch",
		"Challengers",
		"The Grand Budapest"
	]
};
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const optionsOf = (s, user) => s.options.filter((o) => o.voters.includes(user)).map((o) => o.id);
const allVoters = (s) => s.options.flatMap((o) => o.voters);
const without = (xs, user) => xs.filter((x) => x !== user).join();
const othersSame = (p, n, user) => p.options.length === n.options.length && p.options.every((o, i) => n.options[i].id === o.id && n.options[i].label === o.label && without(o.voters, user) === without(n.options[i].voters, user));
export default defineApp({
	name: "Movie vote",
	summary: (s) => {
		const top = [...s.options].sort((a, b) => b.voters.length - a.voters.length)[0];
		const n = new Set(allVoters(s)).size;
		if (!top || top.voters.length === 0) return `${s.title} · no votes yet`;
		return `${s.title} · ${top.label} leads with ${top.voters.length} · ${n} voted`;
	},
	init: () => ({
		title: CONTENT.title,
		options: CONTENT.options.map((label, i) => ({
			id: `p${i}`,
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
		"each person votes for at most one option": (s) => allVoters(s).length === new Set(allVoters(s)).size,
		"voters are in the chat": (s, ctx) => s.options.every((o) => o.voters.every((v) => inChat(ctx, v))),
		"the movies and their ids never change": (s) => s.options.length === CONTENT.options.length && s.options.every((o, i) => o.id === `p${i}` && o.label === CONTENT.options[i]) && s.title === CONTENT.title
	},
	transitions: {
		"a vote changes only the actor's own vote": (p, n, a, m) => a.t !== "vote" || p === n || othersSame(p, n, m.user),
		"after a vote the actor is on that movie only, or on none if they tapped their own": (p, n, a, m) => {
			if (a.t !== "vote" || p === n) return true;
			const had = optionsOf(p, m.user).includes(a.option);
			const now = optionsOf(n, m.user);
			return had ? now.length === 0 : now.length === 1 && now[0] === a.option;
		},
		"a vote counts only for a movie that exists": (p, n, a) => a.t !== "vote" || p === n || p.options.some((o) => o.id === a.option),
		"only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user)
	},
	arbitrary: (s, _user, r) => ({
		t: "vote",
		option: r.next() < .1 ? "none" : r.pick(s.options).id
	}),
	local: {},
	view: ({ state, me, members, dispatch }) => {
		const voted = new Set(allVoters(state).filter((v) => members.some((m) => m.id === v)));
		const waiting = members.filter((m) => !voted.has(m.id));
		const names = waiting.slice(0, 3).map((m) => m.id === me ? "you" : m.name);
		const more = waiting.length - names.length;
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `${voted.size} of ${members.length} voted`
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
				children: /* @__PURE__ */ _jsx("small", { children: waiting.length === 0 ? "Everyone voted" : `Waiting on ${names.join(", ")}${more > 0 ? ` +${more}` : ""}` })
			})
		] });
	}
});
