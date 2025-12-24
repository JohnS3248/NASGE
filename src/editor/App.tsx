import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import TipTapEditor from "./components/TipTapEditor";
import { bbcodeToHtml, htmlToBBCode } from "./utils/bbcode";
import { useGuideStore } from "./stores/useGuideStore";
import { JSONContent } from "@tiptap/core";
import { EMPTY_DOC, createEditorExtensions, createEmptyDoc } from "./utils/editorExtensions";
import { generateHTML, generateJSON } from "@tiptap/html";
import UploadStatusHUD from "./components/UploadStatusHUD";
import SteamImagePool from "./components/SteamImagePool";
import { deleteSteamImage } from "./services/steamBridge";
import { useSteamGuideImageStore } from "./stores/useSteamGuideImageStore";
import { useEditorMode } from "./hooks/useEditorMode";
import { useChapterSync } from "./hooks/useChapterSync";
import EditorHeader from "./components/EditorHeader";
import ChapterNav from "./components/ChapterNav";
import DraftPanel from "./components/DraftPanel";
import TitleEditor from "./components/TitleEditor";
import { extractTitleText, createTitleFromText, createEmptyTitle } from "./utils/titleHelpers";
import { loggers } from "../shared/logger";
import { ImageFloatingPanel } from "./components/ImageFloatingPanel";

const App: React.FC = () => {
  // 初始化编辑器模式和指南信息
  const { refreshGuideInfo, isRefreshing: isRefreshingGuide } = useEditorMode();
  const { pushDraft } = useChapterSync();
  const [externalDoc, setExternalDoc] = useState<JSONContent>(() => createEmptyDoc());
  const [currentHtml, setCurrentHtml] = useState<string>("");
  const lastAppliedSerializedRef = useRef<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { drafts, activeDraftId, updateDraft } = useGuideStore();

  const activeDraft = useMemo(() => drafts.find((draft) => draft.id === activeDraftId) ?? drafts[0], [drafts, activeDraftId]);
  const htmlExtensions = useMemo(() => createEditorExtensions(), []);

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

  const handleUploadToSteam = useCallback(async () => {
    if (!activeDraft) {
      window.alert("没有可上传的草稿");
      return;
    }

    if (!activeDraft.linkedChapterId) {
      window.alert("该草稿未关联章节，无法上传。请先拉取章节内容。");
      return;
    }

    if (!window.confirm(`确定要将草稿"${activeDraft.draftName}"上传到 Steam 吗？`)) {
      return;
    }

    setIsUploading(true);
    try {
      await pushDraft(activeDraft.id);
      window.alert("上传成功！");
    } catch (error) {
      loggers.sync.error("上传失败", error);
      const message = error instanceof Error ? error.message : "上传失败，未知错误";
      window.alert(`上传失败：${message}`);
    } finally {
      setIsUploading(false);
    }
  }, [activeDraft, pushDraft]);

  const handleDeleteUploadedRecord = useCallback(async (previewId: string) => {
    loggers.image.info("请求删除 Steam 预览记录", previewId);

    if (!window.confirm("确定要删除这张图片吗？删除后无法恢复。")) {
      return;
    }

    try {
      await deleteSteamImage(previewId, "chapter-preview");

      const steamImageStore = useSteamGuideImageStore.getState();
      steamImageStore.removeItem(previewId);

      window.alert("图片已成功删除。");
    } catch (error) {
      loggers.image.error("删除图片失败", error);
      const message = error instanceof Error ? error.message : "删除失败，未知错误";
      window.alert(`删除图片失败：${message}`);
    }
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at 20% 0%, rgba(102, 192, 244, 0.2), transparent 55%), linear-gradient(180deg, #101a2b 0%, #0b1522 100%)",
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

      {/* 主内容区：中间编辑器 + 右侧章节 */}
      <div
        style={{
          display: "flex",
          gap: "1.5rem",
          alignItems: "start",
          flex: 1
        }}
      >
        {/* 中间编辑器区域 */}
        <main
          style={{
            flex: 1,
            borderRadius: "1.05rem",
            background: "rgba(13, 23, 36, 0.9)",
            border: "1px solid rgba(102, 192, 244, 0.25)",
            padding: "1.6rem",
            boxShadow: "0 24px 40px rgba(10, 18, 30, 0.45)",
            display: "flex",
            flexDirection: "column",
            gap: "1rem"
          }}
        >
          {/* 工具栏按钮 */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.6rem"
            }}
          >
            {/* 左侧：导出草稿按钮 */}
            <button
              type="button"
              onClick={() => {
                // TODO: 实现导出草稿功能
                window.alert('导出草稿功能待实现');
              }}
              style={{
                padding: "0.45rem 1rem",
                borderRadius: "0.6rem",
                border: "1px solid rgba(102, 192, 244, 0.5)",
                background: "rgba(102, 192, 244, 0.15)",
                color: "#66c0f4",
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

            {/* 右侧：其他按钮组 */}
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <button
                type="button"
                onClick={handleImportBBCode}
                style={{
                  padding: "0.45rem 1rem",
                  borderRadius: "0.6rem",
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
                  borderRadius: "0.6rem",
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
                <button
                  type="button"
                  onClick={handleUploadToSteam}
                  disabled={isUploading}
                  style={{
                    padding: "0.45rem 1rem",
                    borderRadius: "0.6rem",
                    border: "none",
                    background: isUploading
                      ? "rgba(102, 192, 244, 0.5)"
                      : "linear-gradient(135deg, rgba(102, 192, 244, 0.95), rgba(66, 139, 202, 0.95))",
                    color: "#06101e",
                    fontWeight: 600,
                    cursor: isUploading ? "wait" : "pointer",
                    fontSize: "0.85rem",
                    opacity: isUploading ? 0.7 : 1
                  }}
                >
                  {isUploading ? "上传中..." : "上传到 Steam"}
                </button>
              )}
            </div>
          </div>

          {/* 标题编辑器 */}
          <TitleEditor
            value={activeDraft?.title || createEmptyTitle()}
            onChange={(newTitle) => {
              if (activeDraft) {
                updateDraft(activeDraft.id, { title: newTitle });
              }
            }}
          />

          {/* 编辑器 */}
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
                borderRadius: "1.2rem",
                border: "2px dashed rgba(102, 192, 244, 0.3)"
              }}
            >
              <div
                style={{
                  fontSize: "3rem",
                  opacity: 0.4
                }}
              >
                📝
              </div>
              <div
                style={{
                  color: "#8aa4c7",
                  fontSize: "1.1rem",
                  textAlign: "center",
                  lineHeight: 1.6
                }}
              >
                <div style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "0.5rem", color: "#d7e8ff" }}>
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

          {/* 图片池 */}
          <SteamImagePool onDelete={handleDeleteUploadedRecord} />
        </main>

        {/* 右侧章节导航 */}
        <ChapterNav
          onRefresh={refreshGuideInfo}
          isRefreshing={isRefreshingGuide}
        />
      </div>

      <UploadStatusHUD />

      {/* 图片悬浮窗 */}
      <ImageFloatingPanel />
    </div>
  );
};

export default App;
