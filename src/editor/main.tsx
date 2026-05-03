import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import WholeGuideEditor from "./components/WholeGuideEditor";
import "./styles/tailwind.css";

// === DEBUG: Window 全局扩展类型声明 ===
declare global {
  interface Window {
    __imageStore?: unknown;
    __imagePanelStore?: unknown;
    __steamImageStore?: unknown;
    __uploadService?: unknown;
    __editorConfigStore?: unknown;
    __toastStore?: unknown;
    __guideStore?: unknown;
    __draftStore?: unknown;
    __archiveStore?: unknown;
    __reviewStore?: unknown;
    __dialogStore?: unknown;
    __bbcodeToHtml?: unknown;
    __htmlToBBCode?: unknown;
    __editor?: unknown;
    // 全篇模式 debug 接口
    __wholeGuideStore?: unknown;
    __wholeGuideEditor?: unknown;
    __useWholeGuideSync?: unknown;
  }
}

/**
 * 旧模式入口 wrapper —— 保留 useEditorMode 读 search params 的零破坏行为。
 * 路径 `/`（默认 hash）渲染此组件，旧模式 URL 仍是 `index.html?mode=guide&guideId=...`。
 */
function LegacyEditorView() {
  return <App />;
}

/**
 * 全篇模式 layout（基础版，仅渲染 WholeGuideEditor）。
 * 审阅页接入后会改为 Outlet 模式，让编辑器持续 mount 防止状态丢失。
 */
function WholeGuideEditorLayout() {
  return <WholeGuideEditor />;
}

// 初始化主题 + i18n，等待完成后再 render（避免 key 闪现）
async function bootstrap() {
  const { useEditorConfigStore } = await import("./stores/useEditorConfigStore");
  const state = useEditorConfigStore.getState();
  document.documentElement.dataset.theme = state.theme;

  const { initI18n } = await import("../i18n");
  await initI18n(state.locale);

  // === DEBUG: 导出 Store 和 Service 用于控制台测试 ===
  if (state.debugMode) {
    import("./stores/useImageStore").then(({ useImageStore }) => {
      window.__imageStore = useImageStore;
    });
    import("./stores/useImagePanelStore").then(({ useImagePanelStore }) => {
      window.__imagePanelStore = useImagePanelStore;
    });
    import("./stores/useSteamGuideImageStore").then(
      ({ useSteamGuideImageStore }) => {
        window.__steamImageStore = useSteamGuideImageStore;
      }
    );
    import("./services/ImageUploadService").then(({ ImageUploadService }) => {
      window.__uploadService = ImageUploadService;
    });
    window.__editorConfigStore = useEditorConfigStore;
    import("./stores/useToastStore").then(({ useToastStore }) => {
      window.__toastStore = useToastStore;
    });
    import("./stores/useDialogStore").then(({ useDialogStore }) => {
      window.__dialogStore = useDialogStore;
    });
    import("./stores/useGuideStore").then(({ useGuideStore }) => {
      window.__guideStore = useGuideStore;
    });
    import("./stores/useDraftStore").then(({ useDraftStore }) => {
      window.__draftStore = useDraftStore;
    });
    import("./stores/useArchiveStore").then(({ useArchiveStore }) => {
      window.__archiveStore = useArchiveStore;
    });
    import("./stores/useReviewStore").then(({ useReviewStore }) => {
      window.__reviewStore = useReviewStore;
    });
    import("./utils/bbcode").then(({ bbcodeToHtml, htmlToBBCode }) => {
      window.__bbcodeToHtml = bbcodeToHtml;
      window.__htmlToBBCode = htmlToBBCode;
    });
    // 全篇模式 debug 暴露
    import("./stores/useWholeGuideStore").then(({ useWholeGuideStore }) => {
      window.__wholeGuideStore = useWholeGuideStore;
    });
    import("./hooks/useWholeGuideSync").then(({ pullEntireGuide, pushEntireGuide }) => {
      window.__useWholeGuideSync = { pullEntireGuide, pushEntireGuide };
    });
    // __wholeGuideEditor 由 WholeGuideEditor 在 mount 时设置 / unmount 时清空
    window.__wholeGuideEditor = null;
  }
  // === END DEBUG ===

  const container = document.getElementById("root");
  if (!container) throw new Error("Editor root element not found");

  createRoot(container).render(
    <React.StrictMode>
      <HashRouter>
        <Routes>
          {/* 旧模式默认入口：路径 `/` 渲染 LegacyEditorView，沿用 useEditorMode 读 search params */}
          <Route path="/" element={<LegacyEditorView />} />
          {/* A4 全篇模式 */}
          <Route path="/whole/:guideId" element={<WholeGuideEditorLayout />}>
            <Route index element={null} />
            {/* 审阅页占位路由（待实现） */}
            <Route path="review" element={<div style={{ padding: "2rem", color: "#8aa4c7" }}>Review (placeholder)</div>} />
          </Route>
        </Routes>
      </HashRouter>
    </React.StrictMode>
  );
}

bootstrap();
