/**
 * Cache tags for page data. Reads are cached ("use cache") and only refreshed when
 * one of our own server actions changes the data and expires the matching tag.
 *
 * - stats:      dashboard aggregates, topics list, next/in-progress/starred lists
 * - views:      the dashboard's "Recent" (last viewed) list
 * - topic:<id>: a topic page (topic, its patterns, its problem board)
 * - problem:<id>: a problem page (problem, its snippets)
 */
export const TAGS = {
  stats: "stats",
  views: "views",
  topic: (id: number) => `topic:${id}`,
  problem: (id: number) => `problem:${id}`,
};

/**
 * Cached page data never expires on a timer — only via the tags above.
 * `stale` keeps the client router's copy short so navigations re-check quickly.
 */
export const CACHE_FOREVER = { stale: 30, revalidate: 60 * 60 * 24 * 30, expire: 60 * 60 * 24 * 365 } as const;
