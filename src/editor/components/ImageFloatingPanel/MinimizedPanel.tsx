/**
 * 最小化状态的悬浮窗
 * 显示为小型浮动窗口，点击可恢复
 */
import React, { useState, useCallback, useRef, useEffect } from "react";
import { Z_INDEX } from "./styles";
import { ImageIcon } from "./icons";
import { useImagePanelStore, PanelPosition } from "../../stores/useImagePanelStore";

interface MinimizedPanelProps {
  imageCount: number;
  isLoading?: boolean;
  archiveName?: string;
  onRestore: () => void;
}

const MinimizedPanel: React.FC<MinimizedPanelProps> = ({
  imageCount,
  isLoading = false,
  archiveName,
  onRestore
}) => {
  const { position, setPosition } = useImagePanelStore();
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);

  // 拖拽开始
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // 只处理左键
    e.preventDefault();

    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y
    };
    setIsDragging(true);
  }, [position]);

  // 拖拽移动
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;

      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      const newPosition: PanelPosition = {
        x: Math.max(0, Math.min(window.innerWidth - 150, dragStartRef.current.posX + deltaX)),
        y: Math.max(0, Math.min(window.innerHeight - 40, dragStartRef.current.posY + deltaY))
      };

      setPosition(newPosition);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, setPosition]);

  // 点击恢复（只在非拖拽时触发）
  const handleClick = useCallback(() => {
    if (!isDragging) {
      onRestore();
    }
  }, [isDragging, onRestore]);

  return (
    <div
      className="fixed flex items-center gap-2 px-3 py-2 bg-[rgba(13,23,36,0.95)] border border-border-accent rounded-md shadow-lg text-[13px] font-semibold text-text-primary transition-all duration-150 ease-out hover:bg-[rgba(13,23,36,0.98)] hover:border-[rgba(102,192,244,0.4)]"
      style={{
        left: position.x,
        top: position.y,
        cursor: isDragging ? "grabbing" : "pointer",
        zIndex: Z_INDEX.minimized
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      <ImageIcon size={16} />
      <span className={archiveName ? "max-w-[100px] overflow-hidden text-ellipsis whitespace-nowrap" : ""}>
        {archiveName || '图片池'}
      </span>
      <span className="text-xs text-text-muted font-normal">
        ({imageCount})
      </span>
      {isLoading && (
        <span className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-pulse" />
      )}
    </div>
  );
};

export default MinimizedPanel;
