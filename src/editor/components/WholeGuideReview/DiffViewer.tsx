/**
 * DiffViewer — 富文本 diff 渲染
 *
 * 输入:RichChapterDiffResult.diffHtml(已含 <ins>/<del> 标记的合法 HTML)
 * 渲染:dangerouslySetInnerHTML + .nasge-rich-diff scope 下的 ins/del 样式
 * 视觉:整块 h1-h5 / p / blockquote / table 保留 Steam 渲染样式,
 *   仅改动字符 / 标签上色(绿 ins / 红 del),粒度到字到格式
 */

import React from "react";
import { useTranslation } from "react-i18next";
import type { RichChapterDiffResult } from "../../utils/wholeGuideRichDiff";

interface Props {
  result: RichChapterDiffResult | undefined;
}

const DiffViewer: React.FC<Props> = ({ result }) => {
  const { t } = useTranslation("editor");

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
    <div
      className="nasge-editor-container nasge-rich-diff"
      style={{
        padding: "14px 18px",
        background: "rgba(9, 15, 25, 0.5)",
        border: "1px solid rgba(102, 192, 244, 0.10)",
        borderRadius: 8,
      }}
    >
      {/* 包一层 .ProseMirror 让现有编辑器样式选择器命中(标题字号、引用框、代码块、表格等 Steam 风格) */}
      <div
        className="ProseMirror"
        dangerouslySetInnerHTML={{ __html: result.diffHtml }}
      />
    </div>
  );
};

export default DiffViewer;
