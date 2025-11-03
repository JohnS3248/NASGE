import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "NASGE",
  version: "0.3.0",
  description: "创建者友好的 Steam 指南编辑浏览器扩展",
  action: {
    default_popup: "src/popup/index.html"
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module"
  },
  permissions: ["storage", "activeTab", "scripting"],
  host_permissions: ["https://steamcommunity.com/*"],
  content_scripts: [
    {
      matches: ["https://steamcommunity.com/*"],
      js: ["src/content/main.ts"]
    }
  ],
  web_accessible_resources: [
    {
      resources: ["src/editor/index.html"],
      matches: ["https://steamcommunity.com/*"]
    }
  ]
});
