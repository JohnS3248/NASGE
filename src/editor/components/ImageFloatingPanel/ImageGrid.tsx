/**
 * 图片网格组件
 * 显示图片列表，支持分页和选择
 * 支持外部文件拖入
 * 支持双击上传待上传图片（通过队列）
 */
import React, { useMemo, useCallback, useState } from "react";
import { ImageWithState, useSteamGuideImageStore } from "../../stores/useSteamGuideImageStore";
import { useImagePanelStore } from "../../stores/useImagePanelStore";
import { queueImageUpload, queueBatchUpload, useUploadQueueState, uploadQueue } from "../../services/uploadQueue";
import { deleteSteamImage } from "../../services/steamBridge";
import ImageCard from "./ImageCard";
import { COLORS, SIZES } from "./styles";
import { loggers } from "../../../shared/logger";

interface ImageGridProps {
  images: ImageWithState[];
  onImageDoubleClick: (image: ImageWithState) => void;
}

const ImageGrid: React.FC<ImageGridProps> = ({
  images,
  onImageDoubleClick
}) => {
  const {
    currentPage,
    itemsPerPage,
    selectedIds,
    focusedId,
    selectImage,
    selectRange,
    getThumbnailSizePixels,
    setCurrentPage,
    autoUploadOnDrop
  } = useImagePanelStore();

  const thumbnailSize = getThumbnailSizePixels();
  const { setImageState, removeItem } = useSteamGuideImageStore();

  // 订阅上传队列状态
  const queueState = useUploadQueueState();

  // 计算分页
  const totalPages = useMemo(() => {
    if (itemsPerPage === 0) return 1; // 全部显示
    return Math.ceil(images.length / itemsPerPage);
  }, [images.length, itemsPerPage]);

  // 当前页的图片
  const currentImages = useMemo(() => {
    if (itemsPerPage === 0) return images; // 全部显示
    const start = (currentPage - 1) * itemsPerPage;
    return images.slice(start, start + itemsPerPage);
  }, [images, currentPage, itemsPerPage]);

  // 所有图片的 ID 列表（用于范围选择）
  const allImageIds = useMemo(() => {
    return images.map(img => img.previewId || img.fileName);
  }, [images]);

  // 选择处理
  const handleSelect = useCallback((id: string, mode: "single" | "toggle" | "add") => {
    if (mode === "add") {
      // Shift+点击，执行范围选择
      selectRange(id, allImageIds);
    } else {
      selectImage(id, mode);
    }
  }, [selectImage, selectRange, allImageIds]);

  // 获取选中的图片（用于批量拖拽）
  const getSelectedImages = useCallback(() => {
    return images.filter(img => {
      const imgId = img.previewId || img.fileName;
      return selectedIds.includes(imgId);
    });
  }, [images, selectedIds]);

  // 外部文件拖入支持
  const [isDragOver, setIsDragOver] = useState(false);
  const { addLocalImage } = useSteamGuideImageStore();

  // 处理双击事件 - 待上传或失败的图片加入上传队列
  const handleImageDoubleClick = useCallback((image: ImageWithState) => {
    if (image.state === "pending") {
      // 待上传图片：加入上传队列
      loggers.image.info("双击加入上传队列", { fileName: image.fileName });
      queueImageUpload(image);
    } else if (image.state === "error") {
      // 失败图片：重置状态后加入上传队列重试
      loggers.image.info("双击重试上传", { fileName: image.fileName });
      setImageState(image.fileName, "pending");
      queueImageUpload({ ...image, state: "pending", uploadError: undefined });
    } else {
      // 其他状态（success, uploading）：使用原有的双击行为
      onImageDoubleClick(image);
    }
  }, [setImageState, onImageDoubleClick]);

  // 获取图片在队列中的位置
  const getQueuePosition = useCallback((imageId: string): number => {
    // 检查是否正在上传
    if (queueState.currentItem?.id === imageId) {
      return 0;
    }
    // 检查是否在等待队列中
    const index = queueState.queue.findIndex(item => item.id === imageId);
    return index >= 0 ? index + 1 : -1;
  }, [queueState]);

  // 队列总长度（包括正在上传的）
  const queueLength = queueState.queue.length + (queueState.currentItem ? 1 : 0);

  // 删除本地图片（未上传的）
  const doDeleteLocalImage = useCallback((image: ImageWithState) => {
    loggers.image.info("删除本地图片", { fileName: image.fileName });

    // 从上传队列中移除
    uploadQueue.dequeue(image.fileName);

    // 从图片池中移除
    useSteamGuideImageStore.setState((state) => ({
      items: state.items.filter(item => item.fileName !== image.fileName)
    }));

    // 释放本地 URL
    if (image.localUrl) {
      URL.revokeObjectURL(image.localUrl);
    }
  }, []);

  // 删除 Steam 服务器端图片（已上传的）
  const doDeleteSteamImage = useCallback(async (image: ImageWithState) => {
    if (!image.previewId) return;

    loggers.image.info("删除 Steam 图片", { fileName: image.fileName, previewId: image.previewId });

    try {
      // 调用 Steam API 删除服务器端图片
      await deleteSteamImage(image.previewId);
      loggers.image.info("Steam 图片删除成功", { previewId: image.previewId });

      // 从本地图片池中移除
      removeItem(image.previewId);

      // 释放本地 URL
      if (image.localUrl) {
        URL.revokeObjectURL(image.localUrl);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      loggers.image.error("Steam 图片删除失败", { previewId: image.previewId, error: errorMsg });
      window.alert(`删除失败: ${errorMsg}`);
    }
  }, [removeItem]);

  // 删除图片处理
  const handleDeleteImage = useCallback((image: ImageWithState) => {
    // 已上传的图片：需要确认并删除 Steam 服务器端
    if (image.state === "success" && image.previewId) {
      const confirmed = window.confirm(`确认删除 "${image.fileName}"？\n\n此操作将同时删除 Steam 服务器上的图片，无法撤销。`);
      if (confirmed) {
        void doDeleteSteamImage(image);
      }
    } else {
      // 未上传的本地图片：直接删除
      doDeleteLocalImage(image);
    }
  }, [doDeleteSteamImage, doDeleteLocalImage]);

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

  // 拖拽进入
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasImageFiles(e)) {
      setIsDragOver(true);
    }
  }, [hasImageFiles]);

  // 拖拽离开
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 只有当离开到网格外部时才取消高亮
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { clientX, clientY } = e;
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      setIsDragOver(false);
    }
  }, []);

  // 拖拽悬停
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasImageFiles(e)) {
      e.dataTransfer.dropEffect = "copy";
      setIsDragOver(true);
    }
  }, [hasImageFiles]);

  // 拖拽放下
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    // 筛选图片文件
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
      autoUpload: autoUploadOnDrop
    });

    // 添加到图片池
    const addedImages: ImageWithState[] = [];
    for (const file of imageFiles) {
      const image = await addLocalImage(file);
      addedImages.push(image);
    }

    // 如果启用了自动上传，则将图片加入上传队列
    if (autoUploadOnDrop && addedImages.length > 0) {
      loggers.image.info("自动加入上传队列", { count: addedImages.length });
      queueBatchUpload(addedImages);
    }
  }, [addLocalImage, autoUploadOnDrop]);

  // 空状态（也支持拖入）
  if (images.length === 0) {
    return (
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: COLORS.textMuted,
          fontSize: 13,
          textAlign: "center",
          padding: 20,
          border: isDragOver ? `2px dashed ${COLORS.accent}` : "2px dashed transparent",
          borderRadius: SIZES.borderRadiusSmall,
          background: isDragOver ? "rgba(102, 192, 244, 0.1)" : "transparent",
          transition: "all 0.15s ease"
        }}
      >
        <span style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>📷</span>
        <div>{isDragOver ? "放开添加图片" : "暂无图片"}</div>
        <div style={{ fontSize: 11, marginTop: 4 }}>
          {isDragOver ? "松开鼠标添加到图片池" : "拖拽图片到此处添加"}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 图片网格（支持外部文件拖入） */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{
          flex: 1,
          display: "flex",
          flexWrap: "wrap",
          gap: SIZES.gap,
          alignContent: "flex-start",
          overflow: "auto",
          padding: 4,
          border: isDragOver ? `2px dashed ${COLORS.accent}` : "2px dashed transparent",
          borderRadius: SIZES.borderRadiusSmall,
          background: isDragOver ? "rgba(102, 192, 244, 0.08)" : "transparent",
          transition: "all 0.15s ease"
        }}
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
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  // 计算当前显示范围
  const start = (currentPage - 1) * itemsPerPage + 1;
  const end = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 4px",
        borderTop: `1px solid ${COLORS.border}`,
        fontSize: 12,
        color: COLORS.textSecondary
      }}
    >
      {/* 左侧：页码信息 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={handlePrev}
          disabled={currentPage <= 1}
          style={{
            width: 24,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `1px solid ${COLORS.border}`,
            borderRadius: SIZES.borderRadiusSmall,
            background: "transparent",
            color: currentPage <= 1 ? COLORS.textMuted : COLORS.textSecondary,
            cursor: currentPage <= 1 ? "not-allowed" : "pointer",
            opacity: currentPage <= 1 ? 0.5 : 1
          }}
        >
          ◀
        </button>
        <span>
          {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          onClick={handleNext}
          disabled={currentPage >= totalPages}
          style={{
            width: 24,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `1px solid ${COLORS.border}`,
            borderRadius: SIZES.borderRadiusSmall,
            background: "transparent",
            color: currentPage >= totalPages ? COLORS.textMuted : COLORS.textSecondary,
            cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
            opacity: currentPage >= totalPages ? 0.5 : 1
          }}
        >
          ▶
        </button>
      </div>

      {/* 右侧：显示范围 */}
      <div style={{ color: COLORS.textMuted }}>
        {start}-{end} / {totalItems}
      </div>
    </div>
  );
};

export default ImageGrid;
