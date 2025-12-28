/**
 * 标签徽章组件
 * 显示单个标签（名称 + 颜色）
 */
import React from "react";
import { COLORS } from "./styles";

interface TagBadgeProps {
  name: string;
  color: string;
  /** 是否显示删除按钮 */
  showDelete?: boolean;
  /** 删除回调 */
  onDelete?: () => void;
  /** 点击回调 */
  onClick?: () => void;
  /** 是否选中状态 */
  selected?: boolean;
  /** 尺寸：small 用于图片卡片，normal 用于筛选器 */
  size?: "small" | "normal";
}

const TagBadge: React.FC<TagBadgeProps> = ({
  name,
  color,
  showDelete = false,
  onDelete,
  onClick,
  selected = false,
  size = "normal"
}) => {
  const isSmall = size === "small";

  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: isSmall ? 2 : 4,
    padding: isSmall ? "1px 4px" : "2px 8px",
    borderRadius: isSmall ? 2 : 4,
    fontSize: isSmall ? 10 : 12,
    fontWeight: 500,
    color: selected ? "#fff" : COLORS.textPrimary,
    background: selected ? color : `${color}33`, // 33 = 20% opacity
    border: `1px solid ${selected ? color : `${color}66`}`,
    cursor: onClick ? "pointer" : "default",
    transition: "all 0.15s ease",
    whiteSpace: "nowrap",
    maxWidth: isSmall ? 60 : 120,
    overflow: "hidden"
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.();
  };

  return (
    <span
      style={baseStyle}
      onClick={onClick ? handleClick : undefined}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.background = selected ? color : `${color}55`;
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.background = selected ? color : `${color}33`;
        }
      }}
    >
      {/* 颜色点 */}
      <span
        style={{
          width: isSmall ? 6 : 8,
          height: isSmall ? 6 : 8,
          borderRadius: "50%",
          background: color,
          flexShrink: 0
        }}
      />

      {/* 标签名 */}
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis"
        }}
      >
        {name}
      </span>

      {/* 删除按钮 */}
      {showDelete && onDelete && (
        <button
          type="button"
          onClick={handleDelete}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: isSmall ? 12 : 16,
            height: isSmall ? 12 : 16,
            padding: 0,
            border: "none",
            background: "transparent",
            color: COLORS.textMuted,
            cursor: "pointer",
            borderRadius: "50%",
            fontSize: isSmall ? 10 : 12,
            marginLeft: isSmall ? 0 : 2,
            flexShrink: 0
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(199, 69, 69, 0.3)";
            e.currentTarget.style.color = COLORS.error;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = COLORS.textMuted;
          }}
        >
          ×
        </button>
      )}
    </span>
  );
};

export default TagBadge;
