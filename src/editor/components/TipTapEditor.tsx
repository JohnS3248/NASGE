import React, { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

const toolbarButton: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#d7e8ff",
  padding: "0.35rem 0.75rem",
  borderRadius: "0.6rem",
  fontSize: "0.85rem",
  cursor: "pointer",
  fontWeight: 600
};

type TipTapEditorProps = {
  initialContent?: string;
  onUpdate?: (html: string) => void;
};

const TipTapEditor: React.FC<TipTapEditorProps> = ({
  initialContent = "<p>欢迎使用 NASGE。这里是 Sprint 1 的 Tiptap 最小可行版本。</p>",
  onUpdate
}) => {
  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent,
    editorProps: {
      attributes: {
        class:
          "nasge-editor prose prose-invert focus:outline-none text-[15px] leading-relaxed"
      }
    },
    onUpdate: ({ editor }) => {
      onUpdate?.(editor.getHTML());
    }
  });

  useEffect(() => {
    return () => editor?.destroy();
  }, [editor]);

  if (!editor) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.85rem",
        background: "rgba(9, 15, 25, 0.55)",
        border: "1px solid rgba(102, 192, 244, 0.25)",
        borderRadius: "1rem",
        padding: "1.25rem",
        boxShadow: "0 18px 30px rgba(7, 11, 19, 0.45)"
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
          background: "rgba(15, 26, 41, 0.8)",
          borderRadius: "0.75rem",
          padding: "0.35rem",
          border: "1px solid rgba(102, 192, 244, 0.18)"
        }}
      >
        <button
          type="button"
          style={{
            ...toolbarButton,
            background: editor.isActive("bold")
              ? "rgba(102, 192, 244, 0.18)"
              : "transparent"
          }}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          加粗
        </button>
        <button
          type="button"
          style={{
            ...toolbarButton,
            background: editor.isActive("italic")
              ? "rgba(102, 192, 244, 0.18)"
              : "transparent"
          }}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          斜体
        </button>
        <button
          type="button"
          style={{
            ...toolbarButton,
            background: editor.isActive("bulletList")
              ? "rgba(102, 192, 244, 0.18)"
              : "transparent"
          }}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          无序列表
        </button>
        <button
          type="button"
          style={{
            ...toolbarButton,
            background: editor.isActive("orderedList")
              ? "rgba(102, 192, 244, 0.18)"
              : "transparent"
          }}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          有序列表
        </button>
        <button
          type="button"
          style={{
            ...toolbarButton,
            background: editor.isActive("codeBlock")
              ? "rgba(102, 192, 244, 0.18)"
              : "transparent"
          }}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          代码块
        </button>
      </div>

      <div
        style={{
          minHeight: "260px",
          background: "rgba(10, 18, 30, 0.78)",
          borderRadius: "0.9rem",
          padding: "1.1rem",
          border: "1px solid rgba(102, 192, 244, 0.18)",
          overflowY: "auto"
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

export default TipTapEditor;
