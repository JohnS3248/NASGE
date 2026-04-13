import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMountTransition } from "../hooks/useMountTransition";
import { useEditorConfigStore } from "../stores/useEditorConfigStore";
import { resolveLocale } from "../../i18n";
import { CHANGELOG } from "../changelog/data";

// ============================================================================
// SVG icons
// ============================================================================

const XIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
  </svg>
);

// ============================================================================
// ChangelogModal
// ============================================================================

type ChangelogModalProps = {
  visible: boolean;
  onClose: () => void;
};

export const ChangelogModal: React.FC<ChangelogModalProps> = ({
  visible,
  onClose,
}) => {
  const { t } = useTranslation("settings");
  const shouldRender = useMountTransition(visible, 150);
  const locale = useEditorConfigStore((s) => s.locale);
  const isZh = resolveLocale(locale).startsWith("zh");

  // Escape to close
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible, onClose]);

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed inset-0 bg-black/65 z-[9990] flex items-center justify-center ${
        visible ? "animate-modal-backdrop" : "opacity-0 transition-opacity duration-[150ms]"
      }`}
      onClick={onClose}
    >
      <div
        className={`bg-bg-surface border border-border-accent rounded-lg shadow-2xl w-[560px] max-w-[90vw] max-h-[80vh] flex flex-col ${
          visible ? "animate-modal-enter" : "opacity-0 scale-95 transition-all duration-[150ms]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-[15px] font-semibold text-text-primary">
              {t("changelog.title")}
            </span>
            {CHANGELOG[0] && (
              <span className="text-[11px] font-medium text-accent bg-accent-muted px-1.5 py-0.5 rounded">
                v{CHANGELOG[0].version}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover nasge-transition-quick cursor-pointer border-0 bg-transparent"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {CHANGELOG.map((entry) => (
            <div key={entry.version}>
              {/* Version + date */}
              <div className="text-xs text-text-muted mb-3">
                {isZh ? entry.dateZh : entry.dateEn}
              </div>

              {entry.sections.map((section) => (
                <div key={section.titleEn} className="mb-4">
                  <h4 className="text-[13px] font-semibold text-text-primary mb-2">
                    {isZh ? section.titleZh : section.titleEn}
                  </h4>
                  <ul className="list-none m-0 p-0 flex flex-col gap-1.5">
                    {section.items.map((item, i) => (
                      <li
                        key={i}
                        className="text-[12.5px] leading-relaxed text-text-secondary pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-text-muted"
                      >
                        {isZh ? item.zh : item.en}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
