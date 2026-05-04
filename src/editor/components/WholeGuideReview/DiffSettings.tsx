/**
 * DiffSettings — Tab1 顶部 diff 设置面板
 */

import React from "react";
import { useTranslation } from "react-i18next";
import type { DiffOptions } from "../../utils/wholeGuideDiff";

interface Props {
  value: Required<Pick<DiffOptions, "ignoreWhitespace" | "contextLines" | "semanticCleanup">>;
  onChange: (next: Props["value"]) => void;
}

const DiffSettings: React.FC<Props> = ({ value, onChange }) => {
  const { t } = useTranslation("editor");

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 16,
        padding: "8px 14px",
        background: "rgba(13, 23, 36, 0.7)",
        border: "1px solid rgba(102, 192, 244, 0.12)",
        borderRadius: 8,
        fontSize: 12,
        color: "rgba(195, 215, 240, 0.85)",
      }}
    >
      <span style={{ fontWeight: 600, color: "#9bd2f5" }}>
        {t("wholeGuide.review.settingsTitle")}
      </span>

      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={value.ignoreWhitespace}
          onChange={(e) =>
            onChange({ ...value, ignoreWhitespace: e.target.checked })
          }
        />
        {t("wholeGuide.review.ignoreWhitespace")}
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={value.semanticCleanup}
          onChange={(e) =>
            onChange({ ...value, semanticCleanup: e.target.checked })
          }
        />
        {t("wholeGuide.review.semanticCleanup")}
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {t("wholeGuide.review.contextLines")}
        <input
          type="number"
          min={0}
          max={20}
          value={value.contextLines}
          onChange={(e) =>
            onChange({
              ...value,
              contextLines: Math.max(0, Math.min(20, Number(e.target.value) || 0)),
            })
          }
          style={{
            width: 56,
            padding: "2px 6px",
            background: "rgba(9, 15, 25, 0.6)",
            border: "1px solid rgba(102, 192, 244, 0.2)",
            borderRadius: 4,
            color: "rgba(215, 232, 255, 1)",
            fontSize: 12,
          }}
        />
      </label>
    </div>
  );
};

export default DiffSettings;
