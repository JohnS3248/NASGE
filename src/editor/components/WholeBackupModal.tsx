/**
 * WholeBackupModal — 全篇模式备份与存档管理面板
 *
 * 显示两类备份：
 *   - 自动备份（来自 useWholeGuideStore.autoBackups，FIFO 滚动 3 份，60s 节流写入）
 *   - 手动存档（IndexedDB，无限保留）
 *
 * 操作：恢复 / 重命名（仅手动）/ 删除（仅手动）/ 立即存档
 * 配额监控：用 navigator.storage.estimate()，80% 警告，95% 禁用 saveManual
 */

import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWholeGuideStore } from "../stores/useWholeGuideStore";
import {
  saveManualArchive,
  listArchives,
  loadFullArchive,
  deleteArchive,
  renameArchive,
  getQuota,
  type ArchiveSummary,
  type QuotaInfo,
} from "../services/wholeBackupService";
import { dialog } from "../stores/useDialogStore";
import { toast } from "../stores/useToastStore";
import { loggers } from "../../shared/logger";

interface Props {
  visible: boolean;
  onClose: () => void;
}

const WholeBackupModal: React.FC<Props> = ({ visible, onClose }) => {
  const { t } = useTranslation("editor");
  const guideId = useWholeGuideStore((s) => s.guideId);
  const autoBackups = useWholeGuideStore((s) => s.autoBackups);
  const restoreFromAutoBackup = useWholeGuideStore(
    (s) => s.restoreFromAutoBackup
  );
  const setDoc = useWholeGuideStore((s) => s.setDoc);
  const setChapters = useWholeGuideStore((s) => s.setChapters);
  const createAutoBackup = useWholeGuideStore((s) => s.createAutoBackup);

  const [archives, setArchives] = useState<ArchiveSummary[]>([]);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  const refresh = useCallback(async () => {
    if (!guideId) return;
    try {
      const [list, q] = await Promise.all([listArchives(guideId), getQuota()]);
      setArchives(list);
      setQuota(q);
    } catch (err) {
      loggers.store.error("WholeBackupModal refresh 失败", err);
    }
  }, [guideId]);

  useEffect(() => {
    if (visible) void refresh();
  }, [visible, refresh]);

  // -------- 立即存档 --------
  const handleCreateNew = async () => {
    if (!guideId) return;
    if (quota && quota.ratio >= 0.95) {
      toast.error(
        t("wholeGuide.backup.quotaFull", {
          defaultValue: "本地存档空间已满",
        })
      );
      return;
    }
    const label = await dialog.prompt({
      title: t("wholeGuide.backup.createNew"),
      message: t("wholeGuide.backup.labelPlaceholder"),
      defaultValue: "",
      maxLength: 60,
    });
    if (label === null) return;
    const finalLabel =
      label.trim() || t("wholeGuide.backup.namelessFallback");

    const state = useWholeGuideStore.getState();
    if (!state.doc) return;
    try {
      await saveManualArchive({
        guideId,
        label: finalLabel,
        doc: state.doc,
        chapters: state.chapters,
      });
      toast.success(
        t("wholeGuide.backup.savedToast", { label: finalLabel })
      );
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t("wholeGuide.backup.saveFail", { err: msg }));
    }
  };

  // -------- 恢复自动备份 --------
  const handleRestoreAuto = async (index: number) => {
    const ok = await dialog.confirm({
      title: t("wholeGuide.backup.actionRestore"),
      message: t("wholeGuide.backup.restoreConfirm"),
      confirmText: t("wholeGuide.backup.actionRestore"),
      danger: true,
    });
    if (!ok) return;
    const success = restoreFromAutoBackup(index);
    if (success) {
      toast.success(t("wholeGuide.backup.restoredToast"));
      onClose();
    }
  };

  // -------- 恢复手动存档 --------
  const handleRestoreManual = async (archiveId: string) => {
    const ok = await dialog.confirm({
      title: t("wholeGuide.backup.actionRestore"),
      message: t("wholeGuide.backup.restoreConfirm"),
      confirmText: t("wholeGuide.backup.actionRestore"),
      danger: true,
    });
    if (!ok) return;
    try {
      // 恢复前先生成自动备份当前状态
      createAutoBackup();
      const record = await loadFullArchive(archiveId);
      setDoc(record.doc);
      setChapters(record.chapters);
      toast.success(t("wholeGuide.backup.restoredToast"));
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t("wholeGuide.backup.restoreFail", { err: msg }));
    }
  };

  // -------- 重命名 --------
  const handleRename = async (a: ArchiveSummary) => {
    const next = await dialog.prompt({
      title: t("wholeGuide.backup.actionRename"),
      message: t("wholeGuide.backup.renamePrompt"),
      defaultValue: a.label,
      maxLength: 60,
    });
    if (next === null) return;
    const finalLabel = next.trim() || a.label;
    if (finalLabel === a.label) return;
    try {
      await renameArchive(a.archiveId, finalLabel);
      toast.success(t("wholeGuide.backup.renamedToast"));
      await refresh();
    } catch (err) {
      loggers.store.error("rename failed", err);
    }
  };

  // -------- 删除 --------
  const handleDelete = async (a: ArchiveSummary) => {
    const ok = await dialog.confirm({
      title: t("wholeGuide.backup.actionDelete"),
      message: t("wholeGuide.backup.deleteConfirm", { label: a.label }),
      confirmText: t("wholeGuide.backup.actionDelete"),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteArchive(a.archiveId);
      toast.success(t("wholeGuide.backup.deletedToast"));
      await refresh();
    } catch (err) {
      loggers.store.error("delete failed", err);
    }
  };

  if (!visible) return null;

  const usedPercent = quota ? Math.round(quota.ratio * 100) : 0;
  const quotaWarning = quota && quota.ratio >= 0.8 && quota.ratio < 0.95;
  const quotaFull = quota && quota.ratio >= 0.95;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/65 animate-dialog-backdrop"
      onClick={onClose}
    >
      <div
        className="bg-bg-surface border border-border-default rounded-lg shadow-2xl px-5 py-4 w-[640px] max-h-[80vh] overflow-y-auto animate-dialog-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 + 关闭 */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-text-primary m-0">
            {t("wholeGuide.backup.title")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover bg-transparent border-0 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* 顶部操作 */}
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={handleCreateNew}
            disabled={!!quotaFull}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold border-0 ${
              quotaFull
                ? "bg-bg-overlay text-text-muted cursor-not-allowed"
                : "bg-accent text-bg-app hover:bg-accent-hover cursor-pointer"
            }`}
          >
            + {t("wholeGuide.backup.createNew")}
          </button>
          {quota && (
            <span
              className={`text-xs ${
                quotaFull
                  ? "text-danger"
                  : quotaWarning
                    ? "text-warning"
                    : "text-text-muted"
              }`}
            >
              {quotaFull
                ? t("wholeGuide.backup.quotaFull", { used: usedPercent })
                : quotaWarning
                  ? t("wholeGuide.backup.quotaWarn", { used: usedPercent })
                  : t("wholeGuide.backup.quotaUsed", { used: usedPercent })}
            </span>
          )}
        </div>

        {/* 自动备份 section */}
        <SectionHeader label={t("wholeGuide.backup.autoSection")} />
        {autoBackups.length === 0 ? (
          <EmptyHint label={t("wholeGuide.backup.emptyAuto")} />
        ) : (
          <ul className="space-y-1.5 mb-4">
            {autoBackups.map((bk, i) => (
              <li
                key={`${bk.timestamp}-${i}`}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-bg-overlay border border-border-default"
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] text-text-primary">
                    {formatTime(bk.timestamp)}
                  </span>
                  <span className="text-[11px] text-text-muted">
                    {t("wholeGuide.backup.chapterCount", {
                      count: bk.chapters.length,
                    })}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRestoreAuto(i)}
                  className="px-2.5 py-1 rounded-md text-xs text-accent border border-border-accent bg-transparent hover:bg-accent-subtle cursor-pointer"
                >
                  {t("wholeGuide.backup.actionRestore")}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* 手动存档 section */}
        <SectionHeader label={t("wholeGuide.backup.manualSection")} />
        {archives.length === 0 ? (
          <EmptyHint label={t("wholeGuide.backup.emptyManual")} />
        ) : (
          <ul className="space-y-1.5">
            {archives.map((a) => (
              <li
                key={a.archiveId}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-bg-overlay border border-border-default"
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[13px] text-text-primary truncate">
                    {a.label}
                  </span>
                  <span className="text-[11px] text-text-muted">
                    {formatTime(a.createdAt)} ·{" "}
                    {t("wholeGuide.backup.chapterCount", {
                      count: a.chapterCount,
                    })}{" "}
                    ·{" "}
                    {t("wholeGuide.backup.sizeKB", {
                      kb: Math.max(1, Math.round(a.sizeBytes / 1024)),
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRestoreManual(a.archiveId)}
                    className="px-2 py-1 rounded text-xs text-accent border border-border-accent bg-transparent hover:bg-accent-subtle cursor-pointer"
                  >
                    {t("wholeGuide.backup.actionRestore")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRename(a)}
                    className="px-2 py-1 rounded text-xs text-text-secondary border border-border-default bg-transparent hover:bg-bg-hover cursor-pointer"
                  >
                    {t("wholeGuide.backup.actionRename")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(a)}
                    className="px-2 py-1 rounded text-xs text-danger border border-danger/40 bg-transparent hover:bg-danger/10 cursor-pointer"
                  >
                    {t("wholeGuide.backup.actionDelete")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

const SectionHeader: React.FC<{ label: string }> = ({ label }) => (
  <div className="text-[11px] uppercase tracking-wider text-text-muted mt-3 mb-1.5">
    {label}
  </div>
);

const EmptyHint: React.FC<{ label: string }> = ({ label }) => (
  <div className="text-xs text-text-muted px-3 py-3 mb-3 bg-bg-overlay rounded-md border border-border-default text-center">
    {label}
  </div>
);

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(
    2,
    "0"
  )}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default WholeBackupModal;
