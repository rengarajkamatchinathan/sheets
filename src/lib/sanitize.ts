import "server-only";
import sanitizeHtml from "sanitize-html";

/** Tags the rich-text editor understands (Tiptap StarterKit + sup/sub/image). */
const BASE: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "strong", "b", "em", "i", "u", "s", "code", "pre", "sup", "sub",
    "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "h4", "a", "img", "hr", "div", "span",
  ],
  allowedAttributes: { a: ["href"], img: ["src", "alt", "width", "height"] },
  allowedSchemes: ["https", "http", "mailto"],
  allowedSchemesByTag: { img: ["https"] },
  transformTags: { b: "strong", i: "em", h4: "h3" },
};

/**
 * Notes HTML (from our editor). Sanitized before it's ever rendered as raw HTML —
 * pages show it instantly as static markup while the editor loads.
 */
export function cleanRichText(html: string) {
  return sanitizeHtml(html, BASE);
}

/** Problem statements (LeetCode or pasted): also flattens wrapper divs and drops empty paragraphs. */
export function cleanDescription(html: string) {
  return sanitizeHtml(html, {
    ...BASE,
    allowedSchemes: ["https"],
    // LeetCode wraps examples in <div class="example-block">; keep as paragraphs.
    transformTags: { ...BASE.transformTags, div: "p" },
    exclusiveFilter: (frame) => frame.tag === "p" && !frame.text.trim() && !frame.mediaChildren.length,
  })
    .replace(/(&nbsp;| )+/g, " ")
    .trim();
}
