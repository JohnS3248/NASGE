/**
 * 最小化状态的悬浮窗
 * 显示为小型浮动窗口，点击可恢复
 */
import React, { useState, useCallback, useRef, useEffect } from "react";
import { minimizedStyle, COLORS } from "./styles";
import { useImagePanelStore, PanelPosition } from "../../stores/useImagePanelStore";

interface MinimizedPanelProps {
  imageCount: number;
  onRestore: () => void;
}

const MinimizedPanel: React.FC<MinimizedPanelProps> = ({
  imageCount,
  onRestore
}) => {
  const { position, setPosition } = useImagePanelStore();
  const [isHovered, setIsHovered] = useState(false);
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
      style={{
        ...minimizedStyle,
        left: position.x,
        top: position.y,
        background: isHovered ? COLORS.panelBgHover : COLORS.panelBg,
        borderColor: isHovered ? COLORS.borderHover : COLORS.border,
        cursor: isDragging ? "grabbing" : "pointer"
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
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
  );
};

export default MinimizedPanel;
