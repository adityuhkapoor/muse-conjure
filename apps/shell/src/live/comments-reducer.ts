// Comments on feed posts, folded in the feed room (`t:feed-home`) by the chat reducer. A comment is
// not a message: the feed shows every text message as a post, so comments live beside them.
// `post` is any post id, `replyTo` a comment id (a seeded one from surfaces/comments.ts, or one made
// here). A like on a comment is a toggle per person and may name a seeded comment.

import type { ChatState } from "./chat-reducer";

export type WireComment = { id: string; post: string; from: string; text: string; at: number; replyTo?: string };

const MAX_COMMENT = 1000;
const MAX_COMMENTS = 500;
const ok = (v: unknown, max = 120): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

export function addComment(s: ChatState, a: Record<string, unknown>, from: string, at: number): ChatState {
  if (!ok(a.id) || !ok(a.post) || !ok(a.text, MAX_COMMENT) || !a.text.trim()) return s;
  const list = s.comments ?? [];
  if (list.length >= MAX_COMMENTS || list.some((c) => c.id === a.id)) return s;
  const c: WireComment = { id: a.id, post: a.post, from, text: a.text, at, ...(ok(a.replyTo) ? { replyTo: a.replyTo } : {}) };
  return { ...s, comments: [...list, c] };
}

export function toggleCommentLike(s: ChatState, a: Record<string, unknown>, who: string): ChatState {
  if (!ok(a.id)) return s;
  const likes = s.commentLikes ?? {};
  const now = likes[a.id] ?? [];
  const next = now.includes(who) ? now.filter((x) => x !== who) : [...now, who];
  const { [a.id]: _gone, ...rest } = likes;
  return { ...s, commentLikes: next.length ? { ...rest, [a.id]: next } : rest };
}

/** A like on a seeded Home post: a toggle per person, keyed by the post id. */
export function togglePostLike(s: ChatState, a: Record<string, unknown>, who: string): ChatState {
  if (!ok(a.id)) return s;
  const likes = s.postLikes ?? {};
  const now = likes[a.id] ?? [];
  const next = now.includes(who) ? now.filter((x) => x !== who) : [...now, who];
  const { [a.id]: _gone, ...rest } = likes;
  return { ...s, postLikes: next.length ? { ...rest, [a.id]: next } : rest };
}
