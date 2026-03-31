/**
 * 悬浮窗标题栏组件
 * 支持拖拽移动和窗口控制按钮
 */
import React from "react";
import { SIZES } from "./styles";
import { ImageIcon, TagIcon, MaximizeIcon, MinimizeIcon, MinusIcon } from "./icons";

interface PanelHeaderProps {
  imageCount: number;
  archiveName?: string;
  isRefreshing?: boolean;
  isFullscreen?: boolean;
  onDragStart: (e: React.MouseEvent) => void;
  onRefresh: () => void;
  onMinimize: () => void;
  onClose: () => void;
  onOpenTagManager?: () => void;
  onToggleFullscreen?: () => void;
}

const btnBase = "w-6 h-6 flex items-center justify-center border-none bg-transparent text-text-secondary rounded-sm cursor-pointer transition-all duration-150 ease-out";
const btnHover = "hover:bg-accent-subtle hover:text-accent";
const btnCloseHover = "hover:bg-danger/30 hover:text-danger";

const PanelHeader: React.FC<PanelHeaderProps> = ({
  imageCount,
  archiveName,
  isRefreshing = false,
  isFullscreen = false,
  onDragStart,
  onRefresh,
  onMinimize,
  onClose,
  onOpenTagManager,
  onToggleFullscreen
}) => {
  return (
    <div
      className="flex items-center justify-between bg-bg-app/90 border-b border-border-accent cursor-move"
      style={{ height: SIZES.headerHeight, padding: `0 ${SIZES.padding}px` }}
      onMouseDown={onDragStart}
    >
      {/* 标题 */}
      <div className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
        <span className={isRefreshing ? "animate-spin" : ""}>
          <ImageIcon size={16} />
        </span>
        <span className={archiveName ? "max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap" : ""}>
          {archiveName || '图片池'}
        </span>
        <span className="text-xs text-text-muted font-normal">
          ({isRefreshing ? "…" : imageCount})
        </span>
      </div>

      {/* 控制按钮 */}
      <div
        className="flex items-center gap-1"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 管理标签按钮 */}
        {onOpenTagManager && (
          <button
            type="button"
            title="管理标签"
            className={`${btnBase} ${btnHover}`}
            onClick={onOpenTagManager}
          >
            <TagIcon size={14} />
          </button>
        )}

        {/* 全屏按钮 */}
        {onToggleFullscreen && (
          <button
            type="button"
            title={isFullscreen ? "退出全屏" : "全屏模式"}
            className={`${btnBase} ${btnHover}`}
            onClick={onToggleFullscreen}
          >
            <MaximizeIcon size={14} />
          </button>
        )}

        {/* 最小化 */}
        <button
          type="button"
          title="最小化"
          className={`${btnBase} ${btnHover}`}
          onClick={onMinimize}
        >
          <MinimizeIcon size={14} />
        </button>

        {/* 关闭 */}
        <button
          type="button"
          title="关闭"
          className={`${btnBase} ${btnCloseHover}`}
          onClick={onClose}
        >
          <MinusIcon size={14} />
        </button>
      </div>
    </div>
  );
};

export default PanelHeader;
