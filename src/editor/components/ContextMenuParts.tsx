/**
 * 右键菜单通用子组件
 * 供 TipTapEditor 和 TitleEditor 共用
 */
import React from "react";

export type MenuItemProps = {
  label: string;
  onClick: () => void;
  onComplete: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
};

export const MenuItem: React.FC<MenuItemProps> = ({ label, onClick, onComplete, active, danger, disabled }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => {
      if (disabled) return;
      onClick();
      onComplete();
    }}
    className={`border-0 text-left px-3 py-2 rounded-md text-[0.85rem] ${
      active ? 'bg-accent-muted font-semibold text-text-primary' : 'bg-transparent font-medium text-text-primary'
    } ${danger ? '!text-[#ff8f8f]' : ''} ${disabled ? '!text-text-muted cursor-not-allowed' : 'cursor-pointer'}`}
    onMouseDown={(event) => {
      event.preventDefault();
    }}
  >
    {label}
  </button>
);

export const MenuSectionLabel: React.FC<{ label: string }> = ({ label }) => (
  <div className="px-3 pt-1 pb-0.5 text-[0.72rem] uppercase tracking-wider text-[rgba(173,205,244,0.7)]">
    {label}
  </div>
);

export const MenuDivider: React.FC = () => (
  <div className="h-px mx-2 my-1 bg-border-default" />
);
