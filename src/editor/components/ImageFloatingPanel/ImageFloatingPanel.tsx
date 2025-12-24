/**
 * 图片悬浮窗主组件
 * 支持拖拽移动、尺寸调整、折叠、最小化
 */
import React, { useCallback, useRef, useState, useEffect } from "react";
import { useImagePanelStore, PanelPosition, PanelSize } from "../../stores/useImagePanelStore";
import { useSteamGuideImageStore, ImageWithState } from "../../stores/useSteamGuideImageStore";
import PanelHeader from "./PanelHeader";
import MinimizedPanel from "./MinimizedPanel";
import ImageGrid from "./ImageGrid";
import {
  panelContainerStyle,
  contentStyle,
  resizeHandleStyle,
  SIZES,
  COLORS,
  Z_INDEX
} from "./styles";
import { loggers } from "../../../shared/logger";

const ImageFloatingPanel: React.FC = () => {
  // ============ 所有 Hooks 必须在 early return 之前 ============

  // Store 状态
  const {
    isOpen,
    isMinimized,
    isCollapsed,
    position,
    size,
    setPosition,
    setSize,
    open,
    close,
    minimize,
    restore,
    collapse,
    expand
  } = useImagePanelStore();

  const { items: images, status: imagePoolStatus, refresh: refreshImagePool } = useSteamGuideImageStore();

  // 拖拽状态
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null);
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

  // ============ 折叠切换 ============
  const handleCollapseToggle = useCallback(() => {
    if (isCollapsed) {
      expand();
    } else {
      collapse();
    }
  }, [isCollapsed, expand, collapse]);

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
          ({images.length})
        </span>
      </button>
    );
  }

  // 如果最小化，显示最小化面板（可拖动的小窗口）
  if (isMinimized) {
    return <MinimizedPanel imageCount={images.length} onRestore={restore} />;
  }

  // 计算当前高度
  const currentHeight = isCollapsed ? SIZES.headerHeight : size.height;

  return (
    <>
      <div
        style={{
          ...panelContainerStyle,
          left: position.x,
          top: position.y,
          width: size.width,
          height: currentHeight,
          zIndex: isDragging || isResizing ? Z_INDEX.panelActive : Z_INDEX.panel
        }}
      >
        {/* 标题栏 */}
        <PanelHeader
          imageCount={images.length}
          isCollapsed={isCollapsed}
          onDragStart={handleDragStart}
          onCollapse={handleCollapseToggle}
          onMinimize={minimize}
          onClose={close}
        />

        {/* 内容区（折叠时隐藏） */}
        {!isCollapsed && (
          <div style={contentStyle}>
            <ImageGrid
              images={images}
              onImageDoubleClick={handleImageDoubleClick}
            />
          </div>
        )}

        {/* 调整大小手柄（折叠时隐藏） */}
        {!isCollapsed && (
          <>
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
          </>
        )}
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
