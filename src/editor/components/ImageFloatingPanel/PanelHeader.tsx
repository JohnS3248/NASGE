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
  onDragStart: (e: React.MouseEvent) => void;
  onMinimize: () => void;
  onClose: () => void;
}

const PanelHeader: React.FC<PanelHeaderProps> = ({
  imageCount,
  onDragStart,
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
