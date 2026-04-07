import React, { useEffect, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDialogStore, type BatchRenameImage } from "../stores/useDialogStore";
import { STEAM_IMAGE_SIZE_LIMIT } from "../constants/limits";

const ConfirmDialog: React.FC = () => {
  const { t } = useTranslation('common');
  const state = useDialogStore((s) => s.state);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  if (state.kind !== "confirm") return null;

  const { options, resolve } = state;
  const {
    title = t("confirm"),
    message,
    confirmText = t("confirm"),
    cancelText = t("cancel"),
    danger = false,
  } = options;

  const handleConfirm = () => resolve(true);
  const handleCancel = () => resolve(false);

  return (
    <DialogShell onCancel={handleCancel} autoFocusRef={confirmBtnRef}>
      <h3 className="text-base font-semibold text-text-primary m-0">{title}</h3>
      <p className="text-sm text-text-secondary leading-relaxed mt-1 mb-3 whitespace-pre-wrap">{message}</p>
      <div className="flex justify-end gap-2">
        {cancelText && (
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 rounded-md text-sm font-medium cursor-pointer nasge-transition-quick bg-bg-overlay text-text-secondary border border-border-default hover:bg-bg-hover hover:text-text-primary"
          >
            {cancelText}
          </button>
        )}
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
  const { t } = useTranslation('common');
  const state = useDialogStore((s) => s.state);
  const inputRef = useRef<HTMLInputElement>(null);

  if (state.kind !== "prompt") return null;

  const { options, resolve } = state;
  const {
    title = t("input"),
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
          {t("cancel")}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="px-4 py-2 rounded-md text-sm font-semibold cursor-pointer nasge-transition-quick bg-accent text-bg-app hover:bg-accent-hover border-0"
        >
          {t("ok")}
        </button>
      </div>
    </DialogShell>
  );
};

// ============================================================================
// 批量重命名对话框
// ============================================================================

/**
 * 格式化文件大小
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * 从文件名中提取 basename（不含扩展名）和扩展名
 */
function splitFileName(name: string): { baseName: string; ext: string } {
  const match = name.match(/^(.+?)(\.[^.]+)$/);
  if (match) return { baseName: match[1], ext: match[2] };
  return { baseName: name, ext: "" };
}

const BatchRenameDialog: React.FC = () => {
  const { t } = useTranslation('editor');
  const { t: tc } = useTranslation('common');
  const state = useDialogStore((s) => s.state);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // 初始化每行的 baseName 状态
  const [names, setNames] = useState<Map<string, string>>(new Map());

  // 当 dialog state 变化时重新初始化
  useEffect(() => {
    if (state.kind === "batch-rename") {
      const initial = new Map<string, string>();
      for (const img of state.options.images) {
        const { baseName } = splitFileName(img.currentName);
        initial.set(img.id, baseName);
      }
      setNames(initial);
    }
  }, [state.kind === "batch-rename" ? state.options.images : null]);

  if (state.kind !== "batch-rename") return null;

  const { options, resolve } = state;
  const { images } = options;
  const title = options.title ?? t("image.batchRename.title", { count: images.length });

  const handleConfirm = () => {
    // 只返回合规图片（未超限）的重命名结果
    const validNames = new Map<string, string>();
    for (const [id, name] of names) {
      const img = images.find(i => i.id === id);
      if (img && img.fileSize <= STEAM_IMAGE_SIZE_LIMIT) {
        validNames.set(id, name);
      }
    }
    resolve(validNames);
  };
  const handleCancel = () => resolve(null);

  const updateName = (id: string, value: string) => {
    setNames(prev => {
      const next = new Map(prev);
      next.set(id, value);
      return next;
    });
  };

  return (
    <DialogShell onCancel={handleCancel} autoFocusRef={firstInputRef} width={480}>
      <h3 className="text-base font-semibold text-text-primary m-0">{title}</h3>

      {/* 图片列表 — 可滚动 */}
      <div className="mt-3 mb-3 max-h-[400px] overflow-y-auto space-y-1.5">
        {(() => {
          let firstValidAssigned = false;
          return images.map((img) => {
            const { ext } = splitFileName(img.currentName);
            const isOversize = img.fileSize > STEAM_IMAGE_SIZE_LIMIT;
            // autoFocus 给第一个合规图片
            const assignRef = !isOversize && !firstValidAssigned;
            if (assignRef) firstValidAssigned = true;
            return (
              <BatchRenameRow
                key={img.id}
                image={img}
                ext={ext}
                value={names.get(img.id) ?? ""}
                onChange={(v) => updateName(img.id, v)}
                isOversize={isOversize}
                inputRef={assignRef ? firstInputRef : undefined}
                onSubmit={handleConfirm}
              />
            );
          });
        })()}
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={handleCancel}
          className="px-4 py-2 rounded-md text-sm font-medium cursor-pointer nasge-transition-quick bg-bg-overlay text-text-secondary border border-border-default hover:bg-bg-hover hover:text-text-primary"
        >
          {tc("cancel")}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className="px-4 py-2 rounded-md text-sm font-semibold cursor-pointer nasge-transition-quick bg-accent text-bg-app hover:bg-accent-hover border-0"
        >
          {tc("confirm")}
        </button>
      </div>
    </DialogShell>
  );
};

/**
 * 批量重命名 — 单行
 */
const BatchRenameRow: React.FC<{
  image: BatchRenameImage;
  ext: string;
  value: string;
  onChange: (v: string) => void;
  isOversize: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onSubmit: () => void;
}> = ({ image, ext, value, onChange, isOversize, inputRef, onSubmit }) => {
  const { t } = useTranslation('editor');

  return (
    <div className={`flex items-center gap-2 py-1 ${isOversize ? "opacity-45" : ""}`}>
      {/* 缩略图 */}
      <img
        src={image.thumbnailUrl}
        alt={image.currentName}
        className={`w-10 h-10 rounded object-cover flex-shrink-0 bg-bg-overlay ${isOversize ? "grayscale" : ""}`}
      />

      {/* basename 输入框 */}
      <input
        ref={isOversize ? undefined : inputRef}
        type="text"
        value={isOversize ? image.currentName : value}
        onChange={(e) => { if (!isOversize) onChange(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
        }}
        disabled={isOversize}
        className={`flex-1 min-w-0 px-2 py-1 rounded text-sm border nasge-transition-quick ${
          isOversize
            ? "text-text-muted bg-bg-overlay border-border-default cursor-not-allowed"
            : "text-text-primary bg-bg-input border-border-default focus:border-accent/50 focus:outline-none"
        }`}
      />

      {/* 扩展名标签 */}
      {!isOversize && <span className="text-xs text-text-muted flex-shrink-0">{ext}</span>}

      {/* 文件大小 / 超限提示 */}
      <span
        className={`text-xs flex-shrink-0 min-w-[48px] text-right ${
          isOversize ? "text-danger font-medium" : "text-text-muted"
        }`}
        title={isOversize ? t("image.batchRename.sizeWarning") : undefined}
      >
        {isOversize && (
          <svg className="inline-block w-3 h-3 mr-0.5 -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>
            <path d="M12 9v4"/>
            <path d="M12 17h.01"/>
          </svg>
        )}
        {formatSize(image.fileSize)}
      </span>
    </div>
  );
};

// ============================================================================
// 通用 Shell（backdrop + 居中卡片 + Esc/click-outside）
// ============================================================================

const DialogShell: React.FC<{
  children: React.ReactNode;
  onCancel: () => void;
  autoFocusRef?: React.RefObject<HTMLElement | null>;
  width?: number;
}> = ({ children, onCancel, autoFocusRef, width }) => {
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
        className="bg-bg-surface border border-border-default rounded-lg shadow-2xl px-5 py-4 animate-dialog-enter"
        style={{ width: width ? `${width}px` : '340px' }}
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
      <BatchRenameDialog />
    </>
  );
};

export default DialogContainer;
