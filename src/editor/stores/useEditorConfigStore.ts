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
};

/**
 * 默认快捷键配置
 */
export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  renameImage: "F2",
  deleteImage: "Delete",
  selectAll: "Ctrl+A"
};

/**
 * 快捷键显示名称映射
 */
export const SHORTCUT_LABELS: Record<keyof ShortcutConfig, string> = {
  renameImage: "重命名图片",
  deleteImage: "删除图片",
  selectAll: "全选图片"
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
 */
export type EditorAlignment = 'left' | 'center';

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
  editorAlignment: 'center'        // 默认居中
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
          editorAlignment: persisted?.editorAlignment ?? DEFAULT_CONFIG.editorAlignment
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
