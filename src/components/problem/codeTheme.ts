import { createTheme } from "@uiw/codemirror-themes";
import { tags as t } from "@lezer/highlight";

/** CodeMirror theme built from the app palette (dark panels, teal accent). */
export const dsaTheme = createTheme({
  theme: "dark",
  settings: {
    background: "#0f1318",
    foreground: "#d4dce5",
    caret: "#2dd4bf",
    selection: "#2dd4bf33",
    selectionMatch: "#2dd4bf1f",
    lineHighlight: "#ffffff06",
    gutterBackground: "#0f1318",
    gutterForeground: "#3e4855",
    gutterActiveForeground: "#9ba7b4",
    gutterBorder: "transparent",
    fontFamily: "var(--font-jetbrains), ui-monospace, monospace",
  },
  styles: [
    { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword, t.definitionKeyword], color: "#5eead4" },
    { tag: [t.typeName, t.className, t.namespace], color: "#93c5fd" },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#fde68a" },
    { tag: [t.definition(t.variableName)], color: "#e6edf3" },
    { tag: [t.propertyName], color: "#c9d3dd" },
    { tag: [t.string, t.special(t.string), t.character], color: "#fdba74" },
    { tag: [t.number, t.bool, t.null, t.atom], color: "#f9a8d4" },
    { tag: [t.annotation, t.meta], color: "#c4b5fd" },
    { tag: [t.comment, t.lineComment, t.blockComment], color: "#5b6675", fontStyle: "italic" },
    { tag: [t.operator, t.punctuation, t.bracket, t.separator], color: "#9ba7b4" },
    { tag: [t.self], color: "#5eead4", fontStyle: "italic" },
    { tag: t.invalid, color: "#f87171" },
  ],
});
