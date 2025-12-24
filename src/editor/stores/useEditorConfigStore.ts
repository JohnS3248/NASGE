import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { setDebugMode, loggers } from "../../shared/logger";

export type EditorConfig = {
  autoUploadOnPaste: boolean;
  autoUploadOnDrop: boolean;
  debugMode: boolean; // 调试模式开关
};

type EditorConfigState = EditorConfig & {
  setAutoUploadOnPaste: (enabled: boolean) => void;
  setAutoUploadOnDrop: (enabled: boolean) => void;
  setDebugMode: (enabled: boolean) => void;
  reset: () => void;
};

const DEFAULT_CONFIG: EditorConfig = {
  autoUploadOnPaste: false, // 默认关闭自动上传
  autoUploadOnDrop: false,
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
