/**
 * 图片卡片组件
 * 显示单个图片的缩略图、文件名和状态
 * 支持拖拽到编辑器插入
 */
import React, { useState, useCallback, useRef, useEffect } from "react";
import { ImageWithState, useSteamGuideImageStore } from "../../stores/useSteamGuideImageStore";
import { useImagePanelStore } from "../../stores/useImagePanelStore";
import { COLORS, SIZES } from "./styles";
import { loggers } from "../../../shared/logger";

/** 拖拽数据格式 */
export interface ImageDragData {
  type: "steam-image";
  images: Array<{
    imageId: string;
    previewId: string;
    fileName: string;
    thumbnailUrl?: string;
    originalUrl?: string;
    localUrl?: string;
  }>;
}

/** MIME 类型常量 */
export const NASGE_IMAGE_MIME_TYPE = "application/x-nasge-image";

interface ImageCardProps {
  image: ImageWithState;
  isSelected: boolean;
  isFocused: boolean;
  onSelect: (id: string, mode: "single" | "toggle" | "add") => void;
  onDoubleClick: (image: ImageWithState) => void;
  /** 获取当前选中的所有图片（用于批量拖拽） */
  getSelectedImages?: () => ImageWithState[];
  /** 删除图片回调 */
  onDelete?: (image: ImageWithState) => void;
  /** 队列位置：-1=不在队列, 0=正在上传, 1+=等待中的位置 */
  queuePosition?: number;
  /** 队列总长度 */
  queueLength?: number;
  /** 是否正在编辑文件名 */
  isEditing?: boolean;
  /** 编辑状态变化回调 */
  onEditingChange?: (imageId: string | null) => void;
}

const ImageCard: React.FC<ImageCardProps> = ({
  image,
  isSelected,
  isFocused,
  onSelect,
  onDoubleClick,
  getSelectedImages,
  onDelete,
  queuePosition = -1,
  queueLength = 0,
  isEditing = false,
  onEditingChange
}) => {
  const { showFileName, showStatusIndicator, getThumbnailSizePixels } = useImagePanelStore();
  const { renameImage } = useSteamGuideImageStore();
  const thumbnailSize = getThumbnailSizePixels();
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [editValue, setEditValue] = useState(image.fileName);
  const inputRef = useRef<HTMLInputElement>(null);

  // 编辑模式激活时自动聚焦并选中文本
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // 同步 image.fileName 到 editValue（当外部更新时）
  useEffect(() => {
    if (!isEditing) {
      setEditValue(image.fileName);
    }
  }, [image.fileName, isEditing]);

  // 确认重命名
  const handleRenameConfirm = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== image.fileName) {
      renameImage(image.previewId || image.fileName, trimmed);
      loggers.image.info("内联重命名图片", { from: image.fileName, to: trimmed });
    }
    onEditingChange?.(null);
  }, [editValue, image.fileName, image.previewId, renameImage, onEditingChange]);

  // 取消编辑
  const handleRenameCancel = useCallback(() => {
    setEditValue(image.fileName);
    onEditingChange?.(null);
  }, [image.fileName, onEditingChange]);

  // 输入框按键处理
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleRenameConfirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleRenameCancel();
    }
  }, [handleRenameConfirm, handleRenameCancel]);

  // 获取显示的 URL
  const displayUrl = image.localUrl || image.thumbnailUrl || image.originalUrl;

  // 计算显示状态
  // queuePosition: -1=不在队列, 0=正在上传, 1+=等待中的位置
  const isInQueue = queuePosition >= 0;
  const isCurrentlyUploading = queuePosition === 0;

  // 状态颜色映射
  const statusColors: Record<string, string> = {
    pending: COLORS.pending,
    uploading: COLORS.warning,
    success: COLORS.success,
    error: COLORS.error,
    queued: COLORS.accent  // 队列中使用蓝色
  };

  // 获取实际显示的状态
  const getDisplayStatus = (): { text: string; color: string } => {
    if (image.state === "pending") {
      if (isCurrentlyUploading) {
        return { text: "上传中", color: statusColors.uploading };
      }
      if (isInQueue) {
        return { text: `队列中 (${queuePosition}/${queueLength})`, color: statusColors.queued };
      }
      return { text: "待上传", color: statusColors.pending };
    }
    if (image.state === "uploading") {
      return { text: "上传中", color: statusColors.uploading };
    }
    if (image.state === "success") {
      return { text: "已上传", color: statusColors.success };
    }
    if (image.state === "error") {
      return { text: "失败", color: statusColors.error };
    }
    return { text: "未知", color: COLORS.textMuted };
  };

  const displayStatus = getDisplayStatus();

  // 点击处理
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      onSelect(image.previewId || image.fileName, "toggle");
    } else if (e.shiftKey) {
      // Shift 选择由父组件处理
      onSelect(image.previewId || image.fileName, "add");
    } else {
      onSelect(image.previewId || image.fileName, "single");
    }
  }, [image, onSelect]);

  // 双击处理
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onDoubleClick(image);
  }, [image, onDoubleClick]);

  // 拖拽开始处理
  const handleDragStart = useCallback((e: React.DragEvent) => {
    setIsDragging(true);

    // 如果当前图片被选中且有多个选中项，则批量拖拽所有选中的图片
    let imagesToDrag: ImageWithState[] = [image];
    if (isSelected && getSelectedImages) {
      const selectedImages = getSelectedImages();
      if (selectedImages.length > 1) {
        imagesToDrag = selectedImages;
      }
    }

    // 构造拖拽数据
    const dragData: ImageDragData = {
      type: "steam-image",
      images: imagesToDrag.map(img => ({
        imageId: img.previewId || img.fileName,
        previewId: img.previewId || "",
        fileName: img.fileName,
        thumbnailUrl: img.thumbnailUrl,
        originalUrl: img.originalUrl,
        localUrl: img.localUrl
      }))
    };

    // 设置拖拽数据（只使用自定义 MIME 类型，不设置 text/plain 避免编辑器误插入文件名）
    e.dataTransfer.setData(NASGE_IMAGE_MIME_TYPE, JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = "copy";

    loggers.image.verbose("开始拖拽图片", {
      count: imagesToDrag.length,
      fileNames: imagesToDrag.map(img => img.fileName)
    });
  }, [image, isSelected, getSelectedImages]);

  // 拖拽结束处理
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    loggers.image.verbose("结束拖拽图片");
  }, []);

  // 计算卡片总高度
  const cardHeight = thumbnailSize + (showFileName || showStatusIndicator ? 32 : 0);

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      style={{
        width: thumbnailSize,
        height: cardHeight,
        display: "flex",
        flexDirection: "column",
        borderRadius: SIZES.borderRadiusSmall,
        overflow: "hidden",
        cursor: isDragging ? "grabbing" : "grab",
        background: isSelected
          ? "rgba(102, 192, 244, 0.2)"
          : isHovered
            ? "rgba(102, 192, 244, 0.1)"
            : "transparent",
        border: isSelected
          ? `2px solid ${COLORS.accent}`
          : isFocused
            ? `2px solid ${COLORS.borderHover}`
            : "2px solid transparent",
        transition: "all 0.15s ease",
        boxSizing: "border-box",
        opacity: isDragging ? 0.5 : 1
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={`${image.fileName}\n状态: ${displayStatus.text}\n拖拽到编辑器插入`}
    >
      {/* 缩略图区域 */}
      <div
        style={{
          width: thumbnailSize - 4, // 减去边框宽度
          height: thumbnailSize - 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(8, 16, 28, 0.6)",
          position: "relative",
          margin: 2
        }}
      >
        {/* 删除按钮 */}
        {isHovered && onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(image);
            }}
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              width: 18,
              height: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0, 0, 0, 0.7)",
              border: "none",
              borderRadius: "50%",
              color: COLORS.textSecondary,
              fontSize: 12,
              cursor: "pointer",
              zIndex: 10,
              padding: 0,
              lineHeight: 1
            }}
            title="删除图片"
            onMouseEnter={(e) => {
              (e.target as HTMLButtonElement).style.background = COLORS.error;
              (e.target as HTMLButtonElement).style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLButtonElement).style.background = "rgba(0, 0, 0, 0.7)";
              (e.target as HTMLButtonElement).style.color = COLORS.textSecondary;
            }}
          >
            ×
          </button>
        )}

        {imageError || !displayUrl ? (
          // 加载失败占位符
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: COLORS.textMuted,
              fontSize: 10
            }}
          >
            <span style={{ fontSize: 20, marginBottom: 4, opacity: 0.5 }}>✕</span>
            <span>加载失败</span>
          </div>
        ) : (
          <img
            src={displayUrl}
            alt={image.fileName}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain"
            }}
            onError={() => setImageError(true)}
            draggable={false}
          />
        )}

        {/* 上传进度指示 */}
        {image.state === "uploading" && image.uploadProgress !== undefined && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 3,
              background: "rgba(0, 0, 0, 0.5)"
            }}
          >
            <div
              style={{
                width: `${image.uploadProgress}%`,
                height: "100%",
                background: COLORS.warning,
                transition: "width 0.2s ease"
              }}
            />
          </div>
        )}
      </div>

      {/* 文件名和状态 */}
      {(showFileName || showStatusIndicator) && (
        <div
          style={{
            padding: "2px 4px",
            fontSize: 10,
            lineHeight: 1.3,
            overflow: "hidden"
          }}
        >
          {showFileName && (
            isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleInputKeyDown}
                onBlur={handleRenameConfirm}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "100%",
                  padding: "1px 2px",
                  fontSize: 10,
                  background: "rgba(102, 192, 244, 0.15)",
                  border: `1px solid ${COLORS.accent}`,
                  borderRadius: 2,
                  color: COLORS.textPrimary,
                  outline: "none",
                  boxSizing: "border-box"
                }}
              />
            ) : (
              <div
                style={{
                  color: COLORS.textSecondary,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}
              >
                {image.fileName}
              </div>
            )
          )}
          {showStatusIndicator && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                color: displayStatus.color
              }}
            >
              <span style={{ fontSize: 8 }}>●</span>
              <span>{displayStatus.text}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImageCard;
