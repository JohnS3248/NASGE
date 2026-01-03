import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { setDebugMode, loggers } from "../../shared/logger";

/**
 * 快捷键配置
 * 格式: 修饰键+键名，如 "Ctrl+A", "F2", "1"
 * 支持的修饰键: Ctrl, Alt, Shift, Meta(Cmd)
 */
export type ShortcutConfig = {
  // 图片池操作
  renameImage: string;        // 重命名图片
  deleteImage: string;        // 删除图片
  // 编辑器格式快捷键
  toggleBold: string;         // 加粗
  toggleItalic: string;       // 斜体
  toggleUnderline: string;    // 下划线
  toggleStrike: string;       // 删除线
  setParagraph: string;       // 正文段落
  setHeading1: string;        // 一级标题
  setHeading2: string;        // 二级标题
  setHeading3: string;        // 三级标题
  toggleCodeBlock: string;    // 代码块
  toggleSpoiler: string;      // 折叠/剧透
};

/**
 * 默认快捷键配置
 */
export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  // 图片池操作
  renameImage: "F2",
  deleteImage: "Delete",
  // 编辑器格式快捷键
  toggleBold: "Mod+B",
  toggleItalic: "Mod+I",
  toggleUnderline: "Mod+U",
  toggleStrike: "Mod+Shift+S",
  setParagraph: "Mod+0",
  setHeading1: "Mod+1",
  setHeading2: "Mod+2",
  setHeading3: "Mod+3",
  toggleCodeBlock: "Mod+K",
  toggleSpoiler: "Mod+H"
};

/**
 * 快捷键显示名称映射
 */
export const SHORTCUT_LABELS: Record<keyof ShortcutConfig, string> = {
  // 图片池操作
  renameImage: "重命名图片",
  deleteImage: "删除图片",
  // 编辑器格式快捷键
  toggleBold: "加粗",
  toggleItalic: "斜体",
  toggleUnderline: "下划线",
  toggleStrike: "删除线",
  setParagraph: "正文段落",
  setHeading1: "一级标题",
  setHeading2: "二级标题",
  setHeading3: "三级标题",
  toggleCodeBlock: "代码块",
  toggleSpoiler: "折叠/剧透"
};

/**
 * 检查键盘事件是否匹配快捷键配置
 * @param e 键盘事件
 * @param shortcut 快捷键字符串，如 "Ctrl+A", "F2", "Delete"
 * @returns 是否匹配
 */
export function matchShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.split("+");
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1).map(m => m.toLowerCase());

  // 检查修饰键
  const needsCtrl = modifiers.includes("ctrl");
  const needsAlt = modifiers.includes("alt");
  const needsShift = modifiers.includes("shift");
  const needsMeta = modifiers.includes("meta");

  if (needsCtrl !== e.ctrlKey) return false;
  if (needsAlt !== e.altKey) return false;
  if (needsShift !== e.shiftKey) return false;
  if (needsMeta !== e.metaKey) return false;

  // 检查主键
  // 处理特殊键名映射
  const keyLower = key.toLowerCase();
  const eventKey = e.key.toLowerCase();

  // 直接匹配
  if (eventKey === keyLower) return true;

  // 特殊键名处理
  if (keyLower === "space" && e.key === " ") return true;
  if (keyLower === "delete" && e.key === "Delete") return true;
  if (keyLower === "escape" && e.key === "Escape") return true;

  // 功能键 (F1-F12)
  if (keyLower.startsWith("f") && keyLower.length <= 3) {
    if (e.key.toLowerCase() === keyLower) return true;
  }

  return false;
}

/**
 * 编辑器对齐方式
 * - left: 靠左 (限制宽度)
 * - center: 居中 (限制宽度)
 * - full: 全屏 (不限制宽度)
 */
export type EditorAlignment = 'left' | 'center' | 'full';

/**
 * 工具栏位置
 * - top: 顶部（横向）
 * - left: 左侧（纵向）
 */
export type ToolbarPosition = 'top' | 'left';

// ==================== 右键菜单配置 ====================

/**
 * 菜单项配置
 */
export interface MenuItemConfig {
  id: string;
  enabled: boolean;
}

/**
 * 分组配置（仅图片菜单使用）
 */
export interface MenuGroupConfig {
  groupId: 'preset' | 'align' | 'action';
  items: MenuItemConfig[];
}

/**
 * 通用菜单配置
 */
export interface ContextMenuConfig {
  enabled: boolean;
  items: MenuItemConfig[];
}

/**
 * 图片菜单配置（分组排序）
 */
export interface ImageMenuConfig {
  enabled: boolean;
  groups: MenuGroupConfig[];
}

/**
 * 菜单类型
 */
export type ContextMenuType = 'image' | 'selection' | 'empty' | 'imagePool';

/**
 * 菜单项定义（含显示标签）
 */
export interface MenuItemDefinition {
  id: string;
  label: string;
}

// === 默认菜单项定义 ===

export const IMAGE_MENU_PRESET_ITEMS: MenuItemDefinition[] = [
  { id: 'preset-original', label: '原尺寸' },
  { id: 'preset-half', label: '半宽' },
  { id: 'preset-full', label: '全宽' }
];

export const IMAGE_MENU_ALIGN_ITEMS: MenuItemDefinition[] = [
  { id: 'align-floatLeft', label: '左对齐' },
  { id: 'align-floatRight', label: '右对齐' },
  { id: 'align-inline', label: '内嵌' }
];

export const IMAGE_MENU_ACTION_ITEMS: MenuItemDefinition[] = [
  { id: 'upload', label: '上传图片' },
  { id: 'delete', label: '删除图片' }
];

export const SELECTION_MENU_ITEMS: MenuItemDefinition[] = [
  { id: 'heading1', label: '一级标题' },
  { id: 'heading2', label: '二级标题' },
  { id: 'heading3', label: '三级标题' },
  { id: 'spoiler', label: '隐藏文本' },
  { id: 'bold', label: '加粗' },
  { id: 'italic', label: '斜体' },
  { id: 'strike', label: '删除线' },
  { id: 'underline', label: '下划线' },
  { id: 'link', label: '插入链接' }
];

export const EMPTY_MENU_ITEMS: MenuItemDefinition[] = [
  { id: 'codeBlock', label: '插入代码块' },
  { id: 'quote', label: '插入引用' },
  { id: 'table', label: '插入表格' }
];

export const IMAGE_POOL_MENU_ITEMS: MenuItemDefinition[] = [
  { id: 'tags', label: '标签选择' }
];

// === 默认菜单配置 ===

const DEFAULT_IMAGE_MENU_CONFIG: ImageMenuConfig = {
  enabled: true,
  groups: [
    { groupId: 'preset', items: IMAGE_MENU_PRESET_ITEMS.map(i => ({ id: i.id, enabled: true })) },
    { groupId: 'align', items: IMAGE_MENU_ALIGN_ITEMS.map(i => ({ id: i.id, enabled: true })) },
    { groupId: 'action', items: IMAGE_MENU_ACTION_ITEMS.map(i => ({ id: i.id, enabled: true })) }
  ]
};

const DEFAULT_SELECTION_MENU_CONFIG: ContextMenuConfig = {
  enabled: true,
  items: SELECTION_MENU_ITEMS.map(i => ({ id: i.id, enabled: true }))
};

const DEFAULT_EMPTY_MENU_CONFIG: ContextMenuConfig = {
  enabled: true,
  items: EMPTY_MENU_ITEMS.map(i => ({ id: i.id, enabled: true }))
};

const DEFAULT_IMAGE_POOL_MENU_CONFIG: ContextMenuConfig = {
  enabled: true,
  items: IMAGE_POOL_MENU_ITEMS.map(i => ({ id: i.id, enabled: true }))
};

/**
 * 合并通用菜单配置
 * 保留用户的顺序和启用状态，同时确保新增菜单项被添加
 */
function mergeContextMenuConfig(
  persisted: Partial<ContextMenuConfig> | undefined,
  defaultConfig: ContextMenuConfig
): ContextMenuConfig {
  if (!persisted) return defaultConfig;

  const enabled = persisted.enabled ?? defaultConfig.enabled;
  const persistedItems = persisted.items || [];

  // 创建已持久化项的 Map
  const persistedMap = new Map(persistedItems.map(item => [item.id, item]));

  // 保留用户顺序，同时确保所有默认项都存在
  const mergedItems: MenuItemConfig[] = [];

  // 1. 先添加持久化的项（保持用户顺序）
  for (const item of persistedItems) {
    if (defaultConfig.items.some(d => d.id === item.id)) {
      mergedItems.push(item);
    }
  }

  // 2. 添加新增的默认项（不在持久化中的）
  for (const defaultItem of defaultConfig.items) {
    if (!persistedMap.has(defaultItem.id)) {
      mergedItems.push(defaultItem);
    }
  }

  return { enabled, items: mergedItems };
}

/**
 * 合并图片菜单配置（分组）
 */
function mergeImageMenuConfig(
  persisted: Partial<ImageMenuConfig> | undefined
): ImageMenuConfig {
  if (!persisted) return DEFAULT_IMAGE_MENU_CONFIG;

  const enabled = persisted.enabled ?? DEFAULT_IMAGE_MENU_CONFIG.enabled;
  const persistedGroups = persisted.groups || [];

  const mergedGroups: MenuGroupConfig[] = DEFAULT_IMAGE_MENU_CONFIG.groups.map(defaultGroup => {
    const persistedGroup = persistedGroups.find(g => g.groupId === defaultGroup.groupId);
    if (!persistedGroup) return defaultGroup;

    // 合并组内项
    const persistedMap = new Map(persistedGroup.items.map(item => [item.id, item]));
    const mergedItems: MenuItemConfig[] = [];

    // 1. 先添加持久化的项（保持用户顺序）
    for (const item of persistedGroup.items) {
      if (defaultGroup.items.some(d => d.id === item.id)) {
        mergedItems.push(item);
      }
    }

    // 2. 添加新增的默认项
    for (const defaultItem of defaultGroup.items) {
      if (!persistedMap.has(defaultItem.id)) {
        mergedItems.push(defaultItem);
      }
    }

    return { groupId: defaultGroup.groupId, items: mergedItems };
  });

  return { enabled, groups: mergedGroups };
}

export type EditorConfig = {
  autoUploadOnPaste: boolean;   // 编辑器：粘贴自动上传
  autoUploadOnDrop: boolean;    // 编辑器：拖放自动上传
  autoUploadInPanel: boolean;   // 悬浮窗：拖放/粘贴自动上传
  promptRenameOnPaste: boolean; // 悬浮窗：粘贴时启用内联重命名
  promptRenameOnDrop: boolean;  // 悬浮窗：拖拽时启用内联重命名
  debugMode: boolean;           // 调试模式开关
  shortcuts: ShortcutConfig;    // 快捷键配置
  // 智能布局配置（全屏模式）
  smartLayoutEnabled: boolean;        // 智能布局开关
  smartLayoutWidthThreshold: number;  // 大图宽度阈值 (px)
  smartLayoutHeightThreshold: number; // 大图高度阈值 (px)
  // 编辑器布局配置
  editorAlignment: EditorAlignment;   // 编辑器对齐方式：靠左/居中
  toolbarPosition: ToolbarPosition;   // 工具栏位置：顶部/左侧
  // 图片池配置（旧版，保留兼容）
  imageContextMenuEnabled: boolean;   // 图片池右键菜单开关（已废弃，使用 imagePoolMenuConfig.enabled）
  // 右键菜单配置
  imageMenuConfig: ImageMenuConfig;         // 编辑器图片菜单
  selectionMenuConfig: ContextMenuConfig;   // 文字选择菜单
  emptyMenuConfig: ContextMenuConfig;       // 空白处菜单
  imagePoolMenuConfig: ContextMenuConfig;   // 图片池菜单
};

type EditorConfigState = EditorConfig & {
  setAutoUploadOnPaste: (enabled: boolean) => void;
  setAutoUploadOnDrop: (enabled: boolean) => void;
  setAutoUploadInPanel: (enabled: boolean) => void;
  setPromptRenameOnPaste: (enabled: boolean) => void;
  setPromptRenameOnDrop: (enabled: boolean) => void;
  setDebugMode: (enabled: boolean) => void;
  // 快捷键相关
  setShortcut: (key: keyof ShortcutConfig, value: string) => void;
  resetShortcuts: () => void;
  // 智能布局相关
  setSmartLayoutEnabled: (enabled: boolean) => void;
  setSmartLayoutWidthThreshold: (value: number) => void;
  setSmartLayoutHeightThreshold: (value: number) => void;
  // 编辑器布局相关
  setEditorAlignment: (alignment: EditorAlignment) => void;
  setToolbarPosition: (position: ToolbarPosition) => void;
  // 图片池相关（旧版）
  setImageContextMenuEnabled: (enabled: boolean) => void;
  // 右键菜单配置相关
  setContextMenuEnabled: (menuType: ContextMenuType, enabled: boolean) => void;
  setMenuItemEnabled: (menuType: ContextMenuType, itemId: string, enabled: boolean, groupId?: 'preset' | 'align' | 'action') => void;
  reorderMenuItems: (menuType: ContextMenuType, itemIds: string[], groupId?: 'preset' | 'align' | 'action') => void;
  resetContextMenuConfig: (menuType: ContextMenuType) => void;
  reset: () => void;
};

const DEFAULT_CONFIG: EditorConfig = {
  autoUploadOnPaste: false, // 默认关闭自动上传
  autoUploadOnDrop: false,
  autoUploadInPanel: false, // 默认关闭悬浮窗自动上传
  promptRenameOnPaste: true, // 默认开启粘贴时重命名（内联编辑）
  promptRenameOnDrop: true,  // 默认开启拖拽时重命名（内联编辑）
  debugMode: true, // 默认开启调试模式（开发阶段），发布前改为 false
  shortcuts: DEFAULT_SHORTCUTS,
  // 智能布局默认值
  smartLayoutEnabled: false,       // 默认关闭
  smartLayoutWidthThreshold: 800,  // 默认 800px
  smartLayoutHeightThreshold: 600, // 默认 600px
  // 编辑器布局默认值
  editorAlignment: 'center',        // 默认居中
  toolbarPosition: 'top',           // 默认顶部
  // 图片池默认值（旧版兼容）
  imageContextMenuEnabled: true,    // 默认开启右键菜单
  // 右键菜单配置默认值
  imageMenuConfig: DEFAULT_IMAGE_MENU_CONFIG,
  selectionMenuConfig: DEFAULT_SELECTION_MENU_CONFIG,
  emptyMenuConfig: DEFAULT_EMPTY_MENU_CONFIG,
  imagePoolMenuConfig: DEFAULT_IMAGE_POOL_MENU_CONFIG
};

export const useEditorConfigStore = create<EditorConfigState>()(
  persist(
    (set) => ({
      ...DEFAULT_CONFIG,
      setAutoUploadOnPaste: (enabled) => {
        loggers.config.info("设置粘贴自动上传:", enabled);
        set({ autoUploadOnPaste: enabled });
      },
      setAutoUploadOnDrop: (enabled) => {
        loggers.config.info("设置拖放自动上传:", enabled);
        set({ autoUploadOnDrop: enabled });
      },
      setAutoUploadInPanel: (enabled) => {
        loggers.config.info("设置悬浮窗自动上传:", enabled);
        set({ autoUploadInPanel: enabled });
      },
      setPromptRenameOnPaste: (enabled) => {
        loggers.config.info("设置粘贴时重命名:", enabled);
        set({ promptRenameOnPaste: enabled });
      },
      setPromptRenameOnDrop: (enabled) => {
        loggers.config.info("设置拖拽时重命名:", enabled);
        set({ promptRenameOnDrop: enabled });
      },
      setDebugMode: (enabled) => {
        // 同步更新全局 logger 状态
        setDebugMode(enabled);
        // 这条日志在关闭调试模式时也会输出（因为还没生效）
        console.info("[NASGE Config] 调试模式:", enabled ? "开启" : "关闭");
        set({ debugMode: enabled });
      },
      setShortcut: (key, value) => {
        loggers.config.info("设置快捷键:", key, "=>", value);
        set((state) => ({
          shortcuts: {
            ...state.shortcuts,
            [key]: value
          }
        }));
      },
      resetShortcuts: () => {
        loggers.config.info("重置快捷键配置");
        set({ shortcuts: DEFAULT_SHORTCUTS });
      },
      setSmartLayoutEnabled: (enabled) => {
        loggers.config.info("设置智能布局:", enabled ? "开启" : "关闭");
        set({ smartLayoutEnabled: enabled });
      },
      setSmartLayoutWidthThreshold: (value) => {
        loggers.config.info("设置智能布局宽度阈值:", value);
        set({ smartLayoutWidthThreshold: Math.max(200, Math.min(2000, value)) });
      },
      setSmartLayoutHeightThreshold: (value) => {
        loggers.config.info("设置智能布局高度阈值:", value);
        set({ smartLayoutHeightThreshold: Math.max(200, Math.min(2000, value)) });
      },
      setEditorAlignment: (alignment) => {
        loggers.config.info("设置编辑器对齐方式:", alignment);
        set({ editorAlignment: alignment });
      },
      setToolbarPosition: (position) => {
        loggers.config.info("设置工具栏位置:", position);
        set({ toolbarPosition: position });
      },
      setImageContextMenuEnabled: (enabled) => {
        loggers.config.info("设置图片池右键菜单:", enabled ? "开启" : "关闭");
        set({ imageContextMenuEnabled: enabled });
      },
      // 右键菜单配置方法
      setContextMenuEnabled: (menuType, enabled) => {
        loggers.config.info(`设置${menuType}菜单:`, enabled ? "开启" : "关闭");
        set((state) => {
          switch (menuType) {
            case 'image':
              return { imageMenuConfig: { ...state.imageMenuConfig, enabled } };
            case 'selection':
              return { selectionMenuConfig: { ...state.selectionMenuConfig, enabled } };
            case 'empty':
              return { emptyMenuConfig: { ...state.emptyMenuConfig, enabled } };
            case 'imagePool':
              return {
                imagePoolMenuConfig: { ...state.imagePoolMenuConfig, enabled },
                imageContextMenuEnabled: enabled // 同步旧字段
              };
            default:
              return {};
          }
        });
      },
      setMenuItemEnabled: (menuType, itemId, enabled, groupId) => {
        loggers.config.info(`设置菜单项 ${itemId}:`, enabled ? "启用" : "禁用");
        set((state) => {
          if (menuType === 'image' && groupId) {
            const newGroups = state.imageMenuConfig.groups.map(g => {
              if (g.groupId === groupId) {
                return {
                  ...g,
                  items: g.items.map(item =>
                    item.id === itemId ? { ...item, enabled } : item
                  )
                };
              }
              return g;
            });
            return { imageMenuConfig: { ...state.imageMenuConfig, groups: newGroups } };
          }
          // 其他菜单类型
          const configKey = menuType === 'selection' ? 'selectionMenuConfig'
                         : menuType === 'empty' ? 'emptyMenuConfig'
                         : 'imagePoolMenuConfig';
          const config = state[configKey];
          return {
            [configKey]: {
              ...config,
              items: config.items.map(item =>
                item.id === itemId ? { ...item, enabled } : item
              )
            }
          };
        });
      },
      reorderMenuItems: (menuType, itemIds, groupId) => {
        loggers.config.info(`重排序菜单项:`, menuType, itemIds);
        set((state) => {
          if (menuType === 'image' && groupId) {
            const newGroups = state.imageMenuConfig.groups.map(g => {
              if (g.groupId === groupId) {
                // 根据 itemIds 顺序重新排列
                const reordered = itemIds
                  .map(id => g.items.find(item => item.id === id))
                  .filter((item): item is MenuItemConfig => item !== undefined);
                return { ...g, items: reordered };
              }
              return g;
            });
            return { imageMenuConfig: { ...state.imageMenuConfig, groups: newGroups } };
          }
          // 其他菜单类型
          const configKey = menuType === 'selection' ? 'selectionMenuConfig'
                         : menuType === 'empty' ? 'emptyMenuConfig'
                         : 'imagePoolMenuConfig';
          const config = state[configKey];
          const reordered = itemIds
            .map(id => config.items.find(item => item.id === id))
            .filter((item): item is MenuItemConfig => item !== undefined);
          return {
            [configKey]: { ...config, items: reordered }
          };
        });
      },
      resetContextMenuConfig: (menuType) => {
        loggers.config.info(`重置菜单配置:`, menuType);
        set(() => {
          switch (menuType) {
            case 'image':
              return { imageMenuConfig: DEFAULT_IMAGE_MENU_CONFIG };
            case 'selection':
              return { selectionMenuConfig: DEFAULT_SELECTION_MENU_CONFIG };
            case 'empty':
              return { emptyMenuConfig: DEFAULT_EMPTY_MENU_CONFIG };
            case 'imagePool':
              return {
                imagePoolMenuConfig: DEFAULT_IMAGE_POOL_MENU_CONFIG,
                imageContextMenuEnabled: true
              };
            default:
              return {};
          }
        });
      },
      reset: () => {
        loggers.config.info("重置配置");
        set(DEFAULT_CONFIG);
        setDebugMode(DEFAULT_CONFIG.debugMode);
      }
    }),
    {
      name: "nasge-editor-config",
      storage: createJSONStorage(() => localStorage),
      // 合并策略：确保新增字段能正确初始化
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<EditorConfig>;
        return {
          ...currentState,
          ...persisted,
          // 深度合并 shortcuts，确保新增的快捷键有默认值
          shortcuts: {
            ...DEFAULT_SHORTCUTS,
            ...(persisted?.shortcuts || {})
          },
          // 确保智能布局字段有默认值
          smartLayoutEnabled: persisted?.smartLayoutEnabled ?? DEFAULT_CONFIG.smartLayoutEnabled,
          smartLayoutWidthThreshold: persisted?.smartLayoutWidthThreshold ?? DEFAULT_CONFIG.smartLayoutWidthThreshold,
          smartLayoutHeightThreshold: persisted?.smartLayoutHeightThreshold ?? DEFAULT_CONFIG.smartLayoutHeightThreshold,
          // 确保编辑器布局字段有默认值
          editorAlignment: persisted?.editorAlignment ?? DEFAULT_CONFIG.editorAlignment,
          toolbarPosition: persisted?.toolbarPosition ?? DEFAULT_CONFIG.toolbarPosition,
          // 确保图片池字段有默认值
          imageContextMenuEnabled: persisted?.imageContextMenuEnabled ?? DEFAULT_CONFIG.imageContextMenuEnabled,
          // 深度合并右键菜单配置
          imageMenuConfig: mergeImageMenuConfig(persisted?.imageMenuConfig),
          selectionMenuConfig: mergeContextMenuConfig(persisted?.selectionMenuConfig, DEFAULT_SELECTION_MENU_CONFIG),
          emptyMenuConfig: mergeContextMenuConfig(persisted?.emptyMenuConfig, DEFAULT_EMPTY_MENU_CONFIG),
          imagePoolMenuConfig: mergeContextMenuConfig(persisted?.imagePoolMenuConfig, DEFAULT_IMAGE_POOL_MENU_CONFIG)
        };
      },
      onRehydrateStorage: () => {
        return (state) => {
          // 恢复后同步调试模式到全局 logger
          if (state) {
            setDebugMode(state.debugMode);
          }
        };
      }
    }
  )
);
