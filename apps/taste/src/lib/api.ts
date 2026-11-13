import type { Shown } from "../../server.ts";
import type { Summary } from "@muse/taste";

export type { Shown, Summary };
export type Decision = "like" | "dislike" | "love" | "skip" | "a" | "b";

const get = async <T>(url: string): Promise<T> => {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return (await r.json()) as T;
};
const post = async <T>(url: string, body: unknown): Promise<T> => {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return (await r.json()) as T;
};

export const api = {
  next: (k: number, exclude: string[]) => get<Shown[]>(`/api/next?k=${k}&exclude=${encodeURIComponent(exclude.join(","))}`),
  judge: (b: { key: string; decision: Decision; ms: number; interacted: boolean; order: number; session: string }) => post<{ id: string; n: number; trained: boolean }>("/api/judge", b),
  undo: (id: string) => post<{ n: number }>("/api/undo", { id }),
  stats: () => get<{ n: number }>("/api/stats"),
  summary: () => get<Summary>("/api/summary"),
};
