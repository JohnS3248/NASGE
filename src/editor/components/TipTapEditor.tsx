import React, { useCallback, useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Strike from "@tiptap/extension-strike";
import Heading from "@tiptap/extension-heading";
import Link from "@tiptap/extension-link";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";

import Spoiler from "../extensions/spoiler";

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

type ContextMenuState = {
  visible: boolean;
  x: number;
  y: number;
  mode: "selection" | "empty";
};

const TipTapEditor: React.FC<TipTapEditorProps> = ({
  initialContent = "<p>欢迎使用 NASGE。这里是 Sprint 1 的 Tiptap 最小可行版本。</p>",
  onUpdate
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    mode: "empty"
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false
      }),
      Underline,
      Strike,
      Heading.configure({
        levels: [1, 2, 3]
      }),
      Link.configure({
        openOnClick: false,
        linkOnPaste: true,
        autolink: true
      }),
      Spoiler,
      HorizontalRule,
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: "nasge-table"
        }
      }),
      TableRow,
      TableHeader,
      TableCell
    ],
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

  const toggleLink = useCallback(() => {
    if (!editor) return;

    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const selectionText = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to
    );

    const url = window.prompt("请输入链接地址", previousUrl ?? "https://");
    if (url === null || url.trim() === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }

    let label = selectionText;
    if (!label) {
      label = window.prompt("显示文本（留空则使用链接本身）", url) ?? url;
      editor
        .chain()
        .focus()
        .insertContent(label)
        .setTextSelection({
          from: editor.state.selection.from - label.length,
          to: editor.state.selection.from
        })
        .run();
    }

    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      .run();
  }, [editor]);

  const toggleSpoiler = useCallback(() => {
    editor?.chain().focus().toggleSpoiler().run();
  }, [editor]);

  const insertHorizontalRule = useCallback(() => {
    editor?.chain().focus().setHorizontalRule().run();
  }, [editor]);

  const insertTable = useCallback(() => {
    if (!editor) return;
    const rows = Number(window.prompt("输入表格行数", "2") ?? "0");
    const cols = Number(window.prompt("输入表格列数", "2") ?? "0");

    if (!rows || !cols) return;
    editor
      .chain()
      .focus()
      .insertTable({ rows, cols, withHeaderRow: true })
      .run();
  }, [editor]);

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  }, []);

  useEffect(() => {
    const listener = () => closeContextMenu();
    window.addEventListener("click", listener);
    return () => window.removeEventListener("click", listener);
  }, [closeContextMenu]);

  useEffect(() => {
    return () => editor?.destroy();
  }, [editor]);

  if (!editor) return null;

  const headingButtons = useMemo(
    () =>
      [
        { label: "H1", level: 1 as const },
        { label: "H2", level: 2 as const },
        { label: "H3", level: 3 as const }
      ] as const,
    []
  );

  return (
    <div
      style={{
        position: "relative",
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
            background: editor.isActive("underline")
              ? "rgba(102, 192, 244, 0.18)"
              : "transparent"
          }}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          下划线
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
            background: editor.isActive("strike")
              ? "rgba(102, 192, 244, 0.18)"
              : "transparent"
          }}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          删除线
        </button>

        {headingButtons.map(({ label, level }) => (
          <button
            key={label}
            type="button"
            style={{
              ...toolbarButton,
              background: editor.isActive("heading", { level })
                ? "rgba(102, 192, 244, 0.18)"
                : "transparent"
            }}
            onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
          >
            {label}
          </button>
        ))}

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
        <button type="button" style={toolbarButton} onClick={toggleLink}>
          链接
        </button>
        <button
          type="button"
          style={{
            ...toolbarButton,
            background: editor.isActive("spoiler")
              ? "rgba(102, 192, 244, 0.18)"
              : "transparent"
          }}
          onClick={toggleSpoiler}
        >
          隐藏文本
        </button>
        <button type="button" style={toolbarButton} onClick={insertHorizontalRule}>
          分割线
        </button>
        <button type="button" style={toolbarButton} onClick={insertTable}>
          表格
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
        onContextMenu={(event) => {
          event.preventDefault();
          const mode = editor.state.selection.empty ? "empty" : "selection";
          setContextMenu({
            visible: true,
            x: event.clientX,
            y: event.clientY,
            mode
          });
        }}
      >
        <EditorContent editor={editor} />
      </div>

      {contextMenu.visible ? (
        <div
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
            background: "rgba(13, 21, 34, 0.95)",
            border: "1px solid rgba(102, 192, 244, 0.3)",
            borderRadius: "0.75rem",
            padding: "0.35rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
            minWidth: "160px",
            zIndex: 9999,
            boxShadow: "0 16px 38px rgba(6, 12, 20, 0.55)"
          }}
        >
          {contextMenu.mode === "selection" ? (
            <>
              <MenuItem
                label="加粗"
                onClick={() => editor.chain().focus().toggleBold().run()}
                onComplete={closeContextMenu}
              />
              <MenuItem
                label="下划线"
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                onComplete={closeContextMenu}
              />
              <MenuItem
                label="删除线"
                onClick={() => editor.chain().focus().toggleStrike().run()}
                onComplete={closeContextMenu}
              />
              <MenuItem label="隐藏文本" onClick={toggleSpoiler} onComplete={closeContextMenu} />
              <MenuItem label="插入链接" onClick={toggleLink} onComplete={closeContextMenu} />
            </>
          ) : (
            <>
              <MenuItem label="插入表格" onClick={insertTable} onComplete={closeContextMenu} />
              <MenuItem
                label="插入分割线"
                onClick={insertHorizontalRule}
                onComplete={closeContextMenu}
              />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
};

type MenuItemProps = {
  label: string;
  onClick: () => void;
  onComplete: () => void;
};

const MenuItem: React.FC<MenuItemProps> = ({ label, onClick, onComplete }) => (
  <button
    type="button"
    onClick={() => {
      onClick();
      onComplete();
    }}
    style={{
      border: "none",
      background: "transparent",
      textAlign: "left",
      padding: "0.55rem 0.75rem",
      color: "#cde2ff",
      borderRadius: "0.6rem",
      fontSize: "0.85rem",
      cursor: "pointer"
    }}
    onMouseDown={(event) => {
      event.preventDefault();
    }}
  >
    {label}
  </button>
);

export default TipTapEditor;
