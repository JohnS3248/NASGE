/**
 * DiffViewer — 单章 diff 内容区
 *
 * 把 segments 渲染为带颜色的内联 span：
 *   - equal: 普通灰
 *   - insert: 浅绿
 *   - delete: 浅红 + 删除线
 *
 * 可选 collapseEqualContext（依 contextLines 折叠中间长 equal 段）。
 */

import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  type DiffSegment,
  type ChapterDiffResult,
  collapseEqualContext,
} from "../../utils/wholeGuideDiff";

interface Props {
  result: ChapterDiffResult | undefined;
  contextLines: number;
}

const DiffViewer: React.FC<Props> = ({ result, contextLines }) => {
  const { t } = useTranslation("editor");

  const segments: DiffSegment[] = useMemo(() => {
    if (!result) return [];
    return collapseEqualContext(result.segments, contextLines);
  }, [result, contextLines]);

  if (!result) {
    return (
      <div
        style={{
          padding: 32,
          color: "rgba(155, 175, 200, 0.6)",
          textAlign: "center",
        }}
      >
        —
      </div>
    );
  }

  if (!result.hasChanges) {
    return (
      <div
        style={{
          padding: 32,
          color: "rgba(155, 175, 200, 0.7)",
          textAlign: "center",
          fontSize: 13,
        }}
      >
        {t("wholeGuide.review.noChanges")}
      </div>
    );
  }

  return (
    <pre
      style={{
        margin: 0,
        padding: "12px 14px",
        fontSize: 12,
        lineHeight: 1.6,
        fontFamily: 'Menlo, Consolas, "Courier New", monospace',
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        background: "rgba(9, 15, 25, 0.4)",
        border: "1px solid rgba(102, 192, 244, 0.10)",
        borderRadius: 8,
        color: "rgba(215, 232, 255, 0.85)",
      }}
    >
      {segments.map((seg, i) => (
        <SegmentSpan key={i} seg={seg} />
      ))}
    </pre>
  );
};

const SegmentSpan: React.FC<{ seg: DiffSegment }> = ({ seg }) => {
  if (seg.op === "insert") {
    return (
      <span
        style={{
          background: "rgba(80, 200, 120, 0.18)",
          color: "rgb(160, 230, 170)",
          padding: "0 1px",
          borderRadius: 2,
        }}
      >
        {seg.text}
      </span>
    );
  }
  if (seg.op === "delete") {
    return (
      <span
        style={{
          background: "rgba(255, 100, 100, 0.18)",
          color: "rgb(255, 170, 170)",
          textDecoration: "line-through",
          padding: "0 1px",
          borderRadius: 2,
        }}
      >
        {seg.text}
      </span>
    );
  }
  return <span>{seg.text}</span>;
};

export default DiffViewer;
