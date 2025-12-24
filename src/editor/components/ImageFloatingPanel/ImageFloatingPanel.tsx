/**
 * 图片悬浮窗主组件
 * 支持拖拽移动、尺寸调整、折叠、最小化
 */
import React, { useCallback, useRef, useEffect, useState } from "react";
import { useImagePanelStore, PanelPosition, PanelSize } from "../../stores/useImagePanelStore";
import { useSteamGuideImageStore } from "../../stores/useSteamGuideImageStore";
import PanelHeader from "./PanelHeader";
import MinimizedPanel from "./MinimizedPanel";
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
  // Store 状态
  const {
    isOpen,
    isMinimized,
    isCollapsed,
    position,
    size,
    setPosition,
    setSize,
    close,
    minimize,
    restore,
    collapse,
    expand
  } = useImagePanelStore();

  const { items: images } = useSteamGuideImageStore();

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

  // 如果未打开，不渲染
  if (!isOpen) {
    return null;
  }

  // 如果最小化，显示最小化面板
  if (isMinimized) {
    return <MinimizedPanel imageCount={images.length} onRestore={restore} />;
  }

  // ============ 拖拽移动 ============
  const handleDragStart = (e: React.MouseEvent) => {
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
  };

  // ============ 尺寸调整 ============
  const handleResizeStart = (e: React.MouseEvent, direction: string) => {
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
  };

  // ============ 折叠切换 ============
  const handleCollapseToggle = () => {
    if (isCollapsed) {
      expand();
    } else {
      collapse();
    }
  };

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
            {/* TODO: 工具栏 */}
            {/* TODO: 图片网格 */}
            {/* TODO: 分页 */}
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: COLORS.textMuted,
              fontSize: 14
            }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.5 }}>📷</div>
              <div>图片网格区域</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                共 {images.length} 张图片
              </div>
            </div>
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
                // 角落手柄添加视觉指示
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
        position={position}
        size={size}
        setPosition={setPosition}
        setSize={setSize}
        onDragEnd={() => setIsDragging(false)}
        onResizeEnd={() => setIsResizing(null)}
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
  position: PanelPosition;
  size: PanelSize;
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
  useEffect(() => {
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
