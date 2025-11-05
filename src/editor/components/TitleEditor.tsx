import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { JSONContent } from '@tiptap/core';
import { createEditorExtensions } from '../utils/editorExtensions';
import { TitleStyle } from '../stores/useGuideStore';

interface TitleEditorProps {
  value: JSONContent;
  style: TitleStyle;
  onChange: (newValue: JSONContent) => void;
  onStyleChange: (newStyle: TitleStyle) => void;
}

/**
 * 标题编辑器组件 - 使用完整的 TipTap 编辑器
 *
 * 特性：
 * - 支持富文本编辑（图片、粗体等）
 * - 默认高度：2行文本（约 60px）
 * - 自动扩展：插入图片后根据图片高度自动调整
 * - 支持拖拽/粘贴图片
 */
const TitleEditor: React.FC<TitleEditorProps> = ({
  value,
  style,
  onChange,
  onStyleChange
}) => {
  // 创建 TipTap 编辑器实例
  const editor = useEditor({
    extensions: createEditorExtensions(),
    content: value,
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      onChange(json);
    },
    editorProps: {
      attributes: {
        class: 'title-editor-content',
        style: style === 'short'
          ? 'min-height: 60px; max-height: 60px; overflow-y: auto;'
          : 'min-height: 60px; max-height: none;'
      }
    }
  });

  // 同步外部值变化
  useEffect(() => {
    if (editor && value) {
      const currentContent = editor.getJSON();
      // 只在内容真正不同时才更新，避免光标跳动
      if (JSON.stringify(currentContent) !== JSON.stringify(value)) {
        editor.commands.setContent(value);
      }
    }
  }, [editor, value]);

  // 切换样式
  const toggleStyle = () => {
    const newStyle = style === 'short' ? 'long' : 'short';
    onStyleChange(newStyle);
  };

  if (!editor) {
    return null;
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      flex: 1,
      width: '100%'
    }}>
      {/* 标题编辑器 */}
      <div
        style={{
          width: '100%',
          border: editor.isFocused
            ? '1px solid #66c0f4'
            : '1px solid rgba(102, 192, 244, 0.3)',
          background: 'rgba(13, 23, 36, 0.6)',
          color: '#d7e8ff',
          fontSize: '1.1rem',
          fontWeight: 600,
          padding: '0.5rem 0.75rem',
          borderRadius: '0.5rem',
          outline: 'none',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          boxShadow: editor.isFocused
            ? '0 0 0 2px rgba(102, 192, 244, 0.2)'
            : 'none'
        }}
      >
        <EditorContent editor={editor} />
      </div>

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
          title={style === 'short' ? '允许多行和大图片' : '限制为2行高度'}
        >
          {style === 'short' ? '⬇ 允许扩展' : '⬆ 限制高度'}
        </button>

        {/* 提示文字 */}
        <span style={{ fontSize: '0.75rem', color: '#8aa4c7' }}>
          {style === 'short'
            ? '2行高度 • 可拖拽/粘贴图片'
            : '不限高度 • 可拖拽/粘贴图片'}
        </span>
      </div>

      {/* 全局样式 */}
      <style>{`
        .title-editor-content {
          outline: none;
          font-family: inherit;
          line-height: 1.5;
        }

        .title-editor-content p {
          margin: 0;
          padding: 0;
        }

        .title-editor-content p:not(:first-child) {
          margin-top: 0.5rem;
        }

        .title-editor-content .ProseMirror-focused {
          outline: none;
        }

        /* 标题栏中的图片样式 */
        .title-editor-content img {
          max-width: 100%;
          height: auto;
          border-radius: 4px;
          display: block;
          margin: 0.5rem 0;
        }

        /* 短样式下限制图片高度 */
        .title-editor-content[style*="max-height: 60px"] img {
          max-height: 40px;
          width: auto;
          display: inline-block;
          margin: 0 0.25rem;
          vertical-align: middle;
        }

        /* Steam Image 组件在标题栏中的样式 */
        .title-editor-content .steam-image-container {
          display: inline-block;
          position: relative;
          margin: 0.25rem;
        }

        /* 占位符样式 */
        .title-editor-content .ProseMirror p.is-editor-empty:first-child::before {
          content: '章节标题（支持拖拽/粘贴图片）';
          color: #8aa4c7;
          opacity: 0.5;
          pointer-events: none;
          position: absolute;
        }
      `}</style>
    </div>
  );
};

export default TitleEditor;
