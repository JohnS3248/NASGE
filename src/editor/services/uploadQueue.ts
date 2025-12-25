/**
 * 上传队列服务
 *
 * Steam Error 29 (DuplicateRequest) 表示重复请求，不是频率限制。
 * 当上传同名/相同图片时会触发此错误。
 *
 * 特性：
 * - 单线程队列，同时只有一个上传任务
 * - 上传前检查图片是否已存在于图片池
 * - Error 29 特殊处理：标记为已存在而非失败
 * - 自动重试机制（仅对网络错误等临时性错误）
 * - 队列状态回调
 */

import { useState, useEffect } from "react";
import { uploadSteamImage } from "./steamBridge";
import { useSteamGuideImageStore, ImageWithState } from "../stores/useSteamGuideImageStore";
import { loggers } from "../../shared/logger";

// ============ 类型定义 ============

export interface QueueItem {
  /** 唯一标识（使用 fileName） */
  id: string;
  /** 图片数据 */
  image: ImageWithState;
  /** 重试次数 */
  retryCount: number;
  /** 添加时间 */
  addedAt: number;
}

export interface QueueConfig {
  /** 上传间隔（毫秒），默认 3000ms */
  uploadInterval: number;
  /** 最大重试次数，默认 2 */
  maxRetries: number;
  /** 重试延迟（毫秒），默认 5000ms */
  retryDelay: number;
}

export type QueueStatus = "idle" | "processing" | "paused";

export interface QueueState {
  status: QueueStatus;
  queue: QueueItem[];
  currentItem: QueueItem | null;
  completedCount: number;
  failedCount: number;
  skippedCount: number;  // 跳过（已存在）的数量
}

export type QueueEventType =
  | "queue-updated"
  | "upload-started"
  | "upload-success"
  | "upload-failed"
  | "upload-skipped"      // 图片已存在，跳过上传
  | "upload-duplicate"    // Error 29: 重复请求
  | "queue-completed";

/** Steam EResult 错误码 */
export const STEAM_ERESULT = {
  OK: 1,
  FAIL: 2,
  DUPLICATE_REQUEST: 29,  // 重复请求，图片已存在
  RATE_LIMIT_EXCEEDED: 84 // 频率限制（实际很少遇到）
} as const;

export interface QueueEvent {
  type: QueueEventType;
  item?: QueueItem;
  error?: string;
  state: QueueState;
}

export type QueueEventHandler = (event: QueueEvent) => void;

// ============ 默认配置 ============

const DEFAULT_CONFIG: QueueConfig = {
  uploadInterval: 1000,  // 1 秒间隔（Error 29 不是频率限制，可以更快）
  maxRetries: 2,         // 最多重试 2 次（仅对网络错误等）
  retryDelay: 3000       // 重试前等待 3 秒
};

// ============ 队列管理类 ============

class UploadQueueManager {
  private queue: QueueItem[] = [];
  private status: QueueStatus = "idle";
  private currentItem: QueueItem | null = null;
  private completedCount = 0;
  private failedCount = 0;
  private skippedCount = 0;  // 跳过（已存在）的数量
  private config: QueueConfig = DEFAULT_CONFIG;
  private eventHandlers: Set<QueueEventHandler> = new Set();
  private processingPromise: Promise<void> | null = null;

  // ============ 配置 ============

  setConfig(config: Partial<QueueConfig>): void {
    this.config = { ...this.config, ...config };
    loggers.image.verbose("上传队列配置更新", this.config);
  }

  getConfig(): QueueConfig {
    return { ...this.config };
  }

  // ============ 事件订阅 ============

  subscribe(handler: QueueEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(type: QueueEventType, item?: QueueItem, error?: string): void {
    const event: QueueEvent = {
      type,
      item,
      error,
      state: this.getState()
    };
    this.eventHandlers.forEach(handler => handler(event));
  }

  // ============ 状态查询 ============

  getState(): QueueState {
    return {
      status: this.status,
      queue: [...this.queue],
      currentItem: this.currentItem,
      completedCount: this.completedCount,
      failedCount: this.failedCount,
      skippedCount: this.skippedCount
    };
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  isProcessing(): boolean {
    return this.status === "processing";
  }

  // ============ 队列操作 ============

  /**
   * 添加图片到上传队列
   */
  enqueue(image: ImageWithState): void {
    const store = useSteamGuideImageStore.getState();

    // 1. 检查图片是否已经上传成功（有 previewId）
    if (image.previewId && image.state === "success") {
      loggers.image.verbose("图片已上传成功，跳过入队", { fileName: image.fileName, previewId: image.previewId });
      return;
    }

    // 2. 检查图片池中是否已有同名图片且已上传
    const existingInPool = store.items.find(
      item => item.fileName === image.fileName && item.state === "success" && item.previewId
    );
    if (existingInPool) {
      loggers.image.info("图片池中已存在同名已上传图片，跳过", {
        fileName: image.fileName,
        existingPreviewId: existingInPool.previewId
      });
      // 更新当前图片的状态为已上传
      store.setPreviewId(image.fileName, existingInPool.previewId);
      this.skippedCount++;
      this.emit("upload-skipped", { id: image.fileName, image, retryCount: 0, addedAt: Date.now() });
      return;
    }

    // 3. 检查是否已在队列中
    const existingIndex = this.queue.findIndex(item => item.id === image.fileName);
    if (existingIndex !== -1) {
      loggers.image.verbose("图片已在队列中，跳过", { fileName: image.fileName });
      return;
    }

    // 4. 检查是否正在上传
    if (this.currentItem?.id === image.fileName) {
      loggers.image.verbose("图片正在上传中，跳过", { fileName: image.fileName });
      return;
    }

    const item: QueueItem = {
      id: image.fileName,
      image,
      retryCount: 0,
      addedAt: Date.now()
    };

    this.queue.push(item);
    loggers.image.info("图片加入上传队列", {
      fileName: image.fileName,
      queueLength: this.queue.length
    });

    this.emit("queue-updated", item);

    // 如果队列空闲，开始处理
    if (this.status === "idle") {
      void this.startProcessing();
    }
  }

  /**
   * 批量添加图片到上传队列
   */
  enqueueBatch(images: ImageWithState[]): void {
    for (const image of images) {
      this.enqueue(image);
    }
  }

  /**
   * 从队列中移除
   */
  dequeue(id: string): void {
    const index = this.queue.findIndex(item => item.id === id);
    if (index !== -1) {
      this.queue.splice(index, 1);
      loggers.image.verbose("图片从队列移除", { id });
      this.emit("queue-updated");
    }
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.queue = [];
    this.emit("queue-updated");
    loggers.image.info("上传队列已清空");
  }

  /**
   * 暂停队列处理
   */
  pause(): void {
    if (this.status === "processing") {
      this.status = "paused";
      loggers.image.info("上传队列已暂停");
      this.emit("queue-updated");
    }
  }

  /**
   * 恢复队列处理
   */
  resume(): void {
    if (this.status === "paused") {
      this.status = "processing";
      loggers.image.info("上传队列已恢复");
      void this.processNext();
    }
  }

  // ============ 内部处理 ============

  private async startProcessing(): Promise<void> {
    if (this.status === "processing") {
      return;
    }

    this.status = "processing";
    loggers.image.info("开始处理上传队列", { queueLength: this.queue.length });

    await this.processNext();
  }

  private async processNext(): Promise<void> {
    // 检查状态
    if (this.status === "paused") {
      return;
    }

    // 队列为空，完成
    if (this.queue.length === 0) {
      this.status = "idle";
      this.currentItem = null;
      loggers.image.info("上传队列处理完成", {
        completed: this.completedCount,
        failed: this.failedCount,
        skipped: this.skippedCount
      });
      this.emit("queue-completed");
      return;
    }

    // 取出第一个
    const item = this.queue.shift()!;
    this.currentItem = item;

    this.emit("upload-started", item);

    try {
      await this.uploadItem(item);
      this.completedCount++;
      this.emit("upload-success", item);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 检查是否为 Error 29 (DuplicateRequest) - 图片已存在
      const isDuplicateError = this.isDuplicateRequestError(error);

      if (isDuplicateError) {
        // Error 29: 图片已存在于 Steam，不算失败
        loggers.image.warn("图片已存在于 Steam (Error 29)", { fileName: item.id });
        this.skippedCount++;
        this.emit("upload-duplicate", item, errorMessage);

        // 尝试刷新图片池获取已有的 previewId
        const store = useSteamGuideImageStore.getState();
        void store.refresh();
      } else if (item.retryCount < this.config.maxRetries) {
        // 其他错误：重试
        item.retryCount++;
        this.queue.push(item); // 重新加入队列末尾
        loggers.image.warn("上传失败，稍后重试", {
          fileName: item.id,
          retryCount: item.retryCount,
          error: errorMessage
        });

        // 重试延迟
        await this.delay(this.config.retryDelay);
      } else {
        // 重试次数已用完
        this.failedCount++;
        this.emit("upload-failed", item, errorMessage);
        loggers.image.error("上传失败，已达最大重试次数", {
          fileName: item.id,
          error: errorMessage
        });
      }
    }

    this.currentItem = null;

    // 等待间隔后处理下一个
    if (this.queue.length > 0 && this.status === "processing") {
      await this.delay(this.config.uploadInterval);
      await this.processNext();
    } else if (this.queue.length === 0) {
      this.status = "idle";
      loggers.image.info("上传队列处理完成", {
        completed: this.completedCount,
        failed: this.failedCount,
        skipped: this.skippedCount
      });
      this.emit("queue-completed");
    }
  }

  private async uploadItem(item: QueueItem): Promise<void> {
    const { image } = item;
    const imageId = image.fileName;
    const store = useSteamGuideImageStore.getState();

    // 检查图片状态
    if (!image.localUrl) {
      throw new Error("图片本地 URL 不存在");
    }

    // 更新状态为上传中
    store.setImageState(imageId, "uploading");
    store.setUploadProgress(imageId, 0);

    loggers.image.info("队列开始上传图片", { fileName: image.fileName });

    // 从 localUrl 获取 Blob
    const response = await fetch(image.localUrl);
    const blob = await response.blob();
    const file = new File([blob], image.fileName, { type: blob.type || "image/png" });

    store.setUploadProgress(imageId, 30);

    // 上传到 Steam
    const result = await uploadSteamImage("chapter-preview", file, image.fileName);

    store.setUploadProgress(imageId, 100);

    // 检查结果
    const previewId = result.previewIds?.[0];
    if (previewId) {
      store.setPreviewId(imageId, previewId);
      loggers.image.info("队列上传成功", {
        fileName: image.fileName,
        previewId
      });
    } else {
      throw new Error("上传成功但未返回 previewId");
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 检查是否为 Error 29 (DuplicateRequest)
   * Steam 返回的错误信息可能包含 "29" 或 "DuplicateRequest"
   */
  private isDuplicateRequestError(error: unknown): boolean {
    if (!error) return false;

    const errorMessage = error instanceof Error ? error.message : String(error);

    // 检查常见的 Error 29 标识
    return (
      errorMessage.includes("29") ||
      errorMessage.includes("DuplicateRequest") ||
      errorMessage.includes("duplicate") ||
      errorMessage.includes("already exists") ||
      errorMessage.includes("已存在")
    );
  }

  // ============ 重置统计 ============

  resetStats(): void {
    this.completedCount = 0;
    this.failedCount = 0;
    this.skippedCount = 0;
  }
}

// ============ 单例导出 ============

export const uploadQueue = new UploadQueueManager();

// ============ 便捷函数 ============

/**
 * 将图片添加到上传队列
 */
export function queueImageUpload(image: ImageWithState): void {
  uploadQueue.enqueue(image);
}

/**
 * 批量添加图片到上传队列
 */
export function queueBatchUpload(images: ImageWithState[]): void {
  uploadQueue.enqueueBatch(images);
}

/**
 * 获取队列状态
 */
export function getQueueState(): QueueState {
  return uploadQueue.getState();
}

// ============ React Hook ============

/**
 * React Hook: 订阅上传队列状态
 */
export function useUploadQueueState(): QueueState {
  const [state, setState] = useState<QueueState>(() => uploadQueue.getState());

  useEffect(() => {
    // 订阅队列事件
    const unsubscribe = uploadQueue.subscribe(() => {
      setState(uploadQueue.getState());
    });
    return unsubscribe;
  }, []);

  return state;
}

/**
 * 检查图片是否在队列中（包括正在上传的）
 */
export function isImageInQueue(imageId: string): boolean {
  const state = uploadQueue.getState();
  // 检查是否正在上传
  if (state.currentItem?.id === imageId) {
    return true;
  }
  // 检查是否在等待队列中
  return state.queue.some(item => item.id === imageId);
}

/**
 * 获取图片在队列中的位置（1-based，0 表示正在上传，-1 表示不在队列中）
 */
export function getImageQueuePosition(imageId: string): number {
  const state = uploadQueue.getState();
  // 正在上传
  if (state.currentItem?.id === imageId) {
    return 0;
  }
  // 在队列中
  const index = state.queue.findIndex(item => item.id === imageId);
  return index >= 0 ? index + 1 : -1;
}
