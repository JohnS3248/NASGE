/**
 * 图片网格组件
 * 显示图片列表，支持分页和选择
 */
import React, { useMemo, useCallback } from "react";
import { ImageWithState } from "../../stores/useSteamGuideImageStore";
import { useImagePanelStore } from "../../stores/useImagePanelStore";
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
    setCurrentPage
  } = useImagePanelStore();

  const thumbnailSize = getThumbnailSizePixels();

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

  // 空状态
  if (images.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: COLORS.textMuted,
          fontSize: 13,
          textAlign: "center",
          padding: 20
        }}
      >
        <span style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>📷</span>
        <div>暂无图片</div>
        <div style={{ fontSize: 11, marginTop: 4 }}>
          图片将在此处显示
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 图片网格 */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexWrap: "wrap",
          gap: SIZES.gap,
          alignContent: "flex-start",
          overflow: "auto",
          padding: 4
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
              onDoubleClick={onImageDoubleClick}
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
