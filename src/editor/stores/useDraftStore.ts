import { create } from "zustand";
import { persist } from "zustand/middleware";
import { JSONContent } from "@tiptap/core";
import { createEmptyDoc } from "../utils/editorExtensions";
import { createTitleFromText, createEmptyTitle } from "../utils/titleHelpers";
import { loggers } from "../../shared/logger";

// 触发旧 store 迁移（必须先于 store 创建）
import "./migrateLegacyStore";

// ============================================================================
// 类型定义
// ============================================================================

export type Draft = {
  id: string;
  draftName: string;
  title: JSONContent;
  content: JSONContent;
  updatedAt: number;
  linkedChapterId?: string;
  linkedGuideId?: string;
  lastSyncedAt?: number;
  draftType?: 'guide' | 'review';
};

// ============================================================================
// 模块级变量
// ============================================================================

let deletedCache: Draft | null = null;

// ============================================================================
// Store
// ============================================================================

type DraftState = {
  drafts: Draft[];
  activeDraftId: string | null;
  nextDraftNumber: number;
  isDirty: boolean;

  // 草稿 CRUD
  selectDraft: (id: string) => void;
  addDraft: (options?: { title?: string; draftType?: 'guide' | 'review'; linkedGuideId?: string }) => Draft;
  updateDraft: (id: string, patch: Partial<Draft>) => void;
  deleteDraft: (id: string) => void;
  duplicateDraft: (id: string) => Draft | null;
  restoreDraft: () => void;
  reorderDrafts: (newOrder: string[]) => void;

  // 脏标记
  setDirty: (dirty: boolean) => void;
  markDirty: () => void;
  markClean: () => void;

  // 查询
  getDraftByChapterId: (chapterId: string) => Draft | undefined;
  getDraftsByArchive: (guideId: string | null) => Draft[];
  getUnlinkedDrafts: () => Draft[];

  // 统一草稿选择
  selectBestDraft: (archiveId: string | null, isReview: boolean) => void;
};

export const useDraftStore = create<DraftState>()(
  persist(
    (set, get) => ({
      drafts: [],
      activeDraftId: null,
      nextDraftNumber: 1,
      isDirty: false,

      selectDraft: (id) => set({ activeDraftId: id, isDirty: false }),

      addDraft: (options) => {
        const state = get();
        const draftNumber = state.nextDraftNumber;
        const title = options?.title;
        const draftType = options?.draftType ?? 'guide';
        const linkedGuideId = options?.linkedGuideId;

        const draft: Draft = {
          id: crypto.randomUUID(),
          draftName: `草稿 ${draftNumber}`,
          title: title ? createTitleFromText(title) : createEmptyTitle(),
          content: createEmptyDoc(),
          updatedAt: Date.now(),
          linkedGuideId,
          draftType,
        };

        set((s) => ({
          drafts: [...s.drafts, draft],
          activeDraftId: draft.id,
          nextDraftNumber: s.nextDraftNumber + 1,
          isDirty: false,
        }));

        return draft;
      },

      updateDraft: (id, patch) => {
        set((s) => ({
          drafts: s.drafts.map((d) =>
            d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d
          ),
          isDirty: patch.content !== undefined ? true : s.isDirty,
        }));
      },

      deleteDraft: (id) => {
        set((s) => {
          const remaining = s.drafts.filter((d) => d.id !== id);
          const removed = s.drafts.find((d) => d.id === id) ?? null;
          deletedCache = removed;

          return {
            drafts: remaining,
            activeDraftId:
              remaining.length === 0
                ? null
                : s.activeDraftId === id
                  ? remaining[remaining.length - 1].id
                  : s.activeDraftId,
            isDirty: false,
          };
        });
      },

      duplicateDraft: (id) => {
        const original = get().drafts.find((d) => d.id === id);
        if (!original) return null;

        const duplicated: Draft = {
          ...original,
          id: crypto.randomUUID(),
          draftName: `${original.draftName} (副本)`,
          updatedAt: Date.now(),
          linkedChapterId: undefined,
          lastSyncedAt: undefined,
        };

        set((s) => ({
          drafts: [...s.drafts, duplicated],
          activeDraftId: duplicated.id,
          isDirty: false,
        }));

        return duplicated;
      },

      restoreDraft: () => {
        if (!deletedCache) return;
        const draft = deletedCache;
        deletedCache = null;
        set((s) => ({
          drafts: [...s.drafts, draft],
          activeDraftId: draft.id,
          isDirty: false,
        }));
      },

      reorderDrafts: (newOrder) => {
        set((s) => {
          const reordered = newOrder
            .map(id => s.drafts.find((d) => d.id === id))
            .filter((d): d is Draft => d !== undefined);
          return { drafts: reordered };
        });
      },

      // 脏标记
      setDirty: (dirty) => set({ isDirty: dirty }),
      markDirty: () => set({ isDirty: true }),
      markClean: () => set({ isDirty: false }),

      // 查询
      getDraftByChapterId: (chapterId) =>
        get().drafts.find((d) => d.linkedChapterId === chapterId),

      getDraftsByArchive: (guideId) => {
        if (guideId === null) return get().drafts.filter((d) => !d.linkedGuideId);
        return get().drafts.filter((d) => d.linkedGuideId === guideId);
      },

      getUnlinkedDrafts: () => get().drafts.filter((d) => !d.linkedGuideId),

      // 统一草稿选择逻辑（原来在 setMode/setGuideInfo/switchArchive 中重复 3 次）
      selectBestDraft: (archiveId, isReview) => {
        const { drafts } = get();
        const matching = drafts.filter(d => {
          const typeMatch = isReview ? d.draftType === 'review' : d.draftType !== 'review';
          const archiveMatch = archiveId ? d.linkedGuideId === archiveId : !d.linkedGuideId;
          return typeMatch && archiveMatch;
        });

        if (matching.length > 0) {
          const mostRecent = matching.sort((a, b) => b.updatedAt - a.updatedAt)[0];
          set({ activeDraftId: mostRecent.id });
        } else {
          set({ activeDraftId: null });
        }
      },
    }),
    {
      name: "nasge-drafts",
      version: 1,
      storage: (() => {
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        let pendingValue: { name: string; value: unknown } | null = null;

        const debouncedSetItem = (name: string, value: unknown) => {
          pendingValue = { name, value };
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            if (pendingValue) {
              const valueStr = typeof pendingValue.value === 'string'
                ? pendingValue.value
                : JSON.stringify(pendingValue.value);
              loggers.persist.verbose('setItem (debounced)', { name: pendingValue.name });
              localStorage.setItem(pendingValue.name, valueStr);
              pendingValue = null;
              debounceTimer = null;
            }
          }, 500);
        };

        return {
          getItem: (name: string) => {
            const str = localStorage.getItem(name);
            if (!str) return null;
            try { return JSON.parse(str); } catch { return null; }
          },
          setItem: debouncedSetItem,
          removeItem: (name: string) => localStorage.removeItem(name),
        };
      })(),

      partialize: (state) => ({
        drafts: state.drafts,
        activeDraftId: state.activeDraftId,
        nextDraftNumber: state.nextDraftNumber,
        // isDirty 不持久化
      }),

      merge: (persisted: unknown, current: DraftState) => {
        const p = persisted as Partial<DraftState> | null;
        return {
          ...current,
          drafts: p?.drafts ?? current.drafts,
          activeDraftId: p?.activeDraftId ?? current.activeDraftId,
          nextDraftNumber: (p as Record<string, unknown>)?.nextDraftNumber as number ?? current.nextDraftNumber,
        };
      },

      migrate: (persisted: unknown, _version: number) => {
        const state = persisted as Partial<DraftState> | null;
        if (!state) return { drafts: [], activeDraftId: null, nextDraftNumber: 1 };

        if (!state.nextDraftNumber) {
          state.nextDraftNumber = (state.drafts?.length ?? 0) + 1;
        }
        return state;
      },

      onRehydrateStorage: () => (_state, error) => {
        if (error) loggers.persist.error('useDraftStore rehydration 失败', error);
      },
    }
  )
);

// 启动时修复 activeDraftId
setTimeout(() => {
  const state = useDraftStore.getState();
  if (!state.activeDraftId && state.drafts.length > 0) {
    useDraftStore.setState({ activeDraftId: state.drafts[0].id });
  }
}, 100);
