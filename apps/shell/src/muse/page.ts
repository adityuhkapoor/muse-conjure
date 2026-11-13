// Small helpers the surface hooks share: names and the viewer, read from the store.

import { store } from "../store";
import { who } from "../surfaces/flows.svelte";

/** First name for any id on a surface ("me" is the viewer). */
export const nameOf = (id: string) => store.person(id)?.first ?? who(id)?.first ?? id;

/** The viewer's wire id ("noa" in the fake store). */
export const viewer = () => (store as unknown as { myId?: string }).myId ?? "noa";
