/**
 * ReviewTab1Diff — 富文本 diff 主视图
 *
 * 左侧:章节列表(每章 hasChanges 标记 + add/del 字数)
 * 右侧:当前章节 DiffViewer(渲染 ins/del HTML)
 * 顶部:全局 summary
 * 键盘:← → 切换章节
 */

import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWholeGuideStore } from "../../stores/useWholeGuideStore";
import {
  richDiffWholeGuide,
  aggregateRichStats,
  type RichChapterDiffResult,
} from "../../utils/wholeGuideRichDiff";
import { sliceDocByChapterTitle } from "../../utils/wholeGuideSlice";
import DiffViewer from "./DiffViewer";

const ReviewTab1Diff: React.FC = () => {
  const { t } = useTranslation("editor");
  const doc = useWholeGuideStore((s) => s.doc);
  const chapters = useWholeGuideStore((s) => s.chapters);

  const [results, setResults] = useState<RichChapterDiffResult[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  // 切片 + diff(debounce 200ms 避免抖动)
  useEffect(() => {
    if (!doc) {
      setResults([]);
      return;
    }
    const id = window.setTimeout(() => {
      try {
        const sliceResult = sliceDocByChapterTitle(
          doc,
          chapters.map((c) => ({ sectionId: c.sectionId, title: c.title }))
        );
        const oldChapters = chapters.map((c) => ({
          sectionId: c.sectionId,
          title: c.title,
          bbcode: c.bbcode,
        }));
        const diffResults = richDiffWholeGuide(
          oldChapters,
          sliceResult.chapters
        );
        setResults(diffResults);
        const firstChanged = diffResults.findIndex((r) => r.hasChanges);
        setActiveIdx(firstChanged >= 0 ? firstChanged : 0);
      } catch {
        // ignore: 切片偶发失败
      }
    }, 200);
    return () => clearTimeout(id);
  }, [doc, chapters]);

  const summary = useMemo(() => aggregateRichStats(results), [results]);
  const active = results[activeIdx];

  // 键盘 ← / → 切章
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") {
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        setActiveIdx((i) => Math.min(results.length - 1, i + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [results.length]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "14px 20px",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "rgba(195, 215, 240, 0.85)",
          padding: "4px 2px",
        }}
      >
        {results.length === 0
          ? t("wholeGuide.review.noDirty")
          : t("wholeGuide.review.summary", {
              count: summary.changedCount,
              add: summary.totalAdditions,
              del: summary.totalDeletions,
            })}
      </div>

      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
        {/* 左侧:章节列表 */}
        <ChapterList
          results={results}
          activeIdx={activeIdx}
          onSelect={setActiveIdx}
        />

        {/* 右侧:diff 内容 */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "auto",
          }}
        >
          {active && (
            <div style={{ marginBottom: 8, fontSize: 13, color: "#9bd2f5" }}>
              {active.title}
              {active.isNew && (
                <span style={{ marginLeft: 8, fontSize: 11, color: "rgb(160, 230, 170)" }}>
                  {t("wholeGuide.review.newChapter")}
                </span>
              )}
              {active.isDeleted && (
                <span style={{ marginLeft: 8, fontSize: 11, color: "rgb(255, 170, 170)" }}>
                  {t("wholeGuide.review.deletedChapter")}
                </span>
              )}
            </div>
          )}
          <DiffViewer result={active} />
        </div>
      </div>

      <div style={{ fontSize: 11, color: "rgba(155, 175, 200, 0.6)" }}>
        {t("wholeGuide.review.chapterSwitcherHint")}
      </div>
    </div>
  );
};

// =============================================================================
// 章节列表
// =============================================================================

interface ChapterListProps {
  results: RichChapterDiffResult[];
  activeIdx: number;
  onSelect: (i: number) => void;
}

const ChapterList: React.FC<ChapterListProps> = ({
  results,
  activeIdx,
  onSelect,
}) => {
  const { t } = useTranslation("editor");
  return (
    <ul
      style={{
        flex: "0 0 240px",
        listStyle: "none",
        margin: 0,
        padding: 6,
        background: "rgba(9, 15, 25, 0.5)",
        border: "1px solid rgba(102, 192, 244, 0.10)",
        borderRadius: 8,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      {results.map((r, i) => {
        const active = i === activeIdx;
        return (
          <li key={`${r.sectionId ?? "new"}-${i}`}>
            <button
              type="button"
              onClick={() => onSelect(i)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "6px 10px",
                borderRadius: 4,
                border: "none",
                cursor: "pointer",
                background: active ? "rgba(102, 192, 244, 0.16)" : "transparent",
                color: active ? "#9bd2f5" : "rgba(195, 215, 240, 0.85)",
                fontSize: 12,
                lineHeight: 1.4,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
              onMouseEnter={(e) => {
                if (!active)
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = "transparent";
              }}
            >
              <span
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  fontWeight: r.hasChanges ? 600 : 400,
                }}
                title={r.title}
              >
                {r.title}
                {r.isNew && (
                  <span style={{ marginLeft: 6, color: "rgb(160, 230, 170)" }}>
                    {t("wholeGuide.review.newChapter")}
                  </span>
                )}
                {r.isDeleted && (
                  <span style={{ marginLeft: 6, color: "rgb(255, 170, 170)" }}>
                    {t("wholeGuide.review.deletedChapter")}
                  </span>
                )}
              </span>
              {r.hasChanges && (
                <span
                  style={{
                    fontSize: 10,
                    color: "rgba(155, 175, 200, 0.7)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  +{r.stats.additions} / −{r.stats.deletions}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
};

export default ReviewTab1Diff;
