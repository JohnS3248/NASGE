/**
 * WholeGuideContextMenu — 全篇模式右键菜单（简化版）
 *
 * 4 种模式：
 *   - selection：在普通正文 paragraph/heading/list 等里选中文字 → 格式化菜单
 *   - chapterTitle：在 chapterTitle 节点里 → 仅 inline marks（schema 限制 b/i/u/strike/spoiler）
 *   - empty：空白处 / 折叠选区 → 插入菜单（代码块 / 引用 / 表格）
 *   - table：在表格内 → 行/列操作
 *
 * 图片节点的右键菜单（preset / align / upload / delete）暂未迁移；后续接入图片池时再加。
 */

import React, { useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/core";
import { MenuItem, MenuSectionLabel, MenuDivider } from "./ContextMenuParts";

export type WholeGuideContextMode =
  | "selection"
  | "chapterTitle"
  | "empty"
  | "table";

export interface WholeGuideContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  mode: WholeGuideContextMode;
}

export const INITIAL_CONTEXT_MENU: WholeGuideContextMenuState = {
  visible: false,
  x: 0,
  y: 0,
  mode: "empty",
};

interface Props {
  editor: Editor | null;
  state: WholeGuideContextMenuState;
  onClose: () => void;
}

const WholeGuideContextMenu: React.FC<Props> = ({ editor, state, onClose }) => {
  const { t } = useTranslation("editor");
  const ref = useRef<HTMLDivElement>(null);

  // 渲染后根据实际尺寸贴回视口边界，避免溢出
  useLayoutEffect(() => {
    if (!state.visible || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    let x = state.x;
    let y = state.y;
    if (x + rect.width > window.innerWidth) {
      x = Math.max(0, window.innerWidth - rect.width - 4);
    }
    if (y + rect.height > window.innerHeight) {
      y = Math.max(0, window.innerHeight - rect.height - 4);
    }
    if (x !== state.x) ref.current.style.left = `${x}px`;
    if (y !== state.y) ref.current.style.top = `${y}px`;
  }, [state]);

  // 点击外部 / Esc 关闭
  useEffect(() => {
    if (!state.visible) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [state.visible, onClose]);

  if (!state.visible || !editor) return null;

  const cls =
    "fixed bg-bg-overlay border border-border-accent rounded-lg p-1 flex flex-col gap-1 min-w-[160px] z-[9999] shadow-xl";

  // 通用 inline marks（chapterTitle 仅显示这部分）
  const renderInlineMarks = () => (
    <>
      <MenuItem
        label={t("contextMenu.bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        onComplete={onClose}
      />
      <MenuItem
        label={t("contextMenu.italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        onComplete={onClose}
      />
      <MenuItem
        label={t("contextMenu.underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        onComplete={onClose}
      />
      <MenuItem
        label={t("contextMenu.strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        onComplete={onClose}
      />
      <MenuItem
        label={t("contextMenu.spoiler")}
        onClick={() => editor.chain().focus().toggleSpoiler().run()}
        onComplete={onClose}
      />
    </>
  );

  return (
    <div
      ref={ref}
      className={cls}
      style={{ top: state.y, left: state.x }}
    >
      {state.mode === "chapterTitle" && (
        <>
          <MenuSectionLabel label={t("wholeGuide.modeName")} />
          {renderInlineMarks()}
        </>
      )}

      {state.mode === "selection" && (
        <>
          <MenuItem
            label={t("contextMenu.heading1")}
            onClick={() =>
              editor.chain().focus().setHeading({ level: 1 }).run()
            }
            onComplete={onClose}
          />
          <MenuItem
            label={t("contextMenu.heading2")}
            onClick={() =>
              editor.chain().focus().setHeading({ level: 2 }).run()
            }
            onComplete={onClose}
          />
          <MenuItem
            label={t("contextMenu.heading3")}
            onClick={() =>
              editor.chain().focus().setHeading({ level: 3 }).run()
            }
            onComplete={onClose}
          />
          <MenuDivider />
          {renderInlineMarks()}
        </>
      )}

      {state.mode === "empty" && (
        <>
          <MenuItem
            label={t("contextMenu.insertCodeBlock")}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            onComplete={onClose}
          />
          <MenuItem
            label={t("contextMenu.insertQuote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            onComplete={onClose}
          />
          <MenuItem
            label={t("contextMenu.insertTable")}
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertTable({ rows: 2, cols: 2, withHeaderRow: false })
                .run()
            }
            onComplete={onClose}
          />
        </>
      )}

      {state.mode === "table" && (
        <>
          <MenuSectionLabel label={t("table.rowOps")} />
          <MenuItem
            label={t("table.insertAbove")}
            onClick={() => editor.chain().focus().addRowBefore().run()}
            onComplete={onClose}
          />
          <MenuItem
            label={t("table.insertBelow")}
            onClick={() => editor.chain().focus().addRowAfter().run()}
            onComplete={onClose}
          />
          <MenuItem
            label={t("table.deleteRow")}
            onClick={() => editor.chain().focus().deleteRow().run()}
            onComplete={onClose}
            danger
          />
          <MenuDivider />
          <MenuSectionLabel label={t("table.colOps")} />
          <MenuItem
            label={t("table.insertLeft")}
            onClick={() => editor.chain().focus().addColumnBefore().run()}
            onComplete={onClose}
          />
          <MenuItem
            label={t("table.insertRight")}
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            onComplete={onClose}
          />
          <MenuItem
            label={t("table.deleteCol")}
            onClick={() => editor.chain().focus().deleteColumn().run()}
            onComplete={onClose}
            danger
          />
          <MenuDivider />
          <MenuItem
            label={t("table.deleteTable")}
            onClick={() => editor.chain().focus().deleteTable().run()}
            onComplete={onClose}
            danger
          />
        </>
      )}
    </div>
  );
};

export default WholeGuideContextMenu;
