/** Layout and theme state. The breakpoint is 1100 px (CONTRACTS layout table). */
const DESKTOP_QUERY = "(min-width: 1100px)";
const params = new URLSearchParams(location.search);

class Ui {
  desktop = $state(false);
  dark = $state(document.documentElement.dataset.theme === "dark");
  forced = document.documentElement.dataset.themeForced === "1";

  constructor() {
    const mq = matchMedia(DESKTOP_QUERY);
    const apply = () => {
      this.desktop = mq.matches;
      document.documentElement.dataset.layout = mq.matches ? "desktop" : "phone";
    };
    apply();
    mq.addEventListener("change", apply);

    // Follow the system theme unless ?theme= or the toggle chose one.
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", (e) => {
      if (!this.forced) this.setDark(e.matches);
    });

    // ?safe=1 simulates iPhone 16 Pro insets in a desktop browser (59 top, 34 bottom).
    if (params.get("safe") === "1") {
      document.documentElement.style.setProperty("--sim-safe-top", "59px");
      document.documentElement.style.setProperty("--sim-safe-bottom", "34px");
    }
  }

  setDark(dark: boolean) {
    this.dark = dark;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }

  toggleTheme() {
    this.forced = true;
    this.setDark(!this.dark);
  }
}

export const ui = new Ui();

export type InboxFilter = "all" | "unread" | "groups";
/** The inbox filter chips (All, Unread, Groups) and the desktop search box: what the chat list shows. */
class ListView {
  filter = $state<InboxFilter>("all");
  query = $state("");
}
export const listView = new ListView();
export const initialChat = params.get("chat");
