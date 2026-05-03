/**
 * WholeGuideHeader — 全篇模式面包屑栏
 *
 * 复用旧 EditorHeader 的 Tailwind class，数据源接 useWholeGuideStore。
 * 集成全局设置按钮（SettingsModal）。
 *
 * 数据：guideId / guideTitle / chapters.length
 * 操作按钮（右侧）：切换回章节模式 / 审阅并上传 / 上传到 Steam / 设置
 */

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useWholeGuideStore } from "../stores/useWholeGuideStore";
import { SettingsModal } from "./SettingsModal";
import WholeBackupModal from "./WholeBackupModal";

const BreadcrumbSep: React.FC = () => (
  <span className="text-text-muted text-xs select-none mx-1.5">/</span>
);

const SettingsIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export interface WholeGuideHeaderProps {
  /** 路由参数中的 guideId（用作 fallback 显示） */
  paramGuideId: string | undefined;
  /** "切换回章节模式" 按钮回调 */
  onExitToOldMode: () => void;
  /** "审阅并上传" 按钮回调（navigate 到 review 子路由，审阅页待实现） */
  onReview: () => void;
  /** "上传到 Steam" 直传按钮回调（不进审阅页，直接 push） */
  onPushDirect: () => void;
}

const WholeGuideHeader: React.FC<WholeGuideHeaderProps> = ({
  paramGuideId,
  onExitToOldMode,
  onReview,
  onPushDirect,
}) => {
  const { t } = useTranslation("editor");
  const guideId = useWholeGuideStore((s) => s.guideId);
  const guideTitle = useWholeGuideStore((s) => s.guideTitle);
  const chapterCount = useWholeGuideStore((s) => s.chapters.length);
  const status = useWholeGuideStore((s) => s.status);

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [backupVisible, setBackupVisible] = useState(false);

  const effectiveGuideId = guideId ?? paramGuideId ?? "";
  const subtitle = effectiveGuideId
    ? t("header.guideInfo", {
        id: effectiveGuideId,
        count: chapterCount,
      })
    : t("header.guideConnecting", { defaultValue: "正在加载…" });

  const isBusy = status === "pulling" || status === "pushing";

  return (
    <>
      <header
        data-tour="whole-guide-header"
        className="
          flex items-center gap-3 px-5 py-3
          rounded-lg
          bg-bg-surface border border-border-default
          shadow-panel
        "
      >
        {/* 左：品牌 + 面包屑 */}
        <div className="flex items-center gap-0 min-w-0 flex-1">
          <span
            className="
              text-sm font-semibold tracking-wide text-text-secondary
              select-none shrink-0
            "
          >
            NASGE
          </span>

          <BreadcrumbSep />

          {/* 模式徽标：全篇编辑 — 用 accent 蓝点 */}
          <span
            className="
              inline-flex items-center gap-1.5 shrink-0
              text-xs font-medium text-text-secondary
            "
          >
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            {t("wholeGuide.modeName")}
          </span>

          <BreadcrumbSep />

          {/* 标题 / 描述 */}
          <span
            className="text-sm text-text-primary truncate"
            title={subtitle}
          >
            {guideTitle || subtitle}
          </span>

          {chapterCount > 0 && (
            <span className="text-xs text-text-muted ml-1.5 shrink-0">
              · {chapterCount} {t("header.chaptersUnit")}
            </span>
          )}
        </div>

        {/* 右：操作按钮 + 设置 */}
        <div className="flex items-center gap-2 shrink-0">
          {/* 切换回章节模式 */}
          <button
            type="button"
            onClick={onExitToOldMode}
            className="
              flex items-center px-2.5 py-1.5
              rounded-md border border-border-default
              bg-transparent
              text-xs text-text-secondary
              hover:text-text-primary hover:border-border-accent hover:bg-accent-subtle
              nasge-transition-quick cursor-pointer
            "
          >
            {t("wholeGuide.exitToOldMode")}
          </button>

          {/* 审阅并上传 — 审阅页待实现 */}
          <button
            type="button"
            onClick={onReview}
            disabled={isBusy}
            className={`
              flex items-center px-2.5 py-1.5
              rounded-md border border-border-default
              bg-accent-subtle
              text-xs font-medium text-accent
              hover:border-border-accent hover:bg-accent-muted
              nasge-transition-quick
              ${isBusy ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            `}
          >
            {t("wholeGuide.review")}
          </button>

          {/* 上传到 Steam 直传（不进审阅页） */}
          <button
            type="button"
            onClick={onPushDirect}
            disabled={isBusy}
            className={`
              flex items-center px-2.5 py-1.5
              rounded-md border border-border-default
              bg-transparent
              text-xs text-text-secondary
              hover:text-text-primary hover:border-border-accent hover:bg-accent-subtle
              nasge-transition-quick
              ${isBusy ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            `}
            title={t("upload.toSteam")}
          >
            {t("upload.toSteam")}
          </button>

          {/* 备份与存档 */}
          <button
            type="button"
            onClick={() => setBackupVisible(true)}
            className="
              flex items-center px-2.5 py-1.5
              rounded-md border border-border-default
              bg-transparent
              text-xs text-text-secondary
              hover:text-text-primary hover:border-border-accent hover:bg-accent-subtle
              nasge-transition-quick cursor-pointer
            "
            title={t("wholeGuide.backup.title")}
          >
            {t("wholeGuide.backup.openButton")}
          </button>

          {/* 设置按钮（全局） */}
          <button
            type="button"
            data-tour="settings-button"
            onClick={() => setSettingsVisible(true)}
            className="
              w-8 h-8 flex items-center justify-center
              rounded-md border border-border-default
              bg-transparent text-text-muted
              hover:text-text-primary hover:border-border-accent hover:bg-accent-subtle
              nasge-transition-quick cursor-pointer
            "
            title={t("common:settings", { defaultValue: "设置" })}
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        </div>
      </header>

      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
      />
      <WholeBackupModal
        visible={backupVisible}
        onClose={() => setBackupVisible(false)}
      />
    </>
  );
};

export default WholeGuideHeader;
