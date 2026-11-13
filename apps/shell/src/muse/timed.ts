// Timed, unprompted catalysts: offers that come from the calendar, not from something the person
// just did (an event is this week, a trip was a year ago, a poll ended). Off unless switched on
// (?unprompted=1, the presenter options, or `bun run demo --unprompted`). They appear only as a
// quiet card on Home and a row in Notifications, never as a message in a chat.

import { store } from "../store";
import { pollResult, STORIES } from "../surfaces/data";
import { eventContext, storyContext } from "./context";
import { nameOf, viewer } from "./page";
import { catalyst } from "./catalyst.svelte";
import { TRIP } from "./seed";
import type { PageContext, Situation } from "./types";

export type Timed = Situation & { ctx: PageContext; when: string; go: "event" | "run" };

export function timedOffers(quiet: string[]): Timed[] {
  const out: Timed[] = [];
  const ev = store.event("juniper");
  if (ev) {
    const c = eventContext(ev, { rsvp: "interested", now: store.now(), nameOf, viewer: viewer() });
    const days = Number(c.facts.daysAway);
    if (days <= 7) {
      const rides = store.surfaceTools("surface:page:event:juniper").find((t) => t.name.startsWith("Rides"));
      const day = new Date(ev.start).toLocaleDateString("en-US", { weekday: "long" });
      out.push({
        id: "timed:event-carpool",
        scenario: "event-carpool",
        label: rides ? `${rides.name}` : "Who's driving?",
        detail: `${ev.title} is ${days <= 1 ? "tomorrow" : day} · ${rides?.summary || "plan rides"}`,
        faces: [],
        score: 1,
        why: "the event is this week",
        ctx: c,
        when: days <= 1 ? "Tomorrow" : `This ${day}`,
        go: "event",
      });
    }
  }
  // a year since the trip: only for the people who went
  const trip = TRIP.people.includes(viewer()) ? STORIES.find((s) => s.id === TRIP.storyId) : undefined;
  if (trip) {
    const c = storyContext(trip, { nameOf });
    // the reader, with the unprompted bar (the rules while it is off or still reading)
    const [again] = catalyst.suggest(c, 1, { unprompted: true });
    if (again) out.push({ ...again, id: "timed:story-again", label: `1 year since ${TRIP.name}`, detail: again.offer ? again.label : `Do it again with ${TRIP.people.length - 1} friends`, ctx: c, when: "A year ago", go: "run" });
  }
  // the viewer's own ended poll, if they posted one
  const mine = STORIES.find((s) => s.by === viewer() && s.poll?.ended);
  if (mine?.poll) {
    const win = { label: pollResult(mine.poll).winner };
    const c = storyContext(mine, { nameOf });
    const [plan] = catalyst.suggest(c, 1, { unprompted: true });
    if (plan) out.push({ ...plan, id: "timed:story-plan", label: `Your poll ended: ${win.label} won`, detail: plan.offer ? plan.label : "Make it a plan", ctx: c, when: "Today", go: "run" });
  }
  return out.filter((t) => !quiet.includes(t.id));
}
