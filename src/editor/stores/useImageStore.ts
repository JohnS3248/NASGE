/**
 * 统一图片状态管理 Store
 *
 * 设计原则：
 * - 单一真相源：替代原有的三个分散 Store
 * - 统一状态机：清晰的生命周期管理
 * - 简化数据流：减少状态同步复杂度
 *
 * 替代的 Store：
 * - useImageUploadStore (上传记录)
 * - useEditorImageNodeStore (编辑器节点)
 * - useSteamGuideImageStore (Steam 图片池)
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  ImageEntity,
  ImageLifecycleStatus,
  CreateImageParams,
  ImportFromSteamPoolParams,
  ImportFromBBCodeParams,
  SteamImageUrls,
  ImageDisplaySettings,
  ImageSizePreset,
  ImageAlignment
} from "../types/image";
import {
  generateImageId,
  DEFAULT_DISPLAY_SETTINGS
} from "../types/image";

// ============================================================================
// Store State Type
// ============================================================================

interface ImageStoreState {
  // === 数据 ===
  /** 所有图片实体，以 imageId 为键 */
  images: Record<string, ImageEntity>;

  // === Steam 图片池状态 ===
  /** Steam 图片池是否已加载 */
  steamPoolLoaded: boolean;
  /** Steam 图片池加载状态 */
  steamPoolStatus: "idle" | "loading" | "ready" | "error";
  /** Steam 图片池加载错误 */
  steamPoolError?: string;

  // === 基础操作 ===

  /**
   * 添加本地图片
   * @param params 图片参数
   * @returns 创建的图片实体
   */
  addLocalImage: (params: CreateImageParams) => ImageEntity;

  /**
   * 从 Steam 图片池导入图片
   * @param params 导入参数
   * @returns 创建的图片实体
   */
  importFromSteamPool: (params: ImportFromSteamPoolParams) => ImageEntity;

  /**
   * 从 BBCode 导入图片（可能是有效或失效的引用）
   * @param params 导入参数
   * @returns 创建的图片实体
   */
  importFromBBCode: (params: ImportFromBBCodeParams) => ImageEntity;

  // === 状态更新 ===

  /**
   * 标记图片为上传中
   */
  markUploading: (imageId: string) => void;

  /**
   * 标记图片为已上传
   */
  markUploaded: (imageId: string, steamPreviewId: string, steamUrls: SteamImageUrls) => void;

  /**
   * 标记图片为已同步（Steam 图片池中存在）
   */
  markSynced: (imageId: string) => void;

  /**
   * 标记图片上传失败
   */
  markError: (imageId: string, error: string) => void;

  /**
   * 标记图片引用失效（Steam 图片池中不存在）
   */
  markOrphaned: (imageId: string) => void;

  // === 更新操作 ===

  /**
   * 更新图片显示设置
   */
  updateDisplay: (imageId: string, display: Partial<ImageDisplaySettings>) => void;

  /**
   * 更新图片的 Steam URLs
   */
  updateSteamUrls: (imageId: string, steamUrls: SteamImageUrls) => void;

  /**
   * 设置 sourceNodeId（用于迁移期间去重）
   */
  updateSourceNodeId: (imageId: string, sourceNodeId: string) => void;

  // === 删除操作 ===

  /**
   * 删除图片
   */
  removeImage: (imageId: string) => void;

  /**
   * 清理所有本地图片（保留已同步的）
   */
  clearLocalImages: () => void;

  // === 查询操作 ===

  /**
   * 根据 imageId 获取图片
   */
  getImageById: (imageId: string) => ImageEntity | undefined;

  /**
   * 根据 Steam 预览 ID 获取图片
   */
  getImageBySteamPreviewId: (steamPreviewId: string) => ImageEntity | undefined;

  /**
   * 根据旧 Store 的 nodeId 获取图片（用于迁移期间去重）
   */
  getImageBySourceNodeId: (sourceNodeId: string) => ImageEntity | undefined;

  /**
   * 获取指定状态的所有图片
   */
  getImagesByStatus: (status: ImageLifecycleStatus) => ImageEntity[];

  /**
   * 获取待上传的图片列表
   */
  getPendingUploads: () => ImageEntity[];

  /**
   * 获取所有已上传的图片（用于图片池显示）
   */
  getUploadedImages: () => ImageEntity[];

  // === Steam 图片池同步 ===

  /**
   * 设置 Steam 图片池加载状态
   */
  setSteamPoolStatus: (status: "idle" | "loading" | "ready" | "error", error?: string) => void;

  /**
   * 同步 Steam 图片池数据
   * 将 Steam 图片池中的图片合并到 Store 中
   */
  syncFromSteamPool: (steamImages: Array<{
    previewId: string;
    fileName: string;
    thumbnailUrl?: string;
    originalUrl?: string;
  }>) => void;

  /**
   * 验证所有图片引用
   * 将不在 Steam 图片池中的图片标记为 orphaned
   */
  validateReferences: (validSteamPreviewIds: Set<string>) => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useImageStore = create<ImageStoreState>()(
  persist(
    (set, get) => ({
      // === 初始状态 ===
      images: {},
      steamPoolLoaded: false,
      steamPoolStatus: "idle",
      steamPoolError: undefined,

      // === 基础操作 ===

      addLocalImage: (params) => {
        const id = generateImageId();
        const now = Date.now();

        const image: ImageEntity = {
          id,
          status: "local",
          fileName: params.fileName,
          originalName: params.originalName,
          fileSize: params.fileSize,
          mimeType: params.mimeType,
          dimensions: params.dimensions,
          localPreviewUrl: params.localPreviewUrl,
          display: {
            ...DEFAULT_DISPLAY_SETTINGS,
            ...params.display
          },
          source: params.source,
          createdAt: now
        };

        set((state) => ({
          images: {
            ...state.images,
            [id]: image
          }
        }));

        console.log("[ImageStore] 添加本地图片", { id, fileName: params.fileName });
        return image;
      },

      importFromSteamPool: (params) => {
        // 检查是否已存在相同 steamPreviewId 的图片
        const existing = get().getImageBySteamPreviewId(params.steamPreviewId);
        if (existing) {
          console.log("[ImageStore] Steam 图片已存在", { steamPreviewId: params.steamPreviewId });
          return existing;
        }

        const id = generateImageId();
        const now = Date.now();

        const image: ImageEntity = {
          id,
          steamPreviewId: params.steamPreviewId,
          status: "synced",
          fileName: params.fileName,
          originalName: params.fileName,
          fileSize: 0, // 未知
          mimeType: "image/unknown",
          steamUrls: {
            thumbnailUrl: params.thumbnailUrl,
            originalUrl: params.originalUrl
          },
          display: DEFAULT_DISPLAY_SETTINGS,
          source: "steam-pool",
          createdAt: now
        };

        set((state) => ({
          images: {
            ...state.images,
            [id]: image
          }
        }));

        console.log("[ImageStore] 从 Steam 图片池导入", { id, steamPreviewId: params.steamPreviewId });
        return image;
      },

      importFromBBCode: (params) => {
        // 检查是否已存在相同 steamPreviewId 的图片
        const existing = get().getImageBySteamPreviewId(params.steamPreviewId);
        if (existing) {
          // 更新显示设置（如果提供）
          if (params.sizePreset || params.alignment) {
            get().updateDisplay(existing.id, {
              preset: params.sizePreset,
              alignment: params.alignment
            });
          }
          return existing;
        }

        const id = generateImageId();
        const now = Date.now();

        // 从 BBCode 导入时，图片可能有效（synced）或失效（orphaned）
        // 初始状态设为 uploaded，等待 validateReferences 确认
        const image: ImageEntity = {
          id,
          steamPreviewId: params.steamPreviewId,
          status: "uploaded", // 待验证
          fileName: params.fileName,
          originalName: params.fileName,
          fileSize: 0,
          mimeType: "image/unknown",
          display: {
            preset: params.sizePreset ?? DEFAULT_DISPLAY_SETTINGS.preset,
            alignment: params.alignment ?? DEFAULT_DISPLAY_SETTINGS.alignment
          },
          source: "bbcode",
          createdAt: now
        };

        set((state) => ({
          images: {
            ...state.images,
            [id]: image
          }
        }));

        console.log("[ImageStore] 从 BBCode 导入", { id, steamPreviewId: params.steamPreviewId });
        return image;
      },

      // === 状态更新 ===

      markUploading: (imageId) => {
        set((state) => {
          const image = state.images[imageId];
          if (!image) return state;

          return {
            images: {
              ...state.images,
              [imageId]: {
                ...image,
                status: "uploading",
                error: undefined
              }
            }
          };
        });
        console.log("[ImageStore] 标记上传中", { imageId });
      },

      markUploaded: (imageId, steamPreviewId, steamUrls) => {
        set((state) => {
          const image = state.images[imageId];
          if (!image) return state;

          return {
            images: {
              ...state.images,
              [imageId]: {
                ...image,
                status: "uploaded",
                steamPreviewId,
                steamUrls,
                uploadedAt: Date.now(),
                error: undefined
              }
            }
          };
        });
        console.log("[ImageStore] 标记已上传", { imageId, steamPreviewId });
      },

      markSynced: (imageId) => {
        set((state) => {
          const image = state.images[imageId];
          if (!image) return state;

          return {
            images: {
              ...state.images,
              [imageId]: {
                ...image,
                status: "synced"
              }
            }
          };
        });
      },

      markError: (imageId, error) => {
        set((state) => {
          const image = state.images[imageId];
          if (!image) return state;

          return {
            images: {
              ...state.images,
              [imageId]: {
                ...image,
                status: "error",
                error
              }
            }
          };
        });
        console.error("[ImageStore] 标记错误", { imageId, error });
      },

      markOrphaned: (imageId) => {
        set((state) => {
          const image = state.images[imageId];
          if (!image) return state;

          return {
            images: {
              ...state.images,
              [imageId]: {
                ...image,
                status: "orphaned"
              }
            }
          };
        });
        console.warn("[ImageStore] 标记引用失效", { imageId });
      },

      // === 更新操作 ===

      updateDisplay: (imageId, display) => {
        set((state) => {
          const image = state.images[imageId];
          if (!image) return state;

          return {
            images: {
              ...state.images,
              [imageId]: {
                ...image,
                display: {
                  ...image.display,
                  ...display
                }
              }
            }
          };
        });
      },

      updateSteamUrls: (imageId, steamUrls) => {
        set((state) => {
          const image = state.images[imageId];
          if (!image) return state;

          return {
            images: {
              ...state.images,
              [imageId]: {
                ...image,
                steamUrls: {
                  ...image.steamUrls,
                  ...steamUrls
                }
              }
            }
          };
        });
      },

      updateSourceNodeId: (imageId, sourceNodeId) => {
        set((state) => {
          const image = state.images[imageId];
          if (!image) return state;

          return {
            images: {
              ...state.images,
              [imageId]: {
                ...image,
                sourceNodeId
              }
            }
          };
        });
      },

      // === 删除操作 ===

      removeImage: (imageId) => {
        set((state) => {
          const { [imageId]: removed, ...rest } = state.images;
          return { images: rest };
        });
        console.log("[ImageStore] 删除图片", { imageId });
      },

      clearLocalImages: () => {
        set((state) => {
          const filtered = Object.fromEntries(
            Object.entries(state.images).filter(
              ([, img]) => img.status === "synced" || img.status === "uploaded"
            )
          );
          return { images: filtered };
        });
      },

      // === 查询操作 ===

      getImageById: (imageId) => {
        return get().images[imageId];
      },

      getImageBySteamPreviewId: (steamPreviewId) => {
        const images = get().images;
        return Object.values(images).find(
          (img) => img.steamPreviewId === steamPreviewId
        );
      },

      getImageBySourceNodeId: (sourceNodeId) => {
        const images = get().images;
        return Object.values(images).find(
          (img) => img.sourceNodeId === sourceNodeId
        );
      },

      getImagesByStatus: (status) => {
        const images = get().images;
        return Object.values(images).filter((img) => img.status === status);
      },

      getPendingUploads: () => {
        const images = get().images;
        return Object.values(images).filter((img) => img.status === "local");
      },

      getUploadedImages: () => {
        const images = get().images;
        return Object.values(images).filter(
          (img) => img.status === "uploaded" || img.status === "synced"
        );
      },

      // === Steam 图片池同步 ===

      setSteamPoolStatus: (status, error) => {
        set({
          steamPoolStatus: status,
          steamPoolError: error,
          steamPoolLoaded: status === "ready"
        });
      },

      syncFromSteamPool: (steamImages) => {
        const state = get();
        const steamPreviewIds = new Set(steamImages.map((img) => img.previewId));

        set((currentState) => {
          const updatedImages = { ...currentState.images };

          // 1. 更新现有图片的 Steam URLs 和状态
          for (const image of Object.values(updatedImages)) {
            if (image.steamPreviewId && steamPreviewIds.has(image.steamPreviewId)) {
              const steamImage = steamImages.find(
                (s) => s.previewId === image.steamPreviewId
              );
              if (steamImage) {
                updatedImages[image.id] = {
                  ...image,
                  status: "synced",
                  steamUrls: {
                    thumbnailUrl: steamImage.thumbnailUrl,
                    originalUrl: steamImage.originalUrl
                  }
                };
              }
            }
          }

          // 2. 添加新的 Steam 图片（不在 Store 中的）
          for (const steamImage of steamImages) {
            const exists = Object.values(updatedImages).some(
              (img) => img.steamPreviewId === steamImage.previewId
            );
            if (!exists) {
              const id = generateImageId();
              updatedImages[id] = {
                id,
                steamPreviewId: steamImage.previewId,
                status: "synced",
                fileName: steamImage.fileName,
                originalName: steamImage.fileName,
                fileSize: 0,
                mimeType: "image/unknown",
                steamUrls: {
                  thumbnailUrl: steamImage.thumbnailUrl,
                  originalUrl: steamImage.originalUrl
                },
                display: DEFAULT_DISPLAY_SETTINGS,
                source: "steam-pool",
                createdAt: Date.now()
              };
            }
          }

          return {
            images: updatedImages,
            steamPoolLoaded: true,
            steamPoolStatus: "ready"
          };
        });

        console.log("[ImageStore] Steam 图片池同步完成", {
          steamImageCount: steamImages.length,
          totalImages: Object.keys(get().images).length
        });
      },

      validateReferences: (validSteamPreviewIds) => {
        set((state) => {
          const updatedImages = { ...state.images };
          let orphanedCount = 0;

          for (const image of Object.values(updatedImages)) {
            // 只检查有 steamPreviewId 且状态为 uploaded 的图片
            if (
              image.steamPreviewId &&
              (image.status === "uploaded" || image.status === "synced")
            ) {
              if (!validSteamPreviewIds.has(image.steamPreviewId)) {
                updatedImages[image.id] = {
                  ...image,
                  status: "orphaned"
                };
                orphanedCount++;
              } else if (image.status === "uploaded") {
                // 在图片池中存在，标记为 synced
                updatedImages[image.id] = {
                  ...image,
                  status: "synced"
                };
              }
            }
          }

          if (orphanedCount > 0) {
            console.warn("[ImageStore] 发现失效引用", { orphanedCount });
          }

          return { images: updatedImages };
        });
      }
    }),
    {
      name: "nasge-image-store",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // 只持久化必要的数据
      partialize: (state) => ({
        images: Object.fromEntries(
          Object.entries(state.images).filter(([, img]) => {
            // 不持久化本地预览 URL（blob: URL 无法持久化）
            // 只持久化有 steamPreviewId 的图片
            return img.steamPreviewId != null;
          }).map(([id, img]) => [
            id,
            {
              ...img,
              localPreviewUrl: undefined // 清除 blob URL
            }
          ])
        )
      })
    }
  )
);

// ============================================================================
// Selector Hooks
// ============================================================================

/**
 * 获取指定图片
 */
export function useImage(imageId: string | null | undefined) {
  return useImageStore((state) =>
    imageId ? state.images[imageId] : undefined
  );
}

/**
 * 根据 Steam 预览 ID 获取图片
 */
export function useImageBySteamPreviewId(steamPreviewId: string | null | undefined) {
  return useImageStore((state) => {
    if (!steamPreviewId) return undefined;
    return Object.values(state.images).find(
      (img) => img.steamPreviewId === steamPreviewId
    );
  });
}

/**
 * 获取待上传图片列表
 */
export function usePendingUploads() {
  return useImageStore((state) =>
    Object.values(state.images).filter((img) => img.status === "local")
  );
}

/**
 * 获取已上传图片列表（用于图片池显示）
 */
export function useUploadedImages() {
  return useImageStore((state) =>
    Object.values(state.images).filter(
      (img) => img.status === "uploaded" || img.status === "synced"
    )
  );
}

/**
 * 获取 Steam 图片池加载状态
 */
export function useSteamPoolStatus() {
  return useImageStore((state) => ({
    loaded: state.steamPoolLoaded,
    status: state.steamPoolStatus,
    error: state.steamPoolError
  }));
}
