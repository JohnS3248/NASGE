import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
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
  }
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
  }
  // === END DEBUG ===

  const container = document.getElementById("root");
  if (!container) throw new Error("Editor root element not found");

  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap();
