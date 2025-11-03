import { create } from "zustand";
import type { SteamGuideImage } from "../../shared/messages";
import { fetchSteamGuideImages } from "../services/steamBridge";

type FetchStatus = "idle" | "loading" | "ready" | "error";

type SteamGuideImageState = {
  items: SteamGuideImage[];
  status: FetchStatus;
  error?: string;
  refresh: () => Promise<void>;
  removeItem: (previewId: string) => void;
};

export const useSteamGuideImageStore = create<SteamGuideImageState>((set) => ({
  items: [],
  status: "idle",
  error: undefined,
  refresh: async () => {
    set({ status: "loading", error: undefined });
    try {
      const list = await fetchSteamGuideImages("chapter-preview");
      set({ items: list, status: "ready" });
    } catch (error) {
      set({
        status: "error",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  },
  removeItem: (previewId: string) => {
    set((state) => ({
      items: state.items.filter((item) => item.previewId !== previewId)
    }));
  }
}));
