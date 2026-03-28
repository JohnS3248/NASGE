import { create } from "zustand";

// ============================================================================
// 类型定义
// ============================================================================

type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  createdAt: number;
  duration: number;
  exiting: boolean;
}

interface ToastState {
  toasts: ToastItem[];
  addToast: (type: ToastType, message: string, duration?: number) => void;
  startExit: (id: string) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

// ============================================================================
// 默认时长
// ============================================================================

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 3000,
  info: 3000,
  warning: 5000,
  error: 6000,
};

const MAX_TOASTS = 5;

let idCounter = 0;

// ============================================================================
// Store
// ============================================================================

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (type, message, duration) => {
    const id = `toast-${++idCounter}-${Date.now()}`;
    const newToast: ToastItem = {
      id,
      type,
      message,
      createdAt: Date.now(),
      duration: duration ?? DEFAULT_DURATIONS[type],
      exiting: false,
    };

    set((state) => {
      let next = [...state.toasts, newToast];
      // 超出上限时移除最老的
      while (next.length > MAX_TOASTS) {
        next.shift();
      }
      return { toasts: next };
    });
  },

  startExit: (id) => {
    set((state) => ({
      toasts: state.toasts.map((t) =>
        t.id === id ? { ...t, exiting: true } : t
      ),
    }));
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearAll: () => {
    set({ toasts: [] });
  },
}));

// ============================================================================
// 便捷函数（可在 React 外使用）
// ============================================================================

export const toast = {
  success: (msg: string, duration?: number) =>
    useToastStore.getState().addToast("success", msg, duration),
  error: (msg: string, duration?: number) =>
    useToastStore.getState().addToast("error", msg, duration),
  warning: (msg: string, duration?: number) =>
    useToastStore.getState().addToast("warning", msg, duration),
  info: (msg: string, duration?: number) =>
    useToastStore.getState().addToast("info", msg, duration),
};
