import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { SteamGuideImage } from "../../shared/messages";
import { fetchSteamGuideImages } from "../services/steamBridge";
import { useImageStore } from "./useImageStore";
import { useGuideStore } from "./useGuideStore";
import { loggers } from "../../shared/logger";

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
  contentHash?: string;     // 内容哈希（用于去重检测）
  linkedGuideId?: string;   // 关联的存档 ID（用于图片池隔离）
};

/**
 * 添加图片的结果
 */
export interface AddImageResult {
  image: ImageWithState;
  skipped: boolean;
  reason?: 'duplicate_uploaded' | 'duplicate_local';
  existingFileName?: string;
}

/**
 * 计算图片内容哈希（SHA-256）
 * 对于大文件只计算前 1MB
 */
async function computeImageHash(file: File): Promise<string> {
  const MAX_BYTES = 1024 * 1024; // 1MB
  const slice = file.size > MAX_BYTES ? file.slice(0, MAX_BYTES) : file;
  const buffer = await slice.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

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
  addLocalImage: (file: File, linkedGuideId?: string) => Promise<AddImageResult>;
  renameImage: (imageId: string, newFileName: string) => void;

  // === 存档关联 ===
  /**
   * 从存档加载缓存的图片
   * @param guideId - 存档 ID
   * @param triggerRefresh - 是否在缓存为空时触发 refresh（默认 true）
   *   - true: 用于"编辑此指南"入口，首次打开需要获取图片
   *   - false: 用于编辑器内切换存档，避免获取错误的图片
   */
  loadFromArchive: (guideId: string | null, triggerRefresh?: boolean) => void;
  getImagesByGuide: (guideId: string | null) => ImageWithState[];
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

        // 获取当前存档 ID
        const currentArchiveId = useGuideStore.getState().currentArchiveId;

        // 简化重试逻辑：2次重试，间隔500ms
        const fetchWithRetry = async (retries = 2, retryDelay = 500) => {
          for (let i = 0; i < retries; i++) {
            try {
              const list = await fetchSteamGuideImages("chapter-preview");
              loggers.image.info('图片池加载成功', { count: list.length, attempt: i + 1, archiveId: currentArchiveId });

              // 将 Steam 图片标记为 success 状态，并关联当前存档
              const itemsWithState: ImageWithState[] = list.map(item => ({
                ...item,
                state: "success" as ImageState,
                linkedGuideId: currentArchiveId ?? undefined
              }));

              // 创建 previewId 集合，用于检查哪些本地图片已经在 Steam 图片池中
              const steamPreviewIds = new Set(list.map(item => item.previewId));

              // 合并本地图片：
              // - 只保留当前存档的 pending 和 uploading 状态的图片
              // - success 状态的图片以 Steam 图片池为准
              const existingLocalImages = get().items.filter(item => {
                // 只保留 pending 或 uploading 状态的图片
                if (item.state === "pending" || item.state === "uploading") {
                  // 只保留当前存档的本地图片
                  return item.linkedGuideId === currentArchiveId;
                }
                return false;
              });

              set({
                items: [...itemsWithState, ...existingLocalImages],
                status: "ready"
              });

              // 保存图片元数据到存档缓存
              if (currentArchiveId) {
                useGuideStore.getState().updateArchive(currentArchiveId, {
                  cachedImages: list,
                  imagesUpdatedAt: Date.now()
                });
                loggers.image.info('图片元数据已缓存到存档', { archiveId: currentArchiveId, count: list.length });
              }

              // 同步 Steam 图片池数据到新 Store
              // 注意：不再调用 validateReferences，因为跨指南引用的图片是有效的
              // 图片的有效性应该由实际加载结果决定（onLoad/onError）
              useImageStore.getState().syncFromSteamPool(list);

              return;
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              const isConnectionError = errorMessage.includes('Could not establish connection') ||
                errorMessage.includes('Receiving end does not exist');

              if (i < retries - 1) {
                loggers.image.info(`图片池加载失败，${retryDelay}ms 后重试 (${i + 1}/${retries})`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
              } else {
                loggers.image.error('图片池加载失败:', errorMessage);
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
      /**
       * 添加本地图片到图片池
       * @param file - 图片文件
       * @param linkedGuideId - 关联的存档 ID（可选，用于图片池隔离）
       * @returns { image, skipped, reason } - skipped=true 表示跳过（重复内容）
       */
      addLocalImage: async (file: File, linkedGuideId?: string): Promise<AddImageResult> => {
        const items = get().items;

        // 内容哈希去重检测
        const contentHash = await computeImageHash(file);

        // 检查是否有相同内容的图片（已上传的）
        const existingByHash = items.find(item =>
          item.contentHash === contentHash && item.state === "success"
        );
        if (existingByHash) {
          loggers.image.info('检测到重复内容（已上传），跳过添加', {
            fileName: file.name,
            existingFileName: existingByHash.fileName,
            existingPreviewId: existingByHash.previewId
          });
          // 跳过，返回已存在的图片信息
          return {
            image: existingByHash,
            skipped: true,
            reason: 'duplicate_uploaded',
            existingFileName: existingByHash.fileName
          };
        }

        // 检查是否有相同内容的本地图片（待上传）
        const existingLocalByHash = items.find(item =>
          item.contentHash === contentHash && item.state === "pending"
        );
        if (existingLocalByHash) {
          loggers.image.info('检测到重复内容（本地），跳过添加', {
            fileName: file.name,
            existingFileName: existingLocalByHash.fileName
          });
          return {
            image: existingLocalByHash,
            skipped: true,
            reason: 'duplicate_local',
            existingFileName: existingLocalByHash.fileName
          };
        }

        // 文件名去重检测（仅对不同内容的同名文件）
        let finalFileName = file.name;
        const existingNames = new Set(items.map(item => item.fileName));

        if (existingNames.has(file.name)) {
          // 文件名冲突，生成新文件名
          const baseName = file.name.replace(/\.[^.]+$/, ''); // 去掉扩展名
          const ext = file.name.match(/\.[^.]+$/)?.[0] || ''; // 获取扩展名

          let counter = 2;
          while (existingNames.has(`${baseName}_${counter}${ext}`)) {
            counter++;
          }
          finalFileName = `${baseName}_${counter}${ext}`;

          loggers.image.info('文件名冲突，自动重命名', {
            original: file.name,
            renamed: finalFileName
          });
        }

        // 创建本地临时 URL
        const localUrl = URL.createObjectURL(file);

        const newImage: ImageWithState = {
          previewId: "", // 未上传时为空
          fileName: finalFileName,
          thumbnailUrl: localUrl,
          localUrl: localUrl,
          state: "pending",
          uploadProgress: 0,
          contentHash, // 保存哈希用于后续去重
          linkedGuideId // 关联存档 ID
        };

        set((state) => ({
          items: [...state.items, newImage]
        }));

        loggers.image.info('添加本地图片到图片池', { fileName: finalFileName });

        return { image: newImage, skipped: false };
      },

      renameImage: (imageId: string, newFileName: string) => {
        const image = get().items.find(
          item => item.previewId === imageId || item.fileName === imageId
        );

        // 只允许重命名待上传的图片
        if (!image || image.state !== "pending") {
          loggers.image.warn('无法重命名非待上传状态的图片', {
            imageId,
            state: image?.state
          });
          return;
        }

        set((state) => ({
          items: state.items.map((item) =>
            (item.previewId === imageId || item.fileName === imageId)
              ? { ...item, fileName: newFileName }
              : item
          )
        }));
        loggers.image.info('重命名图片', { imageId, newFileName });
      },

      // === 存档关联 ===
      /**
       * 从存档加载缓存的图片
       * @param guideId - 存档 ID
       * @param triggerRefresh - 是否在缓存为空时触发 refresh（默认 true）
       */
      loadFromArchive: (guideId: string | null, triggerRefresh: boolean = true) => {
        const currentStatus = get().status;

        // 如果 refresh 正在进行中，不干扰——让正在运行的 refresh 完成
        // 避免 loadFromArchive 设置 status="idle" 导致重复 refresh
        if (currentStatus === "loading") {
          loggers.image.info('图片池正在加载中，跳过 loadFromArchive', { guideId });
          return;
        }

        const currentItems = get().items;

        // 保留所有本地图片（pending/uploading/error 状态）
        const localImages = currentItems.filter(item =>
          item.state === "pending" || item.state === "uploading" || item.state === "error"
        );

        if (!guideId) {
          // 没有存档时，只保留本地图片，清空 Steam 图片
          set({ items: localImages, status: "idle" });
          loggers.image.info('切换到无存档模式，清空 Steam 图片');
          return;
        }

        // 从存档加载缓存的图片
        const archive = useGuideStore.getState().getArchive(guideId);
        const cachedImages = archive?.cachedImages || [];

        // 将缓存的图片转换为 ImageWithState
        const steamImages: ImageWithState[] = cachedImages.map(img => ({
          ...img,
          state: "success" as ImageState,
          linkedGuideId: guideId
        }));

        // 合并：缓存的 Steam 图片 + 当前存档的本地图片
        const archiveLocalImages = localImages.filter(img => img.linkedGuideId === guideId);

        // 决定 status：
        // - 有缓存：ready
        // - 无缓存 + triggerRefresh：idle（触发 refresh）
        // - 无缓存 + !triggerRefresh：ready（显示空，避免获取错误数据）
        const newStatus = cachedImages.length > 0 ? "ready" :
                         triggerRefresh ? "idle" : "ready";

        set({
          items: [...steamImages, ...archiveLocalImages],
          status: newStatus
        });

        loggers.image.info('从存档加载图片', {
          guideId,
          cachedCount: cachedImages.length,
          localCount: archiveLocalImages.length,
          triggerRefresh,
          newStatus
        });
      },

      /**
       * 获取指定存档的图片（用于 UI 过滤显示）
       * @param guideId - 存档 ID，null 表示显示未关联的图片
       */
      getImagesByGuide: (guideId: string | null): ImageWithState[] => {
        const items = get().items;
        return items.filter(item => {
          // Steam 图片（success 状态）：
          // - 如果有 linkedGuideId，按它过滤
          // - 如果没有 linkedGuideId（旧数据或 refresh 时 archiveId 还没设置），显示所有
          if (item.state === "success") {
            if (!item.linkedGuideId) {
              // 没有关联的 Steam 图片，显示（兼容旧数据）
              return true;
            }
            // 有关联的，按 guideId 过滤
            return guideId === null ? false : item.linkedGuideId === guideId;
          }

          // 本地图片（pending/uploading/error）严格按 linkedGuideId 过滤
          if (guideId === null) {
            return !item.linkedGuideId;
          }
          return item.linkedGuideId === guideId;
        });
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
