/**
 * 图片池搜索栏组件
 * 支持搜索、排序、状态筛选
 */
import React, { useCallback, useRef, useEffect, useState } from "react";
import { SearchIcon, XIcon, ChevronDownIcon, ArrowUpIcon, ArrowDownIcon } from "./icons";
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
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border-accent bg-bg-app/50 flex-wrap">
      {/* 搜索区域 */}
      <div className="flex items-center gap-1.5 flex-1 min-w-[120px]">
        {/* 搜索图标 */}
        <span className={`shrink-0 ${isSearching ? "text-accent" : "text-text-muted"}`}>
          <SearchIcon size={12} />
        </span>

        {/* 输入框 */}
        <input
          ref={inputRef}
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="搜索..."
          className="flex-1 border-none bg-transparent text-text-primary text-xs outline-none py-0.5 min-w-[60px]"
        />

        {/* 结果计数 */}
        {isSearching && (
          <span className={`text-[10px] shrink-0 ${resultCount > 0 ? "text-text-muted" : "text-danger"}`}>
            {resultCount}/{totalCount}
          </span>
        )}

        {/* 清空按钮 */}
        {isSearching && (
          <button
            type="button"
            onClick={handleClear}
            className="w-4 h-4 flex items-center justify-center border-none bg-accent-subtle text-text-secondary rounded-full cursor-pointer shrink-0"
            title="清空搜索 (ESC)"
          >
            <XIcon size={10} />
          </button>
        )}
      </div>

      {/* 分隔线 */}
      <div className="w-px h-4 bg-border-accent shrink-0" />

      {/* 排序控件 */}
      <div className="flex items-center gap-1 shrink-0">
        <MiniSelect
          value={sortBy}
          options={SORT_OPTIONS}
          onChange={(v) => onSortByChange(v as SortBy)}
        />
        <button
          type="button"
          onClick={onToggleSortOrder}
          className="w-5 h-5 flex items-center justify-center border-none bg-transparent text-text-secondary cursor-pointer rounded-sm"
          title={sortOrder === "asc" ? "升序" : "降序"}
        >
          {sortOrder === "asc" ? <ArrowUpIcon size={11} /> : <ArrowDownIcon size={11} />}
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
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-0.5 px-1.5 py-0.5 border-none cursor-pointer text-[11px] rounded-sm whitespace-nowrap ${
          highlight
            ? "bg-accent-subtle text-accent"
            : "bg-transparent text-text-secondary"
        }`}
      >
        {currentOption?.label}
        <ChevronDownIcon size={8} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-0.5 bg-[rgba(13,23,36,0.95)] border border-border-accent rounded-sm shadow-lg z-[100] min-w-full">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`block w-full px-2.5 py-1.5 border-none cursor-pointer text-[11px] text-left whitespace-nowrap ${
                option.value === value
                  ? "bg-accent-subtle text-accent"
                  : "bg-transparent text-text-secondary hover:bg-accent-subtle"
              }`}
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
