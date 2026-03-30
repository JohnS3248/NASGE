import React, { useEffect, useRef, useCallback } from "react";
import { useToastStore } from "../stores/useToastStore";

// ============================================================================
// 类型色板 — Tailwind 动态类映射
// ============================================================================

const TYPE_STYLES = {
  success: { bar: "bg-success",  bg: "bg-success/12" },
  error:   { bar: "bg-danger",   bg: "bg-danger/12" },
  warning: { bar: "bg-warning",  bg: "bg-warning/10" },
  info:    { bar: "bg-accent",   bg: "bg-accent/10" },
} as const;

// ============================================================================
// 单条 Toast
// ============================================================================

const ToastItem: React.FC<{ toast: {
  id: string;
  type: "success" | "error" | "warning" | "info";
  message: string;
  duration: number;
  exiting: boolean;
} }> = ({ toast }) => {
  const { startExit, removeToast } = useToastStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef(toast.duration);
  const startTimeRef = useRef(Date.now());
  const styles = TYPE_STYLES[toast.type];

  const scheduleExit = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      startExit(toast.id);
      // 退场动画 150ms 后移除
      setTimeout(() => removeToast(toast.id), 150);
    }, remainingRef.current);
  }, [toast.id, startExit, removeToast]);

  const pauseTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const elapsed = Date.now() - startTimeRef.current;
    remainingRef.current = Math.max(0, remainingRef.current - elapsed);
  }, []);

  const resumeTimer = useCallback(() => {
    scheduleExit();
  }, [scheduleExit]);

  // 启动计时器
  useEffect(() => {
    scheduleExit();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [scheduleExit]);

  // 手动关闭
  const handleClose = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    startExit(toast.id);
    setTimeout(() => removeToast(toast.id), 150);
  }, [toast.id, startExit, removeToast]);

  // 渲染多行消息
  const lines = toast.message.split("\n");

  return (
    <div
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
      className={`flex items-stretch ${styles.bg} backdrop-blur-[12px] border border-white/6 rounded-lg overflow-hidden shadow-lg max-w-[420px] min-w-[280px] pointer-events-auto ${toast.exiting ? "animate-toast-exit" : "animate-toast-enter"}`}
    >
      {/* 左侧色条 */}
      <div className={`w-1 shrink-0 ${styles.bar}`} />

      {/* 内容 */}
      <div className="flex-1 px-4 py-3 flex flex-col gap-0.5">
        {lines.map((line, i) => (
          <span
            key={i}
            className="text-[0.95rem] leading-[1.45] text-[rgba(230,238,250,0.92)] break-words"
          >
            {line}
          </span>
        ))}
      </div>

      {/* 关闭按钮 */}
      <button
        type="button"
        onClick={handleClose}
        className="bg-transparent border-none text-[rgba(200,215,235,0.5)] hover:text-[rgba(230,238,250,0.9)] cursor-pointer px-2.5 text-base shrink-0 flex items-center transition-colors duration-150"
      >
        ✕
      </button>
    </div>
  );
};

// ============================================================================
// 容器
// ============================================================================

const ToastContainer: React.FC = () => {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-6 top-4 z-[10000] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
};

export default ToastContainer;
