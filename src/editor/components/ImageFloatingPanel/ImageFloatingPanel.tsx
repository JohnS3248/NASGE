/**
 * 图片悬浮窗主组件
 * 支持拖拽移动、尺寸调整、折叠、最小化
 */
import React, { useCallback, useRef, useState, useEffect, useMemo } from "react";
import { useImagePanelStore, PanelPosition, PanelSize } from "../../stores/useImagePanelStore";
import { useSteamGuideImageStore, ImageWithState } from "../../stores/useSteamGuideImageStore";
import { useEditorConfigStore } from "../../stores/useEditorConfigStore";
import { useGuideStore } from "../../stores/useGuideStore";
import { queueImageUpload } from "../../services/uploadQueue";
import PanelHeader from "./PanelHeader";
import MinimizedPanel from "./MinimizedPanel";
import ImageGrid from "./ImageGrid";
import TagManager from "./TagManager";
import {
  panelContainerStyle,
  contentStyle,
  resizeHandleStyle,
  SIZES,
  COLORS,
  Z_INDEX
} from "./styles";
import { loggers } from "../../../shared/logger";

/**
 * 根据 MIME 类型获取默认文件名
 * 剪贴板图片通常没有文件名，使用 image.ext 作为默认值
 */
function getDefaultFileName(mimeType: string): string {
  const ext = mimeType === 'image/png' ? 'png' :
              mimeType === 'image/jpeg' ? 'jpg' :
              mimeType === 'image/gif' ? 'gif' :
              mimeType === 'image/webp' ? 'webp' : 'png';
  return `image.${ext}`;
}

const ImageFloatingPanel: React.FC = () => {
  // ============ 所有 Hooks 必须在 early return 之前 ============

  // Store 状态
  const {
    isOpen,
    isMinimized,
    position,
    size,
    setPosition,
    setSize,
    open,
    close,
    minimize,
    restore
  } = useImagePanelStore();

  const { items: images, status: imagePoolStatus, refresh: refreshImagePool, addLocalImage, getImagesByGuide } = useSteamGuideImageStore();

  // 获取当前存档信息
  const currentArchiveId = useGuideStore((state) => state.currentArchiveId);
  const currentArchive = useGuideStore((state) => state.getCurrentArchive());

  // 过滤当前存档的图片
  const filteredImages = useMemo(() => {
    return getImagesByGuide(currentArchiveId);
  }, [getImagesByGuide, currentArchiveId, images]);

  // 悬浮窗设置
  const autoUploadInPanel = useEditorConfigStore((state) => state.autoUploadInPanel);
  const promptRenameOnPaste = useEditorConfigStore((state) => state.promptRenameOnPaste);

  // 面板引用（用于焦点管理）
  const panelRef = useRef<HTMLDivElement>(null);

  // 拖拽状态
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null);

  // 内联编辑状态：正在编辑文件名的图片 ID
  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  // 标签管理弹窗状态
  const [showTagManager, setShowTagManager] = useState(false);
  const dragStartRef = useRef<{
    x: number;
    y: number;
    posX: number;
    posY: number;
    width: number;
    height: number;
  } | null>(null);

  // ============ 图片双击（插入到编辑器） ============
  const handleImageDoubleClick = useCallback((image: ImageWithState) => {
    loggers.image.info("双击图片", { fileName: image.fileName, previewId: image.previewId });
    // TODO: Phase 2 实现插入到编辑器
    window.alert(`双击图片: ${image.fileName}\n(插入功能将在 Phase 2 实现)`);
  }, []);

  // ============ 拖拽移动 ============
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // 只处理左键
    e.preventDefault();

    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
      width: size.width,
      height: size.height
    };
    setIsDragging(true);
    loggers.image.verbose("开始拖拽悬浮窗");
  }, [position, size]);

  // ============ 尺寸调整 ============
  const handleResizeStart = useCallback((e: React.MouseEvent, direction: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
      width: size.width,
      height: size.height
    };
    setIsResizing(direction);
    loggers.image.verbose("开始调整尺寸", direction);
  }, [position, size]);

  // ============ 拖拽结束 ============
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(null);
  }, []);

  // ============ 图片池初始化加载 ============
  useEffect(() => {
    if (imagePoolStatus === "idle") {
      void refreshImagePool();
    }
  }, [imagePoolStatus, refreshImagePool]);

  // 手动刷新处理（添加日志便于调试）
  const handleRefresh = useCallback(() => {
    loggers.image.info('手动刷新图片池');
    void refreshImagePool();
  }, [refreshImagePool]);

  // ============ 剪贴板粘贴处理 ============
  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    // 查找图片类型的项目
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault();

        const blob = item.getAsFile();
        if (!blob) continue;

        // 使用原始文件名或默认文件名（image.png）
        // 去重逻辑会自动处理同名文件（变成 image_2.png 等）
        const fileName = blob.name || getDefaultFileName(blob.type);
        const file = new File([blob], fileName, { type: blob.type });

        loggers.image.info('剪贴板粘贴图片', {
          fileName,
          size: file.size,
          type: file.type
        });

        // 添加到图片池（复用现有去重逻辑）
        const result = await addLocalImage(file, currentArchiveId ?? undefined);

        if (result.skipped) {
          // 重复图片提示
          const reason = result.reason === 'duplicate_uploaded' ? '已上传' : '待上传';
          window.alert(`此截图已存在于图片池中（${reason}）\n已有文件: ${result.existingFileName}`);
        } else {
          // 如果启用粘贴重命名，设置为编辑模式让用户可以重命名
          if (promptRenameOnPaste) {
            const imageId = result.image.previewId || result.image.fileName;
            setEditingImageId(imageId);
          }

          // 如果启用自动上传则加入队列
          if (autoUploadInPanel) {
            loggers.image.info('粘贴图片自动加入上传队列', { fileName: result.image.fileName });
            queueImageUpload(result.image);
          }
        }

        // 只处理第一个图片
        break;
      }
    }
  }, [addLocalImage, autoUploadInPanel, promptRenameOnPaste, currentArchiveId]);

  // 监听全局粘贴事件（当悬浮窗打开时）
  useEffect(() => {
    if (!isOpen || isMinimized) return;

    const handleGlobalPaste = (e: ClipboardEvent) => {
      // 检查焦点是否在输入框中，如果是则不处理
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLInputElement ||
          activeElement instanceof HTMLTextAreaElement ||
          (activeElement as HTMLElement)?.isContentEditable) {
        return;
      }

      // 处理粘贴
      void handlePaste(e);
    };

    document.addEventListener('paste', handleGlobalPaste);
    return () => {
      document.removeEventListener('paste', handleGlobalPaste);
    };
  }, [isOpen, isMinimized, handlePaste]);

  // ============ Early Returns（在所有 hooks 之后） ============

  // 如果未打开，显示触发按钮（固定在左下角）
  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={open}
        style={{
          position: "fixed",
          left: 16,
          bottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          background: COLORS.panelBg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: SIZES.borderRadius,
          boxShadow: `0 4px 16px ${COLORS.shadow}`,
          cursor: "pointer",
          zIndex: Z_INDEX.minimized,
          fontSize: 13,
          fontWeight: 600,
          color: COLORS.textPrimary,
          transition: "all 0.15s ease"
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = COLORS.borderHover;
          e.currentTarget.style.background = COLORS.panelBgHover;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = COLORS.border;
          e.currentTarget.style.background = COLORS.panelBg;
        }}
      >
        <span style={{ fontSize: 16 }}>📷</span>
        <span>图片池</span>
        <span style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 400 }}>
          ({filteredImages.length})
        </span>
      </button>
    );
  }

  // 如果最小化，显示最小化面板（可拖动的小窗口）
  if (isMinimized) {
    return <MinimizedPanel imageCount={filteredImages.length} archiveName={currentArchive?.guideName} onRestore={restore} />;
  }

  return (
    <>
      <div
        style={{
          ...panelContainerStyle,
          left: position.x,
          top: position.y,
          width: size.width,
          height: size.height,
          zIndex: isDragging || isResizing ? Z_INDEX.panelActive : Z_INDEX.panel
        }}
      >
        {/* 标题栏 */}
        <PanelHeader
          imageCount={filteredImages.length}
          archiveName={currentArchive?.guideName}
          isRefreshing={imagePoolStatus === "loading"}
          onDragStart={handleDragStart}
          onRefresh={handleRefresh}
          onMinimize={minimize}
          onClose={close}
          onOpenTagManager={() => setShowTagManager(true)}
        />

        {/* 内容区 */}
        <div style={contentStyle}>
          <ImageGrid
            images={filteredImages}
            onImageDoubleClick={handleImageDoubleClick}
            editingImageId={editingImageId}
            onEditingChange={setEditingImageId}
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
          style={{
            ...resizeHandleStyle("corner"),
            background: "transparent"
          }}
          onMouseDown={(e) => handleResizeStart(e, "corner")}
        >
          {/* 角落调整图标 */}
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            style={{
              position: "absolute",
              right: 2,
              bottom: 2,
              opacity: 0.3
            }}
          >
            <path
              d="M10 2L2 10M10 6L6 10M10 10L10 10"
              stroke={COLORS.textMuted}
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
    </>
  );
};

// ============ 拖拽/调整事件处理组件 ============
interface DragResizeHandlerProps {
  isDragging: boolean;
  isResizing: string | null;
  dragStartRef: React.MutableRefObject<{
    x: number;
    y: number;
    posX: number;
    posY: number;
    width: number;
    height: number;
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
  // 使用 useEffect 监听全局鼠标事件
  React.useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;

      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      if (isDragging) {
        // 拖拽移动
        const newX = Math.max(0, Math.min(
          window.innerWidth - 100,
          dragStartRef.current.posX + deltaX
        ));
        const newY = Math.max(0, Math.min(
          window.innerHeight - 50,
          dragStartRef.current.posY + deltaY
        ));
        setPosition({ x: newX, y: newY });
      } else if (isResizing) {
        // 调整尺寸
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
      if (isDragging) {
        onDragEnd();
        loggers.image.verbose("结束拖拽悬浮窗");
      }
      if (isResizing) {
        onResizeEnd();
        loggers.image.verbose("结束调整尺寸");
      }
      dragStartRef.current = null;
    };

    // 添加全局事件监听
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    // 拖拽时禁止选择文本
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
