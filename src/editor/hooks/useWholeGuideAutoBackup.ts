/**
 * useWholeGuideAutoBackup — 全篇模式自动备份调度
 *
 * 每 60s 检查一次：若 doc 自上次备份以来有变化 → 调 createAutoBackup（FIFO 滚动 3 份）。
 * 备份持久化在 useWholeGuideStore 的 autoBackups 字段（localStorage）。
 *
 * 用法：在 WholeGuideEditor 顶部调用一次即可，hook 接管节流 + cleanup。
 */

import { useEffect, useRef } from "react";
import { useWholeGuideStore } from "../stores/useWholeGuideStore";

const AUTO_BACKUP_INTERVAL_MS = 60_000;

export function useWholeGuideAutoBackup(): void {
  const lastBackedSerializedRef = useRef<string>("");

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const state = useWholeGuideStore.getState();
      if (!state.doc) return;
      const serialized = JSON.stringify(state.doc);
      if (serialized === lastBackedSerializedRef.current) return;
      state.createAutoBackup();
      lastBackedSerializedRef.current = serialized;
    }, AUTO_BACKUP_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, []);
}
