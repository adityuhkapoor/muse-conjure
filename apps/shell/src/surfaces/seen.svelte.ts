/** Which stories this session has opened. The tray turns their rings grey; sessionStorage keeps it across a reload. */
const KEY = "ct-stories-seen";

function load(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

let ids = $state<string[]>(load());

export const seen = {
  has: (id: string) => ids.includes(id),
  mark(id: string) {
    if (ids.includes(id)) return;
    ids = [...ids, id];
    try {
      sessionStorage.setItem(KEY, JSON.stringify(ids));
    } catch {
      /* private window: the module state still holds for the session */
    }
  },
};
