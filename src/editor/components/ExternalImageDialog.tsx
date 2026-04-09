/**
 * 插入外链图片弹窗
 * URL 输入 + 图片预览 + HTTPS 校验
 */
import React, { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";

type PreviewStatus = "idle" | "loading" | "success" | "error";

// 预览区尺寸
const PREVIEW_WIDTH = 480;
const PREVIEW_MAX_HEIGHT = 300;

interface ExternalImageDialogProps {
  visible: boolean;
  onConfirm: (url: string) => void;
  onCancel: () => void;
}

const ExternalImageDialog: React.FC<ExternalImageDialogProps> = ({
  visible,
  onConfirm,
  onCancel
}) => {
  const { t } = useTranslation("editor");
  const { t: tc } = useTranslation("common");
  const [url, setUrl] = useState("https://");
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const [previewKey, setPreviewKey] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 打开时重置
  useEffect(() => {
    if (visible) {
      setUrl("https://");
      setPreviewStatus("idle");
      setPreviewKey(0);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  // Esc 关闭
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [visible, onCancel]);

  const isValidUrl = url.trim().startsWith("https://") && url.trim().length > 10;

  // URL 变化时 debounce 触发预览
  const handleUrlChange = useCallback((value: string) => {
    setUrl(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = value.trim();
    if (!trimmed.startsWith("https://") || trimmed.length <= 10) {
      setPreviewStatus("idle");
      return;
    }

    debounceRef.current = setTimeout(() => {
      setPreviewStatus("loading");
      setPreviewKey((k) => k + 1);
    }, 500);
  }, []);

  const handleConfirm = useCallback(() => {
    const trimmed = url.trim();
    if (trimmed.startsWith("https://") && trimmed.length > 10) {
      onConfirm(trimmed);
    }
  }, [url, onConfirm]);

  // 禁止点击 backdrop 关闭
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
    },
    []
  );

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/65 animate-dialog-backdrop"
      onClick={handleBackdropClick}
    >
      <div
        ref={panelRef}
        className="bg-bg-surface border border-border-default rounded-lg shadow-2xl px-5 py-4 animate-dialog-enter"
        style={{ width: PREVIEW_WIDTH + 40 }}
      >
        {/* 标题 */}
        <h3 className="text-base font-semibold text-text-primary m-0">
          {t("externalImage.title")}
        </h3>

        {/* URL 输入 */}
        <textarea
          ref={inputRef}
          value={url}
          onChange={(e) => handleUrlChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleConfirm();
            }
          }}
          placeholder="https://example.com/image.png"
          rows={2}
          className="w-full mt-3 px-3 py-2 rounded-md text-sm font-mono bg-bg-input border border-border-default text-text-primary resize-none focus:border-accent/50 focus:outline-none nasge-transition-quick"
        />

        {/* 预览区 */}
        <div
          className="mt-3 rounded-md border border-border-default bg-bg-overlay flex items-center justify-center overflow-hidden"
          style={{ width: PREVIEW_WIDTH, maxHeight: PREVIEW_MAX_HEIGHT }}
        >
          {previewStatus === "idle" || !isValidUrl ? (
            <div className="py-8">
              <span className="text-xs text-text-muted">
                {t("externalImage.previewHint")}
              </span>
            </div>
          ) : (
            <div className="relative w-full flex items-center justify-center" style={{ minHeight: 80 }}>
              <img
                key={previewKey}
                src={url.trim()}
                alt="preview"
                style={{ maxWidth: PREVIEW_WIDTH, maxHeight: PREVIEW_MAX_HEIGHT }}
                className={`object-contain ${previewStatus === "success" ? "block" : "hidden"}`}
                onLoad={() => setPreviewStatus("success")}
                onError={() => setPreviewStatus("error")}
              />
              {previewStatus === "loading" && (
                <span className="text-xs text-text-muted animate-pulse py-8">
                  {t("externalImage.loading")}
                </span>
              )}
              {previewStatus === "error" && (
                <span className="text-xs text-danger py-8">
                  {t("externalImage.loadFailed")}
                </span>
              )}
            </div>
          )}
        </div>

        {/* 提示 */}
        <p className="text-xs text-text-muted mt-2 mb-3 leading-relaxed">
          {t("externalImage.hint")}
        </p>

        {/* 按钮 */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-md text-sm font-medium cursor-pointer nasge-transition-quick bg-bg-overlay text-text-secondary border border-border-default hover:bg-bg-hover hover:text-text-primary"
          >
            {tc("cancel")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isValidUrl}
            className={`px-4 py-2 rounded-md text-sm font-semibold cursor-pointer nasge-transition-quick border-0 ${
              isValidUrl
                ? "bg-accent text-bg-app hover:bg-accent-hover"
                : "bg-accent/30 text-text-muted cursor-not-allowed"
            }`}
          >
            {t("externalImage.insert")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExternalImageDialog;
