/**
 * 图片卡片组件
 * 显示单个图片的缩略图、文件名和状态
 * 支持拖拽到编辑器插入
 */
import React, { useState, useCallback, useRef, useEffect } from "react";
import { ImageWithState, useSteamGuideImageStore } from "../../stores/useSteamGuideImageStore";
import { useImagePanelStore } from "../../stores/useImagePanelStore";
import { useGuideStore, ImageTag } from "../../stores/useGuideStore";
import { useEditorConfigStore } from "../../stores/useEditorConfigStore";
import { queueImageUpload } from "../../services/uploadQueue";
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
  const {
    showFileName,
    showStatusIndicator,
    getThumbnailSizePixels,
    isPendingUploadAfterRename,
    removePendingUploadAfterRename
  } = useImagePanelStore();
  const { renameImage, getImageById } = useSteamGuideImageStore();
  const {
    currentArchiveId,
    getCurrentArchive,
    getTagsForImage,
    addTagToImage,
    removeTagFromImage
  } = useGuideStore();
  const thumbnailSize = getThumbnailSizePixels();
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // 获取当前图片的标签
  const imageId = image.previewId || image.fileName;
  const imageTags = currentArchiveId ? getTagsForImage(currentArchiveId, imageId) : [];
  const archive = getCurrentArchive();
  const allTags = archive?.imageTags || [];

  // 只有待上传状态的图片可以重命名
  const canRename = image.state === "pending";
  // 实际编辑状态（需要同时满足：外部传入 isEditing 且图片可重命名）
  const isActuallyEditing = isEditing && canRename;

  // 分离文件名和扩展名
  const getFileNameParts = useCallback((fileName: string) => {
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex > 0) {
      return {
        baseName: fileName.substring(0, lastDotIndex),
        extension: fileName.substring(lastDotIndex) // 包含点号
      };
    }
    return { baseName: fileName, extension: '' };
  }, []);

  const { baseName, extension } = getFileNameParts(image.fileName);
  const [editValue, setEditValue] = useState(baseName);

  // 编辑模式激活时自动聚焦并选中文本（只选中文件名部分）
  useEffect(() => {
    if (isActuallyEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isActuallyEditing]);

  // 同步 image.fileName 到 editValue（当外部更新时）
  useEffect(() => {
    if (!isActuallyEditing) {
      const { baseName: newBaseName } = getFileNameParts(image.fileName);
      setEditValue(newBaseName);
    }
  }, [image.fileName, isActuallyEditing, getFileNameParts]);

  // 清理文件名中的非法字符
  const sanitizeBaseName = useCallback((name: string): string => {
    // 替换非法字符: \ / : * ? " < > |
    let sanitized = name.replace(/[\\/:*?"<>|]/g, "_");
    // 限制长度（文件名部分最大 100 字符）
    if (sanitized.length > 100) {
      sanitized = sanitized.substring(0, 100);
    }
    return sanitized;
  }, []);

  // 确认重命名
  const handleRenameConfirm = useCallback(() => {
    const trimmed = editValue.trim();
    if (!trimmed) {
      onEditingChange?.(null);
      return;
    }

    // 验证并清理非法字符
    const sanitized = sanitizeBaseName(trimmed);
    const oldFileName = image.fileName;
    const newFileName = sanitized !== baseName ? sanitized + extension : oldFileName;

    if (sanitized !== baseName) {
      renameImage(image.previewId || image.fileName, newFileName);

      if (sanitized !== trimmed) {
        loggers.image.info("内联重命名（已清理非法字符）", {
          input: trimmed,
          sanitized,
          newFileName
        });
      } else {
        loggers.image.info("内联重命名图片", { from: oldFileName, to: newFileName });
      }
    }

    // 检查是否需要在改名后自动上传
    // 注意：原始文件名可能在 pending 列表中
    if (isPendingUploadAfterRename(oldFileName)) {
      // 移除 pending 状态（用原始文件名）
      removePendingUploadAfterRename(oldFileName);

      // 获取更新后的图片数据（用新文件名查找）
      // 需要延迟一下确保 rename 操作完成
      setTimeout(() => {
        const updatedImage = getImageById(newFileName);
        if (updatedImage && updatedImage.state === "pending") {
          loggers.image.info("改名完成，触发自动上传", { fileName: newFileName });
          queueImageUpload(updatedImage);
        } else {
          loggers.image.warn("改名后无法找到图片或图片已不是待上传状态", {
            newFileName,
            found: !!updatedImage,
            state: updatedImage?.state
          });
        }
      }, 50);
    }

    onEditingChange?.(null);
  }, [editValue, baseName, extension, image.fileName, image.previewId, renameImage, onEditingChange, sanitizeBaseName, isPendingUploadAfterRename, removePendingUploadAfterRename, getImageById]);

  // 取消编辑
  const handleRenameCancel = useCallback(() => {
    setEditValue(baseName);
    onEditingChange?.(null);
  }, [baseName, onEditingChange]);

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

  // 获取右键菜单配置（使用新的 imagePoolMenuConfig）
  const imagePoolMenuConfig = useEditorConfigStore(
    (state) => state.imagePoolMenuConfig
  );

  // 右键菜单处理
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    // 如果禁用右键菜单，则不处理（让浏览器显示原生菜单）
    if (!imagePoolMenuConfig.enabled) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    // 计算菜单位置（相对于视口）
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, [imagePoolMenuConfig.enabled]);

  // 关闭右键菜单
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // 点击外部关闭右键菜单
  useEffect(() => {
    if (contextMenu) {
      const handleClickOutside = () => closeContextMenu();
      document.addEventListener("click", handleClickOutside);
      document.addEventListener("contextmenu", handleClickOutside);
      return () => {
        document.removeEventListener("click", handleClickOutside);
        document.removeEventListener("contextmenu", handleClickOutside);
      };
    }
  }, [contextMenu, closeContextMenu]);

  // 切换标签
  const handleToggleTag = useCallback((tagId: string) => {
    if (!currentArchiveId) return;
    const hasTag = imageTags.some(t => t.id === tagId);
    if (hasTag) {
      removeTagFromImage(currentArchiveId, imageId, tagId);
    } else {
      addTagToImage(currentArchiveId, imageId, tagId);
    }
  }, [currentArchiveId, imageId, imageTags, addTagToImage, removeTagFromImage]);

  // 计算卡片总高度（包含标签区域）
  const hasTagsToShow = imageTags.length > 0;
  const cardHeight = thumbnailSize + (showFileName || showStatusIndicator ? 32 : 0) + (hasTagsToShow ? 18 : 0);

  return (
    <div
      ref={cardRef}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onContextMenu={handleContextMenu}
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
            isActuallyEditing ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  onBlur={handleRenameConfirm}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "1px 2px",
                    fontSize: 10,
                    background: "rgba(102, 192, 244, 0.15)",
                    border: `1px solid ${COLORS.accent}`,
                    borderRadius: "2px 0 0 2px",
                    color: COLORS.textPrimary,
                    outline: "none",
                    boxSizing: "border-box"
                  }}
                />
                <span
                  style={{
                    flexShrink: 0,
                    padding: "1px 2px",
                    fontSize: 10,
                    background: "rgba(60, 75, 95, 0.6)",
                    border: `1px solid ${COLORS.accent}`,
                    borderLeft: "none",
                    borderRadius: "0 2px 2px 0",
                    color: COLORS.textMuted
                  }}
                >
                  {extension}
                </span>
              </div>
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

      {/* 标签显示区域 */}
      {hasTagsToShow && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 2,
            padding: "2px 4px",
            overflow: "hidden",
            maxHeight: 16
          }}
        >
          {imageTags.slice(0, 3).map((tag) => (
            <span
              key={tag.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 2,
                padding: "0 4px",
                borderRadius: 2,
                fontSize: 9,
                background: `${tag.color}33`,
                border: `1px solid ${tag.color}66`,
                color: COLORS.textPrimary,
                whiteSpace: "nowrap",
                maxWidth: 50,
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: tag.color,
                  flexShrink: 0
                }}
              />
              {tag.name}
            </span>
          ))}
          {imageTags.length > 3 && (
            <span
              style={{
                fontSize: 9,
                color: COLORS.textMuted
              }}
            >
              +{imageTags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            background: COLORS.panelBg,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6,
            boxShadow: `0 4px 12px ${COLORS.shadow}`,
            padding: "4px 0",
            minWidth: 160,
            zIndex: 3000
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 标签选择区域 */}
          {allTags.length > 0 ? (
            <>
              <div
                style={{
                  padding: "4px 12px",
                  fontSize: 11,
                  color: COLORS.textMuted,
                  borderBottom: `1px solid ${COLORS.border}`
                }}
              >
                选择标签
              </div>
              {allTags.map((tag) => {
                const hasTag = imageTags.some(t => t.id === tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => {
                      handleToggleTag(tag.id);
                      closeContextMenu();
                    }}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 12px",
                      border: "none",
                      background: "transparent",
                      color: COLORS.textPrimary,
                      fontSize: 12,
                      cursor: "pointer",
                      textAlign: "left"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 3,
                        border: `1px solid ${tag.color}`,
                        background: hasTag ? tag.color : "transparent",
                        color: hasTag ? "#fff" : "transparent",
                        fontSize: 10
                      }}
                    >
                      ✓
                    </span>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: tag.color
                      }}
                    />
                    <span>{tag.name}</span>
                  </button>
                );
              })}
            </>
          ) : (
            <div
              style={{
                padding: "12px",
                fontSize: 12,
                color: COLORS.textMuted,
                textAlign: "center"
              }}
            >
              暂无标签
              <br />
              <span style={{ fontSize: 11 }}>点击 🏷 创建标签</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImageCard;
