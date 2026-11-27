import "server-only";
import sanitizeHtml from "sanitize-html";

/** "https://leetcode.com/problems/min-stack/description/" → "min-stack" */
export function leetcodeSlug(url: string): string | null {
  const m = url.match(/^https?:\/\/(?:www\.)?leetcode\.(?:com|cn)\/problems\/([a-z0-9-]+)/i);
  return m ? m[1].toLowerCase() : null;
}

export type FetchResult =
  | { ok: true; html: string }
  | { ok: false; reason: "not-leetcode" | "premium" | "not-found" | "network" };

const QUERY = `query questionContent($titleSlug: String!) {
  question(titleSlug: $titleSlug) { isPaidOnly content }
}`;

/**
 * Fetches a problem statement from LeetCode's public (unofficial) GraphQL endpoint.
 * Only the slug is sent. Returns sanitized HTML safe to store and render.
 */
export async function fetchLeetCodeDescription(url: string): Promise<FetchResult> {
  const slug = leetcodeSlug(url);
  if (!slug) return { ok: false, reason: "not-leetcode" };
  try {
    const res = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Referer: `https://leetcode.com/problems/${slug}/`,
        "User-Agent": "Mozilla/5.0 (compatible; DSA-Log)",
      },
      body: JSON.stringify({ query: QUERY, variables: { titleSlug: slug } }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, reason: "network" };
    const json = (await res.json()) as { data?: { question?: { isPaidOnly: boolean; content: string | null } | null } };
    const q = json.data?.question;
    if (!q) return { ok: false, reason: "not-found" };
    if (!q.content) return { ok: false, reason: q.isPaidOnly ? "premium" : "not-found" };
    return { ok: true, html: cleanDescription(q.content) };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/** Keep only the structure the editor understands; drop scripts, styles, classes, handlers. */
export function cleanDescription(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "strong", "b", "em", "i", "u", "s", "code", "pre", "sup", "sub",
      "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "h4", "a", "img", "hr", "div", "span",
    ],
    allowedAttributes: { a: ["href"], img: ["src", "alt", "width", "height"] },
    allowedSchemes: ["https"],
    allowedSchemesByTag: { img: ["https"] },
    transformTags: {
      b: "strong",
      i: "em",
      h4: "h3",
      // LeetCode wraps examples in <div class="example-block">; keep as paragraphs.
      div: "p",
    },
    exclusiveFilter: (frame) => frame.tag === "p" && !frame.text.trim() && !frame.mediaChildren.length,
  })
    .replace(/(&nbsp;| )+/g, " ")
    .trim();
}
