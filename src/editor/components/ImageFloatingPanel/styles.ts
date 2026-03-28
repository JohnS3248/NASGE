/**
 * 图片悬浮窗样式常量
 * 仅保留需要在 JS 中动态计算的数值常量
 */
import { CSSProperties } from "react";

// ============ 尺寸 ============
export const SIZES = {
  // 窗口
  minWidth: 200,
  minHeight: 150,
  defaultWidth: 400,
  defaultHeight: 450,

  // 标题栏
  headerHeight: 36,

  // 工具栏
  toolbarHeight: 40,

  // 分页栏
  paginationHeight: 36,

  // 间距
  padding: 12,
  gap: 8,

  // 圆角
  borderRadius: 8,
  borderRadiusSmall: 4,

  // 拖拽调整手柄
  resizeHandleSize: 8
};

// ============ 层级 ============
export const Z_INDEX = {
  panel: 1000,
  panelActive: 1001,
  resizeHandle: 1002,
  minimized: 999,
  fullscreenPreview: 2000
};

// ============ 调整手柄样式（依赖 SIZES 动态计算） ============
export const resizeHandleStyle = (position: string): CSSProperties => {
  const base: CSSProperties = {
    position: "absolute",
    zIndex: Z_INDEX.resizeHandle
  };

  switch (position) {
    case "right":
      return {
        ...base,
        top: SIZES.headerHeight,
        right: 0,
        width: SIZES.resizeHandleSize,
        height: `calc(100% - ${SIZES.headerHeight}px)`,
        cursor: "ew-resize"
      };
    case "bottom":
      return {
        ...base,
        bottom: 0,
        left: 0,
        width: "100%",
        height: SIZES.resizeHandleSize,
        cursor: "ns-resize"
      };
    case "corner":
      return {
        ...base,
        bottom: 0,
        right: 0,
        width: SIZES.resizeHandleSize * 2,
        height: SIZES.resizeHandleSize * 2,
        cursor: "nwse-resize"
      };
    default:
      return base;
  }
};
