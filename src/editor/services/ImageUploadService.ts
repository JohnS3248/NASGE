/**
 * ImageUploadService - 统一图片上传服务
 *
 * 两种上传路径：
 * 1. 编辑器路径：uploadByImageId / uploadByNodeId — 通过 useImageStore 管理
 * 2. 图片池路径：queuePoolUpload — 通过 useSteamGuideImageStore 管理
 *    单线程顺序队列，支持 Error 29 (DuplicateRequest) 处理和自动重试
 */

import { useState, useEffect } from "react";
import { useImageStore } from "../stores/useImageStore";
import { useSteamGuideImageStore, type ImageWithState } from "../stores/useSteamGuideImageStore";
import { uploadSteamImage } from "./steamBridge";
import type { SteamImageUrls } from "../types/image";
import { loggers } from "../../shared/logger";
import { toast } from "../stores/useToastStore";
import { STEAM_IMAGE_SIZE_LIMIT } from "../constants/limits";
import i18n from "i18next";

/**
 * 格式化文件大小为可读字符串（MB，保留1位小数）
 */
function formatFileSize(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

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

export interface PoolQueueItem {
  id: string;
  image: ImageWithState;
  retryCount: number;
  addedAt: number;
}

export interface PoolQueueState {
  status: "idle" | "processing";
  queue: PoolQueueItem[];
  currentItem: PoolQueueItem | null;
  completedCount: number;
  failedCount: number;
  skippedCount: number;
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

/**
 * 上传错误消息格式化
 */
function formatUploadErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : "";
  if (rawMessage.includes("Could not establish connection") || rawMessage.includes("Receiving end does not exist")) {
    return "未能连接到 Steam 页面，请确认已打开 Steam 指南编辑页并刷新后重试。";
  }

  if (rawMessage.includes("The message port closed before a response was received")) {
    return "未收到 Steam 页面响应，请刷新相关页面后重试。";
  }

  if (rawMessage.includes("扩展尚未获得访问 Steam 网页的权限")) {
    return rawMessage;
  }

  if (/错误码\s*8/.test(rawMessage)) {
    return "Steam 返回错误 8：无法解析图片文件，请确认图片未损坏并重新尝试。";
  }

  if (/错误码\s*29/.test(rawMessage)) {
    return "Steam 返回错误 29：Steam 会话可能已失效或账号当前不可上传，请刷新 Steam 页面后重试。";
  }

  if (rawMessage) {
    return rawMessage;
  }

  return "上传失败，未知错误。";
}

/**
 * 检查是否为 Error 29 (DuplicateRequest)
 */
function isDuplicateRequestError(error: unknown): boolean {
  if (!error) return false;
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();
  return (
    /\b29\b/.test(errorMessage) ||
    lowerMessage.includes("duplicaterequest") ||
    lowerMessage.includes("duplicate") ||
    lowerMessage.includes("already exists")
  );
}

// ============================================================================
// Pool Upload Queue Config
// ============================================================================

const POOL_QUEUE_CONFIG = {
  uploadInterval: 1000,
  maxRetries: 2,
  retryDelay: 3000
};

// ============================================================================
// Main Service Class
// ============================================================================

class ImageUploadServiceImpl {
  // ---- Pool upload queue state ----
  private poolQueue: PoolQueueItem[] = [];
  private poolStatus: "idle" | "processing" = "idle";
  private poolCurrentItem: PoolQueueItem | null = null;
  private poolCompletedCount = 0;
  private poolFailedCount = 0;
  private poolSkippedCount = 0;
  private poolListeners: Set<() => void> = new Set();

  // ==================================================================
  // Editor upload methods (useImageStore)
  // ==================================================================

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

  // ==================================================================
  // Pool upload queue (useSteamGuideImageStore)
  // ==================================================================

  /**
   * 将图片添加到上传队列
   */
  queuePoolUpload(image: ImageWithState): void {
    const store = useSteamGuideImageStore.getState();

    // 前置检查：文件大小超限
    if (image.fileSize && image.fileSize > STEAM_IMAGE_SIZE_LIMIT) {
      const sizeMB = formatFileSize(image.fileSize);
      loggers.image.warn("图片超出 Steam 2MB 限制，阻止上传", { fileName: image.fileName, size: sizeMB });
      toast.error(i18n.t('image.uploadTooLarge', { ns: 'editor', fileName: image.fileName, size: sizeMB }));
      store.setImageState(image.fileName, "error", `超出 Steam 2MB 限制（${sizeMB}MB）`);
      return;
    }

    // 已上传成功
    if (image.previewId && image.state === "success") {
      loggers.image.verbose("图片已上传成功，跳过入队", { fileName: image.fileName, previewId: image.previewId });
      return;
    }

    // 图片池中已有同名已上传图片
    const existingInPool = store.items.find(
      item => item.fileName === image.fileName && item.state === "success" && item.previewId
    );
    if (existingInPool) {
      loggers.image.info("图片池中已存在同名已上传图片，跳过", {
        fileName: image.fileName,
        existingPreviewId: existingInPool.previewId
      });
      store.setPreviewId(image.fileName, existingInPool.previewId);
      this.poolSkippedCount++;
      this.notifyPoolListeners();
      return;
    }

    // 已在队列中
    if (this.poolQueue.some(item => item.id === image.fileName)) {
      loggers.image.verbose("图片已在队列中，跳过", { fileName: image.fileName });
      return;
    }

    // 正在上传
    if (this.poolCurrentItem?.id === image.fileName) {
      loggers.image.verbose("图片正在上传中，跳过", { fileName: image.fileName });
      return;
    }

    this.poolQueue.push({
      id: image.fileName,
      image,
      retryCount: 0,
      addedAt: Date.now()
    });

    loggers.image.info("图片加入上传队列", {
      fileName: image.fileName,
      queueLength: this.poolQueue.length
    });

    this.notifyPoolListeners();

    if (this.poolStatus === "idle") {
      void this.processPoolQueue();
    }
  }

  /**
   * 批量添加图片到上传队列
   */
  queuePoolBatchUpload(images: ImageWithState[]): void {
    for (const image of images) {
      this.queuePoolUpload(image);
    }
  }

  /**
   * 从队列中移除
   */
  dequeuePoolImage(id: string): void {
    const index = this.poolQueue.findIndex(item => item.id === id);
    if (index !== -1) {
      this.poolQueue.splice(index, 1);
      loggers.image.verbose("图片从队列移除", { id });
      this.notifyPoolListeners();
    }
  }

  /**
   * 获取队列状态快照
   */
  getPoolQueueState(): PoolQueueState {
    return {
      status: this.poolStatus,
      queue: [...this.poolQueue],
      currentItem: this.poolCurrentItem,
      completedCount: this.poolCompletedCount,
      failedCount: this.poolFailedCount,
      skippedCount: this.poolSkippedCount
    };
  }

  /**
   * 订阅队列状态变化
   */
  subscribePoolQueue(handler: () => void): () => void {
    this.poolListeners.add(handler);
    return () => { this.poolListeners.delete(handler); };
  }

  // ---- Pool queue internal ----

  private notifyPoolListeners(): void {
    this.poolListeners.forEach(fn => fn());
  }

  private async processPoolQueue(): Promise<void> {
    this.poolStatus = "processing";
    loggers.image.info("开始处理上传队列", { queueLength: this.poolQueue.length });

    while (this.poolQueue.length > 0) {
      const item = this.poolQueue.shift()!;
      this.poolCurrentItem = item;
      this.notifyPoolListeners();

      try {
        await this.uploadPoolItem(item);
        this.poolCompletedCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (isDuplicateRequestError(error)) {
          loggers.image.warn("图片已存在于 Steam (Error 29)", { fileName: item.id });
          this.poolSkippedCount++;
          const store = useSteamGuideImageStore.getState();
          store.setImageState(item.id, "success");
          void store.refresh();
        } else if (item.retryCount < POOL_QUEUE_CONFIG.maxRetries) {
          item.retryCount++;
          this.poolQueue.push(item);
          loggers.image.warn("上传失败，稍后重试", {
            fileName: item.id,
            retryCount: item.retryCount,
            error: errorMessage
          });
          await this.delay(POOL_QUEUE_CONFIG.retryDelay);
        } else {
          this.poolFailedCount++;
          const store = useSteamGuideImageStore.getState();
          store.setImageState(item.id, "error", errorMessage);
          loggers.image.error("上传失败，已达最大重试次数", {
            fileName: item.id,
            error: errorMessage
          });
        }
      }

      this.poolCurrentItem = null;
      this.notifyPoolListeners();

      if (this.poolQueue.length > 0) {
        await this.delay(POOL_QUEUE_CONFIG.uploadInterval);
      }
    }

    this.poolStatus = "idle";
    loggers.image.info("上传队列处理完成", {
      completed: this.poolCompletedCount,
      failed: this.poolFailedCount,
      skipped: this.poolSkippedCount
    });
    this.notifyPoolListeners();
  }

  private async uploadPoolItem(item: PoolQueueItem): Promise<void> {
    const { image } = item;
    const store = useSteamGuideImageStore.getState();

    if (!image.localUrl) {
      throw new Error("图片本地 URL 不存在");
    }

    store.setImageState(image.fileName, "uploading");
    store.setUploadProgress(image.fileName, 0);

    loggers.image.info("队列开始上传图片", { fileName: image.fileName });

    const response = await fetch(image.localUrl);
    const blob = await response.blob();

    // 二次校验：blob 实际大小
    if (blob.size > STEAM_IMAGE_SIZE_LIMIT) {
      const sizeMB = formatFileSize(blob.size);
      toast.error(i18n.t('image.uploadTooLarge', { ns: 'editor', fileName: image.fileName, size: sizeMB }));
      store.setImageState(image.fileName, "error", `超出 Steam 2MB 限制（${sizeMB}MB）`);
      return;
    }

    const file = new File([blob], image.fileName, { type: blob.type || "image/png" });

    store.setUploadProgress(image.fileName, 30);

    const result = await uploadSteamImage("chapter-preview", file, image.fileName);

    store.setUploadProgress(image.fileName, 100);

    const previewId = result.previewIds?.[0];
    if (previewId) {
      store.setPreviewId(image.fileName, previewId);
      loggers.image.info("队列上传成功", { fileName: image.fileName, previewId });
    } else {
      throw new Error("上传成功但未返回 previewId");
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const ImageUploadService = new ImageUploadServiceImpl();

// ============================================================================
// React Hook: 订阅图片池上传队列状态
// ============================================================================

export function usePoolUploadQueueState(): PoolQueueState {
  const [state, setState] = useState<PoolQueueState>(() => ImageUploadService.getPoolQueueState());

  useEffect(() => {
    return ImageUploadService.subscribePoolQueue(() => {
      setState(ImageUploadService.getPoolQueueState());
    });
  }, []);

  return state;
}
