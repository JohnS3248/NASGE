import React, { useState, useEffect, useRef, useCallback } from "react";
import { previewChapterFromSteam } from "../services/chapterSync";
import { useGuideStore } from "../stores/useGuideStore";
import { loggers } from "../../shared/logger";

/**
 * Steam 指南 BBCode 渲染样式
 * 从 Steam 社区页面提取的 CSS，用于正确渲染预览内容
 */
const STEAM_BBCODE_CSS = `
/* ===== 基础容器样式 ===== */
.steam-preview-content {
  width: 638px;
  min-width: 638px;
  margin: 0 auto;
  font-size: 14px;
  line-height: 20px;
  color: #969696;
  font-family: "Motiva Sans", Arial, Helvetica, sans-serif;
}

/* ===== 段落样式 ===== */
.steam-preview-content p {
  margin: 0;
}

/* ===== 标题样式: Steam bb_h1/bb_h2/bb_h3 ===== */
.steam-preview-content .bb_h1,
.steam-preview-content div.bb_h1 {
  font-size: 20px;
  line-height: 23px;
  color: #5aa9d6;
  font-weight: normal;
  margin-bottom: 10px;
  margin-top: 0;
  clear: both;
}

.steam-preview-content .bb_h2,
.steam-preview-content div.bb_h2 {
  color: #5aa9d6;
  margin-bottom: 6px;
  margin-top: 8px;
  font-size: 18px;
  line-height: 21px;
  font-weight: 400;
  clear: both;
}

.steam-preview-content .bb_h3,
.steam-preview-content div.bb_h3 {
  color: #5aa9d6;
  margin-bottom: 6px;
  margin-top: 8px;
  font-size: 16px;
  line-height: 19px;
  font-weight: 300;
  clear: both;
}

/* ===== 文本格式样式 ===== */
.steam-preview-content b,
.steam-preview-content strong {
  font-weight: bold;
}

.steam-preview-content i,
.steam-preview-content em {
  font-style: italic;
}

.steam-preview-content u {
  text-decoration: underline;
}

.steam-preview-content .bb_strike,
.steam-preview-content s {
  text-decoration: line-through;
}

/* ===== 链接样式 ===== */
.steam-preview-content a {
  color: #66c0f4;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.steam-preview-content a:hover {
  color: #ffffff;
}

/* ===== 代码样式 ===== */
.steam-preview-content .bb_code,
.steam-preview-content pre.bb_code {
  border: 1px solid #535354;
  border-radius: 3px;
  padding: 12px;
  margin: 8px;
  font-size: 11px;
  font-family: Consolas, "Courier New", monospace;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-x: auto;
  background: rgba(6, 14, 25, 0.92);
  color: #acb2b8;
  display: block;
}

.steam-preview-content code {
  background: transparent;
  padding: 0.1rem 0.25rem;
  font-family: Consolas, "Courier New", monospace;
  font-size: 11px;
}

/* ===== 引用块样式 ===== */
.steam-preview-content .bb_blockquote,
.steam-preview-content blockquote.bb_blockquote {
  border: 1px solid #56707f;
  padding: 12px;
  margin: 8px;
  font-size: 92%;
  display: table;
  word-break: break-word;
  background: transparent;
}

.steam-preview-content .bb_blockquote_author {
  font-size: 12px;
  color: #898989;
  margin-bottom: 0.5rem;
}

/* ===== 剧透/折叠样式 ===== */
.steam-preview-content .bb_spoiler {
  color: #000000;
  background-color: #000000;
  padding: 0px 8px;
}

.steam-preview-content .bb_spoiler:hover {
  color: #ffffff;
}

/* ===== 列表样式 ===== */
.steam-preview-content ul,
.steam-preview-content ol {
  padding-left: 20px;
  margin: 0 0 0.5em;
  font-size: 14px;
  line-height: 20px;
}

.steam-preview-content li {
  margin-bottom: 0.25em;
}

/* ===== 表格样式 ===== */
.steam-preview-content .bb_table,
.steam-preview-content table {
  display: table;
  font-size: 12px;
  margin: 0.6rem 0;
  border-collapse: collapse;
}

.steam-preview-content .bb_table th,
.steam-preview-content table th {
  font-weight: bold;
  border: 1px solid #4d4d4d;
  padding: 4px;
  background: transparent;
  min-width: 1.5em;
}

.steam-preview-content .bb_table tr,
.steam-preview-content table tr {
  display: table-row;
}

.steam-preview-content .bb_table td,
.steam-preview-content table td {
  vertical-align: middle;
  border: 1px solid #4d4d4d;
  padding: 4px;
  background: transparent;
  min-width: 1.5em;
}

/* ===== 图片样式 ===== */
.steam-preview-content img {
  max-width: 100%;
  height: auto;
}

.steam-preview-content .bb_link_img {
  display: inline-block;
}

/* ===== 水平线样式 ===== */
.steam-preview-content hr {
  border: none;
  border-top: 1px solid #4d4d4d;
  margin: 1em 0;
}

/* ===== 浮动图片样式 ===== */
.steam-preview-content .bb_float_left {
  float: left;
  margin-right: 10px;
  margin-bottom: 10px;
}

.steam-preview-content .bb_float_right {
  float: right;
  margin-left: 10px;
  margin-bottom: 10px;
}

/* ===== 清除浮动 ===== */
.steam-preview-content::after {
  content: "";
  display: table;
  clear: both;
}
`;

type PreviewPanelProps = {
  bbcode: string;
  title: string;
};

/**
 * Steam 官方预览面板
 * 使用 Steam 的 previewguidesubsection API 渲染 BBCode
 */
export const PreviewPanel: React.FC<PreviewPanelProps> = ({ bbcode, title }) => {
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const lastRequestRef = useRef<string>("");

  const guideInfo = useGuideStore((s) => s.guideInfo);
  const activeDraft = useGuideStore((s) => {
    const drafts = s.drafts;
    const activeId = s.activeDraftId;
    return drafts.find((d) => d.id === activeId) ?? drafts[0];
  });

  const fetchPreview = useCallback(async (content: string, contentTitle: string) => {
    // 生成请求唯一标识，避免重复请求
    const requestKey = `${content}|${contentTitle}`;
    if (requestKey === lastRequestRef.current) {
      return;
    }
    lastRequestRef.current = requestKey;

    if (!guideInfo?.id) {
      setError("未获取到指南信息");
      return;
    }

    const sectionId = activeDraft?.linkedChapterId;
    if (!sectionId) {
      setError("当前草稿未关联章节，无法预览");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const html = await previewChapterFromSteam(
        guideInfo.id,
        sectionId,
        contentTitle,
        content
      );
      setPreviewHtml(html);
    } catch (err) {
      loggers.sync.error("预览失败", err);
      setError(err instanceof Error ? err.message : "预览请求失败");
    } finally {
      setIsLoading(false);
    }
  }, [guideInfo?.id, activeDraft?.linkedChapterId]);

  // 防抖请求预览
  useEffect(() => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    // 500ms 防抖
    debounceTimerRef.current = window.setTimeout(() => {
      if (bbcode || title) {
        fetchPreview(bbcode, title);
      }
    }, 500);

    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [bbcode, title, fetchPreview]);

  return (
    <div
      style={{
        borderRadius: "var(--radius-lg, 1.05rem)",
        background: "var(--bg-surface, rgba(13, 23, 36, 0.9))",
        border: "1px solid var(--border-accent, rgba(102, 192, 244, 0.25))",
        padding: "1.1rem",
        boxShadow: "var(--shadow-panel, 0 24px 40px rgba(10, 18, 30, 0.45))",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}
    >
      {/* 预览内容区域 */}
      <div
        style={{
          flex: 1,
          overflow: "auto"
        }}
      >
        {error ? (
          <div
            style={{
              color: "#ff6b6b",
              fontSize: "0.85rem",
              textAlign: "center",
              padding: "2rem"
            }}
          >
            {error}
          </div>
        ) : !activeDraft?.linkedChapterId ? (
          <div
            style={{
              color: "rgba(205, 226, 255, 0.5)",
              fontSize: "0.85rem",
              textAlign: "center",
              padding: "2rem"
            }}
          >
            请先关联章节以启用预览
          </div>
        ) : previewHtml ? (
          <>
            {/* Steam BBCode 样式 */}
            <style>{STEAM_BBCODE_CSS}</style>
            <div
              className="steam-preview-content"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </>
        ) : (
          <div
            style={{
              color: "rgba(205, 226, 255, 0.4)",
              fontSize: "0.85rem",
              textAlign: "center",
              padding: "2rem"
            }}
          >
            {isLoading ? "正在获取预览..." : "编辑内容后将显示预览"}
          </div>
        )}
      </div>
    </div>
  );
};
