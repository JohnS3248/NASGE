/**
 * ImageUploadService - 统一图片上传服务
 *
 * 设计目标：
 * - 提供统一的上传入口，消除重复逻辑
 * - 使用新的 useImageStore 作为主要状态管理
 * - 迁移期间保持与旧 Store 的双写兼容
 *
 * 数据流：
 * - 新 Store (useImageStore): 本服务直接更新
 * - 旧 Store (useImageUploadStore): 通过 imageUploadManager 更新
 * - 编辑器节点 (useEditorImageNodeStore): 本服务双写更新
 */

import { useImageStore } from "../stores/useImageStore";
import { useEditorImageNodeStore } from "../stores/useEditorImageNodeStore";
import { useSteamGuideImageStore } from "../stores/useSteamGuideImageStore";
import { uploadImageViaSteam } from "./imageUploadManager";
import type { SteamImageUrls, ImageSource } from "../types/image";
import type { ImageUploadSource } from "../stores/useImageUploadStore";
import { loggers } from "../../shared/logger";

// ============================================================================
// Types
// ============================================================================

export interface UploadOptions {
  /**
   * 跳过旧 Store 的双写（迁移完成后使用）
   */
  skipLegacySync?: boolean;
}

export interface SingleUploadResult {
  success: boolean;
  imageId: string;
  steamPreviewId?: string;
  error?: string;
}

export interface BatchUploadResult {
  success: Array<{ imageId: string; steamPreviewId: string }>;
  failed: Array<{ imageId: string; error: string }>;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * 将 Data URL 转换为 File 对象
 */
async function convertDataUrlToFile(dataUrl: string, fileName: string): Promise<File> {
  const response = await fetch(dataUrl);
  const blobData = await response.blob();

  const mimeTypeMatch = dataUrl.match(/^data:([^;,]+)/);
  const mimeType = mimeTypeMatch?.[1] || blobData.type || "image/png";

  return new File([blobData], fileName, {
    type: mimeType,
    lastModified: Date.now()
  });
}

/**
 * 从旧 Store 获取图片数据 URL
 */
function getPreviewDataUrlFromLegacyStore(sourceNodeId: string): string | undefined {
  const legacyNode = useEditorImageNodeStore.getState().nodes[sourceNodeId];
  return legacyNode?.metadata?.previewDataUrl;
}

// ============================================================================
// Main Service Class
// ============================================================================

class ImageUploadServiceImpl {
  /**
   * 上传单张图片（通过新 Store 的 imageId）
   *
   * @param imageId 新 Store 中的图片 ID
   * @param options 上传选项
   * @returns 上传结果
   */
  async uploadByImageId(
    imageId: string,
    options: UploadOptions = {}
  ): Promise<SingleUploadResult> {
    const store = useImageStore.getState();
    const image = store.getImageById(imageId);

    if (!image) {
      return {
        success: false,
        imageId,
        error: "图片不存在"
      };
    }

    // 如果已经有 steamPreviewId，直接返回
    if (image.steamPreviewId) {
      loggers.image.verbose("ImageUploadService 图片已上传", {
        imageId,
        steamPreviewId: image.steamPreviewId
      });
      return {
        success: true,
        imageId,
        steamPreviewId: image.steamPreviewId
      };
    }

    // 获取本地预览数据
    let previewDataUrl = image.localPreviewUrl;

    // 如果新 Store 没有预览数据，尝试从旧 Store 获取
    if (!previewDataUrl && image.sourceNodeId) {
      previewDataUrl = getPreviewDataUrlFromLegacyStore(image.sourceNodeId);
    }

    if (!previewDataUrl) {
      const errorMsg = "图片预览数据不存在，无法上传。请重新添加图片后再试。";
      store.markError(imageId, errorMsg);
      return {
        success: false,
        imageId,
        error: errorMsg
      };
    }

    // 标记为上传中
    store.markUploading(imageId);

    // 双写：同时更新旧 Store（迁移期间）
    if (!options.skipLegacySync && image.sourceNodeId) {
      const legacyStore = useEditorImageNodeStore.getState();
      legacyStore.markUploading(image.sourceNodeId);

      const legacyNode = legacyStore.nodes[image.sourceNodeId];
      if (legacyNode?.fileName) {
        useSteamGuideImageStore.getState().setImageState(legacyNode.fileName, "uploading");
      }
    }

    try {
      // 重建 File 对象
      const file = await convertDataUrlToFile(previewDataUrl, image.fileName);

      loggers.image.info("ImageUploadService 开始上传", {
        imageId,
        fileName: file.name,
        fileSize: file.size
      });

      // 调用 Steam 上传 API
      // 转换 ImageSource 到 ImageUploadSource（旧类型系统）
      const legacySource: ImageUploadSource | undefined =
        image.source === "steam-pool" || image.source === "bbcode"
          ? "paste"  // 映射到合法的旧类型
          : image.source as ImageUploadSource;

      const uploadResponse = await uploadImageViaSteam(
        file,
        "chapter-preview",
        { source: legacySource },
        {
          onPrepared: (uploadRecord) => {
            // 双写：附加上传记录到旧 Store
            if (!options.skipLegacySync && image.sourceNodeId) {
              useEditorImageNodeStore.getState().attachUploadRecord(
                image.sourceNodeId,
                uploadRecord
              );
            }
          },
          onUploading: () => {
            loggers.image.verbose("ImageUploadService Steam 正在处理上传...");
          },
          onUploaded: (uploadRecord, uploadResult) => {
            const steamPreviewId = uploadResult.previewIds[0];
            const steamUrls: SteamImageUrls = {
              // Steam 上传结果可能不包含 URL，等待图片池刷新
            };

            // 更新新 Store
            store.markUploaded(imageId, steamPreviewId, steamUrls);

            // 双写：更新旧 Store
            if (!options.skipLegacySync && image.sourceNodeId) {
              useEditorImageNodeStore.getState().markUploaded(image.sourceNodeId, {
                record: uploadRecord,
                result: uploadResult
              });
              // 刷新图片池
              useSteamGuideImageStore.getState().refresh();
            }
          },
          onFailed: (_, errorMessage) => {
            // 更新新 Store
            store.markError(imageId, errorMessage);

            // 双写：更新旧 Store
            if (!options.skipLegacySync && image.sourceNodeId) {
              useEditorImageNodeStore.getState().markFailed(image.sourceNodeId, errorMessage);
            }
          }
        }
      );

      const steamPreviewId = uploadResponse.result.previewIds[0];
      if (!steamPreviewId) {
        throw new Error("Steam 上传成功但未返回 previewId");
      }

      loggers.image.info("ImageUploadService 上传成功", {
        imageId,
        steamPreviewId
      });

      return {
        success: true,
        imageId,
        steamPreviewId
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      loggers.image.error("ImageUploadService 上传失败", { imageId, error: errorMessage });

      // 确保状态已更新（可能在 onFailed 回调中已处理）
      const currentImage = store.getImageById(imageId);
      if (currentImage?.status !== "error") {
        store.markError(imageId, errorMessage);
      }

      // 双写：确保旧 Store 状态更新
      if (!options.skipLegacySync && image.sourceNodeId) {
        const legacyNode = useEditorImageNodeStore.getState().nodes[image.sourceNodeId];
        // 旧 Store 使用 "error" 状态（不是 "failed"）
        if (legacyNode?.status !== "error") {
          useEditorImageNodeStore.getState().markFailed(image.sourceNodeId, errorMessage);
        }
        if (legacyNode?.fileName) {
          useSteamGuideImageStore.getState().setImageState(
            legacyNode.fileName,
            "error",
            errorMessage
          );
        }
      }

      return {
        success: false,
        imageId,
        error: errorMessage
      };
    }
  }

  /**
   * 上传单张图片（通过旧 Store 的 nodeId）
   *
   * 用于迁移期间的向后兼容
   *
   * @param nodeId 旧 Store 中的节点 ID
   * @param options 上传选项
   * @returns 上传结果
   */
  async uploadByNodeId(
    nodeId: string,
    options: UploadOptions = {}
  ): Promise<SingleUploadResult> {
    const store = useImageStore.getState();

    // 尝试通过 sourceNodeId 找到对应的新 Store 图片
    let image = store.getImageBySourceNodeId(nodeId);

    // 如果找不到，可能是还没同步到新 Store，尝试从旧 Store 创建
    if (!image) {
      const legacyNode = useEditorImageNodeStore.getState().nodes[nodeId];
      if (!legacyNode) {
        return {
          success: false,
          imageId: nodeId,
          error: "图片节点不存在"
        };
      }

      // 如果旧节点已有 previewId，直接返回
      if (legacyNode.previewId) {
        loggers.image.verbose("ImageUploadService 旧节点已有 previewId", {
          nodeId,
          previewId: legacyNode.previewId
        });
        return {
          success: true,
          imageId: nodeId,
          steamPreviewId: legacyNode.previewId
        };
      }

      // 从旧 Store 同步到新 Store
      // 注意：旧 Store 没有 mimeType，使用 originalSize 而不是 intrinsicSize
      const legacySource = legacyNode.metadata?.source;
      const newSource: ImageSource =
        legacySource === "clipboard-url" ? "paste" : (legacySource || "paste");

      const newImage = store.addLocalImage({
        fileName: legacyNode.fileName || legacyNode.originalName,
        originalName: legacyNode.originalName,
        fileSize: legacyNode.fileSize,
        mimeType: "image/unknown",  // 旧 Store 没有此字段
        source: newSource,
        localPreviewUrl: legacyNode.metadata?.previewDataUrl,
        dimensions: legacyNode.originalSize
      });

      store.updateSourceNodeId(newImage.id, nodeId);
      image = newImage;

      loggers.image.info("ImageUploadService 从旧 Store 同步图片", {
        nodeId,
        newImageId: newImage.id
      });
    }

    // 使用新的 imageId 上传
    return this.uploadByImageId(image.id, options);
  }

  /**
   * 批量上传多张图片
   *
   * @param imageIds 图片 ID 列表（新 Store 的 imageId 或旧 Store 的 nodeId）
   * @param options 上传选项
   * @returns 批量上传结果
   */
  async uploadMultiple(
    imageIds: string[],
    options: UploadOptions & {
      /**
       * 最大并发数（默认 3）
       */
      concurrency?: number;
      /**
       * 使用旧 Store 的 nodeId（默认 false，使用新 Store 的 imageId）
       */
      useNodeId?: boolean;
    } = {}
  ): Promise<BatchUploadResult> {
    const { concurrency = 3, useNodeId = false, ...uploadOptions } = options;
    const success: Array<{ imageId: string; steamPreviewId: string }> = [];
    const failed: Array<{ imageId: string; error: string }> = [];

    loggers.image.info(`ImageUploadService 开始批量上传 ${imageIds.length} 张图片`);

    // 分块并发上传
    const chunks: string[][] = [];
    for (let i = 0; i < imageIds.length; i += concurrency) {
      chunks.push(imageIds.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(async (id) => {
        const result = useNodeId
          ? await this.uploadByNodeId(id, uploadOptions)
          : await this.uploadByImageId(id, uploadOptions);

        if (result.success && result.steamPreviewId) {
          success.push({ imageId: id, steamPreviewId: result.steamPreviewId });
        } else {
          failed.push({ imageId: id, error: result.error || "未知错误" });
        }
      });

      await Promise.all(promises);
    }

    loggers.image.info(`ImageUploadService 批量上传完成`, {
      success: success.length,
      failed: failed.length
    });

    return { success, failed };
  }

  /**
   * 上传所有待上传的图片
   *
   * @param options 上传选项
   * @returns 批量上传结果
   */
  async uploadAllPending(
    options: UploadOptions & { concurrency?: number } = {}
  ): Promise<BatchUploadResult> {
    const pending = useImageStore.getState().getPendingUploads();
    const imageIds = pending.map((img) => img.id);

    if (imageIds.length === 0) {
      loggers.image.verbose("ImageUploadService 没有待上传的图片");
      return { success: [], failed: [] };
    }

    return this.uploadMultiple(imageIds, options);
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * 图片上传服务单例
 *
 * 使用方式：
 * ```typescript
 * import { ImageUploadService } from "./services/ImageUploadService";
 *
 * // 上传单张图片（新 Store）
 * const result = await ImageUploadService.uploadByImageId(imageId);
 *
 * // 上传单张图片（旧 Store，迁移兼容）
 * const result = await ImageUploadService.uploadByNodeId(nodeId);
 *
 * // 批量上传
 * const results = await ImageUploadService.uploadMultiple([id1, id2, id3]);
 *
 * // 上传所有待上传图片
 * const results = await ImageUploadService.uploadAllPending();
 * ```
 */
export const ImageUploadService = new ImageUploadServiceImpl();

// ============================================================================
// Legacy Compatibility Functions
// ============================================================================

/**
 * 兼容函数：使用旧的 nodeId 上传
 *
 * @deprecated 迁移完成后请使用 ImageUploadService.uploadByImageId
 */
export async function uploadSingleImage(imageNodeId: string): Promise<string> {
  const result = await ImageUploadService.uploadByNodeId(imageNodeId);

  if (!result.success || !result.steamPreviewId) {
    throw new Error(result.error || "上传失败");
  }

  return result.steamPreviewId;
}

/**
 * 兼容函数：批量上传（使用旧的 nodeId）
 *
 * @deprecated 迁移完成后请使用 ImageUploadService.uploadMultiple
 */
export async function uploadMultipleImages(imageNodeIds: string[]): Promise<{
  success: Array<{ imageNodeId: string; previewId: string }>;
  failed: Array<{ imageNodeId: string; error: string }>;
}> {
  const result = await ImageUploadService.uploadMultiple(imageNodeIds, {
    useNodeId: true
  });

  return {
    success: result.success.map((r) => ({
      imageNodeId: r.imageId,
      previewId: r.steamPreviewId
    })),
    failed: result.failed.map((r) => ({
      imageNodeId: r.imageId,
      error: r.error
    }))
  };
}
