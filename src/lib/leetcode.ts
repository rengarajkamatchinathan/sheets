import "server-only";
import { cleanDescription } from "./sanitize";

/** "https://leetcode.com/problems/min-stack/description/" → "min-stack" */
export function leetcodeSlug(url: string): string | null {
  const m = url.match(/^https?:\/\/(?:www\.)?leetcode\.(?:com|cn)\/problems\/([a-z0-9-]+)/i);
  return m ? m[1].toLowerCase() : null;
}

export type FetchResult =
  | { ok: true; html: string }
  | { ok: false; reason: "not-leetcode" | "premium" | "not-found" | "network" };

export type MetaResult =
  | { ok: true; slug: string; number: number | null; title: string; difficulty: "Easy" | "Medium" | "Hard"; premium: boolean }
  | { ok: false; reason: "not-leetcode" | "not-found" | "network" };

/**
 * POSTs a query to LeetCode's public (unofficial) GraphQL endpoint. Only the slug is sent.
 * Returns the `question` object, `null` if LeetCode doesn't know the slug, or throws on network errors.
 */
async function queryQuestion<T>(slug: string, fields: string): Promise<T | null> {
  const res = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: `https://leetcode.com/problems/${slug}/`,
      "User-Agent": "Mozilla/5.0 (compatible; DSA-Log)",
    },
    body: JSON.stringify({
      query: `query q($titleSlug: String!) { question(titleSlug: $titleSlug) { ${fields} } }`,
      variables: { titleSlug: slug },
    }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`LeetCode responded ${res.status}`);
  const json = (await res.json()) as { data?: { question?: T | null } };
  return json.data?.question ?? null;
}

/** Problem statement as sanitized HTML, safe to store and render. */
export async function fetchLeetCodeDescription(url: string): Promise<FetchResult> {
  const slug = leetcodeSlug(url);
  if (!slug) return { ok: false, reason: "not-leetcode" };
  try {
    const q = await queryQuestion<{ isPaidOnly: boolean; content: string | null }>(slug, "isPaidOnly content");
    if (!q) return { ok: false, reason: "not-found" };
    if (!q.content) return { ok: false, reason: q.isPaidOnly ? "premium" : "not-found" };
    return { ok: true, html: cleanDescription(q.content) };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/** Number, title and difficulty for a LeetCode link (works for Premium problems too). */
export async function fetchLeetCodeMeta(url: string): Promise<MetaResult> {
  const slug = leetcodeSlug(url);
  if (!slug) return { ok: false, reason: "not-leetcode" };
  try {
    const q = await queryQuestion<{ questionFrontendId: string; title: string; difficulty: string; isPaidOnly: boolean }>(
      slug,
      "questionFrontendId title difficulty isPaidOnly",
    );
    if (!q) return { ok: false, reason: "not-found" };
    const difficulty = (["Easy", "Medium", "Hard"] as const).find((d) => d === q.difficulty) ?? "Medium";
    const n = parseInt(q.questionFrontendId, 10);
    return { ok: true, slug, number: Number.isFinite(n) ? n : null, title: q.title, difficulty, premium: q.isPaidOnly };
  } catch {
    return { ok: false, reason: "network" };
  }
}
