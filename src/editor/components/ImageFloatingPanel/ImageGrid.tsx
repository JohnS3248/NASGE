/**
 * 图片网格组件
 * 显示图片列表，支持分页和选择
 * 支持外部文件拖入
 * 支持双击上传待上传图片（通过队列）
 */
import React, { useMemo, useCallback, useState, useEffect } from "react";
import { ImageWithState, useSteamGuideImageStore } from "../../stores/useSteamGuideImageStore";
import { useImagePanelStore } from "../../stores/useImagePanelStore";
import { useEditorConfigStore, matchShortcut } from "../../stores/useEditorConfigStore";
import { useGuideStore } from "../../stores/useGuideStore";
import { ImageUploadService, usePoolUploadQueueState } from "../../services/ImageUploadService";
import { deleteSteamImage } from "../../services/steamBridge";
import ImageCard from "./ImageCard";
import { SIZES } from "./styles";
import { ImageIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { loggers } from "../../../shared/logger";
import { toast } from "../../stores/useToastStore";
import { dialog } from "../../stores/useDialogStore";
import { SkeletonBlock } from "../Skeleton";

interface ImageGridProps {
  images: ImageWithState[];
  onImageDoubleClick: (image: ImageWithState) => void;
  editingImageId: string | null;
  onEditingChange: (imageId: string | null) => void;
  isLoading?: boolean;
}

const ImageGrid: React.FC<ImageGridProps> = ({
  images,
  onImageDoubleClick,
  editingImageId,
  onEditingChange,
  isLoading = false
}) => {
  const {
    currentPage,
    itemsPerPage,
    selectedIds,
    focusedId,
    selectImage,
    selectRange,
    clearSelection,
    getThumbnailSizePixels,
    setCurrentPage
  } = useImagePanelStore();

  // 悬浮窗设置
  const autoUploadInPanel = useEditorConfigStore((state) => state.autoUploadInPanel);
  const promptRenameOnDrop = useEditorConfigStore((state) => state.promptRenameOnDrop);
  const shortcuts = useEditorConfigStore((state) => state.shortcuts);

  const thumbnailSize = getThumbnailSizePixels();
  const { setImageState, removeItem } = useSteamGuideImageStore();

  // 订阅上传队列状态
  const queueState = usePoolUploadQueueState();

  // 计算分页
  const totalPages = useMemo(() => {
    if (itemsPerPage === 0) return 1;
    return Math.ceil(images.length / itemsPerPage);
  }, [images.length, itemsPerPage]);

  // 当前页的图片
  const currentImages = useMemo(() => {
    if (itemsPerPage === 0) return images;
    const start = (currentPage - 1) * itemsPerPage;
    return images.slice(start, start + itemsPerPage);
  }, [images, currentPage, itemsPerPage]);

  // 所有图片的 ID 列表
  const allImageIds = useMemo(() => {
    return images.map(img => img.previewId || img.fileName);
  }, [images]);

  // 选择处理
  const handleSelect = useCallback((id: string, mode: "single" | "toggle" | "add") => {
    if (mode === "add") {
      selectRange(id, allImageIds);
    } else {
      selectImage(id, mode);
    }
  }, [selectImage, selectRange, allImageIds]);

  // 获取选中的图片
  const getSelectedImages = useCallback(() => {
    return images.filter(img => {
      const imgId = img.previewId || img.fileName;
      return selectedIds.includes(imgId);
    });
  }, [images, selectedIds]);

  // 外部文件拖入支持
  const [isDragOver, setIsDragOver] = useState(false);
  const { addLocalImage } = useSteamGuideImageStore();

  const currentArchiveId = useGuideStore((state) => state.currentArchiveId);

  // 处理双击事件
  const handleImageDoubleClick = useCallback((image: ImageWithState) => {
    if (image.state === "pending") {
      loggers.image.info("双击加入上传队列", { fileName: image.fileName });
      ImageUploadService.queuePoolUpload(image);
    } else if (image.state === "error") {
      loggers.image.info("双击重试上传", { fileName: image.fileName });
      setImageState(image.fileName, "pending");
      ImageUploadService.queuePoolUpload({ ...image, state: "pending", uploadError: undefined });
    } else {
      onImageDoubleClick(image);
    }
  }, [setImageState, onImageDoubleClick]);

  // 获取图片在队列中的位置
  const getQueuePosition = useCallback((imageId: string): number => {
    if (queueState.currentItem?.id === imageId) {
      return 0;
    }
    const index = queueState.queue.findIndex(item => item.id === imageId);
    return index >= 0 ? index + 1 : -1;
  }, [queueState]);

  const queueLength = queueState.queue.length + (queueState.currentItem ? 1 : 0);

  // 删除本地图片
  const doDeleteLocalImage = useCallback((image: ImageWithState) => {
    loggers.image.info("删除本地图片", { fileName: image.fileName });
    ImageUploadService.dequeuePoolImage(image.fileName);
    useSteamGuideImageStore.setState((state) => ({
      items: state.items.filter(item => item.fileName !== image.fileName)
    }));
    if (image.localUrl) {
      URL.revokeObjectURL(image.localUrl);
    }
  }, []);

  // 删除 Steam 服务器端图片
  const doDeleteSteamImage = useCallback(async (image: ImageWithState) => {
    if (!image.previewId) return;
    loggers.image.info("删除 Steam 图片", { fileName: image.fileName, previewId: image.previewId });
    try {
      await deleteSteamImage(image.previewId);
      loggers.image.info("Steam 图片删除成功", { previewId: image.previewId });
      removeItem(image.previewId);
      if (image.localUrl) {
        URL.revokeObjectURL(image.localUrl);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      loggers.image.error("Steam 图片删除失败", { previewId: image.previewId, error: errorMsg });
      toast.error(`删除失败: ${errorMsg}`);
    }
  }, [removeItem]);

  // 删除图片处理
  const handleDeleteImage = useCallback(async (image: ImageWithState) => {
    if (image.state === "success" && image.previewId) {
      const confirmed = await dialog.confirm({ message: `确认删除 "${image.fileName}"？\n\n此操作将同时删除 Steam 服务器上的图片，无法撤销。`, danger: true });
      if (confirmed) {
        void doDeleteSteamImage(image);
      }
    } else {
      doDeleteLocalImage(image);
    }
  }, [doDeleteSteamImage, doDeleteLocalImage]);

  // 快捷键处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingImageId) return;
      const activeElement = document.activeElement;
      if (activeElement && (
        activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA" ||
        (activeElement as HTMLElement).isContentEditable
      )) {
        return;
      }

      if (matchShortcut(e, shortcuts.renameImage) && focusedId) {
        e.preventDefault();
        const focusedImage = images.find(
          img => (img.previewId || img.fileName) === focusedId
        );
        if (focusedImage && focusedImage.state === "pending") {
          loggers.image.info("快捷键触发重命名", { fileName: focusedImage.fileName });
          onEditingChange(focusedId);
        }
        return;
      }

      if (matchShortcut(e, shortcuts.deleteImage) && selectedIds.length > 0) {
        e.preventDefault();
        loggers.image.info("快捷键触发删除", { count: selectedIds.length });
        const selectedImages = images.filter(img => {
          const imgId = img.previewId || img.fileName;
          return selectedIds.includes(imgId);
        });
        const uploadedImages = selectedImages.filter(img => img.state === "success" && img.previewId);
        const localImages = selectedImages.filter(img => img.state !== "success" || !img.previewId);

        if (uploadedImages.length > 0) {
          const msg = selectedImages.length === 1
            ? `确认删除 "${selectedImages[0].fileName}"？\n\n此操作将同时删除 Steam 服务器上的图片，无法撤销。`
            : `确认删除 ${selectedImages.length} 张图片？\n\n其中 ${uploadedImages.length} 张已上传到 Steam，删除后无法撤销。`;
          void dialog.confirm({ message: msg, danger: true }).then((confirmed) => {
            if (confirmed) {
              for (const img of selectedImages) {
                if (img.state === "success" && img.previewId) {
                  void doDeleteSteamImage(img);
                } else {
                  doDeleteLocalImage(img);
                }
              }
              clearSelection();
            }
          });
        } else {
          for (const img of localImages) {
            doDeleteLocalImage(img);
          }
          clearSelection();
        }
        return;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    focusedId, editingImageId, images, selectedIds,
    onEditingChange, shortcuts, doDeleteLocalImage, doDeleteSteamImage, clearSelection
  ]);

  // 检查是否有图片文件
  const hasImageFiles = useCallback((event: React.DragEvent) => {
    const items = event.dataTransfer?.items;
    if (!items) return false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "file" && items[i].type.startsWith("image/")) {
        return true;
      }
    }
    return false;
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasImageFiles(e)) setIsDragOver(true);
  }, [hasImageFiles]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { clientX, clientY } = e;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasImageFiles(e)) {
      e.dataTransfer.dropEffect = "copy";
      setIsDragOver(true);
    }
  }, [hasImageFiles]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const imageFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith("image/")) {
        imageFiles.push(files[i]);
      }
    }
    if (imageFiles.length === 0) return;

    loggers.image.info("外部文件拖入悬浮窗", {
      count: imageFiles.length,
      fileNames: imageFiles.map(f => f.name),
      autoUpload: autoUploadInPanel
    });

    const addedImages: ImageWithState[] = [];
    const skippedFiles: { fileName: string; existingFileName: string; reason: string }[] = [];

    for (const file of imageFiles) {
      const result = await addLocalImage(file, currentArchiveId ?? undefined);
      if (result.skipped) {
        skippedFiles.push({
          fileName: file.name,
          existingFileName: result.existingFileName || '',
          reason: result.reason === 'duplicate_uploaded' ? '已上传' : '待上传'
        });
      } else {
        addedImages.push(result.image);
      }
    }

    if (skippedFiles.length > 0) {
      if (imageFiles.length === 1) {
        toast.info(`"${skippedFiles[0].fileName}" 已存在（${skippedFiles[0].reason}），已跳过`);
      } else {
        toast.info(`已添加 ${addedImages.length} 张图片\n跳过 ${skippedFiles.length} 张重复图片`);
      }
    }

    if (promptRenameOnDrop && addedImages.length === 1) {
      const imageId = addedImages[0].previewId || addedImages[0].fileName;
      onEditingChange(imageId);
    }

    if (autoUploadInPanel && addedImages.length > 0) {
      loggers.image.info("自动加入上传队列", { count: addedImages.length });
      ImageUploadService.queuePoolBatchUpload(addedImages);
    }
  }, [addLocalImage, autoUploadInPanel, promptRenameOnDrop, onEditingChange, currentArchiveId]);

  // 加载骨架
  if (isLoading && images.length === 0) {
    const skeletonCount = 8;
    return (
      <div
        className="flex-1 flex flex-wrap content-start p-1"
        style={{ gap: SIZES.gap }}
      >
        {Array.from({ length: skeletonCount }, (_, i) => (
          <SkeletonBlock
            key={i}
            width={thumbnailSize}
            height={Math.round(thumbnailSize * 0.75)}
          />
        ))}
      </div>
    );
  }

  // 空状态
  if (images.length === 0) {
    return (
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center h-full text-text-muted text-[13px] text-center p-5 rounded-sm transition-all duration-150 ease-out ${
          isDragOver
            ? "border-2 border-dashed border-accent bg-accent/10"
            : "border-2 border-dashed border-transparent"
        }`}
      >
        <span className="mb-3 opacity-40"><ImageIcon size={32} /></span>
        <div>{isDragOver ? "放开添加图片" : "暂无图片"}</div>
        <div className="text-[11px] mt-1">
          {isDragOver ? "松开鼠标添加到图片池" : "拖拽图片到此处添加"}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 图片网格 */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`flex-1 flex flex-wrap content-start overflow-auto p-1 rounded-sm transition-all duration-150 ease-out ${
          isDragOver
            ? "border-2 border-dashed border-accent bg-accent/[0.08]"
            : "border-2 border-dashed border-transparent"
        }`}
        style={{ gap: SIZES.gap }}
      >
        {currentImages.map((image) => {
          const imageId = image.previewId || image.fileName;
          return (
            <ImageCard
              key={imageId}
              image={image}
              isSelected={selectedIds.includes(imageId)}
              isFocused={focusedId === imageId}
              onSelect={handleSelect}
              onDoubleClick={handleImageDoubleClick}
              getSelectedImages={getSelectedImages}
              onDelete={handleDeleteImage}
              queuePosition={getQueuePosition(image.fileName)}
              queueLength={queueLength}
              isEditing={editingImageId === imageId}
              onEditingChange={onEditingChange}
            />
          );
        })}
      </div>

      {/* 分页控件 */}
      {itemsPerPage > 0 && totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={images.length}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      )}
    </div>
  );
};

// ============ 分页组件 ============

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange
}) => {
  const handlePrev = () => {
    if (currentPage > 1) onPageChange(currentPage - 1);
  };
  const handleNext = () => {
    if (currentPage < totalPages) onPageChange(currentPage + 1);
  };

  const start = (currentPage - 1) * itemsPerPage + 1;
  const end = Math.min(currentPage * itemsPerPage, totalItems);

  const navBtn = (disabled: boolean) =>
    `w-6 h-6 flex items-center justify-center border border-border-accent rounded-sm bg-transparent cursor-pointer ${
      disabled ? "text-text-muted opacity-50 !cursor-not-allowed" : "text-text-secondary"
    }`;

  return (
    <div className="flex items-center justify-between px-1 py-2 border-t border-border-accent text-xs text-text-secondary">
      <div className="flex items-center gap-2">
        <button type="button" onClick={handlePrev} disabled={currentPage <= 1} className={navBtn(currentPage <= 1)}>
          <ChevronLeftIcon size={14} />
        </button>
        <span>{currentPage} / {totalPages}</span>
        <button type="button" onClick={handleNext} disabled={currentPage >= totalPages} className={navBtn(currentPage >= totalPages)}>
          <ChevronRightIcon size={14} />
        </button>
      </div>
      <div className="text-text-muted">
        {start}-{end} / {totalItems}
      </div>
    </div>
  );
};

export default ImageGrid;
