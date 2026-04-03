import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import type { Editor } from "@tiptap/core";
import TipTapEditor from "./components/TipTapEditor";
import EditorToolbar from "./components/EditorToolbar";
import { bbcodeToHtml, htmlToBBCode } from "./utils/bbcode";
import { useGuideStore, isReviewMode as checkReviewMode, isOnlineMode } from "./stores/useGuideStore";
import { useDraftStore } from "./stores/useDraftStore";
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
import ToastContainer from "./components/ToastContainer";
import DialogContainer from "./components/ConfirmDialog";
import { toast } from "./stores/useToastStore";
import { dialog } from "./stores/useDialogStore";
import ReviewSettingsPanel from "./components/ReviewSettingsPanel";

const MODE_LABELS: Record<string, string> = {
  'guide': '指南模式',
  'review': '评测模式',
  'offline-guide': '离线指南',
  'offline-review': '离线评测',
};

const App: React.FC = () => {
  // 初始化编辑器模式和指南信息
  const { refreshGuideInfo, isRefreshing: isRefreshingGuide } = useEditorMode();
  const mode = useGuideStore((s) => s.mode);
  const guideTitle = useGuideStore((s) => s.guideInfo?.title);
  const reviewMode = checkReviewMode(mode);
  const showPreview = useEditorConfigStore((s) => s.showPreview);
  const { pushDraft } = useChapterSync();
  const [externalDoc, setExternalDoc] = useState<JSONContent>(() => createEmptyDoc());
  const [currentHtml, setCurrentHtml] = useState<string>("");
  const lastAppliedSerializedRef = useRef<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadPreviewing, setIsUploadPreviewing] = useState(false);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);

  const { drafts, activeDraftId, updateDraft } = useDraftStore();

  // M6: 草稿切换 fade 过渡
  const [editorFading, setEditorFading] = useState(false);
  const prevDraftIdRef = useRef(activeDraftId);
  useEffect(() => {
    if (prevDraftIdRef.current !== activeDraftId && prevDraftIdRef.current !== undefined) {
      setEditorFading(true);
      const raf = requestAnimationFrame(() => setEditorFading(false));
      return () => cancelAnimationFrame(raf);
    }
    prevDraftIdRef.current = activeDraftId;
  }, [activeDraftId]);

  const activeDraft = useMemo(() => drafts.find((draft) => draft.id === activeDraftId), [drafts, activeDraftId]);
  const htmlExtensions = useMemo(() => createEditorExtensions({ reviewMode }), [reviewMode]);

  // 动态更新标签页标题
  useEffect(() => {
    const modeLabel = MODE_LABELS[mode] || mode;
    // review 模式从 useReviewStore 取游戏名
    if (reviewMode) {
      import('./stores/useReviewStore').then(({ useReviewStore }) => {
        const gameName = useReviewStore.getState().gameName;
        document.title = gameName ? `NASGE · ${modeLabel} · ${gameName}` : `NASGE · ${modeLabel}`;
      });
    } else {
      document.title = guideTitle ? `NASGE · ${modeLabel} · ${guideTitle}` : `NASGE · ${modeLabel}`;
    }
  }, [mode, guideTitle, reviewMode]);

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

  const handleExportBBCode = useCallback(async () => {
    if (!currentHtml) {
      toast.error("当前章节为空，没有可导出的 BBCode。");
      return;
    }
    const bbcode = htmlToBBCode(currentHtml);
    try {
      void navigator.clipboard?.writeText(bbcode);
      toast.success("BBCode 已复制到剪贴板。");
    } catch {
      await dialog.prompt({ message: "复制以下 BBCode", defaultValue: bbcode });
    }
  }, [currentHtml]);

  const handleImportBBCode = useCallback(async () => {
    const input = await dialog.prompt({ message: "粘贴要导入的 BBCode", defaultValue: "" });
    if (input === null) return;
    const html = bbcodeToHtml(input);
    let doc: JSONContent;
    try {
      doc = generateJSON(html, htmlExtensions);
    } catch (error) {
      loggers.editor.error("导入 BBCode 失败", error);
      toast.error("BBCode 内容无法识别，请检查格式后再试。");
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
      // 第一阶段：进入确认模式（isUploadPreviewing 会触发预览面板显示）
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
      toast.success("上传成功！");
      setIsUploadPreviewing(false);
    } catch (error) {
      loggers.sync.error("上传失败", error);
      const message = error instanceof Error ? error.message : "上传失败，未知错误";
      toast.error(`上传失败：${message}`);
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
        background: "var(--bg-app, #0e141b)",
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
        <div className="flex justify-end items-center gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleImportBBCode}
              className="px-3 py-1.5 rounded-sm text-sm font-semibold nasge-transition-quick cursor-pointer bg-bg-overlay text-text-secondary border border-border-default hover:bg-bg-hover hover:text-text-primary"
            >
              导入 BBCode
            </button>
            <button
              type="button"
              onClick={handleExportBBCode}
              className="px-3 py-1.5 rounded-sm text-sm font-semibold nasge-transition-quick cursor-pointer bg-bg-overlay text-text-secondary border border-border-default hover:bg-bg-hover hover:text-text-primary"
            >
              导出 BBCode
            </button>
            {!reviewMode && activeDraft?.linkedChapterId && (
              <>
                {isUploadPreviewing && (
                  <button
                    type="button"
                    onClick={() => setIsUploadPreviewing(false)}
                    className="px-3 py-1.5 rounded-sm text-sm font-semibold nasge-transition-quick cursor-pointer text-danger border border-danger/40 bg-transparent hover:bg-danger/10"
                  >
                    取消上传
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleUploadClick}
                  disabled={isUploading || isDraftEmpty}
                  title={isDraftEmpty ? "草稿内容为空，无法上传" : undefined}
                  className={`px-3 py-1.5 rounded-sm text-sm font-semibold nasge-transition-quick
                    ${(isUploading || isDraftEmpty)
                      ? "opacity-50 cursor-not-allowed"
                      : "cursor-pointer"}
                    ${isUploadPreviewing
                      ? "bg-warning text-bg-app border-2 border-warning/70"
                      : "bg-accent text-bg-app hover:bg-accent-hover border-0"}`}
                >
                  {isUploading ? "上传中..." : isUploadPreviewing ? "确认上传" : "上传到 Steam"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* 标题编辑器 - 仅指南模式 */}
        {!reviewMode && (
          <TitleEditor
            value={activeDraft?.title || createEmptyTitle()}
            onChange={(newTitle) => {
              if (activeDraft) {
                updateDraft(activeDraft.id, { title: newTitle });
              }
            }}
          />
        )}

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
            className={`transition-opacity duration-fast ${editorFading ? "opacity-0" : "opacity-100"}`}
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
                  <svg style={{ width: "3rem", height: "3rem", opacity: 0.4 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
                  </svg>
                  <div
                    style={{
                      color: "var(--text-secondary, #8aa4c7)",
                      fontSize: "1.1rem",
                      textAlign: "center",
                      lineHeight: 1.6
                    }}
                  >
                    <div style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text-primary, #d7e8ff)" }}>
                      {reviewMode ? '还没有评测草稿' : '暂无草稿'}
                    </div>
                    <div style={{ fontSize: "0.95rem" }}>
                      {reviewMode
                        ? '在 Steam 游戏页面点击「编辑此评测」开始，或创建一个新草稿'
                        : '请先创建一个新草稿，或从章节导航中拉取现有章节'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const guideState = useGuideStore.getState();
                      const draftStore = useDraftStore.getState();
                      const defaultName = `未命名草稿 ${draftStore.nextDraftNumber}`;
                      const name = await dialog.prompt({ message: '新建草稿', defaultValue: defaultName });
                      if (name === null) return;
                      const finalName = name.trim() || defaultName;

                      const isReview = checkReviewMode(guideState.mode);
                      if (isReview) {
                        import('./stores/useReviewStore').then(({ useReviewStore }) => {
                          const reviewState = useReviewStore.getState();
                          draftStore.addDraft({
                            draftName: finalName,
                            draftType: 'review',
                            linkedAppId: reviewState.appId ?? undefined,
                            linkedAppName: reviewState.gameName || undefined,
                          });
                        });
                      } else {
                        draftStore.addDraft({
                          draftName: finalName,
                          draftType: 'guide',
                          linkedGuideId: guideState.currentArchiveId ?? undefined,
                        });
                      }
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
      <ToastContainer />
      <DialogContainer />

      {/* 章节导航 - 仅指南模式 */}
      {!reviewMode && (
        <ChapterNav
          onRefresh={refreshGuideInfo}
          isRefreshing={isRefreshingGuide}
        />
      )}

      {/* 评测设置面板 - 仅评测模式，固定在右侧 */}
      {reviewMode && (
        <div
          style={{
            position: "fixed",
            right: "1rem",
            top: "14rem",
            zIndex: 100,
            pointerEvents: "auto"
          }}
        >
          <ReviewSettingsPanel currentHtml={currentHtml} />
        </div>
      )}

      {/* 悬浮工具栏 */}
      {activeDraft && <EditorToolbar editor={editorInstance} />}

      {/* 图片悬浮窗 - 仅在线指南模式（离线模式无图片池管线） */}
      {mode === 'guide' && <ImageFloatingPanel />}
    </div>
  );
};

export default App;
