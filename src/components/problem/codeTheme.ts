import { createTheme } from "@uiw/codemirror-themes";
import { tags as t } from "@lezer/highlight";

/** CodeMirror theme built from the app palette (reads the theme CSS variables, so it follows light/dark). */
export const dsaTheme = createTheme({
  theme: "dark",
  settings: {
    background: "var(--app-editor)",
    foreground: "var(--app-code)",
    caret: "var(--app-brand)",
    selection: "color-mix(in srgb, var(--app-brand) 22%, transparent)",
    selectionMatch: "color-mix(in srgb, var(--app-brand) 12%, transparent)",
    lineHighlight: "color-mix(in srgb, var(--app-fg) 3%, transparent)",
    gutterBackground: "var(--app-editor)",
    gutterForeground: "var(--app-dim)",
    gutterActiveForeground: "var(--app-mute)",
    gutterBorder: "transparent",
    fontFamily: "var(--font-jetbrains), ui-monospace, monospace",
  },
  styles: [
    { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword, t.definitionKeyword], color: "var(--hl-keyword)" },
    { tag: [t.typeName, t.className, t.namespace], color: "var(--hl-type)" },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--hl-fn)" },
    { tag: [t.definition(t.variableName)], color: "var(--app-ink)" },
    { tag: [t.propertyName], color: "var(--app-soft)" },
    { tag: [t.string, t.special(t.string), t.character], color: "var(--hl-string)" },
    { tag: [t.number, t.bool, t.null, t.atom], color: "var(--hl-number)" },
    { tag: [t.annotation, t.meta], color: "var(--hl-meta)" },
    { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--hl-comment)", fontStyle: "italic" },
    { tag: [t.operator, t.punctuation, t.bracket, t.separator], color: "var(--app-mute)" },
    { tag: [t.self], color: "var(--hl-keyword)", fontStyle: "italic" },
    { tag: t.invalid, color: "var(--app-hard)" },
  ],
});
