/**
 * 标签徽章组件
 * 显示单个标签（名称 + 颜色）
 */
import React from "react";
import { XIcon } from "./icons";

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
      className={`inline-flex items-center whitespace-nowrap overflow-hidden transition-all duration-150 ease-out ${
        isSmall
          ? "gap-0.5 px-1 py-px rounded-xs text-[10px] max-w-[60px]"
          : "gap-1 px-2 py-0.5 rounded-sm text-xs max-w-[120px]"
      } ${onClick ? "cursor-pointer" : "cursor-default"} font-medium`}
      style={{
        color: selected ? "#fff" : "var(--color-text-primary)",
        background: selected ? color : `${color}33`,
        border: `1px solid ${selected ? color : `${color}66`}`
      }}
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
        className={`rounded-full shrink-0 ${isSmall ? "w-1.5 h-1.5" : "w-2 h-2"}`}
        style={{ background: color }}
      />

      {/* 标签名 */}
      <span className="overflow-hidden text-ellipsis">
        {name}
      </span>

      {/* 删除按钮 */}
      {showDelete && onDelete && (
        <button
          type="button"
          onClick={handleDelete}
          className={`flex items-center justify-center p-0 border-none bg-transparent text-text-muted rounded-full shrink-0 cursor-pointer hover:bg-danger/30 hover:text-danger ${
            isSmall ? "w-3 h-3" : "w-4 h-4 ml-0.5"
          }`}
        >
          <XIcon size={isSmall ? 8 : 10} />
        </button>
      )}
    </span>
  );
};

export default TagBadge;
