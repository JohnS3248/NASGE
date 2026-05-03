/**
 * WholeGuideEditor — A4 全篇模式编辑器主组件（M1 雏形）
 *
 * 单 ProseMirror 实例承载整篇指南，章节边界由 chapterTitle 节点定义。
 * M1 范围：拉取 + 编辑 + 简化 push（无审阅页 / 无 TOC / 无字符计数 / 无框 UI 隐显 / 无自动备份）。
 *
 * M2 起追加：TOC 折叠/展开 / 字符计数 / 框 UI hover 隐显 / 自动备份 / IDB archive。
 * M3 起追加：审阅页路由 + diff + Steam preview。
 *
 * SPEC: 1_架构与数据模型.md §1.1 / §1.7 / 3_里程碑_M1_M4.md §3.2.5
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { EditorContent, useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";

import { createEditorExtensions } from "../utils/editorExtensions";
import { useWholeGuideStore } from "../stores/useWholeGuideStore";
import { useWholeGuideSync, type PullProgress, type PushProgress } from "../hooks/useWholeGuideSync";
import { toast } from "../stores/useToastStore";
import { loggers } from "../../shared/logger";

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

  // 暴露到 window 供 e2e 调试（SPEC §4.2.4）
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
    // M1 简化：直接走 pushEntireGuide；M3 起改为 navigate 到 review 路由
    // 当前点击按钮触发上传（占位行为，M3 替换为 navigate('/whole/:guideId/review')）
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
      {/* 顶栏 */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.85rem 1.1rem",
          background: "var(--bg-surface, #0d1724)",
          border: "1px solid rgba(102, 192, 244, 0.18)",
          borderRadius: "0.75rem",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.85rem",
              color: "var(--text-muted, #6b8094)",
              marginBottom: 4,
            }}
          >
            {t("wholeGuide.modeName", { defaultValue: "全篇编辑" })}
          </div>
          <div
            style={{
              fontSize: "1.1rem",
              fontWeight: 600,
              color: "var(--text-primary, #d7e8ff)",
            }}
          >
            {guideTitle || `Guide ${paramGuideId ?? ""}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.6rem" }}>
          <button
            type="button"
            onClick={handleExitToOldMode}
            style={{
              padding: "0.5rem 0.95rem",
              borderRadius: "0.5rem",
              border: "1px solid rgba(102, 192, 244, 0.3)",
              background: "transparent",
              color: "var(--text-secondary, #c7dff7)",
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            {t("wholeGuide.exitToOldMode", { defaultValue: "切换回章节模式" })}
          </button>
          <button
            type="button"
            onClick={handleNavigateReview}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "none",
              background:
                "linear-gradient(135deg, rgba(102, 192, 244, 0.95), rgba(66, 139, 202, 0.95))",
              color: "#06101e",
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: 600,
            }}
            disabled={status !== "editing"}
          >
            {t("wholeGuide.review", { defaultValue: "审阅并上传" })}
          </button>
          {/* M1 简化：把当前 push 行为也保留为内联快捷按钮，M3 起此按钮被审阅页 confirmUpload 取代 */}
          <button
            type="button"
            onClick={handleReview}
            style={{
              padding: "0.5rem 0.95rem",
              borderRadius: "0.5rem",
              border: "1px solid rgba(102, 192, 244, 0.3)",
              background: "rgba(21, 34, 52, 0.6)",
              color: "var(--text-secondary, #c7dff7)",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
            disabled={status !== "editing"}
            title={t("upload.toSteam", { defaultValue: "Upload to Steam" })}
          >
            {t("upload.toSteam", { defaultValue: "上传到 Steam" })}
          </button>
        </div>
      </header>

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
          >
            <EditorContent
              editor={editor}
              className="prose-mirror nasge-editor-container"
            />
          </div>
        )}
      </main>

      {status === "pushing" && <PushProgressView progress={pushProgress} />}

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
