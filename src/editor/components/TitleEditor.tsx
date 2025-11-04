import React, { useState, useRef, useEffect } from 'react';
import { TitleStyle } from '../stores/useGuideStore';

interface TitleEditorProps {
  value: string;
  style: TitleStyle;
  onChange: (newValue: string) => void;
  onStyleChange: (newStyle: TitleStyle) => void;
}

/**
 * 标题编辑器组件
 * 支持：
 * - 短样式：单行输入框（40px 高度）
 * - 长样式：多行文本域（120px 高度），支持插入图片 BBCode
 */
const TitleEditor: React.FC<TitleEditorProps> = ({
  value,
  style,
  onChange,
  onStyleChange
}) => {
  const [localValue, setLocalValue] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // 同步外部值变化
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // 处理输入变化并实时更新
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    onChange(newValue);
  };

  // 切换样式
  const toggleStyle = () => {
    const newStyle = style === 'short' ? 'long' : 'short';
    onStyleChange(newStyle);
  };

  // 插入图片 BBCode（仅在长样式下可用）
  const handleInsertImage = () => {
    const previewId = window.prompt('输入图片 Preview ID：');
    if (!previewId) return;

    const filename = window.prompt('输入文件名（可选）：', 'image.png');
    const bbcode = `[previewicon=${previewId};sizeThumb,inline;${filename}][/previewicon]`;

    if (inputRef.current && 'selectionStart' in inputRef.current) {
      const textarea = inputRef.current as HTMLTextAreaElement;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = localValue.substring(0, start);
      const after = localValue.substring(end);
      const newValue = before + bbcode + after;

      setLocalValue(newValue);
      onChange(newValue);

      // 将光标移到插入内容之后
      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + bbcode.length;
      }, 0);
    }
  };

  const baseStyle: React.CSSProperties = {
    width: '100%',
    border: '1px solid rgba(102, 192, 244, 0.3)',
    background: 'rgba(13, 23, 36, 0.6)',
    color: '#d7e8ff',
    fontSize: '1.1rem',
    fontWeight: 600,
    padding: '0.5rem 0.75rem',
    borderRadius: '0.5rem',
    outline: 'none',
    fontFamily: 'inherit',
    resize: 'none',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease'
  };

  const focusStyle: React.CSSProperties = {
    borderColor: '#66c0f4',
    boxShadow: '0 0 0 2px rgba(102, 192, 244, 0.2)'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, maxWidth: '600px' }}>
      {/* 标题输入框 */}
      {style === 'short' ? (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={localValue}
          onChange={handleChange}
          placeholder="章节标题（最多 128 字符）"
          maxLength={128}
          style={{
            ...baseStyle,
            height: '40px'
          }}
          onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(102, 192, 244, 0.3)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
      ) : (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={localValue}
          onChange={handleChange}
          placeholder="章节标题（最多 128 字符，支持 BBCode）"
          maxLength={128}
          rows={4}
          style={{
            ...baseStyle,
            height: '120px',
            fontWeight: 400,
            lineHeight: 1.5
          }}
          onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(102, 192, 244, 0.3)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
      )}

      {/* 工具栏 */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {/* 样式切换按钮 */}
        <button
          type="button"
          onClick={toggleStyle}
          style={{
            padding: '0.4rem 0.8rem',
            border: 'none',
            borderRadius: '0.4rem',
            background: 'rgba(102, 192, 244, 0.15)',
            color: '#66c0f4',
            fontSize: '0.8rem',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(102, 192, 244, 0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(102, 192, 244, 0.15)';
          }}
          title={style === 'short' ? '切换到长样式' : '切换到短样式'}
        >
          {style === 'short' ? '⬇ 展开' : '⬆ 收起'}
        </button>

        {/* 插入图片按钮（仅在长样式下显示） */}
        {style === 'long' && (
          <button
            type="button"
            onClick={handleInsertImage}
            style={{
              padding: '0.4rem 0.8rem',
              border: 'none',
              borderRadius: '0.4rem',
              background: 'rgba(102, 192, 244, 0.15)',
              color: '#66c0f4',
              fontSize: '0.8rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(102, 192, 244, 0.25)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(102, 192, 244, 0.15)';
            }}
            title="插入图片 BBCode"
          >
            插入图片
          </button>
        )}

        {/* 字符计数 */}
        <span style={{ fontSize: '0.75rem', color: '#8aa4c7', marginLeft: 'auto' }}>
          {localValue.length} / 128
        </span>
      </div>
    </div>
  );
};

export default TitleEditor;
