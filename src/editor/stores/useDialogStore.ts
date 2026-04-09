import { create } from "zustand";

// ============================================================================
// 类型定义
// ============================================================================

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface PromptOptions {
  title?: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  /** 多行模式：渲染为 textarea。默认 false（单行 input） */
  multiline?: boolean;
  /** 多行模式下的行数。默认 12 */
  rows?: number;
  /** 对话框宽度（px）。默认：单行 340，多行 720 */
  width?: number;
  /** 字符数限制提示（不强制阻止输入，仅用于显示和超限红色提示） */
  maxLength?: number;
}

export interface BatchRenameImage {
  id: string;           // fileName
  currentName: string;  // 含扩展名
  fileSize: number;     // 字节
  thumbnailUrl: string;
}

export interface BatchRenameOptions {
  title?: string;
  images: BatchRenameImage[];
}

type DialogState =
  | { kind: "idle" }
  | { kind: "confirm"; options: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (v: string | null) => void }
  | { kind: "batch-rename"; options: BatchRenameOptions; resolve: (v: Map<string, string> | null) => void };

interface DialogStore {
  state: DialogState;
  open: (state: DialogState) => void;
  close: () => void;
}

// ============================================================================
// Store
// ============================================================================

export const useDialogStore = create<DialogStore>((set) => ({
  state: { kind: "idle" },

  open: (state) => set({ state }),

  close: () => set({ state: { kind: "idle" } }),
}));

// ============================================================================
// 便捷函数（可在 React 外使用）
// ============================================================================

export const dialog = {
  confirm: (opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      useDialogStore.getState().open({
        kind: "confirm",
        options: opts,
        resolve: (v) => {
          useDialogStore.getState().close();
          resolve(v);
        },
      });
    });
  },

  prompt: (opts: PromptOptions): Promise<string | null> => {
    return new Promise((resolve) => {
      useDialogStore.getState().open({
        kind: "prompt",
        options: opts,
        resolve: (v) => {
          useDialogStore.getState().close();
          resolve(v);
        },
      });
    });
  },

  batchRename: (opts: BatchRenameOptions): Promise<Map<string, string> | null> => {
    return new Promise((resolve) => {
      useDialogStore.getState().open({
        kind: "batch-rename",
        options: opts,
        resolve: (v) => {
          useDialogStore.getState().close();
          resolve(v);
        },
      });
    });
  },
};
