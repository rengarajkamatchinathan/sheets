/**
 * Warm the problem page's heavy editor code (CodeMirror + Tiptap) ahead of navigation.
 * Same module specifiers as the lazy imports in CodeTabs/RichText → same chunks, so the
 * page finds them already downloaded.
 */
let started = false;
export function preloadProblemEditors() {
  if (started) return;
  started = true;
  void import("@uiw/react-codemirror");
  void import("./NotesEditor");
}
