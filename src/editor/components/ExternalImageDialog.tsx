/**
 * 插入外链图片弹窗
 * URL 输入 + 本地预览 + Steam 端可用性验证 + HTTPS 校验
 */
import React, { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { verifySteamImageUrl, type VerifySteamImageUrlResult } from "../services/steamBridge";
import { simulateSteamUrlTruncation, type SteamUrlAnalysis } from "../utils/steamUrlTruncation";

type PreviewStatus = "idle" | "loading" | "success" | "error";
type SteamStatus = "idle" | "checking" | "available" | "unavailable";

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
  const [steamStatus, setSteamStatus] = useState<SteamStatus>("idle");
  const [steamSize, setSteamSize] = useState<{ width: number; height: number } | null>(null);
  const [steamAnalysis, setSteamAnalysis] = useState<SteamUrlAnalysis | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 打开时重置
  useEffect(() => {
    if (visible) {
      setUrl("https://");
      setPreviewStatus("idle");
      setSteamStatus("idle");
      setSteamSize(null);
      setSteamAnalysis(null);
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

  // URL 变化时 debounce 触发本地预览 + Steam 验证
  const handleUrlChange = useCallback((value: string) => {
    setUrl(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = value.trim();
    if (!trimmed.startsWith("https://") || trimmed.length <= 10) {
      setPreviewStatus("idle");
      setSteamStatus("idle");
      setSteamSize(null);
      setSteamAnalysis(null);
      return;
    }

    // 立即本地算截断（同步、便宜）
    const analysis = simulateSteamUrlTruncation(trimmed);
    setSteamAnalysis(analysis);

    debounceRef.current = setTimeout(() => {
      // 触发本地预览（用截断后的 URL）
      setPreviewStatus("loading");
      setPreviewKey((k) => k + 1);

      // 触发 Steam 端验证（probe 也走截断后的 URL）
      setSteamStatus("checking");
      setSteamSize(null);
      verifySteamImageUrl(trimmed).then((result: VerifySteamImageUrlResult) => {
        setSteamAnalysis(result);
        if (result.available) {
          setSteamStatus("available");
          if (result.width && result.height) {
            setSteamSize({ width: result.width, height: result.height });
          }
        } else {
          setSteamStatus("unavailable");
        }
      }).catch(() => {
        setSteamStatus("unavailable");
      });
    }, 500);
  }, []);

  const canInsert =
    url.trim().startsWith("https://") &&
    url.trim().length > 10 &&
    steamStatus === "available";

  const handleConfirm = useCallback(() => {
    if (!canInsert) return;
    onConfirm(url.trim());
  }, [canInsert, url, onConfirm]);

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
          className="mt-3 rounded-md border border-border-default bg-bg-overlay overflow-hidden"
          style={{ width: PREVIEW_WIDTH }}
        >
          {/* 图片预览 */}
          <div
            className="flex items-center justify-center"
            style={{ maxHeight: PREVIEW_MAX_HEIGHT }}
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
                  src={steamAnalysis?.truncated || url.trim()}
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

          {/* Steam 可用性验证结果条 — 4 层状态 */}
          {steamStatus !== "idle" && (() => {
            const hasDanger = !!steamAnalysis?.dangerousChars.length;
            const hasDroppedQuery = !!steamAnalysis?.droppedQuery;
            const hasDroppedHash = !!steamAnalysis?.droppedHash;
            const isWarn = steamStatus === "available" && (hasDanger || hasDroppedQuery || hasDroppedHash);
            const tone =
              steamStatus === "checking"
                ? "checking"
                : steamStatus === "unavailable"
                  ? "error"
                  : isWarn
                    ? "warn"
                    : "ok";
            const toneClass =
              tone === "ok"
                ? "bg-[rgba(76,175,80,0.1)] border-[rgba(76,175,80,0.2)] text-[#81c784]"
                : tone === "error"
                  ? "bg-[rgba(244,67,54,0.1)] border-[rgba(244,67,54,0.2)] text-[#e57373]"
                  : "bg-[rgba(255,183,77,0.08)] border-[rgba(255,183,77,0.15)] text-[#ffb74d]";
            const message = (() => {
              if (steamStatus === "checking") return t("externalImage.steamChecking");
              if (steamStatus === "unavailable") return t("externalImage.steamUnavailable");
              if (hasDanger) {
                return t("externalImage.steamTruncated", {
                  char: steamAnalysis!.dangerousChars[0],
                  truncated: steamAnalysis!.truncated
                });
              }
              if (hasDroppedQuery) {
                return t("externalImage.steamDroppedQuery", { truncated: steamAnalysis!.truncated });
              }
              if (hasDroppedHash) {
                return t("externalImage.steamDroppedHash", { truncated: steamAnalysis!.truncated });
              }
              return t("externalImage.steamAvailable") + (steamSize ? ` (${steamSize.width}x${steamSize.height})` : "");
            })();
            return (
              <div className={`flex items-start gap-1.5 px-3 py-1.5 text-xs border-t ${toneClass}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                  {tone === "ok" ? (
                    <path d="M20 6 9 17l-5-5" />
                  ) : tone === "error" ? (
                    <>
                      <circle cx="12" cy="12" r="10" />
                      <path d="m4.9 4.9 14.2 14.2" />
                    </>
                  ) : tone === "warn" ? (
                    <>
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </>
                  ) : (
                    <>
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 6v6l4 2" />
                    </>
                  )}
                </svg>
                <span className="break-all">{message}</span>
              </div>
            );
          })()}
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
            disabled={!canInsert}
            className={`px-4 py-2 rounded-md text-sm font-semibold cursor-pointer nasge-transition-quick border-0 ${
              canInsert
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
