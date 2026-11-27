"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Strikethrough,
  Underline,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Notion-style notes: write in place, select text for a formatting bubble, markdown shortcuts work. */
export default function NotesEditor({ initial, onChange }: { initial: string; onChange: (html: string) => void }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "heading" ? "Heading" : "Write here… use # for a heading, - for a list, ``` for code",
      }),
    ],
    content: initial,
    editorProps: {
      attributes: {
        class: "tiptap",
        "aria-label": "Notes",
        // Notes are full of identifiers (minStack, dp[i]…); browser spell-check just adds noise.
        spellcheck: "false",
        autocorrect: "off",
        autocapitalize: "off",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  return (
    <div className="notes-editor">
      {editor && <FormatBubble editor={editor} />}
      <EditorContent editor={editor} />
      {!editor && <div className="min-h-80 animate-pulse rounded-lg bg-chip/40" />}
    </div>
  );
}

function FormatBubble({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      p: e.isActive("paragraph"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
    }),
  });

  const chain = () => editor.chain().focus();

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 8 }}
      className="flex items-center gap-0.5 rounded-lg border border-line2 bg-[#1c222b] p-1 shadow-2xl"
    >
      <Btn label="Text" active={s.p} onClick={() => chain().setParagraph().run()}>
        <Pilcrow />
      </Btn>
      <Btn label="Heading 1" active={s.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}>
        <Heading1 />
      </Btn>
      <Btn label="Heading 2" active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
        <Heading2 />
      </Btn>
      <Btn label="Heading 3" active={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
        <Heading3 />
      </Btn>
      <Sep />
      <Btn label="Bold (Ctrl+B)" active={s.bold} onClick={() => chain().toggleBold().run()}>
        <Bold />
      </Btn>
      <Btn label="Italic (Ctrl+I)" active={s.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic />
      </Btn>
      <Btn label="Underline (Ctrl+U)" active={s.underline} onClick={() => chain().toggleUnderline().run()}>
        <Underline />
      </Btn>
      <Btn label="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()}>
        <Strikethrough />
      </Btn>
      <Btn label="Inline code" active={s.code} onClick={() => chain().toggleCode().run()}>
        <Code />
      </Btn>
      <Sep />
      <Btn label="Bulleted list" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
        <List />
      </Btn>
      <Btn label="Numbered list" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrdered />
      </Btn>
      <Btn label="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>
        <Quote />
      </Btn>
    </BubbleMenu>
  );
}

function Btn({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md [&_svg]:size-4",
        active ? "bg-brand/15 text-brand-soft" : "text-soft hover:bg-white/5 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line2" />;
}
