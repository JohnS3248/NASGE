import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { loggers } from "../../shared/logger";
import { useDraftStore } from "./useDraftStore";
import { useArchiveStore } from "./useArchiveStore";
import { useReviewStore } from "./useReviewStore";
import { useSteamGuideImageStore } from "./useSteamGuideImageStore";

// Re-export 子 store 的类型，保持向后兼容的 import 路径
// 注意：useSteamGuideImageStore 顶层 import 了 useGuideStore（循环依赖），
// 但所有访问都在函数体内通过 getState() 懒加载，模块初始化时不会触发，所以安全。
export type { Draft } from "./useDraftStore";
export type { GuideArchive, ImageTag, ChapterInfo } from "./useArchiveStore";
export { TAG_COLORS } from "./useArchiveStore";
export { useDraftStore } from "./useDraftStore";
export { useArchiveStore } from "./useArchiveStore";

// ============================================================================
// 类型定义（会话层）
// ============================================================================

export type EditorMode = 'guide' | 'review' | 'offline-guide' | 'offline-review';

export function isReviewMode(mode: EditorMode): boolean {
  return mode === 'review' || mode === 'offline-review';
}
export function isGuideMode(mode: EditorMode): boolean {
  return mode === 'guide' || mode === 'offline-guide';
}
export function isOnlineMode(mode: EditorMode): boolean {
  return mode === 'guide' || mode === 'review';
}

export type GuideInfo = {
  id: string;
  title: string;
  coverUrl?: string;
  chapters: { sectionId: string; title: string; order: number; titleImageUrl?: string }[];
};

// ============================================================================
// Store
// ============================================================================

type SessionState = {
  mode: EditorMode;
  guideInfo: GuideInfo | null;
  currentArchiveId: string | null;
  currentChapterId: string | null;

  setMode: (mode: EditorMode) => void;
  setGuideInfo: (info: GuideInfo) => void;
  clearGuideInfo: () => void;
  switchArchive: (guideId: string | null) => void;
  setCurrentChapter: (chapterId: string | null) => void;
  reorderChapters: (newOrder: string[]) => void;
};

export const useGuideStore = create<SessionState>()(
  persist(
    (set, get) => ({
      mode: 'offline-guide',
      guideInfo: null,
      currentArchiveId: null,
      currentChapterId: null,

      setMode: (mode) => {
        const state = get();
        const updates: Partial<Pick<SessionState, 'mode' | 'guideInfo' | 'currentArchiveId' | 'currentChapterId'>> = { mode };

        if (mode === 'review' || mode === 'offline-review') {
          updates.currentArchiveId = null;
          updates.guideInfo = null;
          updates.currentChapterId = null;
        }

        if (mode === 'offline-guide' && !state.currentArchiveId) {
          updates.guideInfo = null;
          updates.currentChapterId = null;
        }

        // 进入 offline-review 时清除旧连接信息（在线 review 会通过 setReviewInfo 重填）
        if (mode === 'offline-review') {
          useReviewStore.getState().clearConnection();
        }

        set(updates);

        // 委托 useDraftStore 选择最佳草稿
        const afterState = get();
        const isReview = mode === 'review' || mode === 'offline-review';
        if (isReview) {
          const reviewAppId = useReviewStore.getState().appId;
          useDraftStore.getState().selectBestDraft(null, true, reviewAppId);
        } else {
          useDraftStore.getState().selectBestDraft(afterState.currentArchiveId, false);
        }
      },

      setGuideInfo: (info) => {
        if (!info.id) {
          set({ guideInfo: info, mode: 'guide' });
          return;
        }

        // 创建或更新存档
        const archiveStore = useArchiveStore.getState();
        const existing = archiveStore.getArchive(info.id);
        if (existing) {
          archiveStore.updateArchive(info.id, {
            guideName: info.title,
            coverUrl: info.coverUrl,
            chapters: info.chapters,
            chaptersUpdatedAt: Date.now(),
            lastAccessedAt: Date.now(),
          });
        } else {
          archiveStore.createArchive(info.id, {
            title: info.title,
            coverUrl: info.coverUrl,
            chapters: info.chapters,
          });
        }

        set({
          guideInfo: info,
          mode: 'guide',
          currentArchiveId: info.id,
        });

        // 加载图片池
        useSteamGuideImageStore.getState().loadFromArchive(info.id);

        // 选择最佳草稿
        useDraftStore.getState().selectBestDraft(info.id, false);
      },

      clearGuideInfo: () => {
        set({ guideInfo: null, currentChapterId: null });
      },

      switchArchive: (guideId) => {
        if (guideId === null) {
          set({
            currentArchiveId: null,
            guideInfo: null,
            mode: 'offline-guide',
          });

          useDraftStore.getState().selectBestDraft(null, false);
          useSteamGuideImageStore.getState().loadFromArchive(null, false);
          return;
        }

        const archive = useArchiveStore.getState().getArchive(guideId);
        if (!archive) {
          loggers.store.warn('存档不存在', { guideId });
          return;
        }

        const guideInfo: GuideInfo = {
          id: archive.guideId,
          title: archive.guideName,
          coverUrl: archive.coverUrl,
          chapters: archive.chapters,
        };

        const state = get();
        const newMode = state.mode === 'offline-guide' ? 'offline-guide' : 'guide';

        set({
          currentArchiveId: guideId,
          guideInfo,
          mode: newMode,
        });

        // 更新 lastAccessedAt
        useArchiveStore.getState().updateArchive(guideId, {
          lastAccessedAt: Date.now(),
        });

        // 选择最佳草稿（switchArchive 只在指南模式下调用，isReview 始终为 false）
        useDraftStore.getState().selectBestDraft(guideId, false);

        // 加载图片池
        useSteamGuideImageStore.getState().loadFromArchive(guideId, false);

        loggers.store.info('切换存档', { guideId, guideName: archive.guideName });
      },

      setCurrentChapter: (chapterId) => set({ currentChapterId: chapterId }),

      reorderChapters: (newOrder) => {
        set((state) => {
          if (!state.guideInfo) return state;
          const reordered = newOrder
            .map(sectionId => state.guideInfo!.chapters.find(c => c.sectionId === sectionId))
            .filter((c): c is GuideInfo['chapters'][number] => c !== undefined)
            .map((chapter, index) => ({ ...chapter, order: index }));
          return { guideInfo: { ...state.guideInfo, chapters: reordered } };
        });
      },
    }),
    {
      name: "nasge-session",
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        mode: state.mode,
        guideInfo: state.guideInfo,
        currentArchiveId: state.currentArchiveId,
        currentChapterId: state.currentChapterId,
      }),

      merge: (persisted: unknown, current: SessionState) => {
        const p = persisted as Partial<SessionState> | null;
        return {
          ...current,
          mode: p?.mode ?? current.mode,
          guideInfo: p?.guideInfo ?? current.guideInfo,
          currentArchiveId: p?.currentArchiveId ?? current.currentArchiveId,
          currentChapterId: p?.currentChapterId ?? current.currentChapterId,
        };
      },

      onRehydrateStorage: () => (_state, error) => {
        if (error) loggers.persist.error('useGuideStore rehydration 失败', error);
      },
    }
  )
);
