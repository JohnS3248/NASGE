/**
 * 图片管理统一类型定义
 *
 * 设计原则：
 * - 单一真相源：所有图片状态集中管理
 * - 统一命名：消除 ID 混乱
 * - 清晰状态机：明确的生命周期状态
 */

/**
 * 图片生命周期状态
 *
 * 状态流转：
 * local → uploading → uploaded → synced
 *                  ↘ error
 *
 * 特殊状态：
 * - orphaned: 从 BBCode 导入但 Steam 图片池中不存在
 */
export type ImageLifecycleStatus =
  | "local"       // 本地添加，未上传
  | "uploading"   // 上传中
  | "uploaded"    // 已上传到 Steam（有 steamPreviewId）
  | "synced"      // 已同步到图片池（Steam 确认存在）
  | "error"       // 上传/同步失败
  | "orphaned";   // 引用失效（图片在 Steam 被删除）

/**
 * 图片来源
 */
export type ImageSource =
  | "paste"       // 粘贴
  | "drop"        // 拖放
  | "file-input"  // 文件选择
  | "steam-pool"  // 从 Steam 图片池导入
  | "bbcode";     // 从 BBCode 导入

/**
 * 图片尺寸预设
 */
export type ImageSizePreset = "original" | "full" | "half" | "thumb";

/**
 * 图片对齐方式
 */
export type ImageAlignment = "floatLeft" | "floatRight" | "inline";

/**
 * 图片显示设置
 */
export interface ImageDisplaySettings {
  preset: ImageSizePreset;
  alignment: ImageAlignment;
  customWidthPx?: number;
}

/**
 * 图片尺寸信息
 */
export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Steam URL 信息
 */
export interface SteamImageUrls {
  thumbnailUrl?: string;   // Steam 缩略图 URL
  originalUrl?: string;    // Steam 原图 URL（透明背景）
}

/**
 * 统一的图片实体
 *
 * ID 命名规范：
 * - id: 本地唯一标识符 (UUID)，用于 Store 索引和 TipTap 节点关联
 * - steamPreviewId: Steam 预览码，上传成功后从 Steam 获得
 */
export interface ImageEntity {
  // === 核心标识 ===
  /** 本地唯一 ID (UUID)，TipTap 节点通过此 ID 关联图片 */
  id: string;
  /** Steam 预览 ID，上传成功后获得，用于 BBCode 导出 */
  steamPreviewId?: string;
  /** 旧 Store 的 nodeId，用于迁移期间的去重 */
  sourceNodeId?: string;

  // === 生命周期 ===
  /** 当前状态 */
  status: ImageLifecycleStatus;
  /** 错误信息（当 status 为 error 时） */
  error?: string;

  // === 文件信息 ===
  /** 显示用文件名 */
  fileName: string;
  /** 原始文件名（用户上传时的名称） */
  originalName: string;
  /** 文件大小（字节） */
  fileSize: number;
  /** MIME 类型 */
  mimeType: string;

  // === 尺寸信息 ===
  /** 原始图片尺寸 */
  dimensions?: ImageDimensions;

  // === 预览数据 ===
  /** 本地预览 URL (blob: 或 data:) */
  localPreviewUrl?: string;
  /** Steam URL 信息 */
  steamUrls?: SteamImageUrls;

  // === 显示设置 ===
  /** 显示设置 */
  display: ImageDisplaySettings;

  // === 元数据 ===
  /** 图片来源 */
  source: ImageSource;
  /** 创建时间戳 */
  createdAt: number;
  /** 上传完成时间戳 */
  uploadedAt?: number;
}

/**
 * 创建新图片实体的参数
 */
export interface CreateImageParams {
  fileName: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  source: ImageSource;
  localPreviewUrl?: string;
  dimensions?: ImageDimensions;
  display?: Partial<ImageDisplaySettings>;
}

/**
 * 从 Steam 图片池导入的参数
 */
export interface ImportFromSteamPoolParams {
  steamPreviewId: string;
  fileName: string;
  thumbnailUrl?: string;
  originalUrl?: string;
  /** 可选的显示设置，用于保留 BBCode 导入时的预设 */
  display?: Partial<ImageDisplaySettings>;
}

/**
 * 从 BBCode 导入的参数
 */
export interface ImportFromBBCodeParams {
  steamPreviewId: string;
  fileName: string;
  sizePreset?: ImageSizePreset;
  alignment?: ImageAlignment;
}

/**
 * 上传结果
 */
export interface UploadResult {
  steamPreviewId: string;
  steamUrls: SteamImageUrls;
}

/**
 * 批量上传结果
 */
export interface BatchUploadResult {
  success: Array<{ imageId: string; steamPreviewId: string }>;
  failed: Array<{ imageId: string; error: string }>;
}

/**
 * 默认显示设置
 */
export const DEFAULT_DISPLAY_SETTINGS: ImageDisplaySettings = {
  preset: "original",
  alignment: "inline"
};

/**
 * 生成本地图片 ID
 */
export function generateImageId(): string {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `img_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
