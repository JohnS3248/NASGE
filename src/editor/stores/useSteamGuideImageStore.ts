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

    // 添加初始延迟和重试逻辑，解决首次加载连接失败问题
    const fetchWithRetry = async (retries = 3, initialDelay = 300) => {
      // 初始延迟：给 Steam content script 时间准备
      await new Promise(resolve => setTimeout(resolve, initialDelay));

      let delay = 500;
      for (let i = 0; i < retries; i++) {
        try {
          const list = await fetchSteamGuideImages("chapter-preview");
          console.log('[NASGE] 图片池加载成功', { count: list.length });
          set({ items: list, status: "ready" });
          return;
        } catch (error) {
          const isConnectionError = error instanceof Error &&
            (error.message.includes('Could not establish connection') ||
             error.message.includes('Receiving end does not exist'));

          if (isConnectionError && i < retries - 1) {
            // 静默重试
            console.info(`[NASGE] 连接图片池中，${delay}ms 后重试 (${i + 1}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
          } else {
            // 最终失败
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[NASGE] 图片池加载失败:', errorMessage);
            set({
              status: "error",
              error: isConnectionError
                ? "无法连接到 Steam 页面，请确保已打开指南编辑页面"
                : errorMessage
            });
            return;
          }
        }
      }
    };

    await fetchWithRetry();
  },
  removeItem: (previewId: string) => {
    set((state) => ({
      items: state.items.filter((item) => item.previewId !== previewId)
    }));
  }
}));
