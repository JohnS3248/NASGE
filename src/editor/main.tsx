import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// === DEBUG: 导出新 Store 和 Service 用于控制台测试（仅开发环境）===
// @ts-ignore - Vite 环境变量
if (import.meta.env?.DEV) {
  import("./stores/useImageStore").then(({ useImageStore }) => {
    import("./services/ImageUploadService").then(({ ImageUploadService }) => {
      (window as any).__imageStore = useImageStore;
      (window as any).__uploadService = ImageUploadService;
    });
  });
}
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
