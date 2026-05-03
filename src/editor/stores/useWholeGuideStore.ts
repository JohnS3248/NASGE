/**
 * useWholeGuideStore — 全篇模式核心状态
 *
 * 当前包含：state + 基础 setter + reset。
 * 待实现：autoBackups（chrome.storage.local rolling 3）/ scheduleAutoBackup 节流。
 *
 * pullEntireGuide / pushEntireGuide 的实际编排见 useWholeGuideSync hook —— 该 hook 调用本
 * store 的 setters 改写 state，store 本身只承载 state 与原子化 setter。
 *
 * 持久化：用 localStorage 而非 sessionStorage，刷新页面 / 关闭浏览器后状态可恢复。
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { JSONContent } from "@tiptap/core";
import { loggers } from "../../shared/logger";

export type WholeGuideStatus =
  | "idle"
  | "pulling"
  | "editing"
  | "reviewing"
  | "pushing";

export interface WholeGuideChapterMeta {
  sectionId: string;
  title: string;
  /** 上次拉取（或上次成功上传后回填）的远程 BBCode；用作字符级 diff baseline */
  bbcode: string;
  /** 内容快速校验码（与 wholeGuideSlice.contentHash 同来源） */
  contentHash: string;
  order: number;
}

interface WholeGuideState {
  guideId: string | null;
  guideTitle: string;
  doc: JSONContent | null;
  chapters: WholeGuideChapterMeta[];
  /** 每章节 dirty 时间戳 sectionId → updatedAt ms（用于 UI 高亮未保存章节） */
  chapterDirtyTimestamps: Record<string, number>;
  status: WholeGuideStatus;
  lastPulledAt: number | null;
  lastPushedAt: number | null;
  error: string | null;

  // === Setter（被 useWholeGuideSync 调用） ===
  setGuideId: (guideId: string | null) => void;
  setGuideTitle: (title: string) => void;
  setDoc: (doc: JSONContent | null) => void;
  setChapters: (chapters: WholeGuideChapterMeta[]) => void;
  setStatus: (status: WholeGuideStatus) => void;
  setError: (error: string | null) => void;
  setLastPulledAt: (ts: number | null) => void;
  setLastPushedAt: (ts: number | null) => void;

  // === Dirty 跟踪 ===
  markChapterDirty: (sectionId: string) => void;
  clearChapterDirty: (sectionId?: string) => void;

  // === 整体 reset ===
  reset: () => void;
}

const INITIAL_STATE = {
  guideId: null,
  guideTitle: "",
  doc: null,
  chapters: [],
  chapterDirtyTimestamps: {},
  status: "idle" as WholeGuideStatus,
  lastPulledAt: null,
  lastPushedAt: null,
  error: null,
};

export const useWholeGuideStore = create<WholeGuideState>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      setGuideId: (guideId) => set({ guideId }),

      setGuideTitle: (guideTitle) => set({ guideTitle }),

      setDoc: (doc) => {
        set({ doc });
        // 注：自动备份触发后续在此接入（scheduleAutoBackup）
      },

      setChapters: (chapters) => set({ chapters }),

      setStatus: (status) => set({ status }),

      setError: (error) => set({ error }),

      setLastPulledAt: (lastPulledAt) => set({ lastPulledAt }),

      setLastPushedAt: (lastPushedAt) => set({ lastPushedAt }),

      markChapterDirty: (sectionId) => {
        if (!sectionId) return;
        set((state) => ({
          chapterDirtyTimestamps: {
            ...state.chapterDirtyTimestamps,
            [sectionId]: Date.now(),
          },
        }));
      },

      clearChapterDirty: (sectionId) => {
        set((state) => {
          if (!sectionId) {
            return { chapterDirtyTimestamps: {} };
          }
          if (!(sectionId in state.chapterDirtyTimestamps)) {
            return state;
          }
          const next = { ...state.chapterDirtyTimestamps };
          delete next[sectionId];
          return { chapterDirtyTimestamps: next };
        });
      },

      reset: () => {
        set({ ...INITIAL_STATE });
        loggers.store.info("useWholeGuideStore reset");
      },
    }),
    {
      name: "nasge-whole-guide",
      version: 1,
      // 用 localStorage 而非 sessionStorage，刷新 / 关闭浏览器后状态可恢复
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        guideId: state.guideId,
        guideTitle: state.guideTitle,
        doc: state.doc,
        chapters: state.chapters,
        chapterDirtyTimestamps: state.chapterDirtyTimestamps,
        lastPulledAt: state.lastPulledAt,
        // 不持久化：status / error / lastPushedAt（瞬时状态）
        // 自动备份后续接入独立持久化通道
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<WholeGuideState> | null;
        return {
          ...current,
          guideId: p?.guideId ?? current.guideId,
          guideTitle: p?.guideTitle ?? current.guideTitle,
          doc: p?.doc ?? current.doc,
          chapters: p?.chapters ?? current.chapters,
          chapterDirtyTimestamps:
            p?.chapterDirtyTimestamps ?? current.chapterDirtyTimestamps,
          lastPulledAt: p?.lastPulledAt ?? current.lastPulledAt,
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          loggers.persist.error("useWholeGuideStore rehydration 失败", error);
        }
      },
    }
  )
);
