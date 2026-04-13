/**
 * NASGE 更新日志数据
 * 双语内联，新版本 prepend 到数组头部
 */

export type ChangelogSection = {
  titleZh: string;
  titleEn: string;
  items: { zh: string; en: string }[];
};

export type ChangelogEntry = {
  version: string;
  dateZh: string;
  dateEn: string;
  sections: ChangelogSection[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.0.0",
    dateZh: "2026年4月",
    dateEn: "April 2026",
    sections: [
      {
        titleZh: "全新特性",
        titleEn: "New Features",
        items: [
          {
            zh: "全新 UI 大改版 — Tailwind CSS v4 重构全部界面，支持三套主题（Steam Dark / Midnight / Classic）",
            en: "Complete UI overhaul — rebuilt all interfaces with Tailwind CSS v4, three themes (Steam Dark / Midnight / Classic)",
          },
          {
            zh: "完整双语支持 — 中文 / 英文 / 跟随系统语言自动切换",
            en: "Full bilingual support — Chinese / English / auto-detect from system language",
          },
          {
            zh: "评测模式 — 在 Steam 游戏商店页直接创建和更新评测，支持推荐/不推荐、可见性、语言等设置",
            en: "Review mode — create and update Steam reviews directly from the game store page, with recommend/not recommend, visibility, language settings",
          },
          {
            zh: "游戏截图浏览 — 图片池新增「截图」标签页，可浏览并拖入游戏截图",
            en: "Game screenshots — new Screenshots tab in image pool, browse and drag game screenshots into the editor",
          },
          {
            zh: "外链图片插入 — 右键菜单支持插入外部 HTTPS 图片链接，自动检测 Steam 兼容性",
            en: "External image insertion — insert external HTTPS image URLs via context menu, with automatic Steam compatibility check",
          },
          {
            zh: "图片上传优化 — Steam 2MB 大小校验、批量重命名、拖入路由修正",
            en: "Image upload improvements — Steam 2MB size validation, batch rename, drag routing fixes",
          },
          {
            zh: "新手引导系统 — 基础 + 高级双阶段交互式引导，随时可从设置中重播",
            en: "Onboarding tour — basic + advanced two-stage interactive tour, replayable from settings",
          },
          {
            zh: "统一错误处理 — Steam EResult 错误码分类 + 可读的 i18n 错误消息",
            en: "Unified error handling — Steam EResult error classification + human-readable i18n error messages",
          },
          {
            zh: "Toast 通知系统 — 替换所有 window.alert()，操作反馈更优雅",
            en: "Toast notification system — replaced all window.alert() with elegant notification toasts",
          },
        ],
      },
      {
        titleZh: "改进",
        titleEn: "Improvements",
        items: [
          {
            zh: "工具栏三种停靠模式 — 侧边、顶部、浮动，自由切换",
            en: "Three toolbar dock modes — side, top, floating, freely switchable",
          },
          {
            zh: "骨架屏 + 过渡动画 — 编辑器、图片池、预览面板、弹窗等全面加入加载与过渡动效",
            en: "Skeleton screens + transitions — loading and transition animations for editor, image pool, preview panel, and modals",
          },
          {
            zh: "章节导航双模式 — 固定模式（嵌入侧边栏）和可拖拽模式（自由浮动）",
            en: "Chapter navigation dual mode — fixed (embedded in sidebar) and draggable (floating)",
          },
          {
            zh: "多窗口 session 隔离 — 同时打开多个编辑器窗口不再互相干扰",
            en: "Multi-window session isolation — opening multiple editor windows no longer interferes with each other",
          },
          {
            zh: "嵌套表格支持 — 右键菜单支持在表格单元格内插入子表格",
            en: "Nested table support — insert sub-tables inside table cells via context menu",
          },
          {
            zh: "右键菜单防溢出 — 菜单渲染后自动调整位置，不超出视口",
            en: "Context menu overflow prevention — menu auto-repositions after render to stay within viewport",
          },
          {
            zh: "Dialog 系统增强 — 支持多行文本输入、字数显示",
            en: "Dialog system enhancement — supports multiline text input with character count",
          },
        ],
      },
      {
        titleZh: "修复",
        titleEn: "Bug Fixes",
        items: [
          {
            zh: "BBCode 往返修复 — [code] 内容不再被解析、[url] 无等号格式、inline+sizeFull 图片标签、文件名后缀污染",
            en: "BBCode roundtrip fixes — [code] content no longer parsed, [url] bare format, inline+sizeFull image tags, filename suffix pollution",
          },
          {
            zh: "图片池修复 — 粘贴多图只处理第一张、缩略图 URL 误用导致图片模糊",
            en: "Image pool fixes — paste handling only first image, thumbnail URL misuse causing blurry images",
          },
          {
            zh: "多 Steam 标签页路由修复 — 多个 Steam 页面同时打开时优先路由到指南编辑页",
            en: "Multi Steam tab routing fix — correctly routes to guide editing page when multiple Steam tabs are open",
          },
          {
            zh: "草稿隔离修复 — activeDraftId 多窗口隔离、评测草稿绑定游戏 appId 防止跨游戏覆盖",
            en: "Draft isolation fixes — activeDraftId multi-window isolation, review draft bound to game appId to prevent cross-game overwrites",
          },
          {
            zh: "预览面板竞态修复 — guideInfo 竞态条件 + 章节切换骨架屏时机",
            en: "Preview panel race condition fix — guideInfo race condition + chapter switch skeleton timing",
          },
        ],
      },
      {
        titleZh: "移除",
        titleEn: "Removed",
        items: [
          {
            zh: "移除「草稿绑定」功能 — 该功能设计不合理，已废弃。草稿现在按模式自动隔离，无需手动绑定",
            en: "Removed \"draft binding\" feature — poorly designed and deprecated. Drafts are now automatically isolated by mode without manual binding",
          },
        ],
      },
    ],
  },
];
