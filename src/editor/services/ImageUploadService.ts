/**
 * ImageUploadService - 统一图片上传服务
 *
 * 数据流：useImageStore 管理所有图片状态
 */

import { useImageStore } from "../stores/useImageStore";
import { useSteamGuideImageStore } from "../stores/useSteamGuideImageStore";
import { uploadSteamImage } from "./steamBridge";
import { formatUploadErrorMessage } from "./imageUploadManager";
import type { SteamImageUrls } from "../types/image";
import { loggers } from "../../shared/logger";

// ============================================================================
// Types
// ============================================================================

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
 * 从 imageNodeId（TipTap 节点属性）解析出 ImageEntity
 * imageNodeId 可能是 imageEntity.id、sourceNodeId 或 steamPreviewId
 */
function resolveImageEntity(nodeId: string) {
  const store = useImageStore.getState();
  return (
    store.getImageById(nodeId) ??
    store.getImageBySourceNodeId(nodeId) ??
    store.getImageBySteamPreviewId(nodeId)
  );
}

// ============================================================================
// Main Service Class
// ============================================================================

class ImageUploadServiceImpl {
  /**
   * 上传单张图片（通过 imageId）
   */
  async uploadByImageId(imageId: string): Promise<SingleUploadResult> {
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

    const previewDataUrl = image.localPreviewUrl;

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

    try {
      // 重建 File 对象
      const file = await convertDataUrlToFile(previewDataUrl, image.fileName);

      loggers.image.info("ImageUploadService 开始上传", {
        imageId,
        fileName: file.name,
        fileSize: file.size
      });

      // 直接调用 Steam 上传 API
      const uploadResult = await uploadSteamImage("chapter-preview", file, image.fileName);
      const steamPreviewId = uploadResult.previewIds[0];

      if (!steamPreviewId) {
        throw new Error("Steam 上传成功但未返回 previewId");
      }

      const steamUrls: SteamImageUrls = {};

      // 更新 Store
      store.markUploaded(imageId, steamPreviewId, steamUrls);

      // 刷新图片池
      useSteamGuideImageStore.getState().refresh();

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
      const errorMessage = formatUploadErrorMessage(error);
      loggers.image.error("ImageUploadService 上传失败", { imageId, error: errorMessage });

      // 确保状态已更新
      const currentImage = store.getImageById(imageId);
      if (currentImage?.status !== "error") {
        store.markError(imageId, errorMessage);
      }

      return {
        success: false,
        imageId,
        error: errorMessage
      };
    }
  }

  /**
   * 通过 TipTap 节点的 imageNodeId 上传图片
   * imageNodeId 可能是 imageEntity.id、sourceNodeId 或 steamPreviewId
   */
  async uploadByNodeId(nodeId: string): Promise<SingleUploadResult> {
    const image = resolveImageEntity(nodeId);

    if (!image) {
      return {
        success: false,
        imageId: nodeId,
        error: "图片不存在"
      };
    }

    return this.uploadByImageId(image.id);
  }

  /**
   * 批量上传多张图片
   */
  async uploadMultiple(
    imageIds: string[],
    options: { concurrency?: number } = {}
  ): Promise<BatchUploadResult> {
    const { concurrency = 3 } = options;
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
        const result = await this.uploadByImageId(id);

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
   */
  async uploadAllPending(
    options: { concurrency?: number } = {}
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

export const ImageUploadService = new ImageUploadServiceImpl();
