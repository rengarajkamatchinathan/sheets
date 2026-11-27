/** Starting notes for a new problem: empty. */
export const NOTES_TEMPLATE = "";

// The old starter template (headings only). Notes that still match it count as empty.
const LEGACY_TEMPLATE_TEXT = "IntuitionApproachEdgecasesMistakes";

function textOf(html: string) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, "");
}

/** True when the notes contain any text (an untouched old template counts as empty). */
export function hasRealNotes(notes: string) {
  const t = textOf(notes);
  return t !== "" && t !== LEGACY_TEMPLATE_TEXT;
}
