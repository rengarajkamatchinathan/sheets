export const NOTES_TEMPLATE = `## Intuition


## Approach
1. 

## Edge cases
- 

## Mistakes
- 
`;

/** True when the notes contain something beyond the blank template. */
export function hasRealNotes(notes: string) {
  const t = notes.trim();
  return t !== "" && t !== NOTES_TEMPLATE.trim();
}
