import React, { useState, useRef, useEffect } from 'react';

interface EditableTitleProps {
  value: string;
  onChange: (newValue: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
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
  style = {}
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
        style={{
          ...style,
          border: '1px solid #66c0f4',
          background: 'rgba(13, 23, 36, 0.9)',
          color: '#d7e8ff',
          outline: 'none',
          borderRadius: '0.3rem',
          padding: '0.3rem 0.5rem'
        }}
        maxLength={128}
      />
    );
  }

  return (
    <div
      onDoubleClick={() => setIsEditing(true)}
      style={{
        ...style,
        cursor: 'text',
        padding: '0.3rem 0.5rem',
        borderRadius: '0.3rem',
        transition: 'background 0.15s ease'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(102, 192, 244, 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
      title="双击编辑"
    >
      {displayValue}
    </div>
  );
};

export default EditableTitle;
