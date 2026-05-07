/**
 * PanelInsertSettings — 图片池插入默认格式 popover
 *
 * 改 useImagePanelStore 的 defaultInsertSize / defaultInsertAlignment(已 persist)。
 * 拖入编辑器时 WholeGuideEditor / TipTapEditor 从 store 消费这两个值。
 * 选项与 Steam 官方一致:三种尺寸(半宽 / 全宽 / 原尺寸)+ 三种对齐(向左 / 向右 / 内嵌)。
 */
import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useImagePanelStore } from "../../stores/useImagePanelStore";

interface Props {
  onClose: () => void;
}

const PanelInsertSettings: React.FC<Props> = ({ onClose }) => {
  const { t } = useTranslation("editor");
  const defaultInsertSize = useImagePanelStore((s) => s.defaultInsertSize);
  const defaultInsertAlignment = useImagePanelStore((s) => s.defaultInsertAlignment);
  const defaultInsertPlacement = useImagePanelStore((s) => s.defaultInsertPlacement);
  const setDefaultInsertSize = useImagePanelStore((s) => s.setDefaultInsertSize);
  const setDefaultInsertAlignment = useImagePanelStore((s) => s.setDefaultInsertAlignment);
  const setDefaultInsertPlacement = useImagePanelStore((s) => s.setDefaultInsertPlacement);

  const containerRef = useRef<HTMLDivElement>(null);

  // 点击 popover 外关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // 下一帧再绑定,避免触发 popover 打开的那次 click 立刻关闭
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", handler);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      className="absolute right-2 top-9 z-50 flex flex-col gap-2 min-w-[220px] rounded-md border border-border-default bg-bg-surface p-3 shadow-panel"
    >
      <div className="text-xs font-semibold text-text-secondary">
        {t("imagePanel.insertSettings.title")}
      </div>

      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-text-secondary">
          {t("imagePanel.insertSettings.size")}
        </span>
        <select
          value={defaultInsertSize}
          onChange={(e) =>
            setDefaultInsertSize(e.target.value as "original" | "medium" | "small" | "full")
          }
          className="rounded border border-border-default bg-bg-app px-2 py-0.5 text-xs text-text-primary focus:border-border-accent focus:outline-none"
        >
          <option value="medium">{t("imagePanel.insertSettings.sizeMedium")}</option>
          <option value="full">{t("imagePanel.insertSettings.sizeFull")}</option>
          <option value="original">{t("imagePanel.insertSettings.sizeOriginal")}</option>
        </select>
      </label>

      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-text-secondary">
          {t("imagePanel.insertSettings.alignment")}
        </span>
        <select
          value={defaultInsertAlignment}
          onChange={(e) =>
            setDefaultInsertAlignment(
              e.target.value as "floatLeft" | "floatRight" | "center" | "inline"
            )
          }
          className="rounded border border-border-default bg-bg-app px-2 py-0.5 text-xs text-text-primary focus:border-border-accent focus:outline-none"
        >
          <option value="floatLeft">{t("imagePanel.insertSettings.alignFloatLeft")}</option>
          <option value="floatRight">{t("imagePanel.insertSettings.alignFloatRight")}</option>
          <option value="inline">{t("imagePanel.insertSettings.alignInline")}</option>
        </select>
      </label>

      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-text-secondary">
          {t("imagePanel.insertSettings.placement")}
        </span>
        <select
          value={defaultInsertPlacement}
          onChange={(e) =>
            setDefaultInsertPlacement(e.target.value as "newLine" | "inline")
          }
          className="rounded border border-border-default bg-bg-app px-2 py-0.5 text-xs text-text-primary focus:border-border-accent focus:outline-none"
        >
          <option value="newLine">{t("imagePanel.insertSettings.placementNewLine")}</option>
          <option value="inline">{t("imagePanel.insertSettings.placementInline")}</option>
        </select>
      </label>

      <div className="text-[11px] leading-tight text-text-muted">
        {t("imagePanel.insertSettings.hint")}
      </div>
    </div>
  );
};

export default PanelInsertSettings;
