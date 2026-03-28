import React, { useEffect, useRef, useCallback } from "react";
import { useToastStore } from "../stores/useToastStore";

// ============================================================================
// 类型色板
// ============================================================================

const TYPE_COLORS = {
  success: { accent: "#5ba32b", bg: "rgba(91,163,43,0.12)" },
  error:   { accent: "#D94126", bg: "rgba(217,65,38,0.12)" },
  warning: { accent: "#FFC82C", bg: "rgba(255,200,44,0.10)" },
  info:    { accent: "#66c0f4", bg: "rgba(102,192,244,0.10)" },
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
  const colors = TYPE_COLORS[toast.type];

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
      style={{
        display: "flex",
        alignItems: "stretch",
        background: colors.bg,
        backdropFilter: "blur(12px)",
        border: `1px solid rgba(255,255,255,0.06)`,
        borderRadius: "0.5rem",
        overflow: "hidden",
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        maxWidth: "360px",
        minWidth: "240px",
        animation: toast.exiting
          ? "nasge-toast-exit 150ms ease-in forwards"
          : "nasge-toast-enter 250ms cubic-bezier(0.16,1,0.3,1) forwards",
        pointerEvents: "auto",
      }}
    >
      {/* 左侧色条 */}
      <div style={{
        width: "4px",
        flexShrink: 0,
        background: colors.accent,
      }} />

      {/* 内容 */}
      <div style={{
        flex: 1,
        padding: "0.65rem 0.75rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.15rem",
      }}>
        {lines.map((line, i) => (
          <span
            key={i}
            style={{
              fontSize: "0.84rem",
              lineHeight: 1.45,
              color: "rgba(230,238,250,0.92)",
              wordBreak: "break-word",
            }}
          >
            {line}
          </span>
        ))}
      </div>

      {/* 关闭按钮 */}
      <button
        type="button"
        onClick={handleClose}
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(200,215,235,0.5)",
          cursor: "pointer",
          padding: "0 0.6rem",
          fontSize: "1rem",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          transition: "color 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "rgba(230,238,250,0.9)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "rgba(200,215,235,0.5)";
        }}
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
    <>
      <style>{`
        @keyframes nasge-toast-enter {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes nasge-toast-exit {
          from { opacity: 1; }
          to   { opacity: 0; }
        }
      `}</style>
      <div
        style={{
          position: "fixed",
          right: "1.5rem",
          bottom: "6rem",
          zIndex: 10000,
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </div>
    </>
  );
};

export default ToastContainer;
