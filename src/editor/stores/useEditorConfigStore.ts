import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { setDebugMode, loggers } from "../../shared/logger";

export type EditorConfig = {
  autoUploadOnPaste: boolean;   // 编辑器：粘贴自动上传
  autoUploadOnDrop: boolean;    // 编辑器：拖放自动上传
  autoUploadInPanel: boolean;   // 悬浮窗：拖放/粘贴自动上传
  promptRenameOnPaste: boolean; // 悬浮窗：粘贴时弹出重命名窗口
  debugMode: boolean;           // 调试模式开关
};

type EditorConfigState = EditorConfig & {
  setAutoUploadOnPaste: (enabled: boolean) => void;
  setAutoUploadOnDrop: (enabled: boolean) => void;
  setAutoUploadInPanel: (enabled: boolean) => void;
  setPromptRenameOnPaste: (enabled: boolean) => void;
  setDebugMode: (enabled: boolean) => void;
  reset: () => void;
};

const DEFAULT_CONFIG: EditorConfig = {
  autoUploadOnPaste: false, // 默认关闭自动上传
  autoUploadOnDrop: false,
  autoUploadInPanel: false, // 默认关闭悬浮窗自动上传
  promptRenameOnPaste: true, // 默认开启粘贴时重命名（内联编辑）
  debugMode: true // 默认开启调试模式（开发阶段），发布前改为 false
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
        loggers.config.info("设置粘贴重命名弹窗:", enabled);
        set({ promptRenameOnPaste: enabled });
      },
      setDebugMode: (enabled) => {
        // 同步更新全局 logger 状态
        setDebugMode(enabled);
        // 这条日志在关闭调试模式时也会输出（因为还没生效）
        console.info("[NASGE Config] 调试模式:", enabled ? "开启" : "关闭");
        set({ debugMode: enabled });
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
