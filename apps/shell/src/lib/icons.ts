/** Icons: all currentColor. */
const raw = import.meta.glob("../icons/*.svg", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

function clean(svg: string): string {
  return svg
    .replace(/<svg([^>]*)>/, (_, attrs: string) => {
      const kept = attrs
        .replace(/\s(data-rendered-[\w-]+|color|width|height|name)="[^"]*"/g, "")
        .replace(/\sfill="[^"]*"/, "");
      return `<svg${kept} fill="currentColor" aria-hidden="true" focusable="false">`;
    })
    .trim();
}

const site: Record<string, string> = {};
for (const [path, src] of Object.entries(raw)) {
  const name = path.split("/").pop()!.replace(".svg", "");
  site[name] = clean(src);
}

const wrap = (body: string, vb = 24) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vb} ${vb}" fill="currentColor" aria-hidden="true" focusable="false">${body}</svg>`;
const stroke = (body: string, vb = 24, w = 2) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

/** Our own drawings, for things that are not in the captured set. */
const own: Record<string, string> = {
  back: stroke('<path d="M15 4 7 12l8 8"/>', 24, 2.4),
  chevronRight: stroke('<path d="m9 5 7 7-7 7"/>', 24, 2),
  plusCircle: wrap('<path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5.5a1 1 0 1 0-2 0V11H7.5a1 1 0 1 0 0 2H11v3.5a1 1 0 1 0 2 0V13h3.5a1 1 0 1 0 0-2H13V7.5Z"/>'),
  camera: wrap('<path d="M9 3.5 7.6 5.5H6A3 3 0 0 0 3 8.5v8a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-8a3 3 0 0 0-3-3h-1.6L15 3.5H9Zm3 5.2a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"/>'),
  send: wrap('<path d="M3.4 20.4 21.5 12.6a.7.7 0 0 0 0-1.3L3.4 3.6a.7.7 0 0 0-1 .8L4.5 10l9 2-9 2-2.1 5.6a.7.7 0 0 0 1 .8Z"/>'),
  emoji: wrap('<path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM8.5 9a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6Zm7 0a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6ZM7.6 14.2a.9.9 0 0 1 1.2.2 4.2 4.2 0 0 0 6.4 0 .9.9 0 1 1 1.4 1.1 6 6 0 0 1-9.2 0 .9.9 0 0 1 .2-1.3Z"/>'),
  chats: wrap('<path d="M12 2C6.500 2 2 6.100 2 11.200c0 2.700 1.200 5.100 3.200 6.700V21a.8.8 0 0 0 1.200.7l2.600-1.500c.9.200 1.900.4 3 .4 5.500 0 10-4.100 10-9.200S17.500 2 12 2Z"/>'),
  stories: wrap('<path d="M7.500 3A3.500 3.500 0 0 0 4 6.500v11A3.500 3.500 0 0 0 7.500 21h9a3.500 3.500 0 0 0 3.500-3.500v-11A3.500 3.500 0 0 0 16.500 3h-9Zm4.500 5.400a.9.9 0 0 1 .9.9V11h1.700a.9.9 0 1 1 0 1.800h-1.700v1.700a.9.9 0 1 1-1.800 0v-1.700H9.400a.9.9 0 1 1 0-1.800h1.700V9.300a.9.9 0 0 1 .9-.9Z"/>'),
  menu: stroke('<path d="M4 7h16M4 12h16M4 17h16"/>', 24, 2.4),
  wave: wrap('<rect x="3" y="9" width="2.400" height="6" rx="1.200"/><rect x="7.500" y="5" width="2.400" height="14" rx="1.200"/><rect x="12" y="7.500" width="2.400" height="9" rx="1.200"/><rect x="16.500" y="3" width="2.400" height="18" rx="1.200"/>'),
  reply: stroke('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v3"/>', 24, 2),
  close: stroke('<path d="M6 6l12 12M18 6 6 18"/>', 24, 2.2),
  mute: wrap('<path d="M12 2a7 7 0 0 0-7 7v3.500L3.500 15a1 1 0 0 0 .9 1.500h15.200a1 1 0 0 0 .9-1.500L19 12.500V9a7 7 0 0 0-7-7Zm-2 17a2 2 0 0 0 4 0h-4Z"/>'),
  person: wrap('<path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.400 0-8 2.200-8 5v1.500c0 .800.700 1.500 1.500 1.500h13c.800 0 1.500-.700 1.500-1.500V19c0-2.800-3.600-5-8-5Z"/>'),
  moon: wrap('<path d="M20.500 14.500A8.500 8.500 0 0 1 9.500 3.500a.7.7 0 0 0-.9-.9A10 10 0 1 0 21.400 15.400a.7.7 0 0 0-.9-.9Z"/>'),
  searchOutline: stroke('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.500-3.500"/>', 24, 2.2),
  calendar: stroke('<rect x="3.500" y="5" width="17" height="15.500" rx="2.500"/><path d="M3.500 10h17M8 3v4M16 3v4"/>', 24, 2),
  star: stroke('<path d="m12 3.500 2.600 5.400 5.900.8-4.300 4.100 1 5.900L12 16.900 6.800 19.700l1-5.900L3.500 9.700l5.900-.8L12 3.500Z"/>', 24, 2),
  starFilled: wrap('<path d="m12 2.800 2.900 5.900 6.500.9-4.700 4.600 1.100 6.500L12 17.600l-5.800 3.100 1.100-6.500L2.600 9.600l6.500-.9L12 2.800Z"/>'),
  pin: stroke('<path d="M12 21s-6.500-5.800-6.500-11a6.500 6.500 0 0 1 13 0c0 5.200-6.500 11-6.500 11Z"/><circle cx="12" cy="10" r="2.400"/>', 24, 2),
  globe: stroke('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.500 2.500 3.800 5.500 3.800 9s-1.300 6.500-3.800 9c-2.500-2.500-3.800-5.500-3.800-9S9.500 5.500 12 3Z"/>', 24, 1.800),
  people: wrap('<path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 .500a3.200 3.200 0 1 0 0-6.400 3.200 3.200 0 0 0 0 6.400ZM9 13c-3.500 0-6.500 1.800-6.500 4.200V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-1.800C15.500 14.800 12.500 13 9 13Zm7.500.500c-.600 0-1.100.1-1.600.2 1.300.9 2.100 2.100 2.100 3.500V19c0 .400-.1.700-.300 1H20.500a1 1 0 0 0 1-1v-1.500c0-2-2.300-4-5-4Z"/>'),
  check: stroke('<path d="m5 12.500 4.500 4.500L19 7.500"/>', 24, 2.6),
  bell: site["top_notifications_bell"] ?? "",
};

export const ICONS: Record<string, string> = { ...site, ...own };
export type IconName = string;
