import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// === DEBUG: 导出新 Store 和 Service 用于控制台测试 ===
import { useImageStore } from "./stores/useImageStore";
import { ImageUploadService } from "./services/ImageUploadService";
declare global {
  interface Window {
    __imageStore: typeof useImageStore;
    __uploadService: typeof ImageUploadService;
  }
}
window.__imageStore = useImageStore;
window.__uploadService = ImageUploadService;
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
