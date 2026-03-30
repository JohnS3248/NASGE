import React, { useState, useRef, useEffect } from 'react';

interface EditableTitleProps {
  value: string;
  onChange: (newValue: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * 可编辑标题组件
 * 支持：
 * - 双击编辑
 * - Enter 保存
 * - Esc 取消
 * - 失焦保存
 */
const EditableTitle: React.FC<EditableTitleProps> = ({
  value,
  onChange,
  placeholder = '无标题',
  className = ''
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // 当进入编辑模式时，自动聚焦并选中文本
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // 保存更改
  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== value) {
      onChange(trimmed);
    }
    setIsEditing(false);
  };

  // 取消编辑
  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const displayValue = value || placeholder;

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`border border-accent bg-[rgba(13,23,36,0.9)] text-text-primary outline-none rounded-sm px-2 py-1 ${className}`}
        maxLength={128}
      />
    );
  }

  return (
    <div
      onDoubleClick={() => setIsEditing(true)}
      className={`cursor-text px-2 py-1 rounded-sm transition-colors duration-150 hover:bg-accent/10 ${className}`}
      title="双击编辑"
    >
      {displayValue}
    </div>
  );
};

export default EditableTitle;
