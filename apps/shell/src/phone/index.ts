/**
 * Phone feel. `initPhone()` runs once, before the app mounts. It only does anything on a touch
 * phone or tablet (or when the URL has ?phone=1, which the checks use), so desktop is untouched.
 * Parts: viewport.ts (keyboard and insets), touch.ts (gestures, haptics), session.ts (restore),
 * conn.ts (reconnecting line), A2hs.svelte, Jump.svelte, Offline.svelte.
 */
import { mount } from "svelte";
import "./phone.css";
import "./motion.css";
import { initViewport } from "./viewport";
import { initTouch } from "./touch";
import { initSession } from "./session";
import A2hs from "./A2hs.svelte";
import Offline from "./Offline.svelte";

import { isIos, isAndroid, isPhone, standalone } from "./env";

export function initPhone(): void {
  if (!isPhone) return;
  const root = document.documentElement;
  root.dataset.phone = "1";
  if (standalone) root.dataset.standalone = "1";
  if (isIos) root.dataset.os = "ios";
  else if (isAndroid) root.dataset.os = "android";
  const turn = document.createElement("div");
  turn.className = "turn";
  turn.textContent = "Turn your phone upright to keep going.";
  turn.setAttribute("role", "status");
  document.body.append(turn);
  initViewport();
  initTouch();
  initSession();
  // The pieces that need their own spot on the page.
  addEventListener("load", () => {
    const host = document.createElement("div");
    document.body.append(host);
    mount(Offline, { target: host });
    mount(A2hs, { target: host });
  });
}
