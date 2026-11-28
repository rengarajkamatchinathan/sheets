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
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import Image from "@tiptap/extension-image";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

const DEFAULT_PLACEHOLDER = "Write here… use # for a heading, - for a list, ``` for code";

/**
 * Notion-style rich text: write in place, select text for a formatting bubble,
 * markdown shortcuts work. With `editable={false}` it's a clean read view.
 */
export default function NotesEditor({
  initial,
  onChange,
  editable = true,
  label = "Notes",
  placeholder = DEFAULT_PLACEHOLDER,
  className,
}: {
  initial: string;
  onChange: (html: string) => void;
  editable?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: !editable, autolink: true, defaultProtocol: "https" },
      }),
      Superscript,
      Subscript,
      Image.configure({ inline: false }),
      Placeholder.configure({
        placeholder: ({ node }) => (node.type.name === "heading" ? "Heading" : placeholder),
      }),
    ],
    content: initial,
    editorProps: {
      attributes: {
        class: "tiptap",
        "aria-label": label,
        // Notes are full of identifiers (minStack, dp[i]…); browser spell-check just adds noise.
        spellcheck: "false",
        autocorrect: "off",
        autocapitalize: "off",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Switch between read and edit without remounting (keeps scroll and history).
  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [editor, editable]);

  return (
    <div className={cn("notes-editor", !editable && "is-readonly", className)}>
      {editor && editable && <FormatBubble editor={editor} />}
      <EditorContent editor={editor} />
      {/* Until Tiptap mounts, show the same content as static HTML (no blank flash). */}
      {!editor && <div className="tiptap" dangerouslySetInnerHTML={{ __html: initial }} />}
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
      className="flex items-center gap-0.5 rounded-lg border border-line2 bg-pop p-1 shadow-2xl"
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
        active ? "bg-brand/15 text-brand-soft" : "text-soft hover:bg-fg/5 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line2" />;
}
