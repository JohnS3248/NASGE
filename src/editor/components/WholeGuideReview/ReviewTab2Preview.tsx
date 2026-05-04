/**
 * ReviewTab2Preview — Steam 渲染预览
 *
 * 调 previewChapterFromSteam 拿真实 Steam 渲染 HTML：
 *   - 逐章节：显示当前选中章节
 *   - 整篇：N 次并行获取后拼接
 *
 * dangerouslySetInnerHTML 渲染 — 来源是 Steam 自家 API，可信。
 */

import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useWholeGuideStore } from "../../stores/useWholeGuideStore";
import {
  sliceDocByChapterTitle,
  type ChapterSlice,
} from "../../utils/wholeGuideSlice";
import { previewChapterFromSteam } from "../../services/chapterSync";
import { loggers } from "../../../shared/logger";

type PreviewMode = "perChapter" | "whole";

const ReviewTab2Preview: React.FC = () => {
  const { t } = useTranslation("editor");
  const { guideId } = useParams<{ guideId: string }>();
  const doc = useWholeGuideStore((s) => s.doc);
  const chapters = useWholeGuideStore((s) => s.chapters);

  const slices = useMemo<ChapterSlice[]>(() => {
    if (!doc) return [];
    try {
      return sliceDocByChapterTitle(
        doc,
        chapters.map((c) => ({ sectionId: c.sectionId, title: c.title }))
      ).chapters;
    } catch {
      return [];
    }
  }, [doc, chapters]);

  const [mode, setMode] = useState<PreviewMode>("perChapter");
  const [activeIdx, setActiveIdx] = useState(0);
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!guideId || slices.length === 0) {
      setHtml("");
      return;
    }
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        if (mode === "perChapter") {
          const slice = slices[activeIdx];
          if (!slice) {
            setHtml("");
            return;
          }
          const result = await previewChapterFromSteam(
            guideId,
            slice.sectionId ?? "",
            slice.title,
            slice.bbcode
          );
          if (!cancelled) setHtml(result);
        } else {
          // 整篇：并行拉所有章
          const all = await Promise.all(
            slices.map((s) =>
              previewChapterFromSteam(
                guideId,
                s.sectionId ?? "",
                s.title,
                s.bbcode
              )
            )
          );
          if (cancelled) return;
          const combined = all
            .map(
              (h, i) =>
                `<div class="chapter-preview"><h2 style="font-size:18px;color:#66c0f4;font-weight:400;margin:24px 0 10px;padding:10px 0 0;">${escapeHtml(slices[i].title)}</h2>${h}</div>`
            )
            .join('\n<hr style="border:0;border-top:1px solid rgba(102,192,244,0.18);margin:24px 0;" />\n');
          setHtml(combined);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        loggers.editor.error("Steam preview 失败", err);
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [guideId, slices, mode, activeIdx]);

  if (slices.length === 0) {
    return (
      <div style={{ padding: 32, color: "rgba(155, 175, 200, 0.6)" }}>
        {t("wholeGuide.review.previewEmpty")}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "14px 20px",
      }}
    >
      {/* 模式切换 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "rgba(13, 23, 36, 0.7)",
          border: "1px solid rgba(102, 192, 244, 0.12)",
          borderRadius: 8,
          fontSize: 12,
        }}
      >
        <ModeButton
          active={mode === "perChapter"}
          label={t("wholeGuide.review.previewModePerChapter")}
          onClick={() => setMode("perChapter")}
        />
        <ModeButton
          active={mode === "whole"}
          label={t("wholeGuide.review.previewModeWhole")}
          onClick={() => setMode("whole")}
        />
        {mode === "perChapter" && slices.length > 1 && (
          <ChapterSwitcher
            count={slices.length}
            active={activeIdx}
            onChange={setActiveIdx}
            slices={slices}
          />
        )}
      </div>

      {/* 渲染区 */}
      <div
        style={{
          flex: 1,
          minHeight: 200,
          padding: "14px 18px",
          background: "rgba(9, 15, 25, 0.5)",
          border: "1px solid rgba(102, 192, 244, 0.10)",
          borderRadius: 8,
          color: "rgb(150, 150, 150)",
          fontFamily: '"Motiva Sans", Arial, Helvetica, sans-serif',
          fontSize: 14,
          lineHeight: 1.4,
        }}
      >
        {loading ? (
          <div style={{ color: "rgba(155, 175, 200, 0.7)" }}>
            {t("wholeGuide.review.previewLoading")}
          </div>
        ) : error ? (
          <div style={{ color: "rgb(255, 130, 130)" }}>
            {t("wholeGuide.review.previewError", { err: error })}
          </div>
        ) : (
          <div
            className="nasge-editor-container"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </div>
  );
};

const ModeButton: React.FC<{
  active: boolean;
  label: string;
  onClick: () => void;
}> = ({ active, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      padding: "4px 10px",
      borderRadius: 4,
      border: "none",
      background: active ? "rgba(102, 192, 244, 0.16)" : "transparent",
      color: active ? "#9bd2f5" : "rgba(195, 215, 240, 0.7)",
      fontSize: 12,
      fontWeight: active ? 600 : 400,
      cursor: "pointer",
    }}
  >
    {label}
  </button>
);

const ChapterSwitcher: React.FC<{
  count: number;
  active: number;
  onChange: (i: number) => void;
  slices: ChapterSlice[];
}> = ({ count, active, onChange, slices }) => (
  <div
    style={{
      marginLeft: "auto",
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: 11,
      color: "rgba(195, 215, 240, 0.85)",
    }}
  >
    <button
      type="button"
      onClick={() => onChange(Math.max(0, active - 1))}
      disabled={active === 0}
      style={{
        padding: "2px 6px",
        background: "transparent",
        border: "1px solid rgba(102, 192, 244, 0.25)",
        borderRadius: 4,
        color: "inherit",
        cursor: active === 0 ? "not-allowed" : "pointer",
        opacity: active === 0 ? 0.4 : 1,
      }}
    >
      ←
    </button>
    <span
      style={{ minWidth: 64, textAlign: "center" }}
      title={slices[active]?.title}
    >
      {active + 1} / {count}
    </span>
    <button
      type="button"
      onClick={() => onChange(Math.min(count - 1, active + 1))}
      disabled={active === count - 1}
      style={{
        padding: "2px 6px",
        background: "transparent",
        border: "1px solid rgba(102, 192, 244, 0.25)",
        borderRadius: 4,
        color: "inherit",
        cursor: active === count - 1 ? "not-allowed" : "pointer",
        opacity: active === count - 1 ? 0.4 : 1,
      }}
    >
      →
    </button>
  </div>
);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default ReviewTab2Preview;
