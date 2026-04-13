import type { TourStepDef } from "./types";

// ============================================================================
// Prepare 函数 — 高亮前强制唤出 UI
// ============================================================================

/** 展开 ChapterNav（折叠态点击按钮展开） */
function prepareChapterNav() {
  const el = document.querySelector('[data-tour="chapter-nav"]');
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (rect.width < 50) {
    const btn = el.querySelector("button");
    btn?.click();
  }
}

/** 打开图片池悬浮窗 */
function prepareImagePanel() {
  import("../stores/useImagePanelStore").then(({ useImagePanelStore }) => {
    const state = useImagePanelStore.getState();
    if (!state.isOpen || state.isMinimized) {
      state.open();
    }
  });
}

/** 收起图片池 */
function closeImagePanel() {
  import("../stores/useImagePanelStore").then(({ useImagePanelStore }) => {
    const state = useImagePanelStore.getState();
    if (state.isOpen) {
      state.close();
    }
  });
}

/** 打开设置面板并切换到指定 tab */
function prepareSettingsTab(tabId: string) {
  return () => {
    // 点击齿轮按钮打开 SettingsModal
    const settingsBtn = document.querySelector('[data-tour="settings-button"]') as HTMLElement | null;
    if (settingsBtn) {
      // 检查 modal 是否已打开（查找 settings-content）
      const alreadyOpen = document.querySelector('[data-tour="settings-content"]');
      if (!alreadyOpen) {
        settingsBtn.click();
      }
      // 等 modal 渲染后切换 tab
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const tabBtn = document.querySelector(`[data-tour-tab="${tabId}"]`) as HTMLElement | null;
          tabBtn?.click();
        });
      });
    }
  };
}

// ============================================================================
// 基础 Tour（6 步：欢迎窗 + 4 步主流程 + 完成窗）
// ============================================================================

export const BASIC_STEPS: TourStepDef[] = [
  {
    id: "welcome",
    tier: "basic",
    titleKey: "tour.welcome.title",
    descriptionKey: "tour.welcome.desc",
  },
  {
    id: "mode-select",
    tier: "basic",
    selector: '[data-tour="editor-header"]',
    titleKey: "tour.mode.title",
    descriptionKey: "tour.mode.desc",
    side: "bottom",
    align: "center",
  },
  {
    id: "draft-panel",
    tier: "basic",
    selector: '[data-tour="draft-panel"]',
    titleKey: "tour.draft.title",
    descriptionKey: "tour.draft.desc",
    side: "bottom",
    align: "start",
  },
  {
    id: "editor-area",
    tier: "basic",
    selector: '[data-tour="tiptap-editor"]',
    titleKey: "tour.editor.title",
    descriptionKey: "tour.editor.desc",
    side: "right",
    align: "start",
  },
  {
    id: "upload",
    tier: "basic",
    selector: '[data-tour="upload-button"]',
    titleKey: "tour.upload.title",
    descriptionKey: "tour.upload.desc",
    side: "bottom",
    align: "end",
  },
  {
    id: "basic-complete",
    tier: "basic",
    titleKey: "tour.basicComplete.title",
    descriptionKey: "tour.basicComplete.desc",
  },
];

// ============================================================================
// 高级 Tour — 内容步骤 + 设置页面 4 步
// ============================================================================

export const ADVANCED_STEPS: TourStepDef[] = [
  // ── 内容步骤 ──
  {
    id: "chapter-nav",
    tier: "advanced",
    selector: '[data-tour="chapter-nav"]',
    titleKey: "tour.chapterNav.title",
    descriptionKey: "tour.chapterNav.desc",
    side: "right",
    align: "start",
    showOnModes: ["guide", "offline-guide"],
    prepare: prepareChapterNav,
  },
  {
    id: "image-pool",
    tier: "advanced",
    selector: '[data-tour="image-panel"]',
    titleKey: "tour.imagePool.title",
    descriptionKey: "tour.imagePool.desc",
    side: "left",
    align: "start",
    showOnModes: ["guide"],
    prepare: prepareImagePanel,
  },
  {
    id: "image-pool-manage",
    tier: "advanced",
    selector: '[data-tour="image-panel"]',
    titleKey: "tour.imagePoolManage.title",
    descriptionKey: "tour.imagePoolManage.desc",
    side: "left",
    align: "start",
    showOnModes: ["guide"],
  },
  // ── 设置页面 4 步 ──
  {
    id: "settings-general",
    tier: "advanced",
    selector: '[data-tour="settings-content"]',
    titleKey: "tour.settingsGeneral.title",
    descriptionKey: "tour.settingsGeneral.desc",
    side: "left",
    align: "start",
    prepare: () => {
      closeImagePanel();
      prepareSettingsTab("general")();
    },
  },
  {
    id: "settings-images",
    tier: "advanced",
    selector: '[data-tour="settings-content"]',
    titleKey: "tour.settingsImages.title",
    descriptionKey: "tour.settingsImages.desc",
    side: "left",
    align: "start",
    prepare: prepareSettingsTab("images"),
  },
  {
    id: "settings-menus",
    tier: "advanced",
    selector: '[data-tour="settings-content"]',
    titleKey: "tour.settingsMenus.title",
    descriptionKey: "tour.settingsMenus.desc",
    side: "left",
    align: "start",
    prepare: prepareSettingsTab("menus"),
  },
  {
    id: "settings-shortcuts",
    tier: "advanced",
    selector: '[data-tour="settings-content"]',
    titleKey: "tour.settingsShortcuts.title",
    descriptionKey: "tour.settingsShortcuts.desc",
    side: "left",
    align: "start",
    prepare: prepareSettingsTab("shortcuts"),
  },
  // ── 完成画面 ──
  {
    id: "advanced-complete",
    tier: "advanced",
    // 无 selector → 居中浮层
    titleKey: "tour.advancedComplete.title",
    descriptionKey: "tour.advancedComplete.desc",
    prepare: () => {
      // 关闭设置面板
      const closeBtn = document.querySelector('[data-tour="settings-close"]') as HTMLElement | null;
      closeBtn?.click();
    },
  },
  // ── 评测模式（仅评测时显示）──
  {
    id: "review-mode",
    tier: "advanced",
    selector: '[data-tour="editor-header"]',
    titleKey: "tour.reviewMode.title",
    descriptionKey: "tour.reviewMode.desc",
    side: "bottom",
    align: "center",
    showOnModes: ["review", "offline-review"],
  },
];
