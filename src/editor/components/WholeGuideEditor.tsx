/**
 * WholeGuideEditor — 全篇模式编辑器主组件
 *
 * 单 ProseMirror 实例承载整篇指南，章节边界由 chapterTitle 节点定义。
 * 包含：拉取 / 编辑 / 直传 push。
 * 待实现：审阅页 / TOC / 字符计数 / 框 UI 隐显 / 自动备份 / 手动 archive。
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { EditorContent, useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";

import { createEditorExtensions } from "../utils/editorExtensions";
import { useWholeGuideStore } from "../stores/useWholeGuideStore";
import { useWholeGuideSync, type PullProgress, type PushProgress } from "../hooks/useWholeGuideSync";
import { useWholeGuideSessionLock } from "../hooks/useWholeGuideSessionLock";
import { useWholeGuideAutoBackup } from "../hooks/useWholeGuideAutoBackup";
import { toast } from "../stores/useToastStore";
import { loggers } from "../../shared/logger";
import WholeGuideHeader from "./WholeGuideHeader";
import WholeGuideContextMenu, {
  type WholeGuideContextMenuState,
  type WholeGuideContextMode,
  INITIAL_CONTEXT_MENU,
} from "./WholeGuideContextMenu";
import WholeGuideTOC from "./WholeGuideTOC";
import {
  ImageFloatingPanel,
  NASGE_IMAGE_MIME_TYPE,
  type ImageDragData,
} from "./ImageFloatingPanel";
import { extractFilesFromPaste, extractFilesFromDrop } from "../utils/imageInput";
import { addFilesToPool } from "../services/imagePoolIntake";
import { useImageStore } from "../stores/useImageStore";
import { useImagePanelStore } from "../stores/useImagePanelStore";
import { useGuideStore } from "../stores/useGuideStore";
import type { ImageSizePreset, ImageAlignment } from "../types/image";

// =============================================================================
// 子组件：拉取进度
// =============================================================================

interface PullProgressViewProps {
  progress: PullProgress | null;
}

const PullProgressView: React.FC<PullProgressViewProps> = ({ progress }) => {
  const { t } = useTranslation("editor");
  const phaseLabel = useMemo(() => {
    if (!progress) return "";
    switch (progress.phase) {
      case "images":
        return t("wholeGuide.pulling.images", { defaultValue: "加载图片资源…" });
      case "list":
        return t("wholeGuide.pulling.list", { defaultValue: "拉取章节列表…" });
      case "chapters":
        return t("wholeGuide.pulling.chapters", {
          loaded: progress.loaded,
          total: progress.total,
          defaultValue: `拉取章节内容（${progress.loaded}/${progress.total}）`,
        });
      case "building":
        return t("wholeGuide.pulling.building", { defaultValue: "组装编辑器…" });
      default:
        return "";
    }
  }, [progress, t]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "4rem 2rem",
        gap: "1rem",
        color: "var(--text-secondary, #8aa4c7)",
      }}
    >
      <div className="nasge-spinner" style={{
        width: 32,
        height: 32,
        border: "3px solid rgba(102, 192, 244, 0.18)",
        borderTopColor: "#66c0f4",
        borderRadius: "50%",
        animation: "nasge-spin 0.9s linear infinite",
      }} />
      <div style={{ fontSize: "0.95rem" }}>{phaseLabel || t("wholeGuide.pulling.list", { defaultValue: "拉取中…" })}</div>
      {progress && progress.total > 0 && progress.phase === "chapters" && (
        <div
          style={{
            width: 240,
            height: 4,
            background: "rgba(102, 192, 244, 0.15)",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.min(100, (progress.loaded / progress.total) * 100)}%`,
              background: "#66c0f4",
              transition: "width 0.2s",
            }}
          />
        </div>
      )}
    </div>
  );
};

// =============================================================================
// 子组件：上传进度
// =============================================================================

interface PushProgressViewProps {
  progress: PushProgress | null;
}

const PushProgressView: React.FC<PushProgressViewProps> = ({ progress }) => {
  const { t } = useTranslation("editor");
  const label = useMemo(() => {
    if (!progress) return t("wholeGuide.pushing.session", { defaultValue: "准备上传…" });
    switch (progress.phase) {
      case "session":
        return t("wholeGuide.pushing.session", { defaultValue: "获取上传会话…" });
      case "slicing":
        return t("wholeGuide.pushing.slicing", { defaultValue: "切分章节…" });
      case "uploading":
        return t("wholeGuide.pushing.uploading", {
          title: progress.current?.title ?? "",
          loaded: progress.loaded,
          total: progress.total,
          defaultValue: `上传章节「${progress.current?.title ?? ""}」（${progress.loaded}/${progress.total}）`,
        });
      case "archive":
        return t("wholeGuide.pushing.archive", { defaultValue: "同步本地存档…" });
      case "snapshot":
        return t("wholeGuide.pushing.snapshot", { defaultValue: "保留远程版本快照…" });
      default:
        return "";
    }
  }, [progress, t]);

  return (
    <div
      style={{
        position: "fixed",
        bottom: "2rem",
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(13, 23, 36, 0.95)",
        border: "1px solid rgba(102, 192, 244, 0.4)",
        borderRadius: "0.75rem",
        padding: "0.85rem 1.25rem",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        boxShadow: "0 12px 24px rgba(8, 14, 23, 0.5)",
        color: "#d7e8ff",
      }}
    >
      <div className="nasge-spinner" style={{
        width: 18,
        height: 18,
        border: "2px solid rgba(102, 192, 244, 0.18)",
        borderTopColor: "#66c0f4",
        borderRadius: "50%",
        animation: "nasge-spin 0.9s linear infinite",
      }} />
      <div style={{ fontSize: "0.9rem" }}>{label}</div>
    </div>
  );
};

// =============================================================================
// 主组件
// =============================================================================

const WholeGuideEditor: React.FC = () => {
  const { t } = useTranslation("editor");
  const { guideId: paramGuideId } = useParams<{ guideId: string }>();
  const navigate = useNavigate();
  const { pullEntireGuide, pushEntireGuide } = useWholeGuideSync();

  const guideId = useWholeGuideStore((s) => s.guideId);
  const guideTitle = useWholeGuideStore((s) => s.guideTitle);
  const doc = useWholeGuideStore((s) => s.doc);
  const status = useWholeGuideStore((s) => s.status);
  const error = useWholeGuideStore((s) => s.error);

  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);
  const [pushProgress, setPushProgress] = useState<PushProgress | null>(null);
  const [contextMenu, setContextMenu] =
    useState<WholeGuideContextMenuState>(INITIAL_CONTEXT_MENU);
  const lastAppliedDocRef = useRef<string | null>(null);

  // ---------------------------------------------------------------------------
  // useEditor — 单 ProseMirror 实例
  // ---------------------------------------------------------------------------

  const extensions = useMemo(() => createEditorExtensions({ wholeMode: true }), []);

  const editor = useEditor({
    extensions,
    content: doc,
    autofocus: false,
    onUpdate: ({ editor: e }) => {
      const json = e.getJSON();
      const serialized = JSON.stringify(json);
      lastAppliedDocRef.current = serialized;
      useWholeGuideStore.getState().setDoc(json as JSONContent);
    },
  });

  // 暴露到 window 供 e2e / debug 控制台测试
  useEffect(() => {
    if (!editor) return;
    (window as unknown as { __wholeGuideEditor?: unknown }).__wholeGuideEditor = editor;
    return () => {
      (window as unknown as { __wholeGuideEditor?: unknown }).__wholeGuideEditor = null;
    };
  }, [editor]);

  // ---------------------------------------------------------------------------
  // 进入页面：若 store 中无 doc 或 guideId 不一致 → 触发 pull
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!paramGuideId) return;
    const needsPull = !doc || guideId !== paramGuideId;
    if (!needsPull) return;
    if (status === "pulling") return;

    pullEntireGuide(paramGuideId, (p) => {
      setPullProgress(p);
    }).catch((err) => {
      loggers.editor.error("WholeGuideEditor pull 失败", err);
    }).finally(() => {
      setPullProgress(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramGuideId]);

  // ---------------------------------------------------------------------------
  // store doc 变化 → 同步到 editor（仅外部更新，避免 onUpdate 回写循环）
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!editor || !doc) return;
    const serialized = JSON.stringify(doc);
    if (serialized === lastAppliedDocRef.current) return;
    lastAppliedDocRef.current = serialized;
    editor.commands.setContent(doc, { emitUpdate: false });
  }, [editor, doc]);

  // ---------------------------------------------------------------------------
  // session tab 锁：同一指南只允许一个 tab 编辑
  // ---------------------------------------------------------------------------

  useWholeGuideSessionLock(paramGuideId, () => {
    // 用户取消抢占 → 切回旧模式（保留 hash 之外的 search params）
    if (paramGuideId) {
      window.location.search = `?mode=guide&guideId=${encodeURIComponent(paramGuideId)}`;
    } else {
      window.location.search = `?mode=guide`;
    }
  });

  // 自动备份：每 60s 节流，FIFO 滚动 3 份
  useWholeGuideAutoBackup();

  // 同步 tab 标题：NASGE · 全篇编辑 · {guideTitle}
  useEffect(() => {
    const modeLabel = t("wholeGuide.modeName");
    document.title = guideTitle
      ? `NASGE · ${modeLabel} · ${guideTitle}`
      : `NASGE · ${modeLabel}`;
  }, [guideTitle, t]);

  // 让图片池系统识别当前 guide 作为 archiveId（用于图片过滤 + 缓存）
  useEffect(() => {
    if (paramGuideId) {
      useGuideStore.setState({ currentArchiveId: paramGuideId });
    }
  }, [paramGuideId]);

  // ---------------------------------------------------------------------------
  // paste / drop / NASGE 内部图片拖入
  // ---------------------------------------------------------------------------

  const {
    defaultInsertSize,
    defaultInsertAlignment,
    afterInsertAction,
    close: closeImagePanel,
    minimize: minimizeImagePanel,
  } = useImagePanelStore();

  const handleNasgeImageDrop = (
    dragData: ImageDragData,
    dropPosition?: number
  ) => {
    if (!editor) return;

    if (dropPosition !== undefined) {
      editor.chain().focus().setTextSelection(dropPosition).run();
    } else {
      editor.commands.focus();
    }

    const sizePresetMap: Record<string, ImageSizePreset> = {
      original: "original",
      medium: "half",
      small: "thumb",
    };
    const sizePreset = sizePresetMap[defaultInsertSize] || "original";

    const alignmentMap: Record<string, ImageAlignment> = {
      floatLeft: "floatLeft",
      floatRight: "floatRight",
      center: "inline",
      inline: "inline",
    };
    const alignment = alignmentMap[defaultInsertAlignment] || "inline";

    const isScreenshot = dragData.type === "steam-screenshot";
    for (const image of dragData.images) {
      let resolvedImageNodeId: string | null = null;
      if (!image.previewId) {
        const entity = useImageStore.getState().addLocalImage({
          fileName: image.fileName,
          originalName: image.fileName,
          fileSize: 0,
          mimeType: "image/unknown",
          source: "drop",
          localPreviewUrl: image.localUrl || image.thumbnailUrl,
          display: { preset: sizePreset, alignment },
        });
        resolvedImageNodeId = entity.id;
      }

      editor.commands.insertSteamImage({
        imageNodeId: resolvedImageNodeId,
        previewId: image.previewId || null,
        fileName: image.fileName,
        previewDataUrl: image.localUrl || image.thumbnailUrl || null,
        sizePreset,
        alignment,
        ...(isScreenshot && image.imageUrl
          ? { source: "screenshot", imageUrl: image.imageUrl }
          : {}),
      });
    }

    if (afterInsertAction === "close") closeImagePanel();
    else if (afterInsertAction === "minimize") minimizeImagePanel();
  };

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;

    const onPaste = (event: ClipboardEvent) => {
      const files = extractFilesFromPaste(event);
      if (!files.length) return;
      event.preventDefault();
      event.stopPropagation();
      void addFilesToPool(files, {
        source: "paste",
        currentArchiveId: paramGuideId ?? null,
        openPanelOnAdd: true,
      });
    };

    const onDrop = (event: DragEvent) => {
      const nasgeData = event.dataTransfer?.getData(NASGE_IMAGE_MIME_TYPE);
      if (nasgeData) {
        event.preventDefault();
        event.stopPropagation();
        try {
          const dragData = JSON.parse(nasgeData) as ImageDragData;
          if (
            (dragData.type === "steam-image" ||
              dragData.type === "steam-screenshot") &&
            dragData.images?.length > 0
          ) {
            const coords = editor.view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });
            handleNasgeImageDrop(dragData, coords?.pos);
            return;
          }
        } catch (err) {
          loggers.editor.warn("解析 NASGE 拖放数据失败", err);
        }
      }

      const files = extractFilesFromDrop(event);
      if (!files.length) return;
      event.preventDefault();
      event.stopPropagation();
      void addFilesToPool(files, {
        source: "drop",
        currentArchiveId: paramGuideId ?? null,
        openPanelOnAdd: true,
      });
    };

    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes(NASGE_IMAGE_MIME_TYPE)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        return;
      }
      const files = extractFilesFromDrop(event);
      if (!files.length) return;
      event.preventDefault();
    };

    dom.addEventListener("paste", onPaste as EventListener);
    dom.addEventListener("drop", onDrop as EventListener);
    dom.addEventListener("dragover", onDragOver as EventListener);

    return () => {
      dom.removeEventListener("paste", onPaste as EventListener);
      dom.removeEventListener("drop", onDrop as EventListener);
      dom.removeEventListener("dragover", onDragOver as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, paramGuideId, defaultInsertSize, defaultInsertAlignment, afterInsertAction]);

  // ---------------------------------------------------------------------------
  // 顶栏按钮 handler
  // ---------------------------------------------------------------------------

  const handleExitToOldMode = () => {
    // 切回旧模式：清空 hash 路由 + 用 search params 触发旧模式
    if (paramGuideId) {
      window.location.search = `?mode=guide&guideId=${encodeURIComponent(paramGuideId)}`;
    } else {
      window.location.search = `?mode=guide`;
    }
  };

  const handleReview = async () => {
    // 直传 push（不进审阅页，审阅页待实现）
    if (!paramGuideId) return;

    try {
      await pushEntireGuide({
        onProgress: (p) => setPushProgress(p),
      });
      toast.success(
        t("upload.success", { ns: "editor", defaultValue: "上传完成" })
      );
    } catch (err) {
      loggers.editor.error("WholeGuideEditor push 失败", err);
    } finally {
      setPushProgress(null);
    }
  };

  const handleNavigateReview = () => {
    if (!paramGuideId) return;
    navigate(`/whole/${paramGuideId}/review`);
  };

  // ---------------------------------------------------------------------------
  // 右键菜单 handler
  // ---------------------------------------------------------------------------

  const handleEditorContextMenu = (e: React.MouseEvent) => {
    if (!editor) return;
    e.preventDefault();

    const view = editor.view;
    const coords = view.posAtCoords({ left: e.clientX, top: e.clientY });

    let mode: WholeGuideContextMode = "empty";
    if (coords) {
      const $pos = view.state.doc.resolve(coords.pos);
      let inChapterTitle = false;
      let inTable = false;
      for (let d = $pos.depth; d >= 0; d--) {
        const n = $pos.node(d);
        const name = n.type.name;
        if (name === "chapterTitle") inChapterTitle = true;
        if (name === "tableCell" || name === "tableHeader" || name === "table") {
          inTable = true;
        }
      }
      const hasSelection = !view.state.selection.empty;
      if (inChapterTitle) mode = "chapterTitle";
      else if (inTable) mode = "table";
      else if (hasSelection) mode = "selection";
      else mode = "empty";
    }

    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, mode });
  };

  const closeContextMenu = () =>
    setContextMenu((prev) => ({ ...prev, visible: false }));

  // ---------------------------------------------------------------------------
  // 渲染
  // ---------------------------------------------------------------------------

  return (
    <div
      data-whole-guide-editor
      style={{
        minHeight: "100vh",
        background: "var(--bg-app, #0e141b)",
        padding: "1.5rem",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
      }}
    >
      {/* 顶栏 — 与旧模式 EditorHeader 视觉对齐，复用 SettingsModal */}
      <WholeGuideHeader
        paramGuideId={paramGuideId}
        onExitToOldMode={handleExitToOldMode}
        onReview={handleNavigateReview}
        onPushDirect={handleReview}
      />

      {/* 错误提示（可选） */}
      {error && (
        <div
          style={{
            background: "rgba(220, 53, 69, 0.12)",
            border: "1px solid rgba(220, 53, 69, 0.4)",
            color: "#ff8a92",
            padding: "0.75rem 1rem",
            borderRadius: "0.5rem",
            fontSize: "0.9rem",
          }}
        >
          {error}
        </div>
      )}

      {/* 主体区 */}
      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "stretch",
          justifyContent: "center",
        }}
      >
        {status === "pulling" ? (
          <PullProgressView progress={pullProgress} />
        ) : (
          <div
            style={{
              borderRadius: "var(--radius-lg, 1.05rem)",
              background: "var(--bg-surface, #0d1724)",
              border: "1px solid var(--border-accent, rgba(102, 192, 244, 0.25))",
              padding: "1.1rem",
              boxShadow: "var(--shadow-panel, 0 24px 40px rgba(10, 18, 30, 0.45))",
              minWidth: "638px",
              display: "flex",
              flexDirection: "column",
            }}
            onContextMenu={handleEditorContextMenu}
          >
            <EditorContent
              editor={editor}
              className="prose-mirror nasge-editor-container"
            />
          </div>
        )}
      </main>

      {status === "pushing" && <PushProgressView progress={pushProgress} />}

      {/* 右键菜单 */}
      <WholeGuideContextMenu
        editor={editor}
        state={contextMenu}
        onClose={closeContextMenu}
      />

      {/* 右侧 TOC（折叠态 56px / 展开态 272px / hover 触发） */}
      <WholeGuideTOC editor={editor} />

      {/* 图片池悬浮窗 */}
      <ImageFloatingPanel />

      {/* spinner keyframes */}
      <style>{`
        @keyframes nasge-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default WholeGuideEditor;
