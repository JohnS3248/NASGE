import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useReviewStore } from "../stores/useReviewStore";
import { useDraftStore } from "../stores/useDraftStore";
import { useGuideStore, isOnlineMode } from "../stores/useGuideStore";
import { toast } from "../stores/useToastStore";
import { htmlToBBCode } from "../utils/bbcode";
import { submitReview } from "../services/reviewBridge";

const ThumbUpIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 10v12" />
    <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88" />
  </svg>
);

const ThumbDownIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 14V2" />
    <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88" />
  </svg>
);

type ReviewSettingsPanelProps = {
  currentHtml: string;
};

const ReviewSettingsPanel: React.FC<ReviewSettingsPanelProps> = ({ currentHtml }) => {
  const { t } = useTranslation('editor');
  const mode = useGuideStore((s) => s.mode);
  const settings = useReviewStore((s) => s.settings);
  const gameName = useReviewStore((s) => s.gameName);
  const hasExistingReview = useReviewStore((s) => s.hasExistingReview);
  const updateSettings = useReviewStore((s) => s.updateSettings);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const online = isOnlineMode(mode);

  const handleSubmit = useCallback(async () => {
    // 跨游戏提交安全检查
    const activeDraft = useDraftStore.getState().drafts.find(
      (d) => d.id === useDraftStore.getState().activeDraftId
    );
    const currentAppId = useReviewStore.getState().appId;
    if (activeDraft?.linkedAppId && currentAppId && activeDraft.linkedAppId !== currentAppId) {
      toast.error(t('review.gameMismatch', { game: activeDraft.linkedAppName || activeDraft.linkedAppId }));
      return;
    }

    if (settings.ratedUp === null) {
      toast.warning(t('review.selectRating'));
      return;
    }
    if (!currentHtml) {
      toast.error(t('review.emptyContent'));
      return;
    }

    const bbcode = htmlToBBCode(currentHtml);
    setIsSubmitting(true);
    try {
      const result = await submitReview({
        comment: bbcode,
        rated_up: settings.ratedUp,
        is_public: settings.visibility === "public",
        language: settings.language,
        received_compensation: settings.receivedCompensation ? 1 : 0,
        disable_comments: settings.enableComments ? 0 : 1,
      });
      toast.success(result.created ? t('review.publishSuccess') : t('review.updateSuccess'));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(t('review.submitFail', { message: msg }));
    } finally {
      setIsSubmitting(false);
    }
  }, [currentHtml, settings, t]);

  return (
    <div className="flex flex-col gap-3 p-4 rounded-lg bg-bg-surface border border-border-default shadow-panel min-w-56">
      {/* 标题 */}
      <div className="text-sm font-semibold text-text-primary">
        {t('review.settings')}
      </div>
      {gameName && (
        <div className="text-xs text-text-muted truncate" title={gameName}>
          {gameName}
        </div>
      )}

      {/* 推荐/不推荐 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => updateSettings({ ratedUp: true })}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium cursor-pointer nasge-transition-quick border
            ${settings.ratedUp === true
              ? "bg-accent/20 text-accent border-accent/40"
              : "bg-transparent text-text-secondary border-border-default hover:bg-bg-hover hover:text-text-primary"
            }`}
        >
          <ThumbUpIcon className="w-4 h-4" />
          {t('review.recommend')}
        </button>
        <button
          type="button"
          onClick={() => updateSettings({ ratedUp: false })}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium cursor-pointer nasge-transition-quick border
            ${settings.ratedUp === false
              ? "bg-danger/20 text-danger border-danger/40"
              : "bg-transparent text-text-secondary border-border-default hover:bg-bg-hover hover:text-text-primary"
            }`}
        >
          <ThumbDownIcon className="w-4 h-4" />
          {t('review.notRecommend')}
        </button>
      </div>

      {/* 分隔线 */}
      <div className="h-px bg-border-subtle" />

      {/* 可见性 */}
      <label className="flex items-center justify-between text-xs text-text-secondary">
        <span>{t('review.visibility')}</span>
        <select
          value={settings.visibility}
          onChange={(e) => updateSettings({ visibility: e.target.value as "public" | "friends" })}
          className="bg-bg-overlay border border-border-default rounded px-2 py-1 text-xs text-text-primary cursor-pointer"
        >
          <option value="public">{t('review.public')}</option>
          <option value="friends">{t('review.friendsOnly')}</option>
        </select>
      </label>

      {/* 语言 */}
      <label className="flex items-center justify-between text-xs text-text-secondary">
        <span>{t('review.language')}</span>
        <select
          value={settings.language}
          onChange={(e) => updateSettings({ language: e.target.value })}
          className="bg-bg-overlay border border-border-default rounded px-2 py-1 text-xs text-text-primary cursor-pointer"
        >
          <option value="schinese">简体中文</option>
          <option value="tchinese">繁体中文</option>
          <option value="english">English</option>
          <option value="japanese">日本語</option>
          <option value="koreana">한국어</option>
        </select>
      </label>

      {/* 分隔线 */}
      <div className="h-px bg-border-subtle" />

      {/* 复选框 */}
      <Checkbox
        label={t('review.allowComments')}
        checked={settings.enableComments}
        onChange={(v) => updateSettings({ enableComments: v })}
      />
      <Checkbox
        label={t('review.showSpecs')}
        checked={settings.attachHardware}
        onChange={(v) => updateSettings({ attachHardware: v })}
      />
      <Checkbox
        label={t('review.freeProduct')}
        checked={settings.receivedCompensation}
        onChange={(v) => updateSettings({ receivedCompensation: v })}
      />

      {/* 提交按钮 */}
      {online && (
        <>
          <div className="h-px bg-border-subtle" />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`w-full py-2 rounded-md text-sm font-semibold nasge-transition-quick
              ${isSubmitting
                ? "opacity-50 cursor-not-allowed bg-accent/60 text-bg-app"
                : "cursor-pointer bg-accent text-bg-app hover:bg-accent-hover"
              }`}
          >
            {isSubmitting ? t('review.submitting') : hasExistingReview ? t('review.update') : t('review.submit')}
          </button>
        </>
      )}
    </div>
  );
};

// ============================================================================
// Checkbox 组件
// ============================================================================

const Checkbox: React.FC<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="accent-accent w-3.5 h-3.5 cursor-pointer"
    />
    {label}
  </label>
);

export default ReviewSettingsPanel;
