/**
 * 智能布局图片网格
 * 根据图片原始尺寸自动调整网格占用
 */
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ImageWithState } from "../../stores/useSteamGuideImageStore";
import { useEditorConfigStore } from "../../stores/useEditorConfigStore";
import { useImagePanelStore } from "../../stores/useImagePanelStore";
import ImageCard from "./ImageCard";
import { COLORS } from "./styles";

interface SmartImageGridProps {
  images: ImageWithState[];
  onImageDoubleClick: (image: ImageWithState) => void;
  editingImageId: string | null;
  onEditingChange: (id: string | null) => void;
}

interface ImageDimensions {
  width: number;
  height: number;
}

// 缓存图片尺寸，避免重复加载
const dimensionsCache = new Map<string, ImageDimensions>();

/**
 * 根据图片尺寸计算网格占用
 */
function calculateSpan(
  dimensions: ImageDimensions | undefined,
  widthThreshold: number,
  heightThreshold: number
): { colSpan: number; rowSpan: number } {
  if (!dimensions) {
    return { colSpan: 1, rowSpan: 1 };
  }

  const isWide = dimensions.width >= widthThreshold;
  const isTall = dimensions.height >= heightThreshold;

  if (isWide && isTall) {
    // 大图：2×2
    return { colSpan: 2, rowSpan: 2 };
  } else if (isWide) {
    // 宽图：2×1
    return { colSpan: 2, rowSpan: 1 };
  } else if (isTall) {
    // 高图：1×2
    return { colSpan: 1, rowSpan: 2 };
  } else {
    // 小图：1×1
    return { colSpan: 1, rowSpan: 1 };
  }
}

const SmartImageGrid: React.FC<SmartImageGridProps> = ({
  images,
  onImageDoubleClick,
  editingImageId,
  onEditingChange
}) => {
  // 智能布局配置
  const smartLayoutEnabled = useEditorConfigStore((s) => s.smartLayoutEnabled);
  const widthThreshold = useEditorConfigStore((s) => s.smartLayoutWidthThreshold);
  const heightThreshold = useEditorConfigStore((s) => s.smartLayoutHeightThreshold);

  // 选中状态
  const selectedIds = useImagePanelStore((s) => s.selectedIds);
  const focusedId = useImagePanelStore((s) => s.focusedId);
  const selectImage = useImagePanelStore((s) => s.selectImage);
  const selectRange = useImagePanelStore((s) => s.selectRange);

  // 所有图片的 ID 列表（用于范围选择）
  const allImageIds = useMemo(() => {
    return images.map(img => img.previewId || img.fileName);
  }, [images]);

  // 图片尺寸状态
  const [imageDimensions, setImageDimensions] = useState<Map<string, ImageDimensions>>(
    new Map(dimensionsCache)
  );

  // 加载图片尺寸
  useEffect(() => {
    if (!smartLayoutEnabled) return;

    const loadDimensions = async () => {
      const newDimensions = new Map(imageDimensions);
      let hasNewData = false;

      for (const image of images) {
        const imageId = image.previewId || image.fileName;

        // 已缓存则跳过
        if (dimensionsCache.has(imageId)) continue;

        // 获取图片 URL
        const url = image.thumbnailUrl || image.localUrl;
        if (!url) continue;

        try {
          const dims = await loadImageDimensions(url);
          dimensionsCache.set(imageId, dims);
          newDimensions.set(imageId, dims);
          hasNewData = true;
        } catch (e) {
          // 加载失败，使用默认尺寸
          const defaultDims = { width: 200, height: 200 };
          dimensionsCache.set(imageId, defaultDims);
          newDimensions.set(imageId, defaultDims);
        }
      }

      if (hasNewData) {
        setImageDimensions(new Map(newDimensions));
      }
    };

    loadDimensions();
  }, [images, smartLayoutEnabled, imageDimensions]);

  // 选择处理（与 ImageGrid 一致）
  const handleSelect = useCallback((id: string, mode: "single" | "toggle" | "add") => {
    if (mode === "add") {
      // Shift+点击，执行范围选择
      selectRange(id, allImageIds);
    } else {
      selectImage(id, mode);
    }
  }, [selectImage, selectRange, allImageIds]);

  // 计算每个图片的 span
  const imageSpans = useMemo(() => {
    if (!smartLayoutEnabled) {
      return new Map<string, { colSpan: number; rowSpan: number }>();
    }

    const spans = new Map<string, { colSpan: number; rowSpan: number }>();
    for (const image of images) {
      const imageId = image.previewId || image.fileName;
      const dims = imageDimensions.get(imageId);
      spans.set(imageId, calculateSpan(dims, widthThreshold, heightThreshold));
    }
    return spans;
  }, [images, imageDimensions, smartLayoutEnabled, widthThreshold, heightThreshold]);

  // 基础单元格尺寸
  const baseSize = 150;

  if (images.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 200,
          color: COLORS.textMuted,
          fontSize: 14
        }}
      >
        暂无图片
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: smartLayoutEnabled
          ? `repeat(auto-fill, minmax(${baseSize}px, 1fr))`
          : `repeat(auto-fill, minmax(120px, 1fr))`,
        gridAutoRows: smartLayoutEnabled ? `${baseSize}px` : "auto",
        gap: 12,
        padding: 8
      }}
    >
      {images.map((image) => {
        const imageId = image.previewId || image.fileName;
        const isSelected = selectedIds.includes(imageId);
        const span = imageSpans.get(imageId) || { colSpan: 1, rowSpan: 1 };

        return (
          <div
            key={imageId}
            style={{
              gridColumn: smartLayoutEnabled ? `span ${span.colSpan}` : undefined,
              gridRow: smartLayoutEnabled ? `span ${span.rowSpan}` : undefined
            }}
          >
            <ImageCard
              image={image}
              isSelected={isSelected}
              isFocused={focusedId === imageId}
              onSelect={handleSelect}
              onDoubleClick={() => onImageDoubleClick(image)}
              isEditing={editingImageId === imageId}
              onEditingChange={onEditingChange}
            />
          </div>
        );
      })}
    </div>
  );
};

/**
 * 异步加载图片尺寸
 */
function loadImageDimensions(url: string): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight
      });
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default SmartImageGrid;
