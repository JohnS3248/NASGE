/**
 * 图片悬浮窗主组件
 * 支持拖拽移动、尺寸调整、折叠、最小化
 */
import React, { useCallback, useRef, useState, useEffect, useMemo } from "react";
import { useImagePanelStore, PanelPosition, PanelSize, ImageSourceTab } from "../../stores/useImagePanelStore";
import { useSteamGuideImageStore, ImageWithState } from "../../stores/useSteamGuideImageStore";
import { useGuideStore } from "../../stores/useGuideStore";
import { useArchiveStore } from "../../stores/useArchiveStore";
import { addFilesToPool } from "../../services/imagePoolIntake";
import PanelHeader from "./PanelHeader";
import MinimizedPanel from "./MinimizedPanel";
import ImageGrid from "./ImageGrid";
import TagManager from "./TagManager";
import SearchBar from "./SearchBar";
import FullscreenPanel from "./FullscreenPanel";
import { resizeHandleStyle, SIZES, Z_INDEX } from "./styles";
import { ImageIcon, CameraIcon } from "./icons";
import { loggers } from "../../../shared/logger";
import { toast } from "../../stores/useToastStore";
import { extractFilesFromPaste } from "../../utils/imageInput";
import { useTranslation } from "react-i18next";
import type { SteamScreenshotItem } from "../../../shared/messages";

const ImageFloatingPanel: React.FC = () => {
  // ============ 所有 Hooks 必须在 early return 之前 ============

  const { t } = useTranslation("editor");

  const {
    isOpen,
    isMinimized,
    position,
    size,
    sortBy,
    sortOrder,
    filterStatus,
    editingImageId,
    sourceTab,
    setPosition,
    setSize,
    setSortBy,
    toggleSortOrder,
    setFilterStatus,
    setEditingImageId,
    setSourceTab,
    open,
    close,
    minimize,
    restore
  } = useImagePanelStore();

  const {
    items: images,
    status: imagePoolStatus,
    refresh: refreshImagePool,
    getImagesByGuide,
    screenshots,
    screenshotsStatus,
    refreshScreenshots
  } = useSteamGuideImageStore();

  const currentArchiveId = useGuideStore((state) => state.currentArchiveId);
  const currentArchive = useArchiveStore((state) => currentArchiveId ? state.archives[currentArchiveId] : undefined);

  const archiveImages = useMemo(() => {
    return getImagesByGuide(currentArchiveId);
  }, [getImagesByGuide, currentArchiveId, images]);

  // 截图转换为 ImageWithState 格式，供 ImageGrid 复用
  const screenshotImages = useMemo((): ImageWithState[] => {
    return screenshots.map((s: SteamScreenshotItem) => ({
      previewId: s.publishedfileid,
      fileName: s.description || s.filename.split("/").pop() || `screenshot_${s.publishedfileid}`,
      thumbnailUrl: s.previewUrl + "?imw=256&&ima=fit&impolicy=Letterbox&imcolor=%23000000&letterbox=false",
      originalUrl: s.imageUrl,
      state: "success" as const
    }));
  }, [screenshots]);

  const panelRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [showTagManager, setShowTagManager] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // 根据 tab 选择数据源,然后搜索、状态筛选、排序
  const sourceImages = sourceTab === "screenshots" ? screenshotImages : archiveImages;

  const filteredImages = useMemo(() => {
    let result = sourceImages;

    if (filterStatus !== "all") {
      result = result.filter((image) => {
        switch (filterStatus) {
          case "pending": return image.state === "pending";
          case "success": return image.state === "success";
          case "error": return image.state === "error";
          default: return true;
        }
      });
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const imageTags = currentArchive?.imageTags || [];
      const imageTagMap = currentArchive?.imageTagMap || {};

      result = result.filter((image) => {
        if (image.fileName.toLowerCase().includes(query)) return true;
        const imageId = image.previewId || image.fileName;
        const tagIds = imageTagMap[imageId] || [];
        if (tagIds.length > 0) {
          const matchedTag = tagIds.some((tagId: string) => {
            const tag = imageTags.find((t) => t.id === tagId);
            return tag && tag.name.toLowerCase().includes(query);
          });
          if (matchedTag) return true;
        }
        return false;
      });
    }

    result = [...result].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "uploadTime": {
          const idA = parseInt(a.previewId || "0", 10);
          const idB = parseInt(b.previewId || "0", 10);
          comparison = idA - idB;
          break;
        }
        case "fileName":
          comparison = a.fileName.toLowerCase().localeCompare(b.fileName.toLowerCase());
          break;
        default:
          comparison = 0;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return result;
  }, [sourceImages, searchQuery, currentArchive, filterStatus, sortBy, sortOrder]);

  const dragStartRef = useRef<{
    x: number; y: number; posX: number; posY: number; width: number; height: number;
  } | null>(null);

  const handleImageDoubleClick = useCallback((image: ImageWithState) => {
    loggers.image.info("双击图片", { fileName: image.fileName, previewId: image.previewId });
    toast.info(`双击图片: ${image.fileName}\n(插入功能待实现)`);
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragStartRef.current = {
      x: e.clientX, y: e.clientY,
      posX: position.x, posY: position.y,
      width: size.width, height: size.height
    };
    setIsDragging(true);
    loggers.image.verbose("开始拖拽悬浮窗");
  }, [position, size]);

  const handleResizeStart = useCallback((e: React.MouseEvent, direction: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragStartRef.current = {
      x: e.clientX, y: e.clientY,
      posX: position.x, posY: position.y,
      width: size.width, height: size.height
    };
    setIsResizing(direction);
    loggers.image.verbose("开始调整尺寸", direction);
  }, [position, size]);

  const handleDragEnd = useCallback(() => { setIsDragging(false); }, []);
  const handleResizeEnd = useCallback(() => { setIsResizing(null); }, []);

  useEffect(() => {
    if (imagePoolStatus === "idle" && currentArchiveId) {
      void refreshImagePool();
    }
  }, [imagePoolStatus, refreshImagePool, currentArchiveId]);

  // 切换到截图 tab 时自动拉取(仅首次)
  useEffect(() => {
    if (sourceTab === "screenshots" && screenshotsStatus === "idle") {
      void refreshScreenshots();
    }
  }, [sourceTab, screenshotsStatus, refreshScreenshots]);

  const handleRefresh = useCallback(() => {
    if (sourceTab === "screenshots") {
      loggers.image.info("手动刷新截图库");
      void refreshScreenshots();
    } else {
      loggers.image.info("手动刷新图片池");
      void refreshImagePool();
    }
  }, [sourceTab, refreshImagePool, refreshScreenshots]);

  // 剪贴板粘贴处理
  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    const files = extractFilesFromPaste(e);
    if (files.length === 0) return;
    e.preventDefault();
    void addFilesToPool(files, { source: "paste", currentArchiveId, openPanelOnAdd: false });
  }, [currentArchiveId]);

  useEffect(() => {
    if (!isOpen || isMinimized) return;

    const handleGlobalPaste = (e: ClipboardEvent) => {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLInputElement ||
          activeElement instanceof HTMLTextAreaElement ||
          (activeElement as HTMLElement)?.isContentEditable) {
        return;
      }
      void handlePaste(e);
    };

    document.addEventListener('paste', handleGlobalPaste);
    return () => { document.removeEventListener('paste', handleGlobalPaste); };
  }, [isOpen, isMinimized, handlePaste]);

  // ============ Early Returns ============

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={open}
        className="fixed left-4 bottom-4 flex items-center gap-2 px-4 py-2.5 bg-[rgba(13,23,36,0.95)] border border-border-accent rounded-md shadow-lg cursor-pointer text-[13px] font-semibold text-text-primary transition-all duration-150 ease-out hover:border-[rgba(102,192,244,0.4)] hover:bg-[rgba(13,23,36,0.98)]"
        style={{ zIndex: Z_INDEX.minimized }}
      >
        <ImageIcon size={16} />
        <span>图片池</span>
        <span className="text-xs text-text-muted font-normal">
          ({filteredImages.length})
        </span>
      </button>
    );
  }

  if (isMinimized) {
    return <MinimizedPanel imageCount={filteredImages.length} isLoading={imagePoolStatus === "loading"} archiveName={currentArchive?.guideName} onRestore={restore} />;
  }

  return (
    <>
      <div
        data-tour="image-panel"
        className="fixed flex flex-col bg-[rgba(13,23,36,0.95)] border border-border-accent rounded-md shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_1px_rgba(102,192,244,0.25)] overflow-hidden select-none"
        style={{
          left: position.x,
          top: position.y,
          width: size.width,
          height: size.height,
          zIndex: isDragging || isResizing ? Z_INDEX.panelActive : Z_INDEX.panel
        }}
      >
        {/* 标题栏 */}
        <PanelHeader
          imageCount={searchQuery ? filteredImages.length : sourceImages.length}
          archiveName={currentArchive?.guideName}
          isRefreshing={sourceTab === "screenshots" ? screenshotsStatus === "loading" : imagePoolStatus === "loading"}
          isFullscreen={isFullscreen}
          onDragStart={handleDragStart}
          onRefresh={handleRefresh}
          onMinimize={minimize}
          onClose={close}
          onOpenTagManager={() => setShowTagManager(true)}
          onToggleFullscreen={() => setIsFullscreen(true)}
        />

        {/* Tab 栏 */}
        <div className="flex border-b border-border-accent">
          {(["pool", "screenshots"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              {...(tab === "screenshots" ? { "data-tour": "screenshot-tab" } : {})}
              onClick={() => setSourceTab(tab)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors duration-100 ${
                sourceTab === tab
                  ? "text-accent border-b-2 border-accent bg-[rgba(102,192,244,0.08)]"
                  : "text-text-muted hover:text-text-primary hover:bg-[rgba(102,192,244,0.04)]"
              }`}
            >
              {tab === "pool" ? <ImageIcon size={13} /> : <CameraIcon size={13} />}
              {t(`imagePanel.tab.${tab}`)}
              <span className="text-[10px] text-text-muted font-normal">
                ({tab === "pool" ? archiveImages.length : screenshots.length})
              </span>
            </button>
          ))}
        </div>

        {/* 搜索栏 */}
        <SearchBar
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          resultCount={filteredImages.length}
          totalCount={sourceImages.length}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortByChange={setSortBy}
          onToggleSortOrder={toggleSortOrder}
          filterStatus={filterStatus}
          onFilterStatusChange={setFilterStatus}
        />

        {/* 内容区 */}
        <div className="flex-1 overflow-auto p-3">
          <ImageGrid
            images={filteredImages}
            onImageDoubleClick={handleImageDoubleClick}
            editingImageId={editingImageId}
            onEditingChange={setEditingImageId}
            isLoading={sourceTab === "screenshots" ? screenshotsStatus === "loading" : imagePoolStatus === "loading"}
          />
        </div>

        {/* 调整大小手柄 */}
        <div
          style={resizeHandleStyle("right")}
          onMouseDown={(e) => handleResizeStart(e, "right")}
        />
        <div
          style={resizeHandleStyle("bottom")}
          onMouseDown={(e) => handleResizeStart(e, "bottom")}
        />
        <div
          className="bg-transparent"
          style={resizeHandleStyle("corner")}
          onMouseDown={(e) => handleResizeStart(e, "corner")}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            className="absolute right-0.5 bottom-0.5 opacity-30 text-text-muted"
          >
            <path
              d="M10 2L2 10M10 6L6 10M10 10L10 10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      {/* 全局拖拽/调整事件监听层 */}
      <DragResizeHandler
        isDragging={isDragging}
        isResizing={isResizing}
        dragStartRef={dragStartRef}
        setPosition={setPosition}
        setSize={setSize}
        onDragEnd={handleDragEnd}
        onResizeEnd={handleResizeEnd}
      />

      {/* 标签管理弹窗 */}
      <TagManager
        visible={showTagManager}
        onClose={() => setShowTagManager(false)}
      />

      {/* 全屏模式 */}
      {isFullscreen && (
        <FullscreenPanel
          images={filteredImages}
          archiveImages={archiveImages}
          archiveName={currentArchive?.guideName}
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortByChange={setSortBy}
          onToggleSortOrder={toggleSortOrder}
          filterStatus={filterStatus}
          onFilterStatusChange={setFilterStatus}
          editingImageId={editingImageId}
          onEditingChange={setEditingImageId}
          onClose={() => setIsFullscreen(false)}
        />
      )}
    </>
  );
};

// ============ 拖拽/调整事件处理组件 ============
interface DragResizeHandlerProps {
  isDragging: boolean;
  isResizing: string | null;
  dragStartRef: React.MutableRefObject<{
    x: number; y: number; posX: number; posY: number; width: number; height: number;
  } | null>;
  setPosition: (pos: PanelPosition) => void;
  setSize: (size: PanelSize) => void;
  onDragEnd: () => void;
  onResizeEnd: () => void;
}

const DragResizeHandler: React.FC<DragResizeHandlerProps> = ({
  isDragging,
  isResizing,
  dragStartRef,
  setPosition,
  setSize,
  onDragEnd,
  onResizeEnd
}) => {
  React.useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      if (isDragging) {
        const newX = Math.max(0, Math.min(window.innerWidth - 100, dragStartRef.current.posX + deltaX));
        const newY = Math.max(0, Math.min(window.innerHeight - 50, dragStartRef.current.posY + deltaY));
        setPosition({ x: newX, y: newY });
      } else if (isResizing) {
        let newWidth = dragStartRef.current.width;
        let newHeight = dragStartRef.current.height;
        if (isResizing === "right" || isResizing === "corner") {
          newWidth = Math.max(SIZES.minWidth, dragStartRef.current.width + deltaX);
        }
        if (isResizing === "bottom" || isResizing === "corner") {
          newHeight = Math.max(SIZES.minHeight, dragStartRef.current.height + deltaY);
        }
        setSize({ width: newWidth, height: newHeight });
      }
    };

    const handleMouseUp = () => {
      if (isDragging) { onDragEnd(); loggers.image.verbose("结束拖拽悬浮窗"); }
      if (isResizing) { onResizeEnd(); loggers.image.verbose("结束调整尺寸"); }
      dragStartRef.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = isDragging ? "grabbing" : (
      isResizing === "right" ? "ew-resize" :
      isResizing === "bottom" ? "ns-resize" :
      "nwse-resize"
    );

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isDragging, isResizing, dragStartRef, setPosition, setSize, onDragEnd, onResizeEnd]);

  return null;
};

export default ImageFloatingPanel;
