/**
 * WholeGuideTOC — 全篇模式右侧目录
 *
 * 折叠态：56px 宽细线柱（每项一条按层级缩进的横线）
 * 展开态：272px 宽文字目录（鼠标接近右边缘 56px 内触发展开）
 * scroll-spy：当前视口居中位置对应的最近 heading 高亮
 * 点击：smooth scroll 到对应章节起点
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/core";
import { useWholeGuideStore } from "../stores/useWholeGuideStore";
import {
  buildTOCItems,
  sliceDocByChapterTitle,
  CHAPTER_BODY_MAX_CHARS,
  type TOCItem,
} from "../utils/wholeGuideSlice";

const COLLAPSED_WIDTH = 56;
const EXPANDED_WIDTH = 272;
const HOVER_TRIGGER_PX = 56;
const SCROLL_OFFSET_PX = 80; // 跳转后让 heading 出现在视口上 ~80px 处
/** TOC 顶部偏移：避开顶部 header（外层 padding 24 + header 约 56 + 间距 8） */
const TOP_OFFSET_PX = 88;

interface Props {
  editor: Editor | null;
}

const WholeGuideTOC: React.FC<Props> = ({ editor }) => {
  const { t } = useTranslation("editor");
  const doc = useWholeGuideStore((s) => s.doc);
  const status = useWholeGuideStore((s) => s.status);

  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const navRef = useRef<HTMLElement>(null);

  const tocItems = useMemo<TOCItem[]>(
    () => (doc ? buildTOCItems(doc) : []),
    [doc]
  );

  // 字符计数：每章 BBCode 长度（debounce 500ms 重算，避免 keystroke 卡顿）
  const [chapterCharCounts, setChapterCharCounts] = useState<number[]>([]);
  useEffect(() => {
    if (!doc) {
      setChapterCharCounts([]);
      return;
    }
    const id = window.setTimeout(() => {
      try {
        const result = sliceDocByChapterTitle(doc);
        setChapterCharCounts(result.chapters.map((c) => c.bbcode.length));
      } catch {
        // ignore — 序列化偶发失败不影响 UI
      }
    }, 500);
    return () => clearTimeout(id);
  }, [doc]);

  // ---------------------------------------------------------------------------
  // hover 触发：鼠标离右边缘 < 56px 展开
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (tocItems.length === 0) {
      setExpanded(false);
      return;
    }
    const onMove = (e: MouseEvent) => {
      const fromRight = window.innerWidth - e.clientX;
      const overTOC = navRef.current?.contains(e.target as Node);
      setExpanded(overTOC || fromRight < HOVER_TRIGGER_PX);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [tocItems.length]);

  // ---------------------------------------------------------------------------
  // scroll-spy：window scroll 时找当前视口居中位置对应的最近 heading
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!editor || tocItems.length === 0) return;
    const view = editor.view;

    const recalcActive = () => {
      const centerY = window.innerHeight / 2;
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < tocItems.length; i++) {
        try {
          const coords = view.coordsAtPos(tocItems[i].pos);
          const dist = Math.abs(coords.top - centerY);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        } catch {
          // pos 越界（doc 改变期间）— 忽略
        }
      }
      setActiveIndex(bestIdx);
    };

    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recalcActive);
    };

    recalcActive();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [editor, tocItems]);

  // ---------------------------------------------------------------------------
  // 点击跳转
  // ---------------------------------------------------------------------------

  const handleJump = (item: TOCItem) => {
    if (!editor) return;
    try {
      const coords = editor.view.coordsAtPos(item.pos);
      const targetTop = window.scrollY + coords.top - SCROLL_OFFSET_PX;
      window.scrollTo({ top: targetTop, behavior: "smooth" });
    } catch {
      // ignore
    }
  };

  // ---------------------------------------------------------------------------
  // 渲染
  // ---------------------------------------------------------------------------

  if (status === "pulling" || tocItems.length === 0) return null;

  const widthPx = expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH;

  return (
    <nav
      ref={navRef}
      aria-label={t("wholeGuide.toc.label", { defaultValue: "目录" })}
      style={{
        position: "fixed",
        top: TOP_OFFSET_PX,
        right: expanded ? 16 : 0,
        bottom: 16,
        width: widthPx,
        zIndex: 50,
        transition: "width 200ms ease, right 200ms ease, border-color 200ms ease, background 200ms ease",
        background: expanded
          ? "rgba(13, 23, 36, 0.94)"
          : "rgba(13, 23, 36, 0.0)",
        backdropFilter: expanded ? "blur(8px)" : "none",
        WebkitBackdropFilter: expanded ? "blur(8px)" : "none",
        border: expanded
          ? "1px solid rgba(102, 192, 244, 0.22)"
          : "1px solid transparent",
        borderRadius: expanded ? 12 : 0,
        boxShadow: expanded
          ? "0 18px 36px rgba(8, 14, 23, 0.45)"
          : "none",
        overflowY: "auto",
        overflowX: "hidden",
        pointerEvents: "auto",
      }}
    >
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: expanded ? "10px 8px" : "16px 0",
          display: "flex",
          flexDirection: "column",
          gap: expanded ? 1 : 6,
        }}
      >
        {tocItems.map((item) => {
          const active = item.index === activeIndex;
          const charCount =
            item.kind === "chapterTitle" && item.chapterIndex !== undefined
              ? chapterCharCounts[item.chapterIndex]
              : undefined;
          return (
            <TOCItemRow
              key={item.index}
              item={item}
              active={active}
              expanded={expanded}
              charCount={charCount}
              onJump={handleJump}
            />
          );
        })}
      </ul>
    </nav>
  );
};

// =============================================================================
// 单条 TOC 项
// =============================================================================

interface RowProps {
  item: TOCItem;
  active: boolean;
  expanded: boolean;
  /** 章节字符计数（仅 chapterTitle 时有值） */
  charCount?: number;
  onJump: (item: TOCItem) => void;
}

function getCharLevelColor(count: number, max: number): string {
  const ratio = count / max;
  if (ratio >= 1) return "#ff6b6b"; // overflow → 红
  if (ratio >= 0.9) return "#ff9d4d"; // ≥ 90% → 橙
  if (ratio >= 0.8) return "#f7c948"; // ≥ 80% → 黄
  return "rgba(155, 175, 200, 0.65)";
}

const COLLAPSED_LINE_WIDTH: Record<TOCItem["kind"], number> = {
  chapterTitle: 22,
  h1: 18,
  h2: 14,
  h3: 10,
};

const TEXT_INDENT: Record<TOCItem["kind"], number> = {
  chapterTitle: 0,
  h1: 12,
  h2: 24,
  h3: 36,
};

const TOCItemRow: React.FC<RowProps> = ({
  item,
  active,
  expanded,
  charCount,
  onJump,
}) => {
  if (!expanded) {
    // 折叠态：每项一条横线（按层级宽度变化；字符超 80% 时染色提示）
    const lineWidth = COLLAPSED_LINE_WIDTH[item.kind];
    const overflowColor =
      charCount !== undefined && charCount / CHAPTER_BODY_MAX_CHARS >= 0.8
        ? getCharLevelColor(charCount, CHAPTER_BODY_MAX_CHARS)
        : null;
    return (
      <li>
        <button
          type="button"
          onClick={() => onJump(item)}
          title={
            item.text +
            (charCount !== undefined
              ? ` (${charCount}/${CHAPTER_BODY_MAX_CHARS})`
              : "")
          }
          style={{
            display: "flex",
            justifyContent: "center",
            width: "100%",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            padding: "3px 0",
          }}
        >
          <span
            style={{
              display: "block",
              width: lineWidth,
              height: 2,
              borderRadius: 1,
              background: active
                ? "#66c0f4"
                : overflowColor || "rgba(155, 175, 200, 0.35)",
              transition: "background 200ms ease, width 200ms ease",
            }}
          />
        </button>
      </li>
    );
  }

  // 展开态：紧凑行宽样式（Notion 风格）
  const isChapter = item.kind === "chapterTitle";
  const fontSize = isChapter ? 12.5 : 11.5;
  const baseColor = isChapter
    ? "rgba(215, 232, 255, 0.92)"
    : item.kind === "h1"
      ? "rgba(195, 215, 240, 0.78)"
      : "rgba(155, 175, 200, 0.72)";
  return (
    <li>
      <button
        type="button"
        onClick={() => onJump(item)}
        title={item.text}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          border: "none",
          background: active ? "rgba(102, 192, 244, 0.16)" : "transparent",
          color: active ? "#9bd2f5" : baseColor,
          fontSize,
          lineHeight: 1.4,
          fontWeight: active ? 600 : isChapter ? 500 : 400,
          paddingLeft: 6 + TEXT_INDENT[item.kind],
          paddingRight: 8,
          paddingTop: 3,
          paddingBottom: 3,
          borderRadius: 4,
          cursor: "pointer",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          transition: "background 120ms ease, color 120ms ease",
        }}
        onMouseEnter={(e) => {
          if (!active) {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
            e.currentTarget.style.color = "rgba(225, 240, 255, 1)";
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = baseColor;
          }
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
          {item.text || `(${item.kind})`}
          {charCount !== undefined && (
            <span
              style={{
                marginLeft: 6,
                fontSize: 9.5,
                fontWeight: 400,
                color: getCharLevelColor(charCount, CHAPTER_BODY_MAX_CHARS),
                fontVariantNumeric: "tabular-nums",
                opacity: 0.85,
              }}
              title={`${charCount} / ${CHAPTER_BODY_MAX_CHARS}`}
            >
              {charCount}/{CHAPTER_BODY_MAX_CHARS}
            </span>
          )}
        </span>
      </button>
    </li>
  );
};

export default WholeGuideTOC;
