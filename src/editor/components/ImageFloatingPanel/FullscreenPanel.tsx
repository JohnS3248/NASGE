/**
 * 全屏图片池面板
 * 提供更大的浏览区域，支持 ESC 退出
 * 支持智能布局模式
 */
import React, { useEffect, useCallback } from "react";
import { ImageWithState } from "../../stores/useSteamGuideImageStore";
import { SortBy, SortOrder, FilterStatus } from "../../stores/useImagePanelStore";
import { useEditorConfigStore } from "../../stores/useEditorConfigStore";
import ImageGrid from "./ImageGrid";
import SmartImageGrid from "./SmartImageGrid";
import SearchBar from "./SearchBar";
import { COLORS, Z_INDEX } from "./styles";

interface FullscreenPanelProps {
  images: ImageWithState[];
  archiveImages: ImageWithState[];
  archiveName?: string;
  // 搜索
  searchValue: string;
  onSearchChange: (value: string) => void;
  // 排序
  sortBy: SortBy;
  sortOrder: SortOrder;
  onSortByChange: (sortBy: SortBy) => void;
  onToggleSortOrder: () => void;
  // 筛选
  filterStatus: FilterStatus;
  onFilterStatusChange: (status: FilterStatus) => void;
  // 编辑状态
  editingImageId: string | null;
  onEditingChange: (id: string | null) => void;
  // 关闭
  onClose: () => void;
}

const FullscreenPanel: React.FC<FullscreenPanelProps> = ({
  images,
  archiveImages,
  archiveName,
  searchValue,
  onSearchChange,
  sortBy,
  sortOrder,
  onSortByChange,
  onToggleSortOrder,
  filterStatus,
  onFilterStatusChange,
  editingImageId,
  onEditingChange,
  onClose
}) => {
  // 智能布局设置
  const smartLayoutEnabled = useEditorConfigStore((s) => s.smartLayoutEnabled);

  // ESC 键退出全屏
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // 点击背景退出
  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.85)",
        zIndex: Z_INDEX.panelActive + 100,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 40
      }}
      onClick={handleBackgroundClick}
    >
      {/* 内容容器 */}
      <div
        style={{
          width: "100%",
          maxWidth: 1400,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: COLORS.panelBg,
          borderRadius: 12,
          border: `1px solid ${COLORS.border}`,
          boxShadow: `0 8px 32px ${COLORS.shadow}`,
          overflow: "hidden"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: `1px solid ${COLORS.border}`,
            background: "rgba(8, 16, 28, 0.8)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>📷</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>
              {archiveName || "图片池"}
            </span>
            <span style={{ fontSize: 12, color: COLORS.textMuted }}>
              ({images.length}/{archiveImages.length})
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              color: COLORS.textSecondary,
              cursor: "pointer",
              fontSize: 16,
              borderRadius: 4
            }}
            title="退出全屏 (ESC)"
          >
            ✕
          </button>
        </div>

        {/* 搜索栏 */}
        <SearchBar
          searchValue={searchValue}
          onSearchChange={onSearchChange}
          resultCount={images.length}
          totalCount={archiveImages.length}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortByChange={onSortByChange}
          onToggleSortOrder={onToggleSortOrder}
          filterStatus={filterStatus}
          onFilterStatusChange={onFilterStatusChange}
        />

        {/* 图片网格 */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: 16
          }}
        >
          {smartLayoutEnabled ? (
            <SmartImageGrid
              images={images}
              onImageDoubleClick={() => {}}
              editingImageId={editingImageId}
              onEditingChange={onEditingChange}
            />
          ) : (
            <ImageGrid
              images={images}
              onImageDoubleClick={() => {}}
              editingImageId={editingImageId}
              onEditingChange={onEditingChange}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default FullscreenPanel;
