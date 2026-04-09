/**
 * Lucide SVG 图标组件
 * 替代原有 emoji 图标，提供一致的视觉风格
 */
import React from "react";

interface IconProps {
  size?: number;
  className?: string;
}

const icon = (path: string, displayName: string) => {
  const Icon: React.FC<IconProps> = ({ size = 16, className }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={path} />
    </svg>
  );
  Icon.displayName = displayName;
  return Icon;
};

// 多 path 图标
const multiPathIcon = (paths: string[], displayName: string) => {
  const Icon: React.FC<IconProps> = ({ size = 16, className }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
  Icon.displayName = displayName;
  return Icon;
};

// 包含 rect/circle 等混合元素的图标
const ImageIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
);
ImageIcon.displayName = "ImageIcon";

export { ImageIcon };
export const SearchIcon = icon("M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "SearchIcon");
export const TagIcon = multiPathIcon([
  "M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z",
  "M7.5 7.5h.01"
], "TagIcon");
export const TrashIcon = multiPathIcon([
  "M3 6h18",
  "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",
  "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
], "TrashIcon");
export const PencilIcon = multiPathIcon([
  "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
  "m15 5 4 4"
], "PencilIcon");
export const XIcon = multiPathIcon([
  "M18 6 6 18",
  "m6 6 12 12"
], "XIcon");
export const ChevronDownIcon = icon("m6 9 6 6 6-6", "ChevronDownIcon");
export const ChevronLeftIcon = icon("m15 18-6-6 6-6", "ChevronLeftIcon");
export const ChevronRightIcon = icon("m9 18 6-6-6-6", "ChevronRightIcon");
export const MaximizeIcon = multiPathIcon([
  "M8 3H5a2 2 0 0 0-2 2v3",
  "M21 8V5a2 2 0 0 0-2-2h-3",
  "M3 16v3a2 2 0 0 0 2 2h3",
  "M16 21h3a2 2 0 0 0 2-2v-3"
], "MaximizeIcon");
export const MinimizeIcon = icon("m6 9 6 6 6-6", "MinimizeIcon");
export const MinusIcon = icon("M5 12h14", "MinusIcon");
export const ArrowUpIcon = multiPathIcon([
  "m5 12 7-7 7 7",
  "M12 19V5"
], "ArrowUpIcon");
export const ArrowDownIcon = multiPathIcon([
  "m19 12-7 7-7-7",
  "M12 5v14"
], "ArrowDownIcon");
export const CheckIcon = icon("M20 6 9 17l-5-5", "CheckIcon");
export const PlusIcon = multiPathIcon([
  "M5 12h14",
  "M12 5v14"
], "PlusIcon");

// Lucide Camera icon — 用于截图 tab
const CameraIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);
CameraIcon.displayName = "CameraIcon";
export { CameraIcon };
