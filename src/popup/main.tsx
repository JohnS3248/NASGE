import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initI18n } from "../i18n";

// 从 localStorage 读取用户选择的 locale，与编辑器保持一致
function getPersistedLocale(): string {
  try {
    const raw = localStorage.getItem("nasge-editor-config");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.state?.locale) return parsed.state.locale;
    }
  } catch { /* ignore */ }
  return "auto";
}

async function bootstrap() {
  await initI18n(getPersistedLocale());

  const container = document.getElementById("root");
  if (!container) throw new Error("Popup root element not found");

  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap();
