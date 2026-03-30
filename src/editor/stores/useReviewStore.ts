import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ReviewFormData } from "../../shared/messages";

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
        appId: state.appId,
        gameName: state.gameName,
        settings: state.settings,
      }),
    }
  )
);
