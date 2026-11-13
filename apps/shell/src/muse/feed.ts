// The catalysts' feed posts (muse/seed.ts FEED_POSTS) are facts about posts that surfaces/data.ts
// FEED already shows, so Home shows FEED as it is. Kept so callers keep one entry point.

import type { Post } from "../surfaces/data";

export function withFeedPosts<T extends Post>(posts: T[]): T[] {
  return posts;
}
