/**
 * 图片卡片组件
 * 显示单个图片的缩略图、文件名和状态
 * 支持拖拽到编辑器插入
 */
import React, { useState, useCallback, useRef, useEffect, useLayoutEffect } from "react";
import { ImageWithState, useSteamGuideImageStore } from "../../stores/useSteamGuideImageStore";
import { useImagePanelStore } from "../../stores/useImagePanelStore";
import { useGuideStore, type ImageTag } from "../../stores/useGuideStore";
import { useArchiveStore } from "../../stores/useArchiveStore";
import { useEditorConfigStore } from "../../stores/useEditorConfigStore";
import { ImageUploadService } from "../../services/ImageUploadService";
import { XIcon, CheckIcon } from "./icons";
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
  getSelectedImages?: () => ImageWithState[];
  onDelete?: (image: ImageWithState) => void;
  queuePosition?: number;
  queueLength?: number;
  isEditing?: boolean;
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
  const currentArchiveId = useGuideStore((s) => s.currentArchiveId);
  const {
    getTagsForImage,
    addTagToImage,
    removeTagFromImage
  } = useArchiveStore();
  const thumbnailSize = getThumbnailSizePixels();
  const [imageError, setImageError] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // 获取当前图片的标签
  const imageId = image.previewId || image.fileName;
  const imageTags = currentArchiveId ? getTagsForImage(currentArchiveId, imageId) : [];
  const archive = useArchiveStore((s) => currentArchiveId ? s.archives[currentArchiveId] : undefined);
  const allTags = archive?.imageTags || [];

  const canRename = image.state === "pending";
  const isActuallyEditing = isEditing && canRename;

  // 分离文件名和扩展名
  const getFileNameParts = useCallback((fileName: string) => {
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex > 0) {
      return {
        baseName: fileName.substring(0, lastDotIndex),
        extension: fileName.substring(lastDotIndex)
      };
    }
    return { baseName: fileName, extension: '' };
  }, []);

  const { baseName, extension } = getFileNameParts(image.fileName);
  const [editValue, setEditValue] = useState(baseName);

  useEffect(() => {
    if (isActuallyEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isActuallyEditing]);

  useEffect(() => {
    if (!isActuallyEditing) {
      const { baseName: newBaseName } = getFileNameParts(image.fileName);
      setEditValue(newBaseName);
    }
  }, [image.fileName, isActuallyEditing, getFileNameParts]);

  const sanitizeBaseName = useCallback((name: string): string => {
    let sanitized = name.replace(/[\\/:*?"<>|]/g, "_");
    if (sanitized.length > 100) sanitized = sanitized.substring(0, 100);
    return sanitized;
  }, []);

  const handleRenameConfirm = useCallback(() => {
    const trimmed = editValue.trim();
    if (!trimmed) {
      onEditingChange?.(null);
      return;
    }
    const sanitized = sanitizeBaseName(trimmed);
    const oldFileName = image.fileName;
    const newFileName = sanitized !== baseName ? sanitized + extension : oldFileName;

    if (sanitized !== baseName) {
      renameImage(image.previewId || image.fileName, newFileName);
      if (sanitized !== trimmed) {
        loggers.image.info("内联重命名（已清理非法字符）", { input: trimmed, sanitized, newFileName });
      } else {
        loggers.image.info("内联重命名图片", { from: oldFileName, to: newFileName });
      }
    }

    if (isPendingUploadAfterRename(oldFileName)) {
      removePendingUploadAfterRename(oldFileName);
      setTimeout(() => {
        const updatedImage = getImageById(newFileName);
        if (updatedImage && updatedImage.state === "pending") {
          loggers.image.info("改名完成，触发自动上传", { fileName: newFileName });
          ImageUploadService.queuePoolUpload(updatedImage);
        } else {
          loggers.image.warn("改名后无法找到图片或图片已不是待上传状态", {
            newFileName, found: !!updatedImage, state: updatedImage?.state
          });
        }
      }, 50);
    }
    onEditingChange?.(null);
  }, [editValue, baseName, extension, image.fileName, image.previewId, renameImage, onEditingChange, sanitizeBaseName, isPendingUploadAfterRename, removePendingUploadAfterRename, getImageById]);

  const handleRenameCancel = useCallback(() => {
    setEditValue(baseName);
    onEditingChange?.(null);
  }, [baseName, onEditingChange]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); handleRenameConfirm(); }
    else if (e.key === "Escape") { e.preventDefault(); handleRenameCancel(); }
  }, [handleRenameConfirm, handleRenameCancel]);

  const displayUrl = image.localUrl || image.thumbnailUrl || image.originalUrl;

  const isInQueue = queuePosition >= 0;
  const isCurrentlyUploading = queuePosition === 0;

  // 状态颜色映射
  const statusColorMap: Record<string, string> = {
    pending: "#6a7a8a",
    uploading: "var(--color-warning)",
    success: "var(--color-success)",
    error: "var(--color-danger)",
    queued: "var(--color-accent)"
  };

  const getDisplayStatus = (): { text: string; color: string } => {
    if (image.state === "pending") {
      if (isCurrentlyUploading) return { text: "上传中", color: statusColorMap.uploading };
      if (isInQueue) return { text: `队列中 (${queuePosition}/${queueLength})`, color: statusColorMap.queued };
      return { text: "待上传", color: statusColorMap.pending };
    }
    if (image.state === "uploading") return { text: "上传中", color: statusColorMap.uploading };
    if (image.state === "success") return { text: "已上传", color: statusColorMap.success };
    if (image.state === "error") return { text: "失败", color: statusColorMap.error };
    return { text: "未知", color: "var(--color-text-muted)" };
  };

  const displayStatus = getDisplayStatus();

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) onSelect(imageId, "toggle");
    else if (e.shiftKey) onSelect(imageId, "add");
    else onSelect(imageId, "single");
  }, [imageId, onSelect]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onDoubleClick(image);
  }, [image, onDoubleClick]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    setIsDragging(true);
    let imagesToDrag: ImageWithState[] = [image];
    if (isSelected && getSelectedImages) {
      const selectedImages = getSelectedImages();
      if (selectedImages.length > 1) imagesToDrag = selectedImages;
    }

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

    e.dataTransfer.setData(NASGE_IMAGE_MIME_TYPE, JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = "copy";
    loggers.image.verbose("开始拖拽图片", {
      count: imagesToDrag.length,
      fileNames: imagesToDrag.map(img => img.fileName)
    });
  }, [image, isSelected, getSelectedImages]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    loggers.image.verbose("结束拖拽图片");
  }, []);

  const imagePoolMenuConfig = useEditorConfigStore((state) => state.imagePoolMenuConfig);

  const contextMenuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!imagePoolMenuConfig.enabled) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, [imagePoolMenuConfig.enabled]);

  const closeContextMenu = useCallback(() => { setContextMenu(null); }, []);

  // 渲染后根据实际菜单尺寸调整位置，防止溢出视口
  useLayoutEffect(() => {
    const el = contextMenuRef.current;
    if (!contextMenu || !el) return;

    const rect = el.getBoundingClientRect();
    let adjusted = false;
    let x = contextMenu.x;
    let y = contextMenu.y;

    if (x + rect.width > window.innerWidth) {
      x = Math.max(0, window.innerWidth - rect.width);
      adjusted = true;
    }
    if (y + rect.height > window.innerHeight) {
      y = Math.max(0, window.innerHeight - rect.height);
      adjusted = true;
    }

    if (adjusted) {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
  }, [contextMenu]);

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

  const handleToggleTag = useCallback((tagId: string) => {
    if (!currentArchiveId) return;
    const hasTag = imageTags.some(t => t.id === tagId);
    if (hasTag) removeTagFromImage(currentArchiveId, imageId, tagId);
    else addTagToImage(currentArchiveId, imageId, tagId);
  }, [currentArchiveId, imageId, imageTags, addTagToImage, removeTagFromImage]);

  const hasTagsToShow = imageTags.length > 0;
  const cardHeight = thumbnailSize + (showFileName || showStatusIndicator ? 32 : 0) + (hasTagsToShow ? 18 : 0);

  return (
    <div
      ref={cardRef}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onContextMenu={handleContextMenu}
      className={`group flex flex-col rounded-sm overflow-hidden transition-all duration-150 ease-out box-border ${
        isSelected
          ? "bg-accent/20 border-2 border-accent"
          : isFocused
            ? "border-2 border-[rgba(102,192,244,0.4)] bg-transparent"
            : "border-2 border-transparent bg-transparent hover:bg-accent/10"
      }`}
      style={{
        width: thumbnailSize,
        height: cardHeight,
        cursor: isDragging ? "grabbing" : "grab",
        opacity: isDragging ? 0.5 : 1
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      title={`${image.fileName}\n状态: ${displayStatus.text}\n拖拽到编辑器插入`}
    >
      {/* 缩略图区域 */}
      <div
        className="flex items-center justify-center bg-bg-app/60 relative m-0.5"
        style={{
          width: thumbnailSize - 4,
          height: thumbnailSize - 4
        }}
      >
        {/* 删除按钮 — 纯 CSS 显隐 */}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(image); }}
            className="absolute top-0.5 right-0.5 w-[18px] h-[18px] flex items-center justify-center bg-black/70 border-none rounded-full text-text-secondary cursor-pointer z-10 p-0 leading-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:!bg-danger hover:!text-white"
            title="删除图片"
          >
            <XIcon size={10} />
          </button>
        )}

        {imageError || !displayUrl ? (
          <div className="flex flex-col items-center justify-center text-text-muted text-[10px]">
            <span className="text-xl mb-1 opacity-50"><XIcon size={20} /></span>
            <span>加载失败</span>
          </div>
        ) : (
          <img
            src={displayUrl}
            alt={image.fileName}
            className="max-w-full max-h-full object-contain"
            onError={() => setImageError(true)}
            draggable={false}
          />
        )}

        {/* 上传进度指示 */}
        {image.state === "uploading" && image.uploadProgress !== undefined && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/50">
            <div
              className="h-full bg-warning transition-[width] duration-200 ease-out"
              style={{ width: `${image.uploadProgress}%` }}
            />
          </div>
        )}
      </div>

      {/* 文件名和状态 */}
      {(showFileName || showStatusIndicator) && (
        <div className="px-1 py-0.5 text-[10px] leading-tight overflow-hidden">
          {showFileName && (
            isActuallyEditing ? (
              <div
                className="flex items-center gap-0"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  onBlur={handleRenameConfirm}
                  className="flex-1 min-w-0 px-0.5 py-px text-[10px] bg-accent-subtle border border-accent rounded-l-xs text-text-primary outline-none box-border"
                />
                <span className="shrink-0 px-0.5 py-px text-[10px] bg-[rgba(60,75,95,0.6)] border border-accent border-l-0 rounded-r-xs text-text-muted">
                  {extension}
                </span>
              </div>
            ) : (
              <div className="text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis">
                {image.fileName}
              </div>
            )
          )}
          {showStatusIndicator && (
            <div className="flex items-center gap-1" style={{ color: displayStatus.color }}>
              <span className="text-[8px]">●</span>
              <span>{displayStatus.text}</span>
            </div>
          )}
        </div>
      )}

      {/* 标签显示区域 */}
      {hasTagsToShow && (
        <div className="flex flex-wrap gap-0.5 px-1 py-0.5 overflow-hidden max-h-4">
          {imageTags.slice(0, 3).map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-0.5 px-1 rounded-xs text-[9px] text-text-primary whitespace-nowrap max-w-[50px] overflow-hidden text-ellipsis"
              style={{
                background: `${tag.color}33`,
                border: `1px solid ${tag.color}66`
              }}
            >
              <span
                className="w-[5px] h-[5px] rounded-full shrink-0"
                style={{ background: tag.color }}
              />
              {tag.name}
            </span>
          ))}
          {imageTags.length > 3 && (
            <span className="text-[9px] text-text-muted">
              +{imageTags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-[rgba(13,23,36,0.95)] border border-border-accent rounded-md shadow-lg py-1 min-w-[160px] z-[3000]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {allTags.length > 0 ? (
            <>
              <div className="px-3 py-1 text-[11px] text-text-muted border-b border-border-accent">
                选择标签
              </div>
              {allTags.map((tag) => {
                const hasTag = imageTags.some(t => t.id === tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => { handleToggleTag(tag.id); closeContextMenu(); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 border-none bg-transparent text-text-primary text-xs cursor-pointer text-left hover:bg-white/5"
                  >
                    <span
                      className="w-3.5 h-3.5 flex items-center justify-center rounded-xs text-[10px]"
                      style={{
                        border: `1px solid ${tag.color}`,
                        background: hasTag ? tag.color : "transparent",
                        color: hasTag ? "#fff" : "transparent"
                      }}
                    >
                      <CheckIcon size={10} />
                    </span>
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: tag.color }}
                    />
                    <span>{tag.name}</span>
                  </button>
                );
              })}
            </>
          ) : (
            <div className="p-3 text-xs text-text-muted text-center">
              暂无标签
              <br />
              <span className="text-[11px]">在标题栏点击标签图标创建</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImageCard;
