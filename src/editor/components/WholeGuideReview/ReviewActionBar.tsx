/**
 * ReviewActionBar — 审阅页底部操作栏
 *
 * 取消（返回编辑视图）/ 确认上传（pushEntireGuide）
 */

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { useWholeGuideSync } from "../../hooks/useWholeGuideSync";
import { useWholeGuideStore } from "../../stores/useWholeGuideStore";
import { toast } from "../../stores/useToastStore";
import { loggers } from "../../../shared/logger";

const ReviewActionBar: React.FC = () => {
  const { t } = useTranslation("editor");
  const { guideId } = useParams<{ guideId: string }>();
  const navigate = useNavigate();
  const { pushEntireGuide } = useWholeGuideSync();
  const status = useWholeGuideStore((s) => s.status);
  const [submitting, setSubmitting] = useState(false);

  const goBack = () => {
    if (guideId) navigate(`/whole/${guideId}`);
  };

  const handleConfirm = async () => {
    if (!guideId) return;
    setSubmitting(true);
    try {
      await pushEntireGuide();
      toast.success(t("wholeGuide.review.uploadSuccess"));
      navigate(`/whole/${guideId}`);
    } catch (err) {
      loggers.editor.error("review confirm upload 失败", err);
    } finally {
      setSubmitting(false);
    }
  };

  const isBusy = submitting || status === "pushing";

  return (
    <div
      style={{
        position: "sticky",
        bottom: 0,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "flex-end",
        gap: 8,
        padding: "10px 20px",
        background: "rgba(13, 23, 36, 0.95)",
        borderTop: "1px solid rgba(102, 192, 244, 0.18)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        zIndex: 20,
      }}
    >
      <button
        type="button"
        onClick={goBack}
        disabled={isBusy}
        className="
          px-3 py-1.5 rounded-md border border-border-default
          bg-transparent text-sm text-text-secondary
          hover:text-text-primary hover:border-border-accent hover:bg-accent-subtle
          nasge-transition-quick cursor-pointer
        "
      >
        {t("wholeGuide.review.cancel")}
      </button>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={isBusy}
        className={`
          px-4 py-1.5 rounded-md text-sm font-semibold border-0
          ${
            isBusy
              ? "bg-bg-overlay text-text-muted cursor-not-allowed"
              : "bg-accent text-bg-app hover:bg-accent-hover cursor-pointer"
          }
        `}
      >
        {isBusy
          ? t("wholeGuide.review.uploading")
          : t("wholeGuide.review.confirmUpload")}
      </button>
    </div>
  );
};

export default ReviewActionBar;
