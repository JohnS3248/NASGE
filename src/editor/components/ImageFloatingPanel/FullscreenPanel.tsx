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
import { Z_INDEX } from "./styles";
import { ImageIcon, XIcon } from "./icons";

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
      className="fixed inset-0 bg-black/85 flex flex-col items-center justify-center p-10"
      style={{ zIndex: Z_INDEX.panelActive + 100 }}
      onClick={handleBackgroundClick}
    >
      {/* 内容容器 */}
      <div
        className="w-full max-w-[1400px] h-full flex flex-col bg-[rgba(13,23,36,0.95)] rounded-lg border border-border-accent shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-accent bg-bg-app/80">
          <div className="flex items-center gap-2">
            <ImageIcon size={18} />
            <span className="text-sm font-semibold text-text-primary">
              {archiveName || "图片池"}
            </span>
            <span className="text-xs text-text-muted">
              ({images.length}/{archiveImages.length})
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center border-none bg-transparent text-text-secondary cursor-pointer rounded-sm hover:bg-danger/30 hover:text-danger"
            title="退出全屏 (ESC)"
          >
            <XIcon size={16} />
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
        <div className="flex-1 overflow-auto p-4">
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
