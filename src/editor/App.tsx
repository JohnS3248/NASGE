import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import type { Editor } from "@tiptap/core";
import TipTapEditor from "./components/TipTapEditor";
import EditorToolbar from "./components/EditorToolbar";
import { bbcodeToHtml, htmlToBBCode } from "./utils/bbcode";
import { useGuideStore } from "./stores/useGuideStore";
import { JSONContent } from "@tiptap/core";
import { createEditorExtensions, createEmptyDoc } from "./utils/editorExtensions";
import { generateHTML, generateJSON } from "@tiptap/html";
import UploadStatusHUD from "./components/UploadStatusHUD";
import { useEditorMode } from "./hooks/useEditorMode";
import { useChapterSync } from "./hooks/useChapterSync";
import EditorHeader from "./components/EditorHeader";
import ChapterNav from "./components/ChapterNav";
import DraftPanel from "./components/DraftPanel";
import TitleEditor from "./components/TitleEditor";
import { extractTitleText, createEmptyTitle } from "./utils/titleHelpers";
import { loggers } from "../shared/logger";
import { ImageFloatingPanel } from "./components/ImageFloatingPanel";
import { useEditorConfigStore } from "./stores/useEditorConfigStore";
import { PreviewPanel } from "./components/PreviewPanel";

const App: React.FC = () => {
  // 初始化编辑器模式和指南信息
  const { refreshGuideInfo, isRefreshing: isRefreshingGuide } = useEditorMode();
  const editorAlignment = useEditorConfigStore((s) => s.editorAlignment);
  const showPreview = useEditorConfigStore((s) => s.showPreview);
  const setShowPreview = useEditorConfigStore((s) => s.setShowPreview);
  const { pushDraft } = useChapterSync();
  const [externalDoc, setExternalDoc] = useState<JSONContent>(() => createEmptyDoc());
  const [currentHtml, setCurrentHtml] = useState<string>("");
  const lastAppliedSerializedRef = useRef<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadPreviewing, setIsUploadPreviewing] = useState(false);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);

  const { drafts, activeDraftId, updateDraft } = useGuideStore();

  const activeDraft = useMemo(() => drafts.find((draft) => draft.id === activeDraftId) ?? drafts[0], [drafts, activeDraftId]);
  const htmlExtensions = useMemo(() => createEditorExtensions(), []);

  // 草稿是否为空
  const isDraftEmpty = useMemo(() => {
    if (!activeDraft) return true;
    return JSON.stringify(activeDraft.content) === JSON.stringify(createEmptyDoc());
  }, [activeDraft]);

  // 为预览面板准备的 BBCode（按需计算：预览开启或上传确认模式时）
  const currentBBCode = useMemo(() => {
    if ((!showPreview && !isUploadPreviewing) || !currentHtml) return "";
    return htmlToBBCode(currentHtml);
  }, [showPreview, isUploadPreviewing, currentHtml]);

  // 为预览面板准备的标题文本
  const currentTitleText = useMemo(() => {
    if (!showPreview || !activeDraft?.title) return "";
    return extractTitleText(activeDraft.title);
  }, [showPreview, activeDraft?.title]);

  const docToHtml = useCallback(
    (doc: JSONContent) => generateHTML(doc, htmlExtensions),
    [htmlExtensions]
  );

  useEffect(() => {
    const nextDoc = activeDraft?.content ?? createEmptyDoc();
    const nextSerialized = JSON.stringify(nextDoc);

    if (lastAppliedSerializedRef.current === nextSerialized) {
      return;
    }

    lastAppliedSerializedRef.current = nextSerialized;
    setExternalDoc(nextDoc);
    setCurrentHtml(docToHtml(nextDoc));
  }, [activeDraft?.content, activeDraft?.id, docToHtml]);

  const handleExportBBCode = useCallback(() => {
    if (!currentHtml) {
      window.alert("当前章节为空，没有可导出的 BBCode。");
      return;
    }
    const bbcode = htmlToBBCode(currentHtml);
    try {
      void navigator.clipboard?.writeText(bbcode);
      window.alert("BBCode 已复制到剪贴板。");
    } catch {
      window.prompt("复制以下 BBCode", bbcode);
    }
  }, [currentHtml]);

  const handleImportBBCode = useCallback(() => {
    const input = window.prompt("粘贴要导入的 BBCode", "");
    if (input === null) return;
    const html = bbcodeToHtml(input);
    let doc: JSONContent;
    try {
      doc = generateJSON(html, htmlExtensions);
    } catch (error) {
      loggers.editor.error("导入 BBCode 失败", error);
      window.alert("BBCode 内容无法识别，请检查格式后再试。");
      return;
    }
    setExternalDoc(doc);
    setCurrentHtml(docToHtml(doc));
    lastAppliedSerializedRef.current = JSON.stringify(doc);
    if (activeDraft) {
      updateDraft(activeDraft.id, { content: doc });
    }
  }, [activeDraft, updateDraft, htmlExtensions, docToHtml]);

  // 上传按钮点击：两阶段流程
  const handleUploadClick = useCallback(() => {
    if (!activeDraft || !activeDraft.linkedChapterId) return;

    if (!isUploadPreviewing) {
      // 第一阶段：打开预览，进入确认模式
      setShowPreview(true);
      setIsUploadPreviewing(true);
      return;
    }

    // 第二阶段：确认上传
    handleConfirmUpload();
  }, [activeDraft, isUploadPreviewing]);

  const handleConfirmUpload = useCallback(async () => {
    if (!activeDraft) return;

    setIsUploading(true);
    try {
      await pushDraft(activeDraft.id);
      window.alert("上传成功！");
      setIsUploadPreviewing(false);
    } catch (error) {
      loggers.sync.error("上传失败", error);
      const message = error instanceof Error ? error.message : "上传失败，未知错误";
      window.alert(`上传失败：${message}`);
    } finally {
      setIsUploading(false);
    }
  }, [activeDraft, pushDraft]);

  // 切换草稿时重置上传确认状态
  useEffect(() => {
    setIsUploadPreviewing(false);
  }, [activeDraftId]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at 20% 0%, rgba(102, 192, 244, 0.2), transparent 55%), var(--bg-app, linear-gradient(180deg, #101a2b 0%, #0b1522 100%))",
        padding: "1.5rem",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem"
      }}
    >
      {/* 顶部信息区 */}
      <EditorHeader />

      {/* 草稿管理（可折叠） */}
      <DraftPanel />

      {/* 主内容区 */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          flex: 1,
          width: "fit-content",
          margin: "0 auto"
        }}
      >
        {/* 按钮行 - 独立于编辑区 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.6rem"
          }}
        >
          <button
            type="button"
            onClick={() => {
              window.alert('导出草稿功能待实现');
            }}
            style={{
              padding: "0.45rem 1rem",
              borderRadius: "var(--radius-sm, 0.6rem)",
              border: "1px solid rgba(102, 192, 244, 0.5)",
              background: "rgba(102, 192, 244, 0.15)",
              color: "var(--color-primary, #66c0f4)",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: "0.85rem",
              transition: "all 0.15s ease"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(102, 192, 244, 0.25)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(102, 192, 244, 0.15)";
            }}
          >
            导出草稿
          </button>

          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button
              type="button"
              onClick={handleImportBBCode}
              style={{
                padding: "0.45rem 1rem",
                borderRadius: "var(--radius-sm, 0.6rem)",
                border: "1px solid rgba(102, 192, 244, 0.35)",
                background: "rgba(12, 21, 33, 0.85)",
                color: "#cfe7ff",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "0.85rem"
              }}
            >
              导入 BBCode
            </button>
            <button
              type="button"
              onClick={handleExportBBCode}
              style={{
                padding: "0.45rem 1rem",
                borderRadius: "var(--radius-sm, 0.6rem)",
                border: "1px solid rgba(102, 192, 244, 0.35)",
                background: "rgba(12, 21, 33, 0.85)",
                color: "#cfe7ff",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "0.85rem"
              }}
            >
              导出 BBCode
            </button>
            {activeDraft?.linkedChapterId && (
              <>
                {isUploadPreviewing && (
                  <button
                    type="button"
                    onClick={() => setIsUploadPreviewing(false)}
                    style={{
                      padding: "0.45rem 0.8rem",
                      borderRadius: "var(--radius-sm, 0.6rem)",
                      border: "1px solid rgba(255, 128, 128, 0.4)",
                      background: "transparent",
                      color: "#ff8080",
                      fontWeight: 500,
                      cursor: "pointer",
                      fontSize: "0.8rem"
                    }}
                  >
                    取消上传
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleUploadClick}
                  disabled={isUploading || isDraftEmpty}
                  title={isDraftEmpty ? "草稿内容为空，无法上传" : undefined}
                  style={{
                    padding: "0.45rem 1rem",
                    borderRadius: "var(--radius-sm, 0.6rem)",
                    border: isUploadPreviewing ? "2px solid rgba(255, 180, 50, 0.7)" : "none",
                    background: (isUploading || isDraftEmpty)
                      ? "rgba(102, 192, 244, 0.3)"
                      : isUploadPreviewing
                        ? "linear-gradient(135deg, rgba(255, 180, 50, 0.9), rgba(230, 140, 20, 0.9))"
                        : "linear-gradient(135deg, rgba(102, 192, 244, 0.95), rgba(66, 139, 202, 0.95))",
                    color: isUploadPreviewing ? "#1a1000" : "#06101e",
                    fontWeight: 600,
                    cursor: (isUploading || isDraftEmpty) ? "not-allowed" : "pointer",
                    fontSize: "0.85rem",
                    opacity: (isUploading || isDraftEmpty) ? 0.5 : 1
                  }}
                >
                  {isUploading ? "上传中..." : isUploadPreviewing ? "确认上传" : "上传到 Steam"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* 标题编辑器 - 独立于编辑区 */}
        <TitleEditor
          value={activeDraft?.title || createEmptyTitle()}
          onChange={(newTitle) => {
            if (activeDraft) {
              updateDraft(activeDraft.id, { title: newTitle });
            }
          }}
        />

        {/* 编辑器 + 预览 */}
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            gap: "1rem",
            flex: 1
          }}
        >
          {/* 编辑器区域 */}
          <main
            style={{
              borderRadius: "var(--radius-lg, 1.05rem)",
              background: "var(--bg-surface, #0d1724)",
              border: "1px solid var(--border-accent, rgba(102, 192, 244, 0.25))",
              padding: "1.1rem",
              boxShadow: "var(--shadow-panel, 0 24px 40px rgba(10, 18, 30, 0.45))",
              display: "flex",
              flexDirection: "column",
              minWidth: "638px"
            }}
          >
              {!activeDraft ? (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "1.5rem",
                    padding: "4rem 2rem",
                    background: "rgba(8, 14, 23, 0.6)",
                    borderRadius: "var(--radius-lg, 1.2rem)",
                    border: "2px dashed rgba(102, 192, 244, 0.3)"
                  }}
                >
                  <div style={{ fontSize: "3rem", opacity: 0.4 }}>
                    📝
                  </div>
                  <div
                    style={{
                      color: "var(--text-secondary, #8aa4c7)",
                      fontSize: "1.1rem",
                      textAlign: "center",
                      lineHeight: 1.6
                    }}
                  >
                    <div style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text-primary, #d7e8ff)" }}>
                      暂无草稿
                    </div>
                    <div style={{ fontSize: "0.95rem" }}>
                      请先创建一个新草稿，或从章节导航中拉取现有章节
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const store = useGuideStore.getState();
                      store.addDraft();
                    }}
                    style={{
                      padding: "0.8rem 2rem",
                      borderRadius: "0.8rem",
                      border: "none",
                      background: "linear-gradient(135deg, rgba(102, 192, 244, 0.95), rgba(66, 139, 202, 0.95))",
                      color: "#06101e",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontSize: "1rem",
                      boxShadow: "0 4px 12px rgba(102, 192, 244, 0.3)"
                    }}
                  >
                    + 创建新草稿
                  </button>
                </div>
              ) : (
                <TipTapEditor
                  externalDoc={externalDoc}
                  onEditorReady={setEditorInstance}
                  onUpdate={({ html, json }) => {
                    setCurrentHtml(html);
                    if (activeDraft) {
                      const nextSerialized = JSON.stringify(json);
                      lastAppliedSerializedRef.current = nextSerialized;
                      const currentSerialized = JSON.stringify(activeDraft.content);
                      if (nextSerialized !== currentSerialized) {
                        updateDraft(activeDraft.id, { content: json });
                      }
                    }
                  }}
                />
              )}
            </main>

          {/* 实时预览面板 */}
          {(showPreview || isUploadPreviewing) && (
            <PreviewPanel
              bbcode={currentBBCode}
              title={currentTitleText}
            />
          )}
        </div>
      </div>

      <UploadStatusHUD />

      {/* 章节导航 - 固定在右侧边缘 */}
      <div
        style={{
          position: "fixed",
          right: "1rem",
          top: "14rem",
          bottom: "1rem",
          zIndex: 100,
          overflowY: "auto",
          pointerEvents: "auto"
        }}
      >
        <ChapterNav
          onRefresh={refreshGuideInfo}
          isRefreshing={isRefreshingGuide}
        />
      </div>

      {/* 悬浮工具栏 */}
      {activeDraft && <EditorToolbar editor={editorInstance} />}

      {/* 图片悬浮窗 */}
      <ImageFloatingPanel />
    </div>
  );
};

export default App;
