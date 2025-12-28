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
  selectAll: string;          // 全选图片

  // 标签筛选（数字键 1-9 对应标签，0 为未标签）
  filterTag1: string;
  filterTag2: string;
  filterTag3: string;
  filterTag4: string;
  filterTag5: string;
  filterTag6: string;
  filterTag7: string;
  filterTag8: string;
  filterTag9: string;
  filterNoTag: string;        // 显示未标签图片
  clearFilter: string;        // 清除筛选
};

/**
 * 默认快捷键配置
 */
export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  renameImage: "F2",
  deleteImage: "Delete",
  selectAll: "Ctrl+A",
  filterTag1: "1",
  filterTag2: "2",
  filterTag3: "3",
  filterTag4: "4",
  filterTag5: "5",
  filterTag6: "6",
  filterTag7: "7",
  filterTag8: "8",
  filterTag9: "9",
  filterNoTag: "0",
  clearFilter: "Escape"
};

/**
 * 快捷键显示名称映射
 */
export const SHORTCUT_LABELS: Record<keyof ShortcutConfig, string> = {
  renameImage: "重命名图片",
  deleteImage: "删除图片",
  selectAll: "全选图片",
  filterTag1: "筛选标签 1",
  filterTag2: "筛选标签 2",
  filterTag3: "筛选标签 3",
  filterTag4: "筛选标签 4",
  filterTag5: "筛选标签 5",
  filterTag6: "筛选标签 6",
  filterTag7: "筛选标签 7",
  filterTag8: "筛选标签 8",
  filterTag9: "筛选标签 9",
  filterNoTag: "筛选未标签",
  clearFilter: "清除筛选"
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

export type EditorConfig = {
  autoUploadOnPaste: boolean;   // 编辑器：粘贴自动上传
  autoUploadOnDrop: boolean;    // 编辑器：拖放自动上传
  autoUploadInPanel: boolean;   // 悬浮窗：拖放/粘贴自动上传
  promptRenameOnPaste: boolean; // 悬浮窗：粘贴时启用内联重命名
  promptRenameOnDrop: boolean;  // 悬浮窗：拖拽时启用内联重命名
  debugMode: boolean;           // 调试模式开关
  shortcuts: ShortcutConfig;    // 快捷键配置
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
  reset: () => void;
};

const DEFAULT_CONFIG: EditorConfig = {
  autoUploadOnPaste: false, // 默认关闭自动上传
  autoUploadOnDrop: false,
  autoUploadInPanel: false, // 默认关闭悬浮窗自动上传
  promptRenameOnPaste: true, // 默认开启粘贴时重命名（内联编辑）
  promptRenameOnDrop: true,  // 默认开启拖拽时重命名（内联编辑）
  debugMode: true, // 默认开启调试模式（开发阶段），发布前改为 false
  shortcuts: DEFAULT_SHORTCUTS
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
          }
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
