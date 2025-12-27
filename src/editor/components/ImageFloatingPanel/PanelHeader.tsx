/**
 * 悬浮窗标题栏组件
 * 支持拖拽移动和窗口控制按钮
 */
import React, { useCallback, useState } from "react";
import {
  headerStyle,
  headerTitleStyle,
  headerButtonsStyle,
  headerButtonStyle,
  COLORS
} from "./styles";

interface PanelHeaderProps {
  imageCount: number;
  isRefreshing?: boolean;
  onDragStart: (e: React.MouseEvent) => void;
  onRefresh: () => void;
  onMinimize: () => void;
  onClose: () => void;
}

const PanelHeader: React.FC<PanelHeaderProps> = ({
  imageCount,
  isRefreshing = false,
  onDragStart,
  onRefresh,
  onMinimize,
  onClose
}) => {
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);

  const getButtonStyle = useCallback(
    (buttonId: string, isClose = false): React.CSSProperties => ({
      ...headerButtonStyle,
      background: hoveredButton === buttonId
        ? (isClose ? "rgba(199, 69, 69, 0.3)" : COLORS.accentDark)
        : "transparent",
      color: hoveredButton === buttonId
        ? (isClose ? COLORS.error : COLORS.accent)
        : COLORS.textSecondary
    }),
    [hoveredButton]
  );

  return (
    <div
      style={headerStyle}
      onMouseDown={onDragStart}
    >
      {/* 标题 */}
      <div style={headerTitleStyle}>
        <span style={{ fontSize: 16 }}>📷</span>
        <span>图片池</span>
        <span style={{
          fontSize: 12,
          color: COLORS.textMuted,
          fontWeight: 400
        }}>
          ({imageCount})
        </span>
      </div>

      {/* 控制按钮 */}
      <div
        style={headerButtonsStyle}
        onMouseDown={(e) => e.stopPropagation()} // 防止触发拖拽
      >
        {/*
         * 刷新按钮 - 已禁用保留
         * 图片池刷新功能目前存在很大问题，已禁用保留
         * 问题：刷新后可能导致状态不一致，待后续修复
         */}
        {false && (
          <button
            type="button"
            title="刷新图片池"
            style={{
              ...getButtonStyle("refresh"),
              opacity: isRefreshing ? 0.5 : 1,
              cursor: isRefreshing ? "wait" : "pointer"
            }}
            onMouseEnter={() => setHoveredButton("refresh")}
            onMouseLeave={() => setHoveredButton(null)}
            onClick={() => {
              if (!isRefreshing) {
                onRefresh();
              }
            }}
          >
            ↻
          </button>
        )}

        {/* 最小化（收到左下角小面板） */}
        <button
          type="button"
          title="最小化"
          style={getButtonStyle("minimize")}
          onMouseEnter={() => setHoveredButton("minimize")}
          onMouseLeave={() => setHoveredButton(null)}
          onClick={onMinimize}
        >
          ▼
        </button>

        {/* 关闭（收到左下角按钮） */}
        <button
          type="button"
          title="关闭"
          style={getButtonStyle("close", true)}
          onMouseEnter={() => setHoveredButton("close")}
          onMouseLeave={() => setHoveredButton(null)}
          onClick={onClose}
        >
          ─
        </button>
      </div>
    </div>
  );
};

export default PanelHeader;
