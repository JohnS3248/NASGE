import { create } from "zustand";
import { persist } from "zustand/middleware";
import { JSONContent } from "@tiptap/core";
import { createEmptyDoc } from "../utils/editorExtensions";
import { createTitleFromText, createEmptyTitle } from "../utils/titleHelpers";
import { loggers } from "../../shared/logger";
import { createDebouncedStorage } from "./utils/debouncedStorage";


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
  linkedAppId?: string;     // 绑定 Steam 游戏 appId（review 专用）
  linkedAppName?: string;   // 游戏名（方便离线模式显示）
  isPrimary?: boolean;      // 是否为与 Steam 评测绑定的主草稿（仅主草稿可提交）
};

// ============================================================================
// 模块级变量
// ============================================================================

/**
 * sessionStorage key — 标签页级的 activeDraftId 持久化。
 * 使用 sessionStorage（不是 localStorage）以实现多窗口隔离：
 * 每个标签页可以独立打开不同的草稿，互不影响。
 */
const TAB_ACTIVE_DRAFT_KEY = 'nasge-tab-activeDraft';

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
  addDraft: (options?: { title?: string; draftName?: string; draftType?: 'guide' | 'review'; linkedGuideId?: string; linkedAppId?: string; linkedAppName?: string; isPrimary?: boolean }) => Draft;
  updateDraft: (id: string, patch: Partial<Draft>) => void;
  deleteDraft: (id: string) => void;
  duplicateDraft: (id: string) => Draft | null;
  restoreDraft: () => void;
  reorderDrafts: (newOrder: string[]) => void;

  // 脏标记
  markDirty: () => void;
  markClean: () => void;

  // 查询
  getDraftByChapterId: (chapterId: string) => Draft | undefined;
  getDraftsByArchive: (guideId: string | null) => Draft[];
  getUnlinkedDrafts: () => Draft[];
  getDraftsByAppId: (appId: string) => Draft[];

  // 统一草稿选择
  selectBestDraft: (archiveId: string | null, isReview: boolean, appId?: string | null) => void;
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
          draftName: options?.draftName || `草稿 ${draftNumber}`,
          title: title ? createTitleFromText(title) : createEmptyTitle(),
          content: createEmptyDoc(),
          updatedAt: Date.now(),
          linkedGuideId,
          draftType,
          linkedAppId: options?.linkedAppId,
          linkedAppName: options?.linkedAppName,
          isPrimary: options?.isPrimary,
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
          const deleted = s.drafts.find((d) => d.id === id);
          const remaining = s.drafts.filter((d) => d.id !== id);
          deletedCache = deleted ?? null;

          let nextId: string | null;
          if (remaining.length === 0) {
            nextId = null;
          } else if (s.activeDraftId !== id) {
            nextId = s.activeDraftId;
          } else {
            // 只从同类型草稿中选下一个，防止 guide→review 跨类型泄漏
            const deletedType = deleted?.draftType ?? 'guide';
            const sameType = remaining.filter(d => (d.draftType ?? 'guide') === deletedType);
            nextId = sameType.length > 0 ? sameType[sameType.length - 1].id : null;
          }

          return { drafts: remaining, activeDraftId: nextId, isDirty: false };
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
          isPrimary: undefined,
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

      getDraftsByAppId: (appId) =>
        get().drafts.filter((d) => d.draftType === 'review' && d.linkedAppId === appId),

      // 统一草稿选择逻辑（原来在 setMode/setGuideInfo/switchArchive 中重复 3 次）
      selectBestDraft: (archiveId, isReview, appId) => {
        const { drafts } = get();

        let matching: Draft[];
        if (isReview) {
          // review 模式：按 appId 过滤
          if (appId) {
            matching = drafts.filter(d => d.draftType === 'review' && d.linkedAppId === appId);
          } else {
            // offline-review（无 appId）：选最近的 review 草稿
            matching = drafts.filter(d => d.draftType === 'review');
          }
        } else {
          // guide 模式：按 archiveId 过滤
          matching = drafts.filter(d => {
            const typeMatch = d.draftType !== 'review';
            const archiveMatch = archiveId ? d.linkedGuideId === archiveId : !d.linkedGuideId;
            return typeMatch && archiveMatch;
          });
        }

        if (matching.length > 0) {
          const mostRecent = [...matching].sort((a, b) => b.updatedAt - a.updatedAt)[0];
          set({ activeDraftId: mostRecent.id });
        } else {
          set({ activeDraftId: null });
        }
      },
    }),
    {
      name: "nasge-drafts",
      version: 2,
      storage: createDebouncedStorage(),

      partialize: (state) => ({
        drafts: state.drafts,
        nextDraftNumber: state.nextDraftNumber,
        // activeDraftId 由 sessionStorage 管理（标签页隔离）
        // isDirty 不持久化
      }),

      merge: (persisted: unknown, current: DraftState) => {
        const p = persisted as Partial<DraftState> | null;
        return {
          ...current,
          drafts: p?.drafts ?? current.drafts,
          // activeDraftId 不从 localStorage 恢复，由 sessionStorage 恢复
          nextDraftNumber: (p as Record<string, unknown>)?.nextDraftNumber as number ?? current.nextDraftNumber,
        };
      },

      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Partial<DraftState> | null;
        if (!state) return { drafts: [], activeDraftId: null, nextDraftNumber: 1 };

        // v0 → v1: nextDraftNumber
        if (version < 1 && !state.nextDraftNumber) {
          state.nextDraftNumber = (state.drafts?.length ?? 0) + 1;
        }
        // v1 → v2: linkedAppId/linkedAppName added to Draft — additive, no conversion needed
        return state;
      },

      onRehydrateStorage: () => (state, error) => {
        if (error) { loggers.persist.error('useDraftStore rehydration 失败', error); return; }
        if (!state) return;

        // 注意：zustand 5 的 persist middleware 用同步 thenable 包装 localStorage，
        // 此回调是在 `create(persist(...))` 表达式返回之前被同步触发的。
        // 此时模块顶层的 `export const useDraftStore` 还处于 TDZ（const 未完成赋值），
        // 直接访问 useDraftStore.setState 会抛 ReferenceError。
        // 用 queueMicrotask 推迟到下一个 microtask 队列，届时 const 已完成赋值。
        queueMicrotask(() => {
          const savedId = sessionStorage.getItem(TAB_ACTIVE_DRAFT_KEY);
          const drafts = useDraftStore.getState().drafts;

          // 读取 URL mode，判断期望的草稿类型（防止跨模式恢复）
          const urlMode = new URLSearchParams(window.location.search).get('mode') || '';
          const urlExpectsReview = urlMode === 'review' || urlMode === 'offline-review';

          // 1) 优先：从 sessionStorage 恢复，但必须校验草稿类型与 URL 模式匹配
          if (savedId) {
            const savedDraft = drafts.find(d => d.id === savedId);
            if (savedDraft) {
              const isReviewDraft = savedDraft.draftType === 'review';
              if (isReviewDraft === urlExpectsReview) {
                useDraftStore.setState({ activeDraftId: savedId });
                return;
              }
              // 类型不匹配 → 不恢复，落到兜底逻辑
            }
          }

          // 2) 兜底：从同类型草稿中选第一个
          const matching = drafts.find(d =>
            urlExpectsReview ? d.draftType === 'review' : (d.draftType ?? 'guide') !== 'review'
          );
          if (matching) {
            useDraftStore.setState({ activeDraftId: matching.id });
          }
        });
      },
    }
  )
);

// 同步 activeDraftId 到 sessionStorage（标签页隔离）
useDraftStore.subscribe((state, prev) => {
  if (state.activeDraftId !== prev.activeDraftId) {
    if (state.activeDraftId) {
      sessionStorage.setItem(TAB_ACTIVE_DRAFT_KEY, state.activeDraftId);
    } else {
      sessionStorage.removeItem(TAB_ACTIVE_DRAFT_KEY);
    }
  }
});
