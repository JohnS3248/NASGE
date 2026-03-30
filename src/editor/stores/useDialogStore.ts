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
}

type DialogState =
  | { kind: "idle" }
  | { kind: "confirm"; options: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (v: string | null) => void };

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
};
