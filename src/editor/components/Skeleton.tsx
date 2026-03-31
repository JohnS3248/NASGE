/**
 * 骨架屏原语组件 — shimmer 效果
 *
 * 基底色：rgba(102,192,244,0.06)  — Steam accent
 * 高光色：rgba(255,255,255,0.08)  — Vercel 暗色主题
 * 时长 1.6s ease-in-out, GPU 合成 (transform: translateX)
 */

interface SkeletonBaseProps {
  className?: string;
}

interface SkeletonLineProps extends SkeletonBaseProps {
  /** 宽度，百分比字符串或像素数。默认 "100%" */
  width?: string | number;
  /** 高度（像素）。默认 14 */
  height?: number;
}

interface SkeletonBlockProps extends SkeletonBaseProps {
  /** 宽度，百分比字符串或像素数。默认 "100%" */
  width?: string | number;
  /** 高度（像素）。默认 100 */
  height?: number;
}

function Shimmer() {
  return (
    <div
      className="absolute inset-0 animate-shimmer motion-reduce:animate-none motion-reduce:opacity-60"
      style={{
        background:
          "linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.08) 50%, transparent 75%)",
      }}
    />
  );
}

/** 行骨架 — 模拟文本行 */
export function SkeletonLine({
  width = "100%",
  height = 14,
  className = "",
}: SkeletonLineProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-xs bg-[rgba(102,192,244,0.06)] ${className}`}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: `${height}px`,
      }}
    >
      <Shimmer />
    </div>
  );
}

/** 块骨架 — 模拟矩形区域（图片、卡片等） */
export function SkeletonBlock({
  width = "100%",
  height = 100,
  className = "",
}: SkeletonBlockProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-sm bg-[rgba(102,192,244,0.06)] ${className}`}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: `${height}px`,
      }}
    >
      <Shimmer />
    </div>
  );
}
