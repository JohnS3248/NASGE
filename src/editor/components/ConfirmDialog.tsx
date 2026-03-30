import React, { useEffect, useCallback, useRef } from "react";
import { useDialogStore } from "../stores/useDialogStore";

const ConfirmDialog: React.FC = () => {
  const state = useDialogStore((s) => s.state);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  if (state.kind !== "confirm") return null;

  const { options, resolve } = state;
  const {
    title = "确认",
    message,
    confirmText = "确认",
    cancelText = "取消",
    danger = false,
  } = options;

  const handleConfirm = () => resolve(true);
  const handleCancel = () => resolve(false);

  return (
    <DialogShell onCancel={handleCancel} autoFocusRef={confirmBtnRef}>
      <h3 className="text-base font-semibold text-text-primary m-0">{title}</h3>
      <p className="text-sm text-text-secondary leading-relaxed mt-1 mb-3 whitespace-pre-wrap">{message}</p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={handleCancel}
          className="px-4 py-2 rounded-md text-sm font-medium cursor-pointer nasge-transition-quick bg-bg-overlay text-text-secondary border border-border-default hover:bg-bg-hover hover:text-text-primary"
        >
          {cancelText}
        </button>
        <button
          ref={confirmBtnRef}
          type="button"
          onClick={handleConfirm}
          className={`px-4 py-2 rounded-md text-sm font-semibold cursor-pointer nasge-transition-quick border-0 ${
            danger
              ? "bg-danger text-white hover:bg-danger/80"
              : "bg-accent text-bg-app hover:bg-accent-hover"
          }`}
        >
          {confirmText}
        </button>
      </div>
    </DialogShell>
  );
};

const PromptDialog: React.FC = () => {
  const state = useDialogStore((s) => s.state);
  const inputRef = useRef<HTMLInputElement>(null);

  if (state.kind !== "prompt") return null;

  const { options, resolve } = state;
  const {
    title = "输入",
    message,
    defaultValue = "",
    placeholder = "",
  } = options;

  const handleSubmit = () => {
    const value = inputRef.current?.value ?? "";
    resolve(value);
  };

  const handleCancel = () => resolve(null);

  return (
    <DialogShell onCancel={handleCancel} autoFocusRef={inputRef}>
      <h3 className="text-base font-semibold text-text-primary m-0">{title}</h3>
      <p className="text-sm text-text-secondary leading-relaxed mt-1 mb-2 whitespace-pre-wrap">{message}</p>
      <input
        ref={inputRef}
        type="text"
        defaultValue={defaultValue}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
        }}
        className="w-full px-3 py-1.5 rounded text-sm text-text-primary bg-bg-input border border-border-default focus:border-accent/50 focus:outline-none mb-3 nasge-transition-quick"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={handleCancel}
          className="px-4 py-2 rounded-md text-sm font-medium cursor-pointer nasge-transition-quick bg-bg-overlay text-text-secondary border border-border-default hover:bg-bg-hover hover:text-text-primary"
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="px-4 py-2 rounded-md text-sm font-semibold cursor-pointer nasge-transition-quick bg-accent text-bg-app hover:bg-accent-hover border-0"
        >
          确定
        </button>
      </div>
    </DialogShell>
  );
};

// ============================================================================
// 通用 Shell（backdrop + 居中卡片 + Esc/click-outside）
// ============================================================================

const DialogShell: React.FC<{
  children: React.ReactNode;
  onCancel: () => void;
  autoFocusRef?: React.RefObject<HTMLElement | null>;
}> = ({ children, onCancel, autoFocusRef }) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc 键关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  // 自动 focus
  useEffect(() => {
    // 延迟 focus 以等待渲染完成
    const timer = setTimeout(() => {
      if (autoFocusRef?.current) {
        autoFocusRef.current.focus();
        // 如果是 input，选中全部文本
        if (autoFocusRef.current instanceof HTMLInputElement) {
          autoFocusRef.current.select();
        }
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [autoFocusRef]);

  // 点击 backdrop 关闭
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onCancel();
      }
    },
    [onCancel]
  );

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/65 animate-dialog-backdrop"
      onClick={handleBackdropClick}
    >
      <div
        ref={panelRef}
        className="bg-bg-surface border border-border-default rounded-lg shadow-2xl px-5 py-4 w-[340px] animate-dialog-enter"
      >
        {children}
      </div>
    </div>
  );
};

// ============================================================================
// 统一导出：在 App 中挂载这一个组件即可
// ============================================================================

const DialogContainer: React.FC = () => {
  return (
    <>
      <ConfirmDialog />
      <PromptDialog />
    </>
  );
};

export default DialogContainer;
