import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ReviewFormData } from "../../shared/messages";
import { loggers } from "../../shared/logger";

type ReviewSettings = {
  ratedUp: boolean | null;
  visibility: "public" | "friends";
  language: string;
  enableComments: boolean;
  attachHardware: boolean;
  receivedCompensation: boolean;
};

type ReviewState = {
  // 当前评测连接信息
  appId: string | null;
  gameName: string;
  hasExistingReview: boolean;
  recommendationId: string | null;

  // 设置项
  settings: ReviewSettings;

  // Actions
  setReviewInfo: (data: ReviewFormData) => void;
  updateSettings: (partial: Partial<ReviewSettings>) => void;
  selectGame: (appId: string | null, gameName?: string) => void;
  clearConnection: () => void;
  reset: () => void;
};

const DEFAULT_SETTINGS: ReviewSettings = {
  ratedUp: null,
  visibility: "public",
  language: "schinese",
  enableComments: true,
  attachHardware: false,
  receivedCompensation: false,
};

export const useReviewStore = create<ReviewState>()(
  persist(
    (set) => ({
      appId: null,
      gameName: "",
      hasExistingReview: false,
      recommendationId: null,
      settings: { ...DEFAULT_SETTINGS },

      setReviewInfo: (data: ReviewFormData) => {
        set({
          appId: data.appId,
          gameName: data.gameName,
          hasExistingReview: data.hasExistingReview,
          recommendationId: data.recommendationId,
          settings: {
            ratedUp: data.ratedUp,
            visibility: data.visibility,
            language: data.language,
            enableComments: data.enableComments,
            attachHardware: data.attachHardware,
            receivedCompensation: data.receivedCompensation,
          },
        });
      },

      updateSettings: (partial) => {
        set((state) => ({
          settings: { ...state.settings, ...partial },
        }));
      },

      selectGame: (appId, gameName) => {
        set({ appId, gameName: gameName || "" });
      },

      clearConnection: () => {
        set({
          appId: null,
          gameName: "",
          hasExistingReview: false,
          recommendationId: null,
        });
      },

      reset: () => {
        set({
          appId: null,
          gameName: "",
          hasExistingReview: false,
          recommendationId: null,
          settings: { ...DEFAULT_SETTINGS },
        });
      },
    }),
    {
      name: "nasge-review",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        settings: state.settings,
        // appId/gameName 由 sessionStorage 管理（标签页隔离）
      }),

      merge: (persisted: unknown, current: ReviewState) => ({
        ...current,
        settings: (persisted as Partial<ReviewState>)?.settings ?? current.settings,
      }),

      onRehydrateStorage: () => (_state, error) => {
        if (error) return;
        try {
          const saved = sessionStorage.getItem('nasge-tab-review');
          if (saved) {
            const { appId, gameName } = JSON.parse(saved);
            if (appId) useReviewStore.setState({ appId, gameName: gameName || '' });
          }
        } catch (error) { loggers.persist.warn('useReviewStore session 恢复失败:', error); }
      },
    }
  )
);

// 同步 appId/gameName 到 sessionStorage（标签页隔离）
useReviewStore.subscribe((state, prev) => {
  if (state.appId !== prev.appId || state.gameName !== prev.gameName) {
    if (state.appId) {
      sessionStorage.setItem('nasge-tab-review', JSON.stringify({
        appId: state.appId,
        gameName: state.gameName,
      }));
    } else {
      sessionStorage.removeItem('nasge-tab-review');
    }
  }
});
