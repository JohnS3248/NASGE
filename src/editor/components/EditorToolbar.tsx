import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorConfigStore } from "../stores/useEditorConfigStore";

const toolbarButton: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--text-primary, #d7e8ff)",
  padding: "0.4rem",
  borderRadius: "var(--radius-sm, 0.6rem)",
  fontSize: "0.85rem",
  cursor: "pointer",
  fontWeight: 600,
  width: "32px",
  height: "32px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1
};

type ToolbarIconProps = {
  label: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title?: string;
};

const ToolbarIcon: React.FC<ToolbarIconProps> = ({ label, onClick, active, title }) => (
  <button
    type="button"
    title={title}
    style={{
      ...toolbarButton,
      background: active ? "rgba(102, 192, 244, 0.2)" : "transparent"
    }}
    onClick={onClick}
  >
    {label}
  </button>
);

type EditorToolbarProps = {
  editor: Editor | null;
};

const EditorToolbar: React.FC<EditorToolbarProps> = ({ editor }) => {
  const toolbarPos = useEditorConfigStore((s) => s.toolbarPos);
  const setToolbarPos = useEditorConfigStore((s) => s.setToolbarPos);

  const [isDragging, setIsDragging] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [, setSelectionKey] = useState(0);

  // 监听编辑器选择变化以更新按钮状态
  useEffect(() => {
    if (!editor) return;
    const handler = () => setSelectionKey((k) => k + 1);
    editor.on("selectionUpdate", handler);
    editor.on("transaction", handler);
    return () => {
      editor.off("selectionUpdate", handler);
      editor.off("transaction", handler);
    };
  }, [editor]);

  // 计算默认位置 — 贴在编辑区 <main> 左侧
  const getDefaultPos = useCallback(() => {
    const mainEl = document.querySelector("main");
    if (mainEl) {
      const rect = mainEl.getBoundingClientRect();
      const toolbarWidth = toolbarRef.current?.offsetWidth ?? 44;
      return {
        x: Math.max(4, rect.left - toolbarWidth - 8),
        y: rect.top
      };
    }
    return { x: 8, y: 200 };
  }, []);

  const [pos, setPos] = useState(() => {
    if (toolbarPos.x >= 0 && toolbarPos.y >= 0) return toolbarPos;
    return { x: -1, y: -1 };
  });

  // 延迟计算默认位置 + 入场动画
  useEffect(() => {
    if (pos.x < 0 || pos.y < 0) {
      requestAnimationFrame(() => {
        const defaultPos = getDefaultPos();
        setPos(defaultPos);
        // 入场动画延迟
        requestAnimationFrame(() => setIsVisible(true));
      });
    } else {
      setIsVisible(true);
    }
  }, [pos, getDefaultPos]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: pos.x,
        posY: pos.y
      };
    },
    [pos]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const newX = Math.max(0, Math.min(window.innerWidth - 60, dragStartRef.current.posX + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - 50, dragStartRef.current.posY + dy));
      setPos({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      if (dragStartRef.current) {
        setToolbarPos(pos);
      }
      dragStartRef.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isDragging, pos, setToolbarPos]);

  if (!editor) return null;
  if (pos.x < 0 || pos.y < 0) return null;

  const toggleSpoiler = () => editor.chain().focus().toggleSpoiler().run();
  const insertHorizontalRule = () => editor.chain().focus().setHorizontalRule().run();
  const clearFormatting = () =>
    editor.chain().focus().unsetAllMarks().clearNodes().setParagraph().run();

  const headingButtons = [
    { label: "H1", level: 1 as const },
    { label: "H2", level: 2 as const },
    { label: "H3", level: 3 as const }
  ];

  return (
    <div
      ref={toolbarRef}
      onMouseDown={handleMouseDown}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 5000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "2px",
        background: "var(--bg-toolbar, rgba(15, 26, 41, 0.95))",
        borderRadius: "var(--radius-md, 0.75rem)",
        padding: "0.35rem",
        border: "1px solid var(--border-input, rgba(102, 192, 244, 0.18))",
        backdropFilter: "blur(12px)",
        boxShadow: "0 8px 24px rgba(6, 12, 20, 0.5)",
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateX(0)" : "translateX(-16px)",
        transition: "opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)"
      }}
    >
      <ToolbarIcon
        label="B"
        title="粗体"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarIcon
        label={<em style={{ fontStyle: "italic", fontFamily: "Georgia, serif" }}>I</em>}
        title="斜体"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarIcon
        label="U"
        title="下划线"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />
      <ToolbarIcon
        label={
          <span style={{ position: "relative", fontWeight: 600 }}>
            S
            <span
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: "45%",
                borderBottom: "2px solid currentColor",
                transform: "rotate(-12deg)"
              }}
            />
          </span>
        }
        title="删除线"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      {/* 分隔线 */}
      <div style={{ width: "70%", height: "1px", background: "var(--border-subtle, rgba(102, 192, 244, 0.15))", margin: "2px 0" }} />
      <ToolbarIcon
        label="🙈"
        title="隐藏文本"
        active={editor.isActive("spoiler")}
        onClick={toggleSpoiler}
      />
      <ToolbarIcon
        label="<>"
        title="代码块"
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />
      <ToolbarIcon label="—" title="分隔线" onClick={insertHorizontalRule} />
      {/* 分隔线 */}
      <div style={{ width: "70%", height: "1px", background: "var(--border-subtle, rgba(102, 192, 244, 0.15))", margin: "2px 0" }} />
      {headingButtons.map(({ label, level }) => (
        <ToolbarIcon
          key={label}
          label={label}
          title={`标题 ${level}`}
          active={editor.isActive("heading", { level })}
          onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
        />
      ))}
      {/* 分隔线 */}
      <div style={{ width: "70%", height: "1px", background: "var(--border-subtle, rgba(102, 192, 244, 0.15))", margin: "2px 0" }} />
      <ToolbarIcon
        label="•"
        title="项目符号列表"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarIcon
        label="1."
        title="有序列表"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarIcon label="Tx" title="清除格式" onClick={clearFormatting} />
    </div>
  );
};

export default EditorToolbar;
