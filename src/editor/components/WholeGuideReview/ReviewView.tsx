/**
 * ReviewView — 审阅页主组件
 *
 * 双 tab：
 *   - diff：字符级 diff（远程上次拉取 vs 当前编辑后）
 *   - preview：调 Steam previewChapterFromSteam 拿真实渲染 HTML
 *
 * 路由：?tab=diff|preview（默认 diff）
 * 底部 ReviewActionBar：取消（返回编辑视图）/ 确认上传
 */

import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import ReviewActionBar from "./ReviewActionBar";
import ReviewTab1Diff from "./ReviewTab1Diff";
import ReviewTab2Preview from "./ReviewTab2Preview";

type TabKey = "diff" | "preview";

const TabBar: React.FC<{
  active: TabKey;
  onSwitch: (key: TabKey) => void;
}> = ({ active, onSwitch }) => {
  const { t } = useTranslation("editor");
  const tabs: { key: TabKey; label: string }[] = useMemo(
    () => [
      { key: "diff", label: t("wholeGuide.review.tabDiff") },
      { key: "preview", label: t("wholeGuide.review.tabPreview") },
    ],
    [t]
  );

  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: 4,
        padding: "10px 20px",
        borderBottom: "1px solid rgba(102, 192, 244, 0.15)",
        background: "rgba(13, 23, 36, 0.85)",
        position: "sticky",
        top: 0,
        zIndex: 10,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSwitch(tab.key)}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? "#9bd2f5" : "rgba(195, 215, 240, 0.7)",
              background: isActive
                ? "rgba(102, 192, 244, 0.16)"
                : "transparent",
              transition: "background 150ms ease, color 150ms ease",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

const ReviewView: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: TabKey =
    searchParams.get("tab") === "preview" ? "preview" : "diff";

  const switchTab = (key: TabKey) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", key);
    setSearchParams(next, { replace: true });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-app, #0e141b)",
        zIndex: 100,
      }}
    >
      <TabBar active={tab} onSwitch={switchTab} />
      <div style={{ flex: 1, overflow: "auto" }}>
        {tab === "diff" ? <ReviewTab1Diff /> : <ReviewTab2Preview />}
      </div>
      <ReviewActionBar />
    </div>
  );
};

export default ReviewView;
