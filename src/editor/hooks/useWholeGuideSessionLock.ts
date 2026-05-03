/**
 * useWholeGuideSessionLock — 全篇模式 tab 锁
 *
 * 行为：
 *   1. 进入 WholeGuideEditor 时生成本 tab 的 sessionId
 *   2. 检查 localStorage[`nasge-whole-lock-${guideId}`]：
 *        - 不存在或已 stale（lastHeartbeat 30s 前）→ 直接占用
 *        - 仍 fresh → 弹 dialog 让用户选「抢占 / 取消」
 *   3. 占用后每 10s 心跳一次（防止 tab 崩溃后锁不释放）
 *   4. 心跳时检测锁是否已被其他 tab 抢占，若是 → 提示用户、停止心跳（不主动停止编辑，避免数据丢失）
 *   5. 卸载时清理（仅当本 tab 仍持有锁）
 *
 * 全篇模式整篇 doc 同时只允许一个 tab 编辑。
 */

import { useEffect, useRef } from "react";
import i18n from "i18next";
import { dialog } from "../stores/useDialogStore";
import { toast } from "../stores/useToastStore";
import { loggers } from "../../shared/logger";

const LOCK_KEY_PREFIX = "nasge-whole-lock-";
const HEARTBEAT_INTERVAL_MS = 10_000;
const LOCK_STALE_AFTER_MS = 30_000;

interface LockData {
  sessionId: string;
  lastHeartbeat: number;
}

function readLock(guideId: string): LockData | null {
  try {
    const raw = localStorage.getItem(LOCK_KEY_PREFIX + guideId);
    if (!raw) return null;
    return JSON.parse(raw) as LockData;
  } catch {
    return null;
  }
}

function writeLock(guideId: string, data: LockData): void {
  try {
    localStorage.setItem(LOCK_KEY_PREFIX + guideId, JSON.stringify(data));
  } catch (err) {
    loggers.editor.error("session lock 写入失败", err);
  }
}

function clearLock(guideId: string): void {
  try {
    localStorage.removeItem(LOCK_KEY_PREFIX + guideId);
  } catch {
    /* ignore */
  }
}

/**
 * 进入全篇模式编辑器时调用。
 *
 * @param guideId 当前指南 ID（undefined 则不启用锁）
 * @param onDenied 用户选择"取消抢占"时的回调（推荐：切回旧模式 / 关闭 tab）
 */
export function useWholeGuideSessionLock(
  guideId: string | undefined,
  onDenied: () => void
): void {
  const sessionIdRef = useRef<string>(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const intervalRef = useRef<number | null>(null);
  const onDeniedRef = useRef(onDenied);
  useEffect(() => {
    onDeniedRef.current = onDenied;
  }, [onDenied]);

  useEffect(() => {
    if (!guideId) return;

    const sessionId = sessionIdRef.current;
    let cancelled = false;

    const startHeartbeat = () => {
      if (intervalRef.current !== null) return;
      intervalRef.current = window.setInterval(() => {
        const cur = readLock(guideId);
        if (!cur || cur.sessionId === sessionId) {
          writeLock(guideId, { sessionId, lastHeartbeat: Date.now() });
        } else {
          // 被其他 tab 抢占
          loggers.editor.warn("session lock 被其他 tab 抢占", {
            guideId,
            mySessionId: sessionId,
            currentSessionId: cur.sessionId,
          });
          if (intervalRef.current !== null) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          toast.warning(
            i18n.t("wholeGuide.sessionConflict.preempted", {
              ns: "editor",
              defaultValue:
                "本标签页的编辑权已被其他标签页抢占，刷新页面可重新尝试。",
            })
          );
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    const acquire = async () => {
      const existing = readLock(guideId);
      const now = Date.now();

      if (existing && existing.sessionId !== sessionId) {
        const isFresh = now - existing.lastHeartbeat < LOCK_STALE_AFTER_MS;
        if (isFresh) {
          const preempt = await dialog.confirm({
            title: i18n.t("wholeGuide.sessionConflict.title", {
              ns: "editor",
              defaultValue: "该指南已在其他标签页编辑",
            }),
            message: i18n.t("wholeGuide.sessionConflict.message", {
              ns: "editor",
              defaultValue:
                "继续将抢占编辑权，其他标签页的未保存修改可能丢失。是否抢占？",
            }),
            confirmText: i18n.t("wholeGuide.sessionConflict.preempt", {
              ns: "editor",
              defaultValue: "抢占",
            }),
            cancelText: i18n.t("wholeGuide.sessionConflict.cancel", {
              ns: "editor",
              defaultValue: "取消",
            }),
            danger: true,
          });
          if (cancelled) return;
          if (!preempt) {
            onDeniedRef.current();
            return;
          }
        }
      }

      writeLock(guideId, { sessionId, lastHeartbeat: Date.now() });
      loggers.editor.info("session lock 占用成功", { guideId, sessionId });
      startHeartbeat();
    };

    void acquire();

    return () => {
      cancelled = true;
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      const cur = readLock(guideId);
      if (cur && cur.sessionId === sessionId) {
        clearLock(guideId);
        loggers.editor.info("session lock 释放", { guideId, sessionId });
      }
    };
  }, [guideId]);
}
