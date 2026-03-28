import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tailwind.css";

// === DEBUG: 导出 Store 和 Service 用于控制台测试 ===
import("./stores/useImageStore").then(({ useImageStore }) => {
  (window as any).__imageStore = useImageStore;
});
import("./stores/useImagePanelStore").then(({ useImagePanelStore }) => {
  (window as any).__imagePanelStore = useImagePanelStore;
});
import("./stores/useSteamGuideImageStore").then(({ useSteamGuideImageStore }) => {
  (window as any).__steamImageStore = useSteamGuideImageStore;
});
import("./services/ImageUploadService").then(({ ImageUploadService }) => {
  (window as any).__uploadService = ImageUploadService;
});
import("./stores/useEditorConfigStore").then(({ useEditorConfigStore }) => {
  (window as any).__editorConfigStore = useEditorConfigStore;
  // 初始化主题
  const theme = useEditorConfigStore.getState().theme;
  document.documentElement.dataset.theme = theme;
});
import("./utils/bbcode").then(({ bbcodeToHtml, htmlToBBCode }) => {
  (window as any).__bbcodeToHtml = bbcodeToHtml;
  (window as any).__htmlToBBCode = htmlToBBCode;
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
