import type { ChatStore } from "./chat-store";
import { FakeStore } from "./fake-store.svelte";
import { LiveStore } from "./live-store.svelte";
import { setViewer } from "../lib/media";
import { chosenIdentity, liveConfig, urlIdentity } from "../live/config";

/**
 * The one place that picks the implementation. Served by the demo gateway (and not `?live=0`) with
 * an identity chosen: the server-backed store. Otherwise the in-memory fake (screenshots, checks).
 */
const as = liveConfig ? chosenIdentity() : null;
// With no one chosen, the seeded world's main character is the viewer: Aditya (dev).
setViewer(as ?? urlIdentity() ?? "dev");
export const store: ChatStore = as ? new LiveStore(as) : new FakeStore();
/** Live mode, but nobody picked who they are yet: main.ts shows "Continue as". */
export const needsIdentity = !!liveConfig && !as;
export type { ChatStore };
