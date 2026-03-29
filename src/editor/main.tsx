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
    __reviewStore?: unknown;
    __bbcodeToHtml?: unknown;
    __htmlToBBCode?: unknown;
    __editor?: unknown;
  }
}

// 初始化主题（始终执行）
import("./stores/useEditorConfigStore").then(({ useEditorConfigStore }) => {
  const theme = useEditorConfigStore.getState().theme;
  document.documentElement.dataset.theme = theme;
});

// === DEBUG: 导出 Store 和 Service 用于控制台测试 ===
// 等待 EditorConfigStore rehydrate 后再判断 debugMode，避免同步求值时 _debugMode 尚未初始化
import("./stores/useEditorConfigStore").then(({ useEditorConfigStore }) => {
  const { debugMode } = useEditorConfigStore.getState();
  if (!debugMode) return;

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
  import("./stores/useReviewStore").then(({ useReviewStore }) => {
    window.__reviewStore = useReviewStore;
  });
  import("./utils/bbcode").then(({ bbcodeToHtml, htmlToBBCode }) => {
    window.__bbcodeToHtml = bbcodeToHtml;
    window.__htmlToBBCode = htmlToBBCode;
  });
});
// === END DEBUG ===

const container = document.getElementById("root");

if (!container) {
  throw new Error("Editor root element not found");
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
