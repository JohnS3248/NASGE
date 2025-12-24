/**
 * 图片悬浮窗样式常量
 */
import { CSSProperties } from "react";

// ============ 颜色 ============
export const COLORS = {
  // 背景
  panelBg: "rgba(13, 23, 36, 0.95)",
  panelBgHover: "rgba(13, 23, 36, 0.98)",
  headerBg: "rgba(8, 16, 28, 0.9)",

  // 边框
  border: "rgba(102, 192, 244, 0.25)",
  borderHover: "rgba(102, 192, 244, 0.4)",
  borderActive: "rgba(102, 192, 244, 0.6)",

  // 文字
  textPrimary: "#d7e8ff",
  textSecondary: "#8aa4c7",
  textMuted: "#5a7a9a",

  // 强调色
  accent: "#66c0f4",
  accentHover: "#7dcfff",
  accentDark: "rgba(102, 192, 244, 0.15)",

  // 状态色
  success: "#5ba32b",
  warning: "#d4a72c",
  error: "#c74545",
  pending: "#6a7a8a",

  // 阴影
  shadow: "rgba(0, 0, 0, 0.4)",
  shadowStrong: "rgba(0, 0, 0, 0.6)"
};

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

// ============ 基础样式 ============

/** 悬浮窗容器样式 */
export const panelContainerStyle: CSSProperties = {
  position: "fixed",
  display: "flex",
  flexDirection: "column",
  background: COLORS.panelBg,
  border: `1px solid ${COLORS.border}`,
  borderRadius: SIZES.borderRadius,
  boxShadow: `0 8px 32px ${COLORS.shadow}, 0 0 1px ${COLORS.border}`,
  overflow: "hidden",
  zIndex: Z_INDEX.panel,
  userSelect: "none"
};

/** 标题栏样式 */
export const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  height: SIZES.headerHeight,
  padding: `0 ${SIZES.padding}px`,
  background: COLORS.headerBg,
  borderBottom: `1px solid ${COLORS.border}`,
  cursor: "move"
};

/** 标题文字样式 */
export const headerTitleStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  fontWeight: 600,
  color: COLORS.textPrimary
};

/** 控制按钮组样式 */
export const headerButtonsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4
};

/** 控制按钮样式 */
export const headerButtonStyle: CSSProperties = {
  width: 24,
  height: 24,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  background: "transparent",
  color: COLORS.textSecondary,
  borderRadius: SIZES.borderRadiusSmall,
  cursor: "pointer",
  fontSize: 14,
  transition: "all 0.15s ease"
};

/** 内容区样式 */
export const contentStyle: CSSProperties = {
  flex: 1,
  overflow: "auto",
  padding: SIZES.padding
};

/** 最小化状态样式 */
export const minimizedStyle: CSSProperties = {
  position: "fixed",
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
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
};

/** 调整大小手柄样式 */
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
