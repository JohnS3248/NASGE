/**
 * 图片池搜索栏组件
 * 支持按文件名和标签搜索
 */
import React, { useCallback, useRef, useEffect } from "react";
import { COLORS, SIZES } from "./styles";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  resultCount: number;
  totalCount: number;
  placeholder?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  resultCount,
  totalCount,
  placeholder = "搜索图片或标签..."
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // 清空搜索
  const handleClear = useCallback(() => {
    onChange("");
    inputRef.current?.focus();
  }, [onChange]);

  // ESC 键清空
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && value) {
        e.preventDefault();
        e.stopPropagation();
        handleClear();
      }
    };

    const input = inputRef.current;
    if (input) {
      input.addEventListener("keydown", handleKeyDown);
      return () => input.removeEventListener("keydown", handleKeyDown);
    }
  }, [value, handleClear]);

  const isFiltering = value.length > 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: `8px ${SIZES.padding}px`,
        borderBottom: `1px solid ${COLORS.border}`,
        background: "rgba(8, 16, 28, 0.5)"
      }}
    >
      {/* 搜索图标 */}
      <span
        style={{
          fontSize: 14,
          color: isFiltering ? COLORS.accent : COLORS.textMuted,
          flexShrink: 0
        }}
      >
        🔍
      </span>

      {/* 输入框 */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1,
          border: "none",
          background: "transparent",
          color: COLORS.textPrimary,
          fontSize: 13,
          outline: "none",
          padding: "4px 0",
          minWidth: 0
        }}
      />

      {/* 结果计数 */}
      {isFiltering && (
        <span
          style={{
            fontSize: 11,
            color: resultCount > 0 ? COLORS.textMuted : COLORS.error,
            flexShrink: 0
          }}
        >
          {resultCount}/{totalCount}
        </span>
      )}

      {/* 清空按钮 */}
      {isFiltering && (
        <button
          type="button"
          onClick={handleClear}
          style={{
            width: 18,
            height: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: "rgba(102, 192, 244, 0.15)",
            color: COLORS.textSecondary,
            borderRadius: "50%",
            cursor: "pointer",
            fontSize: 12,
            flexShrink: 0,
            transition: "all 0.15s ease"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(102, 192, 244, 0.3)";
            e.currentTarget.style.color = COLORS.accent;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(102, 192, 244, 0.15)";
            e.currentTarget.style.color = COLORS.textSecondary;
          }}
          title="清空搜索 (ESC)"
        >
          ×
        </button>
      )}
    </div>
  );
};

export default SearchBar;
