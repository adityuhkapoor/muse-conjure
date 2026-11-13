import { defineApp, Button, CardHeader, OptionRow, Toast } from "@muse/app";
import { jsx as _jsx, jsxs as _jsxs } from "@muse/app/jsx-runtime";
// Evening poll for the house meeting. Everyone taps the evenings that work; anyone can add one.
const CHAT = {
	title: "Which evening for the house meeting?",
	topic: "House meeting about the dishes",
	options: [
		"Tues 8",
		"Wed 8:30",
		"Thurs"
	]
};
const MAX_OPTIONS = 8;
const MAX_LABEL = 40;
const clean = (label) => label.trim().replace(/\s+/g, " ");
const inChat = (ctx, id) => ctx.members.some((m) => m.id === id);
const voterCount = (s) => new Set(s.options.flatMap((o) => o.voters)).size;
const votedFor = (s, option, user) => s.options.some((o) => o.id === option && o.voters.includes(user));
const without = (xs, user) => xs.filter((x) => x !== user).join();
const othersSame = (p, n, user) => p.options.length === n.options.length && p.options.every((o, i) => n.options[i].id === o.id && n.options[i].label === o.label && without(o.voters, user) === without(n.options[i].voters, user));
function vote(s, user, id) {
	if (typeof id !== "string" || !s.options.some((o) => o.id === id)) return s;
	return {
		...s,
		options: s.options.map((o) => o.id !== id ? o : {
			...o,
			voters: o.voters.includes(user) ? o.voters.filter((v) => v !== user) : [...o.voters, user]
		})
	};
}
function add(s, user, raw, seq) {
	if (typeof raw !== "string") return s;
	const label = clean(raw);
	if (!label || label.length > MAX_LABEL || s.options.length >= MAX_OPTIONS) return s;
	if (s.options.some((o) => o.label.toLowerCase() === label.toLowerCase())) return s;
	return {
		...s,
		options: [...s.options, {
			id: `o${seq}`,
			label,
			voters: [user]
		}]
	};
}
export default defineApp({
	name: "Evening poll",
	summary: (s) => {
		const top = [...s.options].sort((a, b) => b.voters.length - a.voters.length)[0];
		const n = voterCount(s);
		if (!top || top.voters.length === 0) return `${s.title} No votes yet.`;
		return `${s.title} ${top.label} leads with ${top.voters.length}. ${n} voted.`;
	},
	init: () => {
		const seen = new Set();
		const options = [];
		for (const raw of CHAT.options) {
			const label = clean(raw).slice(0, MAX_LABEL);
			if (!label || seen.has(label.toLowerCase()) || options.length >= MAX_OPTIONS) continue;
			seen.add(label.toLowerCase());
			options.push({
				id: `p${options.length}`,
				label,
				voters: []
			});
		}
		return {
			title: clean(CHAT.title).slice(0, 60) || "Poll",
			topic: clean(CHAT.topic).slice(0, 60),
			options
		};
	},
	reduce: (state, action, meta, ctx) => {
		if (!inChat(ctx, meta.user)) return state;
		if (action.t === "vote") return vote(state, meta.user, action.option);
		if (action.t === "add") return add(state, meta.user, action.label, meta.seq);
		return state;
	},
	onMembers: (state, ctx) => state.options.every((o) => o.voters.every((v) => inChat(ctx, v))) ? state : {
		...state,
		options: state.options.map((o) => ({
			...o,
			voters: o.voters.filter((v) => inChat(ctx, v))
		}))
	},
	invariants: {
		"no one votes twice for an option": (s) => s.options.every((o) => new Set(o.voters).size === o.voters.length),
		"voters are in the chat": (s, ctx) => s.options.every((o) => o.voters.every((v) => v !== "" && inChat(ctx, v))),
		"option ids and labels are unique": (s) => new Set(s.options.map((o) => o.id)).size === s.options.length && new Set(s.options.map((o) => o.label.toLowerCase())).size === s.options.length,
		"at most 8 options, each 1 to 40 characters and trimmed": (s) => s.options.length <= MAX_OPTIONS && s.options.every((o) => o.label.length > 0 && o.label.length <= MAX_LABEL && o.label === clean(o.label))
	},
	transitions: {
		"a vote flips the voter's vote on that option and touches no one else": (p, n, a, m) => a.t !== "vote" || p === n || othersSame(p, n, m.user) && votedFor(p, a.option, m.user) !== votedFor(n, a.option, m.user),
		"an added option comes last with the adder as its only voter": (p, n, a, m) => {
			if (a.t !== "add" || p === n) return true;
			const last = n.options.at(-1);
			return n.options.length === p.options.length + 1 && !!last && last.id === `o${m.seq}` && last.label === clean(a.label) && last.voters.length === 1 && last.voters[0] === m.user && p.options.every((o, i) => n.options[i] === o || JSON.stringify(n.options[i]) === JSON.stringify(o));
		},
		"only people in the chat change the poll": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
		"title and topic never change": (p, n) => p.title === n.title && p.topic === n.topic
	},
	arbitrary: (s, _user, r) => {
		if (s.options.length === 0 || r.next() < .2) return {
			t: "add",
			label: r.pick([
				"Fri 7",
				"Sun 6",
				"  mon late ",
				"",
				"Thurs",
				"Wed 9"
			])
		};
		return {
			t: "vote",
			option: r.pick(s.options).id
		};
	},
	local: {
		draft: "",
		toast: 0
	},
	view: ({ state, me, members, dispatch, local, setLocal }) => {
		const n = voterCount(state);
		const canAdd = clean(local.draft).length > 0 && state.options.length < MAX_OPTIONS;
		const submit = () => {
			if (!canAdd) return;
			dispatch({
				t: "add",
				label: local.draft.slice(0, MAX_LABEL)
			});
			setLocal({
				draft: "",
				toast: local.toast + 1
			});
		};
		return /* @__PURE__ */ _jsxs("div", { children: [
			/* @__PURE__ */ _jsx(CardHeader, {
				title: state.title,
				subtitle: `${n} of ${members.length} voted`
			}),
			/* @__PURE__ */ _jsxs("small", {
				style: {
					display: "block",
					marginBottom: 4
				},
				children: [state.topic, " · tap every evening that works"]
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
			state.options.length < MAX_OPTIONS ? /* @__PURE__ */ _jsxs("form", {
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
					placeholder: "Add evening",
					"aria-label": "Add evening",
					onInput: (e) => setLocal({ draft: e.currentTarget.value })
				}), /* @__PURE__ */ _jsx(Button, {
					kind: "deemphasized",
					disabled: !canAdd,
					onClick: submit,
					children: "Add"
				})]
			}) : null,
			local.toast ? /* @__PURE__ */ _jsx(Toast, { children: "Evening added" }, local.toast) : null
		] });
	}
});
