/**
 * 图片网格组件
 * 显示图片列表，支持分页和选择
 * 支持外部文件拖入
 * 支持双击上传待上传图片
 */
import React, { useMemo, useCallback, useState } from "react";
import { ImageWithState, useSteamGuideImageStore } from "../../stores/useSteamGuideImageStore";
import { useImagePanelStore } from "../../stores/useImagePanelStore";
import { uploadSteamImage } from "../../services/steamBridge";
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
  const { setImageState, setPreviewId, setUploadProgress } = useSteamGuideImageStore();

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

  // 上传单张图片到 Steam
  const uploadImageToSteam = useCallback(async (image: ImageWithState): Promise<boolean> => {
    if (!image.localUrl || image.state !== "pending") {
      return false;
    }

    const imageId = image.fileName;

    try {
      setImageState(imageId, "uploading");
      setUploadProgress(imageId, 0);

      loggers.image.info("开始上传图片到 Steam", { fileName: image.fileName });

      // 从 localUrl 获取 Blob
      const response = await fetch(image.localUrl);
      const blob = await response.blob();
      const file = new File([blob], image.fileName, { type: blob.type || "image/png" });

      setUploadProgress(imageId, 30);

      // 上传到 Steam
      const result = await uploadSteamImage("chapter-preview", file, image.fileName);

      setUploadProgress(imageId, 100);

      // uploadSteamImage 返回的是 previewIds 数组
      const previewId = result.previewIds?.[0];
      if (previewId) {
        setPreviewId(imageId, previewId);
        loggers.image.info("图片上传成功", {
          fileName: image.fileName,
          previewId
        });
        return true;
      } else {
        throw new Error("上传成功但未返回 previewId");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      loggers.image.error("图片上传失败", { fileName: image.fileName, error: errorMessage });
      setImageState(imageId, "error", errorMessage);
      return false;
    }
  }, [setImageState, setPreviewId, setUploadProgress]);

  // 处理双击事件 - 如果是待上传图片则触发上传
  const handleImageDoubleClick = useCallback((image: ImageWithState) => {
    if (image.state === "pending") {
      // 待上传图片：触发上传
      void uploadImageToSteam(image);
    } else {
      // 其他状态：使用原有的双击行为
      onImageDoubleClick(image);
    }
  }, [uploadImageToSteam, onImageDoubleClick]);

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

    // 如果启用了自动上传，则自动上传添加的图片
    if (autoUploadOnDrop && addedImages.length > 0) {
      loggers.image.info("自动上传拖入的图片", { count: addedImages.length });
      for (const image of addedImages) {
        // 串行上传避免并发问题
        await uploadImageToSteam(image);
      }
    }
  }, [addLocalImage, autoUploadOnDrop, uploadImageToSteam]);

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
