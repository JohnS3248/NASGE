/**
 * 旧 "nasge-guide-store-v2" → 3 个新 key 的幂等迁移
 *
 * 同步执行，在三个新 store 文件顶部 import 以确保先于 store 创建执行。
 * 失败时保留旧 key，store 以默认值启动（降级而非崩溃）。
 */
import { loggers } from "../../shared/logger";

const LEGACY_KEY = "nasge-guide-store-v2";
const SESSION_KEY = "nasge-session";
const DRAFTS_KEY = "nasge-drafts";
const ARCHIVES_KEY = "nasge-archives";

let migrated = false;

export function migrateLegacyStore(): void {
  if (migrated) return;
  migrated = true;

  // 任一新 key 已存在 → 跳过（幂等）
  if (
    localStorage.getItem(SESSION_KEY) ||
    localStorage.getItem(DRAFTS_KEY) ||
    localStorage.getItem(ARCHIVES_KEY)
  ) {
    return;
  }

  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    const state = parsed?.state;
    if (!state) return;

    // 拆分 session
    const session = {
      state: {
        mode: state.mode ?? "offline-guide",
        guideInfo: state.guideInfo ?? null,
        currentArchiveId: state.currentArchiveId ?? null,
        currentChapterId: state.currentChapterId ?? null,
      },
      version: 1,
    };

    // 拆分 drafts
    const drafts = {
      state: {
        drafts: state.drafts ?? [],
        activeDraftId: state.activeDraftId ?? null,
        nextDraftNumber: state.nextDraftNumber ?? ((state.drafts?.length ?? 0) + 1),
      },
      version: 1,
    };

    // 拆分 archives
    const archives = {
      state: {
        archives: state.archives ?? {},
      },
      version: 1,
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
    localStorage.setItem(ARCHIVES_KEY, JSON.stringify(archives));
    localStorage.removeItem(LEGACY_KEY);

    loggers.persist.info("旧 store 迁移成功", {
      draftsCount: (state.drafts ?? []).length,
      archivesCount: Object.keys(state.archives ?? {}).length,
    });
  } catch (error) {
    // 迁移失败，保留旧 key，新 store 以默认值启动
    loggers.persist.error("旧 store 迁移失败，保留原数据", error);
  }
}

// 立即执行
migrateLegacyStore();
