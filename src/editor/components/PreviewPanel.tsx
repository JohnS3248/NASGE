import React, { useState, useEffect, useRef, useCallback } from "react";
import { previewChapterFromSteam } from "../services/chapterSync";
import { useGuideStore } from "../stores/useGuideStore";
import { useDraftStore } from "../stores/useDraftStore";
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
  overflow: hidden;
  word-wrap: break-word;
  word-break: normal;
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
  color: #ebebeb;
  text-decoration: none;
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
  color: #969696;
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

.steam-preview-content .bb_blockquote_author,
.steam-preview-content .bb_quoteauthor {
  font-size: 12px;
  color: #898989;
  font-style: italic;
  margin-bottom: 0.5rem;
}

.steam-preview-content .bb_quoteauthor b,
.steam-preview-content .bb_blockquote_author b {
  font-weight: bold;
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
.steam-preview-content ul {
  margin: 14px 0 8px 14px;
  padding-left: 0;
  font-size: 14px;
  line-height: 19px;
}

.steam-preview-content ol {
  margin: 14px 0 8px 0;
  padding-left: 40px;
  font-size: 14px;
  line-height: 19px;
}

.steam-preview-content li {
  line-height: 19px;
  padding-right: 14px;
  margin-bottom: 0;
}

/* ===== 表格样式 ===== */
.steam-preview-content .bb_table,
.steam-preview-content table {
  display: table !important;
  font-size: 12px;
  margin: 0;
  border-collapse: collapse;
}

.steam-preview-content .bb_table th,
.steam-preview-content table th {
  display: table-cell !important;
  font-weight: bold;
  border: 1px solid #4d4d4d;
  padding: 4px;
  background: transparent;
  min-width: 1.5em;
}

.steam-preview-content .bb_table tr,
.steam-preview-content table tr {
  display: table-row !important;
}

.steam-preview-content .bb_table td,
.steam-preview-content table td {
  display: table-cell !important;
  vertical-align: middle;
  border: 1px solid #4d4d4d;
  padding: 4px;
  background: transparent;
  min-width: 1.5em;
}

/* Steam 可能使用 div + class 代替原生 table 元素 */
.steam-preview-content .bb_table_tr {
  display: table-row !important;
}

.steam-preview-content .bb_table_th {
  display: table-cell !important;
  font-weight: bold;
  border: 1px solid #4d4d4d;
  padding: 4px;
  min-width: 1.5em;
}

.steam-preview-content .bb_table_td {
  display: table-cell !important;
  vertical-align: middle;
  border: 1px solid #4d4d4d;
  padding: 4px;
  min-width: 1.5em;
}

/* ===== 图片样式 (Steam sharedFilePreviewImage) ===== */
/* 基础：所有预览图片 */
.steam-preview-content img.sharedFilePreviewImage {
  max-width: 100%;
  vertical-align: baseline;
  object-fit: fill;
  border: none;
  padding: 0;
  cursor: pointer;
}

/* 浮动 - 左 */
.steam-preview-content img.sharedFilePreviewImage.floatLeft {
  display: block;
  float: left;
  margin: 4px 6px 4px 0px;
}

/* 浮动 - 右 */
.steam-preview-content img.sharedFilePreviewImage.floatRight {
  display: block;
  float: right;
  margin: 4px 0px 4px 6px;
}

/* 内联 */
.steam-preview-content img.sharedFilePreviewImage.inline {
  display: inline;
  float: none;
  margin: 0;
}

/* 尺寸 - 缩略图 (max-width: 311px，小图不放大) */
.steam-preview-content img.sharedFilePreviewImage.sizeThumb {
  max-width: 311px;
}

/* 尺寸 - 全宽 (拉伸至容器宽度，小图也放大) */
.steam-preview-content img.sharedFilePreviewImage.sizeFull {
  width: 100%;
  max-width: 100%;
}

/* 尺寸 - 原始 */
.steam-preview-content img.sharedFilePreviewImage.sizeOriginal {
  max-width: 100%;
}

/* 父链接 - 不干扰图片布局 */
.steam-preview-content a.modalContentLink {
  display: inline;
  float: none;
  margin: 0;
  padding: 0;
  text-decoration: none;
}

/* 非 sharedFilePreviewImage 的普通图片 */
.steam-preview-content img:not(.sharedFilePreviewImage) {
  max-width: 100%;
  height: auto;
}

.steam-preview-content .bb_link_img {
  display: inline-block;
}

/* ===== 水平线样式 ===== */
.steam-preview-content hr {
  border: 1px inset rgb(128, 128, 128);
  margin: 7px 0;
}

/* ===== 章节标题 ===== */
.steam-preview-content .subSectionTitle {
  font-size: 18px;
  font-weight: 400;
  line-height: normal;
  color: #66c0f4;
  padding: 10px 0 0 0;
  margin: 0 0 10px 0;
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
  const activeDraft = useDraftStore((s) => {
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
    <div className="rounded-lg bg-bg-surface border border-border-accent p-[1.1rem] shadow-panel flex flex-col overflow-hidden min-w-[638px]">
      {/* 预览内容区域 */}
      <div className="flex-1 overflow-auto">
        {error ? (
          <div className="text-danger text-[0.85rem] text-center p-8">
            {error}
          </div>
        ) : !activeDraft?.linkedChapterId ? (
          <div className="text-text-muted text-[0.85rem] text-center p-8">
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
          <div className="text-text-muted text-[0.85rem] text-center p-8">
            {isLoading ? "正在获取预览..." : "编辑内容后将显示预览"}
          </div>
        )}
      </div>
    </div>
  );
};
