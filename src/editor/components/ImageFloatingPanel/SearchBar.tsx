/**
 * 图片池搜索栏组件
 * 支持搜索、排序、状态筛选
 */
import React, { useCallback, useRef, useEffect, useState } from "react";
import { COLORS, SIZES } from "./styles";
import { SortBy, SortOrder, FilterStatus } from "../../stores/useImagePanelStore";

interface SearchBarProps {
  // 搜索
  searchValue: string;
  onSearchChange: (value: string) => void;
  resultCount: number;
  totalCount: number;
  // 排序
  sortBy: SortBy;
  sortOrder: SortOrder;
  onSortByChange: (sortBy: SortBy) => void;
  onToggleSortOrder: () => void;
  // 筛选
  filterStatus: FilterStatus;
  onFilterStatusChange: (status: FilterStatus) => void;
}

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "uploadTime", label: "时间" },
  { value: "fileName", label: "名称" }
];

const FILTER_OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待上传" },
  { value: "success", label: "已上传" },
  { value: "error", label: "失败" }
];

const SearchBar: React.FC<SearchBarProps> = ({
  searchValue,
  onSearchChange,
  resultCount,
  totalCount,
  sortBy,
  sortOrder,
  onSortByChange,
  onToggleSortOrder,
  filterStatus,
  onFilterStatusChange
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // 清空搜索
  const handleClear = useCallback(() => {
    onSearchChange("");
    inputRef.current?.focus();
  }, [onSearchChange]);

  // ESC 键清空
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && searchValue) {
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
  }, [searchValue, handleClear]);

  const isSearching = searchValue.length > 0;
  const isFiltering = filterStatus !== "all";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: `6px ${SIZES.padding}px`,
        borderBottom: `1px solid ${COLORS.border}`,
        background: "rgba(8, 16, 28, 0.5)",
        flexWrap: "wrap"
      }}
    >
      {/* 搜索区域 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flex: 1,
          minWidth: 120
        }}
      >
        {/* 搜索图标 */}
        <span
          style={{
            fontSize: 12,
            color: isSearching ? COLORS.accent : COLORS.textMuted,
            flexShrink: 0
          }}
        >
          🔍
        </span>

        {/* 输入框 */}
        <input
          ref={inputRef}
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="搜索..."
          style={{
            flex: 1,
            border: "none",
            background: "transparent",
            color: COLORS.textPrimary,
            fontSize: 12,
            outline: "none",
            padding: "2px 0",
            minWidth: 60
          }}
        />

        {/* 结果计数 */}
        {isSearching && (
          <span
            style={{
              fontSize: 10,
              color: resultCount > 0 ? COLORS.textMuted : COLORS.error,
              flexShrink: 0
            }}
          >
            {resultCount}/{totalCount}
          </span>
        )}

        {/* 清空按钮 */}
        {isSearching && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              width: 16,
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "var(--border-subtle, rgba(102, 192, 244, 0.15))",
              color: COLORS.textSecondary,
              borderRadius: "50%",
              cursor: "pointer",
              fontSize: 10,
              flexShrink: 0
            }}
            title="清空搜索 (ESC)"
          >
            ×
          </button>
        )}
      </div>

      {/* 分隔线 */}
      <div
        style={{
          width: 1,
          height: 16,
          background: COLORS.border,
          flexShrink: 0
        }}
      />

      {/* 排序控件 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          flexShrink: 0
        }}
      >
        <MiniSelect
          value={sortBy}
          options={SORT_OPTIONS}
          onChange={(v) => onSortByChange(v as SortBy)}
        />
        <button
          type="button"
          onClick={onToggleSortOrder}
          style={{
            width: 20,
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: "transparent",
            color: COLORS.textSecondary,
            cursor: "pointer",
            fontSize: 11,
            borderRadius: SIZES.borderRadiusSmall
          }}
          title={sortOrder === "asc" ? "升序" : "降序"}
        >
          {sortOrder === "asc" ? "↑" : "↓"}
        </button>
      </div>

      {/* 状态筛选 */}
      <MiniSelect
        value={filterStatus}
        options={FILTER_OPTIONS}
        onChange={(v) => onFilterStatusChange(v as FilterStatus)}
        highlight={isFiltering}
      />
    </div>
  );
};

// 迷你下拉选择器
interface MiniSelectProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  highlight?: boolean;
}

function MiniSelect<T extends string>({
  value,
  options,
  onChange,
  highlight = false
}: MiniSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentOption = options.find((o) => o.value === value);

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        flexShrink: 0
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: "2px 6px",
          border: "none",
          background: highlight ? "var(--border-subtle, rgba(102, 192, 244, 0.15))" : "transparent",
          color: highlight ? COLORS.accent : COLORS.textSecondary,
          cursor: "pointer",
          fontSize: 11,
          borderRadius: SIZES.borderRadiusSmall,
          whiteSpace: "nowrap"
        }}
      >
        {currentOption?.label}
        <span style={{ fontSize: 8 }}>▼</span>
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 2,
            background: COLORS.panelBg,
            border: `1px solid ${COLORS.border}`,
            borderRadius: SIZES.borderRadiusSmall,
            boxShadow: `0 4px 12px ${COLORS.shadow}`,
            zIndex: 100,
            minWidth: "100%"
          }}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                padding: "6px 10px",
                border: "none",
                background: option.value === value ? COLORS.accentDark : "transparent",
                color: option.value === value ? COLORS.accent : COLORS.textSecondary,
                cursor: "pointer",
                fontSize: 11,
                textAlign: "left",
                whiteSpace: "nowrap"
              }}
              onMouseEnter={(e) => {
                if (option.value !== value) {
                  e.currentTarget.style.background = "rgba(102, 192, 244, 0.08)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  option.value === value ? COLORS.accentDark : "transparent";
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default SearchBar;
