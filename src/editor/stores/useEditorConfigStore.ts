import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type EditorConfig = {
  autoUploadOnPaste: boolean;
  autoUploadOnDrop: boolean;
};

type EditorConfigState = EditorConfig & {
  setAutoUploadOnPaste: (enabled: boolean) => void;
  setAutoUploadOnDrop: (enabled: boolean) => void;
  reset: () => void;
};

const DEFAULT_CONFIG: EditorConfig = {
  autoUploadOnPaste: false, // 默认关闭自动上传
  autoUploadOnDrop: false
};

export const useEditorConfigStore = create<EditorConfigState>()(
  persist(
    (set) => ({
      ...DEFAULT_CONFIG,
      setAutoUploadOnPaste: (enabled) => {
        console.info("[NASGE Config] 设置粘贴自动上传:", enabled);
        set({ autoUploadOnPaste: enabled });
      },
      setAutoUploadOnDrop: (enabled) => {
        console.info("[NASGE Config] 设置拖放自动上传:", enabled);
        set({ autoUploadOnDrop: enabled });
      },
      reset: () => {
        console.info("[NASGE Config] 重置配置");
        set(DEFAULT_CONFIG);
      }
    }),
    {
      name: "nasge-editor-config",
      storage: createJSONStorage(() => localStorage)
    }
  )
);
