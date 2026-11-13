/** DS: one decimal under 10K ("2.3K"), none above ("219K"), full digits with commas on detail views. */
export function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(Math.floor(n / 100) / 10).toString()}K`;
  return `${Math.round(n / 1000)}K`;
}

/** "Maya", "Maya and Arun", "Maya, Arun and Will" */
export function names(list: string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
}
