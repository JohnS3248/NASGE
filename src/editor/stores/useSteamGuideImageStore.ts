import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { SteamGuideImage } from "../../shared/messages";
import { fetchSteamGuideImages } from "../services/steamBridge";
import { useImageStore } from "./useImageStore";

type FetchStatus = "idle" | "loading" | "ready" | "error";

/**
 * 图片状态
 * - pending: 未上传（灰色）
 * - uploading: 上传中（黄色）
 * - success: 上传成功（绿色）
 * - error: 上传失败（红色）
 */
export type ImageState = "pending" | "uploading" | "success" | "error";

/**
 * 扩展的图片信息（包含状态）
 */
export type ImageWithState = SteamGuideImage & {
  state: ImageState;
  localUrl?: string;        // 本地临时 URL（用于未上传图片的预览）
  uploadError?: string;     // 上传错误信息
  uploadProgress?: number;  // 上传进度（0-100）
};

type SteamGuideImageState = {
  items: ImageWithState[];
  status: FetchStatus;
  error?: string;

  // === 基础操作 ===
  refresh: () => Promise<void>;
  removeItem: (previewId: string) => void;

  // === 状态管理 ===
  setImageState: (imageId: string, state: ImageState, error?: string) => void;
  setPreviewId: (imageId: string, previewId: string) => void;
  setUploadProgress: (imageId: string, progress: number) => void;

  // === 查询方法 ===
  getPendingImages: () => ImageWithState[];
  getImagesByState: (state: ImageState) => ImageWithState[];
  getImageById: (imageId: string) => ImageWithState | undefined;

  // === 本地图片管理 ===
  addLocalImage: (file: File) => Promise<ImageWithState>;
};

export const useSteamGuideImageStore = create<SteamGuideImageState>()(
  persist(
    (set, get) => ({
      items: [],
      status: "idle",
      error: undefined,

      // === 基础操作 ===
      refresh: async () => {
        set({ status: "loading", error: undefined });

        // 添加初始延迟和重试逻辑，解决首次加载和页面刷新后的连接/数据问题
        const fetchWithRetry = async (retries = 5, initialDelay = 500) => {
          // 初始延迟：给 Steam content script 和桥接脚本时间准备
          // 特别是在页面刷新后，需要等待 gPreviewImagesBridge 执行
          await new Promise(resolve => setTimeout(resolve, initialDelay));

          let delay = 800;
          for (let i = 0; i < retries; i++) {
            try {
              const list = await fetchSteamGuideImages("chapter-preview");
              console.log('[NASGE] 图片池加载成功', { count: list.length, attempt: i + 1 });

              // 检查是否所有图片都有 originalUrl（透明背景 URL）
              const hasTransparentUrls = list.every(item => item.originalUrl);
              console.log('[NASGE] 图片池透明 URL 检查', {
                total: list.length,
                hasTransparent: hasTransparentUrls,
                urls: list.map(item => ({ id: item.previewId, hasOriginal: !!item.originalUrl }))
              });

              // 如果获取到的图片没有 originalUrl，可能是桥接脚本还没执行完成
              // 继续重试（除非是最后一次）
              if (list.length > 0 && !hasTransparentUrls && i < retries - 1) {
                console.warn(`[NASGE] 图片池数据不完整（缺少透明 URL），${delay}ms 后重试 (${i + 1}/${retries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 1.5;
                continue;
              }

              // 将 Steam 图片标记为 success 状态
              const itemsWithState: ImageWithState[] = list.map(item => ({
                ...item,
                state: "success" as ImageState
              }));

              // 创建 previewId 集合，用于检查哪些本地图片已经在 Steam 图片池中
              const steamPreviewIds = new Set(list.map(item => item.previewId));

              // 合并本地图片：
              // - 保留 pending 和 uploading 状态的图片（尚未完成上传）
              // - 如果图片的 previewId 已经在 Steam 图片池中，则不重复添加
              const existingLocalImages = get().items.filter(item => {
                // 如果是 pending 或 uploading 状态，保留
                if (item.state === "pending" || item.state === "uploading") {
                  return true;
                }
                // 如果是 success 状态但 previewId 不在 Steam 图片池中，也保留
                // 这处理了刚上传成功但 gPreviewImages 还没更新的情况
                if (item.state === "success" && item.previewId && !steamPreviewIds.has(item.previewId)) {
                  return true;
                }
                return false;
              });

              set({
                items: [...itemsWithState, ...existingLocalImages],
                status: "ready"
              });

              // 验证 BBCode 导入的图片引用是否有效
              // 将不在 Steam 图片池中的图片标记为 orphaned
              useImageStore.getState().validateReferences(steamPreviewIds);

              return;
            } catch (error) {
              const isConnectionError = error instanceof Error &&
                (error.message.includes('Could not establish connection') ||
                 error.message.includes('Receiving end does not exist'));

              if (isConnectionError && i < retries - 1) {
                // 静默重试
                console.info(`[NASGE] 连接图片池中，${delay}ms 后重试 (${i + 1}/${retries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 1.5;
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
      },

      // === 状态管理 ===
      setImageState: (imageId: string, state: ImageState, error?: string) => {
        set((currentState) => ({
          items: currentState.items.map((item) =>
            item.previewId === imageId || item.fileName === imageId
              ? { ...item, state, uploadError: error }
              : item
          )
        }));
      },

      setPreviewId: (imageId: string, previewId: string) => {
        set((currentState) => ({
          items: currentState.items.map((item) =>
            item.fileName === imageId || item.previewId === imageId
              ? { ...item, previewId, state: "success" as ImageState }
              : item
          )
        }));
      },

      setUploadProgress: (imageId: string, progress: number) => {
        set((currentState) => ({
          items: currentState.items.map((item) =>
            item.previewId === imageId || item.fileName === imageId
              ? { ...item, uploadProgress: progress }
              : item
          )
        }));
      },

      // === 查询方法 ===
      getPendingImages: () => {
        return get().items.filter((item) => item.state === "pending");
      },

      getImagesByState: (state: ImageState) => {
        return get().items.filter((item) => item.state === state);
      },

      getImageById: (imageId: string) => {
        return get().items.find(
          (item) => item.previewId === imageId || item.fileName === imageId
        );
      },

      // === 本地图片管理 ===
      addLocalImage: async (file: File) => {
        // 创建本地临时 URL
        const localUrl = URL.createObjectURL(file);

        const newImage: ImageWithState = {
          previewId: "", // 未上传时为空
          fileName: file.name,
          thumbnailUrl: localUrl,
          localUrl: localUrl,
          state: "pending",
          uploadProgress: 0
        };

        set((state) => ({
          items: [...state.items, newImage]
        }));

        console.log('[NASGE] 添加本地图片到图片池', { fileName: file.name });

        return newImage;
      }
    }),
    {
      name: "nasge-image-pool",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // 只持久化本地图片（pending 状态），Steam 图片每次刷新获取
      partialize: (state) => ({
        items: state.items.filter(item => item.state === "pending")
      })
    }
  )
);
