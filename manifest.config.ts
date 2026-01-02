import { defineManifest } from "@crxjs/vite-plugin";
import { VERSION } from "./version";

export default defineManifest({
  manifest_version: 3,
  name: "NASGE",
  version: VERSION,
  description: "创建者友好的 Steam 指南编辑浏览器扩展",
  icons: {
    "16": "icon/icon-16.png",
    "48": "icon/icon-48.png",
    "128": "icon/icon-128.png"
  },
  action: {
    default_popup: "src/popup/index.html",
    default_icon: {
      "16": "icon/icon-16.png",
      "48": "icon/icon-48.png",
      "128": "icon/icon-128.png"
    }
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
      js: ["src/content/gPreviewImagesBridge.ts"],
      world: "MAIN"
    },
    {
      matches: ["https://steamcommunity.com/*"],
      js: ["src/content/main.ts"]
    },
    {
      matches: ["https://steamcommunity.com/*"],
      js: ["src/content/debug.ts"],
      world: "MAIN"
    },
    {
      matches: ["https://steamcommunity.com/*"],
      js: ["src/content/inspectGlobals.ts"],
      world: "MAIN"
    }
  ],
  web_accessible_resources: [
    {
      resources: ["src/editor/index.html"],
      matches: ["https://steamcommunity.com/*"]
    }
  ]
});
