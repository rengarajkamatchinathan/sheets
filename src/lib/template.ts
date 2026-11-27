/** Starting notes for a new problem (HTML for the rich-text editor). */
export const NOTES_TEMPLATE =
  "<h2>Intuition</h2><p></p><h2>Approach</h2><ol><li><p></p></li></ol><h2>Edge cases</h2><ul><li><p></p></li></ul><h2>Mistakes</h2><ul><li><p></p></li></ul>";

function textOf(html: string) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, "");
}

const TEMPLATE_TEXT = textOf(NOTES_TEMPLATE);

/** True when the notes contain any text beyond the blank template headings. */
export function hasRealNotes(notes: string) {
  const t = textOf(notes);
  return t !== "" && t !== TEMPLATE_TEXT;
}
